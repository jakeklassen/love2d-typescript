import { Canvas, Image, Quad } from 'love.graphics';
import { lerp, rndRange } from '../lib/math';
import {
  ReadonlyEntityCollection,
  SafeEntity,
  World,
} from '../lib/objecs/world';
import { createParticle } from './factories';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  LIGHT_DIR_X,
  LIGHT_DIR_Y,
  SCALE,
  SHIP_BRAKE,
  SHIP_DRAG,
  SHIP_MAX_SPEED,
  SHIP_ROTATION_SPEED,
  SHIP_THRUST,
} from './constants';
import { Entity } from './entity';
import { Pico8, SPACE_COLOR } from './palette';

type ShipEntity = SafeEntity<
  Entity,
  'transform' | 'previous' | 'velocity' | 'ship'
>;
type PlanetEntity = SafeEntity<Entity, 'transform' | 'planet' | 'pulse'>;
type StarEntity = SafeEntity<Entity, 'transform' | 'star' | 'pulse'>;
type PulseEntity = SafeEntity<Entity, 'pulse'>;
type ParticleEntity = SafeEntity<Entity, 'transform' | 'velocity' | 'particle'>;

// Live archetype queries, created once from the world and reused every frame.
let world!: World<Entity>;
let ships!: ReadonlyEntityCollection<ShipEntity>;
let planets!: ReadonlyEntityCollection<PlanetEntity>;
let stars!: ReadonlyEntityCollection<StarEntity>;
let pulses!: ReadonlyEntityCollection<PulseEntity>;
let particles!: ReadonlyEntityCollection<ParticleEntity>;

export function initQueries(w: World<Entity>) {
  world = w;
  ships = w.archetype('transform', 'previous', 'velocity', 'ship').entities;
  planets = w.archetype('transform', 'planet', 'pulse').entities;
  stars = w.archetype('transform', 'star', 'pulse').entities;
  pulses = w.archetype('pulse').entities;
  particles = w.archetype('transform', 'velocity', 'particle').entities;
}

// Ship sprite, supplied by the game on load.
let shipImage!: Image;
let shipQuad!: Quad;
let shipHalfW = 4;
let shipHalfH = 4;

export function setShipSprite(
  image: Image,
  quad: Quad,
  width: number,
  height: number,
) {
  shipImage = image;
  shipQuad = quad;
  shipHalfW = width / 2;
  shipHalfH = height / 2;
}

const DEG_TO_RAD = Math.PI / 180;

/** Advance the ship one fixed step: input, thrust, drag, clamp, integrate. */
export function shipSystem(dt: number) {
  const rotateLeft =
    love.keyboard.isDown('left') || love.keyboard.isDown('a');
  const rotateRight =
    love.keyboard.isDown('right') || love.keyboard.isDown('d');
  const thrust = love.keyboard.isDown('up') || love.keyboard.isDown('w');
  const brake = love.keyboard.isDown('down') || love.keyboard.isDown('s');

  for (const ship of ships.raw) {
    // Snapshot the current transform so the renderer can interpolate.
    ship.previous.position.x = ship.transform.position.x;
    ship.previous.position.y = ship.transform.position.y;
    ship.previous.rotation = ship.transform.rotation;

    if (rotateLeft) {
      ship.transform.rotation -= SHIP_ROTATION_SPEED * dt;
    }
    if (rotateRight) {
      ship.transform.rotation += SHIP_ROTATION_SPEED * dt;
    }

    // Heading: rotation 0 points straight up.
    const rad = ship.transform.rotation * DEG_TO_RAD;
    const headingX = Math.sin(rad);
    const headingY = -Math.cos(rad);

    ship.ship.thrusting = false;
    if (thrust) {
      ship.velocity.x += headingX * SHIP_THRUST * dt;
      ship.velocity.y += headingY * SHIP_THRUST * dt;
      ship.ship.thrusting = true;
      emitThrust(ship, headingX, headingY);
    }
    if (brake) {
      ship.velocity.x -= headingX * SHIP_THRUST * SHIP_BRAKE * dt;
      ship.velocity.y -= headingY * SHIP_THRUST * SHIP_BRAKE * dt;
    }

    // Exponential drag — this is what makes the handling feel tight, not floaty.
    const damping = Math.max(0, 1 - SHIP_DRAG * dt);
    ship.velocity.x *= damping;
    ship.velocity.y *= damping;

    // Clamp to top speed.
    const speedSq =
      ship.velocity.x * ship.velocity.x + ship.velocity.y * ship.velocity.y;
    if (speedSq > SHIP_MAX_SPEED * SHIP_MAX_SPEED) {
      const scale = SHIP_MAX_SPEED / Math.sqrt(speedSq);
      ship.velocity.x *= scale;
      ship.velocity.y *= scale;
    }

    ship.transform.position.x += ship.velocity.x * dt;
    ship.transform.position.y += ship.velocity.y * dt;
  }
}

