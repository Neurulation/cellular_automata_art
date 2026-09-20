/**
 * Tiny SVG chart helpers. No library: the charts are simple enough that a
 * few hundred lines of plain DOM is clearer than a dependency, and it keeps
 * the page working offline and forever.
 *
 * Conventions (from the project's data-viz rules): one y axis per chart,
 * thin 2px lines, colour follows the entity (grazers are always green,
 * hunters always orange), legends always present for two or more series,
 * hover tooltips on every plot.
 */

const NS = 'http://www.w3.org/2000/svg';

export function el(name, attrs = {}, children = []) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) node.append(c);
  return node;
}

export function scale(domain, range) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const f = (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
  f.invert = (r) => d0 + ((r - r0) / (r1 - r0 || 1)) * (d1 - d0);
  return f;
}

export function niceTicks(lo, hi, n = 5) {
  const span = hi - lo || 1;
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

let tipEl = null;
function tip() {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'tip';
    document.body.append(tipEl);
  }
  return tipEl;
}
export function showTip(x, y, html) {
  const t = tip();
  t.innerHTML = html;
  t.style.display = 'block';
  const w = t.offsetWidth;
  t.style.left = `${Math.min(window.innerWidth - w - 8, x + 12)}px`;
  t.style.top = `${y + 12}px`;
}
export function hideTip() {
  if (tipEl) tipEl.style.display = 'none';
}

/**
 * Multi-series line chart.
 * series: [{ name, color, xs, ys }], all sharing one y axis.
 * opts: { width, height, xLabel, yLabel, title, markers: [{x, label}], zeroLine }
 */
export function lineChart(series, opts = {}) {
  const W = opts.width ?? 520;
  const H = opts.height ?? 220;
  const m = { top: opts.title ? 28 : 12, right: 16, bottom: 34, left: 46 };
  const allX = series.flatMap((s) => s.xs);
  const allY = series.flatMap((s) => s.ys).filter(Number.isFinite);
  const xlo = opts.xDomain?.[0] ?? Math.min(...allX);
  const xhi = opts.xDomain?.[1] ?? Math.max(...allX);
  let ylo = opts.yDomain?.[0] ?? Math.min(0, ...allY);
  let yhi = opts.yDomain?.[1] ?? Math.max(...allY);
  if (ylo === yhi) yhi = ylo + 1;
  const pad = (yhi - ylo) * 0.05;
  const x = scale([xlo, xhi], [m.left, W - m.right]);
  const y = scale([ylo - (ylo < 0 ? pad : 0), yhi + pad], [H - m.bottom, m.top]);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': opts.title ?? 'chart' });

  const grid = el('g', { class: 'grid' });
  for (const t of niceTicks(y.invert(H - m.bottom), y.invert(m.top), 4)) {
    grid.append(el('line', { x1: m.left, x2: W - m.right, y1: y(t), y2: y(t) }));
    grid.append(el('text', { x: m.left - 6, y: y(t) + 3, 'text-anchor': 'end' }, [String(opts.yFormat ? opts.yFormat(t) : t)]));
  }
  svg.append(grid);
  const axis = el('g', { class: 'axis' });
  axis.append(el('line', { x1: m.left, x2: W - m.right, y1: H - m.bottom, y2: H - m.bottom }));
  for (const t of niceTicks(xlo, xhi, 6)) {
    axis.append(el('text', { x: x(t), y: H - m.bottom + 14, 'text-anchor': 'middle' }, [String(t)]));
  }
  if (opts.xLabel) axis.append(el('text', { x: (m.left + W - m.right) / 2, y: H - 4, 'text-anchor': 'middle' }, [opts.xLabel]));
  if (opts.yLabel) axis.append(el('text', { x: 8, y: m.top - 6, 'text-anchor': 'start' }, [opts.yLabel]));
  svg.append(axis);
  if (opts.zeroLine && ylo < 0) svg.append(el('line', { x1: m.left, x2: W - m.right, y1: y(0), y2: y(0), stroke: 'var(--text-3)', 'stroke-width': 1 }));
  if (opts.title) svg.append(el('text', { x: m.left, y: 16, class: 'title' }, [opts.title]));

  for (const s of series) {
    let d = '';
    for (let i = 0; i < s.xs.length; i++) {
      if (!Number.isFinite(s.ys[i])) continue;
      d += `${d ? 'L' : 'M'}${x(s.xs[i]).toFixed(1)},${y(s.ys[i]).toFixed(1)}`;
    }
    svg.append(el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  }
  for (const mk of opts.markers ?? []) {
    svg.append(el('line', { x1: x(mk.x), x2: x(mk.x), y1: m.top, y2: H - m.bottom, stroke: 'var(--accent-2)', 'stroke-dasharray': '3 3' }));
    svg.append(el('text', { x: x(mk.x) + 5, y: m.top + 12, class: 'label' }, [mk.label]));
  }

  // hover: crosshair + tooltip
  const cross = el('line', { y1: m.top, y2: H - m.bottom, stroke: 'var(--text-3)', 'stroke-width': 1, visibility: 'hidden' });
  const dots = series.map((s) => el('circle', { r: 4, fill: s.color, stroke: 'var(--bg)', 'stroke-width': 2, visibility: 'hidden' }));
  svg.append(cross, ...dots);
  const hit = el('rect', { x: m.left, y: m.top, width: W - m.left - m.right, height: H - m.top - m.bottom, fill: 'transparent' });
  hit.addEventListener('mousemove', (ev) => {
    const box = svg.getBoundingClientRect();
    const px = ((ev.clientX - box.left) / box.width) * W;
    const xv = x.invert(px);
    const rows = [];
    series.forEach((s, si) => {
      let best = 0;
      for (let i = 1; i < s.xs.length; i++) if (Math.abs(s.xs[i] - xv) < Math.abs(s.xs[best] - xv)) best = i;
      dots[si].setAttribute('cx', x(s.xs[best]));
      dots[si].setAttribute('cy', y(s.ys[best]));
      dots[si].setAttribute('visibility', 'visible');
      rows.push(`<span style="color:${s.color}">●</span> ${s.name}: <b>${opts.yFormat ? opts.yFormat(s.ys[best]) : fmtNum(s.ys[best])}</b>`);
      cross.setAttribute('x1', x(s.xs[best]));
      cross.setAttribute('x2', x(s.xs[best]));
    });
    cross.setAttribute('visibility', 'visible');
    const xLabel = opts.xLabel ? `${opts.xLabel} ` : '';
    showTip(ev.clientX, ev.clientY, `${xLabel}${fmtNum(series[0].xs[nearest(series[0].xs, xv)])}<br>${rows.join('<br>')}`);
  });
  hit.addEventListener('mouseleave', () => {
    cross.setAttribute('visibility', 'hidden');
    dots.forEach((d) => d.setAttribute('visibility', 'hidden'));
    hideTip();
  });
  svg.append(hit);
  return svg;
}

function nearest(xs, v) {
  let best = 0;
  for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - v) < Math.abs(xs[best] - v)) best = i;
  return best;
}

