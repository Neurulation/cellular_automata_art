import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Elementary } from '../src/worlds/elementary.js';

const rowString = (row) => Array.from(row, (v) => (v ? '#' : '.')).join('');

test('rule 30 from a single cell matches the tabulated first rows', () => {
  // Wolfram, A New Kind of Science, p. 27: rule 30 rows 0..5 centred.
  const expected = [
    '.......#.......',
    '......###......',
    '.....##..#.....',
    '....##.####....',
    '...##..#...#...',
    '..##.####.###..',
  ];
  const w = new Elementary({ width: 15, height: 8, rule: 30 });
  for (let t = 0; t < expected.length; t++) {
    assert.equal(rowString(w.currentRow()), expected[t], `row ${t}`);
    w.step();
  }
});

test('rule 90 is XOR of the two outer neighbours (Sierpinski)', () => {
  const w = new Elementary({ width: 64, height: 40, rule: 90 });
  for (let t = 0; t < 30; t++) {
    const prev = Uint8Array.from(w.currentRow());
    w.step();
    const cur = w.currentRow();
    for (let x = 0; x < 64; x++) {
      const l = prev[(x + 63) % 64];
      const r = prev[(x + 1) % 64];
      assert.equal(cur[x], l ^ r);
    }
  }
});

test('rule 204 is the identity, rule 0 dies, rule 255 fills', () => {
  const id = new Elementary({ width: 32, height: 4, rule: 204, seed: 5, init: 'random' });
  const before = Array.from(id.currentRow());
  id.step();
  assert.deepEqual(Array.from(id.currentRow()), before);

  const dead = new Elementary({ width: 32, height: 4, rule: 0, init: 'random' });
  dead.step();
  assert.equal(dead.stats().density, 0);

  const full = new Elementary({ width: 32, height: 4, rule: 255 });
  full.step();
  assert.equal(full.stats().density, 1);
});

test('rule 110 first rows (known to be Turing complete, Cook 2004)', () => {
  const w = new Elementary({ width: 12, height: 6, rule: 110 });
  const expected = ['......#.....', '.....##.....', '....###.....', '...##.#.....', '..#####.....'];
  for (const row of expected) {
    assert.equal(rowString(w.currentRow()), row);
    w.step();
  }
});

test('history scrolls once the screen is full and paint covers every pixel', () => {
  const w = new Elementary({ width: 16, height: 5, rule: 30 });
  for (let i = 0; i < 12; i++) w.step();
  assert.equal(w.head, 5);
  const buf = new Uint32Array(16 * 5);
  w.paint(buf);
  for (const px of buf) assert.equal(px >>> 24, 255);
});
