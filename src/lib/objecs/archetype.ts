import {
  type EntityBase,
  EntityCollection,
  type ReadonlyEntityCollection,
  type SafeEntity,
  World,
} from './world';

/**
 * An archetype is a collection of entities that share the same components.
 * Archetypes should not be constructed directly, but rather through the
 * `World` class using the `archetype` method.
 *
 * NOTE: vendored from `objecs`. Private members use the TS `private` keyword
 * (with `_`-prefixed backing fields) rather than `#private` identifiers, which
 * typescript-to-lua does not support.
 */
export class Archetype<
  Entity extends EntityBase,
  Components extends Array<keyof Entity>,
> {
  private _entities: EntityCollection<SafeEntity<Entity, Components[number]>>;
  private _components: Components;
  private _excluding?: Array<Exclude<keyof Entity, Components[number]>>;
  private _world: World<Entity>;

  constructor({
    entities,
    world,
    components,
    without,
  }: {
    world: World<Entity>;
    entities: EntityCollection<Entity>;
    components: Components;
    without?: Array<Exclude<keyof Entity, Components[number]>>;
  }) {
    this._world = world;
    this._entities = entities as EntityCollection<
      SafeEntity<Entity, Components[number]>
    >;
    this._components = components;
    this._excluding = without;

    world.registerArchetype(
      this as unknown as Archetype<Entity, Array<keyof Entity>>,
    );
  }

  public get entities(): ReadonlyEntityCollection<
    SafeEntity<Entity, Components[number]>
  > {
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
    // perf: fused manual loop is 18-35% faster than .every() + .some()
    for (const component of this._components) {
      if (entity[component as string] === undefined) return false;
    }

    if (this._excluding !== undefined) {
      for (const component of this._excluding) {
        if (entity[component as string] !== undefined) return false;
      }
    }

    return true;
  }

  public addEntity(entity: Entity): this {
    if (this._entities.has(entity)) {
      return this;
    }

    if (this.matches(entity)) {
      this._entities.add(entity as SafeEntity<Entity, Components[number]>);
    }

    return this;
  }

  public removeEntity(entity: Entity): this {
    this._entities.remove(entity as SafeEntity<Entity, Components[number]>);

    return this;
  }

  clearEntities() {
    this._entities.clear();
  }
}
