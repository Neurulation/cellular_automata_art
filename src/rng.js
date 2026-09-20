/**
 * Deterministic pseudo-random number generation.
 *
 * Everything in this project that involves chance draws from one of these
 * generators, seeded explicitly. That is what makes every run, every test and
 * every experiment reproducible: same seed, same world, bit for bit.
 *
 * Algorithm: mulberry32 (Tommy Ettinger). 32-bit state, period 2^32, passes
 * the usual quick statistical checks and is plenty for simulation and art.
 */

/** Hash any string (or number) to a 32-bit unsigned integer (FNV-1a). */
export function hashSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const s = String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Create a generator. Returns an object with:
 *   next()      float in [0, 1)
 *   int(n)      integer in [0, n)
 *   range(a,b)  float in [a, b)
 *   gauss()     standard normal (Box-Muller)
 *   shuffle(a)  in-place Fisher-Yates
 *   state       current 32-bit state (for hashing / snapshots)
 */
export function makeRng(seed = 1) {
  let a = hashSeed(seed) || 0x9e3779b9;
  let spare = null;
  const rng = {
    next() {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(n) {
      return Math.floor(rng.next() * n);
    },
    range(lo, hi) {
      return lo + (hi - lo) * rng.next();
    },
    gauss() {
      if (spare !== null) {
        const v = spare;
        spare = null;
        return v;
      }
      let u, v, s;
      do {
        u = rng.next() * 2 - 1;
        v = rng.next() * 2 - 1;
        s = u * u + v * v;
      } while (s >= 1 || s === 0);
      const m = Math.sqrt((-2 * Math.log(s)) / s);
      spare = v * m;
      return u * m;
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
      }
      return arr;
    },
    get state() {
      return a >>> 0;
    },
  };
  return rng;
}

/**
 * Cheap value noise on a grid, in [0, 1]. Used for terrain / fertility maps.
 * Low-resolution random lattice, bilinearly interpolated, a few octaves.
 */
export function valueNoise(width, height, rng, { cell = 16, octaves = 3 } = {}) {
  const out = new Float32Array(width * height);
  let amp = 1;
  let total = 0;
  let c = cell;
  for (let o = 0; o < octaves; o++) {
    const gw = Math.ceil(width / c) + 1;
    const gh = Math.ceil(height / c) + 1;
    const lattice = new Float32Array(gw * gh);
    for (let i = 0; i < lattice.length; i++) lattice[i] = rng.next();
    for (let y = 0; y < height; y++) {
      const gy = y / c;
      const y0 = Math.floor(gy);
      const fy = smooth(gy - y0);
      for (let x = 0; x < width; x++) {
        const gx = x / c;
        const x0 = Math.floor(gx);
        const fx = smooth(gx - x0);
        const a = lattice[y0 * gw + x0];
        const b = lattice[y0 * gw + x0 + 1];
        const d = lattice[(y0 + 1) * gw + x0];
        const e = lattice[(y0 + 1) * gw + x0 + 1];
        const v = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
        out[y * width + x] += v * amp;
      }
    }
    total += amp;
    amp *= 0.5;
    c = Math.max(2, c >> 1);
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/** FNV-1a over a typed array's bytes. Used to fingerprint world state. */
export function hashBytes(...arrays) {
  let h = 0x811c9dc5;
  for (const arr of arrays) {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 0x01000193);
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
