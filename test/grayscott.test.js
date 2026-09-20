import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GrayScott, PRESETS } from '../src/worlds/grayscott.js';

const sum = (a) => a.reduce((x, y) => x + y, 0);

test('(U, V) = (1, 0) is an exact fixed point', () => {
  const w = new GrayScott({ width: 24, height: 24, seedSquares: 0 });
  for (let i = 0; i < 20; i++) w.step();
  for (let i = 0; i < w.U.length; i++) {
    assert.equal(w.U[i], 1);
    assert.equal(w.V[i], 0);
  }
});

test('with f = k = 0 the total of U + V is conserved (reaction converts, diffusion conserves)', () => {
  const w = new GrayScott({ width: 32, height: 32, f: 0, k: 0, seed: 3 });
  const before = sum(w.U) + sum(w.V);
  for (let i = 0; i < 30; i++) w.step();
  const after = sum(w.U) + sum(w.V);
  assert.ok(Math.abs(after - before) < 1e-2 * before / 1000, `drift ${after - before}`);
});

test('a uniform small V on U = 1 decays as (1 - (f + k)) per substep, to first order', () => {
  const f = 0.03;
  const k = 0.062;
  const w = new GrayScott({ width: 16, height: 16, f, k, seedSquares: 0 });
  // V0 small enough that the U V² term (order V0²) is negligible against (f + k) V (order V0)
  const V0 = 1e-5;
  w.V.fill(V0);
  const n = 50;
  for (let i = 0; i < n; i++) w.substep();
  const expected = V0 * (1 - (f + k)) ** n;
  for (let i = 0; i < w.V.length; i++) {
    assert.ok(Math.abs(w.V[i] - expected) / expected < 1e-3, `V ${w.V[i]} vs ${expected}`);
  }
});

test('mirror-symmetric initial data stays mirror-symmetric', () => {
  const w = new GrayScott({ width: 40, height: 40, seedSquares: 0 });
  // a centred square: symmetric about x = 19.5 and y = 19.5
  for (let y = 16; y < 24; y++) for (let x = 16; x < 24; x++) {
    w.U[y * 40 + x] = 0.5;
    w.V[y * 40 + x] = 0.25;
  }
  for (let i = 0; i < 25; i++) w.step();
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
    const i = y * 40 + x;
    const j = y * 40 + (39 - x);
    const l = (39 - y) * 40 + x;
    assert.ok(Math.abs(w.V[i] - w.V[j]) < 1e-6 && Math.abs(w.V[i] - w.V[l]) < 1e-6);
  }
});

test('the spots regime actually forms a pattern from random seeds', () => {
  const w = new GrayScott({ width: 96, height: 96, preset: 'spots', seed: 7 });
  for (let i = 0; i < 400; i++) w.step(); // 3200 substeps
  const s = w.stats();
  assert.ok(s.meanV > 0.01, `mean V ${s.meanV}`); // V neither died out
  assert.ok(s.maxV > 0.2, `max V ${s.maxV}`); // nor spread thin
  let varV = 0;
  for (const v of w.V) varV += (v - s.meanV) ** 2;
  assert.ok(varV / w.V.length > 1e-3); // and it is spatially structured
});

test('deterministic, presets switch, paint covers every pixel', () => {
  const a = new GrayScott({ width: 32, height: 32, seed: 'gs' });
  const b = new GrayScott({ width: 32, height: 32, seed: 'gs' });
  for (let i = 0; i < 10; i++) {
    a.step();
    b.step();
  }
  assert.equal(a.fingerprint(), b.fingerprint());
  a.setPreset('worms');
  assert.equal(a.f, PRESETS.worms.f);
  assert.throws(() => a.setPreset('nope'));
  const buf = new Uint32Array(32 * 32);
  a.paint(buf);
  for (const px of buf) assert.equal(px >>> 24, 255);
});
