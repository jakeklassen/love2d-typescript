import { Canvas, Image, Quad } from 'love.graphics';
import { lerp } from '../lib/math';
import {
  ReadonlyEntityCollection,
  SafeEntity,
  World,
} from '../lib/objecs/world';
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

// Live archetype queries, created once from the world and reused every frame.
let ships!: ReadonlyEntityCollection<ShipEntity>;
let planets!: ReadonlyEntityCollection<PlanetEntity>;
let stars!: ReadonlyEntityCollection<StarEntity>;
let pulses!: ReadonlyEntityCollection<PulseEntity>;

export function initQueries(world: World<Entity>) {
  ships = world.archetype('transform', 'previous', 'velocity', 'ship').entities;
  planets = world.archetype('transform', 'planet', 'pulse').entities;
  stars = world.archetype('transform', 'star', 'pulse').entities;
  pulses = world.archetype('pulse').entities;
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

function drawShip(ship: ShipEntity, x: number, y: number, rotationDeg: number) {
  love.graphics.push();
  love.graphics.translate(x, y);
  love.graphics.rotate(rotationDeg * DEG_TO_RAD);

  // Thruster flame (flickers) behind the hull when accelerating.
  if (ship.ship.thrusting) {
    const flame = shipHalfH + 2 + love.math.random() * 2;
    love.graphics.setColor(Pico8.orange[0], Pico8.orange[1], Pico8.orange[2], 1);
    love.graphics.polygon('fill', -2, shipHalfH, 2, shipHalfH, 0, flame);
    love.graphics.setColor(Pico8.yellow[0], Pico8.yellow[1], Pico8.yellow[2], 1);
    love.graphics.polygon('fill', -1, shipHalfH, 1, shipHalfH, 0, flame - 2);
  }

  // The ship sprite, drawn centered so it rotates about its middle.
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
  upscaleCanvas: Canvas,
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

  // Camera top-left, in world space. When sub-pixel is off, snap it to the
  // integer grid so scrolling steps a whole low-res pixel at a time (stutter).
  let camX = shipX - GAME_WIDTH / 2;
  let camY = shipY - GAME_HEIGHT / 2;
  if (!subpixel) {
    camX = Math.floor(camX);
    camY = Math.floor(camY);
  }

  const flooredCamX = Math.floor(camX);
  const flooredCamY = Math.floor(camY);
  const fracX = camX - flooredCamX;
  const fracY = camY - flooredCamY;

  const viewLeft = flooredCamX;
  const viewTop = flooredCamY;
  const viewRight = flooredCamX + GAME_WIDTH + 1;
  const viewBottom = flooredCamY + GAME_HEIGHT + 1;

  love.graphics.setCanvas(canvas);
  love.graphics.clear(SPACE_COLOR[0], SPACE_COLOR[1], SPACE_COLOR[2], 1);

  love.graphics.push();
  love.graphics.translate(-flooredCamX, -flooredCamY);

  drawStars(viewLeft, viewTop, viewRight, viewBottom);
  drawPlanets(viewLeft, viewTop, viewRight, viewBottom);

  // The ship draws at exact coords (or floored when sub-pixel is off).
  const shipDrawX = subpixel ? shipX : Math.floor(shipX);
  const shipDrawY = subpixel ? shipY : Math.floor(shipY);
  drawShip(ship, shipDrawX, shipDrawY, shipRot);

  love.graphics.pop();
  love.graphics.setCanvas();

  love.graphics.setColor(1, 1, 1, 1);

  if (subpixel) {
    // Two-pass: nearest-upscale to full resolution first (crisp 5x5 blocks),
    // then apply the fractional sub-pixel shift with the upscale canvas's
    // linear filter. Only the ~1px texel seams soften; block interiors stay
    // sharp — much cleaner than linear-filtering the low-res source directly.
    love.graphics.setCanvas(upscaleCanvas);
    love.graphics.clear(SPACE_COLOR[0], SPACE_COLOR[1], SPACE_COLOR[2], 1);
    love.graphics.draw(canvas, 0, 0, 0, SCALE, SCALE);
    love.graphics.setCanvas();
    love.graphics.draw(upscaleCanvas, -fracX * SCALE, -fracY * SCALE);
  } else {
    // Integer camera: straight nearest upscale — razor sharp, but steps a
    // whole low-res pixel at a time.
    love.graphics.draw(canvas, 0, 0, 0, SCALE, SCALE);
  }
}
