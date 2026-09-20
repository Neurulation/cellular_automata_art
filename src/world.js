/**
 * The World interface.
 *
 * Every simulation in this project implements the same small contract so the
 * page, the tests and the experiments can treat them interchangeably:
 *
 *   world.width, world.height   grid size in cells
 *   world.tick                  steps taken since reset
 *   world.reset(seed)           deterministic re-initialisation
 *   world.step()                advance one generation
 *   world.stats()               plain object of numbers for charts / tests
 *   world.paint(u32)            write RGBA pixels (one per cell) into a
 *                               Uint32Array of length width*height
 *   world.fingerprint()         hash of the full state, for determinism tests
 *
 * Nothing here touches the DOM. Worlds run identically in Node and in the
 * browser, which is what lets the same code be tested, measured and shown.
 */

/** Toroidal index helper: wraps (x, y) onto the grid. */
export function wrapIndex(x, y, width, height) {
  x = ((x % width) + width) % width;
  y = ((y % height) + height) % height;
  return y * width + x;
}

/** Pack RGBA bytes into the little-endian Uint32 that ImageData expects. */
export function rgba(r, g, b, a = 255) {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/** HSL to [r, g, b] floats in [0, 255]. */
export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** HSL (h in degrees, s and l in [0,1]) to packed RGBA. */
export function hsl(h, s, l, a = 255) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return rgba(
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
    a,
  );
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
