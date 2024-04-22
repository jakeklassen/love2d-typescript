import { JsonObject } from 'type-fest';

export type SafeEntity<
  Entity extends JsonObject,
  Components extends keyof Entity,
> = Entity & Required<Pick<Entity, Components>>;

/**
 * An archetype is a collection of entities that share the same components.
 * Archetypes should not be constructed directly, but rather through the
 * `World` class using the `archetype` method.
 */
export class Archetype<
  Entity extends JsonObject,
  Components extends Array<keyof Entity>,
> {
  _entities: Set<SafeEntity<Entity, Components[number]>> = new Set();
  _components: Components;
  _excluding?: Array<Exclude<keyof Entity, Components[number]>>;
  _world: World<Entity>;

  constructor({
    entities,
    world,
    components,
    without,
  }: {
    world: World<Entity>;
    entities: Set<Entity>;
    components: Components;
    without?: Array<Exclude<keyof Entity, Components[number]>>;
  }) {
    this._world = world;
    this._entities = entities as Set<SafeEntity<Entity, Components[number]>>;
    this._components = components;
    this._excluding = without;

    world.archetypes.add(this as any);
  }

  public get entities(): ReadonlySet<SafeEntity<Entity, Components[number]>> {
    return this._entities;
  }

  public get components(): Readonly<Components> {
    return this._components;
  }

  public get excluding(): Readonly<
    Array<Exclude<keyof Entity, Components[number]>>
  > {
    return this._excluding ?? [];
  }

  public matches(entity: Entity): boolean {
    const matchesArchetype = this._components.every((component) => {
      return component in entity;
    });

    const matchesExcluding =
      this._excluding?.some((component) => {
        return component in entity;
      }) ?? false;

    return matchesArchetype && !matchesExcluding;
  }

  public addEntity(entity: Entity): Archetype<Entity, Components> {
    if (this._entities.has(entity as any)) {
      return this;
    }

    if (this.matches(entity)) {
      this._entities.add(entity as any);
    }

    return this;
  }

  public removeEntity(entity: Entity): Archetype<Entity, Components> {
    this._entities.delete(entity as any);

    return this;
  }

  clearEntities() {
    this._entities.clear();
  }

  /**
   * Returns a new archetype based on the current archetype, but excludes the
   * specified components.
   * @param components Components that should **not** be present on the entity
   * @returns
   */
  without<Component extends keyof Entity>(
    ...components: Component[]
  ): Archetype<
    SafeEntity<
      Omit<Entity, (typeof components)[number]>,
      Exclude<Components[number], (typeof components)[number]>
    >,
    Array<Exclude<Components[number], (typeof components)[number]>>
  > {
    const entities = new Set<
      SafeEntity<
        Omit<Entity, (typeof components)[number]>,
        Exclude<Components[number], (typeof components)[number]>
      >
    >();

    for (const entity of this._entities) {
      const matchesWithout = components.every((component) => {
        return component in entity;
      });

      if (matchesWithout) {
        continue;
      }

      entities.add(entity as any);
    }

    const archetype = new Archetype<
      SafeEntity<
        Omit<Entity, (typeof components)[number]>,
        Exclude<Components[number], (typeof components)[number]>
      >,
      Array<Exclude<Components[number], (typeof components)[number]>>
    >({
      entities,
      world: this._world as any,
      components: this._components as any,
      without: components as any,
    });

    return archetype;
  }
}

/**
 * Container for Entities
 */
export class World<Entity extends JsonObject> {
  _archetypes = new Set<Archetype<Entity, Array<keyof Entity>>>();
  _entities = new Set<Entity>();

  public get archetypes(): Set<Archetype<Entity, Array<keyof Entity>>> {
    return this._archetypes;
  }

  public get entities(): ReadonlySet<Entity> {
    return this._entities;
  }

  public clearEntities() {
    this._entities.clear();

    for (const archetype of this._archetypes) {
      archetype.clearEntities();
    }
  }

  public archetype<Components extends Array<keyof Entity>>(
    ...components: Components
  ): Archetype<
    SafeEntity<Entity, (typeof components)[number]>,
    typeof components
  > {
    const entities = new Set<Entity>();

    for (const entity of this._entities) {
      const matchesArchetype = components.every((component) => {
        return component in entity;
      });

      if (matchesArchetype === true) {
        entities.add(entity);
      }
    }

    const archetype = new Archetype({
      entities,
      world: this,
      components,
    });

    return archetype as Archetype<
      SafeEntity<Entity, (typeof components)[number]>,
      typeof components
    >;
  }

  public createEntity(): Entity;
  /**
   * Create an entity with the given components. This is a type-safe version
   * __but__ it is of a point in time. When the entity is created. So don't
   * rely on it to be type-safe in the future when used within systems.
   */
  public createEntity<T extends Entity>(
    entity: T,
  ): keyof typeof entity extends never
    ? never
    : Pick<Entity & T, keyof typeof entity>;
  public createEntity<T extends Entity>(entity?: T) {
    const _entity = entity ?? ({} as T);

    this._entities.add(_entity);

    for (const archetype of this._archetypes) {
      archetype.addEntity(_entity);
    }

    return _entity as SafeEntity<Entity, keyof typeof entity>;
  }

  public deleteEntity(entity: Entity): boolean {
    for (const archetype of this._archetypes) {
      archetype.removeEntity(entity);
    }

    return this._entities.delete(entity);
  }

  public addEntityComponents<T extends Entity, Component extends keyof Entity>(
    entity: T,
    component: Component,
    value: NonNullable<Entity[Component]>,
  ): T & Record<typeof component, typeof value> {
    const existingEntity = this._entities.has(entity);

    if (existingEntity === false) {
      throw new Error(`Entity ${entity} does not exist`);
    }

    // This will update the key and value in the map
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    entity[component] = value;

    for (const archetype of this._archetypes) {
      if (archetype.matches(entity)) {
        archetype.addEntity(entity);
      } else {
        archetype.removeEntity(entity);
      }
    }

    return entity as T & Record<typeof component, typeof value>;
  }

  public removeEntityComponents<
    T extends Entity,
    Component extends keyof Entity,
  >(entity: T, ...components: Array<Component>): void {
    if (this._entities.has(entity)) {
      for (const component of components) {
        delete entity[component];
      }

      for (const archetype of this._archetypes) {
        if (archetype.matches(entity)) {
          archetype.addEntity(entity);
        } else {
          archetype.removeEntity(entity);
        }
      }
    }
  }
}
