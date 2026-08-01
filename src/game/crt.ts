import { Canvas, Shader } from 'love.graphics';

// Bright-pass: keep only the portion of each pixel above a luminance threshold.
const BRIGHT_SHADER = `
  extern number threshold;
  vec4 effect(vec4 color, Image tex, vec2 tc, vec2 sc) {
    vec4 c = Texel(tex, tc);
    float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    float k = max(l - threshold, 0.0) / max(l, 0.0001);
    return vec4(c.rgb * k, 1.0);
  }
`;

// Separable 5-tap gaussian; `dir` is the per-pixel step in one axis.
const BLUR_SHADER = `
  extern vec2 dir;
  vec4 effect(vec4 color, Image tex, vec2 tc, vec2 sc) {
    vec3 sum = Texel(tex, tc).rgb * 0.2270270270;
    sum += Texel(tex, tc + dir * 1.3846153846).rgb * 0.3162162162;
    sum += Texel(tex, tc - dir * 1.3846153846).rgb * 0.3162162162;
    sum += Texel(tex, tc + dir * 3.2307692308).rgb * 0.0702702703;
    sum += Texel(tex, tc - dir * 3.2307692308).rgb * 0.0702702703;
    return vec4(sum, 1.0);
  }
`;

// Final CRT composite: curvature, chromatic aberration, additive bloom,
// scanlines, vignette, and a faint flicker.
const CRT_SHADER = `
  extern Image bloomTex;
  extern number bloomIntensity;
  extern number time;
  extern vec2 resolution;
  extern number curvature;
  extern number scanline;
  extern number aberration;
  extern number vignette;

  vec2 curve(vec2 uv) {
    uv = uv * 2.0 - 1.0;
    vec2 o = abs(uv.yx) / vec2(curvature, curvature);
    uv = uv + uv * o * o;
    return uv * 0.5 + 0.5;
  }

  vec4 effect(vec4 color, Image tex, vec2 tc, vec2 sc) {
    vec2 uv = curvature > 0.0 ? curve(tc) : tc;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      return vec4(0.0, 0.0, 0.0, 1.0);
    }

    vec2 center = uv - 0.5;
    float ab = aberration * dot(center, center);
    vec3 col;
    col.r = Texel(tex, uv + center * ab).r;
    col.g = Texel(tex, uv).g;
    col.b = Texel(tex, uv - center * ab).b;

    // Additive bloom.
    col += Texel(bloomTex, uv).rgb * bloomIntensity;

    // Scanlines.
    float s = 0.5 + 0.5 * sin(uv.y * resolution.y * 3.14159265);
    col *= 1.0 - scanline * s;

    // Vignette.
    col *= clamp(1.0 - vignette * dot(center, center), 0.0, 1.0);

    // Faint flicker.
    col *= 1.0 + 0.015 * sin(time * 8.0);

    return vec4(col, 1.0) * color;
  }
`;

let brightShader!: Shader;
let blurShader!: Shader;
let crtShader!: Shader;
let bloomA!: Canvas;
let bloomB!: Canvas;
let bloomW = 0;
let bloomH = 0;

export function initCrt(width: number, height: number) {
  brightShader = love.graphics.newShader(BRIGHT_SHADER);
  blurShader = love.graphics.newShader(BLUR_SHADER);
  crtShader = love.graphics.newShader(CRT_SHADER);

  bloomW = Math.floor(width / 4);
  bloomH = Math.floor(height / 4);
  bloomA = love.graphics.newCanvas(bloomW, bloomH);
  bloomA.setFilter('linear', 'linear');
  bloomB = love.graphics.newCanvas(bloomW, bloomH);
  bloomB.setFilter('linear', 'linear');

  brightShader.send('threshold', 0.62);
  crtShader.send('resolution', [width, height]);
  crtShader.send('bloomIntensity', 0.9);
  crtShader.send('curvature', 9.0);
  crtShader.send('scanline', 0.12);
  crtShader.send('aberration', 0.012);
  crtShader.send('vignette', 0.32);
}

/** Post-process `scene` to the screen: bloom (bright → blur H → blur V), then
 * the CRT composite. `drawGlow`, if given, injects extra bloom contributors
 * (e.g. the ship) into the bloom canvas regardless of the brightness threshold;
 * it receives the scene→bloom scale factor. */
export function applyCrt(
  scene: Canvas,
  time: number,
  drawGlow?: (bloomScale: number) => void,
) {
  const sceneW = scene.getWidth();
  const sceneH = scene.getHeight();
  const bloomScale = bloomW / sceneW;

  // 1. Bright-pass, downsampled to quarter resolution.
  love.graphics.setCanvas(bloomA);
  love.graphics.clear(0, 0, 0, 1);
  love.graphics.setShader(brightShader);
  love.graphics.setColor(1, 1, 1, 1);
  love.graphics.draw(scene, 0, 0, 0, bloomScale, bloomH / sceneH);

  // 1b. Extra glow sources (e.g. the ship) added straight into the bloom,
  // additively and without the threshold, so they always glow.
  if (drawGlow !== undefined) {
    love.graphics.setShader();
    love.graphics.setBlendMode('add');
    drawGlow(bloomScale);
    love.graphics.setBlendMode('alpha');
  }

  // 2. Blur horizontally, then vertically (ping-pong).
  love.graphics.setColor(1, 1, 1, 1);
  love.graphics.setShader(blurShader);
  love.graphics.setCanvas(bloomB);
  love.graphics.clear(0, 0, 0, 1);
  blurShader.send('dir', [1.0 / bloomW, 0.0]);
  love.graphics.draw(bloomA, 0, 0);

  love.graphics.setCanvas(bloomA);
  love.graphics.clear(0, 0, 0, 1);
  blurShader.send('dir', [0.0, 1.0 / bloomH]);
  love.graphics.draw(bloomB, 0, 0);

  // 3. Final CRT composite to the screen.
  love.graphics.setCanvas();
  love.graphics.setShader(crtShader);
  crtShader.send('bloomTex', bloomA);
  crtShader.send('time', time);
  love.graphics.setColor(1, 1, 1, 1);
  love.graphics.draw(scene, 0, 0);
  love.graphics.setShader();
}
