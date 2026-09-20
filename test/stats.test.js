import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mean, sd, median, ci95, crossCorrelation, peakLag, permutationTest, cohensD, signTest, tCritical95, dominantPeriod, autocorrelation, separationIndex } from '../src/stats.js';
import { makeRng } from '../src/rng.js';

test('mean, sd, median on known values', () => {
  const xs = [2, 4, 4, 4, 5, 5, 7, 9];
  assert.equal(mean(xs), 5);
  assert.ok(Math.abs(sd(xs) - 2.138) < 0.001); // sample sd
  assert.equal(median(xs), 4.5);
  assert.equal(median([3, 1, 2]), 2);
});

test('ci95 matches hand calculation', () => {
  const xs = [10, 12, 9, 11, 13];
  const r = ci95(xs);
  // mean 11, sd = sqrt(10/4) = 1.5811, t(4) = 2.776, half = 2.776*1.5811/sqrt(5) = 1.963
  assert.equal(r.mean, 11);
  assert.ok(Math.abs(r.lo - 9.037) < 0.01);
  assert.ok(Math.abs(r.hi - 12.963) < 0.01);
  assert.equal(tCritical95(1000), 1.96);
});

test('crossCorrelation recovers a known lag', () => {
  const n = 400;
  const a = [];
  const b = [];
  for (let t = 0; t < n; t++) {
    a.push(Math.sin(t / 8));
    b.push(Math.sin((t - 6) / 8)); // b follows a by 6 steps
  }
  const { lag, r } = peakLag(a, b, 20);
  assert.equal(lag, 6);
  assert.ok(r > 0.95);
  const cc = crossCorrelation(a, a, 5);
  assert.ok(Math.abs(cc.r[5] - 1) < 1e-9); // zero lag autocorrelation is 1
});

test('permutationTest: identical distributions give large p, shifted give small p', () => {
  const rng = makeRng(11);
  const xs = Array.from({ length: 30 }, () => rng.gauss());
  const ys = Array.from({ length: 30 }, () => rng.gauss());
  const zs = Array.from({ length: 30 }, () => rng.gauss() + 2);
  assert.ok(permutationTest(xs, ys, makeRng(1), 2000).p > 0.05);
  assert.ok(permutationTest(xs, zs, makeRng(1), 2000).p < 0.001);
  assert.ok(Math.abs(cohensD(xs, zs)) > 1.5);
});

test('signTest known values', () => {
  // 10 of 10 successes: p = 2 * 0.5^10 = 0.00195
  assert.ok(Math.abs(signTest(10, 10) - 0.001953) < 1e-5);
  // 5 of 10: p = 1
  assert.equal(signTest(5, 10), 1);
});

test('dominantPeriod recovers the period of a sine and rejects noise', () => {
  const xs = Array.from({ length: 600 }, (_, t) => Math.sin((2 * Math.PI * t) / 37));
  assert.equal(dominantPeriod(xs, 100), 37);
  const rng = makeRng(5);
  const noise = Array.from({ length: 600 }, () => rng.gauss());
  const p = dominantPeriod(noise, 100);
  // white noise has no clear period: either NaN or a weak, arbitrary peak
  assert.ok(Number.isNaN(p) || autocorrelation(noise, 100)[p] < 0.3);
});

test('separationIndex finds the first lasting separation and rejects rejoining', () => {
  const band = (lo, hi) => ({ lo, hi });
  const a = [band(0, 1), band(0, 1), band(0, 1), band(0, 1)];
  const b = [band(0.5, 1.5), band(1.2, 2), band(1.1, 2), band(1.5, 2)];
  assert.equal(separationIndex(a, b), 1);
  const rejoin = [band(0.5, 1.5), band(1.2, 2), band(0.9, 2), band(1.5, 2)];
  assert.equal(separationIndex(a, rejoin), 3);
  const never = [band(0.5, 1.5), band(0.5, 1.5), band(0.5, 1.5), band(0.5, 1.5)];
  assert.equal(separationIndex(a, never), -1);
  assert.equal(separationIndex([band(0, 1)], [band(2, 3)]), 0);
});
