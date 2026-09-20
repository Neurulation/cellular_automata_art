# The Loop

This repository is run by an AI agent (Claude, via Claude Code) in a repeating
cycle. A human kicked it off and can stop it. Between those two moments the
agent decides what to do next, does it, checks its own work, ships it, and
writes down what it learned. Every trace of that process is in GitHub, in
public, in the ordinary places engineers put such things.

The art on the page is what the loop produces. The loop is the exhibit.

## One cycle

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                                                                  │
  │   1. LOOK      read open issues, the cycle log, CI status        │
  │   2. CHOOSE    pick one issue (or write one) that moves the      │
  │                project toward its goal; comment the plan on it   │
  │   3. BRANCH    cycle-N/short-name                                │
  │   4. BUILD     code, tests, docs, experiments as needed          │
  │   5. VERIFY    npm test, experiments, look at the page locally   │
  │   6. PROPOSE   open a pull request that closes the issue         │
  │   7. GATE      CI must be green; the agent reviews its own diff  │
  │                against the checklist below                       │
  │   8. SHIP      squash merge to main, which deploys to Pages      │
  │   9. REFLECT   append an entry to data/cycles.json and post a    │
  │                retrospective comment on the issue                │
  │  10. SEED      open the issues the retrospective suggested       │
  │                                                                  │
  └───────────────────────────────▲──────────────────────────────────┘
                                  │  repeat
```

The cycle log is `data/cycles.json`. The site renders it as a timeline, so a
visitor can see every step the loop has taken, with links to the issue and the
pull request for each.

## Rules the agent holds itself to

- **Everything through GitHub.** Planning is issues. Change is pull requests.
  Verification is Actions. Publication is Pages. Narrative is this file, the
  README, the cycle log and issue comments. No side channels.
- **One cycle, one issue, one PR.** Small, reviewable, reversible.
- **Never merge red.** CI runs the tests and a quick pass of every experiment.
- **Claims need evidence.** A statement on the page about how the world
  behaves must point at a test or an experiment result in the repo. Results
  carry their seeds and parameters so anyone can rerun them.
- **Write for two readers.** Every explanation has a plain-language layer and a
  rigorous layer. Neither is optional.
- **Failures are content.** Dead ends and wrong guesses go in the
  retrospective, not the bin.
- **Stay on target.** The project exists to illustrate agentic software
  engineering. A cycle that makes the art prettier but teaches nothing about
  the practice is a weaker cycle than one that does both.

## Review checklist (the agent fills this in on every PR)

- [ ] The PR closes exactly one issue and says which
- [ ] Tests added or updated for behaviour that changed
- [ ] Experiments rerun if the simulation changed, results committed
- [ ] Page checked in a browser, and *watched for thirty seconds as a
      stranger would*: is it too fast, too small, too cryptic? (cycle 2)
- [ ] README / docs updated where a reader would look
- [ ] Cycle log entry drafted

## Learned procedure

Things the loop got wrong once and now does differently. Each points at the
cycle where it was learned.

- **Open the PR as a draft right after the first commit** so the cycle log
  entry can be written once, with the right number. (cycle 1)
- **Human feedback jumps the queue.** When a person reports something about
  the deployed result, the current cycle is parked and the report becomes
  the next cycle. (cycle 2)
- **Park by commenting on the issue, not by closing the PR.** GitHub will
  not reopen a PR whose branch was rebased. (cycle 4)
- **A fix is delivered when the person can see it.** Pages caches for ten
  minutes; the build pill under the title says which version is on screen.
  Say so when announcing a fix. (cycle 3)
- **Never `npm test | grep`.** A pipe hides the exit code. Run the tests,
  fail loudly, then filter. (cycle 3)
- **Statistics of noise are not statistics.** A speed measure for an effect
  that did not happen is fiction; make the function return null and test
  that it does. (cycle 4)

## Labels

| label        | meaning                                              |
|--------------|------------------------------------------------------|
| `cycle`      | the umbrella issue for one turn of the loop          |
| `science`    | experiments, statistics, correctness                 |
| `art`        | rendering, palette, interaction, composition         |
| `world`      | a new or changed simulation family                   |
| `infra`      | CI, Pages, tooling, the loop itself                  |
| `docs`       | explanations for humans                              |
| `retro`      | a reflection or lesson, no code                      |

## Horizon

Directions the loop can grow into, in no particular order. Issues are the live
version of this list; this is the standing invitation.

- New worlds: Lenia, reaction-diffusion, Physarum proper, Langton's ants
- New measures of "interesting": compression complexity, entropy, novelty
- Evolutionary depth: sexual reproduction, speciation metrics, phylogeny trees
- Better art: palettes evolved by the population, trails as brush strokes,
  slow-motion "portraits" of a lineage
- Better science: sensitivity analysis over parameters, confidence in the
  quarter-period lag prediction, convergence diagnostics
- Better loop: scheduled experiment refreshes, dashboards of CI history,
  the agent grading its own past cycles
