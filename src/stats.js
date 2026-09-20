/**
 * Small, dependency-free statistics toolkit.
 *
 * Only what the experiments need, each function documented with the formula
 * it implements so a reader can check it. Nothing here is clever; that is the
 * point. Where a p-value is reported it comes from a permutation test rather
 * than a parametric formula, so it needs no distributional assumptions and no
 * special functions, only a seeded generator.
 */

export function mean(xs) {
  let s = 0;
  for (const x of xs) s += x;
  return xs.length ? s / xs.length : NaN;
}

/** Sample standard deviation (n - 1 denominator). */
export function sd(xs) {
  const n = xs.length;
  if (n < 2) return NaN;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (n - 1));
}

export function median(xs) {
  const a = Array.from(xs).sort((p, q) => p - q);
  const n = a.length;
  if (!n) return NaN;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

/**
 * Two-sided critical values of Student's t at 95%, df = 1..30, then the
 * normal approximation. Enough for the sample sizes we run.
 */
const T95 = [
  NaN, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
  2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086,
  2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
];

export function tCritical95(df) {
  if (df < 1) return NaN;
  if (df <= 30) return T95[Math.floor(df)];
  if (df <= 60) return 2.0;
  if (df <= 120) return 1.98;
  return 1.96;
}

/**
 * 95% confidence interval for the mean: m ± t(df) * sd / sqrt(n).
 * Returns { mean, lo, hi, n, sd }.
 */
export function ci95(xs) {
  const n = xs.length;
  const m = mean(xs);
  const s = sd(xs);
  const half = n > 1 ? (tCritical95(n - 1) * s) / Math.sqrt(n) : NaN;
  return { mean: m, lo: m - half, hi: m + half, n, sd: s };
}

/**
 * Normalised cross-correlation r(lag) of two equal-length series for
 * lag in [-maxLag, maxLag]. Positive lag means `b` follows `a` by that many
 * steps: r(k) = corr(a[t], b[t + k]).
 * Returns { lags, r }.
 */
export function crossCorrelation(a, b, maxLag) {
  const n = Math.min(a.length, b.length);
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  const norm = Math.sqrt(va * vb) || 1;
  const lags = [];
  const r = [];
  for (let k = -maxLag; k <= maxLag; k++) {
    let s = 0;
    for (let t = 0; t < n; t++) {
      const u = t + k;
      if (u < 0 || u >= n) continue;
      s += (a[t] - ma) * (b[u] - mb);
    }
    lags.push(k);
    r.push(s / norm);
  }
  return { lags, r };
}

/** Lag at which cross-correlation is maximal. */
export function peakLag(a, b, maxLag) {
  const { lags, r } = crossCorrelation(a, b, maxLag);
  let best = 0;
  for (let i = 1; i < r.length; i++) if (r[i] > r[best]) best = i;
  return { lag: lags[best], r: r[best] };
}

/**
 * Two-sample permutation test on the difference of means.
 * H0: the two samples come from the same distribution.
 * Returns { diff, p, permutations } where p is two-sided:
 * the fraction of label shuffles whose |diff| >= the observed |diff|.
 */
export function permutationTest(xs, ys, rng, permutations = 5000) {
  const observed = mean(xs) - mean(ys);
  const pool = [...xs, ...ys];
  const nx = xs.length;
  let count = 0;
  for (let p = 0; p < permutations; p++) {
    rng.shuffle(pool);
    let sx = 0;
    for (let i = 0; i < nx; i++) sx += pool[i];
    let sy = 0;
    for (let i = nx; i < pool.length; i++) sy += pool[i];
    const d = sx / nx - sy / (pool.length - nx);
    if (Math.abs(d) >= Math.abs(observed) - 1e-12) count++;
  }
  return { diff: observed, p: (count + 1) / (permutations + 1), permutations };
}

/**
 * Cohen's d effect size with pooled standard deviation.
 */
export function cohensD(xs, ys) {
  const nx = xs.length;
  const ny = ys.length;
  const sx = sd(xs);
  const sy = sd(ys);
  const pooled = Math.sqrt(((nx - 1) * sx * sx + (ny - 1) * sy * sy) / (nx + ny - 2));
  return pooled ? (mean(xs) - mean(ys)) / pooled : NaN;
}

/** Exact binomial two-sided test for a fraction against p0 = 0.5 (sign test). */
export function signTest(successes, n) {
  // P(X <= min(k, n-k)) * 2 under Binomial(n, 0.5), computed in log space.
  const k = Math.min(successes, n - successes);
  let p = 0;
  for (let i = 0; i <= k; i++) p += Math.exp(logChoose(n, i) - n * Math.LN2);
  return Math.min(1, 2 * p);
}

function logChoose(n, k) {
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

function logFactorial(n) {
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}

/**
 * Autocorrelation r(k) for k = 0..maxLag.
 */
export function autocorrelation(xs, maxLag) {
  const { r } = crossCorrelation(xs, xs, maxLag);
  return r.slice(maxLag); // lags 0..maxLag
}

/**
 * Dominant period of an oscillating series: the lag of the first local
 * maximum of the autocorrelation after it has dipped below zero. Returns
 * NaN if no such peak exists within maxLag (the series is not oscillating).
 */
export function dominantPeriod(xs, maxLag) {
  const ac = autocorrelation(xs, maxLag);
  let k = 1;
  while (k < ac.length && ac[k] > 0) k++; // walk down to the first trough region
  if (k >= ac.length) return NaN;
  let best = -1;
  let bestR = -Infinity;
  for (; k < ac.length - 1; k++) {
    if (ac[k] > ac[k - 1] && ac[k] >= ac[k + 1] && ac[k] > bestR) {
      best = k;
      bestR = ac[k];
      // first clear peak is the period; keep scanning only while rising
      break;
    }
  }
  return best > 0 ? best : NaN;
}

/**
 * Separation index of two confidence-interval series: the first index from
 * which the intervals never overlap again through the end of the series.
 * a, b: arrays of { lo, hi } of equal length. Returns -1 if they overlap at
 * the last index (never separated, or separated and rejoined).
 */
export function separationIndex(a, b) {
  let idx = -1;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const overlap = a[i].lo <= b[i].hi && b[i].lo <= a[i].hi;
    if (overlap) idx = -1;
    else if (idx < 0) idx = i;
  }
  return idx;
}
