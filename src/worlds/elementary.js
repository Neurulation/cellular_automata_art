/**
 * Wolfram's elementary cellular automata.
 *
 * One-dimensional, two states, nearest-neighbour rule, 256 rules numbered by
 * the Wolfram code: bit k of the rule number is the output for neighbourhood
 * pattern k = (left << 2) | (centre << 1) | right.
 *
 * The world keeps a scrolling history of rows so it paints as a 2D image:
 * time runs downward, like the classic figures in "A New Kind of Science".
 *
 * Ground truth for tests: rule 90 from a single cell is the Sierpinski
 * triangle, i.e. each cell is the XOR of its two neighbours one row up;
 * rule 30's first rows are tabulated in the literature; rule 204 is the
 * identity, rule 0 kills everything, rule 255 fills everything.
 */

import { makeRng, hashBytes } from '../rng.js';
import { hsl, rgba } from '../world.js';

export class Elementary {
  constructor({ width = 256, height = 160, rule = 30, seed = 1, init = 'single' } = {}) {
    this.width = width;
    this.height = height;
    this.rule = rule & 255;
    this.init = init;
    this.rows = new Uint8Array(width * height);
    this.row = new Uint8Array(width);
    this.reset(seed);
  }

  reset(seed = 1) {
    this.seed = seed;
    this.rng = makeRng(seed);
    this.tick = 0;
    this.rows.fill(0);
    this.row.fill(0);
    if (this.init === 'single') this.row[this.width >> 1] = 1;
    else for (let x = 0; x < this.width; x++) this.row[x] = this.rng.next() < 0.5 ? 1 : 0;
    this.rows.set(this.row, 0);
    this.head = 1; // next row index to write
    return this;
  }

  /** Compute the next row from the current one (pure, exported for tests). */
  static nextRow(row, rule, out = new Uint8Array(row.length)) {
    const w = row.length;
    for (let x = 0; x < w; x++) {
      const l = row[(x - 1 + w) % w];
      const c = row[x];
      const r = row[(x + 1) % w];
      out[x] = (rule >> ((l << 2) | (c << 1) | r)) & 1;
    }
    return out;
  }

  step() {
    const next = Elementary.nextRow(this.row, this.rule);
    this.row = next;
    if (this.head < this.height) {
      this.rows.set(next, this.head * this.width);
      this.head++;
    } else {
      // scroll up one row
      this.rows.copyWithin(0, this.width);
      this.rows.set(next, (this.height - 1) * this.width);
    }
    this.tick++;
    return this;
  }

  currentRow() {
    return this.row;
  }

  stats() {
    let s = 0;
    for (let x = 0; x < this.width; x++) s += this.row[x];
    return { tick: this.tick, density: s / this.width };
  }

  fingerprint() {
    return hashBytes(this.row);
  }

  paint(u32) {
    const { rows, width, height } = this;
    for (let y = 0; y < height; y++) {
      const fade = 0.55 + 0.45 * (y / height);
      const on = hsl(28 + 40 * (y / height), 0.9, 0.6 * fade + 0.1);
      const off = rgba(10, 9, 12);
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        u32[i] = rows[i] ? on : off;
      }
    }
  }
}

export function createElementary(options) {
  return new Elementary(options);
}
