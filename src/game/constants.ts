export const GAME_WIDTH = 128;
export const GAME_HEIGHT = 128;
export const SCALE = 5;

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

// Ship tuning — a deliberately "tight" asteroids feel: fast rotation, strong
// thrust, heavy drag so momentum bleeds off quickly, and a capped top speed.
export const SHIP_ROTATION_SPEED = 210; // degrees / second
export const SHIP_THRUST = 280; // pixels / second^2
export const SHIP_BRAKE = 0.6; // reverse-thrust fraction on the brake key
export const SHIP_DRAG = 2.4; // velocity damping coefficient (per second)
// Absolute speed clamp. Normal cruise settles ~SHIP_THRUST/SHIP_DRAG via drag;
// this cap only bites while boosting.
export const SHIP_MAX_SPEED = 520;

// Boost (hold Z): huge forward thrust so the ship rockets to the cap; releasing
// lets drag bleed the speed back down naturally.
export const SHIP_BOOST_THRUST = 1500; // pixels / second^2

// Star streaking during high-speed flight.
export const STREAK_THRESHOLD = 140; // speed above which stars begin to streak
export const STREAK_K = 0.07; // streak length per (speed - threshold), game px
export const STREAK_MAX = 46; // max streak length, game px (before depth scaling)

// Screen shake ramps in above this speed, for the "rattling at max velocity" feel.
export const SHAKE_THRESHOLD = 200;
export const SHAKE_MAX = 1.2; // max camera shake amplitude, game px

export const PLANET_COUNT = 7;

// Shared light direction for all planets (points from surface toward the
// light, i.e. up-and-to-the-left). Pre-normalized.
export const LIGHT_DIR_X = -0.7071;
export const LIGHT_DIR_Y = -0.7071;
