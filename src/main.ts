import { Font, Image, Quad } from 'love.graphics';

let shmupSpritesheet: Image;
let playerQuad: Quad;
let font: Font;

const GAME_WIDTH = 128;
const GAME_HEIGHT = 128;
const SCALE = 5;

// Fixed timestep for deterministic physics. Rendering interpolates between
// the previous and current physics states so movement stays smooth on
// displays refreshing faster than the physics rate.
const FIXED_DT = 1 / 60;
// Clamp accumulated time so a hitch (e.g. window drag) can't trigger a
// "spiral of death" of catch-up steps.
const MAX_FRAME_TIME = 0.25;
const INTERPOLATION = true;

let accumulator = 0;

const player = {
  direction: {
    x: 0,
    y: 0,
  },
  position: {
    x: GAME_WIDTH / 2 - 4,
    y: GAME_HEIGHT / 2 - 4,
  },
  // Physics state from the previous fixed step, used to interpolate the
  // rendered position.
  previousPosition: {
    x: GAME_WIDTH / 2 - 4,
    y: GAME_HEIGHT / 2 - 4,
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

const lerp = (from: number, to: number, alpha: number) =>
  from + (to - from) * alpha;

// Advance the simulation by one fixed step.
const fixedUpdate = (dt: number) => {
  player.direction.x = 0;
  player.direction.y = 0;

  if (love.keyboard.isDown('left')) {
    player.direction.x = -1;
  }

  if (love.keyboard.isDown('right')) {
    player.direction.x = 1;
  }

  if (love.keyboard.isDown('up')) {
    player.direction.y = -1;
  }

  if (love.keyboard.isDown('down')) {
    player.direction.y = 1;
  }

  player.position.x += player.direction.x * player.velocity.x * dt;
  player.position.y += player.direction.y * player.velocity.y * dt;

  // Keep the sprite fully on screen.
  const maxX = GAME_WIDTH - player.sprite.frame.width;
  const maxY = GAME_HEIGHT - player.sprite.frame.height;

  if (player.position.x < 0) {
    player.position.x = 0;
  } else if (player.position.x > maxX) {
    player.position.x = maxX;
  }

  if (player.position.y < 0) {
    player.position.y = 0;
  } else if (player.position.y > maxY) {
    player.position.y = maxY;
  }
};

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

  const [content, error] = love.filesystem.read('res/index.txt');

  if (error != null) {
    print(error);
  } else {
    print(content);
  }

  font = love.graphics.newFont('res/font/pico-8.ttf', 5);

  shmupSpritesheet = love.graphics.newImage('res/images/shmup.png');
  playerQuad = love.graphics.newQuad(
    player.sprite.frame.sourceX,
    player.sprite.frame.sourceY,
    player.sprite.frame.width,
    player.sprite.frame.height,
    shmupSpritesheet.getWidth(),
    shmupSpritesheet.getHeight(),
  );
};

love.update = (dt) => {
  if (love.keyboard.isDown('escape')) {
    love.event.quit();
  }

  accumulator += Math.min(dt, MAX_FRAME_TIME);

  while (accumulator >= FIXED_DT) {
    player.previousPosition.x = player.position.x;
    player.previousPosition.y = player.position.y;

    fixedUpdate(FIXED_DT);

    accumulator -= FIXED_DT;
  }
};

love.draw = () => {
  const alpha = INTERPOLATION ? accumulator / FIXED_DT : 1;

  const renderX = lerp(player.previousPosition.x, player.position.x, alpha);
  const renderY = lerp(player.previousPosition.y, player.position.y, alpha);

  // Static UI is drawn in game space, scaled up as a whole.
  love.graphics.push();
  love.graphics.scale(SCALE, SCALE);

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

  love.graphics.pop();

  // Scale the sprite up and floor the position to whole *screen* pixels. This
  // gives movement a 1/SCALE game-pixel granularity while keeping the sprite's
  // own pixels crisp — the key to smooth low-speed motion without shimmer.
  // Drawn last so the ship renders on top of the UI, as before.
  love.graphics.setColor(1, 1, 1, 1);
  love.graphics.draw(
    shmupSpritesheet,
    playerQuad,
    Math.floor(renderX * SCALE),
    Math.floor(renderY * SCALE),
    0,
    SCALE,
    SCALE,
  );
};
