# Methods

This note is the rigorous layer. The page gives the plain-language version;
this file gives the definitions a reader would need to check or reproduce
anything the project claims. It is updated whenever the simulation or an
experiment changes, in the same pull request.

## 1. The ecology model

### Lattice
A `W × H` toroidal grid (default 128 × 128 in experiments, 160 × 160 on the
page). Cell index `i = y·W + x`. Neighbourhood: Moore (8 cells).

### Fields
- **Fertility** `F_i ∈ [0.15, 1]`: static. Value noise (3 octaves, lattice
  spacing 24) sharpened as `0.15 + 0.85·clamp((n − 0.3)/0.5)²`.
- **Food** `f_i ∈ [0, F_i]`: `f_i ← f_i + g·(F_i − f_i)`, `g = 0.012`.
  Grazers remove up to `b = 0.12` per step.
- **Trail** `τ_i ≥ 0`: `τ ← (τ + D·∇²τ)·(1 − e)` with the five-point
  Laplacian, `D = 0.18`, `e = 0.03`. Grazers add `4·b_eaten·G_deposit`.

### Organisms
At most one per cell. State: kind (grazer or hunter), energy `E > 0`, age,
genome `G ∈ [0,1]⁵`.

| gene | grazer meaning | hunter meaning |
|------|----------------|----------------|
| G₀ | trail affinity `a = 2G₀ − 1` | trail affinity `a = G₀` |
| G₁ | food affinity | prey drive |
| G₂ | trail deposit rate | unused |
| G₃ | reproduction threshold `0.9 + G₃` | reproduction threshold `1.6 + 1.6·G₃` |
| G₄ | **neutral**: colour only | **neutral**: colour only |

### Update (one step)
1. Fields update as above.
2. Organisms act once each in a uniformly random order (Fisher-Yates on the
   seeded generator). A flag prevents an organism that moved into a not yet
   visited cell from acting twice.
3. **Grazer**: `E −= 0.018`; eat `min(f_i, b)`, `E += eaten`; deposit; if
   `E ≤ 0` die. Score each free neighbour `j` as `a·τ_j + G₁·f_j + 0.05·U`
   (`U` uniform noise) and the current cell as `a·τ_i + G₁·f_i`; move to the
   maximum if it is a neighbour. If `E ≥ threshold`, split: a free neighbour
   receives a child with `E/2` and a mutated genome; the parent keeps `E/2`.
4. **Hunter**: `E −= 0.05`; if `E ≤ 0` die. Among adjacent grazers choose the
   one maximising `G₁·E_prey + 0.05·U`; capture with probability
   `0.5 + 0.5·G₁`; on capture `E ← min(3.5, E + 0.7·E_prey)`, the prey dies,
   the hunter moves in. Otherwise move to the free neighbour maximising
   `a·τ_j + 0.05·U` if it beats staying. Split as for grazers.
5. **Mutation**: `G'_k = reflect(G_k + N(0, 0.06²))` into `[0, 1]`.

### Initialisation
Each cell independently becomes a grazer with probability 0.10 or a hunter
with probability 0.012, with uniform random genomes; food starts at
`0.8·F_i`.

### Neutral arm
With `neutral: true` every behavioural read of a gene returns 0.5 (the
reference genome) while stored genomes are still inherited and mutated. This
removes selection on genes without changing anything else in the dynamics,
which is what makes the paired comparison in Experiment 2 fair.

## 2. Statistics

All in `src/stats.js`, all unit tested against hand calculations.

- **Confidence intervals**: `m ± t₀.₉₇₅(n−1)·s/√n`, Student's t from a
  table for `df ≤ 30`, normal approximation beyond.
- **Cross-correlation**: `r(k) = Σ (a_t − ā)(b_{t+k} − b̄) / √(Σ(a−ā)² Σ(b−b̄)²)`,
  overlapping range only. Positive `k` means `b` follows `a`.
- **Dominant period**: lag of the first local maximum of the
  autocorrelation after it first drops below zero.
- **Permutation test**: two-sided, on the difference of means, with a fixed
  seed and `(count + 1)/(N + 1)` as the p-value so it is never exactly zero.
- **Sign test**: exact binomial, two-sided, against `p₀ = 0.5`.
- **Cohen's d**: pooled standard deviation.

## 3. Experiments

Each experiment is a script in `experiments/`, writes a JSON result to
`experiments/results/`, and records the seeds and parameters it used. CI
runs them with `--quick` to catch breakage; committed results come from the
full settings. Verdicts are computed by the script from pre-registered
criteria written in the script header, not chosen after looking.

### E1: predator-prey lag (`predator_prey_lag.js`)
- **Prediction** (Lotka-Volterra): predator peaks trail prey peaks by a
  quarter period.
- **Design**: 24 seeds, 96 × 96, 400 burn-in, 2000 analysed steps. Per run:
  period `P` from grazer autocorrelation; peak lag of `corr(grazers, hunters)`
  searched in `(−P/2, P/2]`.
- **Criteria**: supported if the sign test on `lag > 0` has `p < 0.05` and
  the CI of the mean lag excludes 0.
- **Known limitation**: a single parameter setting. The lag-fraction
  statistic (lag / period) is reported so the quarter-period prediction can
  be compared directly; a sweep across parameters is future work.

### E2: selection versus drift (`selection_vs_drift.js`)
- **Prediction**: behavioural genes differ between the selection and
  neutral arms; the neutral marker does not.
- **Design**: 20 seeds × 2 arms × 2500 steps, 96 × 96. Per gene: difference
  of population means, Cohen's d, permutation p (10 000 shuffles).
- **Criteria**: supported if the marker gene is not significant at
  `α = 0.01` and at least two grazer behavioural genes are.
- **Known limitation**: end-of-run snapshot; the time course of divergence
  is not yet measured.

## 4. Reproducing

```
npm test                       # all tests, about two seconds
node experiments/run_all.js    # full experiments, about a minute
node experiments/run_all.js --quick
python3 -m http.server 8000    # then open http://localhost:8000
```

The seeds in the result files are strings; `makeRng` hashes them with FNV-1a,
so a result can be reproduced from the JSON alone.
