/**
 * The page. Wires a World to a canvas, the controls, the live chart, and
 * loads the cycle log and experiment results. Everything that is not DOM
 * lives in ../src so it can be tested in Node.
 */
import { WORLDS } from '../src/index.js';
import { makeStepClock, sliderToRate, rateToSlider } from '../src/clock.js';
import { lineChart, intervalChart, legend, fmtNum } from './charts.js';

const REPO = 'Neurulation/cellular_automata_art';
const $ = (sel) => document.querySelector(sel);

const COLORS = {
  grazer: 'var(--series-grazer)',
  hunter: 'var(--series-hunter)',
  selection: 'var(--series-selection)',
  neutral: 'var(--series-neutral)',
};

// ---------------------------------------------------------------- state
const state = {
  kind: 'ecology',
  seed: randomSeed(),
  running: true,
  rate: 10, // world steps per second, independent of the display refresh rate
  measuredRate: 0,
  world: null,
  frame: 0,
  fps: 0,
  lifeRule: 'B3/S23',
  elementaryRule: 30,
  exposure: false,
};
window.perpetual = state; // for debugging and reproducible screenshots

function randomSeed() {
  const words = ['moss', 'ember', 'tide', 'quartz', 'fern', 'dusk', 'lichen', 'basalt', 'aurora', 'kelp', 'spore', 'drift'];
  return `${words[Math.floor(Math.random() * words.length)]}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function readHash() {
  const h = location.hash.replace(/^#/, '');
  if (!h) return;
  const [kind, ...rest] = h.split('/');
  if (WORLDS[kind]) state.kind = kind;
  if (rest.length) {
    const opt = decodeURIComponent(rest.join('/'));
    if (kind === 'life' && /^B\d*\/S\d*$/i.test(opt.split(':')[0])) {
      const [rule, seed] = opt.split(':');
      state.lifeRule = rule.toUpperCase();
      if (seed) state.seed = seed;
    } else if (kind === 'elementary' && /^\d+/.test(opt)) {
      const [rule, seed] = opt.split(':');
      state.elementaryRule = +rule & 255;
      if (seed) state.seed = seed;
    } else state.seed = opt;
  }
}

function writeHash() {
  let s = state.kind;
  if (state.kind === 'life') s += `/${state.lifeRule}:${state.seed}`;
  else if (state.kind === 'elementary') s += `/${state.elementaryRule}:${state.seed}`;
  else s += `/${state.seed}`;
  history.replaceState(null, '', `#${encodeURIComponent(s).replace(/%2F/g, '/').replace(/%3A/g, ':')}`);
}

// ---------------------------------------------------------------- world + canvas
const canvas = $('#world');
const ctx = canvas.getContext('2d', { alpha: false });
let off = document.createElement('canvas');
let offCtx = off.getContext('2d');
let image = null;
let pixels = null;

function makeWorld() {
  const size = 192;
  let w;
  if (state.kind === 'ecology') w = WORLDS.ecology.create({ width: size, height: size, seed: state.seed });
  else if (state.kind === 'life') w = WORLDS.life.create({ width: size, height: size, seed: state.seed, rule: state.lifeRule });
  else w = WORLDS.elementary.create({ width: 320, height: 200, seed: state.seed, rule: state.elementaryRule, init: 'single' });
  state.world = w;
  off.width = w.width;
  off.height = w.height;
  offCtx = off.getContext('2d');
  image = offCtx.createImageData(w.width, w.height);
  pixels = new Uint32Array(image.data.buffer);
  $('.canvas-wrap').style.aspectRatio = `${w.width} / ${w.height}`;
  history_ = [];
  writeHash();
  syncControls();
  fitCanvas();
  draw();
}

function fitCanvas() {
  const wrap = canvas.parentElement;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = Math.round(wrap.clientWidth * dpr);
  const ch = Math.round(wrap.clientHeight * dpr);
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }
}
new ResizeObserver(fitCanvas).observe(canvas.parentElement);

