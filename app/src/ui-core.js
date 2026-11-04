/* =====================================================================
 * TrueRE Hybrid Studio — UI core: state, persistence, forms, charts, IO
 * ===================================================================== */
(function () {
  'use strict';
  const TRE = window.TRE;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const LS_KEY = 'trueRE.hybridStudio.v1';

  /* ---------------- icons ---------------- */
  const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const IC = {
    site: P('<path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
    sun: P('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    wind: P('<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"/>'),
    wave: P('<path d="M3 12h3l3-8 4 16 3-8h5"/>'),
    plant: P('<path d="M3 21V10l6 4V10l6 4V4h4v17z"/><path d="M7 21v-3M12 21v-3M17 21v-3"/>'),
    coin: P('<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.8 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2"/>'),
    grid: P('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
    book: P('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/>'),
    globe: P('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
    sat: P('<path d="M13 7 9 3 5 7l4 4M17 11l4 4-4 4-4-4M8 12l4 4M16 8l-8 8"/><path d="M17 3a4 4 0 0 1 4 4"/>'),
    file: P('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'),
    flask: P('<path d="M9 3h6M10 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/>'),
    dl: P('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'),
    ul: P('<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>'),
    play: P('<path d="M6 4l14 8-14 8z"/>'),
    gear: P('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    bolt: P('<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>'),
    bat: P('<rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 11v2M6 10v4M10 10v4"/>'),
    drop: P('<path d="M12 2.7s6 6.4 6 11.3a6 6 0 0 1-12 0C6 9.1 12 2.7 12 2.7z"/>'),
    tank: P('<rect x="5" y="3" width="14" height="18" rx="7"/><path d="M5 12h14"/>'),
    temp: P('<path d="M14 14.8V4a2 2 0 1 0-4 0v10.8a4 4 0 1 0 4 0z"/>'),
    layers: P('<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>'),
    chart: P('<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>'),
    search: P('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    check: P('<path d="M20 6 9 17l-5-5"/>'),
    target: P('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
    shield: P('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
    cable: P('<path d="M4 9a5 5 0 0 1 10 0v6a5 5 0 0 0 10 0"/><path d="M4 5v4M2 9h4"/>'),
    inv: P('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 9c1-2 2-2 3 0s2 2 3 0M8 15h8"/>')
  };

  /* ---------------- state ---------------- */
  function defaultState() {
    const lat = 23.83, lon = 79.44;
    return {
      v: 1,
      site: { project: 'Green Ammonia — Hybrid RE', place: 'Damoh, Madhya Pradesh, India', lat, lon, elev: 420, tz: 5.5 },
      res: { source: 'openmeteo', y0: 2016, y1: 2025, basis: 'tmy', year: 2023, wGhi: 30, wDni: 20, wT: 20, wWind: 30 },
      pv: TRE.defaultPV(lat), wind: TRE.defaultWind(),
      prof: { srcSolar: 'sample', srcWind: 'sample', plevel: 'P50', pbasis: '1y', uncSolar: 4.0, uncWind: 8.0, pvsystKwp: 1000 },
      plant: TRE.defaultPlant(), fin: TRE.defaultFinance(), plantCase: 'Solar-BESS',
      explore: { x: 'Solar_Capacity_MWp', x0: 300, x1: 700, nx: 7, y: 'Electrolyzer_Design_MW', y0: 150, y1: 350, ny: 7, metric: 'lcoa' },
      cache: null, upload: null, page: 'site', theme: null
    };
  }
  function mergeDeep(base, add) {
    if (!add || typeof add !== 'object') return base;
    for (const k of Object.keys(add)) {
      if (add[k] && typeof add[k] === 'object' && !Array.isArray(add[k]) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) mergeDeep(base[k], add[k]);
      else base[k] = add[k];
    }
    return base;
  }
  let S = defaultState();
  try { const raw = localStorage.getItem(LS_KEY); if (raw) S = mergeDeep(defaultState(), JSON.parse(raw)); } catch (e) { /* storage unavailable */ }
  const R = { weather: null, re: null, profile: null, plant: null, fin: null };
  let saveT = 0;
  function persist() {
    clearTimeout(saveT);
    saveT = setTimeout(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* quota or blocked */ } }, 400);
  }

  /* ---------------- formatting ---------------- */
  const nf = (d) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const NF = [0, 1, 2, 3].map(nf);
  const fmt = (x, d = 0) => (x == null || !isFinite(x)) ? '—' : NF[Math.min(3, d)].format(x);
  const pct = (x, d = 1) => (x == null || !isFinite(x)) ? '—' : NF[d].format(x * 100) + '%';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function toast(msg, ms = 3200) { const d = document.createElement('div'); d.textContent = msg; $('#toast').appendChild(d); setTimeout(() => d.remove(), ms); }
  function busy(on, msg, frac, log) {
    $('#busy').classList.toggle('on', !!on);
    if (msg) $('#busyMsg').textContent = msg;
    if (frac != null) $('#busyBar').style.width = Math.round(frac * 100) + '%';
    if (log != null) $('#busyLog').textContent = log;
  }
  const getPath = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), S);
  function setPath(path, v) { const ks = path.split('.'); let o = S; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = v; }
  function kpi(label, value, unit, sub, accent) {
    return `<div class="kpi" style="--accent:${accent || 'var(--green-2)'}"><div class="l">${label}</div><div class="v">${value}${unit ? `<small>${unit}</small>` : ''}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
  }
  function card(title, sub, body, tools, cls) {
    return `<div class="card ${cls || ''}"><div class="hd"><h3>${title}</h3>${sub ? `<span class="sub">${sub}</span>` : ''}${tools ? `<div class="tools">${tools}</div>` : ''}</div><div class="bd">${body}</div></div>`;
  }
  const emptyState = (title, msg, btn) => `<div class="empty">${IC.layers}<h4>${title}</h4><div>${msg}</div>${btn || ''}</div>`;

  /* ---------------- forms ---------------- */
  // field: [key, label, unit, opts]
  function field(root, f) {
    const [key, label, unit, o = {}] = f;
    if (o.show && !o.show(S)) return '';
    const path = root + '.' + key, v = getPath(path);
    const help = o.help ? `<i class="help" title="${esc(o.help)}">?</i>` : '';
    const cls = 'fld' + (o.full ? ' full' : '');
    if (o.type === 'tog') return `<label class="${cls} tog"><input type="checkbox" data-p="${path}" data-t="bool" ${v ? 'checked' : ''}><span class="sw"></span><span>${label}</span>${help}</label>`;
    if (o.type === 'sel') {
      const opts = (typeof o.options === 'function' ? o.options() : o.options).map(([val, lab]) => `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`).join('');
      return `<label class="${cls}"><span>${label}${help}</span><div class="inp"><select data-p="${path}" data-t="${o.num ? 'num' : 'str'}">${opts}</select></div></label>`;
    }
    if (o.type === 'area') return `<label class="${cls} full"><span>${label}${help}</span><div class="inp"><textarea data-p="${path}" data-t="str" placeholder="${esc(o.ph || '')}">${esc(v)}</textarea></div></label>`;
    if (o.type === 'text') return `<label class="${cls}"><span>${label}${help}</span><div class="inp"><input type="text" data-p="${path}" data-t="str" value="${esc(v)}">${unit ? `<em>${unit}</em>` : ''}</div></label>`;
    if (o.type === 'months') {
      return `<div class="fld full"><span>${label}${help}</span><div class="months">${MONTHS.map((m, i) => `<label>${m}<input type="number" step="0.1" min="0" max="30" data-p="${path}.${i}" data-t="num" value="${v[i]}"></label>`).join('')}</div></div>`;
    }
    const attrs = `${o.min != null ? `min="${o.min}"` : ''} ${o.max != null ? `max="${o.max}"` : ''} step="${o.step || 'any'}"`;
    if (o.range) return `<label class="${cls} full"><span>${label}${help}</span><div class="rng"><input type="range" ${attrs} data-p="${path}" data-t="num" value="${v}" data-link="${path}"><div class="inp"><input type="number" ${attrs} data-p="${path}" data-t="num" value="${v}">${unit ? `<em>${unit}</em>` : ''}</div></div></label>`;
    return `<label class="${cls}"><span>${label}${help}</span><div class="inp"><input type="number" ${attrs} data-p="${path}" data-t="num" value="${v}">${unit ? `<em>${unit}</em>` : ''}</div></label>`;
  }
  function section(title, icon, root, fields, open, extra) {
    return `<details class="sec" ${open ? 'open' : ''}><summary><span class="ic">${IC[icon] || IC.gear}</span>${title}</summary><div class="body">${fields.map(f => field(root, f)).join('')}${extra || ''}</div></details>`;
  }
  const handlers = [];
  function onField(fn) { handlers.push(fn); }
  function readInput(el) {
    const t = el.dataset.t;
    if (t === 'bool') return el.checked;
    if (t === 'num') { const x = parseFloat(el.value); return isFinite(x) ? x : null; }
    return el.value;
  }
  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-p]'); if (!el) return;
    if (el.tagName === 'SELECT' || el.type === 'checkbox') return;
    const v = readInput(el); if (v === null) return;
    setPath(el.dataset.p, v);
    $$(`[data-p="${el.dataset.p}"]`).forEach(o => { if (o !== el) o.value = v; });
    persist(); handlers.forEach(h => h(el.dataset.p, v, 'input'));
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-p]'); if (!el) return;
    const v = readInput(el); if (v === null) return;
    setPath(el.dataset.p, v); persist(); handlers.forEach(h => h(el.dataset.p, v, 'change'));
  });

  /* ---------------- charts ---------------- */
  const charts = {};
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function theme() {
    return { text: css('--chart-text'), grid: css('--chart-grid'), surface: css('--surface'), border: css('--border'), textMain: css('--text'),
      solar: css('--solar'), wind: css('--wind'), h2: css('--h2'), nh3: css('--nh3'), bess: css('--bess'), grid2: css('--grid'), curt: css('--curt'), gold: css('--gold'), green: css('--green-2'), warn: css('--warn') };
  }
  function baseOpt(extra) {
    const t = theme();
    const axis = { axisLine: { lineStyle: { color: t.border } }, axisTick: { show: false }, axisLabel: { color: t.text, fontSize: 11 }, splitLine: { lineStyle: { color: t.grid } }, nameTextStyle: { color: t.text, fontSize: 11 } };
    const o = {
      textStyle: { fontFamily: 'Inter, Segoe UI, system-ui, sans-serif', color: t.text },
      grid: { left: 52, right: 22, top: 48, bottom: 34, containLabel: false },
      tooltip: { trigger: 'axis', backgroundColor: t.surface, borderColor: t.border, textStyle: { color: t.textMain, fontSize: 12 }, extraCssText: 'box-shadow:0 8px 24px rgba(0,0,0,.15);border-radius:10px;' },
      legend: { top: 2, left: 'center', textStyle: { color: t.text, fontSize: 11 }, itemWidth: 12, itemHeight: 8, icon: 'roundRect' },
      animationDuration: 450
    };
    if (extra) {
      if (extra.xAxis) extra.xAxis = [].concat(extra.xAxis).map(a => mergeDeep(JSON.parse(JSON.stringify(axis)), a));
      if (extra.yAxis) extra.yAxis = [].concat(extra.yAxis).map(a => mergeDeep(JSON.parse(JSON.stringify(axis)), a));
      Object.assign(o, extra);
    }
    return o;
  }
  function chart(id, opt) {
    const el = document.getElementById(id); if (!el || !window.echarts) return null;
    let c = charts[id];
    if (c && c.getDom() !== el) { c.dispose(); c = null; }
    if (!c) { c = echarts.init(el, null, { renderer: 'canvas' }); charts[id] = c; }
    c.setOption(opt, true);
    return c;
  }
  function disposeCharts() { for (const k in charts) { try { charts[k].dispose(); } catch (e) { } delete charts[k]; } }
  const ro = new ResizeObserver(() => { for (const k in charts) { const c = charts[k]; if (c.getDom().offsetParent) c.resize(); } });
  ro.observe(document.body);
  window.addEventListener('resize', () => { for (const k in charts) charts[k].resize(); });

  /* ---------------- downloads ---------------- */
  function download(name, blob) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const excelDate = (h) => new Date(Date.UTC(1990, 0, 1) + h * 3600e3);
  const hdrStyle = (row, fill) => row.eachCell(c => { c.font = { bold: true, color: { argb: 'FF13201A' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill || 'FFFFE38A' } }; c.border = { bottom: { style: 'thin', color: { argb: 'FF9AA89F' } } }; });

  /** Model-ready efficiency workbook (same layout as RE_Production_Efficiency_data.xlsx / Efficiency) */
  async function exportEfficiencyWorkbook(solar, wind, meta, template) {
    const wb = new ExcelJS.Workbook(); wb.creator = 'TrueRE Hybrid Studio — Oriana Power'; wb.created = new Date();
    const ws = wb.addWorksheet('Efficiency', { views: [{ state: 'frozen', ySplit: 6 }] });
    ws.getCell('B1').value = template ? 'TEMPLATE — fill columns B (Solar) and C (Wind) with hourly output in % of installed capacity (kW per kWp x 100)' : (meta.source || 'TrueRE Hybrid Studio');
    ws.getCell('B1').font = { bold: true, color: { argb: 'FF1F5E14' } };
    ws.getCell('B2').value = template ? 'Hour-beginning, local standard time, 8760 rows, non-leap year. Values 0–100. Do not change rows 5–6 or the date column.' : `Site ${meta.place || ''} (${fmt(S.site.lat, 4)}, ${fmt(S.site.lon, 4)}) · UTC${S.site.tz >= 0 ? '+' : ''}${S.site.tz} · ${meta.basis || ''}`;
    ws.getCell('B2').font = { italic: true, color: { argb: 'FF5D6B62' } };
    ws.getRow(5).values = ['date', 'Solar Efficiency', 'Wind Efficiency', null, null, null, 'Month', 'Day', 'Hour'];
    ws.getRow(6).values = ['    ', '% kW/kWp', '% kW/kWp', null, null, null, 'MM', 'DD', 'HH'];
    hdrStyle(ws.getRow(5)); hdrStyle(ws.getRow(6), 'FFFFF6D6');
    const rows = [];
    for (let h = 0; h < 8760; h++) rows.push([excelDate(h), template ? null : +(solar[h] || 0).toFixed(4), template ? null : +(wind[h] || 0).toFixed(4), null, null, null, TRE.CAL.month[h], TRE.CAL.day[h], TRE.CAL.hour[h]]);
    ws.addRows(rows);
    ws.getColumn(1).numFmt = 'dd-mm-yyyy hh:mm'; ws.getColumn(1).width = 18; ws.getColumn(2).width = 17; ws.getColumn(3).width = 17;
    ws.getColumn(2).numFmt = '0.0000'; ws.getColumn(3).numFmt = '0.0000';
    if (template) {
      for (let r = 7; r < 7 + 8760; r++) for (const col of ['B', 'C']) {
        const c = ws.getCell(col + r); c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEA' } };
        c.dataValidation = { type: 'decimal', operator: 'between', allowBlank: true, formulae: [0, 100], showErrorMessage: true, errorTitle: 'Out of range', error: 'Enter output as % of installed capacity (0–100).' };
      }
      const ins = wb.addWorksheet('Instructions');
      const lines = [
        ['TrueRE Hybrid Studio — Hourly RE efficiency template'], [],
        ['1', 'Sheet "Efficiency", rows 7–8766: one row per hour of a non-leap year (1 Jan 00:00 to 31 Dec 23:00), local standard time, hour-beginning.'],
        ['2', 'Column B "Solar Efficiency": AC energy injected at the point of interconnection in the hour divided by installed DC capacity, in percent (kWh per kWp x 100).'],
        ['3', 'Column C "Wind Efficiency": net energy at the point of interconnection divided by installed wind capacity, in percent (kWh per kW x 100). Enter 0 where no wind is considered.'],
        ['4', 'From PVsyst: Hourly output E_Grid [kW] / installed kWp x 100. From renewables.ninja: electricity [kW] / capacity [kW] x 100 (shift UTC to local time).'],
        ['5', 'Leave rows 5–6 and the date / Month / Day / Hour columns unchanged. Annual sum of column B divided by 100 equals the specific yield in kWh/kWp.'],
        ['6', 'Upload the completed file on the RE Profile page or the Site & Resource page ("Upload Excel / PVsyst"). The same file is read directly by the Python simulation model.']
      ];
      lines.forEach(l => ins.addRow(l)); ins.getColumn(1).width = 6; ins.getColumn(2).width = 140; ins.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF1F5E14' } };
    } else {
      const a = wb.addWorksheet('Assumptions');
      a.addRow(['Parameter', 'Value']); hdrStyle(a.getRow(1));
      const add = (k, v) => a.addRow([k, v]);
      add('Project', S.site.project); add('Location', S.site.place); add('Latitude', S.site.lat); add('Longitude', S.site.lon); add('Elevation (m)', S.site.elev); add('UTC offset (h)', S.site.tz);
      add('Profile source — solar', meta.srcSolar); add('Profile source — wind', meta.srcWind); add('Weather dataset', meta.dataset || '—'); add('Basis', meta.basis || '—'); add('Exceedance level', meta.plevel || 'P50');
      add('Solar specific yield (kWh/kWp)', +(solar.reduce((s, x) => s + x, 0) / 100).toFixed(1)); add('Wind specific yield (kWh/kW)', +(wind.reduce((s, x) => s + x, 0) / 100).toFixed(1));
      a.addRow([]); a.addRow(['Solar PV design', '']); hdrStyle(a.lastRow, 'FFE6F2E2');
      Object.entries(S.pv).forEach(([k, v]) => add('pv.' + k, Array.isArray(v) ? v.join(', ') : v));
      a.addRow([]); a.addRow(['Wind design', '']); hdrStyle(a.lastRow, 'FFE6F2E2');
      Object.entries(S.wind).forEach(([k, v]) => add('wind.' + k, v));
      a.getColumn(1).width = 38; a.getColumn(2).width = 60;
      const m = wb.addWorksheet('Monthly');
      m.addRow(['Month', 'Solar kWh/kWp', 'Solar CUF %', 'Wind kWh/kW', 'Wind CUF %']); hdrStyle(m.getRow(1));
      for (let i = 0; i < 12; i++) {
        let s = 0, w = 0, n = 0; for (let h = 0; h < 8760; h++) if (TRE.CAL.month[h] === i + 1) { s += solar[h]; w += wind[h]; n++; }
        m.addRow([MONTHS[i], +(s / 100).toFixed(2), +(s / n).toFixed(2), +(w / 100).toFixed(2), +(w / n).toFixed(2)]);
      }
      m.columns.forEach(c => c.width = 16);
      if (meta.detail) {
        const d = wb.addWorksheet('Hourly_Detail', { views: [{ state: 'frozen', ySplit: 1 }] });
        d.addRow(['date', 'GHI W/m2', 'DNI W/m2', 'DHI W/m2', 'POA W/m2', 'T amb °C', 'T cell °C', 'V hub m/s', 'Wind dir °', 'Solar %', 'Wind %']); hdrStyle(d.getRow(1));
        const P = meta.detail;
        const rr = []; for (let h = 0; h < 8760; h++) rr.push([excelDate(h), +P.ghi[h].toFixed(1), +P.dni[h].toFixed(1), +P.dhi[h].toFixed(1), +P.poa[h].toFixed(1), +P.temp[h].toFixed(2), +P.tcell[h].toFixed(2), +P.vhub[h].toFixed(2), +P.wdir[h].toFixed(0), +solar[h].toFixed(4), +wind[h].toFixed(4)]);
        d.addRows(rr); d.getColumn(1).numFmt = 'dd-mm-yyyy hh:mm'; d.columns.forEach(c => c.width = 13); d.getColumn(1).width = 18;
      }
    }
    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: XLSX_MIME });
  }

  /** Parse an efficiency workbook / CSV / PVsyst hourly CSV. Returns {solar, wind, info} in % */
  async function parseProfileFile(file, kwp) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.csv') || name.endsWith('.txt')) return parseCSV(await file.text(), kwp);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
    let ws = wb.getWorksheet('Efficiency') || wb.worksheets[0];
    const val = (c) => { let v = c && c.value; if (v && typeof v === 'object') { if ('result' in v) v = v.result; else if (v.richText) v = v.richText.map(t => t.text).join(''); } return v; };
    let hdr = -1, cs = -1, cw = -1, cg = -1;
    for (let r = 1; r <= Math.min(40, ws.rowCount); r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= Math.min(40, row.cellCount || 40); c++) {
        const t = String(val(row.getCell(c)) || '').toLowerCase().trim();
        if (cs < 0 && /solar/.test(t) && /(eff|%|cuf|output|profile)/.test(t)) { cs = c; hdr = r; }
        if (cw < 0 && /wind/.test(t) && /(eff|%|cuf|output|profile)/.test(t)) { cw = c; hdr = Math.max(hdr, r); }
        if (cg < 0 && /^e_?grid/.test(t)) { cg = c; hdr = r; }
      }
      if (cs > 0 || cg > 0) break;
    }
    if (cs < 0 && cg < 0) throw new Error('No "Solar Efficiency" (or PVsyst E_Grid) column found in the first 40 rows.');
    const solar = [], wind = [];
    for (let r = hdr + 1; r <= ws.rowCount && solar.length < 8784; r++) {
      const row = ws.getRow(r);
      const s = cs > 0 ? val(row.getCell(cs)) : val(row.getCell(cg));
      if (typeof s !== 'number') continue;
      const w = cw > 0 ? val(row.getCell(cw)) : 0;
      solar.push(cs > 0 ? s : s / kwp * 100); wind.push(typeof w === 'number' ? w : 0);
    }
    return finishProfile(solar, wind, `${file.name} · sheet "${ws.name}"${cg > 0 && cs < 0 ? ` · E_Grid / ${kwp} kWp` : ''}`);
  }
  function parseCSV(txt, kwp) {
    const lines = txt.split(/\r?\n/);
    let hdr = -1, delim = ',', cs = -1, cw = -1, cg = -1;
    for (let i = 0; i < Math.min(60, lines.length); i++) {
      const L = lines[i]; const d = (L.split(';').length > L.split(',').length) ? ';' : (L.split('\t').length > L.split(',').length ? '\t' : ',');
      const cells = L.split(d).map(x => x.trim().toLowerCase().replace(/"/g, ''));
      cells.forEach((t, c) => {
        if (cs < 0 && /solar/.test(t) && /(eff|%)/.test(t)) cs = c;
        if (cw < 0 && /wind/.test(t) && /(eff|%)/.test(t)) cw = c;
        if (cg < 0 && /^e_?grid/.test(t)) cg = c;
      });
      if (cs >= 0 || cg >= 0) { hdr = i; delim = d; break; }
    }
    if (hdr < 0) throw new Error('No Solar Efficiency / E_Grid header found in the CSV.');
    const solar = [], wind = [];
    for (let i = hdr + 1; i < lines.length && solar.length < 8784; i++) {
      const cells = lines[i].split(delim); const s = parseFloat(cells[cs >= 0 ? cs : cg]);
      if (!isFinite(s)) continue;
      solar.push(cs >= 0 ? s : s / kwp * 100); wind.push(cw >= 0 ? (parseFloat(cells[cw]) || 0) : 0);
    }
    return finishProfile(solar, wind, `CSV${cg >= 0 && cs < 0 ? ` · PVsyst E_Grid / ${kwp} kWp` : ''}`);
  }
  function finishProfile(solar, wind, info) {
    if (solar.length === 8784) { solar.splice(59 * 24, 24); wind.splice(59 * 24, 24); info += ' · 29-Feb removed'; }
    if (solar.length < 8760) throw new Error(`Only ${solar.length} hourly rows found; 8760 are required.`);
    solar.length = 8760; wind.length = 8760;
    const notes = [];
    const fix = (a, nm) => {
      let mx = 0; for (const x of a) mx = Math.max(mx, x);
      if (mx > 0 && mx <= 1.0001) { for (let i = 0; i < a.length; i++) a[i] *= 100; notes.push(`${nm} looked like a fraction (max ${mx.toFixed(3)}); converted to %.`); }
      let neg = 0; for (let i = 0; i < a.length; i++) { if (a[i] < 0) { a[i] = 0; neg++; } if (a[i] > 100) a[i] = 100; }
      if (neg) notes.push(`${nm}: ${neg} negative values (night consumption) clipped to 0.`);
    };
    fix(solar, 'Solar'); fix(wind, 'Wind');
    return { solar, wind, info, notes };
  }

  /* ---------------- expose ---------------- */
  window.UI = { $, $$, IC, S, setS: (x) => { Object.keys(S).forEach(k => delete S[k]); Object.assign(S, x); persist(); }, R, defaultState, mergeDeep, persist, fmt, pct, esc, toast, busy, getPath, setPath,
    kpi, card, emptyState, field, section, onField, chart, baseOpt, theme, disposeCharts, charts, download, exportEfficiencyWorkbook, parseProfileFile, MONTHS, XLSX_MIME, hdrStyle, excelDate, LS_KEY };
})();
