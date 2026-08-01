import { rndFromList, rndInt, rndRange, TAU } from '../lib/math';
import { World } from '../lib/objecs/world';
import {
  PLANET_COUNT,
  STAR_COUNT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './constants';
import { Entity } from './entity';
import { Pico8, PLANET_PALETTES, PlanetPalette } from './palette';

export function createShip(world: World<Entity>, x: number, y: number) {
  return world.createEntity({
    transform: { position: { x, y }, rotation: 0 },
    previous: { position: { x, y }, rotation: 0 },
    velocity: { x: 0, y: 0 },
    ship: { thrusting: false },
  });
}

export function createPlanet(
  world: World<Entity>,
  x: number,
  y: number,
  radius: number,
  palette: PlanetPalette,
) {
  world.createEntity({
    transform: { position: { x, y }, rotation: 0 },
    planet: {
      radius,
      dark: palette.dark,
      base: palette.base,
      light: palette.light,
    },
    pulse: { time: rndRange(0, TAU), speed: rndRange(0.5, 1.0), amplitude: 1 },
  });
}

export function createStar(world: World<Entity>, x: number, y: number) {
  const roll = love.math.random();
  const color =
    roll > 0.92 ? Pico8.white : roll > 0.68 ? Pico8.lightGray : Pico8.lavender;
  const size = roll > 0.965 ? 2 : 1;

  world.createEntity({
    transform: { position: { x, y }, rotation: 0 },
    star: { color, size },
    pulse: {
      time: rndRange(0, TAU),
      speed: rndRange(0.3, 0.9),
      amplitude: rndRange(0.25, 0.6),
    },
  });
}

export function createParticle(
  world: World<Entity>,
  x: number,
  y: number,
  vx: number,
  vy: number,
  maxAge: number,
  kind: string,
  size: number,
) {
  world.createEntity({
    transform: { position: { x, y }, rotation: 0 },
    velocity: { x: vx, y: vy },
    particle: { age: 0, maxAge, kind, size },
  });
}

/** Scatter stars everywhere; ring the planets around the spawn point so
 * there's always a landmark within a short flight in any direction. */
export function populateWorld(world: World<Entity>) {
  for (let i = 0; i < STAR_COUNT; i++) {
    createStar(world, rndRange(0, WORLD_WIDTH), rndRange(0, WORLD_HEIGHT));
  }

  const centerX = WORLD_WIDTH / 2;
  const centerY = WORLD_HEIGHT / 2;

  for (let i = 0; i < PLANET_COUNT; i++) {
    // Spread the planets around a ring, jittered, at increasing distance so
    // the nearest peeks into view at spawn and the rest are a short flight out.
    const angle = (i / PLANET_COUNT) * TAU + rndRange(-0.35, 0.35);
    const distance = rndRange(72, 108) + i * rndRange(55, 90);

    createPlanet(
      world,
      centerX + Math.cos(angle) * distance,
      centerY + Math.sin(angle) * distance,
      rndInt(10, 26),
      rndFromList(PLANET_PALETTES),
    );
  }
}
