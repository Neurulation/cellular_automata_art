/**
 * Shared helpers for experiments: argument parsing, timing, result writing.
 * Every experiment writes a JSON file to experiments/results/ that the site
 * reads, and prints a human summary. Results carry the parameters and seeds
 * used so anyone can rerun them and get identical numbers.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RESULTS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'results');

export function quick() {
  return process.argv.includes('--quick') || process.env.QUICK === '1';
}

export function writeResult(name, data) {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const path = join(RESULTS_DIR, `${name}.json`);
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
  return path;
}

export function seeds(n, prefix) {
  return Array.from({ length: n }, (_, i) => `${prefix}-${i + 1}`);
}

export const fmt = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : String(v));

export function timer() {
  const t0 = Date.now();
  return () => (Date.now() - t0) / 1000;
}