export function fmtNum(v, d = 2) {
  if (!Number.isFinite(v)) return '–';
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(d);
}

/**
 * Dot-and-interval chart: for each category (row), one point with a 95% CI
 * per group. groups: [{ name, color }]. rows: [{ name, values: [{mean, lo, hi}], note }]
 */
export function intervalChart(rows, groups, opts = {}) {
  const W = opts.width ?? 520;
  const rowH = 30;
  const m = { top: opts.title ? 30 : 12, right: 16, bottom: 30, left: 150 };
  const H = m.top + rows.length * rowH + m.bottom;
  const x = scale(opts.xDomain ?? [0, 1], [m.left, W - m.right]);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': opts.title ?? 'chart' });
  const grid = el('g', { class: 'grid' });
  for (const t of niceTicks(...(opts.xDomain ?? [0, 1]), 5)) {
    grid.append(el('line', { x1: x(t), x2: x(t), y1: m.top, y2: H - m.bottom }));
    grid.append(el('text', { x: x(t), y: H - m.bottom + 14, 'text-anchor': 'middle' }, [String(t)]));
  }
  svg.append(grid);
  if (opts.title) svg.append(el('text', { x: m.left, y: 16, class: 'title' }, [opts.title]));
  if (opts.xLabel) svg.append(el('text', { x: (m.left + W - m.right) / 2, y: H - 4, 'text-anchor': 'middle' }, [opts.xLabel]));
  rows.forEach((row, ri) => {
    const cy = m.top + ri * rowH + rowH / 2;
    svg.append(el('text', { x: m.left - 10, y: cy + 4, 'text-anchor': 'end', class: row.significant ? 'label' : '' }, [row.name]));
    if (row.significant) svg.append(el('text', { x: W - m.right + 2, y: cy + 4, 'text-anchor': 'start', fill: 'var(--accent)' }, ['*']));
    row.values.forEach((v, gi) => {
      const off = (gi - (groups.length - 1) / 2) * 7;
      const g = el('g');
      g.append(el('line', { x1: x(v.lo), x2: x(v.hi), y1: cy + off, y2: cy + off, stroke: groups[gi].color, 'stroke-width': 2, 'stroke-linecap': 'round' }));
      g.append(el('circle', { cx: x(v.mean), cy: cy + off, r: 5, fill: groups[gi].color, stroke: 'var(--bg-2)', 'stroke-width': 2 }));
      g.addEventListener('mousemove', (ev) =>
        showTip(ev.clientX, ev.clientY, `<span style="color:${groups[gi].color}">●</span> ${groups[gi].name} · ${row.name}<br>mean <b>${v.mean.toFixed(3)}</b>  95% CI [${v.lo.toFixed(3)}, ${v.hi.toFixed(3)}]`),
      );
      g.addEventListener('mouseleave', hideTip);
      svg.append(g);
    });
  });
  return svg;
}

export function legend(items) {
  const div = document.createElement('div');
  div.className = 'chart-legend';
  for (const it of items) {
    const s = document.createElement('span');
    s.innerHTML = `<i style="background:${it.color}"></i>${it.name}`;
    div.append(s);
  }
  return div;
}
