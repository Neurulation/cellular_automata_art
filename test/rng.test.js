import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, hashSeed, valueNoise, hashBytes } from '../src/rng.js';

test('same seed gives identical sequences', () => {
  const a = makeRng('demo');
  const b = makeRng('demo');
  for (let i = 0; i < 1000; i++) assert.equal(a.next(), b.next());
});

test('different seeds give different sequences', () => {
  const a = makeRng(1);
  const b = makeRng(2);
  let same = 0;
  for (let i = 0; i < 100; i++) if (a.next() === b.next()) same++;
  assert.ok(same < 3);
});

test('next() is uniform on [0,1): mean and bucket counts are sane', () => {
  const rng = makeRng(42);
  const n = 200000;
  const buckets = new Array(10).fill(0);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = rng.next();
    assert.ok(v >= 0 && v < 1);
    sum += v;
    buckets[Math.floor(v * 10)]++;
  }
  assert.ok(Math.abs(sum / n - 0.5) < 0.005);
  // each bucket should hold ~10% ± 1% (binomial sd is ~0.07%)
  for (const c of buckets) assert.ok(Math.abs(c / n - 0.1) < 0.01, `bucket ${c / n}`);
});

test('gauss() has mean ~0 and sd ~1', () => {
  const rng = makeRng(7);
  const n = 100000;
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const g = rng.gauss();
    s += g;
    s2 += g * g;
  }
  const m = s / n;
  const sd = Math.sqrt(s2 / n - m * m);
  assert.ok(Math.abs(m) < 0.02, `mean ${m}`);
  assert.ok(Math.abs(sd - 1) < 0.02, `sd ${sd}`);
});

test('shuffle is a permutation', () => {
  const rng = makeRng(3);
  const arr = Array.from({ length: 50 }, (_, i) => i);
  const shuffled = rng.shuffle([...arr]);
  assert.deepEqual([...shuffled].sort((a, b) => a - b), arr);
  assert.notDeepEqual(shuffled, arr);
});

test('hashSeed is stable and treats numbers as themselves', () => {
  assert.equal(hashSeed('hello'), hashSeed('hello'));
  assert.notEqual(hashSeed('hello'), hashSeed('hellp'));
  assert.equal(hashSeed(123), 123);
});

test('valueNoise stays in [0,1] and is deterministic', () => {
  const a = valueNoise(40, 30, makeRng(9));
  const b = valueNoise(40, 30, makeRng(9));
  assert.deepEqual(Array.from(a), Array.from(b));
  for (const v of a) assert.ok(v >= 0 && v <= 1);
});

test('hashBytes distinguishes arrays', () => {
  const x = new Float32Array([1, 2, 3]);
  const y = new Float32Array([1, 2, 3.0001]);
  assert.equal(hashBytes(x), hashBytes(new Float32Array([1, 2, 3])));
  assert.notEqual(hashBytes(x), hashBytes(y));
});
