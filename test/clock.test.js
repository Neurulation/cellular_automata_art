import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeStepClock, sliderToRate, rateToSlider } from '../src/clock.js';

function run(clock, frameDt, seconds) {
  let steps = 0;
  for (let t = 0; t < seconds; t += frameDt) steps += clock.advance(frameDt);
  return steps;
}

test('the same rate gives the same step count on 60 Hz and 144 Hz displays', () => {
  const a = run(makeStepClock({ rate: 10 }), 1 / 60, 10);
  const b = run(makeStepClock({ rate: 10 }), 1 / 144, 10);
  assert.ok(Math.abs(a - 100) <= 1, `60 Hz: ${a}`);
  assert.ok(Math.abs(b - 100) <= 1, `144 Hz: ${b}`);
});

test('fractional steps carry over: 10 steps/s at 60 Hz never yields 0 forever', () => {
  const c = makeStepClock({ rate: 10 });
  // 13 frames at 60 Hz is 0.2167 s, i.e. 2.17 steps at 10/s: exactly 2 whole steps
  const counts = Array.from({ length: 13 }, () => c.advance(1 / 60));
  assert.equal(counts.reduce((x, y) => x + y, 0), 2);
  assert.ok(counts.every((n) => n === 0 || n === 1));
});

test('high rates run many steps per frame, capped', () => {
  const c = makeStepClock({ rate: 240, maxStepsPerCall: 60 });
  assert.equal(c.advance(1 / 60), 4);
  assert.equal(c.advance(1), 60); // capped, not 240
});

test('a long stall (background tab) is clamped, not replayed', () => {
  const c = makeStepClock({ rate: 10, maxDt: 0.25 });
  assert.equal(c.advance(30), 2); // 0.25 s × 10 = 2.5 → 2 steps
  assert.ok(c.pending < 1);
});

test('rate can change on the fly and reset clears the remainder', () => {
  const c = makeStepClock({ rate: 1 });
  c.advance(0.5);
  assert.ok(c.pending > 0);
  c.reset();
  assert.equal(c.pending, 0);
  c.rate = 100;
  assert.equal(c.advance(0.1), 10);
  assert.equal(c.advance(-1), 0);
  assert.equal(c.advance(NaN), 0);
});

test('slider mapping is a log scale from 0.5 to 240 and round-trips', () => {
  assert.equal(sliderToRate(0), 0.5);
  assert.equal(sliderToRate(100), 240);
  assert.ok(sliderToRate(50) > 10 && sliderToRate(50) < 12); // geometric midpoint ≈ 11
  for (const r of [0.5, 1, 2, 6, 10, 30, 60, 120, 240]) {
    const back = sliderToRate(rateToSlider(r));
    assert.ok(Math.abs(back - r) <= Math.max(0.1, r * 0.06), `${r} -> ${back}`);
  }
});

test('sub-1 rates step less than once per second', () => {
  const c = makeStepClock({ rate: 0.5 });
  let steps = 0;
  for (let i = 0; i < 60; i++) steps += c.advance(1 / 60); // one second
  assert.equal(steps, 0);
  for (let i = 0; i < 60; i++) steps += c.advance(1 / 60); // two seconds
  assert.equal(steps, 1);
});
