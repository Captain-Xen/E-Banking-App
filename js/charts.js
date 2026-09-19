/* ═══════════════════════════════════════════════════════════════
   BlueMahoe Bank — charts.js
   Dependency-free animated SVG charts: donut, line/area, grouped
   bars and sparklines, with a shared floating tooltip.
   ═══════════════════════════════════════════════════════════════ */
window.BMCharts = (function () {
  'use strict';

  /* Shared tooltip */
  function tip(html, x, y) {
    const t = document.getElementById('chart-tip');
    if (!t) return;
    if (html == null) { t.hidden = true; return; }
    t.innerHTML = html;
    t.hidden = false;
    t.style.left = x + 'px';
    t.style.top = y + 'px';
  }
  function hideTip() { tip(null); }

  function fmt(n) {
    return 'J$ ' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  /* ── DONUT ────────────────────────────────────────────────── */
  function donut(container, items, opts) {
    opts = opts || {};
    const size = opts.size || 172, stroke = opts.stroke || 26;
    const r = (size - stroke) / 2 - 1, cx = size / 2, cy = size / 2;
    const C = 2 * Math.PI * r;
    const gap = 2.5; /* degrees-ish gap in px along circumference */
    const total = items.reduce((s, i) => s + i.value, 0) || 1;
    let acc = 0;
    const segs = items.map((it, idx) => {
      const frac = it.value / total;
      const len = Math.max(frac * C - Math.min(gap, frac * C * 0.4), 0.5);
      const off = -(acc / total) * C;
      acc += it.value;
      const dash = `stroke-dasharray="0 ${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" data-dash="${len.toFixed(1)}"`;
      return `<circle class="donut-seg" data-i="${idx}" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${it.color}"
        stroke-width="${stroke}" ${dash} stroke-linecap="butt">
        <title>${it.label}: ${fmt(it.value)} (${Math.round(frac * 100)}%)</title></circle>`;
    }).join('');

    container.innerHTML = `
      <svg class="chart-svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Donut chart">
        <g transform="rotate(-90 ${cx} ${cy})">${segs}</g>
        <text class="donut-center-lab" x="${cx}" y="${cy - 6}" text-anchor="middle">${opts.centerLabel || ''}</text>
        <text class="donut-center-val" x="${cx}" y="${cy + 14}" text-anchor="middle">${opts.centerValue || ''}</text>
      </svg>`;

    /* animate sweep-in */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      container.querySelectorAll('.donut-seg').forEach(seg => {
        seg.setAttribute('stroke-dasharray', `${seg.dataset.dash} ${(C - +seg.dataset.dash).toFixed(1)}`);
      });
    }));

    /* hover */
    container.querySelectorAll('.donut-seg').forEach(seg => {
      const it = items[+seg.dataset.i];
      seg.addEventListener('mousemove', e => tip(
        `${it.label}<small>${fmt(it.value)} · ${Math.round((it.value / total) * 100)}%</small>`, e.clientX, e.clientY));
      seg.addEventListener('mouseleave', hideTip);
    });
  }

  /* ── LINE / AREA ──────────────────────────────────────────── */
  function line(container, points, opts) {
    opts = opts || {};
    const W = 520, H = opts.height || 230, padL = 14, padR = 14, padT = 18, padB = 30;
    const vals = points.map(p => p.v);
    let min = Math.min(...vals), max = Math.max(...vals);
    const span = (max - min) || 1;
    min -= span * 0.15; max += span * 0.1;
    const iw = W - padL - padR, ih = H - padT - padB;
    const X = i => padL + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
    const Y = v => padT + ih - ((v - min) / (max - min)) * ih;

    /* smooth path via midpoint quadratics */
    let d = `M ${X(0).toFixed(1)} ${Y(vals[0]).toFixed(1)}`;
    for (let i = 1; i < vals.length; i++) {
      const mx = ((X(i - 1) + X(i)) / 2).toFixed(1);
      d += ` Q ${mx} ${Y(vals[i - 1]).toFixed(1)} ${X(i).toFixed(1)} ${Y(vals[i]).toFixed(1)}`;
    }
    const area = d + ` L ${X(vals.length - 1).toFixed(1)} ${(padT + ih)} L ${X(0).toFixed(1)} ${(padT + ih)} Z`;
    const color = opts.color || 'var(--brand)';
    const gid = 'lg' + Math.random().toString(36).slice(2, 8);

    /* gridlines */
    let grid = '';
    for (let g = 0; g <= 3; g++) {
      const gy = padT + (ih / 3) * g;
      grid += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="var(--line)" stroke-width="1" stroke-dasharray="3 5"/>`;
    }
    /* x labels */
    const step = Math.ceil(points.length / 7);
    let labels = '';
    points.forEach((p, i) => {
      if (i % step === 0 || i === points.length - 1) {
        labels += `<text class="axis-txt" x="${X(i)}" y="${H - 8}" text-anchor="middle">${p.label}</text>`;
      }
    });

    container.innerHTML = `
      <svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart">
        <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${color}" stop-opacity=".32"/>
          <stop offset="1" stop-color="${color}" stop-opacity="0"/>
        </linearGradient></defs>
        ${grid}
        <path class="area-fill" d="${area}" fill="url(#${gid})"/>
        <path class="line-path" d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
        ${labels}
        <circle class="perf-dot" r="4.5" fill="${color}" stroke="var(--surface)" stroke-width="2" opacity="0"/>
      </svg>`;

    /* path draw animation */
    const path = container.querySelector('.line-path');
    const len = path.getTotalLength();
    path.style.setProperty('--len', len);
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;

    /* hover nearest point */
    const svg = container.querySelector('svg');
    const dot = container.querySelector('.perf-dot');
    svg.addEventListener('mousemove', e => {
      const rect = svg.getBoundingClientRect();
      const rel = (e.clientX - rect.left) / rect.width * W;
      let best = 0, bd = 1e9;
      points.forEach((p, i) => { const dd = Math.abs(X(i) - rel); if (dd < bd) { bd = dd; best = i; } });
      dot.setAttribute('cx', X(best));
      dot.setAttribute('cy', Y(vals[best]));
      dot.setAttribute('opacity', '1');
      tip(`${points[best].label}<small>${(opts.format || fmt)(vals[best])}</small>`, e.clientX, e.clientY);
    });
    svg.addEventListener('mouseleave', () => { dot.setAttribute('opacity', '0'); hideTip(); });
  }

  /* ── GROUPED BARS (income vs spend) ───────────────────────── */
  function bars(container, months, opts) {
    opts = opts || {};
    const W = 520, H = opts.height || 230, padL = 14, padR = 14, padT = 18, padB = 30;
    const iw = W - padL - padR, ih = H - padT - padB;
    const max = Math.max(...months.map(m => Math.max(m.income, m.spend))) * 1.12 || 1;
    const slot = iw / months.length;
    const bw = Math.min(16, slot * 0.28);
    const grid = [];
    for (let g = 0; g <= 3; g++) {
      const gy = padT + (ih / 3) * g;
      grid.push(`<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="var(--line)" stroke-width="1" stroke-dasharray="3 5"/>`);
    }
    let rects = '', labels = '';
    months.forEach((m, i) => {
      const cxm = padL + slot * (i + 0.5);
      const hIn = (m.income / max) * ih;
      const hSp = (m.spend / max) * ih;
      rects += `<rect class="bar-rect" data-tip="${m.label} income&lt;small&gt;${fmt(m.income)}&lt;/small&gt;" x="${(cxm - bw - 2).toFixed(1)}" y="${(padT + ih - hIn).toFixed(1)}" width="${bw}" height="${Math.max(hIn, 1).toFixed(1)}" rx="4" fill="var(--lime)" style="animation-delay:${i * 70}ms"/>`;
      rects += `<rect class="bar-rect" data-tip="${m.label} spend&lt;small&gt;${fmt(m.spend)}&lt;/small&gt;" x="${(cxm + 2).toFixed(1)}" y="${(padT + ih - hSp).toFixed(1)}" width="${bw}" height="${Math.max(hSp, 1).toFixed(1)}" rx="4" fill="var(--coral)" style="animation-delay:${i * 70 + 40}ms"/>`;
      labels += `<text class="axis-txt" x="${cxm}" y="${H - 8}" text-anchor="middle">${m.label}</text>`;
    });
    container.innerHTML = `
      <svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart">${grid.join('')}${rects}${labels}</svg>`;
    container.querySelectorAll('.bar-rect').forEach(rc => {
      const html = rc.dataset.tip.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      rc.addEventListener('mousemove', e => tip(html, e.clientX, e.clientY));
      rc.addEventListener('mouseleave', hideTip);
    });
  }

  /* ── SPARKLINE ────────────────────────────────────────────── */
  function spark(container, vals, opts) {
    opts = opts || {};
    const W = 100, H = 36, color = opts.color || 'var(--brand)';
    const min = Math.min(...vals), max = Math.max(...vals), span = (max - min) || 1;
    const X = i => (i / (vals.length - 1)) * (W - 4) + 2;
    const Y = v => H - 4 - ((v - min) / span) * (H - 8);
    let d = `M ${X(0).toFixed(1)} ${Y(vals[0]).toFixed(1)}`;
    for (let i = 1; i < vals.length; i++) d += ` L ${X(i).toFixed(1)} ${Y(vals[i]).toFixed(1)}`;
    container.innerHTML = `
      <svg class="chart-svg" viewBox="0 0 ${W} ${H}">
        <path d="${d}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" opacity=".9"/>
        <circle cx="${X(vals.length - 1).toFixed(1)}" cy="${Y(vals[vals.length - 1]).toFixed(1)}" r="2.6" fill="${color}"/>
      </svg>`;
  }

  return { donut, line, bars, spark };
})();
