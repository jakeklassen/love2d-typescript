import type { JsonObject } from 'type-fest';
import type { SafeEntity, World } from './world';

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
