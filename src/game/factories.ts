import { rndFromList, rndInt, rndRange, TAU } from '../lib/math';
import { World } from '../lib/objecs/world';
import {
  BOOST_FUEL_MAX,
  BULLET_LIFETIME,
  ENEMY_HEALTH,
  ENEMY_PATROL_RADIUS,
  ENEMY_REPATH_TIME,
  HOMING_LIFETIME,
  HOMING_TURN_RATE,
  PLANET_COUNT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './constants';
import { Entity } from './entity';
import { Color, Pico8, PLANET_PALETTES, PlanetPalette } from './palette';

export function createShip(world: World<Entity>, x: number, y: number) {
  return world.createEntity({
    transform: { position: { x, y }, rotation: 0 },
    previous: { position: { x, y }, rotation: 0 },
    velocity: { x: 0, y: 0 },
    ship: { thrusting: false, boosting: false, fuel: BOOST_FUEL_MAX },
  });
}

export function createBullet(
  world: World<Entity>,
  x: number,
  y: number,
  rotation: number,
  vx: number,
  vy: number,
) {
  return world.createEntity({
    transform: { position: { x, y }, rotation },
    previous: { position: { x, y }, rotation },
    velocity: { x: vx, y: vy },
    bullet: { age: 0, maxAge: BULLET_LIFETIME },
  });
}

export function createHomingBullet(
  world: World<Entity>,
  x: number,
  y: number,
  rotation: number,
  vx: number,
  vy: number,
  target: Entity,
) {
  return world.createEntity({
    transform: { position: { x, y }, rotation },
    previous: { position: { x, y }, rotation },
    velocity: { x: vx, y: vy },
    bullet: { age: 0, maxAge: HOMING_LIFETIME },
    homing: { turnRate: HOMING_TURN_RATE, target },
  });
}

export function createEnemy(world: World<Entity>, x: number, y: number) {
  return world.createEntity({
    transform: { position: { x, y }, rotation: rndRange(0, 360) },
    previous: { position: { x, y }, rotation: 0 },
    velocity: { x: 0, y: 0 },
    enemy: {
      health: ENEMY_HEALTH,
      hitFlash: 0,
      respawnTimer: 0,
      state: 'patrol',
      waypoint: {
        x: x + rndRange(-ENEMY_PATROL_RADIUS, ENEMY_PATROL_RADIUS),
        y: y + rndRange(-ENEMY_PATROL_RADIUS, ENEMY_PATROL_RADIUS),
      },
      repathTimer: rndRange(1, ENEMY_REPATH_TIME),
    },
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

export function createStar(
  world: World<Entity>,
  x: number,
  y: number,
  depth: number,
  color: Color,
  size: number,
) {
  world.createEntity({
    transform: { position: { x, y }, rotation: 0 },
    star: { color, size, depth },
    pulse: {
      time: rndRange(0, TAU),
      // Visible-but-subtle twinkle (~2-5s per cycle).
      speed: rndRange(1.2, 3.0),
      amplitude: rndRange(0.35, 0.65),
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

// Parallax star layers, far → near. Distant layers scroll slower (lower depth),
// are dimmer, and denser; near layers move almost with the world and are bright.
const STAR_LAYERS: Array<{
  count: number;
  depth: number;
  colors: Color[];
  bigChance: number;
}> = [
  { count: 116, depth: 0.3, colors: [Pico8.darkGray, Pico8.lavender], bigChance: 0 },
  { count: 80, depth: 0.55, colors: [Pico8.lavender, Pico8.lightGray], bigChance: 0 },
  { count: 54, depth: 0.85, colors: [Pico8.lightGray, Pico8.white], bigChance: 0.2 },
];

/** Scatter parallax star layers; ring the planets around the spawn point so
 * there's always a landmark within a short flight in any direction. */
export function populateWorld(world: World<Entity>) {
  for (const layer of STAR_LAYERS) {
    for (let i = 0; i < layer.count; i++) {
      createStar(
        world,
        rndRange(0, WORLD_WIDTH),
        rndRange(0, WORLD_HEIGHT),
        layer.depth,
        rndFromList(layer.colors),
        love.math.random() < layer.bigChance ? 2 : 1,
      );
    }
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
