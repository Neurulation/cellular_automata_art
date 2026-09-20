# Perpetual Ecology

[![CI](https://github.com/Neurulation/cellular_automata_art/actions/workflows/ci.yml/badge.svg)](https://github.com/Neurulation/cellular_automata_art/actions/workflows/ci.yml)
[![Pages](https://github.com/Neurulation/cellular_automata_art/actions/workflows/pages.yml/badge.svg)](https://neurulation.github.io/cellular_automata_art/)

**Live: [neurulation.github.io/cellular_automata_art](https://neurulation.github.io/cellular_automata_art/)**

An evolving predator-prey ecosystem on a cellular grid, and a demonstration
of agentic software engineering. An AI agent (Claude, via Claude Code) builds
and improves this project in a loop: issue, branch, tests, pull request, CI,
merge, deploy, retrospective, new issues. Every step is in this repository.
A human started the loop and can stop it. The art is what the loop leaves
behind.

## What is on the page

- **Ecology**, the hero. Grazers follow the scent of food and lay trail like
  a slime mould; hunters eat grazers. Every organism has a five-gene genome
  that shapes its behaviour and is inherited with mutation. Fitness is not
  computed by anyone: it is survival. Colour is a neutral gene, so you can
  watch lineages spread and die.
- **Life-like** rules (Conway's Life, HighLife, Day & Night, Seeds).
- **Elementary** rules (Wolfram's 256 one-dimensional automata).
- **The loop**: a timeline of every cycle the agent has run, with links to
  the issue and pull request for each.
- **The science**: two experiments with seeded runs, confidence intervals
  and verdicts computed from pre-registered criteria.

## Two claims, tested

| claim | evidence | verdict |
|-------|----------|---------|
| Hunter numbers lag grazer numbers by about a quarter cycle, as Lotka-Volterra predicts | 24 seeds, peak cross-correlation lag ≈ 29 steps of a ≈ 111-step period (26%); positive in 24/24 runs | supported |
| Genes change by selection, not just drift | 20 paired seeds, selection arm vs neutral arm; behavioural genes differ (p < 0.0001, Cohen's d 3–5), the inert marker gene does not | supported |

Exact numbers and CIs are in [`experiments/results/`](experiments/results/) and
rendered on the page. Definitions are in [`docs/methods.md`](docs/methods.md).

## The loop

See [`LOOP.md`](LOOP.md) for the protocol the agent follows and the checklist
it fills in on every pull request. The log of cycles is
[`data/cycles.json`](data/cycles.json). Open [issues](https://github.com/Neurulation/cellular_automata_art/issues)
are the plan; closed pull requests are the history.

## Run it yourself

No dependencies. Node 20 or newer.

```bash
npm test                          # 39 tests, about 2 seconds
node experiments/run_all.js       # regenerate results, about a minute
python3 -m http.server 8000       # open http://localhost:8000
```

## Layout

```
index.html          the page
web/                page-only code: app, charts, styles
src/                the engine: worlds, rng, stats (runs in Node and browser)
test/               node --test suites
experiments/        seeded experiments and their JSON results
data/cycles.json    the loop's log, rendered as the timeline
docs/methods.md     rigorous definitions
LOOP.md             the protocol
.github/workflows   CI (tests + quick experiments) and Pages deploy
```

## Why

Because "an agent can do software engineering" is easier to show than to
argue. This repository is the argument, one small verifiable cycle at a
time.

MIT licensed.
