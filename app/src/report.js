/* =====================================================================
 * HyProfile — model-run report generator
 *   PDF  : jsPDF + AutoTable, vector text and tables, ECharts figures
 *          rendered off-screen at 2x resolution.
 *   Excel: ExcelJS workbook with formatted summary, inputs, resource,
 *          operations, economics and (optional) hourly sheets plus the
 *          same figures embedded as images.
 * ===================================================================== */
(function () {
  'use strict';
  const TRE = window.TRE, U = window.UI;
  const { S, R, fmt, esc, toast, busy, MONTHS } = U;
  const CAL = TRE.CAL;
  const APP = () => window.TRE_APP;
  const sum = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; };
  const fin = (x) => typeof x === 'number' && isFinite(x);
  const pc = (x, d = 1) => fin(x) ? fmt(x * 100, d) + '%' : 'n/a';
  const f0 = (x) => fin(x) ? fmt(x, 0) : '—', f1 = (x) => fin(x) ? fmt(x, 1) : '—', f2 = (x) => fin(x) ? fmt(x, 2) : '—';

  /* ---------- fixed light palette for print ---------- */
  const C = { ink: '#24213D', muted: '#6B6889', faint: '#A19DBA', line: '#E4E1F0', soft: '#F6F5FB', accent: '#5B4CF5', accent2: '#2F7BFF',
    solar: '#F5A65B', wind: '#5EAEEB', h2: '#4CC3A0', nh3: '#9284F7', bess: '#EF86AE', grid: '#A3ACC7', curt: '#FF8A7A', gold: '#F4C35E', ok: '#2FB383', warn: '#F09A4A' };
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const argb = (h) => 'FF' + h.slice(1).toUpperCase();

  /* ---------- options (per browser) ---------- */
  const OPT_KEY = 'hyprofile.report.v1';
  const defOpts = () => ({ title: '', author: '', client: '', format: 'pdf', resource: true, operations: true, economics: true, inputs: true, hourly: true });
  function loadOpts() { try { return Object.assign(defOpts(), JSON.parse(localStorage.getItem(OPT_KEY) || '{}')); } catch (e) { return defOpts(); } }
  function saveOpts(o) { try { localStorage.setItem(OPT_KEY, JSON.stringify(o)); } catch (e) { /* storage unavailable */ } }

  /* ---------- text sanitising for the PDF standard font (WinAnsi) ---------- */
  const TX = { '₂': '2', '₃': '3', '₀': '0', '₁': '1', 'ρ': 'rho', 'η': 'eta', 'α': 'alpha', 'β': 'beta', '≥': '>=', '≤': '<=', '→': '->', '←': '<-', '−': '-', '≈': '~', '₹': 'INR ', ' ': ' ', ' ': ' ' };
  const tx = (s) => String(s == null ? '' : s).replace(/[₂₃₀₁ρηαβ≥≤→←−≈₹  ]/g, (c) => TX[c]);

  /* =================================================================
   *  DATA ASSEMBLY — one structure feeds both PDF and Excel
   * ================================================================= */
  function gather(o) {
    const r = R.plant, f = R.fin, a = r.annual, c = r.cfg, H = r.hourly, d = r.derived;
    const prof = R.profile;
    const srcName = { model: 'Location model (ERA5 / NASA POWER)', upload: 'Uploaded file', sample: 'Sample profile (Damoh)', none: 'Not used' };
    const solarY = sum(prof.solar) / 100, windY = sum(prof.wind) / 100; // kWh/kWp (= MWh/MW)
    const ful = a.offtakeDue > 0 ? a.offtakeDispatched / a.offtakeDue : 1;
    const now = new Date();
    const meta = {
      title: o.title || S.site.project || 'Green hydrogen / ammonia project', author: o.author, client: o.client,
      place: S.site.place, lat: S.site.lat, lon: S.site.lon, elev: S.site.elev, tz: S.site.tz,
      date: now, stamp: now.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      id: 'HYP-' + now.toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.abs(hash(JSON.stringify(S.plant) + JSON.stringify(S.fin) + solarY + windY)).toString(36).slice(0, 5).toUpperCase(),
      caseName: S.plantCase === '__custom' ? 'Custom' : S.plantCase
    };
    const resource = {
      srcSolar: srcName[S.prof.srcSolar] || S.prof.srcSolar, srcWind: srcName[S.prof.srcWind] || S.prof.srcWind,
      plevel: S.prof.plevel, pbasis: S.prof.pbasis === '10y' ? '10-year' : '1-year', fs: prof.fs, fw: prof.fw,
      solarY, windY, solarCUF: solarY / 8760, windCUF: windY / 8760,
      dataset: R.weather ? R.weather.source : (S.cache ? S.cache.dataset : null),
      years: R.weather ? R.weather.years : (S.cache ? S.cache.years : null),
      basis: S.res.basis === 'tmy' ? 'Typical meteorological year (Sandia TMY)' : 'Single calendar year ' + S.res.year,
      perYear: R.re ? R.re.annual : null, model: !!R.re
    };
    // PV and wind loss chains (only when the location model is loaded)
    let pvLoss = null, windLoss = null;
    if (R.re && R.weather) {
      try { const lt = APP().pvLossTable(); pvLoss = { rows: lt.rows, pr: lt.pr, yieldAll: lt.yieldAll, night: lt.night }; } catch (e) { pvLoss = null; }
      try { windLoss = APP().windLossRows(R.re.wRes.loss, R.weather.n / 8766); } catch (e) { windLoss = null; }
    }
    // monthly RE (MWh) from the profile
    const mRE = []; for (let m = 1; m <= 12; m++) { let s = 0, w = 0, n = 0; for (let h = 0; h < 8760; h++) if (CAL.month[h] === m) { s += H.solarMW[h]; w += H.windMW[h]; n++; } mRE.push({ m, solar: s, wind: w, hours: n }); }
    const kpis = [
      ['Annual NH3 production', f0(a.nh3), 't/yr', `${f1(a.nh3 / 365)} t/day · ${pc(a.nh3 / (c.Derivative_Normal_MTPD * 365))} of normal rate`],
      ['Offtake fulfilment', pc(ful), '', `${a.daysMet}/${a.days} days · ${a.monthsMet}/12 months met`],
      ['Green H2 production', f0(a.h2), 't/yr', `PEM ${f0(a.h2pem)} · ALK ${f0(a.h2alk)} t`],
      ['Electrolyser CUF', fmt(a.elyCUF, 1) + '%', '', `PEM ${fmt(a.pemUtil, 1)}% · ALK ${fmt(a.alkUtil, 1)}%`],
      ['NH3 loop utilisation', fmt(a.loopUtil, 1) + '%', '', `${f0(a.hoursRunning)} h running · ${f0(a.shutdowns)} shutdowns`],
      ['RE curtailment', pc(a.re > 0 ? a.curtailed / a.re : 0), '', `${f1(a.curtailed / 1000)} of ${f1(a.re / 1000)} GWh`],
      ['LCOA', f1(f.lcoa), 'INR/kg', `${f0(f.lcoa * 1000 / 83.5)} USD/t @ 83.5`],
      ['LCOH', f1(f.lcoh), 'INR/kg', `${f2(f.lcoh / 83.5)} USD/kg`],
      ['Total project cost', f0(f.capex), 'INR Cr', `EPC ${f0(f.epc)} · IDC ${f0(f.idc)} · land ${f0(f.land)}`],
      ['Project IRR (post-tax)', pc(f.pirr), '', `WACC ${pc(f.wacc)}`],
      ['Equity IRR', pc(f.eirr), '', `Gearing ${fmt(S.fin.Gearing_Percent)}%`],
      ['Minimum DSCR', fin(f.minDSCR) ? fmt(f.minDSCR, 2) + 'x' : '—', '', `Tenor ${S.fin.Loan_Tenor_Years} yr`]
    ];
    // observations (factual statements)
    const obs = [];
    obs.push(`The plant produces ${f0(a.nh3)} t of ammonia per year (${f1(a.nh3 / 365)} t/day), equal to ${pc(a.nh3 / (c.Derivative_Normal_MTPD * 365))} of the ${f0(c.Derivative_Normal_MTPD)} MTPD normal rate, from ${f0(a.h2)} t of green hydrogen.`);
    obs.push(`Offtake fulfilment is ${pc(ful)}: the contract is met on ${a.daysMet} of ${a.days} days and in ${a.monthsMet} of 12 months, with an annual shortfall of ${f0(a.offtakeShortfall)} t and ${f0(a.excess)} t of excess product when the tank is full.`);
    obs.push(`Renewable generation totals ${f1(a.re / 1000)} GWh/yr (solar ${f1(a.solar / 1000)}, wind ${f1(a.wind / 1000)}); ${pc(a.re > 0 ? a.curtailed / a.re : 0)} is curtailed.`);
    obs.push(`The ammonia loop runs ${f0(a.hoursRunning)} h/yr at ${fmt(a.loopUtil, 1)}% average utilisation with ${f0(a.shutdowns)} shutdown event(s); look-ahead rationing is active for ${f0(a.hoursRationed)} h.`);
    if (fin(f.lcoa)) obs.push(`The levelised cost of ammonia is ${f1(f.lcoa)} INR/kg against a breakeven green-ammonia price of ${f1(f.breakeven)} INR/kg and a contract price of ${f1(S.fin.Ammonia_Price_INR_per_kg)} INR/kg.`);
    if (fin(f.pirr)) obs.push(`The post-tax project IRR is ${pc(f.pirr)} ${f.pirr >= f.wacc ? 'and exceeds' : 'and is below'} the ${pc(f.wacc)} WACC; the equity IRR is ${pc(f.eirr)}${fin(f.minDSCR) ? ` and the minimum DSCR is ${fmt(f.minDSCR, 2)}x` : ''}.`);
    r.warnings.forEach(w => obs.push('Model note: ' + w));
    // energy balance
    const bessLoss = Math.max(0, a.bessCharge - a.bessDisch);
    const balance = [
      ['Solar PV generation', a.solar, 'Supply'], ['Wind generation', a.wind, 'Supply'], ['Total RE at busbar', a.re, 'Supply'],
      ['Electrolysers', a.ely, 'Use'], ['NH3 loop auxiliaries', a.aux, 'Use'], ['BESS round-trip losses', bessLoss, 'Use'],
      ['Grid banking charges', a.bankTariff, 'Use'], ['Curtailed', a.curtailed, 'Use'], ['Grid import', a.imported, 'Supply'],
      ['BESS charge', a.bessCharge, 'Storage'], ['BESS discharge', a.bessDisch, 'Storage'], ['Grid bank deposit', a.bankIn, 'Storage'], ['Grid bank withdrawal', a.bankOut, 'Storage']
    ];
    return { r, f, a, c, H, d, prof, meta, resource, pvLoss, windLoss, mRE, kpis, obs, balance, ful, o };
  }
  function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

  /* =================================================================
   *  FIGURES — off-screen ECharts at fixed size, light print theme
   * ================================================================= */
  function axisBase() {
    return { axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false }, axisLabel: { color: C.muted, fontSize: 11 }, splitLine: { lineStyle: { color: '#EFEDF6', type: [4, 4] } }, nameTextStyle: { color: C.muted, fontSize: 11 } };
  }
  function opt(o) {
    const ax = axisBase();
    const merge = (a) => Array.isArray(a) ? a.map(x => Object.assign({}, ax, x)) : Object.assign({}, ax, a);
    const out = Object.assign({ animation: false, backgroundColor: '#FFFFFF', textStyle: { fontFamily: 'Inter, Segoe UI, Arial, sans-serif', color: C.muted },
      grid: { left: 58, right: 24, top: 44, bottom: 34 }, legend: { top: 4, textStyle: { color: C.muted, fontSize: 11 }, itemWidth: 10, itemHeight: 10, icon: 'circle', itemGap: 14 } }, o);
    if (o.xAxis) out.xAxis = merge(o.xAxis); if (o.yAxis) out.yAxis = merge(o.yAxis);
    return out;
  }
  function render(option, w, h) {
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:-20000px;top:0;width:${w}px;height:${h}px;`;
    document.body.appendChild(host);
    const inst = echarts.init(host, null, { renderer: 'canvas', width: w, height: h, devicePixelRatio: 2 });
    inst.setOption(option);
    const url = inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#FFFFFF' });
    inst.dispose(); host.remove();
    return url;
  }
  function figures(D) {
    const { a, c, H, f, r, mRE } = D, figs = {};
    const W = 1000;
    // 1 monthly RE generation
    figs.reMonthly = { w: W, h: 380, url: render(opt({ xAxis: { type: 'category', data: MONTHS }, yAxis: { type: 'value', name: 'GWh' },
      series: [{ name: 'Solar PV', type: 'bar', stack: 'e', data: mRE.map(m => +(m.solar / 1000).toFixed(2)), itemStyle: { color: C.solar } },
        { name: 'Wind', type: 'bar', stack: 'e', data: mRE.map(m => +(m.wind / 1000).toFixed(2)), itemStyle: { color: C.wind, borderRadius: [4, 4, 0, 0] } }] }), W, 380) };
    // 2 average diurnal profile
    const dS = new Array(24).fill(0), dW = new Array(24).fill(0);
    for (let h = 0; h < 8760; h++) { dS[CAL.hour[h]] += H.solarMW[h] / 365; dW[CAL.hour[h]] += H.windMW[h] / 365; }
    const dE = new Array(24).fill(0); for (let h = 0; h < 8760; h++) dE[CAL.hour[h]] += H.EP[h] / 365;
    figs.diurnal = { w: W, h: 380, url: render(opt({ xAxis: { type: 'category', data: dS.map((_, i) => String(i).padStart(2, '0')), name: 'hour' }, yAxis: { type: 'value', name: 'MW' },
      series: [{ name: 'Solar PV', type: 'line', stack: 'g', areaStyle: { opacity: .6 }, symbol: 'none', lineStyle: { width: 0 }, itemStyle: { color: C.solar }, data: dS.map(x => +x.toFixed(1)) },
        { name: 'Wind', type: 'line', stack: 'g', areaStyle: { opacity: .6 }, symbol: 'none', lineStyle: { width: 0 }, itemStyle: { color: C.wind }, data: dW.map(x => +x.toFixed(1)) },
        { name: 'Electrolyser load', type: 'line', symbol: 'none', lineStyle: { width: 2.2, color: C.h2 }, itemStyle: { color: C.h2 }, data: dE.map(x => +x.toFixed(1)) }] }), W, 380) };
    // 3 duration curve
    const dc = (arr) => { const s = Float64Array.from(arr).sort().reverse(); const out = []; for (let i = 0; i < 8760; i += 20) out.push([i, +s[i].toFixed(1)]); return out; };
    figs.duration = { w: W, h: 360, url: render(opt({ xAxis: { type: 'value', name: 'hours', max: 8760 }, yAxis: { type: 'value', name: 'MW' },
      series: [{ name: 'Hybrid RE', type: 'line', data: dc(H.RE), symbol: 'none', lineStyle: { width: 2.4, color: C.accent }, itemStyle: { color: C.accent }, areaStyle: { color: C.accent, opacity: .07 } },
        { name: 'Solar PV', type: 'line', data: dc(H.solarMW), symbol: 'none', lineStyle: { color: C.solar }, itemStyle: { color: C.solar } },
        { name: 'Wind', type: 'line', data: dc(H.windMW), symbol: 'none', lineStyle: { color: C.wind }, itemStyle: { color: C.wind } },
        { name: 'Electrolyser', type: 'line', data: dc(H.EP), symbol: 'none', lineStyle: { color: C.h2, type: 'dashed' }, itemStyle: { color: C.h2 } }] }), W, 360) };
    // 4 energy flow sankey
    const bessLoss = Math.max(0, a.bessCharge - a.bessDisch);
    const links = []; const L = (s, t, v) => { if (v > 1) links.push({ source: s, target: t, value: Math.round(v) }); };
    L('Solar PV', 'RE busbar', a.solar); L('Wind', 'RE busbar', a.wind); L('Grid import', 'RE busbar', a.imported);
    L('RE busbar', 'Electrolysers', a.ely); L('RE busbar', 'NH3 loop aux', a.aux); L('RE busbar', 'BESS losses', bessLoss); L('RE busbar', 'Curtailed', a.curtailed); L('RE busbar', 'Bank charges', a.bankTariff);
    L('Electrolysers', 'Green H2 (LHV)', a.h2 * 33.33); L('Electrolysers', 'Conversion losses', a.ely - a.h2 * 33.33);
    const nc = { 'Solar PV': C.solar, 'Wind': C.wind, 'Grid import': C.grid, 'RE busbar': C.accent, 'Electrolysers': C.h2, 'NH3 loop aux': C.nh3, 'BESS losses': C.bess, 'Curtailed': C.curt, 'Bank charges': C.grid, 'Green H2 (LHV)': '#8FDCC3', 'Conversion losses': '#D7D3E6' };
    const names = [...new Set(links.flatMap(l => [l.source, l.target]))];
    figs.sankey = { w: W, h: 420, url: render({ animation: false, backgroundColor: '#FFFFFF', textStyle: { fontFamily: 'Inter, Segoe UI, Arial, sans-serif' },
      series: [{ type: 'sankey', left: 20, right: 150, top: 20, bottom: 16, nodeWidth: 16, nodeGap: 16, nodeAlign: 'justify', data: names.map(n => ({ name: n, itemStyle: { color: nc[n] || C.grid } })), links,
        label: { color: C.ink, fontSize: 12, formatter: (p) => `${p.name}  ${fmt(p.value / 1000, 1)} GWh` }, lineStyle: { color: 'gradient', opacity: .35, curveness: .5 } }] }, W, 420) };
    // 5 monthly NH3 vs obligation
    figs.nh3Monthly = { w: W, h: 380, url: render(opt({ xAxis: { type: 'category', data: MONTHS }, yAxis: { type: 'value', name: 't NH3' }, grid: { left: 64, right: 24, top: 48, bottom: 34 },
      series: [{ name: 'Production', type: 'bar', data: r.monthly.map(m => +m.nh3.toFixed(0)), itemStyle: { color: C.nh3, borderRadius: [4, 4, 0, 0] } },
        { name: 'Dispatched', type: 'bar', data: r.monthly.map(m => +m.lifted.toFixed(0)), itemStyle: { color: C.h2, borderRadius: [4, 4, 0, 0] } },
        { name: 'Shortfall', type: 'bar', data: r.monthly.map(m => +m.short.toFixed(0)), itemStyle: { color: C.curt, borderRadius: [4, 4, 0, 0] } },
        { name: 'Obligation', type: 'line', data: new Array(12).fill(c.Derivative_Obligation_TPM), symbol: 'none', lineStyle: { type: 'dashed', color: C.gold, width: 2 }, itemStyle: { color: C.gold } }] }), W, 380) };
    // 6 daily NH3
    const day = [], dl = []; for (let dd = 0; dd < 365; dd++) { let s = 0; for (let h = 0; h < 24; h++) s += H.DProd[dd * 24 + h]; day.push(+s.toFixed(1)); dl.push(`${CAL.day[dd * 24]} ${MONTHS[CAL.month[dd * 24] - 1]}`); }
    const nr = c.Derivative_Normal_MTPD;
    figs.nh3Daily = { w: W, h: 340, url: render(opt({ xAxis: { type: 'category', data: dl, axisLabel: { interval: 30, color: C.muted, fontSize: 10 } }, yAxis: { type: 'value', name: 't/day' },
      series: [{ name: 'Daily NH3', type: 'bar', barWidth: '92%', data: day.map(v => ({ value: v, itemStyle: { color: v < nr * 0.5 ? C.curt : v < nr * 0.95 ? C.gold : C.nh3 } })) },
        { name: 'Normal rate', type: 'line', data: new Array(365).fill(nr), symbol: 'none', lineStyle: { type: 'dashed', color: C.ink, width: 1 }, itemStyle: { color: C.ink } }] }), W, 340) };
    // 7 representative weeks (highest and lowest RE)
    let best = 0, worst = 0, bv = -1, wv = Infinity;
    for (let dd = 0; dd + 7 <= 365; dd++) { let s = 0; for (let h = dd * 24; h < dd * 24 + 168; h++) s += H.RE[h]; if (s > bv) { bv = s; best = dd; } if (s < wv) { wv = s; worst = dd; } }
    const week = (d0) => {
      const ix = []; for (let h = d0 * 24; h < d0 * 24 + 168; h++) ix.push(h);
      const lab = ix.map(h => `${CAL.day[h]} ${MONTHS[CAL.month[h] - 1]} ${String(CAL.hour[h]).padStart(2, '0')}h`);
      const r1 = (x) => Math.round(x * 10) / 10;
      const ar = (name, data, color, extra) => Object.assign({ name, type: 'line', stack: 'u', symbol: 'none', areaStyle: { opacity: .75 }, lineStyle: { width: 0 }, itemStyle: { color }, data }, extra || {});
      return render(opt({ grid: { left: 58, right: 58, top: 44, bottom: 40 }, legend: { top: 4, type: 'plain', textStyle: { color: C.muted, fontSize: 10 }, itemWidth: 9, itemHeight: 9, icon: 'circle' },
        xAxis: { type: 'category', data: lab, axisLabel: { interval: 23, color: C.muted, fontSize: 10 } }, yAxis: [{ type: 'value', name: 'MW' }, { type: 'value', name: '%', max: 120, splitLine: { show: false } }],
        series: [ar('Electrolysers', ix.map(h => r1(H.EP[h])), C.h2), ar('NH3 loop aux', ix.map(h => r1(H.DP[h])), C.nh3),
          ar('BESS charging', ix.map(h => r1(-Math.min(0, H.BD_bus[h]) - Math.min(0, H.BE_bus[h]))), C.bess), ar('Curtailed', ix.map(h => r1(Math.max(0, H.CURT[h]))), C.curt, { areaStyle: { opacity: .35 } }),
          { name: 'RE generation', type: 'line', symbol: 'none', data: ix.map(h => r1(H.RE[h])), lineStyle: { color: C.ink, width: 1.3 }, itemStyle: { color: C.ink } },
          { name: 'H2 storage %', type: 'line', yAxisIndex: 1, symbol: 'none', data: ix.map(h => r1(H.H2pct[h])), lineStyle: { color: C.accent2, width: 1.3, type: 'dashed' }, itemStyle: { color: C.accent2 } }] }), W, 400);
    };
    figs.weekHigh = { w: W, h: 400, url: week(best), label: `${CAL.day[best * 24]} ${MONTHS[CAL.month[best * 24] - 1]}` };
    figs.weekLow = { w: W, h: 400, url: week(worst), label: `${CAL.day[worst * 24]} ${MONTHS[CAL.month[worst * 24] - 1]}` };
    // 8 storage states (daily mean)
    const dm = (arr, scale) => { const o = []; for (let dd = 0; dd < 365; dd++) { let s = 0; for (let h = 0; h < 24; h++) s += arr[dd * 24 + h]; o.push(+(s / 24 * scale).toFixed(1)); } return o; };
    const bessTot = c.BESS_Total_MWh, tankCap = c.Derivative_Storage_Capacity_Ton;
    const soc = []; for (let h = 0; h < 8760; h++) soc.push(bessTot > 0 ? (H.BD_e[h] + H.BE_e[h]) / bessTot : 0);
    figs.storage = { w: W, h: 340, url: render(opt({ xAxis: { type: 'category', data: dl, axisLabel: { interval: 30, color: C.muted, fontSize: 10 } }, yAxis: { type: 'value', name: '% of capacity', max: 100 },
      series: [{ name: 'NH3 tank level', type: 'line', symbol: 'none', data: dm(H.tankLevel, tankCap > 0 ? 100 / tankCap : 0), lineStyle: { color: C.gold, width: 1.8 }, itemStyle: { color: C.gold }, areaStyle: { color: C.gold, opacity: .12 } },
        { name: 'H2 storage', type: 'line', symbol: 'none', data: dm(H.H2pct, 1), lineStyle: { color: C.h2, width: 1.4 }, itemStyle: { color: C.h2 } },
        { name: 'BESS SOC', type: 'line', symbol: 'none', data: dm(soc, 100), lineStyle: { color: C.bess, width: 1.4 }, itemStyle: { color: C.bess } }] }), W, 340) };
    // 9 capex donut
    const pal = { 'Solar PV': C.solar, 'Wind': C.wind, 'BESS': C.bess, 'Electrolyser - PEM': '#8FDCC3', 'Electrolyser - Alkaline': C.h2, 'H2 Storage': '#B7EBDA', 'Ammonia Loop': C.nh3, 'BOP': '#B8BFD6', 'Others': '#CFD3E3', 'Evacuation': C.gold };
    const items = Object.entries(f.sec).filter(([, v]) => v > 0).map(([k, v]) => ({ name: k, value: +v.toFixed(1), itemStyle: { color: pal[k] } }));
    items.push({ name: 'Soft costs, land & IDC', value: +(f.soft + f.land + f.idc).toFixed(1), itemStyle: { color: '#E4DDF5' } });
    figs.capex = { w: W, h: 400, url: render({ animation: false, backgroundColor: '#FFFFFF', textStyle: { fontFamily: 'Inter, Segoe UI, Arial, sans-serif' },
      legend: { orient: 'vertical', right: 20, top: 'middle', textStyle: { color: C.ink, fontSize: 12 }, icon: 'circle', itemWidth: 10, formatter: (n) => { const it = items.find(x => x.name === n); return `${n}   ${it ? fmt(it.value, 0) + ' Cr  (' + fmt(it.value / f.capex * 100, 1) + '%)' : ''}`; } },
      title: { text: fmt(f.capex, 0), subtext: 'INR crore', left: '27%', top: '42%', textAlign: 'center', textStyle: { color: C.ink, fontSize: 26, fontWeight: 700 }, subtextStyle: { color: C.muted, fontSize: 12 }, itemGap: 4 },
      series: [{ type: 'pie', radius: ['42%', '68%'], center: ['27.5%', '52%'], label: { show: false }, itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 }, data: items }] }, W, 400) };
    // 10 LCOA build-up
    const kg = a.nh3 * 1000 * S.fin.Plant_Availability_Percent / 100;
    const comps = Object.entries(f.sec).filter(([, v]) => v > 0).map(([k, v]) => [k, v * (f.capex / f.epc) * f.crf * 1e7 / kg]);
    comps.push(['OPEX & replacements', f.annOpex * 1e7 / kg]);
    let acc = 0; const base = [], val = []; comps.forEach(([, v]) => { base.push(+acc.toFixed(2)); val.push(+v.toFixed(2)); acc += v; });
    figs.lcoa = { w: W, h: 400, url: render(opt({ legend: { show: false }, grid: { left: 58, right: 20, top: 30, bottom: 100 },
      xAxis: { type: 'category', data: comps.map(x => x[0]).concat(['LCOA']), axisLabel: { interval: 0, rotate: 30, color: C.muted, fontSize: 11 } }, yAxis: { type: 'value', name: 'INR/kg' },
      series: [{ type: 'bar', stack: 'w', data: base.concat([0]), itemStyle: { color: 'transparent' } },
        { type: 'bar', stack: 'w', data: val.map((v, i) => ({ value: v, itemStyle: { color: pal[comps[i][0]] || C.grid, borderRadius: 3 } })).concat([{ value: +acc.toFixed(2), itemStyle: { color: C.accent, borderRadius: 3 } }]),
          label: { show: true, position: 'top', fontSize: 11, color: C.ink, formatter: (p) => p.value >= 0.5 ? fmt(p.value, 1) : '' } }] }), W, 400) };
    figs.lcoaComps = comps.concat([['LCOA', acc]]);
    // 11 cash flows
    const nC = f.cf.length - f.rows.length;
    const yrs = []; for (let i = 0; i < nC; i++) yrs.push('C' + (i + 1)); f.rows.forEach(x => yrs.push('Y' + x.yr));
    let cum = 0; const cumA = f.cf.map(x => +(cum += x).toFixed(0));
    figs.cash = { w: W, h: 380, url: render(opt({ xAxis: { type: 'category', data: yrs }, yAxis: [{ type: 'value', name: 'INR Cr' }, { type: 'value', name: 'cumulative', splitLine: { show: false } }], grid: { left: 64, right: 70, top: 48, bottom: 34 },
      series: [{ name: 'Revenue', type: 'bar', data: new Array(nC).fill(0).concat(f.rows.map(x => +x.rev.toFixed(0))), itemStyle: { color: C.h2, opacity: .35 } },
        { name: 'Free cash flow', type: 'bar', data: f.cf.map(x => ({ value: +x.toFixed(0), itemStyle: { color: x >= 0 ? C.h2 : C.curt } })) },
        { name: 'Cumulative', type: 'line', yAxisIndex: 1, data: cumA, smooth: true, symbol: 'none', lineStyle: { color: C.gold, width: 2.5 }, itemStyle: { color: C.gold } }] }), W, 380) };
    figs.cashYears = yrs; figs.cashCum = cumA;
    // 12 annual yields by year (location model only)
    if (D.resource.perYear && D.resource.perYear.length > 1) {
      const py = D.resource.perYear;
      figs.years = { w: W, h: 340, url: render(opt({ xAxis: { type: 'category', data: py.map(y => String(y.year)) }, yAxis: [{ type: 'value', name: 'kWh/kWp (solar)' }, { type: 'value', name: 'MWh/MW (wind)', splitLine: { show: false } }], grid: { left: 64, right: 70, top: 48, bottom: 34 },
        series: [{ name: 'Solar specific yield', type: 'bar', data: py.map(y => +y.solar.toFixed(0)), itemStyle: { color: C.solar, borderRadius: [4, 4, 0, 0] } },
          { name: 'Wind specific yield', type: 'line', yAxisIndex: 1, data: py.map(y => +y.wind.toFixed(0)), itemStyle: { color: C.wind }, lineStyle: { width: 2.4 } }] }), W, 340) };
    }
    return figs;
  }

  /* ---------- logo raster ---------- */
  function logoPng(px) {
    return new Promise((resolve) => {
      const link = document.querySelector('link[rel="icon"]');
      if (!link) return resolve(null);
      const img = new Image();
      img.onload = () => { try { const cv = document.createElement('canvas'); cv.width = cv.height = px; cv.getContext('2d').drawImage(img, 0, 0, px, px); resolve(cv.toDataURL('image/png')); } catch (e) { resolve(null); } };
      img.onerror = () => resolve(null);
      let src = link.href;
      try {   // give the SVG explicit pixel dimensions so it rasterises in every browser
        let svg = decodeURIComponent(src.slice(src.indexOf(',') + 1));
        svg = svg.replace(/<svg([^>]*?)\s(width|height)="[^"]*"/g, '<svg$1').replace(/<svg([^>]*?)\s(width|height)="[^"]*"/g, '<svg$1').replace('<svg', `<svg width="${px}" height="${px}"`);
        src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      } catch (e) { /* keep original */ }
      img.src = src;
    });
  }

  /* =================================================================
   *  INPUT LISTS
   * ================================================================= */
  function inputRows() {
    const spec = APP().formSpec();
    const rows = [];
    const val = (root, key) => { const v = U.getPath(root + '.' + key); return v; };
    const show = (sp, v) => {
      if (typeof v === 'boolean') return v ? 'Yes' : 'No';
      if (sp.o && sp.o.type === 'sel') { const opts = typeof sp.o.options === 'function' ? sp.o.options() : sp.o.options; const hit = (opts || []).find(x => String(x[0]) === String(v)); return hit ? hit[1] : v; }
      if (Array.isArray(v)) return v.join(', ');
      return v;
    };
    const site = [['Project name', S.site.project, ''], ['Location', S.site.place, ''], ['Latitude', S.site.lat, '°'], ['Longitude', S.site.lon, '°'], ['Elevation', S.site.elev, 'm'], ['UTC offset', S.site.tz, 'h']];
    site.forEach(x => rows.push({ sec: 'Site', group: 'Site', label: x[0], value: x[1], unit: x[2], key: 'site' }));
    const res = [['Weather dataset', R.weather ? R.weather.source : (S.cache ? S.cache.dataset : S.res.source), ''], ['Years analysed', `${S.res.y0}–${S.res.y1}`, ''], ['Profile construction', S.res.basis === 'tmy' ? 'Typical year (Sandia TMY)' : 'Single year ' + S.res.year, ''],
      ['Solar profile source', S.prof.srcSolar, ''], ['Wind profile source', S.prof.srcWind, ''], ['Exceedance level', S.prof.plevel + ' (' + (S.prof.pbasis === '10y' ? '10-year' : '1-year') + ')', ''], ['Solar uncertainty', S.prof.uncSolar, '%'], ['Wind uncertainty', S.prof.uncWind, '%']];
    res.forEach(x => rows.push({ sec: 'Resource & profile', group: 'Resource & profile', label: x[0], value: x[1], unit: x[2], key: 'res' }));
    const secName = { pv: 'Solar PV design', wind: 'Wind design', plant: 'Plant configuration', fin: 'Economics' };
    for (const [path, sp] of spec) {
      if (!secName[sp.root]) continue;
      const v = val(sp.root, sp.key);
      if (v == null || typeof v === 'object' && !Array.isArray(v)) continue;
      rows.push({ sec: secName[sp.root], group: sp.group, label: sp.label, value: show(sp, v), unit: sp.unit || '', key: path });
    }
    return rows;
  }

  /* =================================================================
   *  PDF
   * ================================================================= */
  async function buildPdf(D, figs) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const AT = (opts) => { if (typeof doc.autoTable === 'function') doc.autoTable(opts); else window.jspdf_autotable ? window.jspdf_autotable.autoTable(doc, opts) : window.jspdf.autoTable(doc, opts); };
    const PW = 210, PH = 297, M = 16, CW = PW - 2 * M;
    const logo = await logoPng(256);
    const { meta, a, f, c, r } = D;
    let y = 0;
    const col = (h) => doc.setTextColor(...rgb(h)), fill = (h) => doc.setFillColor(...rgb(h)), draw = (h) => doc.setDrawColor(...rgb(h));
    const font = (st, sz) => { doc.setFont('helvetica', st); doc.setFontSize(sz); };
    const text = (s, x, yy, o) => doc.text(tx(s), x, yy, o);
    const toc = [];

    function header() {
      fill('#FFFFFF'); doc.rect(0, 0, PW, 14, 'F');
      if (logo) doc.addImage(logo, 'PNG', M, 4.2, 6, 6);
      font('bold', 9); col(C.ink); text('HyProfile', M + 8, 8.6);
      font('normal', 8); col(C.muted); text('Simulation report', M + 25, 8.6);
      text(meta.title.length > 70 ? meta.title.slice(0, 68) + '…' : meta.title, PW - M, 8.6, { align: 'right' });
      draw(C.line); doc.setLineWidth(0.3); doc.line(M, 12, PW - M, 12);
    }
    function page(title) {
      doc.addPage(); header(); y = 24;
      if (title) h1(title);
    }
    function ensure(h) { if (y + h > PH - 18) { page(); } }
    function h1(s) {
      toc.push([s, doc.getNumberOfPages()]);
      fill(C.accent); doc.roundedRect(M, y - 5.2, 2.2, 7.4, 1, 1, 'F');
      font('bold', 16); col(C.ink); text(s, M + 5, y); y += 8;
    }
    function h2(s) { ensure(16); y += 1.5; font('bold', 11.5); col(C.ink); text(s, M, y); y += 2; draw(C.line); doc.setLineWidth(0.25); doc.line(M, y, PW - M, y); y += 5; }
    function para(s, size = 9.5, color = C.muted) {
      font('normal', size); col(color);
      const lines = doc.splitTextToSize(tx(s), CW);
      const lh = size * 0.43;
      lines.forEach(l => { ensure(lh + 1); text(l, M, y); y += lh; });
      y += 2;
    }
    function bullets(list, size = 9.5) {
      font('normal', size);
      const lh = size * 0.43;
      list.forEach(s => {
        const lines = doc.splitTextToSize(tx(s), CW - 6);
        ensure(lines.length * lh + 2);
        fill(C.accent); doc.circle(M + 1.4, y - 1.2, 0.8, 'F'); col(C.ink);
        lines.forEach((l, i) => { text(l, M + 5, y); y += lh; });
        y += 1.6;
      });
      y += 1;
    }
    function figure(fg, caption, wmm) {
      if (!fg) return;
      const w = wmm || CW, h = w * fg.h / fg.w;
      ensure(h + 9);
      draw(C.line); doc.setLineWidth(0.25); doc.roundedRect(M - 0.5, y - 0.5, w + 1, h + 1, 2, 2, 'S');
      doc.addImage(fg.url, 'PNG', M, y, w, h, undefined, 'FAST');
      y += h + 4.5;
      if (caption) { font('italic', 8); col(C.muted); text(caption, M, y); y += 6; }
    }
    function table(head, body, o = {}) {
      AT(Object.assign({
        startY: y, head: [head.map(tx)], body: body.map(rw => rw.map(v => tx(v))), margin: { left: M, right: M, top: 20, bottom: 18 },
        theme: 'plain', styles: { font: 'helvetica', fontSize: 8.4, cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 }, textColor: rgb(C.ink), lineColor: rgb(C.line), lineWidth: { bottom: 0.15 } },
        headStyles: { fillColor: rgb('#EFEDFF'), textColor: rgb('#3B2FB8'), fontStyle: 'bold', fontSize: 8.4 },
        alternateRowStyles: { fillColor: rgb('#FBFAFE') },
        didDrawPage: () => header(),
        didParseCell: (h) => {
          if (h.section === 'body' && o.boldRows && o.boldRows.includes(h.row.index)) { h.cell.styles.fontStyle = 'bold'; h.cell.styles.fillColor = rgb('#F3F1FD'); }
          if (h.column.index > 0 && o.numeric !== false && (o.numCols ? o.numCols.includes(h.column.index) : true)) h.cell.styles.halign = 'right';
        }
      }, o.at || {}));
      y = doc.lastAutoTable.finalY + 6;
    }
    function kpiTiles(items, cols = 3) {
      const gap = 3.5, w = (CW - gap * (cols - 1)) / cols, h = 20;
      items.forEach((k, i) => {
        const cx = M + (i % cols) * (w + gap), cy = y + Math.floor(i / cols) * (h + gap);
        fill('#FBFAFE'); draw(C.line); doc.setLineWidth(0.25); doc.roundedRect(cx, cy, w, h, 2.2, 2.2, 'FD');
        fill(k[4] || C.accent); doc.roundedRect(cx, cy + 3, 1.2, h - 6, 0.6, 0.6, 'F');
        font('normal', 7.4); col(C.muted); text(k[0].toUpperCase(), cx + 4, cy + 5.6);
        font('bold', 14); col(C.ink); text(k[1], cx + 4, cy + 12.4);
        if (k[2]) { const vw = doc.getTextWidth(tx(k[1])); font('normal', 8); col(C.muted); text(k[2], cx + 5 + vw, cy + 12.4); }
        font('normal', 6.9); col(C.muted); const sub = doc.splitTextToSize(tx(k[3] || ''), w - 6)[0] || ''; text(sub, cx + 4, cy + 17.2);
      });
      y += Math.ceil(items.length / cols) * (h + gap) + 3;
    }

    /* ---- cover ---- */
    fill('#F6F5FB'); doc.rect(0, 0, PW, PH, 'F');
    // decorative 24-hour ring echoing the logo
    const cx0 = PW - 40, cy0 = 62, rr = 26, stops = ['#5B4CF5', '#2F7BFF', '#00B8D9', '#12C46B', '#FFC21A', '#FF8A1F', '#FF4D6D', '#B04CFF'];
    const prof24 = [0.35, 0.32, 0.3, 0.3, 0.32, 0.38, 0.5, 0.66, 0.8, 0.9, 0.97, 1, 1, 0.97, 0.9, 0.8, 0.66, 0.55, 0.5, 0.48, 0.46, 0.44, 0.4, 0.37];
    doc.setLineCap('round');
    prof24.forEach((p, i) => {
      const ang = -Math.PI / 2 + i / 24 * 2 * Math.PI, r0 = rr * 0.55, r1 = r0 + rr * 0.45 * p;
      draw(stops[Math.floor(i / 3)]); doc.setLineWidth(2.1);
      doc.line(cx0 + r0 * Math.cos(ang), cy0 + r0 * Math.sin(ang), cx0 + r1 * Math.cos(ang), cy0 + r1 * Math.sin(ang));
    });
    doc.setLineCap('butt');
    if (logo) doc.addImage(logo, 'PNG', M, 20, 16, 16);
    font('bold', 15); col(C.ink); text('HyProfile', M + 20, 27.2);
    font('normal', 8.5); col(C.muted); text('HOURLY GREEN H2 SIMULATOR', M + 20, 32.4);
    font('bold', 9); col(C.accent); text('MODEL RUN REPORT', M, 70);
    font('bold', 24); col(C.ink);
    const tl = doc.splitTextToSize(tx(meta.title), CW - 60); tl.slice(0, 3).forEach((l, i) => text(l, M, 81 + i * 10));
    let yy = 81 + Math.min(3, tl.length) * 10 + 2;
    font('normal', 11); col(C.muted); text('Hourly green hydrogen & ammonia production, storage, offtake and screening economics', M, yy); yy += 14;
    const metaRows = [['Site', `${meta.place || '—'}`], ['Coordinates', `${fmt(meta.lat, 4)}°, ${fmt(meta.lon, 4)}°  ·  ${fmt(meta.elev, 0)} m  ·  UTC${meta.tz >= 0 ? '+' : ''}${meta.tz}`],
      ['Configuration case', meta.caseName], ['Profile', `Solar: ${D.resource.srcSolar}  ·  Wind: ${D.resource.srcWind}  ·  ${D.resource.plevel}`]];
    if (meta.client) metaRows.push(['Prepared for', meta.client]);
    if (meta.author) metaRows.push(['Prepared by', meta.author]);
    metaRows.push(['Generated', meta.stamp], ['Report ID', meta.id]);
    metaRows.forEach(([k, v]) => { font('normal', 8.5); col(C.muted); text(k.toUpperCase(), M, yy); font('normal', 10); col(C.ink); const vl = doc.splitTextToSize(tx(v), CW - 45).slice(0, 2); vl.forEach((l, i) => text(l, M + 42, yy + i * 4.6)); yy += 7 + (vl.length - 1) * 4.6; });
    y = yy + 8;
    const ful = D.ful;
    kpiTiles([
      ['Ammonia production', f0(a.nh3), 't/yr', `${f1(a.nh3 / 365)} t/day`, C.nh3],
      ['Offtake fulfilment', pc(ful), '', `${a.daysMet}/${a.days} days met`, ful > 0.98 ? C.ok : C.warn],
      ['Green hydrogen', f0(a.h2), 't/yr', `Electrolyser CUF ${fmt(a.elyCUF, 1)}%`, C.h2],
      ['LCOA', f1(f.lcoa), 'INR/kg', `Breakeven ${f1(f.breakeven)} INR/kg`, C.accent],
      ['Project IRR', pc(f.pirr), '', `WACC ${pc(f.wacc)}`, fin(f.pirr) && f.pirr >= f.wacc ? C.ok : C.curt],
      ['Total project cost', f0(f.capex), 'INR Cr', `EPC ${f0(f.epc)} Cr`, C.gold]
    ], 3);
    font('normal', 7.5); col(C.faint);
    text('Screening-level results generated in the browser by the HyProfile 8760-hour engine. Figures are indicative and depend on the stated inputs.', M, PH - 14);

    /* ---- contents placeholder page ---- */
    page(); const tocPage = doc.getNumberOfPages();

    /* ---- 1 executive summary ---- */
    page('1  Executive summary');
    para(`This report documents a single model run of the hybrid renewable-energy, green-hydrogen and ammonia plant at ${meta.place || 'the selected site'}. The plant is simulated hour by hour for 8,760 hours with a 72-hour cyclic warm-up; product storage and offtake are tracked on the operating year starting ${c.Analysis_Day_start}/${c.Analysis_Month_start}.`);
    h2('Key results');
    table(['Indicator', 'Value', 'Unit', 'Detail'], D.kpis.map(k => [k[0], k[1], k[2], k[3]]), { numCols: [1], at: { styles: { fontSize: 8.2, cellPadding: { top: 1.3, bottom: 1.3, left: 2, right: 2 } }, columnStyles: { 0: { cellWidth: 46, fontStyle: 'bold' }, 1: { cellWidth: 26 }, 2: { cellWidth: 18 } } } });
    h2('Observations');
    bullets(D.obs);
    h2('Installed configuration');
    table(['Asset', 'Rating', 'Unit'], [
      ['Solar PV', f0(c.Solar_Capacity_MWp), 'MWp'], ['Wind', f0(c.Wind_Capacity_MWp), 'MW'],
      ['Electrolysers (total)', f0(c.Electrolyzer_Design_MW), 'MW'], ['  PEM / alkaline split', `${f0(D.d.PEM_D)} / ${f0(D.d.ALK_D)}`, 'MW'],
      ['Ammonia loop (installed / normal)', `${f0(c.Ammonia_Loop_Installed_Capacity)} / ${f0(c.Derivative_Normal_MTPD)}`, 'MTPD'],
      ['Hydrogen buffer storage', f1(c.Hydrogen_Storage_Ton), 't'], ['Battery energy storage', f0(c.BESS_Total_MWh), 'MWh'],
      ['Ammonia tank', f0(c.Derivative_Storage_Capacity_Ton), 't'], ['Offtake contract', `${f0(c.Derivative_Offtake_TPM)} (${c.Derivative_Offtake_Frequency})`, 't/month'],
      ['Grid banking ceiling', f0(c.Grid_Banking_Max_MWh), 'MWh']
    ], { numCols: [1], at: { styles: { fontSize: 8, cellPadding: { top: 1.1, bottom: 1.1, left: 2, right: 2 } }, columnStyles: { 0: { cellWidth: 80 } } } });

    /* ---- 2 resource ---- */
    if (D.o.resource) {
      page('2  Renewable resource & generation profile');
      const rs = D.resource;
      table(['Item', 'Solar PV', 'Wind'], [
        ['Profile source', rs.srcSolar, rs.srcWind],
        ['Exceedance level / horizon', `${rs.plevel} / ${rs.pbasis}`, `${rs.plevel} / ${rs.pbasis}`],
        ['Pxx / P50 scaling factor', fmt(rs.fs, 4), fmt(rs.fw, 4)],
        ['Specific yield at POI', `${f0(rs.solarY)} kWh/kWp`, `${f0(rs.windY)} MWh/MW`],
        ['Capacity utilisation factor', pc(rs.solarCUF, 2), pc(rs.windCUF, 2)],
        ['Annual generation (plant)', `${f1(a.solar / 1000)} GWh`, `${f1(a.wind / 1000)} GWh`]
      ].concat(rs.model ? [['Weather data', `${rs.dataset || '—'} ${rs.years ? rs.years.join('–') : ''}`, rs.basis]] : []), { numeric: false, at: { columnStyles: { 0: { cellWidth: 58, fontStyle: 'bold' } } } });
      figure(figs.reMonthly, 'Figure 2.1  Monthly renewable generation at the point of interconnection (GWh).');
      figure(figs.diurnal, 'Figure 2.2  Average diurnal generation and electrolyser load (MW).');
      figure(figs.duration, 'Figure 2.3  Duration curves of hourly generation and electrolyser load (MW).');
      if (figs.years) figure(figs.years, 'Figure 2.4  Inter-annual variability of specific yield.');
      if (rs.perYear) {
        h2('Annual statistics by weather year');
        table(['Year', 'Solar yield (kWh/kWp)', 'Solar CUF', 'Wind yield (MWh/MW)', 'Wind CUF', 'GHI (kWh/m²)', 'Mean hub speed (m/s)'],
          rs.perYear.map(y1 => [String(y1.year), f0(y1.solar), pc(y1.solar / 8760, 2), f0(y1.wind), pc(y1.wind / 8760, 2), f0(y1.ghi), f2(y1.vhub)]));
      }
      if (D.pvLoss) {
        h2('Solar PV energy loss chain (per kWp, annual average)');
        table(['Stage / loss', 'Change', 'Value'], D.pvLoss.rows.filter(x => x.type === 'stage' || Math.abs(x.rel) >= 0.00005).map(x => x.type === 'stage' ? [x.label, '', `${fmt(x.value, 1)} ${x.unit}`] : [x.label, (x.rel > 0 ? '+' : '') + fmt(x.rel * 100, 2) + '%', fmt(x.abs, 1)]),
          { boldRows: D.pvLoss.rows.filter(x => x.type === 'stage' || Math.abs(x.rel) >= 0.00005).map((x, i) => x.type === 'stage' ? i : -1).filter(i => i >= 0), at: { columnStyles: { 0: { cellWidth: 110 } } } });
        para(`Performance ratio ${pc(D.pvLoss.pr)} (E_Grid / POA × kWp). Night-time auxiliary consumption ${fmt(D.pvLoss.night, 1)} kWh/kWp is reported separately.`, 8.5);
      }
      if (D.windLoss) {
        h2('Wind energy loss chain (per MW, annual average)');
        const wr = D.windLoss.filter(x => x.type === 'stage' || Math.abs(x.rel) >= 0.00005);
        table(['Stage / loss', 'Change', 'Value'], wr.map(x => x.type === 'stage' ? [x.label, '', `${fmt(x.value, 0)} ${x.unit}`] : [x.label, fmt(x.rel * 100, 2) + '%', fmt(x.abs, 1)]),
          { boldRows: wr.map((x, i) => x.type === 'stage' ? i : -1).filter(i => i >= 0), at: { columnStyles: { 0: { cellWidth: 110 } } } });
      }
    }

    /* ---- 3 operations ---- */
    if (D.o.operations) {
      page('3  Plant operation');
      kpiTiles([
        ['NH3 production', f0(a.nh3), 't/yr', `${pc(a.nh3 / (c.Derivative_Normal_MTPD * 365))} of normal rate`, C.nh3],
        ['Loop utilisation', fmt(a.loopUtil, 1) + '%', '', `${f0(a.hoursRunning)} h running`, C.nh3],
        ['Shutdowns', f0(a.shutdowns), '/yr', `${f0(a.hoursRationed)} h rationed`, C.warn],
        ['H2 production', f0(a.h2), 't/yr', `PEM ${f0(a.h2pem)} · ALK ${f0(a.h2alk)}`, C.h2],
        ['Electrolyser CUF', fmt(a.elyCUF, 1) + '%', '', `${f0(a.hoursRampLimited)} h ramp-limited`, C.h2],
        ['Curtailment', pc(a.re > 0 ? a.curtailed / a.re : 0), '', `${f1(a.curtailed / 1000)} GWh`, C.curt]
      ], 3);
      figure(figs.sankey, 'Figure 3.1  Annual energy flow (GWh/yr). Hydrogen energy is shown on a lower-heating-value basis (33.33 kWh/kg).');
      h2('Annual energy balance');
      table(['Flow', 'Category', 'MWh/yr', 'Share of RE'], D.balance.map(b => [b[0], b[2], f0(b[1]), b[2] === 'Use' || b[0].startsWith('Solar') || b[0].startsWith('Wind') ? pc(a.re > 0 ? b[1] / a.re : 0) : '']), { numCols: [2, 3] });
      figure(figs.nh3Monthly, 'Figure 3.2  Monthly ammonia production, dispatch and shortfall against the monthly obligation (t).');
      figure(figs.nh3Daily, 'Figure 3.3  Daily ammonia production (t/day); colour indicates < 50 %, 50–95 % and >= 95 % of the normal rate.');
      figure(figs.weekHigh, `Figure 3.4  Hourly dispatch in the highest-RE week (starting ${figs.weekHigh.label}).`);
      figure(figs.weekLow, `Figure 3.5  Hourly dispatch in the lowest-RE week (starting ${figs.weekLow.label}).`);
      figure(figs.storage, 'Figure 3.6  Daily mean storage levels (% of installed capacity).');
      h2('Monthly operating summary');
      const mm = r.monthly, T = (k) => sum(mm.map(x => x[k]));
      table(['Month', 'RE (MWh)', 'Electrolyser (MWh)', 'Curtailed (MWh)', 'H2 (t)', 'NH3 (t)', 'Shutdowns'],
        mm.map(x => [MONTHS[x.m - 1], f0(x.re), f0(x.ely), f0(x.curt), f1(x.h2), f0(x.nh3), f0(x.shutdowns)]).concat([['Year', f0(T('re')), f0(T('ely')), f0(T('curt')), f1(T('h2')), f0(T('nh3')), f0(a.shutdowns)]]), { boldRows: [12] });
      h2('Product tank & offtake ledger (operating year)');
      const L = r.tank.ledger, tot = (k) => sum(L.map(x => x[k]));
      table(['Month', 'Opening (t)', 'Production (t)', 'Excess (t)', 'Due (t)', 'Dispatched (t)', 'Shortfall (t)', 'Closing (t)', 'Fulfilment'],
        L.map(l => [MONTHS[l.month - 1], f0(l.open), f0(l.prod), f0(l.excess), f0(l.due), f0(l.lifted), f0(l.short), f0(l.close), l.due > 0 ? pc(l.lifted / l.due) : '—'])
          .concat([['Year', '', f0(tot('prod')), f0(tot('excess')), f0(tot('due')), f0(tot('lifted')), f0(tot('short')), '', tot('due') > 0 ? pc(tot('lifted') / tot('due')) : '—']]), { boldRows: [L.length], at: { styles: { fontSize: 7.8 } } });
    }

    /* ---- 4 economics ---- */
    if (D.o.economics) {
      page('4  Screening economics');
      kpiTiles([
        ['Total project cost', f0(f.capex), 'INR Cr', `Hard cost ${f0(f.hard)} · IDC ${f0(f.idc)}`, C.gold],
        ['LCOA', f1(f.lcoa), 'INR/kg', `${f0(f.lcoa * 1000 / 83.5)} USD/t`, C.accent],
        ['LCOH', f1(f.lcoh), 'INR/kg', `${f2(f.lcoh / 83.5)} USD/kg`, C.h2],
        ['Project IRR', pc(f.pirr), '', `WACC ${pc(f.wacc)}`, fin(f.pirr) && f.pirr >= f.wacc ? C.ok : C.curt],
        ['Equity IRR', pc(f.eirr), '', `Cost of equity ${fmt(S.fin.Cost_of_Equity_Percent, 1)}%`, C.nh3],
        ['Minimum DSCR', fin(f.minDSCR) ? fmt(f.minDSCR, 2) + 'x' : '—', '', `Breakeven ${f1(f.breakeven)} INR/kg`, fin(f.minDSCR) && f.minDSCR >= 1.3 ? C.ok : C.warn]
      ], 3);
      figure(figs.capex, 'Figure 4.1  Capital cost breakdown (INR crore).');
      h2('Capital cost');
      const capRows = Object.entries(f.sec).map(([k, v]) => [k, f1(v), pc(v / f.capex)]);
      capRows.push(['EPC subtotal', f1(f.epc), pc(f.epc / f.capex)], ['Contingency, owner’s & pre-operative', f1(f.soft), pc(f.soft / f.capex)], ['Land', f1(f.land), pc(f.land / f.capex)], ['Interest during construction', f1(f.idc), pc(f.idc / f.capex)], ['Total project cost', f1(f.capex), '100.0%']);
      table(['Item', 'INR crore', 'Share'], capRows, { boldRows: [capRows.length - 5, capRows.length - 1] });
      h2('Operating cost (year 1)');
      const op = Object.entries(f.fixedOpex).map(([k, v]) => [k, f2(v)]); op.push(['Total year-1 OPEX', f2(f.opex1)]);
      table(['Item', 'INR crore/yr'], op, { boldRows: [op.length - 1] });
      figure(figs.lcoa, 'Figure 4.2  Levelised cost of ammonia build-up (INR/kg).');
      h2('Levelised cost components');
      table(['Component', 'INR/kg NH3'], figs.lcoaComps.map(x => [x[0], f2(x[1])]), { boldRows: [figs.lcoaComps.length - 1] });
      figure(figs.cash, 'Figure 4.3  Project free cash flow and cumulative position (INR crore, nominal).');
      h2('Annual cash flow (INR crore)');
      const nC = f.cf.length - f.rows.length, cfRows = [];
      for (let i = 0; i < nC; i++) cfRows.push([figs.cashYears[i], '', '', '', '', f1(f.cf[i]), f1(figs.cashCum[i])]);
      f.rows.forEach((x, i) => cfRows.push(['Y' + x.yr, f1(x.rev), f1(x.opex), f1(x.ebitda), f1(x.tax), f1(f.cf[nC + i]), f1(figs.cashCum[nC + i])]));
      table(['Year', 'Revenue', 'OPEX', 'EBITDA', 'Tax', 'Free cash flow', 'Cumulative'], cfRows, { at: { styles: { fontSize: 7.8, cellPadding: { top: 1.1, bottom: 1.1, left: 2, right: 2 } } } });
      para('Screening economics follow the unit rates and conventions of the Python financial model (CRF-levelised cost, straight-line book depreciation for tax, equal-principal debt). The lender-grade schedule (WDV tax depreciation, MAT, DSRA, working capital, sculpting) remains with the Python model.', 8.5);
    }

    /* ---- appendix ---- */
    if (D.o.inputs) {
      page('Appendix A  Input parameters');
      const rows = inputRows();
      let lastSec = '', lastGrp = '';
      const body = [], bold = [];
      rows.forEach(rw => {
        if (rw.sec !== lastSec) { bold.push(body.length); body.push([rw.sec.toUpperCase(), '', '', '']); lastSec = rw.sec; lastGrp = ''; }
        body.push([rw.group !== lastGrp ? rw.group || '' : '', rw.label, String(rw.value), rw.unit]); lastGrp = rw.group;
      });
      table(['Group', 'Parameter', 'Value', 'Unit'], body, { numCols: [2], boldRows: bold, at: { styles: { fontSize: 7.6, cellPadding: { top: 1, bottom: 1, left: 2, right: 2 } }, columnStyles: { 0: { cellWidth: 44, textColor: rgb(C.muted) }, 1: { cellWidth: 62 }, 2: { cellWidth: 54 } } } });
    }
    page('Appendix B  Method summary');
    bullets([
      'Solar PV: NOAA solar position; Perez 1990 transposition (Hay–Davies optional); single-axis tracking with backtracking or fixed tilt; 2-D row shading; IAM; PVsyst thermal model; bifacial rear gain; DC losses; CEC inverter efficiency curve with clipping; AC ohmic, transformer and line losses; availability and POI limit.',
      'Wind: hourly shear matrix (month × hour) from two reference heights; IEC 61400-12-1 air-density correction; turbulence-smoothed generic power curves; EYA loss categories.',
      'Profiles: multi-year ERA5 / NASA POWER data in local standard time; typical year from Sandia TMY (Finkelstein–Schafer statistics) or a single year; P-level scaling from inter-annual variability and stated uncertainty.',
      'Plant: hourly busbar cascade (ammonia loop → loop BESS → PEM/alkaline fleet with minimum load, ramp limits and merit order → electrolyser BESS → grid energy bank); look-ahead ride-through rationing; hydrogen buffer; 72-hour cyclic warm-up; product tank with daily or monthly lifting and steady-state inventory cycling.',
      'Economics: CAPEX from unit rates; IDC from drawdown profile; CRF-levelised LCOA and LCOH at WACC; post-tax project and equity IRR; DSCR on equal-principal repayment; breakeven price at NPV(WACC) = 0.',
      `Numerical check: maximum hourly busbar imbalance ${D.a.balanceErr.toExponential(1)} MW; electrolyser loading order ${D.d.ORDER.join(' → ')}.`
    ], 9);

    /* ---- contents ---- */
    doc.setPage(tocPage); y = 24; toc.unshift(['Contents', tocPage]);
    fill(C.accent); doc.roundedRect(M, y - 5.2, 2.2, 7.4, 1, 1, 'F'); font('bold', 16); col(C.ink); text('Contents', M + 5, y); y += 12;
    toc.slice(1).forEach(([s, p]) => {
      font('normal', 11); col(C.ink); text(s, M, y);
      const w = doc.getTextWidth(tx(s)); draw(C.line); doc.setLineDashPattern([0.6, 1.2], 0); doc.line(M + w + 2, y - 0.8, PW - M - 10, y - 0.8); doc.setLineDashPattern([], 0);
      font('bold', 11); text(String(p), PW - M, y, { align: 'right' });
      doc.link(M, y - 5, CW, 7, { pageNumber: p }); y += 9;
    });

    /* ---- footers ---- */
    const N = doc.getNumberOfPages();
    for (let i = 2; i <= N; i++) {
      doc.setPage(i);
      draw(C.line); doc.setLineWidth(0.25); doc.line(M, PH - 12, PW - M, PH - 12);
      font('normal', 7.5); col(C.muted);
      text(`${meta.id}  ·  ${meta.stamp}`, M, PH - 7.5);
      text(`Page ${i} of ${N}`, PW - M, PH - 7.5, { align: 'right' });
    }
    doc.setProperties({ title: tx(meta.title) + ' — HyProfile simulation report', subject: 'Hourly green hydrogen / ammonia simulation', author: tx(meta.author || 'HyProfile'), creator: 'HyProfile v1.2' });
    return doc.output('blob');
  }

  /* =================================================================
   *  EXCEL
   * ================================================================= */
  async function buildXlsx(D, figs) {
    const wb = new ExcelJS.Workbook();
    wb.creator = D.meta.author || 'HyProfile'; wb.created = D.meta.date; wb.title = D.meta.title + ' — simulation report';
    const { a, f, c, r, H, meta } = D;
    const INK = argb(C.ink), MUTED = argb(C.muted), ACC = argb(C.accent);
    const thin = { style: 'thin', color: { argb: 'FFE4E1F0' } };
    const headRow = (row) => row.eachCell(cl => { cl.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACC } }; cl.alignment = { vertical: 'middle', wrapText: true }; cl.border = { bottom: thin }; });
    const bodyRows = (ws, from, to) => { for (let i = from; i <= to; i++) ws.getRow(i).eachCell(cl => { cl.border = { bottom: thin }; }); };
    const sectionTitle = (ws, rowIdx, text, span = 6) => {
      const rw = ws.getRow(rowIdx); rw.getCell(1).value = text; rw.getCell(1).font = { bold: true, size: 13, color: { argb: INK } };
      for (let k = 1; k <= span; k++) rw.getCell(k).border = { bottom: { style: 'medium', color: { argb: ACC } } };
      rw.height = 22;
    };
    const titleBlock = (ws, title, sub, span) => {
      ws.mergeCells(1, 1, 1, span); ws.mergeCells(2, 1, 2, span);
      const t = ws.getCell(1, 1); t.value = title; t.font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } }; t.alignment = { vertical: 'middle', indent: 1 };
      t.fill = { type: 'gradient', gradient: 'angle', degree: 0, stops: [{ position: 0, color: { argb: ACC } }, { position: 1, color: { argb: argb(C.accent2) } }] };
      ws.getRow(1).height = 36;
      const s = ws.getCell(2, 1); s.value = sub; s.font = { italic: true, size: 10, color: { argb: MUTED } }; s.alignment = { indent: 1 }; ws.getRow(2).height = 18;
    };
    const total = (row) => row.eachCell(cl => { cl.font = { bold: true, color: { argb: INK } }; cl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F1FD' } }; cl.border = { top: { style: 'thin', color: { argb: ACC } } }; });
    const img = (ws, fg, tl, wpx) => { if (!fg) return; const id = wb.addImage({ base64: fg.url, extension: 'png' }); const w = wpx || 640; ws.addImage(id, { tl, ext: { width: w, height: w * fg.h / fg.w } }); };
    const sub = `${meta.place || ''}  ·  ${fmt(meta.lat, 4)}, ${fmt(meta.lon, 4)}  ·  Case ${meta.caseName}  ·  Generated ${meta.stamp}  ·  ${meta.id}`;

    /* ---- Summary ---- */
    const s = wb.addWorksheet('Summary', { views: [{ showGridLines: false }], properties: { tabColor: { argb: ACC } } });
    s.columns = [{ width: 34 }, { width: 16 }, { width: 11 }, { width: 46 }, { width: 3 }, { width: 14 }];
    titleBlock(s, `${meta.title} — HyProfile simulation report`, sub, 6);
    let ri = 4;
    const info = [['Site', meta.place], ['Coordinates', `${fmt(meta.lat, 4)}°, ${fmt(meta.lon, 4)}°`], ['Elevation / UTC offset', `${fmt(meta.elev, 0)} m / UTC${meta.tz >= 0 ? '+' : ''}${meta.tz}`], ['Configuration case', meta.caseName],
      ['Solar profile', D.resource.srcSolar], ['Wind profile', D.resource.srcWind], ['Exceedance level', `${D.resource.plevel} (${D.resource.pbasis})`]];
    if (meta.client) info.push(['Prepared for', meta.client]); if (meta.author) info.push(['Prepared by', meta.author]);
    info.push(['Generated', meta.stamp], ['Report ID', meta.id]);
    info.forEach(([k, v]) => { const rw = s.getRow(ri++); rw.getCell(1).value = k; rw.getCell(1).font = { color: { argb: MUTED } }; rw.getCell(2).value = v; rw.getCell(2).font = { color: { argb: INK } }; s.mergeCells(rw.number, 2, rw.number, 4); });
    ri++; sectionTitle(s, ri++, 'Key results', 4);
    const kh = s.getRow(ri++); kh.values = ['Indicator', 'Value', 'Unit', 'Detail']; headRow(kh);
    const kv = [['Annual NH3 production', a.nh3, 't/yr', '#,##0'], ['Offtake fulfilment', D.ful, '', '0.0%'], ['Green H2 production', a.h2, 't/yr', '#,##0'], ['Electrolyser CUF', a.elyCUF / 100, '', '0.0%'],
      ['NH3 loop utilisation', a.loopUtil / 100, '', '0.0%'], ['RE curtailment', a.re > 0 ? a.curtailed / a.re : 0, '', '0.0%'], ['Loop shutdowns', a.shutdowns, '/yr', '0'],
      ['LCOA', f.lcoa, 'INR/kg', '0.00'], ['LCOH', f.lcoh, 'INR/kg', '0.00'], ['Breakeven green NH3 price', f.breakeven, 'INR/kg', '0.00'], ['Total project cost', f.capex, 'INR Cr', '#,##0.0'],
      ['Project IRR (post-tax)', fin(f.pirr) ? f.pirr : null, '', '0.00%'], ['Equity IRR', fin(f.eirr) ? f.eirr : null, '', '0.00%'], ['WACC', f.wacc, '', '0.00%'], ['Minimum DSCR', fin(f.minDSCR) ? f.minDSCR : null, 'x', '0.00']];
    const k0 = ri;
    kv.forEach((k, i) => { const rw = s.getRow(ri++); const det = D.kpis.find(x => x[0] === k[0]); rw.values = [k[0], k[1], k[2], det ? det[3] : '']; rw.getCell(2).numFmt = k[3]; rw.getCell(2).font = { bold: true, color: { argb: INK } }; rw.getCell(4).font = { color: { argb: MUTED }, size: 9 }; });
    bodyRows(s, k0, ri - 1);
    ri++; sectionTitle(s, ri++, 'Observations', 4);
    D.obs.forEach(t => { s.mergeCells(ri, 1, ri, 4); const cl = s.getCell(ri, 1); cl.value = '•  ' + t; cl.alignment = { wrapText: true, vertical: 'top' }; cl.font = { color: { argb: INK } }; s.getRow(ri).height = Math.max(18, Math.ceil(t.length / 105) * 15); ri++; });
    ri++; sectionTitle(s, ri++, 'Figures', 4);
    const figList = [[figs.nh3Monthly, 'Monthly ammonia production vs obligation'], [figs.sankey, 'Annual energy flow'], [figs.reMonthly, 'Monthly renewable generation'], [figs.capex, 'Capital cost breakdown'], [figs.lcoa, 'Levelised cost of ammonia build-up'], [figs.cash, 'Project cash flows']];
    figList.forEach(([fg, cap]) => { s.getCell(ri, 1).value = cap; s.getCell(ri, 1).font = { italic: true, color: { argb: MUTED } }; ri++; img(s, fg, { col: 0, row: ri - 1 }, 700); ri += Math.ceil(700 * fg.h / fg.w / 20) + 1; });

    /* ---- Inputs ---- */
    if (D.o.inputs) {
      const w = wb.addWorksheet('Inputs', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
      w.columns = [{ width: 24 }, { width: 36 }, { width: 46 }, { width: 22 }, { width: 14 }, { width: 40 }];
      titleBlock(w, 'Input parameters', 'All values used for this run, grouped as in the application', 6);
      const hr = w.getRow(4); hr.values = ['Section', 'Group', 'Parameter', 'Value', 'Unit', 'Key']; headRow(hr);
      let rr = 5, last = '';
      inputRows().forEach(x => {
        const rw = w.getRow(rr++); rw.values = [x.sec === last ? '' : x.sec, x.group, x.label, x.value, x.unit, x.key];
        if (x.sec !== last) { rw.getCell(1).font = { bold: true, color: { argb: ACC } }; last = x.sec; }
        rw.getCell(4).alignment = { horizontal: 'right' }; rw.getCell(6).font = { color: { argb: 'FFA19DBA' }, size: 9 }; rw.getCell(2).font = { color: { argb: MUTED } };
      });
      bodyRows(w, 5, rr - 1); w.autoFilter = { from: 'A4', to: `F${rr - 1}` };
    }

    /* ---- Resource ---- */
    if (D.o.resource) {
      const w = wb.addWorksheet('Resource', { views: [{ showGridLines: false }] });
      w.columns = [{ width: 46 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 18 }];
      titleBlock(w, 'Renewable resource & generation profile', sub, 7);
      let rr = 4; sectionTitle(w, rr++, 'Profile summary', 3);
      const hr = w.getRow(rr++); hr.values = ['Item', 'Solar PV', 'Wind']; headRow(hr);
      const rs = D.resource;
      [['Profile source', rs.srcSolar, rs.srcWind], ['Pxx / P50 scaling factor', rs.fs, rs.fw], ['Specific yield at POI (kWh/kWp, MWh/MW)', rs.solarY, rs.windY], ['Capacity utilisation factor', rs.solarCUF, rs.windCUF], ['Installed capacity (MW)', c.Solar_Capacity_MWp, c.Wind_Capacity_MWp], ['Annual generation (MWh)', a.solar, a.wind]]
        .forEach((x, i) => { const rw = w.getRow(rr++); rw.values = x; const nf = ['@', '0.0000', '#,##0.0', '0.00%', '#,##0', '#,##0'][i]; rw.getCell(2).numFmt = nf; rw.getCell(3).numFmt = nf; });
      rr++; sectionTitle(w, rr++, 'Monthly generation', 7);
      const mh = w.getRow(rr++); mh.values = ['Month', 'Solar (MWh)', 'Wind (MWh)', 'Total (MWh)', 'Solar CUF', 'Wind CUF', 'Hybrid CUF']; headRow(mh);
      const m0 = rr;
      D.mRE.forEach(x => { const rw = w.getRow(rr); rw.values = [MONTHS[x.m - 1], +x.solar.toFixed(1), +x.wind.toFixed(1), { formula: `B${rr}+C${rr}` },
        c.Solar_Capacity_MWp > 0 ? { formula: `B${rr}/(${c.Solar_Capacity_MWp}*${x.hours})` } : 0, c.Wind_Capacity_MWp > 0 ? { formula: `C${rr}/(${c.Wind_Capacity_MWp}*${x.hours})` } : 0,
        (c.Solar_Capacity_MWp + c.Wind_Capacity_MWp) > 0 ? { formula: `D${rr}/(${c.Solar_Capacity_MWp + c.Wind_Capacity_MWp}*${x.hours})` } : 0];
        [2, 3, 4].forEach(k => rw.getCell(k).numFmt = '#,##0'); [5, 6, 7].forEach(k => rw.getCell(k).numFmt = '0.0%'); rr++; });
      const tr = w.getRow(rr); tr.values = ['Year', { formula: `SUM(B${m0}:B${rr - 1})` }, { formula: `SUM(C${m0}:C${rr - 1})` }, { formula: `SUM(D${m0}:D${rr - 1})` }]; [2, 3, 4].forEach(k => tr.getCell(k).numFmt = '#,##0'); total(tr); rr++;
      bodyRows(w, m0, rr - 2);
      if (rs.perYear) {
        rr++; sectionTitle(w, rr++, 'Annual statistics by weather year', 7);
        const yh = w.getRow(rr++); yh.values = ['Year', 'Solar yield (kWh/kWp)', 'Solar CUF', 'Wind yield (MWh/MW)', 'Wind CUF', 'GHI (kWh/m²)', 'Hub speed (m/s)']; headRow(yh);
        const y0 = rr;
        rs.perYear.forEach(y1 => { const rw = w.getRow(rr++); rw.values = [y1.year, y1.solar, y1.solar / 8760, y1.wind, y1.wind / 8760, y1.ghi, y1.vhub]; rw.getCell(2).numFmt = '#,##0'; rw.getCell(3).numFmt = '0.00%'; rw.getCell(4).numFmt = '#,##0'; rw.getCell(5).numFmt = '0.00%'; rw.getCell(6).numFmt = '#,##0'; rw.getCell(7).numFmt = '0.00'; });
        bodyRows(w, y0, rr - 1);
      }
      const lossBlock = (title, rows, unitDec) => {
        rr++; sectionTitle(w, rr++, title, 4);
        const lh = w.getRow(rr++); lh.values = ['Stage / loss', 'Change', 'Value', 'Unit']; headRow(lh);
        rows.filter(x => x.type === 'stage' || Math.abs(x.rel) >= 0.00005).forEach(x => {
          const rw = w.getRow(rr++);
          if (x.type === 'stage') { rw.values = [x.label, null, x.value, x.unit]; rw.getCell(3).numFmt = unitDec; total(rw); }
          else { rw.values = ['   ' + x.label, x.rel, x.abs, '']; rw.getCell(2).numFmt = '+0.00%;-0.00%'; rw.getCell(3).numFmt = '#,##0.0'; rw.getCell(2).font = { color: { argb: x.rel > 0 ? 'FF2FB383' : 'FFE0605A' } }; }
        });
      };
      if (D.pvLoss) lossBlock('Solar PV energy loss chain (per kWp, annual average)', D.pvLoss.rows, '#,##0.0');
      if (D.windLoss) lossBlock('Wind energy loss chain (per MW, annual average)', D.windLoss, '#,##0');
      img(w, figs.reMonthly, { col: 8, row: 3 }, 620); img(w, figs.diurnal, { col: 8, row: 27 }, 620); img(w, figs.duration, { col: 8, row: 51 }, 620);
    }

    /* ---- Operations ---- */
    if (D.o.operations) {
      const w = wb.addWorksheet('Operations', { views: [{ showGridLines: false }] });
      w.columns = [{ width: 30 }].concat(new Array(11).fill({ width: 14 }));
      titleBlock(w, 'Plant operation', sub, 12);
      let rr = 4; sectionTitle(w, rr++, 'Annual energy balance', 4);
      const bh = w.getRow(rr++); bh.values = ['Flow', 'Category', 'MWh/yr', 'Share of RE']; headRow(bh);
      const b0 = rr;
      D.balance.forEach(b => { const rw = w.getRow(rr); rw.values = [b[0], b[2], +b[1].toFixed(1), b[2] === 'Use' || /^(Solar|Wind)/.test(b[0]) ? { formula: `C${rr}/C${b0 + 2}` } : null]; rw.getCell(3).numFmt = '#,##0'; rw.getCell(4).numFmt = '0.0%'; rr++; });
      bodyRows(w, b0, rr - 1);
      rr++; sectionTitle(w, rr++, 'Monthly operating summary', 12);
      const mh = w.getRow(rr++); mh.values = ['Month', 'Solar (MWh)', 'Wind (MWh)', 'RE (MWh)', 'Electrolyser (MWh)', 'Loop aux (MWh)', 'Curtailed (MWh)', 'Import (MWh)', 'H2 PEM (t)', 'H2 ALK (t)', 'NH3 (t)', 'Shutdowns']; headRow(mh);
      const m0 = rr;
      r.monthly.forEach(x => { const rw = w.getRow(rr++); rw.values = [MONTHS[x.m - 1], x.solar, x.wind, x.re, x.ely, x.aux, x.curt, x.imp, x.h2pem, x.h2alk, x.nh3, x.shutdowns]; for (let k = 2; k <= 12; k++) rw.getCell(k).numFmt = k >= 9 && k <= 10 ? '#,##0.0' : '#,##0'; });
      const L = (k) => String.fromCharCode(64 + k);
      const tr = w.getRow(rr); tr.getCell(1).value = 'Year'; for (let k = 2; k <= 11; k++) { tr.getCell(k).value = { formula: `SUM(${L(k)}${m0}:${L(k)}${rr - 1})` }; tr.getCell(k).numFmt = '#,##0'; } tr.getCell(12).value = a.shutdowns; total(tr); rr++;
      bodyRows(w, m0, rr - 2);
      rr++; sectionTitle(w, rr++, 'Product tank & offtake ledger (operating year)', 10);
      const lh = w.getRow(rr++); lh.values = ['Month', 'Opening (t)', 'Production (t)', 'Excess (t)', 'Due (t)', 'Dispatched (t)', 'Shortfall (t)', 'Closing (t)', 'Fulfilment', 'Hours tank full']; headRow(lh);
      const l0 = rr;
      r.tank.ledger.forEach(l => { const rw = w.getRow(rr); rw.values = [MONTHS[l.month - 1], l.open, l.prod, l.excess, l.due, l.lifted, l.short, l.close, l.due > 0 ? { formula: `F${rr}/E${rr}` } : null, l.full]; for (let k = 2; k <= 8; k++) rw.getCell(k).numFmt = '#,##0'; rw.getCell(9).numFmt = '0.0%'; rr++; });
      const lt = w.getRow(rr); lt.values = ['Year', null, { formula: `SUM(C${l0}:C${rr - 1})` }, { formula: `SUM(D${l0}:D${rr - 1})` }, { formula: `SUM(E${l0}:E${rr - 1})` }, { formula: `SUM(F${l0}:F${rr - 1})` }, { formula: `SUM(G${l0}:G${rr - 1})` }, null, { formula: `IF(E${rr}>0,F${rr}/E${rr},"")` }];
      for (let k = 3; k <= 7; k++) lt.getCell(k).numFmt = '#,##0'; lt.getCell(9).numFmt = '0.0%'; total(lt); rr++;
      bodyRows(w, l0, rr - 2);
      rr += 2;
      [[figs.sankey, 'Annual energy flow'], [figs.nh3Monthly, 'Monthly ammonia production vs obligation'], [figs.nh3Daily, 'Daily ammonia production'], [figs.weekHigh, 'Highest-RE week dispatch'], [figs.weekLow, 'Lowest-RE week dispatch'], [figs.storage, 'Daily mean storage levels']]
        .forEach(([fg, cap]) => { w.getCell(rr, 1).value = cap; w.getCell(rr, 1).font = { italic: true, color: { argb: MUTED } }; rr++; img(w, fg, { col: 0, row: rr - 1 }, 760); rr += Math.ceil(760 * fg.h / fg.w / 20) + 1; });
    }

    /* ---- Economics ---- */
    if (D.o.economics) {
      const w = wb.addWorksheet('Economics', { views: [{ showGridLines: false }] });
      w.columns = [{ width: 38 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 16 }, { width: 16 }];
      titleBlock(w, 'Screening economics', sub, 7);
      let rr = 4; sectionTitle(w, rr++, 'Capital cost (INR crore)', 3);
      const ch = w.getRow(rr++); ch.values = ['Item', 'INR crore', 'Share']; headRow(ch);
      const c0 = rr, items = Object.entries(f.sec);
      items.forEach(([k, v]) => { const rw = w.getRow(rr++); rw.values = [k, +v.toFixed(3)]; rw.getCell(2).numFmt = '#,##0.0'; });
      const epcR = rr; const er = w.getRow(rr++); er.values = ['EPC subtotal', { formula: `SUM(B${c0}:B${epcR - 1})` }]; er.getCell(2).numFmt = '#,##0.0'; total(er);
      [['Contingency, owner’s & pre-operative', f.soft], ['Land', f.land], ['Interest during construction', f.idc]].forEach(([k, v]) => { const rw = w.getRow(rr++); rw.values = [k, +v.toFixed(3)]; rw.getCell(2).numFmt = '#,##0.0'; });
      const totR = rr; const tr = w.getRow(rr++); tr.values = ['Total project cost', { formula: `B${epcR}+SUM(B${epcR + 1}:B${totR - 1})` }]; tr.getCell(2).numFmt = '#,##0.0'; total(tr);
      for (let i = c0; i <= totR; i++) { const cl = w.getCell(i, 3); cl.value = { formula: `B${i}/B$${totR}` }; cl.numFmt = '0.0%'; }
      bodyRows(w, c0, totR - 1);
      rr++; sectionTitle(w, rr++, 'Operating cost, year 1 (INR crore/yr)', 3);
      const oh = w.getRow(rr++); oh.values = ['Item', 'INR crore/yr']; headRow(oh);
      const o0 = rr; Object.entries(f.fixedOpex).forEach(([k, v]) => { const rw = w.getRow(rr++); rw.values = [k, +v.toFixed(4)]; rw.getCell(2).numFmt = '#,##0.00'; });
      const ot = w.getRow(rr); ot.values = ['Total', { formula: `SUM(B${o0}:B${rr - 1})` }]; ot.getCell(2).numFmt = '#,##0.00'; total(ot); rr++;
      rr++; sectionTitle(w, rr++, 'Financial indicators', 3);
      const ih = w.getRow(rr++); ih.values = ['Indicator', 'Value', 'Unit']; headRow(ih);
      [['LCOA', f.lcoa, 'INR/kg', '0.00'], ['LCOH', f.lcoh, 'INR/kg', '0.00'], ['Breakeven green NH3 price', f.breakeven, 'INR/kg', '0.00'], ['Contract NH3 price', S.fin.Ammonia_Price_INR_per_kg, 'INR/kg', '0.00'],
        ['Project IRR (post-tax)', fin(f.pirr) ? f.pirr : null, '', '0.00%'], ['Equity IRR', fin(f.eirr) ? f.eirr : null, '', '0.00%'], ['WACC', f.wacc, '', '0.00%'], ['Capital recovery factor', f.crf, '', '0.0000'],
        ['Annualised CAPEX', f.annCap, 'INR Cr/yr', '#,##0.0'], ['Levelised OPEX', f.annOpex, 'INR Cr/yr', '#,##0.0'], ['Minimum DSCR', fin(f.minDSCR) ? f.minDSCR : null, 'x', '0.00'], ['Specific CAPEX', f.capex * 1e7 / Math.max(1, a.nh3 * 1000), 'INR per kg/yr', '#,##0']]
        .forEach(k => { const rw = w.getRow(rr++); rw.values = [k[0], k[1], k[2]]; rw.getCell(2).numFmt = k[3]; });
      rr++; sectionTitle(w, rr++, 'Levelised cost of ammonia build-up (INR/kg)', 2);
      const lh = w.getRow(rr++); lh.values = ['Component', 'INR/kg']; headRow(lh);
      figs.lcoaComps.forEach((x, i) => { const rw = w.getRow(rr++); rw.values = [x[0], +x[1].toFixed(3)]; rw.getCell(2).numFmt = '0.00'; if (i === figs.lcoaComps.length - 1) total(rw); });
      rr++; sectionTitle(w, rr++, 'Annual cash flow (INR crore, nominal)', 7);
      const fh = w.getRow(rr++); fh.values = ['Year', 'Revenue', 'OPEX', 'EBITDA', 'Tax', 'Free cash flow', 'Cumulative']; headRow(fh);
      const f0r = rr, nC = f.cf.length - f.rows.length;
      for (let i = 0; i < nC; i++) { const rw = w.getRow(rr); rw.values = [figs.cashYears[i], null, null, null, null, +f.cf[i].toFixed(3), { formula: i === 0 ? `F${rr}` : `G${rr - 1}+F${rr}` }]; rr++; }
      f.rows.forEach((x, i) => { const rw = w.getRow(rr); rw.values = ['Y' + x.yr, +x.rev.toFixed(3), +x.opex.toFixed(3), { formula: `B${rr}-C${rr}` }, +x.tax.toFixed(3), +f.cf[nC + i].toFixed(3), { formula: rr === f0r ? `F${rr}` : `G${rr - 1}+F${rr}` }]; rr++; });
      for (let i = f0r; i < rr; i++) for (let k = 2; k <= 7; k++) w.getCell(i, k).numFmt = '#,##0.0;[Red]-#,##0.0';
      bodyRows(w, f0r, rr - 1);
      const irrR = w.getRow(rr + 1); irrR.values = ['Project IRR (Excel check)', null, null, null, null, { formula: `IRR(F${f0r}:F${rr - 1})` }]; irrR.getCell(6).numFmt = '0.00%'; total(irrR);
      img(w, figs.capex, { col: 8, row: 3 }, 620); img(w, figs.lcoa, { col: 8, row: 29 }, 620); img(w, figs.cash, { col: 8, row: 55 }, 620);
    }

    /* ---- Hourly ---- */
    if (D.o.hourly) {
      const w = wb.addWorksheet('Hourly', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
      const cols = [['Month', CAL.month], ['Day', CAL.day], ['Hour', CAL.hour], ['Solar eff. (%)', D.prof.solar], ['Wind eff. (%)', D.prof.wind], ['Solar MW', H.solarMW], ['Wind MW', H.windMW], ['RE MW', H.RE], ['NH3 loop %', H.DC], ['NH3 aux MW', H.DP], ['NH3 t/h', H.DProd],
        ['Electrolyser MW', H.EP], ['PEM MW', H.PEM_P], ['ALK MW', H.ALK_P], ['H2 t/h', H.H2E], ['H2 storage t', H.H2S_e], ['H2 storage %', H.H2pct], ['BESS loop MWh', H.BD_e], ['BESS ely MWh', H.BE_e],
        ['BESS loop flow MW', H.BD_bus], ['BESS ely flow MW', H.BE_bus], ['Bank MWh', H.GB_e], ['Bank flow MW', H.GB_p], ['Curtailed(+)/Import(-) MW', H.CURT], ['Look-ahead setpoint %', H.LA_sp], ['NH3 tank t', H.tankLevel]];
      w.addRow(['Date-time (local)'].concat(cols.map(x => x[0]))); headRow(w.getRow(1)); w.getRow(1).height = 30;
      const rows = []; for (let h = 0; h < 8760; h++) rows.push([U.excelDate(h)].concat(cols.map((x, k) => k < 3 ? x[1][h] : +(+x[1][h]).toFixed(4))));
      w.addRows(rows);
      w.getColumn(1).numFmt = 'dd-mmm hh:mm'; w.getColumn(1).width = 16; for (let k = 2; k <= cols.length + 1; k++) w.getColumn(k).width = k <= 4 ? 7 : 13;
      w.autoFilter = { from: 'A1', to: { row: 1, column: cols.length + 1 } };
    }
    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: U.XLSX_MIME });
  }

  /* =================================================================
   *  DIALOG & ENTRY POINTS
   * ================================================================= */
  const fileBase = (D) => ('HyProfile_Report_' + (D.meta.title || 'project')).replace(/[^A-Za-z0-9]+/g, '_').replace(/_+$/, '').slice(0, 60) + '_' + D.meta.date.toISOString().slice(0, 10);
  async function generate(o) {
    if (!R.plant || !R.fin) { toast('Run the plant simulation first — load a profile or use the sample profile.'); return; }
    saveOpts(o);
    busy(true, 'Preparing report…', 0.1, 'Collecting results');
    try {
      await new Promise(res => setTimeout(res, 30));
      const D = gather(o);
      busy(true, 'Rendering figures…', 0.3, 'ECharts off-screen render');
      await new Promise(res => setTimeout(res, 30));
      const figs = figures(D);
      const base = fileBase(D);
      if (o.format === 'pdf' || o.format === 'both') {
        busy(true, 'Writing PDF…', 0.55, 'Layout, tables and figures');
        await new Promise(res => setTimeout(res, 30));
        U.download(base + '.pdf', await buildPdf(D, figs));
      }
      if (o.format === 'xlsx' || o.format === 'both') {
        busy(true, 'Writing Excel workbook…', 0.8, o.hourly ? 'Including 8,760 hourly rows' : 'Summary sheets');
        await new Promise(res => setTimeout(res, 30));
        U.download(base + '.xlsx', await buildXlsx(D, figs));
      }
      toast(o.format === 'both' ? 'PDF and Excel reports downloaded' : (o.format === 'pdf' ? 'PDF report downloaded' : 'Excel report downloaded'));
    } catch (e) {
      console.error(e); toast('Report generation failed: ' + (e && e.message ? e.message : e));
    } finally { busy(false); }
  }

  function open(fmtPref) {
    const o = loadOpts(); if (fmtPref) o.format = fmtPref;
    if (!o.title) o.title = S.site.project || '';
    let bg = document.getElementById('rptModal'); if (bg) bg.remove();
    bg = document.createElement('div'); bg.id = 'rptModal'; bg.className = 'modal-bg';
    const ready = !!(R.plant && R.fin);
    const tog = (k, label, sub) => `<label class="rpt-opt"><input type="checkbox" data-k="${k}" ${o[k] ? 'checked' : ''}><span class="sw"></span><span><b>${label}</b><small>${sub}</small></span></label>`;
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="rptTitle">
      <div class="modal-hd"><span class="ic">${U.IC.file}</span><div><h3 id="rptTitle">Generate run report</h3><p>Results, figures and inputs of the current simulation</p></div><button class="btn iconbtn sm" data-x aria-label="Close">✕</button></div>
      <div class="modal-bd">
        ${ready ? '' : '<div class="note warn mb">No simulation results yet. Load a profile or run with the sample profile first.</div>'}
        <label class="fld full"><span>Report title</span><div class="inp"><input type="text" data-k="title" value="${esc(o.title)}"></div></label>
        <div class="grid g2" style="gap:12px">
          <label class="fld"><span>Prepared by</span><div class="inp"><input type="text" data-k="author" value="${esc(o.author)}" placeholder="optional"></div></label>
          <label class="fld"><span>Prepared for</span><div class="inp"><input type="text" data-k="client" value="${esc(o.client)}" placeholder="optional"></div></label>
        </div>
        <div class="rpt-fmt" role="radiogroup">
          ${[['pdf', 'PDF report', 'Paginated A4 document with figures and tables'], ['xlsx', 'Excel workbook', 'Formatted sheets with live totals and figures'], ['both', 'PDF + Excel', 'Both files in one step']].map(([v, l, s2]) => `<button type="button" class="rpt-card ${o.format === v ? 'on' : ''}" data-fmt="${v}" role="radio" aria-checked="${o.format === v}"><b>${l}</b><small>${s2}</small></button>`).join('')}
        </div>
        <div class="rpt-opts">
          ${tog('resource', 'Resource & loss analysis', 'Profile statistics, PV and wind loss chains')}
          ${tog('operations', 'Plant operation', 'Energy balance, dispatch weeks, ledger')}
          ${tog('economics', 'Economics', 'CAPEX, OPEX, LCOA, cash flow')}
          ${tog('inputs', 'Input appendix', 'Every parameter with units')}
          ${tog('hourly', 'Hourly sheet (Excel)', '8,760 rows × 27 columns')}
        </div>
      </div>
      <div class="modal-ft"><span class="small muted">Generated locally in the browser · nothing is uploaded</span><div class="grow"></div><button class="btn" data-x>Cancel</button><button class="btn primary" id="rptGo" ${ready ? '' : 'disabled'}>${U.IC.dl}Generate</button></div>
    </div>`;
    document.body.appendChild(bg);
    requestAnimationFrame(() => bg.classList.add('on'));
    const close = () => { bg.classList.remove('on'); setTimeout(() => bg.remove(), 180); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-x]')) close(); });
    bg.querySelectorAll('[data-fmt]').forEach(b => b.onclick = () => { bg.querySelectorAll('[data-fmt]').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); }); b.classList.add('on'); b.setAttribute('aria-checked', 'true'); });
    bg.querySelector('#rptGo').onclick = () => {
      const out = Object.assign({}, o);
      bg.querySelectorAll('[data-k]').forEach(el => { out[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value.trim(); });
      out.format = (bg.querySelector('[data-fmt].on') || {}).dataset ? bg.querySelector('[data-fmt].on').dataset.fmt : 'pdf';
      close(); generate(out);
    };
    setTimeout(() => { const t = bg.querySelector('[data-k="title"]'); if (t) t.focus(); }, 60);
  }

  window.TRE_REPORT = { open, generate, opts: () => { const o = loadOpts(); if (!o.title) o.title = S.site.project || ''; return o; }, gather, figures, buildPdf, buildXlsx };
})();
