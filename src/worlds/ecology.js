/**
 * Ecology: an evolving predator-prey ecosystem on a grid.
 *
 * This is the hero world. Three layers share one toroidal lattice:
 *
 *   food    a slowly regrowing resource, capped by a static fertility map
 *   trail   a chemical that grazers deposit; it diffuses and evaporates,
 *           exactly like the trail in Physarum (slime mould) models
 *   agents  at most one organism per cell, either a GRAZER or a HUNTER
 *
 * Grazers eat food and follow trail (their own species' scent), which makes
 * them form the branching networks slime moulds are famous for. Hunters eat
 * grazers and track the same trail to find them. Every organism carries a
 * small genome of GENES floats in [0, 1]. When it reproduces the child gets a
 * mutated copy. Nothing external judges fitness: an organism's genes shape
 * how it moves, eats and breeds, and the population that results is the
 * outcome of selection. Evolution is inside the world, not applied to it.
 *
 * Genome layout (both kinds use the same slots, interpreted per kind):
 *   0  trail affinity     grazer: attraction to trail (-1..1 after mapping)
 *                         hunter: attraction to trail when no prey adjacent
 *   1  food/prey drive    grazer: attraction to food
 *                         hunter: how strongly adjacent prey are preferred
 *   2  deposit rate       grazer: trail laid per step   hunter: unused
 *   3  reproduction       energy threshold to split, mapped per kind
 *   4  marker             NEUTRAL. Has no effect on behaviour. It is the
 *                         colour of the organism, so lineages are visible.
 *                         Because it is neutral it drifts; that is a feature
 *                         the selection-vs-drift experiment relies on.
 *
 * Presentation-only state: two "tint" fields carry the cosine and sine of the
 * hue of whoever deposited trail, diffusing and evaporating exactly like the
 * trail. They let the glow take the colour of the lineage that laid it. They
 * are never read by any behaviour and are excluded from the fingerprint, so
 * the golden-fingerprint test proves they cannot change the dynamics.
 *
 * Update rule (one step):
 *   1. trail diffuses (5-point stencil) and evaporates
 *   2. food regrows toward the local fertility cap
 *   3. every organism, in a fresh random order, acts once:
 *      pay metabolic cost, eat, deposit, move to the best free neighbour,
 *      reproduce into a free neighbour if energy exceeds threshold, die if
 *      energy is exhausted
 *
 * Random order and one-action-per-organism make this an asynchronous
 * cellular automaton in the tradition of Wa-Tor (Dewdney, 1984).
 */

import { makeRng, valueNoise, hashBytes } from '../rng.js';
import { hsl, hslToRgb, rgba, clamp01 } from '../world.js';

export const EMPTY = 0;
export const GRAZER = 1;
export const HUNTER = 2;
export const GENES = 5;
export const G_TRAIL = 0;
export const G_DRIVE = 1;
export const G_DEPOSIT = 2;
export const G_REPRO = 3;
export const G_MARKER = 4;

export const DEFAULTS = Object.freeze({
  width: 128,
  height: 128,
  // fields
  diffusion: 0.18,
  evaporation: 0.03,
  foodGrowth: 0.012,
  fertilityCell: 24,
  // grazers
  grazerInit: 0.10,
  grazerCost: 0.018,
  bite: 0.12,
  foodValue: 1.0,
  grazerRepro: [0.9, 1.9], // threshold range mapped from gene 3
  grazerBirthEnergy: 0.5,
  // hunters
  hunterInit: 0.012,
  hunterCost: 0.05,
  efficiency: 0.7,
  hunterRepro: [1.6, 3.2],
  hunterBirthEnergy: 0.9,
  hunterMaxEnergy: 3.5,
  // evolution
  mutationSd: 0.06,
  // exploration noise added to movement scores
  noise: 0.05,
  // when true, behaviour ignores genes (uses a fixed reference genome)
  // while inheritance and mutation continue. Used to isolate selection.
  neutral: false,
});

