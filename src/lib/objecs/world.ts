import { Archetype } from './archetype';

/**
 * Allowed component value types. Prevents functions, symbols, and other
 * non-serializable values from being used as component data.
 */
export type ComponentValue =
  | string
  | number
  | boolean
  | null
  | ComponentValue[]
  | { [key: string]: ComponentValue };

/**
 * Base constraint for entity types. All entity properties must be
 * JSON-compatible component values or undefined (for optional components).
 */
export type EntityBase = Record<string, ComponentValue | undefined>;

export type SafeEntity<
  Entity extends EntityBase,
  Components extends keyof Entity,
> = Entity & Required<Pick<Entity, Components>>;

/**
 * An iterable collection of entities optimized for fast iteration.
 * Provides Set-like methods but backed by an array for performance.
 */
export interface ReadonlyEntityCollection<T> extends Iterable<T> {
  readonly size: number;
  /**
   * Direct access to the backing array without copying.
   * The returned array must not be mutated.
   */
  readonly raw: ReadonlyArray<T>;
  /**
   * Check if an entity is in the collection.
   * Accepts any object to allow checking membership without type narrowing.
   */
  has(value: unknown): boolean;
}

/**
 * A collection backed by an array for fast iteration.
 * Uses a Map for O(1) has() lookups.
 *
 * NOTE: vendored from `objecs`. Private members use the TS `private` keyword
 * (with `_`-prefixed backing fields) rather than `#private` identifiers, which
 * typescript-to-lua does not support.
 */
export class EntityCollection<T> implements ReadonlyEntityCollection<T> {
  private readonly _entities: T[] = [];
  private readonly _indices = new Map<T, number>();

  get size(): number {
    return this._entities.length;
  }

  get raw(): ReadonlyArray<T> {
    return this._entities;
  }

  has(entity: unknown): boolean {
    return this._indices.has(entity as T);
  }

  /**
   * Add an entity. Returns true if added, false if already present.
   * @remarks Used internally by World and Archetype.
   */
  add(entity: T): boolean {
    if (this._indices.has(entity)) {
      return false;
    }
    this._indices.set(entity, this._entities.length);
    this._entities.push(entity);
    return true;
  }

  /**
   * Remove an entity using swap-and-pop for O(1) removal.
   * Returns true if removed, false if not present.
   * @remarks Used internally by World and Archetype.
   */
  remove(entity: T): boolean {
    const index = this._indices.get(entity);
    if (index === undefined) {
      return false;
    }

    this._indices.delete(entity);
    const lastIndex = this._entities.length - 1;

    if (index !== lastIndex) {
      // Swap with last element
      const lastEntity = this._entities[lastIndex];
      this._entities[index] = lastEntity;
      this._indices.set(lastEntity, index);
    }

    this._entities.pop();
    return true;
  }

  /**
   * Clear all entities.
   * @remarks Used internally by World and Archetype.
   */
  clear(): void {
    this._entities.length = 0;
    this._indices.clear();
  }

  // Generator-based iteration. tstl compiles `yield` to coroutines and does
  // not support calling `array[Symbol.iterator]()` at runtime, so we iterate
  // the backing array by index. Hot loops can use `.raw` to skip the coroutine.
  *[Symbol.iterator](): IterableIterator<T> {
    const entities = this._entities;
    const length = entities.length;
    for (let i = 0; i < length; i++) {
      yield entities[i];
    }
  }
}

/**
 * Shared empty result for the single-key fast path in
 * `World.getAffectedArchetypes` when a component is referenced by no archetype.
 * Avoids allocating an empty Set on that path.
 */
const NO_AFFECTED_ARCHETYPES: readonly never[] = [];

/**
 * Container for Entities
 */
export class World<Entity extends EntityBase> {
  private _archetypes = new Set<Archetype<Entity, Array<keyof Entity>>>();
  private _entities = new EntityCollection<Entity>();
  private _componentIndex = new Map<
    keyof Entity,
    Set<Archetype<Entity, Array<keyof Entity>>>
  >();

  public get archetypes(): Set<Archetype<Entity, Array<keyof Entity>>> {
    return this._archetypes;
  }

  /**
   * Register an archetype and index it by its components for fast lookup.
   * @remarks Used internally by Archetype constructor.
   */
  public registerArchetype(
    archetype: Archetype<Entity, Array<keyof Entity>>,
  ): void {
    this._archetypes.add(archetype);

    for (const component of archetype.components) {
      let set = this._componentIndex.get(component);
      if (set === undefined) {
        set = new Set();
        this._componentIndex.set(component, set);
      }
      set.add(archetype);
    }

    for (const component of archetype.excluding) {
      let set = this._componentIndex.get(component);
      if (set === undefined) {
        set = new Set();
        this._componentIndex.set(component, set);
      }
      set.add(archetype);
    }
  }

