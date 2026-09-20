import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ecology, GRAZER, HUNTER, EMPTY, GENES } from '../src/worlds/ecology.js';

const small = (extra = {}) => new Ecology({ width: 48, height: 48, seed: 'test', ...extra });

test('determinism: same seed, same fingerprint after many steps', () => {
  const a = small();
  const b = small();
  for (let i = 0; i < 200; i++) {
    a.step();
    b.step();
  }
  assert.equal(a.fingerprint(), b.fingerprint());
  assert.deepEqual(a.stats(), b.stats());
});

test('different seeds diverge', () => {
  const a = small({ seed: 1 });
  const b = small({ seed: 2 });
  assert.notEqual(a.fingerprint(), b.fingerprint());
});

test('reset restores the initial state exactly', () => {
  const w = small();
  const fp = w.fingerprint();
  for (let i = 0; i < 50; i++) w.step();
  w.reset('test');
  assert.equal(w.fingerprint(), fp);
  assert.equal(w.tick, 0);
});

test('invariants hold every step: one organism per cell, positive energy, genes in [0,1]', () => {
  const w = small();
  for (let t = 0; t < 300; t++) {
    w.step();
    let g = 0;
    let h = 0;
    for (let i = 0; i < w.kind.length; i++) {
      const k = w.kind[i];
      assert.ok(k === EMPTY || k === GRAZER || k === HUNTER);
      if (k === EMPTY) {
        assert.equal(w.energy[i], 0);
      } else {
        assert.ok(w.energy[i] > 0, `organism at ${i} has energy ${w.energy[i]}`);
        for (let j = 0; j < GENES; j++) {
          const v = w.genome[i * GENES + j];
          assert.ok(v >= 0 && v <= 1, `gene ${j} = ${v}`);
        }
      }
      if (k === GRAZER) g++;
      if (k === HUNTER) h++;
      assert.ok(w.food[i] >= 0 && w.food[i] <= 1.0001);
      assert.ok(w.trail[i] >= 0);
    }
    const s = w.stats();
    assert.equal(s.grazers, g);
    assert.equal(s.hunters, h);
  }
});

test('trail diffusion conserves mass when nothing evaporates and nobody deposits', () => {
  const w = small({ evaporation: 0, grazerInit: 0, hunterInit: 0 });
  w.trail.fill(0);
  w.trail[10 * 48 + 10] = 100;
  const total = () => w.trail.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 40; i++) {
    w.stepFields();
    assert.ok(Math.abs(total() - 100) < 1e-2, `mass ${total()}`);
  }
  // it has spread: the source cell is no longer the whole mass
  assert.ok(w.trail[10 * 48 + 10] < 50);
  // and by symmetry of the stencil, opposite neighbours are equal
  assert.ok(Math.abs(w.trail[10 * 48 + 9] - w.trail[10 * 48 + 11]) < 1e-6);
});

test('trail evaporation is geometric with the configured rate', () => {
  const w = small({ evaporation: 0.1, diffusion: 0, grazerInit: 0, hunterInit: 0 });
  w.trail.fill(1);
  w.stepFields();
  for (const v of w.trail) assert.ok(Math.abs(v - 0.9) < 1e-6);
});

test('food regrows toward fertility and never exceeds it', () => {
  const w = small({ grazerInit: 0, hunterInit: 0 });
  w.food.fill(0);
  for (let i = 0; i < 2000; i++) w.stepFields();
  for (let i = 0; i < w.food.length; i++) {
    assert.ok(w.food[i] <= w.fertility[i] + 1e-5);
    assert.ok(w.food[i] > w.fertility[i] * 0.99);
  }
});

test('without food, grazers starve out; without grazers, hunters starve out', () => {
  const starve = small({ foodGrowth: 0, hunterInit: 0 });
  starve.food.fill(0);
  for (let i = 0; i < 400; i++) starve.step();
  assert.equal(starve.stats().grazers, 0);

  const lonely = small({ grazerInit: 0, hunterInit: 0.2 });
  for (let i = 0; i < 400; i++) lonely.step();
  assert.equal(lonely.stats().hunters, 0);
});

test('with food and no hunters, grazers grow to fill the fertile land', () => {
  const w = small({ hunterInit: 0, grazerInit: 0.01 });
  const start = w.stats().grazers;
  for (let i = 0; i < 400; i++) w.step();
  assert.ok(w.stats().grazers > start * 5);
});

test('mutation is inherited: children resemble parents more than strangers', () => {
  const w = small({ mutationSd: 0.02 });
  // pick an organism, force reproduction, compare genomes
  let i = w.kind.indexOf(GRAZER);
  w.energy[i] = 10;
  const j = w.reproduce(i, GRAZER);
  assert.ok(j >= 0);
  let dist = 0;
  for (let k = 0; k < GENES; k++) dist += Math.abs(w.genome[i * GENES + k] - w.genome[j * GENES + k]);
  assert.ok(dist < 0.3, `parent-child distance ${dist}`);
  assert.equal(w.energy[i], 5);
  assert.equal(w.energy[j], 5);
});

test('neutral mode ignores genes for behaviour but still inherits them', () => {
  const w = small({ neutral: true });
  const i = w.kind.indexOf(GRAZER);
  assert.equal(w.gene(i, 0), 0.5);
  assert.notEqual(w.genome[i * GENES], 0.5); // the stored genome is still random
  for (let t = 0; t < 50; t++) w.step();
  assert.ok(w.stats().grazers > 0);
});

test('paint covers every pixel with opaque colour', () => {
  const w = small();
  for (let t = 0; t < 20; t++) w.step();
  const buf = new Uint32Array(48 * 48);
  w.paint(buf);
  for (const px of buf) assert.equal(px >>> 24, 255);
});
