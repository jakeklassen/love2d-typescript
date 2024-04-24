import type { Entity } from '../entity';
import { World } from '../lib/ecs/world';

export function renderingSystemFactory(world: World<Entity>) {
  const spriteSheet = love.graphics.newImage('res/images/shmup.png');
  const renderables = world.archetype('position', 'sprite');

  return function renderingSystem() {
    for (const entity of renderables.entities) {
      love.graphics.draw(
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
