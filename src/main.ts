import { Animator } from "./lib/animator";
import { SpriteSheet } from "./lib/spritesheet";
import { Animation } from "./lib/animation";

let megamanSpritesheet: SpriteSheet;

const scale = {
  x: 1,
  y: 1,
};
const GAME_WIDTH = 512;
const GAME_HEIGHT = 288;

const animator = new Animator();

love.load = args => {
  const version = love.getVersion();
  print(
    `LOVE version: ${version[0]}.${version[1]}.${version[2]} - ${version[3]}`
  );

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

  const megamanSheetImage = love.graphics.newImage("res/images/megaman.png");
  megamanSpritesheet = new SpriteSheet(megamanSheetImage, 32, 32);

  animator.addAnimation(
    "idle",
    new Animation(
      [
        megamanSpritesheet.getFrame(1, 5),
        megamanSpritesheet.getFrame(1, 4),
        megamanSpritesheet.getFrame(1, 5),
        megamanSpritesheet.getFrame(1, 6),
      ],
      6,
      true
    )
  );

  animator.play("idle");
};

love.update = dt => {
  animator.update(dt);
};

love.draw = () => {
  love.graphics.scale(scale.x, scale.y);
  love.graphics.setColor(1, 1, 1, 1);

  love.graphics.print(
    "Hello from TypeScript!",
    GAME_WIDTH / 2 - 50,
    GAME_HEIGHT / 2
  );

  love.graphics.print(`Current FPS: ${love.timer.getFPS()}`, 10, 10);

  love.graphics.draw(
    megamanSpritesheet.texture,
    animator.getCurrentAnimation()!.getCurrentFrame(),
    228,
    100
  );

  love.graphics.draw(
    megamanSpritesheet.texture,
    megamanSpritesheet.getFrame(1, 5),
    100,
    100
  );

  love.graphics.draw(
    megamanSpritesheet.texture,
    megamanSpritesheet.getFrame(1, 4),
    132,
    100
  );

  love.graphics.draw(
    megamanSpritesheet.texture,
    megamanSpritesheet.getFrame(1, 5),
    164,
    100
  );

  love.graphics.draw(
    megamanSpritesheet.texture,
    megamanSpritesheet.getFrame(1, 6),
    196,
    100
  );
};
