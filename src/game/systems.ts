import { Canvas, Image, Quad, Shader } from 'love.graphics';
import { lerp, rndRange, TAU, wrap } from '../lib/math';
import {
  ReadonlyEntityCollection,
  SafeEntity,
  World,
} from '../lib/objecs/world';
import {
  createBullet,
  createEnemy,
  createHomingBullet,
  createParticle,
} from './factories';
import { actions } from './input';
import {
  BOOST_DASH_COST,
  BOOST_DASH_IMPULSE,
  BOOST_DRAIN,
  BOOST_FUEL_MAX,
  BOOST_REFILL,
  BULLET_RADIUS,
  BULLET_SPEED,
  ENEMY_HEALTH,
  ENEMY_HIT_FLASH,
  ENEMY_PATROL_RADIUS,
  ENEMY_RADIUS,
  ENEMY_REPATH_TIME,
  ENEMY_RESPAWN_DELAY,
  ENEMY_SEPARATION,
  ENEMY_SEPARATION_FORCE,
  ENEMY_SIGHT_LOSE_MARGIN,
  ENEMY_THRUST,
  ENEMY_WAYPOINT_REACHED,
  GAME_HEIGHT,
  GAME_WIDTH,
  HOMING_CHARGE_MAX,
  HOMING_CLOSE_DIST,
  HOMING_LOCK_MARGIN,
  HOMING_PROXIMITY,
  HOMING_SEEK_DELAY,
  HOMING_SPEED,
  HOMING_SPREAD_DEG,
  HOMING_STAGGER,
  HOMING_TURN_CLOSE_BOOST,
  MUZZLE_OFFSET,
  SHOOT_INTERVAL,
  SHOT_SPREAD,
  LIGHT_DIR_X,
  LIGHT_DIR_Y,
  SCALE,
  SHAKE_MAX,
  SHAKE_THRESHOLD,
  SHIP_BOOST_THRUST,
  SHIP_BRAKE,
  SHIP_FORWARD_DRAG,
  SHIP_LATERAL_DRAG,
  SHIP_MAX_SPEED,
  SHIP_ROTATION_SPEED,
  SHIP_THRUST,
  STREAK_K,
  STREAK_MAX,
  STREAK_THRESHOLD,
  WORLD_HEIGHT,
  WORLD_WIDTH,
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
type BulletEntity = SafeEntity<
  Entity,
  'transform' | 'previous' | 'velocity' | 'bullet'
>;
type EnemyEntity = SafeEntity<
  Entity,
  'transform' | 'previous' | 'velocity' | 'enemy'
>;

// Live archetype queries, created once from the world and reused every frame.
let world!: World<Entity>;
let ships!: ReadonlyEntityCollection<ShipEntity>;
let planets!: ReadonlyEntityCollection<PlanetEntity>;
let stars!: ReadonlyEntityCollection<StarEntity>;
let pulses!: ReadonlyEntityCollection<PulseEntity>;
let particles!: ReadonlyEntityCollection<ParticleEntity>;
let bullets!: ReadonlyEntityCollection<BulletEntity>;
let enemies!: ReadonlyEntityCollection<EnemyEntity>;

export function initQueries(w: World<Entity>) {
  world = w;
  ships = w.archetype('transform', 'previous', 'velocity', 'ship').entities;
  planets = w.archetype('transform', 'planet', 'pulse').entities;
  stars = w.archetype('transform', 'star', 'pulse').entities;
  pulses = w.archetype('pulse').entities;
  particles = w.archetype('transform', 'velocity', 'particle').entities;
  bullets = w.archetype('transform', 'previous', 'velocity', 'bullet').entities;
  enemies = w.archetype('transform', 'previous', 'velocity', 'enemy').entities;
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

// Bullet + enemy quads (from the same shmup sheet as the ship). Both 8x8.
let bulletQuad!: Quad;
let enemyQuad!: Quad;

export function setBulletSprite(quad: Quad) {
  bulletQuad = quad;
}

export function setEnemySprite(quad: Quad) {
  enemyQuad = quad;
}

// Minimap: a low-res circular radar, drawn to its own canvas then blitted up
// ×SCALE so it shares the pixel grid. Geometry in game (low-res) pixels.
const MINIMAP_RADIUS = 14;
const MINIMAP_MARGIN = 4;
const MINIMAP_D = MINIMAP_RADIUS * 2 + 1; // 29
const MINIMAP_ZOOM = 1 / 32; // minimap px per world px
const MINIMAP_TICK_SWEEP = 0.6; // heading-tick arc width, radians
let minimapCanvas: Canvas | undefined;

export function setMinimapCanvas(canvas: Canvas) {
  minimapCanvas = canvas;
}

export const MINIMAP_DIAMETER = MINIMAP_D;

const DEG_TO_RAD = Math.PI / 180;

/** Shortest signed angle a→b in degrees, wrapped to [-180, 180]. */
function angleDiff(from: number, to: number): number {
  let diff = to - from;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
}

// Edge-detect the boost input across fixed steps (for the tap-dash).
let prevBoost = false;

/**
 * Advance the ship one fixed step: input, steer, thrust/boost, grip, integrate.
 * The analog stick sets an absolute target heading; keys/D-pad rotate at a fixed
 * rate. Velocity is split into forward (nose) and lateral and dragged separately
 * so the ship "grips" and goes where it points. Boost is gated by a fuel meter.
 */
export function shipSystem(dt: number) {
  const rotateLeft = actions.rotateLeft();
  const rotateRight = actions.rotateRight();
  const steerHeading = actions.steerHeading();
  const thrust = actions.thrust();
  const brake = actions.brake();
  const boost = actions.boost();

  for (const ship of ships.raw) {
    ship.previous.position.x = ship.transform.position.x;
    ship.previous.position.y = ship.transform.position.y;
    ship.previous.rotation = ship.transform.rotation;

    const st = ship.ship;
    const maxTurn = SHIP_ROTATION_SPEED * dt;

    if (steerHeading !== undefined) {
      // Rotate toward the stick's absolute heading, short way, capped.
      const diff = angleDiff(ship.transform.rotation, steerHeading);
      ship.transform.rotation += Math.max(-maxTurn, Math.min(maxTurn, diff));
    } else {
      if (rotateLeft) ship.transform.rotation -= maxTurn;
      if (rotateRight) ship.transform.rotation += maxTurn;
    }

    const rad = ship.transform.rotation * DEG_TO_RAD;
    const hx = Math.sin(rad);
    const hy = -Math.cos(rad);

    // Tap-dash: a punchy forward burst on the boost press-edge, if there's fuel.
    if (boost && !prevBoost && st.fuel >= BOOST_DASH_COST) {
      ship.velocity.x += hx * BOOST_DASH_IMPULSE;
      ship.velocity.y += hy * BOOST_DASH_IMPULSE;
      st.fuel -= BOOST_DASH_COST;
    }
    const canBoost = boost && st.fuel > 0;

    st.thrusting = false;
    st.boosting = false;
    if (thrust || canBoost) {
      const power = canBoost ? SHIP_BOOST_THRUST : SHIP_THRUST;
      ship.velocity.x += hx * power * dt;
      ship.velocity.y += hy * power * dt;
      st.thrusting = true;
      st.boosting = canBoost;
      emitThrust(ship, hx, hy, canBoost);
    }
    if (brake) {
      ship.velocity.x -= hx * SHIP_THRUST * SHIP_BRAKE * dt;
      ship.velocity.y -= hy * SHIP_THRUST * SHIP_BRAKE * dt;
    }

    // Fuel: boosting drains it; anything else refills it.
    if (canBoost) {
      st.fuel = Math.max(0, st.fuel - BOOST_DRAIN * dt);
    } else {
      st.fuel = Math.min(BOOST_FUEL_MAX, st.fuel + BOOST_REFILL * dt);
    }

    // Grip: split velocity into forward (along the nose) and lateral, drag each.
    const perpX = -hy;
    const perpY = hx;
    const fwd = ship.velocity.x * hx + ship.velocity.y * hy;
    const lat = ship.velocity.x * perpX + ship.velocity.y * perpY;
    const newFwd = fwd * Math.max(0, 1 - SHIP_FORWARD_DRAG * dt);
    const newLat = lat * Math.max(0, 1 - SHIP_LATERAL_DRAG * dt);
    ship.velocity.x = hx * newFwd + perpX * newLat;
    ship.velocity.y = hy * newFwd + perpY * newLat;

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

  prevBoost = boost;
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

// Countdown between shots; reset to 0 on release so the next tap fires at once.
let shootCooldown = 0;

/** Fire on a tap, stream at SHOOT_INTERVAL while held. Double-wide: two parallel
 * bullets offset left/right of the nose line. Bullets inherit ship velocity. */
export function shootSystem(dt: number) {
  shootCooldown -= dt;
  if (!actions.shoot()) {
    shootCooldown = 0;
    return;
  }
  if (shootCooldown > 0) return;
  shootCooldown = SHOOT_INTERVAL;

  const ship = ships.raw[0];
  if (ship === undefined) return;
  const rad = ship.transform.rotation * DEG_TO_RAD;
  const hx = Math.sin(rad);
  const hy = -Math.cos(rad);
  const perpX = -hy;
  const perpY = hx;
  const muzzleX = ship.transform.position.x + hx * MUZZLE_OFFSET;
  const muzzleY = ship.transform.position.y + hy * MUZZLE_OFFSET;
  const vx = ship.velocity.x + hx * BULLET_SPEED;
  const vy = ship.velocity.y + hy * BULLET_SPEED;
  for (const side of [-1, 1]) {
    createBullet(
      world,
      muzzleX + perpX * SHOT_SPREAD * side,
      muzzleY + perpY * SHOT_SPREAD * side,
      ship.transform.rotation,
      vx,
      vy,
    );
  }
}

/** Advance bullets, test against live enemies, and reap the spent ones. */
export function bulletSystem(dt: number) {
  const dead: BulletEntity[] = [];
  for (const bullet of bullets.raw) {
    bullet.previous.position.x = bullet.transform.position.x;
    bullet.previous.position.y = bullet.transform.position.y;
    bullet.previous.rotation = bullet.transform.rotation;

    bullet.bullet.age += dt;
    if (bullet.bullet.age >= bullet.bullet.maxAge) {
      dead.push(bullet);
      continue;
    }

    // Homing: after a brief straight launch phase, steer toward the target with
    // the turn rate ramping up as it closes, so it tightens on instead of
    // orbiting. Flies straight if the target has died/respawned.
    const homing = bullet.homing;
    if (
      homing !== undefined &&
      bullet.bullet.age >= HOMING_SEEK_DELAY &&
      homing.target.transform !== undefined &&
      (homing.target.enemy === undefined ||
        homing.target.enemy.respawnTimer <= 0)
    ) {
      const dx = homing.target.transform.position.x - bullet.transform.position.x;
      const dy = homing.target.transform.position.y - bullet.transform.position.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.001) dist = 0.001;
      const closeBoost =
        1 +
        HOMING_TURN_CLOSE_BOOST *
          Math.max(0, (HOMING_CLOSE_DIST - dist) / HOMING_CLOSE_DIST);
      const cur = Math.atan2(bullet.velocity.y, bullet.velocity.x);
      let diff = Math.atan2(dy, dx) - cur;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // wrap
      const maxStep = homing.turnRate * closeBoost * DEG_TO_RAD * dt;
      const next = cur + Math.max(-maxStep, Math.min(maxStep, diff));
      const speed = Math.sqrt(
        bullet.velocity.x * bullet.velocity.x +
          bullet.velocity.y * bullet.velocity.y,
      );
      bullet.velocity.x = Math.cos(next) * speed;
      bullet.velocity.y = Math.sin(next) * speed;
      bullet.transform.rotation =
        Math.atan2(Math.cos(next), -Math.sin(next)) / DEG_TO_RAD;
    }

    bullet.transform.position.x += bullet.velocity.x * dt;
    bullet.transform.position.y += bullet.velocity.y * dt;

    for (const enemy of enemies.raw) {
      if (enemy.enemy.respawnTimer > 0) continue;
      const dx = enemy.transform.position.x - bullet.transform.position.x;
      const dy = enemy.transform.position.y - bullet.transform.position.y;
      const hitR =
        ENEMY_RADIUS +
        BULLET_RADIUS +
        (bullet.homing !== undefined ? HOMING_PROXIMITY : 0);
      if (dx * dx + dy * dy <= hitR * hitR) {
        hitEnemy(enemy, bullet.transform.position.x, bullet.transform.position.y);
        dead.push(bullet);
        break;
      }
    }
  }
  for (const bullet of dead) {
    world.deleteEntity(bullet);
  }
}

/** Apply a hit: flash, spark, and on death a burst plus a respawn countdown. */
function hitEnemy(enemy: EnemyEntity, atX: number, atY: number) {
  enemy.enemy.health -= 1;
  enemy.enemy.hitFlash = ENEMY_HIT_FLASH;

  for (let i = 0; i < 6; i++) {
    const angle = rndRange(0, TAU);
    const speed = rndRange(20, 70);
    createParticle(
      world,
      atX,
      atY,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      rndRange(0.1, 0.25),
      'flame',
      1,
    );
  }

  if (enemy.enemy.health <= 0) {
    const ex = enemy.transform.position.x;
    const ey = enemy.transform.position.y;
    for (let i = 0; i < 24; i++) {
      const angle = rndRange(0, TAU);
      const speed = rndRange(30, 120);
      createParticle(
        world,
        ex,
        ey,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        rndRange(0.2, 0.5),
        love.math.random() < 0.5 ? 'flame' : 'smoke',
        1,
      );
    }
    enemy.enemy.respawnTimer = ENEMY_RESPAWN_DELAY;
  }
}

const clampTo = (v: number, max: number) => Math.max(0, Math.min(max, v));

/**
 * Enemy movement AI. Each live enemy flies with the player's handling (turn the
 * nose toward a goal, thrust along it, grip drags the slide) minus the boost,
 * a hair slower. It patrols random waypoints until the player is on screen, then
 * pursues — reaching the player and dogfighting — and separates from other foes.
 */
export function enemyAiSystem(dt: number) {
  const ship = ships.raw[0];
  for (const enemy of enemies.raw) {
    const e = enemy.enemy;
    if (e.respawnTimer > 0) continue;

    enemy.previous.position.x = enemy.transform.position.x;
    enemy.previous.position.y = enemy.transform.position.y;
    enemy.previous.rotation = enemy.transform.rotation;

    // Sight is tied to the viewport: spot the player once on screen, disengage
    // once well past the edge — so nothing rushes in from off-screen.
    if (ship !== undefined) {
      const px = ship.transform.position.x - enemy.transform.position.x;
      const py = ship.transform.position.y - enemy.transform.position.y;
      const halfW = GAME_WIDTH / 2;
      const halfH = GAME_HEIGHT / 2;
      const onScreen = Math.abs(px) <= halfW && Math.abs(py) <= halfH;
      const offScreen =
        Math.abs(px) > halfW + ENEMY_SIGHT_LOSE_MARGIN ||
        Math.abs(py) > halfH + ENEMY_SIGHT_LOSE_MARGIN;
      if (e.state === 'patrol' && onScreen) e.state = 'engage';
      else if (e.state === 'engage' && offScreen) e.state = 'patrol';
    } else if (e.state === 'engage') {
      e.state = 'patrol';
    }

    // Pick a goal: pursue the player, or steer to the next patrol waypoint.
    let goalX: number;
    let goalY: number;
    if (e.state === 'engage' && ship !== undefined) {
      goalX = ship.transform.position.x;
      goalY = ship.transform.position.y;
    } else {
      e.repathTimer -= dt;
      const wdx = e.waypoint.x - enemy.transform.position.x;
      const wdy = e.waypoint.y - enemy.transform.position.y;
      if (
        wdx * wdx + wdy * wdy <=
          ENEMY_WAYPOINT_REACHED * ENEMY_WAYPOINT_REACHED ||
        e.repathTimer <= 0
      ) {
        e.waypoint.x = clampTo(
          enemy.transform.position.x +
            rndRange(-ENEMY_PATROL_RADIUS, ENEMY_PATROL_RADIUS),
          WORLD_WIDTH,
        );
        e.waypoint.y = clampTo(
          enemy.transform.position.y +
            rndRange(-ENEMY_PATROL_RADIUS, ENEMY_PATROL_RADIUS),
          WORLD_HEIGHT,
        );
        e.repathTimer = ENEMY_REPATH_TIME;
      }
      goalX = e.waypoint.x;
      goalY = e.waypoint.y;
    }

    // Turn the nose toward the goal, short way, capped at the turn rate.
    const ddx = goalX - enemy.transform.position.x;
    const ddy = goalY - enemy.transform.position.y;
    const targetDeg = Math.atan2(ddx, -ddy) / DEG_TO_RAD;
    const diff = angleDiff(enemy.transform.rotation, targetDeg);
    const maxTurn = SHIP_ROTATION_SPEED * dt;
    enemy.transform.rotation += Math.max(-maxTurn, Math.min(maxTurn, diff));

    const rad = enemy.transform.rotation * DEG_TO_RAD;
    const hx = Math.sin(rad);
    const hy = -Math.cos(rad);

    // Always thrust along the nose (like a player holding the stick), so it
    // banks and arcs onto its heading rather than stopping to pivot.
    enemy.velocity.x += hx * ENEMY_THRUST * dt;
    enemy.velocity.y += hy * ENEMY_THRUST * dt;

    // Grip: forward/lateral split dragged separately (same as the ship).
    const perpX = -hy;
    const perpY = hx;
    const fwd = enemy.velocity.x * hx + enemy.velocity.y * hy;
    const lat = enemy.velocity.x * perpX + enemy.velocity.y * perpY;
    const newFwd = fwd * Math.max(0, 1 - SHIP_FORWARD_DRAG * dt);
    const newLat = lat * Math.max(0, 1 - SHIP_LATERAL_DRAG * dt);
    enemy.velocity.x = hx * newFwd + perpX * newLat;
    enemy.velocity.y = hy * newFwd + perpY * newLat;

    // Separation: push apart from other live enemies so they swarm not stack.
    for (const other of enemies.raw) {
      if (other === enemy || other.enemy.respawnTimer > 0) continue;
      const sx = enemy.transform.position.x - other.transform.position.x;
      const sy = enemy.transform.position.y - other.transform.position.y;
      const d2 = sx * sx + sy * sy;
      if (d2 > 0 && d2 < ENEMY_SEPARATION * ENEMY_SEPARATION) {
        const d = Math.sqrt(d2);
        const push =
          ((ENEMY_SEPARATION - d) / ENEMY_SEPARATION) *
          ENEMY_SEPARATION_FORCE *
          dt;
        enemy.velocity.x += (sx / d) * push;
        enemy.velocity.y += (sy / d) * push;
      }
    }

    enemy.transform.position.x += enemy.velocity.x * dt;
    enemy.transform.position.y += enemy.velocity.y * dt;
  }
}

/** Decay hit flashes and respawn dead enemies near the ship after the delay. */
export function enemySystem(dt: number) {
  const ship = ships.raw[0];
  for (const enemy of enemies.raw) {
    if (enemy.enemy.hitFlash > 0) {
      enemy.enemy.hitFlash = Math.max(0, enemy.enemy.hitFlash - dt);
    }
    if (enemy.enemy.respawnTimer > 0) {
      enemy.enemy.respawnTimer -= dt;
      if (enemy.enemy.respawnTimer <= 0 && ship !== undefined) {
        const angle = rndRange(0, TAU);
        const dist = rndRange(180, 260);
        const nx = ship.transform.position.x + Math.cos(angle) * dist;
        const ny = ship.transform.position.y + Math.sin(angle) * dist;
        enemy.transform.position.x = nx;
        enemy.transform.position.y = ny;
        enemy.previous.position.x = nx;
        enemy.previous.position.y = ny;
        enemy.previous.rotation = enemy.transform.rotation;
        enemy.velocity.x = 0;
        enemy.velocity.y = 0;
        enemy.enemy.respawnTimer = 0;
        enemy.enemy.health = ENEMY_HEALTH;
        enemy.enemy.state = 'patrol';
        enemy.enemy.waypoint.x =
          nx + rndRange(-ENEMY_PATROL_RADIUS, ENEMY_PATROL_RADIUS);
        enemy.enemy.waypoint.y =
          ny + rndRange(-ENEMY_PATROL_RADIUS, ENEMY_PATROL_RADIUS);
        enemy.enemy.repathTimer = rndRange(1, ENEMY_REPATH_TIME);
      }
    }
  }
}

/** Spawn ENEMY_COUNT enemies ringed loosely around a point. */
export function spawnEnemies(count: number, cx: number, cy: number) {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU;
    const dist = 150 + i * 40;
    createEnemy(world, cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist);
  }
}

// ── Homing charge shot ──────────────────────────────────────────────────────

/** Projectiles awarded for a charge held `t` seconds (0 below the 1s floor). */
function chargeToCount(t: number): number {
  if (t >= 3) return 8;
  if (t >= 2) return 5;
  if (t >= 1) return 3;
  return 0;
}

/** True if `target` still exists and isn't mid-respawn. */
function targetIsLive(target: Entity | undefined): boolean {
  return (
    target !== undefined &&
    target.transform !== undefined &&
    (target.enemy === undefined || target.enemy.respawnTimer <= 0)
  );
}

/** The nearest live enemy currently on screen, else undefined. */
function findLockTarget(ship: ShipEntity): Entity | undefined {
  const halfW = GAME_WIDTH / 2 + HOMING_LOCK_MARGIN;
  const halfH = GAME_HEIGHT / 2 + HOMING_LOCK_MARGIN;
  let best: Entity | undefined = undefined;
  let bestDistSq = math.huge;
  for (const enemy of enemies.raw) {
    if (enemy.enemy.respawnTimer > 0) continue;
    const dx = enemy.transform.position.x - ship.transform.position.x;
    const dy = enemy.transform.position.y - ship.transform.position.y;
    if (Math.abs(dx) > halfW || Math.abs(dy) > halfH) continue;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = enemy;
    }
  }
  return best;
}

let homingCharge = 0;
let homingHeld = false;
let lockTarget: Entity | undefined = undefined;
let latchedTarget: Entity | undefined = undefined;
let volleyRemaining = 0;
let volleyTotal = 0;
let volleyTimer = 0;
let volleyTarget: Entity | undefined = undefined;

/** Fan offset (deg) for the `i`-th missile of a `total` volley, ordered
 * CENTRE-OUT so the spread blooms outward like a bulb instead of wiping across. */
function fanOffsetDeg(i: number, total: number): number {
  if (total <= 1) return 0;
  const fracs: number[] = [];
  for (let k = 0; k < total; k++) fracs.push(k / (total - 1) - 0.5);
  fracs.sort((a, b) => {
    const da = Math.abs(a);
    const db = Math.abs(b);
    if (da !== db) return da - db;
    return a - b;
  });
  return fracs[i] * HOMING_SPREAD_DEG;
}

function launchHomingMissile(ship: ShipEntity, target: Entity, index: number) {
  const spread = fanOffsetDeg(index, volleyTotal);
  const angle = (ship.transform.rotation + spread) * DEG_TO_RAD;
  const hx = Math.sin(angle);
  const hy = -Math.cos(angle);
  createHomingBullet(
    world,
    ship.transform.position.x + hx * MUZZLE_OFFSET,
    ship.transform.position.y + hy * MUZZLE_OFFSET,
    ship.transform.rotation + spread,
    hx * HOMING_SPEED,
    hy * HOMING_SPEED,
    target,
  );
}

/** Charge while the homing button is held; on release fire a homing volley at
 * the locked (nearest on-screen) enemy, emitted centre-out over the next steps. */
export function homingSystem(dt: number) {
  const ship = ships.raw[0];
  lockTarget = ship !== undefined ? findLockTarget(ship) : undefined;

  const held = actions.homing();
  if (held) {
    homingCharge = Math.min(HOMING_CHARGE_MAX, homingCharge + dt);
    if (lockTarget !== undefined) latchedTarget = lockTarget;
  } else if (homingHeld) {
    const count = chargeToCount(homingCharge);
    const target = targetIsLive(latchedTarget) ? latchedTarget : lockTarget;
    if (count > 0 && target !== undefined) {
      volleyRemaining = count;
      volleyTotal = count;
      volleyTimer = 0;
      volleyTarget = target;
    }
    homingCharge = 0;
    latchedTarget = undefined;
  }
  homingHeld = held;

  // Emit the queued volley: centre (or innermost pair) first, then each mirror
  // pair together on the next tick, so the spread blooms outward.
  if (volleyRemaining > 0 && volleyTarget !== undefined && ship !== undefined) {
    volleyTimer -= dt;
    while (volleyRemaining > 0 && volleyTimer <= 0) {
      const i0 = volleyTotal - volleyRemaining;
      const offset0 = fanOffsetDeg(i0, volleyTotal);
      launchHomingMissile(ship, volleyTarget, i0);
      volleyRemaining -= 1;
      if (
        volleyRemaining > 0 &&
        Math.abs(fanOffsetDeg(volleyTotal - volleyRemaining, volleyTotal) + offset0) <
          1e-6
      ) {
        launchHomingMissile(ship, volleyTarget, volleyTotal - volleyRemaining);
        volleyRemaining -= 1;
      }
      volleyTimer += HOMING_STAGGER;
    }
    if (volleyRemaining <= 0) volleyTarget = undefined;
  }
}

/** The currently locked enemy (for the reticle), or undefined. */
export function getLockTarget(): Entity | undefined {
  return lockTarget;
}

/** Charge readout for the HUD/reticle: pip count, seconds held, hold state. */
export function getHomingCharge(): {
  count: number;
  seconds: number;
  charging: boolean;
} {
  return {
    count: chargeToCount(homingCharge),
    seconds: homingCharge,
    charging: homingHeld,
  };
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

/** Draw enemies in the low-res world pass, interpolated, facing their heading;
 * a hit flashes as a quick scale pop. */
function drawEnemies(
  interpolate: boolean,
  alpha: number,
  viewLeft: number,
  viewTop: number,
  viewRight: number,
  viewBottom: number,
) {
  for (const enemy of enemies.raw) {
    if (enemy.enemy.respawnTimer > 0) continue;
    let ex = enemy.transform.position.x;
    let ey = enemy.transform.position.y;
    let er = enemy.transform.rotation;
    if (interpolate) {
      ex = lerp(enemy.previous.position.x, ex, alpha);
      ey = lerp(enemy.previous.position.y, ey, alpha);
      er = lerp(enemy.previous.rotation, er, alpha);
    }
    if (
      ex < viewLeft - 6 ||
      ex > viewRight + 6 ||
      ey < viewTop - 6 ||
      ey > viewBottom + 6
    ) {
      continue;
    }
    const scale = enemy.enemy.hitFlash > 0 ? 1.4 : 1;
    love.graphics.setColor(1, 1, 1, 1);
    love.graphics.draw(
      shipImage,
      enemyQuad,
      Math.floor(ex),
      Math.floor(ey),
      er * DEG_TO_RAD,
      scale,
      scale,
      4,
      4,
    );
  }
}

/** One L-shaped corner of the lock-on reticle. */
function reticleCorner(px: number, py: number, dx: number, dy: number, arm: number) {
  love.graphics.rectangle('fill', dx < 0 ? px : px - arm + 1, py, arm, 1);
  love.graphics.rectangle('fill', px, dy < 0 ? py : py - arm + 1, 1, arm);
}

/** Lock-on brackets around the targeted enemy (breathing; orange while
 * charging, red when just locked). Drawn in the low-res world pass. */
function drawReticle(interpolate: boolean, alpha: number) {
  const target = getLockTarget();
  if (target === undefined || target.transform === undefined) return;
  let cx = target.transform.position.x;
  let cy = target.transform.position.y;
  if (interpolate && target.previous !== undefined) {
    cx = lerp(target.previous.position.x, cx, alpha);
    cy = lerp(target.previous.position.y, cy, alpha);
  }
  const fx = Math.floor(cx);
  const fy = Math.floor(cy);
  const charging = getHomingCharge().charging;
  const half = 6 + (Math.sin(love.timer.getTime() * 7) > 0.4 ? 1 : 0);
  const arm = 2;
  const col = charging ? Pico8.orange : Pico8.red;
  love.graphics.setColor(col[0], col[1], col[2], 1);
  reticleCorner(fx - half, fy - half, -1, -1, arm);
  reticleCorner(fx + half, fy - half, 1, -1, arm);
  reticleCorner(fx - half, fy + half, -1, 1, arm);
  reticleCorner(fx + half, fy + half, 1, 1, arm);
}

/** Draw bullets in the low-res world pass (already translated by -flooredCam),
 * rotated to their heading. */
function drawBullets(
  interpolate: boolean,
  alpha: number,
  viewLeft: number,
  viewTop: number,
  viewRight: number,
  viewBottom: number,
) {
  for (const bullet of bullets.raw) {
    let bx = bullet.transform.position.x;
    let by = bullet.transform.position.y;
    let br = bullet.transform.rotation;
    if (interpolate) {
      bx = lerp(bullet.previous.position.x, bx, alpha);
      by = lerp(bullet.previous.position.y, by, alpha);
      br = lerp(bullet.previous.rotation, br, alpha);
    }
    if (
      bx < viewLeft - 4 ||
      bx > viewRight + 4 ||
      by < viewTop - 4 ||
      by > viewBottom + 4
    ) {
      continue;
    }
    // Homing missiles read orange, straight shots white.
    if (bullet.homing !== undefined) {
      love.graphics.setColor(Pico8.orange[0], Pico8.orange[1], Pico8.orange[2], 1);
    } else {
      love.graphics.setColor(1, 1, 1, 1);
    }
    love.graphics.draw(
      shipImage,
      bulletQuad,
      Math.floor(bx),
      Math.floor(by),
      br * DEG_TO_RAD,
      1,
      1,
      4,
      4,
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

/** Render the circular radar to the minimap canvas: planet dots, red enemy
 * blips (clamped to the rim), the ship as the centre pixel, and a heading tick. */
function renderMinimap(shipX: number, shipY: number, rotationDeg: number) {
  if (minimapCanvas === undefined) return;
  const r = MINIMAP_RADIUS;
  const zoom = MINIMAP_ZOOM;

  love.graphics.setCanvas(minimapCanvas);
  love.graphics.clear(0, 0, 0, 0);

  love.graphics.setColor(Pico8.darkBlue[0], Pico8.darkBlue[1], Pico8.darkBlue[2], 0.55);
  love.graphics.circle('fill', r, r, r);

  for (const planet of planets.raw) {
    const pl = planet.planet;
    const dx = (planet.transform.position.x - shipX) * zoom;
    const dy = (planet.transform.position.y - shipY) * zoom;
    const dotR = Math.max(1, pl.radius * zoom);
    if (dx * dx + dy * dy > (r + dotR) * (r + dotR)) continue;
    love.graphics.setColor(pl.base[0], pl.base[1], pl.base[2], 1);
    love.graphics.circle('fill', Math.floor(r + dx), Math.floor(r + dy), dotR);
  }

  for (const enemy of enemies.raw) {
    if (enemy.enemy.respawnTimer > 0) continue;
    let dx = (enemy.transform.position.x - shipX) * zoom;
    let dy = (enemy.transform.position.y - shipY) * zoom;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const max = r - 1;
    if (dist > max) {
      dx = (dx / dist) * max;
      dy = (dy / dist) * max;
    }
    love.graphics.setColor(Pico8.red[0], Pico8.red[1], Pico8.red[2], 1);
    love.graphics.rectangle('fill', Math.floor(r + dx), Math.floor(r + dy), 1, 1);
  }

  love.graphics.setColor(Pico8.white[0], Pico8.white[1], Pico8.white[2], 1);
  love.graphics.rectangle('fill', r, r, 1, 1);

  const rad = rotationDeg * DEG_TO_RAD;
  const headingAngle = Math.atan2(-Math.cos(rad), Math.sin(rad));
  love.graphics.setColor(Pico8.blue[0], Pico8.blue[1], Pico8.blue[2], 1);
  love.graphics.setLineWidth(2);
  love.graphics.arc(
    'line',
    'open',
    r,
    r,
    r - 1,
    headingAngle - MINIMAP_TICK_SWEEP / 2,
    headingAngle + MINIMAP_TICK_SWEEP / 2,
  );
  love.graphics.setLineWidth(1);

  love.graphics.setColor(Pico8.lavender[0], Pico8.lavender[1], Pico8.lavender[2], 0.8);
  love.graphics.circle('line', r, r, r - 0.5);
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
  minimap: boolean,
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
  drawEnemies(interpolate, alpha, viewLeft, viewTop, viewRight, viewBottom);
  drawReticle(interpolate, alpha);
  drawBullets(interpolate, alpha, viewLeft, viewTop, viewRight, viewBottom);
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

  // Minimap: render its own low-res canvas, then blit it ×SCALE, top-right.
  if (minimap && minimapCanvas !== undefined) {
    renderMinimap(shipX, shipY, shipRot);
    love.graphics.setCanvas(sceneTarget);
    love.graphics.setColor(1, 1, 1, 1);
    love.graphics.draw(
      minimapCanvas,
      (GAME_WIDTH - MINIMAP_MARGIN - MINIMAP_D) * SCALE,
      MINIMAP_MARGIN * SCALE,
      0,
      SCALE,
      SCALE,
    );
  }

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
