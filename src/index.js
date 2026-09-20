/** Registry of worlds. The page and experiments import from here. */
export { Ecology, createEcology, GRAZER, HUNTER, EMPTY, GENES, DEFAULTS as ECOLOGY_DEFAULTS } from './worlds/ecology.js';
export { Life, createLife, parseRule } from './worlds/life.js';
export { Elementary, createElementary } from './worlds/elementary.js';
export { GrayScott, createGrayScott, PRESETS as GS_PRESETS } from './worlds/grayscott.js';
export { makeRng, hashSeed, hashBytes, valueNoise } from './rng.js';
export * as stats from './stats.js';

import { createEcology } from './worlds/ecology.js';
import { createLife } from './worlds/life.js';
import { createElementary } from './worlds/elementary.js';
import { createGrayScott } from './worlds/grayscott.js';

export const WORLDS = {
  ecology: {
    name: 'Ecology',
    tagline: 'grazers, hunters and a slime-mould trail. Evolution happens inside the grid.',
    create: createEcology,
  },
  life: {
    name: 'Life-like',
    tagline: "Conway's Game of Life and its cousins, the classical cellular automaton.",
    create: createLife,
  },
  elementary: {
    name: 'Elementary',
    tagline: "Wolfram's 256 one-dimensional rules, time flowing downward.",
    create: createElementary,
  },
  grayscott: {
    name: 'Reaction',
    tagline: 'Gray-Scott reaction-diffusion: two chemicals, five regimes, patterns that divide like cells.',
    create: createGrayScott,
  },
};