function draw() {
  const w = state.world;
  w.paint(pixels);
  offCtx.putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = false;
  // long exposure: let the previous frame linger so motion leaves streaks
  ctx.globalAlpha = state.exposure && state.kind === 'ecology' ? 0.28 : 1;
  ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1;
}

/**
 * Fixed-timestep loop (see src/clock.js). The world advances by
 * (elapsed seconds × rate) steps per frame, so it runs at the same speed on
 * a 60 Hz and a 144 Hz display.
 */
const clock = makeStepClock({ rate: state.rate });
let history_ = [];
let lastT = performance.now();
let lastFrame = performance.now();
let frames = 0;
let stepsSince = 0;
function loop(t) {
  const dt = (t - lastFrame) / 1000;
  lastFrame = t;
  if (state.running) {
    clock.rate = state.rate;
    const n = clock.advance(dt);
    if (n > 0) {
      for (let i = 0; i < n; i++) {
        state.world.step();
        recordLive();
      }
      stepsSince += n;
      draw();
    }
  } else {
    clock.reset();
  }
  frames++;
  if (t - lastT > 500) {
    state.fps = Math.round((frames * 1000) / (t - lastT));
    state.measuredRate = Math.round((stepsSince * 1000) / (t - lastT));
    frames = 0;
    stepsSince = 0;
    lastT = t;
    updateReadout();
  }
  requestAnimationFrame(loop);
}

let lastLiveDraw = 0;
function recordLive() {
  const s = state.world.stats();
  history_.push(s);
  if (history_.length > 600) history_.shift();
  const now = performance.now();
  if (now - lastLiveDraw > 250) {
    lastLiveDraw = now;
    drawLive();
  }
}

// ---------------------------------------------------------------- readout + live chart
function updateReadout() {
  const s = state.world.stats();
  $('#tick').textContent = s.tick.toLocaleString();
  $('#fps').textContent = `${state.measuredRate} steps/s · ${state.fps} fps`;
  const kind = state.kind;
  const ro = $('#readout');
  if (kind === 'ecology') {
    ro.innerHTML = `
      <div><div class="k">Grazers</div><div class="v grazer">${s.grazers}</div></div>
      <div><div class="k">Hunters</div><div class="v hunter">${s.hunters}</div></div>
      <div><div class="k">Food</div><div class="v">${(s.food * 100).toFixed(0)}%</div></div>`;
    const names = ['trail affinity', 'drive', 'deposit', 'reproduce at', 'marker (neutral)'];
    $('#genes').innerHTML = names
      .map(
        (n, i) => `<span class="muted">${n}</span><div class="bar">
          <i class="g" style="left:${(s.grazerGenes[i] * 100 || 0).toFixed(1)}%"></i>
          <i class="h" style="left:${(s.hunterGenes[i] * 100 || 0).toFixed(1)}%"></i></div>`,
      )
      .join('');
    $('#genes-wrap').hidden = false;
  } else if (kind === 'life') {
    ro.innerHTML = `
      <div><div class="k">Population</div><div class="v">${s.population}</div></div>
      <div><div class="k">Rule</div><div class="v">${state.world.rule}</div></div>
      <div><div class="k">Density</div><div class="v">${((s.population / (state.world.width * state.world.height)) * 100).toFixed(1)}%</div></div>`;
    $('#genes-wrap').hidden = true;
  } else {
    ro.innerHTML = `
      <div><div class="k">Rule</div><div class="v">${state.world.rule}</div></div>
      <div><div class="k">Density</div><div class="v">${(s.density * 100).toFixed(1)}%</div></div>
      <div><div class="k">Width</div><div class="v">${state.world.width}</div></div>`;
    $('#genes-wrap').hidden = true;
  }
}

