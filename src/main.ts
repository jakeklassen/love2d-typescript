let megamanSpritesheet: Image;
let megaman: Quad;

const scale = {
  x: 1,
  y: 1,
};
const GAME_WIDTH = 512;
const GAME_HEIGHT = 288;

love.load = args => {
  love.window.setMode(GAME_WIDTH * 3, GAME_HEIGHT * 3, {
    vsync: true,
    fullscreen: false,
    minwidth: GAME_WIDTH,
    minheight: GAME_HEIGHT,
  });

  love.graphics.setBackgroundColor(0, 0, 0);
  // Preserve the NES "pixelated" look
  love.graphics.setDefaultFilter("nearest", "nearest");

  scale.x = love.graphics.getWidth() / GAME_WIDTH;
  scale.y = love.graphics.getHeight() / GAME_HEIGHT;

  const [content, error] = love.filesystem.read("res/index.txt");
  print(content);
  print(error);

  megamanSpritesheet = love.graphics.newImage("res/images/megaman.png");
  megaman = love.graphics.newQuad(
    0,
    0,
    32,
    32,
    ...megamanSpritesheet.getDimensions()
  );
};

love.update = dt => {};

love.draw = () => {
  love.graphics.scale(scale.x, scale.y);
  love.graphics.setColor(1, 1, 1, 1);

  love.graphics.print(
    "Hello from TypeScript!",
    GAME_WIDTH / 2 - 50,
    GAME_HEIGHT / 2
  );
  love.graphics.draw(megamanSpritesheet, megaman, 100, 100, 0, 1, 1, 0, 32);
};
