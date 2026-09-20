/**
 * Gray-Scott reaction-diffusion.
 *
 * Two chemicals on the torus. U is fed in at rate f and converted to V by
 * the autocatalytic reaction U + 2V -> 3V; V is removed at rate f + k. Both
 * diffuse, U twice as fast as V. Depending on (f, k) the system produces
 * spots that divide like cells, stripes, worms, waves, or nothing at all.
 * Pearson (Science, 1993) mapped the regimes; the presets are his.
 *
 *   U += Du ∇²U − U V² + f (1 − U)
 *   V += Dv ∇²V + U V² − (f + k) V
 *
 * Explicit Euler with a five-point Laplacian, several substeps per world
 * step so that one step at 6 steps/s is a visible change. Du = 0.21 and
 * Dv = 0.105 are Pearson's diffusion coefficients expressed for a unit time
 * step on his grid spacing (2e-5 / 0.0098² and half that); 0.21 < 0.25 keeps
 * the explicit scheme stable.
 *
 * Ground truth used by the tests:
 *   (U, V) = (1, 0) is an exact fixed point.
 *   With f = k = 0 the reaction only converts U to V, so Σ(U + V) is conserved.
 *   A uniform small V on U = 1 decays as (1 − (f + k)) per substep.
 *   The stencil is symmetric, so symmetric initial data stays symmetric.
 */

import { makeRng, hashBytes } from '../rng.js';
import { rgba, clamp01 } from '../world.js';

export const PRESETS = Object.freeze({
  spots: { f: 0.03, k: 0.062, name: 'Spots', hue: 200 },
  coral: { f: 0.055, k: 0.062, name: 'Coral', hue: 20 },
  mitosis: { f: 0.028, k: 0.062, name: 'Mitosis', hue: 300 },
  worms: { f: 0.078, k: 0.061, name: 'Worms', hue: 90 },
  waves: { f: 0.014, k: 0.045, name: 'Waves', hue: 170 },
});

export class GrayScott {
  constructor({ width = 160, height = 160, preset = 'spots', f, k, Du = 0.21, Dv = 0.105, substeps = 8, seed = 1, seedSquares = 12 } = {}) {
    this.width = width;
    this.height = height;
    const p = PRESETS[preset] ?? PRESETS.spots;
    this.preset = PRESETS[preset] ? preset : 'spots';
    this.f = f ?? p.f;
    this.k = k ?? p.k;
    this.Du = Du;
    this.Dv = Dv;
    this.substeps = substeps;
    this.seedSquares = seedSquares;
    const n = width * height;
    this.U = new Float32Array(n);
    this.V = new Float32Array(n);
    this.U2 = new Float32Array(n);
    this.V2 = new Float32Array(n);
    this.reset(seed);
  }

  setPreset(name) {
    const p = PRESETS[name];
    if (!p) throw new Error(`Unknown preset: ${name}`);
    this.preset = name;
    this.f = p.f;
    this.k = p.k;
    return this;
  }

  reset(seed = 1) {
    this.seed = seed;
    this.rng = makeRng(seed);
    this.tick = 0;
    this.U.fill(1);
    this.V.fill(0);
    // Pearson-style seeding: a handful of small squares of the mixed state
    for (let s = 0; s < this.seedSquares; s++) {
      const cx = this.rng.int(this.width);
      const cy = this.rng.int(this.height);
      const r = 2 + this.rng.int(4);
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const i = ((cy + dy + this.height) % this.height) * this.width + ((cx + dx + this.width) % this.width);
          this.U[i] = 0.5 + 0.02 * (this.rng.next() - 0.5);
          this.V[i] = 0.25 + 0.02 * (this.rng.next() - 0.5);
        }
    }
    return this;
  }

  /** One explicit Euler substep. Exported as a method for the tests. */
  substep() {
    const { width, height, U, V, U2, V2, Du, Dv, f, k } = this;
    const fk = f + k;
    for (let y = 0; y < height; y++) {
      const yu = ((y - 1 + height) % height) * width;
      const yd = ((y + 1) % height) * width;
      const yc = y * width;
      for (let x = 0; x < width; x++) {
        const xl = (x - 1 + width) % width;
        const xr = (x + 1) % width;
        const i = yc + x;
        const u = U[i];
        const v = V[i];
        const lu = U[yu + x] + U[yd + x] + U[yc + xl] + U[yc + xr] - 4 * u;
        const lv = V[yu + x] + V[yd + x] + V[yc + xl] + V[yc + xr] - 4 * v;
        const uvv = u * v * v;
        U2[i] = u + Du * lu - uvv + f * (1 - u);
        V2[i] = v + Dv * lv + uvv - fk * v;
      }
    }
    this.U = U2;
    this.U2 = U;
    this.V = V2;
    this.V2 = V;
  }

  step() {
    for (let s = 0; s < this.substeps; s++) this.substep();
    this.tick++;
    return this;
  }

  stats() {
    let su = 0;
    let sv = 0;
    let vmax = 0;
    for (let i = 0; i < this.V.length; i++) {
      su += this.U[i];
      sv += this.V[i];
      if (this.V[i] > vmax) vmax = this.V[i];
    }
    return { tick: this.tick, meanU: su / this.U.length, meanV: sv / this.V.length, maxV: vmax, f: this.f, k: this.k };
  }

  fingerprint() {
    return hashBytes(this.U, this.V);
  }

  /**
   * Paint: V on a one-hue sequential ramp from near-black to a bright tint
   * chosen per preset; where U is high and V absent, a very faint warm
   * counter-tint so the empty medium is not pure black.
   */
  paint(u32) {
    const { U, V } = this;
    const hue = PRESETS[this.preset].hue;
    const [hr, hg, hb] = hueRgb(hue);
    for (let i = 0; i < V.length; i++) {
      const v = clamp01(V[i] * 2.8);
      const t = v * v * (3 - 2 * v);
      const u = clamp01(U[i]);
      const r = 8 + 10 * u + (215 * hr + 30) * t;
      const g = 9 + 6 * u + (215 * hg + 30) * t;
      const b = 12 + 4 * u + (215 * hb + 30) * t;
      u32[i] = rgba(Math.min(255, r | 0), Math.min(255, g | 0), Math.min(255, b | 0));
    }
  }
}

function hueRgb(h) {
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((hp % 2) - 1);
  if (hp < 1) return [1, x, 0];
  if (hp < 2) return [x, 1, 0];
  if (hp < 3) return [0, 1, x];
  if (hp < 4) return [0, x, 1];
  if (hp < 5) return [x, 0, 1];
  return [1, 0, x];
}

export function createGrayScott(options) {
  return new GrayScott(options);
}
