/**
 * Life-like cellular automata ("B3/S23" and friends).
 *
 * Synchronous, 2D, two states, Moore neighbourhood, toroidal. A rulestring
 * Bx/Sy says a dead cell is Born with x live neighbours and a live cell
 * Survives with y live neighbours (Golly / LifeWiki notation).
 *
 * This world exists for two reasons. It is a second, very different family
 * for the page, and it gives the test suite classical ground truth: gliders
 * translate by (1, 1) every 4 generations, blinkers have period 2, blocks
 * are still lifes. If those fail, the grid arithmetic is wrong.
 */

import { makeRng, hashBytes } from '../rng.js';
import { hsl, rgba } from '../world.js';

export function parseRule(rule = 'B3/S23') {
  const m = /^B(\d*)\/S(\d*)$/i.exec(rule.trim());
  if (!m) throw new Error(`Bad rulestring: ${rule}`);
  const born = new Uint8Array(9);
  const survive = new Uint8Array(9);
  for (const c of m[1]) born[+c] = 1;
  for (const c of m[2]) survive[+c] = 1;
  return { born, survive, rule: `B${m[1]}/S${m[2]}` };
}

export class Life {
  constructor({ width = 128, height = 128, rule = 'B3/S23', density = 0.35, seed = 1 } = {}) {
    this.width = width;
    this.height = height;
    this.density = density;
    this.setRule(rule);
    this.cells = new Uint8Array(width * height);
    this.next = new Uint8Array(width * height);
    this.ageMap = new Uint16Array(width * height);
    this.reset(seed);
  }

  setRule(rule) {
    const r = parseRule(rule);
    this.born = r.born;
    this.survive = r.survive;
    this.rule = r.rule;
  }

  reset(seed = 1) {
    this.seed = seed;
    this.rng = makeRng(seed);
    this.tick = 0;
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] = this.rng.next() < this.density ? 1 : 0;
      this.ageMap[i] = 0;
    }
    return this;
  }

  clear() {
    this.cells.fill(0);
    this.ageMap.fill(0);
    this.tick = 0;
    return this;
  }

  set(x, y, v = 1) {
    this.cells[((y + this.height) % this.height) * this.width + ((x + this.width) % this.width)] = v;
  }

  get(x, y) {
    return this.cells[((y + this.height) % this.height) * this.width + ((x + this.width) % this.width)];
  }

  /** Place a pattern given as rows of '.' and 'O' with top-left at (x, y). */
  place(x, y, pattern) {
    pattern.forEach((row, dy) => {
      [...row].forEach((ch, dx) => {
        if (ch === 'O') this.set(x + dx, y + dy, 1);
      });
    });
    return this;
  }

  population() {
    let s = 0;
    for (let i = 0; i < this.cells.length; i++) s += this.cells[i];
    return s;
  }

  /** Set of live coordinates, useful for comparing patterns in tests. */
  liveCells() {
    const out = [];
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) if (this.cells[y * this.width + x]) out.push([x, y]);
    return out;
  }

  step() {
    const { width, height, cells, next, born, survive, ageMap } = this;
    for (let y = 0; y < height; y++) {
      const yu = ((y - 1 + height) % height) * width;
      const yd = ((y + 1) % height) * width;
      const yc = y * width;
      for (let x = 0; x < width; x++) {
        const xl = (x - 1 + width) % width;
        const xr = (x + 1) % width;
        const n =
          cells[yu + xl] + cells[yu + x] + cells[yu + xr] +
          cells[yc + xl] + cells[yc + xr] +
          cells[yd + xl] + cells[yd + x] + cells[yd + xr];
        const i = yc + x;
        const alive = cells[i] ? survive[n] : born[n];
        next[i] = alive;
        ageMap[i] = alive ? Math.min(65535, ageMap[i] + 1) : 0;
      }
    }
    this.cells = next;
    this.next = cells;
    this.tick++;
    return this;
  }

  stats() {
    return { tick: this.tick, population: this.population() };
  }

  fingerprint() {
    return hashBytes(this.cells);
  }

  paint(u32) {
    const { cells, ageMap } = this;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i]) {
        const a = ageMap[i];
        // newborns flash warm, long-lived cells cool toward blue
        u32[i] = a < 2 ? rgba(255, 236, 190) : hsl(200 + Math.min(140, a * 4), 0.7, 0.62 - Math.min(0.3, a * 0.01));
      } else {
        u32[i] = rgba(8, 10, 14);
      }
    }
  }
}

export function createLife(options) {
  return new Life(options);
}