/** Spawn exhaust pixels from the ship's rear, streaming backward into world
 * space so they trail behind as the ship flies on. Kept sparse and short-lived
 * so it reads as a tight trail, not a cloud. */
function emitThrust(ship: ShipEntity, headingX: number, headingY: number) {
  const pos = ship.transform.position;
  // Engine nozzle, just behind the hull.
  const nozzleX = pos.x - headingX * (shipHalfH + 1);
  const nozzleY = pos.y - headingY * (shipHalfH + 1);
  // Perpendicular to the heading, for lateral spread.
  const perpX = -headingY;
  const perpY = headingX;

  const count = love.math.random() < 0.5 ? 4 : 3;
  for (let i = 0; i < count; i++) {
    const back = rndRange(12, 30);
    // Emit across a wide band at the nozzle (fat base), then pull each spark
    // back toward the center axis — stronger the further off-center it starts —
    // so the plume converges to a point as it trails away: a cone.
    const band = rndRange(-2.5, 2.5);
    const converge = -band * rndRange(5, 9) + rndRange(-3, 3);
    // Short life so the plume stays close to the ship instead of streaking out.
    let life = rndRange(0.08, 0.17);
    if (love.math.random() < 0.5) {
      life *= 0.6;
    }
    createParticle(
      world,
      nozzleX + perpX * band,
      nozzleY + perpY * band,
      -headingX * back + perpX * converge + ship.velocity.x * 0.25,
      -headingY * back + perpY * converge + ship.velocity.y * 0.25,
      life,
      'flame',
      1,
    );
  }

  // Occasional slower smoke pixel that falls off behind.
  if (love.math.random() < 0.2) {
    const back = rndRange(6, 15);
    const band = rndRange(-2, 2);
    const converge = -band * rndRange(3, 6) + rndRange(-2, 2);
    createParticle(
      world,
      nozzleX + perpX * band,
      nozzleY + perpY * band,
      -headingX * back + perpX * converge + ship.velocity.x * 0.12,
      -headingY * back + perpY * converge + ship.velocity.y * 0.12,
      rndRange(0.22, 0.4),
      'smoke',
      1,
    );
  }
}

/** Advance particles, apply light drag, and reap the expired ones. */
export function particleSystem(dt: number) {
  const dead: ParticleEntity[] = [];
  const drag = Math.max(0, 1 - 3 * dt);

  for (const p of particles.raw) {
    p.particle.age += dt;
    if (p.particle.age >= p.particle.maxAge) {
      dead.push(p);
      continue;
    }
    p.transform.position.x += p.velocity.x * dt;
    p.transform.position.y += p.velocity.y * dt;
    p.velocity.x *= drag;
    p.velocity.y *= drag;
  }

  for (const p of dead) {
    world.deleteEntity(p);
  }
}

/** Advance every pulse phase. Cosmetic, so it runs on the real frame delta. */
export function pulseSystem(dt: number) {
  for (const entity of pulses.raw) {
    entity.pulse.time += entity.pulse.speed * dt;
  }
}

/** The current ship (for HUD readouts). */
export function getShip(): ShipEntity {
  return ships.raw[0];
}

// Life-fraction (1 = fresh, 0 = dead) → palette color. Stepped, not blended,
// to keep the fade "pixely".
function flameColor(t: number) {
  if (t > 0.75) return Pico8.yellow;
  if (t > 0.5) return Pico8.orange;
  if (t > 0.25) return Pico8.red;
  return Pico8.darkPurple;
}

