import { World } from 'objecs';
import { Entity } from '../entity.js';

export function renderingSystemFactory(
  world: World<Entity>,
  graphics: typeof import('love.graphics'),
) {
  const spriteSheet = graphics.newImage('res/images/shmup.png');
  const renderables = world.archetype('position', 'sprite');

  return function renderingSystem() {
    for (const entity of renderables.entities) {
      graphics.draw(
        spriteSheet,
        love.graphics.newQuad(
          entity.sprite.frame.sourceX,
          entity.sprite.frame.sourceY,
          entity.sprite.frame.width,
          entity.sprite.frame.height,
          spriteSheet.getWidth(),
          spriteSheet.getHeight(),
        ),
        entity.position.x,
        entity.position.y,
      );
    }
  };
}
