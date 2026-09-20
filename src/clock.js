/**
 * Fixed-timestep clock: converts wall-clock time into a whole number of
 * simulation steps at a given rate, independent of how often it is asked.
 *
 * Why this exists: an animation loop runs once per display refresh, and
 * refresh rates differ (60, 120, 144 Hz). If the world stepped once per
 * frame, it would run twice as fast on a 120 Hz monitor. This clock carries
 * a fractional remainder between calls so that over any interval the number
 * of steps is rate × seconds, rounded down, on every display.
 *
 * Pure and testable; the page owns the only instance.
 */
export function makeStepClock({ rate = 10, maxStepsPerCall = 60, maxDt = 0.25 } = {}) {
  let acc = 0;
  const clock = {
    rate,
    /** Steps to run for `dt` seconds of elapsed time. Never negative. */
    advance(dt) {
      if (!(dt > 0)) return 0;
      acc += Math.min(maxDt, dt) * clock.rate;
      let n = Math.floor(acc);
      if (n > maxStepsPerCall) n = maxStepsPerCall;
      acc -= n;
      if (acc > maxStepsPerCall) acc = 0; // drop the backlog after a stall
      return n;
    },
    /** Forget any accumulated fraction (after pause or reset). */
    reset() {
      acc = 0;
    },
    get pending() {
      return acc;
    },
  };
  return clock;
}

/**
 * Logarithmic slider mapping: position 0..100 ↔ min..max steps per second.
 * Rates below 10 keep one decimal so the slow end is usable (0.5, 0.7, 1.2 …);
 * above 10 they are whole numbers.
 */
export const RATE_MIN = 0.5;
export const RATE_MAX = 240;
export function sliderToRate(v, min = RATE_MIN, max = RATE_MAX) {
  const r = min * (max / min) ** (Math.max(0, Math.min(100, v)) / 100);
  return r < 10 ? Math.round(r * 10) / 10 : Math.round(r);
}
export function rateToSlider(rate, min = RATE_MIN, max = RATE_MAX) {
  const r = Math.max(min, Math.min(max, rate));
  return Math.round((100 * Math.log(r / min)) / Math.log(max / min));
}