function drawLive() {
  const host = $('#live');
  host.innerHTML = '';
  if (history_.length < 4) return;
  const xs = history_.map((s) => s.tick);
  let series;
  if (state.kind === 'ecology') {
    series = [
      { name: 'grazers', color: COLORS.grazer, xs, ys: history_.map((s) => s.grazers) },
      { name: 'hunters', color: COLORS.hunter, xs, ys: history_.map((s) => s.hunters) },
    ];
  } else if (state.kind === 'life') {
    series = [{ name: 'population', color: COLORS.grazer, xs, ys: history_.map((s) => s.population) }];
  } else {
    series = [{ name: 'density', color: COLORS.grazer, xs, ys: history_.map((s) => s.density) }];
  }
  const w = Math.max(300, host.clientWidth || 330);
  host.append(lineChart(series, { width: w, height: Math.round(w * 0.4), xLabel: 'step' }));
  if (series.length > 1) host.append(legend(series));
}

// ---------------------------------------------------------------- controls
function syncControls() {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.kind === state.kind));
  $('#seed').value = state.seed;
  $('#play').textContent = state.running ? 'Pause' : 'Play';
  $('#speed').value = rateToSlider(state.rate);
  $('#speed-v').textContent = `${state.rate} steps/s`;
  $('#life-opts').hidden = state.kind !== 'life';
  $('#elementary-opts').hidden = state.kind !== 'elementary';
  $('#life-rule').value = state.lifeRule;
  $('#elementary-rule').value = state.elementaryRule;
  $('#world-tagline').textContent = WORLDS[state.kind].tagline;
  $('#exposure').checked = state.exposure;
  $('#exposure-wrap').hidden = state.kind !== 'ecology';
  document.querySelectorAll('[data-explain]').forEach((n) => (n.hidden = n.dataset.explain !== state.kind));
}

document.querySelectorAll('.tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    state.kind = b.dataset.kind;
    makeWorld();
  }),
);
$('#play').addEventListener('click', () => {
  state.running = !state.running;
  syncControls();
});
$('#step').addEventListener('click', () => {
  state.world.step();
  draw();
  recordLive();
  updateReadout();
});
$('#reseed').addEventListener('click', () => {
  state.seed = randomSeed();
  makeWorld();
});
$('#seed').addEventListener('change', (e) => {
  state.seed = e.target.value.trim() || randomSeed();
  makeWorld();
});
$('#exposure').addEventListener('change', (e) => {
  state.exposure = e.target.checked;
  draw();
});
$('#speed').addEventListener('input', (e) => {
  state.rate = sliderToRate(+e.target.value);
  $('#speed-v').textContent = `${state.rate} steps/s`;
});
$('#life-rule').addEventListener('change', (e) => {
  try {
    WORLDS.life.create({ width: 4, height: 4, rule: e.target.value });
    state.lifeRule = e.target.value.toUpperCase();
    makeWorld();
  } catch {
    e.target.value = state.lifeRule;
  }
});
$('#elementary-rule').addEventListener('change', (e) => {
  state.elementaryRule = Math.max(0, Math.min(255, +e.target.value | 0));
  makeWorld();
});
document.querySelectorAll('[data-rule]').forEach((b) =>
  b.addEventListener('click', () => {
    if (state.kind === 'life') state.lifeRule = b.dataset.rule;
    else state.elementaryRule = +b.dataset.rule;
    makeWorld();
  }),
);
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    state.running = !state.running;
    syncControls();
  } else if (e.key === 'n') $('#reseed').click();
  else if (e.key === '.') $('#step').click();
  else if (e.key === '[' || e.key === ']') {
    const v = rateToSlider(state.rate) + (e.key === ']' ? 8 : -8);
    state.rate = sliderToRate(Math.max(0, Math.min(100, v)));
    syncControls();
  }
});
canvas.addEventListener('click', (ev) => {
  // click to poke the world: drop grazers / live cells / a seed cell
  const w = state.world;
  const r = canvas.getBoundingClientRect();
  const x = Math.floor(((ev.clientX - r.left) / r.width) * w.width);
  const y = Math.floor(((ev.clientY - r.top) / r.height) * w.height);
  if (state.kind === 'ecology') {
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const i = ((y + dy + w.height) % w.height) * w.width + ((x + dx + w.width) % w.width);
        if (w.kind[i] === 0 && Math.random() < 0.5) w.spawn(i, ev.shiftKey ? 2 : 1, null);
      }
  } else if (state.kind === 'life') {
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (Math.random() < 0.5) w.set(x + dx, y + dy, 1);
  }
  draw();
});

