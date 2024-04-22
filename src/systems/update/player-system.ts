import { World } from '../../lib/ecs/world.js';
import { Entity } from '../../entity.js';

export function playerSystemFactory(world: World<Entity>) {
  const players = world.archetype(
    'tagPlayer',
    'direction',
    'position',
    'velocity',
  );

  return function playerSystem(dt: number) {
    for (const player of players.entities) {
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
    }
  };
}
