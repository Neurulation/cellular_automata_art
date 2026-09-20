/**
 * Experiment 2: is evolution in the ecology selection, or just drift?
 *
 * Any population with inheritance and mutation will change over time even
 * if genes do nothing: that is neutral drift. To claim that the ecology
 * *selects* we have to show that gene frequencies move differently when the
 * genes affect behaviour than when they do not.
 *
 * Method. Run paired worlds from the same seeds. In the SELECTION arm the
 * genome drives behaviour as normal. In the NEUTRAL arm the world uses a
 * fixed reference genome for every decision while still copying and mutating
 * the stored genomes at reproduction. Everything else, including the random
 * stream, starts identical. After T steps, record the population mean of each
 * gene in both arms.
 *
 * Predictions.
 *   - The neutral marker gene (index 4) should look the same in both arms:
 *     it never affects behaviour, so it can only drift. This is the control.
 *   - Behavioural genes should differ between arms. In particular the grazer
 *     reproduction threshold (index 3) should fall under selection, because a
 *     grazer that splits earlier out-breeds one that waits.
 *
 * Analysis. For each gene: difference in means between arms, Cohen's d, and a
 * two-sided permutation test p-value with a fixed seed.
 */
import { createEcology, GENES, makeRng } from '../src/index.js';
import { ci95, permutationTest, cohensD } from '../src/stats.js';
import { writeResult, seeds, fmt, quick, timer } from './lib.js';

const Q = quick();
const N = Q ? 8 : 20;
const SIZE = 96;
const T = Q ? 1000 : 2500;
const GENE_NAMES = ['trail affinity', 'food / prey drive', 'trail deposit', 'reproduction threshold', 'neutral marker'];

const elapsed = timer();
const arms = { selection: { grazer: [], hunter: [] }, neutral: { grazer: [], hunter: [] } };
const survived = { selection: 0, neutral: 0 };

for (const seed of seeds(N, 'sel')) {
  for (const arm of ['selection', 'neutral']) {
    const w = createEcology({ seed, width: SIZE, height: SIZE, neutral: arm === 'neutral' });
    for (let t = 0; t < T; t++) w.step();
    const s = w.stats();
    if (s.grazers > 0 && s.hunters > 0) survived[arm]++;
    arms[arm].grazer.push(s.grazerGenes);
    arms[arm].hunter.push(s.hunterGenes);
  }
  console.log(`${seed}: selection grazer genes ${arms.selection.grazer.at(-1).map((v) => fmt(v, 2)).join(' ')} | neutral ${arms.neutral.grazer.at(-1).map((v) => fmt(v, 2)).join(' ')}`);
}

function analyse(kind) {
  const out = [];
  for (let g = 0; g < GENES; g++) {
    const sel = arms.selection[kind].map((v) => v[g]).filter(Number.isFinite);
    const neu = arms.neutral[kind].map((v) => v[g]).filter(Number.isFinite);
    const test = permutationTest(sel, neu, makeRng(`perm-${kind}-${g}`), 10000);
    out.push({
      gene: g,
      name: GENE_NAMES[g],
      selection: ci95(sel),
      neutral: ci95(neu),
      diff: test.diff,
      cohensD: cohensD(sel, neu),
      p: test.p,
      significant: test.p < 0.01,
    });
  }
  return out;
}

const result = {
  name: 'selection_vs_drift',
  title: 'Selection, not just drift',
  question: 'Do gene frequencies move differently when genes affect behaviour than when they are inert?',
  hypothesis: 'Behavioural genes differ between the selection and neutral arms; the neutral marker gene does not.',
  params: { runs: N, grid: `${SIZE}x${SIZE}`, steps: T, permutations: 10000, alpha: 0.01 },
  generatedAt: new Date().toISOString(),
  seconds: elapsed(),
  survived,
  grazer: analyse('grazer'),
  hunter: analyse('hunter'),
  verdict: null,
};

const control = result.grazer[4];
const behavioural = result.grazer.slice(0, 4).filter((r) => r.significant).length;
result.verdict =
  !control.significant && behavioural >= 2
    ? 'supported'
    : control.significant
      ? 'control failed: the neutral marker differs between arms'
      : 'not supported';

console.log(`\n${'gene'.padEnd(24)} ${'selection'.padStart(10)} ${'neutral'.padStart(10)} ${'d'.padStart(7)} ${'p'.padStart(8)}`);
for (const kind of ['grazer', 'hunter']) {
  console.log(kind);
  for (const r of result[kind]) {
    console.log(`  ${r.name.padEnd(22)} ${fmt(r.selection.mean).padStart(10)} ${fmt(r.neutral.mean).padStart(10)} ${fmt(r.cohensD, 2).padStart(7)} ${fmt(r.p, 4).padStart(8)}${r.significant ? ' *' : ''}`);
  }
}
console.log(`verdict: ${result.verdict}  (${fmt(result.seconds, 1)}s)`);
writeResult('selection_vs_drift', result);
