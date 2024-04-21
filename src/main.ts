import { Font, Image } from 'love.graphics';
import { World } from 'objecs';
import { Entity } from './entity.js';
import { renderingSystemFactory } from './systems/rendering-system.js';
import { playerSystemFactory } from './systems/update/player-system.js';

let shmupSpritesheet: Image;
let font: Font;

const scale = {
  x: 1,
  y: 1,
};
const GAME_WIDTH = 128;
const GAME_HEIGHT = 128;
const SCALE = 5;

const player = {
  direction: {
    x: 0,
    y: 0,
  },
  position: {
    x: 0,
    y: 0,
  },
  sprite: {
    frame: {
      sourceX: 16,
      sourceY: 0,
      width: 8,
      height: 8,
    },
  },
  velocity: {
    x: 60,
    y: 60,
  },
};

const world = new World<Entity>();

world.createEntity(player);

const playerSystem = playerSystemFactory(world);
const renderingSystem = renderingSystemFactory(world, love.graphics);

love.load = () => {
  love.window.setTitle('Cherry Bomb');

  const version = love.getVersion();
  print(
    `LOVE version: ${version[0]}.${version[1]}.${version[2]} - ${version[3]}`,
  );

  love.window.setMode(GAME_WIDTH * SCALE, GAME_HEIGHT * SCALE, {
    fullscreen: false,
    vsync: true,
    minwidth: GAME_WIDTH,
    minheight: GAME_HEIGHT,
  });

  love.graphics.setBackgroundColor(0, 0, 0);
  // Preserve the "pixelated" look
  love.graphics.setDefaultFilter('nearest', 'nearest');

  scale.x = love.graphics.getWidth() / GAME_WIDTH;
  scale.y = love.graphics.getHeight() / GAME_HEIGHT;

  const [content, error] = love.filesystem.read('res/index.txt');

  if (error != null) {
    print(error);
  } else {
    print(content);
  }

  font = love.graphics.newFont('res/font/pico-8.ttf', 5);

  shmupSpritesheet = love.graphics.newImage('res/images/shmup.png');
};

love.update = (dt) => {
  if (love.keyboard.isDown('escape')) {
    love.event.quit();
  }

  playerSystem(dt);
};

love.draw = () => {
  love.graphics.scale(scale.x, scale.y);
  love.graphics.setColor(1, 1, 1, 1);

  love.graphics.circle('fill', 100, 100, 4);

  love.graphics.setFont(font);
  love.graphics.print(
    // Red text
    [[1, 0, 0, 1], 'Hello from TypeScript!'],
    GAME_WIDTH / 2 - 50,
    GAME_HEIGHT / 2,
  );

  love.graphics.print(`Current FPS: ${love.timer.getFPS()}`, 10, 10);

  renderingSystem();
};
