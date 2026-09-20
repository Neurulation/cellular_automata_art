/** Guard the cycle log: every entry needs the fields the site renders. */
import { readFileSync } from 'node:fs';
const cycles = JSON.parse(readFileSync(new URL('../data/cycles.json', import.meta.url), 'utf8'));
const required = ['cycle', 'title', 'date', 'issue', 'summary', 'learned', 'next'];
let ok = true;
cycles.forEach((c, i) => {
  for (const f of required) {
    if (c[f] === undefined || c[f] === '') {
      console.error(`cycle entry ${i} missing "${f}"`);
      ok = false;
    }
  }
  if (c.cycle !== i) {
    console.error(`cycle entry ${i} has cycle number ${c.cycle}; entries must be contiguous from 0`);
    ok = false;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date)) {
    console.error(`cycle entry ${i} date "${c.date}" is not YYYY-MM-DD`);
    ok = false;
  }
});
if (!ok) process.exit(1);
console.log(`cycles.json ok: ${cycles.length} entries`);