// ---------------------------------------------------------------- data: cycle log, build, github
async function loadJSON(path) {
  try {
    const r = await fetch(path, { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.statusText);
    return await r.json();
  } catch {
    return null;
  }
}

async function loadLoop() {
  const [cycles, build] = await Promise.all([loadJSON('data/cycles.json'), loadJSON('data/build.json')]);
  const host = $('#timeline');
  if (!cycles) {
    host.innerHTML = '<p class="muted">Could not load the cycle log.</p>';
    return;
  }
  $('#cycle-count').textContent = cycles.length;
  const latest = cycles.at(-1);
  if (latest) $('#cycle-pill').textContent = `cycle ${latest.cycle} · ${latest.date}`;
  if (build) $('#build-pill').textContent = `build ${build.sha.slice(0, 7)}`;
  host.innerHTML = '';
  for (const c of [...cycles].reverse()) {
    const div = document.createElement('article');
    div.className = 'cycle';
    div.innerHTML = `
      <div><div class="num">${String(c.cycle).padStart(2, '0')}</div><div class="date">${c.date}</div></div>
      <div>
        <h3>${esc(c.title)}</h3>
        <p>${esc(c.summary)}</p>
        <dl>
          <dt>Learned</dt><dd>${esc(c.learned)}</dd>
          <dt>Next</dt><dd>${esc(c.next)}</dd>
        </dl>
        <div class="links">
          ${c.issue ? `<a href="https://github.com/${REPO}/issues/${c.issue}">issue #${c.issue}</a>` : ''}
          ${c.pr ? `<a href="https://github.com/${REPO}/pull/${c.pr}">pull request #${c.pr}</a>` : ''}
        </div>
      </div>`;
    host.append(div);
  }
}

async function loadGitHub() {
  const [repo, runs] = await Promise.all([
    loadJSON(`https://api.github.com/repos/${REPO}`),
    loadJSON(`https://api.github.com/repos/${REPO}/actions/runs?per_page=1&branch=main&event=push`),
  ]);
  const host = $('#loopstats');
  if (!repo) return;
  const run = runs?.workflow_runs?.[0];
  const pills = [
    `<span class="pill"><span class="dot"></span>${repo.open_issues_count} open issues</span>`,
    run
      ? `<a class="pill ${run.conclusion === 'success' ? 'live' : run.conclusion ? 'bad' : ''}" href="${run.html_url}"><span class="dot"></span>latest CI: ${run.conclusion ?? run.status}</a>`
      : '',
    `<span class="pill"><span class="dot"></span>${repo.stargazers_count} stars</span>`,
    `<span class="pill"><span class="dot"></span>updated ${new Date(repo.pushed_at).toLocaleDateString()}</span>`,
  ];
  host.innerHTML = pills.join('');
}

// ---------------------------------------------------------------- data: experiments
async function loadScience() {
  const [lag, sel] = await Promise.all([loadJSON('experiments/results/predator_prey_lag.json'), loadJSON('experiments/results/selection_vs_drift.json')]);
  if (lag) renderLag(lag);
  if (sel) renderSelection(sel);
}

function verdictBadge(v) {
  const cls = v === 'supported' ? 'supported' : v?.startsWith('weak') ? 'weak' : 'no';
  return `<span class="verdict ${cls}">${v}</span>`;
}

