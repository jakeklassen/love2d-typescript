import { Canvas, Image, Quad, Shader } from 'love.graphics';
import { lerp, rndRange, wrap } from '../lib/math';
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
  SHAKE_MAX,
  SHAKE_THRESHOLD,
  SHIP_BOOST_THRUST,
  SHIP_BRAKE,
  SHIP_DRAG,
  SHIP_MAX_SPEED,
  SHIP_ROTATION_SPEED,
  SHIP_THRUST,
  STREAK_K,
  STREAK_MAX,
  STREAK_THRESHOLD,
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
// The rotation used the last time the ship was rendered, so the bloom glow can
// match its orientation.
let lastShipRot = 0;

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
  const boost = love.keyboard.isDown('z');

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
    if (thrust || boost) {
      const power = boost ? SHIP_BOOST_THRUST : SHIP_THRUST;
      ship.velocity.x += headingX * power * dt;
      ship.velocity.y += headingY * power * dt;
      ship.ship.thrusting = true;
      emitThrust(ship, headingX, headingY, boost);
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
function emitThrust(
  ship: ShipEntity,
  headingX: number,
  headingY: number,
  boost: boolean,
) {
  const pos = ship.transform.position;
  // Engine nozzle, just behind the hull.
  const nozzleX = pos.x - headingX * (shipHalfH + 1);
  const nozzleY = pos.y - headingY * (shipHalfH + 1);
  // Perpendicular to the heading, for lateral spread.
  const perpX = -headingY;
  const perpY = headingX;

  // Boost throws a denser, faster plume that stretches into a long trail.
  const count = boost
    ? love.math.random() < 0.5
      ? 7
      : 6
    : love.math.random() < 0.5
      ? 4
      : 3;
  for (let i = 0; i < count; i++) {
    const back = boost ? rndRange(26, 64) : rndRange(12, 30);
    // Emit across a wide band at the nozzle (fat base), then pull each spark
    // back toward the center axis — stronger the further off-center it starts —
    // so the plume converges to a point as it trails away: a cone.
    const band = rndRange(-2, 2);
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

// Parallax starfield, drawn straight to the SCREEN (behind the world). Each
// layer scrolls at `depth` × the camera and wraps over a view-sized tile, so
// the field is effectively infinite and layers at different depths separate to
// give a sense of distance. Screen-space rendering is what keeps it smooth: a
// single sub-pixel canvas blit can only carry one scroll rate, so slow layers
// would judder on the blitted canvas — here each layer floors to its own whole
// screen pixel independently.
const STAR_WRAP_W = (GAME_WIDTH + 2) * SCALE;
const STAR_WRAP_H = (GAME_HEIGHT + 2) * SCALE;

function drawStars(
  camX: number,
  camY: number,
  subpixel: boolean,
  velX: number,
  velY: number,
) {
  // At speed, stars stretch into streaks along the travel axis — length scales
  // with over-speed and with each star's parallax depth (near stars streak
  // longest). Below the threshold they stay as dots.
  const speed = Math.sqrt(velX * velX + velY * velY);
  const streaking = speed > STREAK_THRESHOLD;
  const dirX = streaking ? velX / speed : 0;
  const dirY = streaking ? velY / speed : 0;
  const baseLen = streaking
    ? Math.min((speed - STREAK_THRESHOLD) * STREAK_K, STREAK_MAX)
    : 0;

  if (streaking) {
    love.graphics.setLineStyle('rough');
  }

  for (const star of stars.raw) {
    const s = star.star;
    const worldX = star.transform.position.x - camX * s.depth;
    const worldY = star.transform.position.y - camY * s.depth;

    // Smooth: floor to whole screen pixels. Sub-pixel off: snap to whole game
    // pixels so stars step with the (stuttering) world.
    const rawX = subpixel
      ? Math.floor(worldX * SCALE)
      : Math.floor(worldX) * SCALE;
    const rawY = subpixel
      ? Math.floor(worldY * SCALE)
      : Math.floor(worldY) * SCALE;

    const sx = wrap(rawX, STAR_WRAP_W) - SCALE;
    const sy = wrap(rawY, STAR_WRAP_H) - SCALE;

    // Soft twinkle: brightness eases within [1 - amplitude, 1].
    const brightness =
      1 - star.pulse.amplitude * (0.5 + 0.5 * Math.sin(star.pulse.time));

    love.graphics.setColor(
      s.color[0] * brightness,
      s.color[1] * brightness,
      s.color[2] * brightness,
      1,
    );

    const size = s.size * SCALE;
    if (streaking) {
      // Trail behind the star's screen motion (i.e. along +velocity).
      const len = baseLen * s.depth * SCALE;
      const cx = sx + size * 0.5;
      const cy = sy + size * 0.5;
      love.graphics.setLineWidth(size);
      love.graphics.line(cx, cy, cx + dirX * len, cy + dirY * len);
    } else {
      love.graphics.rectangle('fill', sx, sy, size, size);
    }
  }

  if (streaking) {
    love.graphics.setLineWidth(1);
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
  sceneTarget: Canvas,
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
  let camX = shipX - GAME_WIDTH / 2;
  let camY = shipY - GAME_HEIGHT / 2;

  // Screen shake ramps in with over-speed (boost) — the whole world jitters
  // around the pinned ship for a "rattling at max velocity" feel.
  const speed = Math.sqrt(
    ship.velocity.x * ship.velocity.x + ship.velocity.y * ship.velocity.y,
  );
  if (speed > SHAKE_THRESHOLD) {
    const amp = Math.min((speed - SHAKE_THRESHOLD) / 300, 1) * SHAKE_MAX;
    camX += (love.math.random() * 2 - 1) * amp;
    camY += (love.math.random() * 2 - 1) * amp;
  }

  const flooredCamX = Math.floor(camX);
  const flooredCamY = Math.floor(camY);

  // Sub-pixel scroll, quantized to whole SCREEN pixels. The world is drawn on
  // the integer low-res grid (crisp); the fractional camera remainder becomes
  // an integer screen-pixel blit offset, giving 1/SCALE-game-pixel motion
  // granularity without ever landing on a fractional screen pixel (no blur).
  // Sub-pixel off snaps the offset to 0, so scrolling steps a whole low-res
  // pixel (SCALE screen px) at a time.
  const fracX = subpixel ? camX - flooredCamX : 0;
  const fracY = subpixel ? camY - flooredCamY : 0;
  const blitX = -Math.round(fracX * SCALE);
  const blitY = -Math.round(fracY * SCALE);

  const viewLeft = flooredCamX;
  const viewTop = flooredCamY;
  const viewRight = flooredCamX + GAME_WIDTH + 1;
  const viewBottom = flooredCamY + GAME_HEIGHT + 1;

  // --- world (planets + exhaust) → transparent low-res canvas ---
  love.graphics.setCanvas(canvas);
  love.graphics.clear(0, 0, 0, 0);
  love.graphics.push();
  love.graphics.translate(-flooredCamX, -flooredCamY);
  drawPlanets(viewLeft, viewTop, viewRight, viewBottom);
  drawParticles(viewLeft, viewTop, viewRight, viewBottom);
  love.graphics.pop();

  // --- composite the full scene into the scene target (for post-processing) ---
  love.graphics.setCanvas(sceneTarget);
  love.graphics.clear(SPACE_COLOR[0], SPACE_COLOR[1], SPACE_COLOR[2], 1);

  // Parallax stars, behind the world (streaking at speed).
  drawStars(camX, camY, subpixel, ship.velocity.x, ship.velocity.y);

  // Blit the world over the stars (premultiplied so the canvas's transparent
  // background composites correctly).
  love.graphics.setColor(1, 1, 1, 1);
  love.graphics.setBlendMode('alpha', 'premultiplied');
  love.graphics.draw(canvas, blitX, blitY, 0, SCALE, SCALE);
  love.graphics.setBlendMode('alpha');

  // Ship on top, pinned to the exact view center.
  lastShipRot = shipRot;
  const shipScreenX = (GAME_WIDTH / 2) * SCALE;
  const shipScreenY = (GAME_HEIGHT / 2) * SCALE;
  drawShip(ship, shipScreenX, shipScreenY, shipRot);
  drawPlanetLightOnShip(shipX, shipY, shipScreenX, shipScreenY, shipRot);

  // Leaves `sceneTarget` as the active canvas for the HUD + post-process.
}

// Flat-colors the ship silhouette (uses the sprite alpha as a mask), so a
// planet's light washes the whole hull, not just its matching-color pixels.
let shipLightShader: Shader | undefined;
function getShipLightShader(): Shader {
  if (shipLightShader === undefined) {
    shipLightShader = love.graphics.newShader(`
      extern vec3 lightColor;
      vec4 effect(vec4 color, Image tex, vec2 tc, vec2 sc) {
        return vec4(lightColor, Texel(tex, tc).a * color.a);
      }
    `);
  }
  return shipLightShader;
}

/** Wash the ship with the summed light of nearby planets, offset toward the
 * dominant one for a directional feel. Drawn additively into the scene (so it
 * also feeds the bloom). */
function drawPlanetLightOnShip(
  shipX: number,
  shipY: number,
  screenX: number,
  screenY: number,
  rotationDeg: number,
) {
  let r = 0;
  let g = 0;
  let b = 0;
  let dirX = 0;
  let dirY = 0;
  let total = 0;

  for (const planet of planets.raw) {
    const pl = planet.planet;
    const dx = planet.transform.position.x - shipX;
    const dy = planet.transform.position.y - shipY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const range = pl.radius * 5 + 30;
    const surface = dist - pl.radius;
    if (surface >= range) continue;

    let i = 1 - surface / range;
    if (i <= 0) continue;
    i = i * i; // ease the falloff

    // Use the planet's characteristic hue (base), not its near-white highlight,
    // so the spilled light is actually colored.
    r += pl.base[0] * i;
    g += pl.base[1] * i;
    b += pl.base[2] * i;

    const inv = i / Math.max(dist, 0.001);
    dirX += dx * inv;
    dirY += dy * inv;
    total += i;
  }

  if (total <= 0) return;

  const strength = 0.55;
  r = Math.min(r, 1) * strength;
  g = Math.min(g, 1) * strength;
  b = Math.min(b, 1) * strength;

  // Directional offset (screen space) toward the dominant planet.
  const dlen = Math.sqrt(dirX * dirX + dirY * dirY);
  let ox = 0;
  let oy = 0;
  if (dlen > 0) {
    const push = SCALE * 0.5 * Math.min(total, 1);
    ox = (dirX / dlen) * push;
    oy = (dirY / dlen) * push;
  }

  love.graphics.setShader(getShipLightShader());
  getShipLightShader().send('lightColor', [r, g, b]);
  love.graphics.setBlendMode('add');
  love.graphics.push();
  love.graphics.translate(screenX + ox, screenY + oy);
  love.graphics.rotate(rotationDeg * DEG_TO_RAD);
  love.graphics.scale(SCALE, SCALE);
  love.graphics.setColor(1, 1, 1, 1);
  love.graphics.draw(shipImage, shipQuad, 0, 0, 0, 1, 1, shipHalfW, shipHalfH);
  love.graphics.pop();
  love.graphics.setBlendMode('alpha');
  love.graphics.setShader();
}

/** Draw the ship sprite as a bloom contributor at (screenX, screenY) scaled by
 * `spriteScale`, using its last render orientation. `alpha` sets glow strength.
 * Meant to be drawn additively into the bloom canvas. */
export function drawShipGlow(
  screenX: number,
  screenY: number,
  spriteScale: number,
  alpha: number,
) {
  love.graphics.push();
  love.graphics.translate(screenX, screenY);
  love.graphics.rotate(lastShipRot * DEG_TO_RAD);
  love.graphics.scale(spriteScale, spriteScale);
  love.graphics.setColor(1, 1, 1, alpha);
  love.graphics.draw(shipImage, shipQuad, 0, 0, 0, 1, 1, shipHalfW, shipHalfH);
  love.graphics.pop();
}