const NEIGH = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], /* self */ [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

const REFERENCE_GENOME = new Float32Array([0.5, 0.5, 0.5, 0.5, 0.5]);

export class Ecology {
  constructor(options = {}) {
    this.params = { ...DEFAULTS, ...options };
    this.width = this.params.width;
    this.height = this.params.height;
    const n = this.width * this.height;
    this.food = new Float32Array(n);
    this.trail = new Float32Array(n);
    this.trailNext = new Float32Array(n);
    this.tintX = new Float32Array(n);
    this.tintY = new Float32Array(n);
    this.tintXNext = new Float32Array(n);
    this.tintYNext = new Float32Array(n);
    this.fertility = new Float32Array(n);
    this.kind = new Uint8Array(n);
    this.energy = new Float32Array(n);
    this.age = new Uint16Array(n);
    this.genome = new Float32Array(n * GENES);
    this.acted = new Uint8Array(n);
    this.order = new Uint32Array(n);
    for (let i = 0; i < n; i++) this.order[i] = i;
    this.neighbourOffsets = NEIGH;
    this.history = [];
    this.reset(this.params.seed ?? 1);
  }

  reset(seed = 1) {
    this.seed = seed;
    this.rng = makeRng(seed);
    this.tick = 0;
    const { width, height } = this;
    const n = width * height;
    const fert = valueNoise(width, height, this.rng, { cell: this.params.fertilityCell });
    for (let i = 0; i < n; i++) {
      // sharpen the noise into patches: fertile valleys and barren ridges
      const f = clamp01((fert[i] - 0.3) / 0.5);
      this.fertility[i] = 0.15 + 0.85 * f * f;
      this.food[i] = this.fertility[i] * 0.8;
      this.trail[i] = 0;
      this.tintX[i] = 0;
      this.tintY[i] = 0;
      this.kind[i] = EMPTY;
      this.energy[i] = 0;
      this.age[i] = 0;
    }
    this.genome.fill(0);
    for (let i = 0; i < n; i++) {
      const r = this.rng.next();
      if (r < this.params.grazerInit) this.spawn(i, GRAZER, null);
      else if (r < this.params.grazerInit + this.params.hunterInit) this.spawn(i, HUNTER, null);
    }
    this.history.length = 0;
    this.recordStats();
    return this;
  }

  /** Place a new organism at cell i. parentGenome null = random founder. */
  spawn(i, kind, parentGenome) {
    const p = this.params;
    this.kind[i] = kind;
    this.age[i] = 0;
    this.energy[i] = kind === GRAZER ? p.grazerBirthEnergy : p.hunterBirthEnergy;
    const g = i * GENES;
    if (parentGenome === null) {
      for (let k = 0; k < GENES; k++) this.genome[g + k] = this.rng.next();
    } else {
      for (let k = 0; k < GENES; k++) {
        const v = this.genome[parentGenome + k] + this.rng.gauss() * p.mutationSd;
        // reflect at the boundaries so mutation never leaves [0, 1]
        this.genome[g + k] = v < 0 ? -v : v > 1 ? 2 - v : v;
      }
    }
  }

  kill(i) {
    this.kind[i] = EMPTY;
    this.energy[i] = 0;
    this.age[i] = 0;
  }

  gene(i, k) {
    return this.params.neutral ? REFERENCE_GENOME[k] : this.genome[i * GENES + k];
  }

  step() {
    this.stepFields();
    this.stepAgents();
    this.tick++;
    this.recordStats();
    return this;
  }

  stepFields() {
    const { width, height, food, trail, trailNext, fertility, tintX, tintY, tintXNext, tintYNext } = this;
    const { diffusion, evaporation, foodGrowth } = this.params;
    const keep = 1 - evaporation;
    for (let y = 0; y < height; y++) {
      const yu = ((y - 1 + height) % height) * width;
      const yd = ((y + 1) % height) * width;
      const yc = y * width;
      for (let x = 0; x < width; x++) {
        const xl = (x - 1 + width) % width;
        const xr = (x + 1) % width;
        const i = yc + x;
        const lap = trail[yu + x] + trail[yd + x] + trail[yc + xl] + trail[yc + xr] - 4 * trail[i];
        trailNext[i] = (trail[i] + diffusion * lap) * keep;
        const lx = tintX[yu + x] + tintX[yd + x] + tintX[yc + xl] + tintX[yc + xr] - 4 * tintX[i];
        tintXNext[i] = (tintX[i] + diffusion * lx) * keep;
        const ly = tintY[yu + x] + tintY[yd + x] + tintY[yc + xl] + tintY[yc + xr] - 4 * tintY[i];
        tintYNext[i] = (tintY[i] + diffusion * ly) * keep;
        food[i] += foodGrowth * (fertility[i] - food[i]);
      }
    }
    this.trail = trailNext;
    this.trailNext = trail;
    this.tintX = tintXNext;
    this.tintXNext = tintX;
    this.tintY = tintYNext;
    this.tintYNext = tintY;
  }

  stepAgents() {
    const { width, height, kind, energy, food, trail, acted, order, rng } = this;
    const p = this.params;
    const n = width * height;
    acted.fill(0);
    rng.shuffle(order);
    for (let o = 0; o < n; o++) {
      const i = order[o];
      const k = kind[i];
      if (k === EMPTY || acted[i]) continue;
      acted[i] = 1;
      this.age[i]++;
      const x = i % width;
      const y = (i - x) / width;

      if (k === GRAZER) {
        energy[i] -= p.grazerCost;
        // eat
        const bite = Math.min(food[i], p.bite);
        food[i] -= bite;
        energy[i] += bite * p.foodValue;
        // deposit trail in proportion to what was eaten: trail is a signal
        // that says "there was food here", which is why following it can pay
        const deposit = this.gene(i, G_DEPOSIT) * bite * 4;
        trail[i] += deposit;
        if (deposit > 0) {
          const hue = this.genome[i * GENES + G_MARKER] * 6.283185307179586;
          this.tintX[i] += deposit * Math.cos(hue);
          this.tintY[i] += deposit * Math.sin(hue);
        }
        if (energy[i] <= 0) {
          this.kill(i);
          continue;
        }
        // move: score free neighbours by trail and food
        const tAff = this.gene(i, G_TRAIL) * 2 - 1;
        const fAff = this.gene(i, G_DRIVE);
        let best = -1;
        let bestScore = tAff * trail[i] + fAff * food[i]; // staying put
        for (let d = 0; d < 8; d++) {
          const j = this.neighbour(x, y, d);
          if (kind[j] !== EMPTY) continue;
          const s = tAff * trail[j] + fAff * food[j] + rng.next() * p.noise;
          if (s > bestScore) {
            bestScore = s;
            best = j;
          }
        }
        let here = i;
        if (best >= 0) {
          this.move(i, best);
          here = best;
        }
        // reproduce
        const thr = p.grazerRepro[0] + this.gene(here, G_REPRO) * (p.grazerRepro[1] - p.grazerRepro[0]);
        if (energy[here] >= thr) this.reproduce(here, GRAZER);
      } else {
        energy[i] -= p.hunterCost;
        if (energy[i] <= 0) {
          this.kill(i);
          continue;
        }
        // hunt: prefer adjacent grazers, weighted by drive; otherwise follow scent
        const drive = this.gene(i, G_DRIVE);
        const tAff = this.gene(i, G_TRAIL);
        let prey = -1;
        let preyScore = -Infinity;
        let free = -1;
        let freeScore = tAff * trail[i];
        for (let d = 0; d < 8; d++) {
          const j = this.neighbour(x, y, d);
          if (kind[j] === GRAZER) {
            const s = drive * energy[j] + rng.next() * p.noise;
            if (s > preyScore) {
              preyScore = s;
              prey = j;
            }
          } else if (kind[j] === EMPTY) {
            const s = tAff * trail[j] + rng.next() * p.noise;
            if (s > freeScore) {
              freeScore = s;
              free = j;
            }
          }
        }
        let here = i;
        if (prey >= 0 && rng.next() < 0.5 + 0.5 * drive) {
          energy[i] = Math.min(p.hunterMaxEnergy, energy[i] + energy[prey] * p.efficiency);
          this.kill(prey);
          this.move(i, prey);
          here = prey;
        } else if (free >= 0) {
          this.move(i, free);
          here = free;
        }
        const thr = p.hunterRepro[0] + this.gene(here, G_REPRO) * (p.hunterRepro[1] - p.hunterRepro[0]);
        if (energy[here] >= thr) this.reproduce(here, HUNTER);
      }
    }
  }

  neighbour(x, y, d) {
    const [dx, dy] = NEIGH[d];
    const nx = (x + dx + this.width) % this.width;
    const ny = (y + dy + this.height) % this.height;
    return ny * this.width + nx;
  }

  /** Move organism at i into empty cell j, carrying state along. */
  move(i, j) {
    this.kind[j] = this.kind[i];
    this.energy[j] = this.energy[i];
    this.age[j] = this.age[i];
    this.acted[j] = 1;
    const gi = i * GENES;
    const gj = j * GENES;
    for (let k = 0; k < GENES; k++) this.genome[gj + k] = this.genome[gi + k];
    this.kill(i);
  }

  /** Split: parent at i gives half its energy to a mutated child nearby. */
  reproduce(i, kind) {
    const x = i % this.width;
    const y = (i - x) / this.width;
    const start = this.rng.int(8);
    for (let d = 0; d < 8; d++) {
      const j = this.neighbour(x, y, (start + d) % 8);
      if (this.kind[j] === EMPTY) {
        const half = this.energy[i] / 2;
        this.energy[i] = half;
        this.spawn(j, kind, i * GENES);
        this.energy[j] = half;
        this.acted[j] = 1;
        return j;
      }
    }
    return -1;
  }

  recordStats() {
    const s = this.stats();
    this.history.push(s);
    if (this.history.length > 4096) this.history.splice(0, this.history.length - 4096);
  }

  stats() {
    const { kind, energy, food, trail, genome } = this;
    const n = kind.length;
    let grazers = 0;
    let hunters = 0;
    let foodTotal = 0;
    let trailTotal = 0;
    const gSum = new Float64Array(GENES);
    const hSum = new Float64Array(GENES);
    let gEnergy = 0;
    for (let i = 0; i < n; i++) {
      foodTotal += food[i];
      trailTotal += trail[i];
      if (kind[i] === GRAZER) {
        grazers++;
        gEnergy += energy[i];
        for (let k = 0; k < GENES; k++) gSum[k] += genome[i * GENES + k];
      } else if (kind[i] === HUNTER) {
        hunters++;
        for (let k = 0; k < GENES; k++) hSum[k] += genome[i * GENES + k];
      }
    }
    const gMean = Array.from(gSum, (v) => (grazers ? v / grazers : NaN));
    const hMean = Array.from(hSum, (v) => (hunters ? v / hunters : NaN));
    return {
      tick: this.tick,
      grazers,
      hunters,
      food: foodTotal / n,
      trail: trailTotal / n,
      grazerEnergy: grazers ? gEnergy / grazers : 0,
      grazerGenes: gMean,
      hunterGenes: hMean,
    };
  }

  fingerprint() {
    return hashBytes(this.kind, this.energy, this.genome, this.food, this.trail);
  }

  /**
   * Paint the world.
   *   background  fertility as a dark earth tone, food as a faint green lift
   *   trail       a glow whose hue comes from the tint fields (the lineage
   *               that laid it) and whose saturation comes from how coherent
   *               that hue is locally: mixed lineages glow pale, one lineage
   *               glows in its own colour
   *   grazers     hue from the neutral marker gene, lightness from energy
   *   hunters     deep red, brightening toward orange with energy; kept darker
   *               than the grazers so a minority species does not dominate
   */
  paint(u32) {
    const { kind, energy, food, trail, genome, fertility, tintX, tintY } = this;
    const n = kind.length;
    for (let i = 0; i < n; i++) {
      const k = kind[i];
      if (k === GRAZER) {
        const h = genome[i * GENES + G_MARKER] * 360;
        const l = 0.28 + 0.42 * clamp01(energy[i] / 1.5);
        u32[i] = hsl(h, 0.8, l);
      } else if (k === HUNTER) {
        const e = clamp01(energy[i] / 3);
        u32[i] = rgba(Math.round(110 + 120 * e), Math.round(22 + 48 * e), Math.round(20 + 14 * e));
      } else {
        const fert = fertility[i];
        const f = food[i];
        let r = 7 + 18 * fert;
        let g = 9 + 14 * fert + 26 * f;
        let b = 13 + 22 * fert;
        const t = trail[i];
        if (t > 0.004) {
          const tx = tintX[i];
          const ty = tintY[i];
          const mag = Math.sqrt(tx * tx + ty * ty);
          const coherence = clamp01(mag / t);
          const hue = (Math.atan2(ty, tx) * 57.29577951308232 + 360) % 360;
          // incoherent (mixed-lineage) trail stays a dim cool haze; a single
          // lineage's trail glows brighter in its own colour
          const glow = clamp01(t * 1.2) * (0.45 + 0.55 * coherence);
          const [gr, gg, gb] = hslToRgb(hue, 0.15 + 0.75 * coherence, 0.52 + 0.14 * coherence);
          r += glow * gr * 0.8;
          g += glow * gg * 0.8;
          b += glow * (gb * 0.8 + 40 * (1 - coherence));
        }
        u32[i] = rgba(Math.min(255, r | 0), Math.min(255, g | 0), Math.min(255, b | 0));
      }
    }
  }
}

export function createEcology(options) {
  return new Ecology(options);
}