function smokeColor(t: number) {
  if (t > 0.6) return Pico8.lightGray;
  if (t > 0.3) return Pico8.darkGray;
  return Pico8.darkBlue;
}

function drawParticles(
  viewLeft: number,
  viewTop: number,
  viewRight: number,
  viewBottom: number,
) {
  for (const p of particles.raw) {
    const pos = p.transform.position;
    if (
      pos.x < viewLeft - 2 ||
      pos.x > viewRight + 2 ||
      pos.y < viewTop - 2 ||
      pos.y > viewBottom + 2
    ) {
      continue;
    }

    const t = 1 - p.particle.age / p.particle.maxAge;
    const c = p.particle.kind === 'smoke' ? smokeColor(t) : flameColor(t);
    love.graphics.setColor(c[0], c[1], c[2], 1);
    love.graphics.rectangle(
      'fill',
      Math.floor(pos.x),
      Math.floor(pos.y),
      p.particle.size,
      p.particle.size,
    );
  }
}

function drawStars(
  viewLeft: number,
  viewTop: number,
  viewRight: number,
  viewBottom: number,
) {
  for (const star of stars.raw) {
    const p = star.transform.position;
    if (
      p.x < viewLeft - 2 ||
      p.x > viewRight + 2 ||
      p.y < viewTop - 2 ||
      p.y > viewBottom + 2
    ) {
      continue;
    }

    const s = star.star;
    // Soft twinkle: brightness eases within [1 - amplitude, 1].
    const brightness =
      1 - star.pulse.amplitude * (0.5 + 0.5 * Math.sin(star.pulse.time));

    love.graphics.setColor(
      s.color[0] * brightness,
      s.color[1] * brightness,
      s.color[2] * brightness,
      1,
    );
    love.graphics.rectangle(
      'fill',
      Math.floor(p.x),
      Math.floor(p.y),
      s.size,
      s.size,
    );
  }
}

function drawPlanets(
  viewLeft: number,
  viewTop: number,
  viewRight: number,
  viewBottom: number,
) {
  for (const planet of planets.raw) {
    const p = planet.transform.position;
    const pl = planet.planet;
    const r = pl.radius;
    if (
      p.x < viewLeft - r - 4 ||
      p.x > viewRight + r + 4 ||
      p.y < viewTop - r - 4 ||
      p.y > viewBottom + r + 4
    ) {
      continue;
    }

    const cx = Math.floor(p.x);
    const cy = Math.floor(p.y);
    const pulse = 0.5 + 0.5 * Math.sin(planet.pulse.time); // 0..1

    // Soft atmosphere glow — a faint, gently pulsing halo (non-distracting).
    love.graphics.setColor(pl.light[0], pl.light[1], pl.light[2], 0.05 + 0.05 * pulse);
    love.graphics.circle('fill', cx, cy, r + 2 + pulse);

    // Dark side (full disk).
    love.graphics.setColor(pl.dark[0], pl.dark[1], pl.dark[2], 1);
    love.graphics.circle('fill', cx, cy, r);

    // Lit hemisphere, offset toward the light, leaving a shadow crescent.
    love.graphics.setColor(pl.base[0], pl.base[1], pl.base[2], 1);
    love.graphics.circle(
      'fill',
      cx + LIGHT_DIR_X * r * 0.18,
      cy + LIGHT_DIR_Y * r * 0.18,
      r * 0.92,
    );

    // Highlight.
    love.graphics.setColor(pl.light[0], pl.light[1], pl.light[2], 1);
    love.graphics.circle(
      'fill',
      cx + LIGHT_DIR_X * r * 0.4,
      cy + LIGHT_DIR_Y * r * 0.4,
      r * 0.5,
    );

    // Specular dot near the lit edge.
    love.graphics.setColor(1, 1, 1, 0.9);
    love.graphics.circle(
      'fill',
      cx + LIGHT_DIR_X * r * 0.55,
      cy + LIGHT_DIR_Y * r * 0.55,
      Math.max(1, r * 0.14),
    );
  }
}

