/**
 * Experiment 1: do hunters lag grazers, as predator-prey theory predicts?
 *
 * Hypothesis. In Lotka-Volterra dynamics the predator population peaks after
 * the prey population: more prey feed more predators, which then eat the
 * prey down, which then starves the predators. The predator series should
 * therefore be positively cross-correlated with the prey series at a
 * positive lag.
 *
 * Method. For each of N seeds, run the ecology for BURN + LEN steps, discard
 * the burn-in, estimate the oscillation period P from the autocorrelation of
 * the grazer series, and compute the lag at which corr(grazers[t],
 * hunters[t+lag]) peaks for lag in (-P/2, P/2]. Restricting the window to
 * half a period matters: a periodic signal has correlation peaks one period
 * apart, and a wider window can pick up the previous cycle's peak with the
 * opposite sign. Report the distribution of peak lags, the mean lag with a
 * 95% CI, the mean lag as a fraction of the period, and the fraction of runs
 * with a strictly positive lag together with an exact sign test against 50%.
 *
 * Also recorded: coexistence (no extinction) per seed, since the theory only
 * applies while both populations persist.
 */
import { createEcology } from '../src/index.js';
import { ci95, peakLag, signTest, median, crossCorrelation, mean, dominantPeriod } from '../src/stats.js';
import { writeResult, seeds, fmt, quick, timer } from './lib.js';

const Q = quick();
const N = Q ? 6 : 24;
const SIZE = 96;
const BURN = Q ? 200 : 400;
const LEN = Q ? 1000 : 2000;
const MAXLAG = 120;

const elapsed = timer();
const runs = [];
const meanCorr = new Float64Array(2 * MAXLAG + 1);
for (const seed of seeds(N, 'lag')) {
  const w = createEcology({ seed, width: SIZE, height: SIZE });
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
  const period = dominantPeriod(grazers, MAXLAG * 2);
  const window = Number.isFinite(period) ? Math.floor(period / 2) : MAXLAG;
  const { lag, r } = peakLag(grazers, hunters, window);
  const cc = crossCorrelation(grazers, hunters, MAXLAG);
  for (let i = 0; i < cc.r.length; i++) meanCorr[i] += cc.r[i] / N;
  runs.push({
    seed,
    lag,
    r,
    period,
    lagFraction: Number.isFinite(period) ? lag / period : NaN,
    extinct,
    meanGrazers: mean(grazers),
    meanHunters: mean(hunters),
    // a downsampled trace for the site, every 10th step
    trace: { grazers: grazers.filter((_, i) => i % 10 === 0), hunters: hunters.filter((_, i) => i % 10 === 0) },
  });
  console.log(`${seed}: period ${period}, peak lag ${lag} (r=${fmt(r)})${extinct ? ' EXTINCTION' : ''}`);
}

const coexisting = runs.filter((r) => !r.extinct);
const lags = coexisting.map((r) => r.lag);
const positive = lags.filter((l) => l > 0).length;
const result = {
  name: 'predator_prey_lag',
  title: 'Hunters lag grazers',
  question: 'Does the hunter population peak after the grazer population, as predator-prey theory predicts?',
  hypothesis: 'The cross-correlation between grazer and hunter counts peaks at a positive lag.',
  params: { runs: N, grid: `${SIZE}x${SIZE}`, burnIn: BURN, length: LEN, maxLag: MAXLAG },
  generatedAt: new Date().toISOString(),
  seconds: elapsed(),
  coexistence: { runs: N, coexisting: coexisting.length },
  lag: { ...ci95(lags), median: median(lags) },
  period: ci95(coexisting.map((r) => r.period).filter(Number.isFinite)),
  lagFraction: ci95(coexisting.map((r) => r.lagFraction).filter(Number.isFinite)),
  positiveLag: { count: positive, n: lags.length, fraction: positive / lags.length, signTestP: signTest(positive, lags.length) },
  peakCorrelation: ci95(coexisting.map((r) => r.r)),
  meanCrossCorrelation: { lags: Array.from({ length: 2 * MAXLAG + 1 }, (_, i) => i - MAXLAG), r: Array.from(meanCorr) },
  runs: runs.map(({ trace, ...rest }) => rest),
  exampleTrace: runs[0].trace,
  verdict: null,
};
result.verdict =
  result.positiveLag.signTestP < 0.05 && result.lag.lo > 0
    ? 'supported'
    : result.positiveLag.signTestP < 0.05
      ? 'weakly supported'
      : 'not supported';

console.log(`\ncoexistence ${coexisting.length}/${N}`);
console.log(`period: mean ${fmt(result.period.mean, 1)} steps, 95% CI [${fmt(result.period.lo, 1)}, ${fmt(result.period.hi, 1)}]`);
console.log(`peak lag: mean ${fmt(result.lag.mean, 1)} steps, 95% CI [${fmt(result.lag.lo, 1)}, ${fmt(result.lag.hi, 1)}], median ${result.lag.median}, ${fmt(result.lagFraction.mean * 100, 0)}% of a period`);
console.log(`positive lag in ${positive}/${lags.length} runs, sign test p = ${fmt(result.positiveLag.signTestP, 4)}`);
console.log(`verdict: ${result.verdict}  (${fmt(result.seconds, 1)}s)`);
writeResult('predator_prey_lag', result);
