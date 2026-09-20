/**
 * Experiment 3: is the quarter-period lag robust to parameters?
 *
 * E1 found hunters lagging grazers by about a quarter of the cycle period at
 * one parameter setting. Lotka-Volterra predicts a quarter period near the
 * coexistence equilibrium regardless of the rates, so the prediction should
 * hold across settings as long as the populations persist and cycle.
 *
 * Design. A grid over hunter metabolic cost and food regrowth rate, the two
 * parameters that most directly set predator pressure and prey carrying
 * capacity. Per cell, N seeds; per run, the same statistics as E1: period
 * from the grazer autocorrelation, peak lag searched within half a period,
 * lag as a fraction of the period. Coexistence means both species are
 * present at every step of the run.
 *
 * Pre-registered criterion (written before the first full run):
 *   eligible cell  coexistence rate >= 0.75
 *   passing cell   95% CI of mean lag/period overlaps [0.20, 0.30]
 *   supported      every eligible cell passes
 *   weak           at least three quarters of eligible cells pass
 *   not supported  otherwise
 *   inconclusive   no eligible cells
 */
import { createEcology } from '../src/index.js';
import { ci95, peakLag, dominantPeriod, mean } from '../src/stats.js';
import { writeResult, seeds, fmt, quick, timer } from './lib.js';

const Q = quick();
const HUNTER_COST = Q ? [0.05, 0.08] : [0.035, 0.05, 0.065, 0.08];
const FOOD_GROWTH = Q ? [0.008, 0.016] : [0.008, 0.012, 0.016, 0.02];
const N = Q ? 3 : 8;
const SIZE = 96;
const BURN = Q ? 150 : 300;
const LEN = Q ? 600 : 1500;
const MAXLAG = 120;
const BAND = [0.2, 0.3];

const elapsed = timer();
const cells = [];
for (const foodGrowth of FOOD_GROWTH) {
  for (const hunterCost of HUNTER_COST) {
    const runs = [];
    for (const seed of seeds(N, `sweep-${hunterCost}-${foodGrowth}`)) {
      const w = createEcology({ seed, width: SIZE, height: SIZE, hunterCost, foodGrowth });
      const grazers = [];
      const hunters = [];
      let extinct = false;
      for (let t = 0; t < BURN + LEN; t++) {
        w.step();
        const s = w.stats();
        if (s.grazers === 0 || s.hunters === 0) extinct = true;
        if (t >= BURN) {
          grazers.push(s.grazers);
          hunters.push(s.hunters);
        }
      }
      let period = NaN;
      let lag = NaN;
      let r = NaN;
      if (!extinct) {
        period = dominantPeriod(grazers, MAXLAG * 2);
        const window = Number.isFinite(period) ? Math.floor(period / 2) : MAXLAG;
        ({ lag, r } = peakLag(grazers, hunters, window));
      }
      runs.push({ seed, extinct, period, lag, r, lagFraction: Number.isFinite(period) ? lag / period : NaN, meanGrazers: mean(grazers), meanHunters: mean(hunters) });
    }
    const alive = runs.filter((x) => !x.extinct && Number.isFinite(x.lagFraction));
    const coexistenceRate = runs.filter((x) => !x.extinct).length / runs.length;
    const lagFraction = alive.length >= 2 ? ci95(alive.map((x) => x.lagFraction)) : null;
    const eligible = coexistenceRate >= 0.75 && lagFraction !== null;
    const passing = eligible && lagFraction.lo <= BAND[1] && lagFraction.hi >= BAND[0];
    const cell = {
      hunterCost,
      foodGrowth,
      runs: runs.length,
      coexisting: runs.filter((x) => !x.extinct).length,
      coexistenceRate,
      period: alive.length >= 2 ? ci95(alive.map((x) => x.period)) : null,
      lag: alive.length >= 2 ? ci95(alive.map((x) => x.lag)) : null,
      lagFraction,
      meanGrazers: mean(runs.map((x) => x.meanGrazers)),
      meanHunters: mean(runs.map((x) => x.meanHunters)),
      eligible,
      passing,
    };
    cells.push(cell);
    console.log(
      `hunterCost ${hunterCost} foodGrowth ${foodGrowth}: coexist ${cell.coexisting}/${cell.runs}` +
        (lagFraction ? `, lag/period ${fmt(lagFraction.mean, 3)} [${fmt(lagFraction.lo, 3)}, ${fmt(lagFraction.hi, 3)}], period ${fmt(cell.period.mean, 0)}` : '') +
        (eligible ? (passing ? '  PASS' : '  fail') : '  (not eligible)'),
    );
  }
}

const eligible = cells.filter((c) => c.eligible);
const passing = eligible.filter((c) => c.passing);
let verdict = 'inconclusive';
if (eligible.length) {
  verdict = passing.length === eligible.length ? 'supported' : passing.length >= 0.75 * eligible.length ? 'weakly supported' : 'not supported';
}
const result = {
  name: 'lag_sweep',
  title: 'The quarter-period lag across parameters',
  question: 'Does the hunter lag stay near a quarter of the cycle period when predator pressure and prey growth change?',
  hypothesis: 'In every parameter cell where the species persist, the 95% CI of lag/period overlaps [0.20, 0.30].',
  params: { hunterCost: HUNTER_COST, foodGrowth: FOOD_GROWTH, runsPerCell: N, grid: `${SIZE}x${SIZE}`, burnIn: BURN, length: LEN, maxLag: MAXLAG, band: BAND, eligibility: 0.75 },
  generatedAt: new Date().toISOString(),
  seconds: elapsed(),
  cells,
  summary: { cells: cells.length, eligible: eligible.length, passing: passing.length, allEligibleLagFraction: eligible.length >= 2 ? ci95(eligible.map((c) => c.lagFraction.mean)) : null },
  verdict,
};
console.log(`\neligible cells ${eligible.length}/${cells.length}, passing ${passing.length}/${eligible.length}`);
if (result.summary.allEligibleLagFraction) console.log(`lag/period across eligible cells: ${fmt(result.summary.allEligibleLagFraction.mean, 3)} [${fmt(result.summary.allEligibleLagFraction.lo, 3)}, ${fmt(result.summary.allEligibleLagFraction.hi, 3)}]`);
console.log(`verdict: ${verdict}  (${fmt(result.seconds, 1)}s)`);
writeResult('lag_sweep', result);