/**
 * Draw the ship on top of the blitted world, at the exact view center and
 * upscaled, so it stays perfectly pinned and crisp regardless of the world's
 * sub-pixel scroll. `screenX/screenY` are in physical screen pixels.
 */
function drawShip(
  ship: ShipEntity,
  screenX: number,
  screenY: number,
  rotationDeg: number,
) {
  love.graphics.push();
  love.graphics.translate(screenX, screenY);
  love.graphics.rotate(rotationDeg * DEG_TO_RAD);
  love.graphics.scale(SCALE, SCALE);

  // The ship sprite, drawn centered so it rotates about its middle. The
  // exhaust is a world-space particle trail (see emitThrust), not drawn here.
  love.graphics.setColor(1, 1, 1, 1);
  love.graphics.draw(shipImage, shipQuad, 0, 0, 0, 1, 1, shipHalfW, shipHalfH);

  love.graphics.pop();
}

/**
 * Render the whole scene to a low-res canvas on the integer pixel grid, then
 * blit it to the screen upscaled with a sub-pixel offset.
 *
 * - Crisp pixels: world objects snap to whole canvas pixels (technique #2).
 * - Smooth scroll: the fractional camera remainder shifts the upscaled canvas
 *   by sub-SCALE screen pixels (technique #1).
 *
 * The ship is drawn at its exact (unfloored) world position so the sub-pixel
 * blit keeps it pinned to the view center while the world scrolls beneath it.
 */
export function renderSystem(
  canvas: Canvas,
  interpolate: boolean,
  subpixel: boolean,
  alpha: number,
) {
  const ship = ships.raw[0];

  let shipX = ship.transform.position.x;
  let shipY = ship.transform.position.y;
  let shipRot = ship.transform.rotation;
  if (interpolate) {
    shipX = lerp(ship.previous.position.x, shipX, alpha);
    shipY = lerp(ship.previous.position.y, shipY, alpha);
    shipRot = lerp(ship.previous.rotation, shipRot, alpha);
  }

  // Camera top-left, in world space.
  const camX = shipX - GAME_WIDTH / 2;
  const camY = shipY - GAME_HEIGHT / 2;

  const flooredCamX = Math.floor(camX);
  const flooredCamY = Math.floor(camY);

  // Sub-pixel scroll, quantized to whole SCREEN pixels. The world is drawn on
  // the integer low-res grid (crisp); the fractional camera remainder becomes
  // an integer screen-pixel blit offset, giving 1/SCALE-game-pixel motion
  // granularity without ever landing on a fractional screen pixel (no blur).
  // Sub-pixel off snaps the offset to 0, so scrolling steps a whole low-res
  // pixel (SCALE screen px) at a time.
  const blitX = subpixel ? -Math.round((camX - flooredCamX) * SCALE) : 0;
  const blitY = subpixel ? -Math.round((camY - flooredCamY) * SCALE) : 0;

  const viewLeft = flooredCamX;
  const viewTop = flooredCamY;
  const viewRight = flooredCamX + GAME_WIDTH + 1;
  const viewBottom = flooredCamY + GAME_HEIGHT + 1;

  // --- world → low-res canvas, on the integer pixel grid ---
  love.graphics.setCanvas(canvas);
  love.graphics.clear(SPACE_COLOR[0], SPACE_COLOR[1], SPACE_COLOR[2], 1);

  love.graphics.push();
  love.graphics.translate(-flooredCamX, -flooredCamY);
  drawStars(viewLeft, viewTop, viewRight, viewBottom);
  drawPlanets(viewLeft, viewTop, viewRight, viewBottom);
  drawParticles(viewLeft, viewTop, viewRight, viewBottom);
  love.graphics.pop();

  love.graphics.setCanvas();

  // --- blit the world, upscaled, at the whole-screen-pixel offset ---
  love.graphics.setColor(1, 1, 1, 1);
  love.graphics.draw(canvas, blitX, blitY, 0, SCALE, SCALE);

  // --- ship on top, pinned to the exact view center ---
  drawShip(
    ship,
    (GAME_WIDTH / 2) * SCALE,
    (GAME_HEIGHT / 2) * SCALE,
    shipRot,
  );
}