function renderLag(r) {
  const host = $('#exp-lag');
  host.innerHTML = `
    <div>
      <div class="eyebrow">Experiment 1</div>
      <h3>${esc(r.title)} ${verdictBadge(r.verdict)}</h3>
      <p class="muted">${esc(r.question)}</p>
      <p><b>Plain version.</b> When there are lots of grazers, hunters do well and multiply. Then they eat the grazers down, and starve. So hunter numbers should rise and fall <em>after</em> grazer numbers. Predator-prey theory (Lotka and Volterra, 1920s) says the delay should be about a quarter of a cycle.</p>
      <div class="stat-grid">
        <div class="stat"><div class="k">runs coexisting</div><div class="v">${r.coexistence.coexisting}/${r.coexistence.runs}</div></div>
        <div class="stat"><div class="k">cycle period</div><div class="v">${fmtNum(r.period.mean, 0)} steps</div><div class="ci">95% CI [${fmtNum(r.period.lo, 0)}, ${fmtNum(r.period.hi, 0)}]</div></div>
        <div class="stat"><div class="k">hunter lag</div><div class="v">${fmtNum(r.lag.mean, 1)} steps</div><div class="ci">95% CI [${fmtNum(r.lag.lo, 1)}, ${fmtNum(r.lag.hi, 1)}]</div></div>
        <div class="stat"><div class="k">lag / period</div><div class="v">${(r.lagFraction.mean * 100).toFixed(0)}%</div><div class="ci">theory: 25%</div></div>
        <div class="stat"><div class="k">lag > 0</div><div class="v">${r.positiveLag.count}/${r.positiveLag.n}</div><div class="ci">sign test p = ${r.positiveLag.signTestP < 1e-4 ? '< 0.0001' : r.positiveLag.signTestP.toFixed(4)}</div></div>
      </div>
      <details><summary>Method and caveats</summary>
        <p>${r.params.runs} independent seeds on a ${r.params.grid} grid, ${r.params.burnIn} burn-in steps discarded, ${r.params.length} steps analysed. For each run the oscillation period is estimated from the first peak of the grazer autocorrelation, and the peak of corr(grazers[t], hunters[t+lag]) is searched within half a period on either side of zero. The window matters: periodic signals have correlation peaks one period apart, and a wider search can pick the previous cycle. The sign test is exact binomial against 50%. Confidence intervals use Student's t.</p>
        <p>Caveat: the runs share parameters, so this says the lag exists <em>at these settings</em>, not for every setting. A parameter sweep is on the horizon.</p>
      </details>
      <p class="small muted">Seeds and parameters are in <a href="experiments/results/predator_prey_lag.json">the result file</a>; the code is <a href="https://github.com/${REPO}/blob/main/experiments/predator_prey_lag.js">predator_prey_lag.js</a>. Generated ${new Date(r.generatedAt).toLocaleString()} in ${r.seconds.toFixed(0)}s.</p>
    </div>
    <div id="lag-charts"></div>`;
  const charts = $('#lag-charts');
  const tr = r.exampleTrace;
  const xs = tr.grazers.map((_, i) => r.params.burnIn + i * 10);
  charts.append(
    lineChart(
      [
        { name: 'grazers', color: COLORS.grazer, xs, ys: tr.grazers },
        { name: 'hunters', color: COLORS.hunter, xs, ys: tr.hunters },
      ],
      { width: 520, height: 200, title: `Population over time, seed ${r.runs[0].seed}`, xLabel: 'step' },
    ),
    legend([
      { name: 'grazers', color: COLORS.grazer },
      { name: 'hunters', color: COLORS.hunter },
    ]),
  );
  const cc = r.meanCrossCorrelation;
  charts.append(
    lineChart([{ name: 'mean r', color: COLORS.selection, xs: cc.lags, ys: cc.r }], {
      width: 520,
      height: 200,
      title: 'Cross-correlation averaged over runs',
      xLabel: 'lag (steps, hunters after grazers)',
      zeroLine: true,
      yDomain: [-1, 1],
      markers: [{ x: r.lag.mean, label: `peak ≈ ${fmtNum(r.lag.mean, 0)}` }],
    }),
  );
}

