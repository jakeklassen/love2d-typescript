import { RGBA } from 'love.math';

/**
 * Implementation of the PICO-8 `circfill` function
 */
export function fillCircle(
  graphics: typeof import('love.graphics'),
  x: number,
  y: number,
  radius: number,
  color: RGBA,
) {
  let x1 = 0;
  let y1 = radius;
  let diameter = 3 - 2 * radius;

  while (x1 <= y1) {
    // Draw horizontal lines of the circle
    for (let i = -x1; i <= x1; i++) {
      graphics.setColor(color);
      graphics.rectangle('fill', x + i, y + y1, 1, 1);
      graphics.rectangle('fill', x + i, y - y1, 1, 1);
    }

    // Draw vertical lines of the circle
    for (let i = -y1; i <= y1; i++) {
      graphics.setColor(color);
      graphics.rectangle('fill', x + i, y + x1, 1, 1);
      graphics.rectangle('fill', x + i, y - x1, 1, 1);
    }

    if (diameter < 0) {
      diameter = diameter + 4 * x1 + 6;
    } else {
      diameter = diameter + 4 * (x1 - y1) + 10;
      y1--;
    }

    x1++;
  }
}

/**
 * Implementation of the PICO-8 `circ` function
 */
export function circ(
  graphics: typeof import('love.graphics'),
  x: number,
  y: number,
  radius: number,
  color: RGBA,
) {
  let x1 = 0;
  let y1 = radius;
  let diameter = 3 - 2 * radius;

  while (x1 <= y1) {
    // Plot points along the circumference of the circle
    graphics.setColor(color);
    graphics.rectangle('fill', x + x1, y + y1, 1, 1);
    graphics.rectangle('fill', x - x1, y + y1, 1, 1);
    graphics.rectangle('fill', x + x1, y - y1, 1, 1);
    graphics.rectangle('fill', x - x1, y - y1, 1, 1);
    graphics.rectangle('fill', x + y1, y + x1, 1, 1);
    graphics.rectangle('fill', x - y1, y + x1, 1, 1);
    graphics.rectangle('fill', x + y1, y - x1, 1, 1);
    graphics.rectangle('fill', x - y1, y - x1, 1, 1);

    if (diameter < 0) {
      diameter = diameter + 4 * x1 + 6;
    } else {
      diameter = diameter + 4 * (x1 - y1) + 10;
      y1--;
    }

    x1++;
  }
}
