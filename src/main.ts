import { Canvas, Font } from 'love.graphics';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FIXED_DT,
  GAME_HEIGHT,
  GAME_WIDTH,
  MAX_FRAME_TIME,
  SCALE,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './game/constants';
import { applyCrt, initCrt } from './game/crt';
import { Entity } from './game/entity';
import { createShip, populateWorld } from './game/factories';
import { SPACE_COLOR } from './game/palette';
import {
  getShip,
  initQueries,
  particleSystem,
  pulseSystem,
  renderSystem,
  setShipSprite,
  shipSystem,
} from './game/systems';
import { World } from './lib/objecs/world';

const WINDOW_WIDTH = GAME_WIDTH * SCALE;
const WINDOW_HEIGHT = GAME_HEIGHT * SCALE;

let world: World<Entity>;
let canvas: Canvas;
let sceneCanvas: Canvas;
let font: Font;

let accumulator = 0;
let elapsed = 0;
// Effects are toggleable at runtime so their effect can be felt.
let interpolation = true;
let subpixel = true;
let crt = true;

love.load = () => {
  love.window.setTitle('objecs • space drift');

  love.window.setMode(GAME_WIDTH * SCALE, GAME_HEIGHT * SCALE, {
    fullscreen: false,
    vsync: true,
    minwidth: GAME_WIDTH,
    minheight: GAME_HEIGHT,
  });

  love.graphics.setBackgroundColor(SPACE_COLOR[0], SPACE_COLOR[1], SPACE_COLOR[2]);
  love.graphics.setDefaultFilter('nearest', 'nearest');

  font = love.graphics.newFont('res/font/pico-8.ttf', 5);

  canvas = love.graphics.newCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  canvas.setFilter('nearest', 'nearest');

  // Full-resolution canvas holding the composited scene + HUD, fed to the
  // CRT/bloom post-process.
  sceneCanvas = love.graphics.newCanvas(WINDOW_WIDTH, WINDOW_HEIGHT);
  sceneCanvas.setFilter('nearest', 'nearest');
  initCrt(WINDOW_WIDTH, WINDOW_HEIGHT);

  // The player ship sprite (8x8 quad from the shmup sheet).
  const shipSheet = love.graphics.newImage('res/images/shmup.png');
  const shipFrameW = 8;
  const shipFrameH = 8;
  const shipQuad = love.graphics.newQuad(
    16,
    0,
    shipFrameW,
    shipFrameH,
    shipSheet.getWidth(),
    shipSheet.getHeight(),
  );
  setShipSprite(shipSheet, shipQuad, shipFrameW, shipFrameH);

  world = new World<Entity>();
  createShip(world, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
  populateWorld(world);
  initQueries(world);
};

love.update = (dt) => {
  if (love.keyboard.isDown('escape')) {
    love.event.quit();
  }

  accumulator += Math.min(dt, MAX_FRAME_TIME);

  while (accumulator >= FIXED_DT) {
    shipSystem(FIXED_DT);
    particleSystem(FIXED_DT);
    accumulator -= FIXED_DT;
  }

  // Cosmetic pulsing advances on the real frame delta.
  pulseSystem(dt);

  elapsed += dt;
};

love.keypressed = (key) => {
  if (key === 'i') {
    interpolation = !interpolation;
  } else if (key === 'p') {
    subpixel = !subpixel;
  } else if (key === 'c') {
    crt = !crt;
  }
};

function drawHud() {
  const ship = getShip();
  const speed = Math.floor(
    Math.sqrt(
      ship.velocity.x * ship.velocity.x + ship.velocity.y * ship.velocity.y,
    ),
  );

  love.graphics.push();
  love.graphics.scale(SCALE, SCALE);
  love.graphics.setFont(font);

  love.graphics.setColor(1, 1, 1, 1);
  love.graphics.print(`fps ${love.timer.getFPS()}`, 3, 3);
  love.graphics.print(`spd ${speed}`, 3, 11);

  love.graphics.setColor(1, 1, 1, interpolation ? 1 : 0.45);
  love.graphics.print(`[i] interp ${interpolation ? 'on' : 'off'}`, 3, GAME_HEIGHT - 27);
  love.graphics.setColor(1, 1, 1, subpixel ? 1 : 0.45);
  love.graphics.print(`[p] subpix ${subpixel ? 'on' : 'off'}`, 3, GAME_HEIGHT - 19);
  love.graphics.setColor(1, 1, 1, crt ? 1 : 0.45);
  love.graphics.print(`[c] crt ${crt ? 'on' : 'off'}`, 3, GAME_HEIGHT - 11);

  love.graphics.pop();
}

love.draw = () => {
  const alpha = interpolation ? accumulator / FIXED_DT : 1;

  // Composite the scene + HUD into the scene canvas (renderSystem leaves it as
  // the active target).
  renderSystem(canvas, sceneCanvas, interpolation, subpixel, alpha);
  drawHud();
  love.graphics.setCanvas();

  // Post-process (or pass the scene straight through when CRT is off).
  if (crt) {
    applyCrt(sceneCanvas, elapsed);
  } else {
    love.graphics.setColor(1, 1, 1, 1);
    love.graphics.draw(sceneCanvas, 0, 0);
  }
};
