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
  ship?: { thrusting: boolean };
  planet?: { radius: number; dark: Color; base: Color; light: Color };
  star?: { color: Color; size: number };
  /** A gently advancing phase used for soft, non-distracting pulsing. */
  pulse?: { time: number; speed: number; amplitude: number };
  /** A short-lived exhaust pixel. `kind` selects its color ramp. */
  particle?: { age: number; maxAge: number; kind: string; size: number };
};
