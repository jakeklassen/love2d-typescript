// Low-res viewport, upscaled ×SCALE. SCALE must stay an integer so the pixel
// art never shimmers. 320×240 ×4 = 1280×960 — 4:3 (boxier than 16:9, so foes
// chasing from above/below aren't hidden until point-blank). Mirrors the PixiJS
// space-drift build so the two can be compared side by side.
export const GAME_WIDTH = 320;
export const GAME_HEIGHT = 240;
export const SCALE = 4;

// The render canvas is one pixel larger than the view so the sub-pixel blit
// offset (up to one low-res pixel) never reveals an uncovered edge.
export const CANVAS_WIDTH = GAME_WIDTH + 1;
export const CANVAS_HEIGHT = GAME_HEIGHT + 1;

// A large area to drift around in, dotted with landmarks.
export const WORLD_WIDTH = 1536;
export const WORLD_HEIGHT = 1536;

// Fixed-timestep simulation; rendering interpolates between steps.
export const FIXED_DT = 1 / 60;
export const MAX_FRAME_TIME = 0.25;

// Ship tuning — a deliberately "tight" asteroids feel.
export const SHIP_ROTATION_SPEED = 210; // degrees / second
export const SHIP_THRUST = 280; // pixels / second^2
export const SHIP_BRAKE = 0.6; // reverse-thrust fraction on the brake key

// Grip handling: velocity is split into forward (along the nose) and lateral
// (sideways) components each step and dragged separately. High lateral drag =
// the ship "grips" and goes where it points; forward drag sets cruise speed
// (~SHIP_THRUST / SHIP_FORWARD_DRAG).
export const SHIP_FORWARD_DRAG = 2.5;
export const SHIP_LATERAL_DRAG = 9; // strong grip → go where you point

// Absolute speed clamp — only the boost reaches it.
export const SHIP_MAX_SPEED = 520;

// Boost (hold Z / Right Trigger): huge forward thrust, gated by a fuel meter. A
// tap fires a punchy dash; holding sustains until the meter drains, then it
// refills when released.
export const SHIP_BOOST_THRUST = 1500;
export const BOOST_FUEL_MAX = 1; // full tank (arbitrary units)
export const BOOST_DRAIN = 0.6; // fuel/sec while boosting (~1.7s from full)
export const BOOST_REFILL = 0.32; // fuel/sec while not boosting (~3s to refill)
export const BOOST_DASH_COST = 0.18; // fuel spent on a tap-dash
export const BOOST_DASH_IMPULSE = 170; // forward px/s from a tap-dash

// Left-stick deflection past this counts as a digital press / "gas".
export const STICK_DEADZONE = 0.4;

// Star streaking during high-speed flight.
export const STREAK_THRESHOLD = 140;
export const STREAK_K = 0.07;
export const STREAK_MAX = 46;

// Screen shake ramps in above this speed.
export const SHAKE_THRESHOLD = 200;
export const SHAKE_MAX = 1.2;

// Shooting. Bullets inherit the ship's velocity so you can never outrun your
// own fire. A tap fires once; holding streams at SHOOT_INTERVAL. The shot is
// double-wide: two parallel bullets offset ±SHOT_SPREAD from the nose line.
export const BULLET_SPEED = 320; // px/s added on top of the ship's velocity
export const BULLET_LIFETIME = 1.1; // seconds before a bullet expires
export const BULLET_RADIUS = 2; // px, for hit tests
export const SHOOT_INTERVAL = 0.13; // seconds between shots while held
export const MUZZLE_OFFSET = 5; // px ahead of the ship centre to spawn bullets
export const SHOT_SPREAD = 3; // px offset each side of the nose line

// Homing charge shot (hold B / X key). Locks the nearest on-screen enemy; the
// longer held, the bigger the volley: >=1s -> 3, >=2s -> 5, >=3s -> 8. Release
// fires a staggered, centre-out homing spread that tightens onto the target.
export const HOMING_CHARGE_MAX = 3; // seconds to full charge
export const HOMING_LOCK_MARGIN = 6; // px past the view edge still counts on-screen
export const HOMING_SPEED = 250; // px/s constant cruise speed
export const HOMING_TURN_RATE = 540; // deg/s base steering
export const HOMING_CLOSE_DIST = 80; // px range where the turn rate ramps up
export const HOMING_TURN_CLOSE_BOOST = 6; // extra turn-rate multiplier at point blank
export const HOMING_SEEK_DELAY = 0.13; // seconds flown straight before homing
export const HOMING_PROXIMITY = 3; // px bonus hit radius for homing missiles
export const HOMING_SPREAD_DEG = 82; // wide initial fan-out across the volley
export const HOMING_STAGGER = 0.06; // seconds between symmetric pairs
export const HOMING_LIFETIME = 3.0; // seconds before a homing missile expires

// Enemy: takes ENEMY_HEALTH hits, then bursts and respawns after a short delay.
export const ENEMY_COUNT = 3;
export const ENEMY_HEALTH = 3;
export const ENEMY_RADIUS = 5; // px, hit-test radius
export const ENEMY_HIT_FLASH = 0.08; // seconds of hit flash
export const ENEMY_RESPAWN_DELAY = 1.2; // seconds dead before respawn

// Enemy AI. Enemies fly with the player's handling minus the boost, a hair
// slower. They patrol random waypoints, and only spot the player once on screen
// (within the viewport), then pursue — reaching the player and dogfighting.
export const ENEMY_THRUST = 240; // px/s² (vs SHIP_THRUST 280): slightly slower
export const ENEMY_SIGHT_LOSE_MARGIN = 48; // px past the view edge → back to patrol
export const ENEMY_PATROL_RADIUS = 200; // px spread of the next patrol waypoint
export const ENEMY_WAYPOINT_REACHED = 22; // px to count a waypoint as reached
export const ENEMY_REPATH_TIME = 4; // seconds before repicking a waypoint anyway
export const ENEMY_SEPARATION = 26; // px spacing enemies keep from each other
export const ENEMY_SEPARATION_FORCE = 480; // px/s² push apart when closer

export const PLANET_COUNT = 7;

// Shared light direction for all planets (up-and-to-the-left). Pre-normalized.
export const LIGHT_DIR_X = -0.7071;
export const LIGHT_DIR_Y = -0.7071;