function renderSelection(r) {
  const host = $('#exp-sel');
  const row = (g) => `<tr class="${g.significant ? 'sig' : ''}"><td>${esc(g.name)}</td><td>${g.selection.mean.toFixed(3)}</td><td>${g.neutral.mean.toFixed(3)}</td><td>${g.cohensD.toFixed(2)}</td><td>${g.p < 1e-4 ? '<0.0001' : g.p.toFixed(4)}${g.significant ? ' *' : ''}</td></tr>`;
  host.innerHTML = `
    <div>
      <div class="eyebrow">Experiment 2</div>
      <h3>${esc(r.title)} ${verdictBadge(r.verdict)}</h3>
      <p class="muted">${esc(r.question)}</p>
      <p><b>Plain version.</b> Genes drift around by chance even when they do nothing. To show that the ecology is really <em>selecting</em>, we ran each world twice from the same seed: once normally, and once with the genes switched off (every creature behaves the same, but still passes on and mutates its genes). If the two versions end up with the same genes, it was all chance. They don't. One gene, the colour marker, is deliberately inert in both arms, and it comes out the same. That is the control.</p>
      <details><summary>What evolved, in words</summary>
        <p>Grazers evolve to <b>reproduce early</b> (threshold falls from ~0.5 to ~${r.grazer[3].selection.mean.toFixed(2)}) and to <b>avoid their own trail</b> (affinity falls to ~${r.grazer[0].selection.mean.toFixed(2)}, which maps to negative attraction), because a trail is where the food has already been eaten and where hunters look. Hunters evolve a <b>strong prey drive</b> (~${r.hunter[1].selection.mean.toFixed(2)}) and <b>late reproduction</b> (~${r.hunter[3].selection.mean.toFixed(2)}): store energy, breed when safe. An r-strategist prey and a K-strategist predator, without anyone writing that in.</p>
      </details>
      <details><summary>Method</summary>
        <p>${r.params.runs} seeds × 2 arms × ${r.params.steps} steps on a ${r.params.grid} grid. Population-mean gene value per run at the end. Per gene: difference in means, Cohen's d, and a two-sided permutation test (${r.params.permutations.toLocaleString()} shuffles, fixed seed). Significance at α = ${r.params.alpha} after which a gene is marked *. The verdict requires the neutral marker to be <em>not</em> significant and at least two behavioural grazer genes to be significant.</p>
      </details>
      <table class="genes-table">
        <thead><tr><th>grazer gene</th><th>selection</th><th>neutral</th><th>d</th><th>p</th></tr></thead>
        <tbody>${r.grazer.map(row).join('')}</tbody>
        <thead><tr><th>hunter gene</th><th>selection</th><th>neutral</th><th>d</th><th>p</th></tr></thead>
        <tbody>${r.hunter.map(row).join('')}</tbody>
      </table>
      <p class="small muted">Result file: <a href="experiments/results/selection_vs_drift.json">selection_vs_drift.json</a> · code: <a href="https://github.com/${REPO}/blob/main/experiments/selection_vs_drift.js">selection_vs_drift.js</a>.</p>
    </div>
    <div id="sel-charts"></div>`;
  const groups = [
    { name: 'selection', color: COLORS.selection },
    { name: 'neutral (genes off)', color: COLORS.neutral },
  ];
  const toRows = (arr) => arr.map((g) => ({ name: g.name, significant: g.significant, values: [g.selection, g.neutral] }));
  const charts = $('#sel-charts');
  charts.append(intervalChart(toRows(r.grazer), groups, { title: 'Grazer genes after evolution (mean, 95% CI)', xLabel: 'gene value' }));
  charts.append(intervalChart(toRows(r.hunter), groups, { title: 'Hunter genes after evolution (mean, 95% CI)', xLabel: 'gene value' }));
  charts.append(legend(groups));
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

// ---------------------------------------------------------------- boot
readHash();
makeWorld();
requestAnimationFrame(loop);
loadLoop();
loadGitHub();
loadScience();
window.addEventListener('hashchange', () => {
  readHash();
  makeWorld();
});
