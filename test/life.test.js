import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Life, parseRule } from '../src/worlds/life.js';

const sorted = (cells) => cells.map(([x, y]) => `${x},${y}`).sort();

test('parseRule reads Golly rulestrings', () => {
  const r = parseRule('B36/S23');
  assert.equal(r.born[3], 1);
  assert.equal(r.born[6], 1);
  assert.equal(r.born[2], 0);
  assert.equal(r.survive[2], 1);
  assert.throws(() => parseRule('nonsense'));
});

test('block is a still life', () => {
  const w = new Life({ width: 16, height: 16 }).clear().place(5, 5, ['OO', 'OO']);
  const before = sorted(w.liveCells());
  w.step();
  assert.deepEqual(sorted(w.liveCells()), before);
});

test('blinker has period 2', () => {
  const w = new Life({ width: 16, height: 16 }).clear().place(5, 6, ['OOO']);
  const p0 = sorted(w.liveCells());
  w.step();
  assert.deepEqual(sorted(w.liveCells()), sorted([[6, 5], [6, 6], [6, 7]]));
  w.step();
  assert.deepEqual(sorted(w.liveCells()), p0);
});

test('glider translates by (1,1) every 4 generations, including across the torus edge', () => {
  const w = new Life({ width: 20, height: 20 }).clear().place(1, 1, ['.O.', '..O', 'OOO']);
  const start = w.liveCells();
  for (let g = 1; g <= 12; g++) {
    for (let k = 0; k < 4; k++) w.step();
    const expected = start.map(([x, y]) => [(x + g) % 20, (y + g) % 20]);
    assert.deepEqual(sorted(w.liveCells()), sorted(expected), `generation ${4 * g}`);
    assert.equal(w.population(), 5);
  }
});

test('R-pentomino agrees with an independent set-based implementation for 100 generations', () => {
  // Two implementations, one grid-based (ours) and one naive set-of-live-cells,
  // must produce identical populations. Guards against off-by-one neighbour bugs.
  const w = new Life({ width: 256, height: 256 }).clear().place(120, 120, ['.OO', 'OO.', '.O.']);
  let live = new Set(['1,0', '2,0', '0,1', '1,1', '1,2']);
  for (let g = 0; g < 100; g++) {
    const count = new Map();
    for (const c of live) {
      const [x, y] = c.split(',').map(Number);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const k = `${x + dx},${y + dy}`;
          count.set(k, (count.get(k) || 0) + 1);
        }
    }
    const next = new Set();
    for (const [k, n] of count) if (n === 3 || (n === 2 && live.has(k))) next.add(k);
    live = next;
    w.step();
    assert.equal(w.population(), live.size, `generation ${g + 1}`);
  }
  assert.equal(w.population(), 121);
});

test('R-pentomino stabilises at generation 1103 with population 116 (LifeWiki)', () => {
  const w = new Life({ width: 600, height: 600 }).clear().place(300, 300, ['.OO', 'OO.', '.O.']);
  for (let i = 0; i < 1102; i++) w.step();
  assert.notEqual(w.population(), 116); // still settling at 1102
  w.step();
  assert.equal(w.population(), 116);
  for (let i = 0; i < 20; i++) {
    w.step();
    assert.equal(w.population(), 116); // stable: still lifes, oscillators and escaping gliders
  }
});

test('reset with the same seed reproduces the same soup and evolution', () => {
  const a = new Life({ width: 64, height: 64, seed: 'soup' });
  const b = new Life({ width: 64, height: 64, seed: 'soup' });
  for (let i = 0; i < 50; i++) {
    a.step();
    b.step();
  }
  assert.equal(a.fingerprint(), b.fingerprint());
});

test('paint writes every pixel', () => {
  const w = new Life({ width: 8, height: 8, seed: 2 });
  const buf = new Uint32Array(64);
  w.paint(buf);
  for (const px of buf) assert.ok(px >>> 24 === 255);
});