  public get entities(): ReadonlyEntityCollection<Entity> {
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
    const entities = new EntityCollection<Entity>();

    for (const entity of this._entities) {
      // perf: manual loop avoids .every() callback overhead
      let matchesArchetype = true;
      for (const component of components) {
        if (entity[component as string] === undefined) {
          matchesArchetype = false;
          break;
        }
      }

      if (matchesArchetype) {
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

    return this._entities.remove(entity);
  }

  /**
   * Add a single component to an entity.
   */
  public addEntityComponents<T extends Entity, Component extends keyof Entity>(
    entity: T,
    component: Component,
    value: NonNullable<Entity[Component]>,
  ): T & Record<typeof component, typeof value>;
  /**
   * Add multiple components to an entity in a single operation.
   * More efficient than multiple single-component calls as it only
   * updates archetype membership once.
   */
  public addEntityComponents<
    T extends Entity,
    Components extends { [K in keyof Entity]?: NonNullable<Entity[K]> },
  >(
    entity: T,
    components: Components,
  ): T & { [K in keyof Components]: NonNullable<Components[K]> };
  public addEntityComponents<T extends Entity>(
    entity: T,
    componentOrComponents: keyof Entity | Record<string, unknown>,
    value?: unknown,
  ): T {
    if (!this._entities.has(entity)) {
      throw new Error(`Entity does not exist`);
    }

    // Single component: addEntityComponents(entity, "key", value). The common,
    // hot path — process the one component's archetype set directly, with no
    // changedKeys array and no union Set to allocate.
    if (typeof componentOrComponents === 'string' && value !== undefined) {
      (entity as EntityBase)[componentOrComponents] = value as ComponentValue;

      const affected = this._componentIndex.get(componentOrComponents);

      if (affected !== undefined) {
        this.updateArchetypeMembership(entity, affected);
      }

      return entity;
    }

    // Multiple components: addEntityComponents(entity, { key: value, ... })
    const components = componentOrComponents as Record<string, unknown>;
    const changedKeys: Array<keyof Entity> = [];

    for (const key in components) {
      (entity as EntityBase)[key] = components[key] as ComponentValue;
      changedKeys.push(key);
    }

    this.updateArchetypeMembership(
      entity,
      this.getAffectedArchetypes(changedKeys),
    );

    return entity;
  }

  /**
   * For each affected archetype, add or remove the entity based on whether it
   * now matches. Shared by add/removeEntityComponents.
   */
  private updateArchetypeMembership(
    entity: Entity,
    affectedArchetypes: Iterable<Archetype<Entity, Array<keyof Entity>>>,
  ): void {
    for (const archetype of affectedArchetypes) {
      if (archetype.matches(entity)) {
        archetype.addEntity(entity);
      } else {
        archetype.removeEntity(entity);
      }
    }
  }

  private getAffectedArchetypes(
    keys: Array<keyof Entity>,
  ): Iterable<Archetype<Entity, Array<keyof Entity>>> {
    // Fast path: a single changed component is the common case (e.g.
    // addEntityComponents(entity, "x", value)). The union is then just that
    // component's archetype set, so reuse it directly instead of allocating a
    // new Set. The caller only iterates the result, never mutates it.
    if (keys.length === 1) {
      return this._componentIndex.get(keys[0]) ?? NO_AFFECTED_ARCHETYPES;
    }

    const result = new Set<Archetype<Entity, Array<keyof Entity>>>();
    for (const key of keys) {
      const archetypes = this._componentIndex.get(key);
      if (archetypes !== undefined) {
        for (const archetype of archetypes) {
          result.add(archetype);
        }
      }
    }

    return result;
  }

  public removeEntityComponents(
    entity: Entity,
    ...components: Array<keyof Entity>
  ): void {
    if (this._entities.has(entity)) {
      for (const component of components) {
        // Assign `undefined` rather than `delete`: component presence is
        // defined as `entity[c] !== undefined` (see Archetype.matches), so
        // this is equivalent for queries while keeping the entity's hidden
        // class stable.
        (entity as EntityBase)[component as string] = undefined;
      }

      // Only check archetypes that reference the removed components
      this.updateArchetypeMembership(
        entity,
        this.getAffectedArchetypes(components),
      );
    }
  }
}
