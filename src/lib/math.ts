export const lerp = (from: number, to: number, alpha: number): number =>
  from + (to - from) * alpha;

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

export const TAU = Math.PI * 2;

/** Wrap a value into the half-open range [0, range). */
export const wrap = (value: number, range: number): number => {
  const r = value % range;
  return r < 0 ? r + range : r;
};

/** Random float in [min, max). Uses LÖVE's RNG for quality. */
export const rndRange = (min: number, max: number): number =>
  min + love.math.random() * (max - min);

/** Random integer in [min, max]. */
export const rndInt = (min: number, max: number): number =>
  math.floor(rndRange(min, max + 1));

/** Pick a random element from a non-empty list. */
export const rndFromList = <T>(list: readonly T[]): T =>
  list[math.floor(love.math.random() * list.length)];
