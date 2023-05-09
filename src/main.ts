import { Font, Image } from 'love.graphics';

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

  love.graphics.draw(
    shmupSpritesheet,
    love.graphics.newQuad(
      player.sprite.frame.sourceX,
      player.sprite.frame.sourceY,
      player.sprite.frame.width,
      player.sprite.frame.height,
      shmupSpritesheet.getWidth(),
      shmupSpritesheet.getHeight(),
    ),
    player.position.x,
    player.position.y,
  );
};
