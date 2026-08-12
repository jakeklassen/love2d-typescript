import { Color } from './palette';

export type Vec2 = { x: number; y: number };
export type Transform = { position: Vec2; rotation: number };

/**
 * The full component set. Every field is optional — an entity "has" a
 * component when the field is present. Systems query for the combinations
 * they care about via `world.archetype(...)`.
 */
export type Entity = {
  transform?: Transform;
  /** Snapshot of the transform at the previous fixed step, for interpolation. */
  previous?: Transform;
  velocity?: Vec2;
  ship?: {
    thrusting: boolean;
    boosting: boolean; // boost held and fuel remaining this frame
    fuel: number; // boost fuel, 0..BOOST_FUEL_MAX
  };
  planet?: { radius: number; dark: Color; base: Color; light: Color };
  /** `depth` is the parallax factor: 1 scrolls with the world, lower is farther. */
  star?: { color: Color; size: number; depth: number };
  /** A gently advancing phase used for soft, non-distracting pulsing. */
  pulse?: { time: number; speed: number; amplitude: number };
  /** A short-lived exhaust pixel. `kind` selects its color ramp. */
  particle?: { age: number; maxAge: number; kind: string; size: number };
  /** A player shot: flies along `transform.rotation`, expires after `maxAge`. */
  bullet?: { age: number; maxAge: number };
  /** Makes a bullet steer toward `target` at up to `turnRate` deg/s. */
  homing?: { turnRate: number; target: Entity };
  /** A patrolling/pursuing foe. */
  enemy?: {
    health: number;
    hitFlash: number;
    respawnTimer: number;
    state: 'patrol' | 'engage';
    waypoint: Vec2;
    repathTimer: number;
  };
};
