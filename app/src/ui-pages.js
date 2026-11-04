/* =====================================================================
 * TrueRE Hybrid Studio — pages & application controller
 * ===================================================================== */
(function () {
  'use strict';
  const TRE = window.TRE, U = window.UI;
  const { $, $$, IC, S, R, fmt, pct, esc, toast, busy, kpi, card, emptyState, section, chart, baseOpt, theme, MONTHS } = U;
  const CAL = TRE.CAL;
  const sum = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; };
  const mean = (a) => a.length ? sum(a) / a.length : 0;

  const PAGES = [
    { id: 'site', title: 'Site & Resource', icon: 'site', crumb: 'Step 1 · Location and meteorological resource' },
    { id: 'pv', title: 'Solar PV Design', icon: 'sun', crumb: 'Step 2 · PVsyst-type energy yield model' },
    { id: 'wind', title: 'Wind Farm Design', icon: 'wind', crumb: 'Step 3 · Power-curve energy yield model' },
    { id: 'profile', title: 'RE Profile & Export', icon: 'wave', crumb: 'Step 4 · Hourly 8760 generation profile' },
    { id: 'plant', title: 'Plant Simulation', icon: 'plant', crumb: 'Step 5 · Hourly green hydrogen / ammonia dispatch' },
    { id: 'econ', title: 'Economics', icon: 'coin', crumb: 'Step 6 · Screening project economics' },
    { id: 'explore', title: 'Sizing Explorer', icon: 'grid', crumb: 'Optimisation · Sizing maps and sensitivity' },
    { id: 'docs', title: 'Methodology', icon: 'book', crumb: 'Reference · Models, data sources and file formats' }
  ];

  /* =================================================================
   *  COMPUTATION PIPELINE
   * ================================================================= */
  function sampleArrays() {
    const s = window.TRE_SAMPLE; if (!s) return null;
    if (!s._a) s._a = { solar: s.solar.split(',').map(x => x / 100), wind: s.wind.split(',').map(x => x / 100) };
    return s._a;
  }
  function computeRE() {
    if (!R.weather) { R.re = null; return; }
    const t0 = performance.now();
    R.re = TRE.processResource(R.weather, S.pv, S.wind, {
      tz: S.site.tz, basis: S.res.basis, year: S.res.year,
      weights: { ghi: S.res.wGhi / 100, dni: S.res.wDni / 100, tmean: S.res.wT / 200, tmax: S.res.wT / 400, tmin: S.res.wT / 400, wind: S.res.wWind / 100 }
    });
    R.re.ms = performance.now() - t0;
    // cache model profile for offline re-use
    S.cache = { solar: Array.from(R.re.prof.solar, x => +(x * 100).toFixed(4)), wind: Array.from(R.re.prof.wind, x => +(x * 100).toFixed(4)),
      annual: R.re.annual, dataset: R.weather.source, years: R.weather.years, basis: S.res.basis, monthYear: R.re.monthYear, at: new Date().toISOString() };
    U.persist();
  }
  function plevelFactor(kind) {
    if (S.prof.plevel === 'P50') return 1;
    const unc = kind === 'solar' ? S.prof.uncSolar : S.prof.uncWind;
    const ann = R.re ? R.re.annual.map(a => a[kind]) : (S.cache && S.cache.annual ? S.cache.annual.map(a => a[kind]) : []);
    const src = kind === 'solar' ? S.prof.srcSolar : S.prof.srcWind;
    const values = src === 'model' && ann.length > 1 ? ann : [1, 1];
    const p50 = mean(values) || 1;
    const ex = TRE.exceedance(values, p50, unc);
    return ex[S.prof.plevel + '_' + S.prof.pbasis] / p50;
  }
  function buildProfile() {
    const pick = (src, kind) => {
      if (src === 'model') { if (R.re) return Array.from(R.re.prof[kind], x => x * 100); if (S.cache) return S.cache[kind].slice(); return null; }
      if (src === 'upload') return S.upload ? S.upload[kind].slice() : null;
      if (src === 'sample') { const a = sampleArrays(); return a ? a[kind].slice() : null; }
      return new Array(8760).fill(0);
    };
    let solar = pick(S.prof.srcSolar, 'solar'), wind = pick(S.prof.srcWind, 'wind');
    if (!solar && !wind) { R.profile = null; return; }
    solar = solar || new Array(8760).fill(0); wind = wind || new Array(8760).fill(0);
    const fs = plevelFactor('solar'), fw = plevelFactor('wind');
    if (fs !== 1) for (let i = 0; i < 8760; i++) solar[i] *= fs;
    if (fw !== 1) for (let i = 0; i < 8760; i++) wind[i] *= fw;
    R.profile = { solar, wind, fs, fw };
  }
  function computePlant() {
    if (!R.profile) { R.plant = null; R.fin = null; return; }
    const t0 = performance.now();
    R.plant = TRE.runPlant(S.plant, R.profile.solar, R.profile.wind);
    R.plant.ms = performance.now() - t0;
    R.fin = TRE.runFinance(S.fin, R.plant);
  }
  function computeFin() { if (R.plant) R.fin = TRE.runFinance(S.fin, R.plant); }
  function recomputeAll() { computeRE(); buildProfile(); computePlant(); }

  let deb = 0;
  function schedule(level) {
    clearTimeout(deb);
    deb = setTimeout(() => {
      if (level <= 0) computeRE();
      if (level <= 1) buildProfile();
      if (level <= 2) computePlant();
      if (level === 3) computeFin();
      refresh();
    }, level === 0 ? 220 : 120);
  }

  /* =================================================================
   *  NAVIGATION / CHROME
   * ================================================================= */
  function buildNav() {
    $('#nav').innerHTML = PAGES.map((p, i) => `<button data-page="${p.id}">${IC[p.icon]}<span>${p.title}</span>${i < 6 ? `<span class="step" data-step="${p.id}">${i + 1}</span>` : ''}</button>`).join('');
    $('#nav').addEventListener('click', (e) => { const b = e.target.closest('[data-page]'); if (b) go(b.dataset.page); });
  }
  const rendered = {};
  function go(id) {
    S.page = id; U.persist();
    const p = PAGES.find(x => x.id === id) || PAGES[0];
    $$('.nav button').forEach(b => b.classList.toggle('active', b.dataset.page === p.id));
    $$('.page').forEach(s => s.classList.toggle('active', s.id === 'page-' + p.id));
    $('#pageTitle').textContent = p.title; $('#crumb').textContent = p.crumb;
    $('#side').classList.remove('open');
    if (!rendered[p.id]) { RENDER[p.id](); rendered[p.id] = true; }
    UPDATE[p.id] && UPDATE[p.id]();
    window.scrollTo({ top: 0 });
  }
  function refresh() {
    chrome();
    const id = S.page; if (UPDATE[id]) UPDATE[id]();
  }
  function chrome() {
    const cs = $('#chipSite'); cs.className = 'chip ok'; cs.lastElementChild.textContent = `${fmt(S.site.lat, 3)}°, ${fmt(S.site.lon, 3)}° · UTC${S.site.tz >= 0 ? '+' : ''}${S.site.tz}`;
    const cd = $('#chipData');
    if (R.weather) { cd.className = 'chip ok'; cd.lastElementChild.textContent = `${R.weather.source.split(' (')[0].split(',')[0]} ${R.weather.years[0]}–${R.weather.years[1]}`; }
    else if (S.prof.srcSolar === 'upload' || S.prof.srcWind === 'upload') { cd.className = S.upload ? 'chip ok' : 'chip warn'; cd.lastElementChild.textContent = S.upload ? 'Uploaded profile' : 'Upload pending'; }
    else if (S.prof.srcSolar === 'sample') { cd.className = 'chip warn'; cd.lastElementChild.textContent = 'Sample profile (Damoh)'; }
    else if (S.cache) { cd.className = 'chip warn'; cd.lastElementChild.textContent = 'Cached model profile'; }
    else { cd.className = 'chip'; cd.lastElementChild.textContent = 'No resource data'; }
    const done = { site: !!(R.weather || S.cache || S.upload), pv: !!R.re || S.prof.srcSolar !== 'model', wind: !!R.re || S.prof.srcWind !== 'model', profile: !!R.profile, plant: !!R.plant, econ: !!R.fin };
    $$('.step').forEach(e => e.classList.toggle('done', !!done[e.dataset.step]));
  }

  /* =================================================================
   *  PAGE 1 — SITE & RESOURCE
   * ================================================================= */
  let map, marker, tileStreet, tileSat;
  function renderSite() {
    const el = $('#page-site');
    const tiles = [
      ['openmeteo', IC.sat, '#E6F2E2', '#2E7D32', 'ERA5 reanalysis', 'Open-Meteo archive · ECMWF ERA5 · 1940–present · 10 m & 100 m wind'],
      ['nasa', IC.globe, '#E5EEFB', '#3A5BA0', 'NASA POWER', 'CERES SYN1deg irradiance + MERRA-2 · 2001–present · 10 m & 50 m wind'],
      ['upload', IC.file, '#FFF6D6', '#8A6500', 'Excel / PVsyst file', 'Hourly efficiency template, PVsyst E_Grid or renewables.ninja export'],
      ['sample', IC.layers, '#F1ECFF', '#6D4AFF', 'Sample project', 'Damoh (MP) — PVsyst 500 MWp solar & renewables.ninja wind']
    ];
    el.innerHTML = `
    <div class="hero">
      ${card('Project location', 'Click the map, drag the marker or search a place', `<div id="map"></div>`, `<div class="seg" id="mapLayer"><button data-l="street" class="on">Map</button><button data-l="sat">Satellite</button></div>`)}
      ${card('Site definition', '', `
        <div class="search mb"><div class="inp">${IC.search.replace('<svg', '<svg style="width:16px;height:16px;margin-left:10px;color:var(--faint)"')}<input id="geoQ" placeholder="Search city, district or landmark…" autocomplete="off"></div><div class="results" id="geoRes"></div></div>
        <div class="sec" style="border:0;margin:0"><div class="body" style="padding:0">
          ${U.field('site', ['project', 'Project name', '', { type: 'text', full: true }])}
          ${U.field('site', ['place', 'Location name', '', { type: 'text', full: true }])}
          ${U.field('site', ['lat', 'Latitude', '°', { step: 0.0001, min: -60, max: 70, help: 'Decimal degrees, north positive' }])}
          ${U.field('site', ['lon', 'Longitude', '°', { step: 0.0001, min: -180, max: 180, help: 'Decimal degrees, east positive' }])}
          ${U.field('site', ['elev', 'Elevation', 'm', { step: 1, help: 'Auto-filled from the ERA5 / NASA digital elevation model; used for air density.' }])}
          ${U.field('site', ['tz', 'UTC offset (standard time)', 'h', { step: 0.25, min: -12, max: 14, help: 'All profiles are written hour-beginning in local standard time (no daylight saving). India = +5.5.' }])}
        </div></div>
        <div class="note mt"><b>Coordinates drive everything downstream:</b> solar geometry, weather download, air density and the local-time alignment of the 8760 profile used by the plant simulation.</div>
      `)}
    </div>
    <div class="card mt"><div class="hd"><h3>Meteorological resource</h3><span class="sub">Choose a professional data source, the period and the year-construction method</span></div><div class="bd">
      <div class="tiles" style="grid-template-columns:repeat(4,1fr)">${tiles.map(([id, ic, bg, fg, b, s]) => `<button class="tile" data-src="${id}"><span class="ti" style="background:${bg};color:${fg}">${ic}</span><span><b>${b}</b><small>${s}</small></span></button>`).join('')}</div>
      <div id="srcPanel" class="mt"></div>
    </div></div>
    <div id="siteRes" class="mt"></div>`;
    // map
    if (window.L) {
      map = L.map('map', { zoomControl: true, attributionControl: true }).setView([S.site.lat, S.site.lon], 6);
      tileStreet = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
      tileSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' });
      marker = L.marker([S.site.lat, S.site.lon], { draggable: true, icon: L.divIcon({ className: '', html: '<div class="pin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(map);
      marker.on('dragend', () => { const p = marker.getLatLng(); setSite(p.lat, p.lng); });
      map.on('click', (e) => setSite(e.latlng.lat, e.latlng.lng));
      setTimeout(() => map.invalidateSize(), 200);
    } else $('#map').innerHTML = emptyState('Map unavailable', 'Leaflet could not load. Enter coordinates manually.');
    $('#mapLayer').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || !map) return;
      $$('#mapLayer button').forEach(x => x.classList.toggle('on', x === b));
      if (b.dataset.l === 'sat') { map.removeLayer(tileStreet); tileSat.addTo(map); } else { map.removeLayer(tileSat); tileStreet.addTo(map); }
    });
    // geocoder
    let gt = 0;
    $('#geoQ').addEventListener('input', (e) => {
      clearTimeout(gt); const q = e.target.value.trim(); const box = $('#geoRes');
      if (q.length < 3) { box.style.display = 'none'; return; }
      gt = setTimeout(async () => {
        try {
          const r = await TRE.geocode(q);
          box.innerHTML = r.length ? r.map((x, i) => `<button data-i="${i}">${esc(x.name)}<small>${x.lat.toFixed(4)}, ${x.lon.toFixed(4)} · ${x.elev != null ? Math.round(x.elev) + ' m' : ''} ${x.tz || ''}</small></button>`).join('') : '<button disabled>No match</button>';
          box.style.display = 'block';
          box.onclick = (ev) => { const b = ev.target.closest('[data-i]'); if (!b) return; const x = r[+b.dataset.i]; S.site.place = x.name; if (x.elev != null) S.site.elev = Math.round(x.elev); setSite(x.lat, x.lon, true); box.style.display = 'none'; map && map.setView([x.lat, x.lon], 10); };
        } catch (err) { box.innerHTML = `<button disabled>Search unavailable (${esc(err.message)})</button>`; box.style.display = 'block'; }
      }, 350);
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search')) { const b = $('#geoRes'); if (b) b.style.display = 'none'; } });
    $$('#page-site .tile').forEach(t => t.addEventListener('click', () => { S.res.source = t.dataset.src; U.persist(); srcPanel(); }));
    srcPanel();
  }
  function setSite(lat, lon, keepPlace) {
    S.site.lat = +lat.toFixed(5); S.site.lon = +(((lon + 540) % 360) - 180).toFixed(5);
    S.site.tz = TRE.guessTZ(S.site.lat, S.site.lon);
    if (!keepPlace) S.site.place = `Site ${S.site.lat.toFixed(3)}°, ${S.site.lon.toFixed(3)}°`;
    const def = TRE.defaultPV(S.site.lat); if (S.pv.mounting === 'fixed') { S.pv.tilt = def.tilt; S.pv.azimuth = def.azimuth; }
    U.persist();
    $$('#page-site [data-p^="site."]').forEach(i => { i.value = U.getPath(i.dataset.p); });
    marker && marker.setLatLng([S.site.lat, S.site.lon]);
    if (R.weather) { R.weather = null; R.re = null; toast('Site moved — fetch the resource data again for the new location.'); }
    rendered.pv = false; chrome(); updateSite();
  }
  function srcPanel() {
    $$('#page-site .tile').forEach(t => t.classList.toggle('on', t.dataset.src === S.res.source));
    const P = $('#srcPanel'); const src = S.res.source;
    if (src === 'openmeteo' || src === 'nasa') {
      const maxY = new Date().getUTCFullYear() - 1, minY = src === 'nasa' ? 2001 : 1950;
      P.innerHTML = `<div class="grid g4" style="align-items:end">
        ${U.field('res', ['y0', 'First year', '', { step: 1, min: minY, max: maxY }])}
        ${U.field('res', ['y1', 'Last year', '', { step: 1, min: minY, max: maxY }])}
        ${U.field('res', ['basis', 'Profile construction', '', { type: 'sel', options: [['tmy', 'Typical year (Sandia TMY, FS statistics)'], ['single', 'Single calendar year']] }])}
        ${S.res.basis === 'single' ? U.field('res', ['year', 'Calendar year', '', { step: 1 }]) : `<div class="row-flex"><span class="badge">Recommended</span><span class="small muted">TMY keeps solar–wind co-variability: each month is one real year.</span></div>`}
      </div>
      <details class="sec mt"><summary><span class="ic">${IC.gear}</span>TMY weighting (Finkelstein–Schafer)</summary><div class="body" style="grid-template-columns:repeat(4,1fr)">
        ${U.field('res', ['wGhi', 'Daily GHI', '%', { step: 5, min: 0, max: 100 }])}${U.field('res', ['wDni', 'Daily DNI', '%', { step: 5, min: 0, max: 100 }])}
        ${U.field('res', ['wT', 'Temperature', '%', { step: 5, min: 0, max: 100 }])}${U.field('res', ['wWind', 'Hub wind speed', '%', { step: 5, min: 0, max: 100 }])}
      </div></details>
      <div class="row-flex mt"><button class="btn primary" id="btnFetch">${IC.dl}Fetch &amp; process ${src === 'nasa' ? 'NASA POWER' : 'ERA5'} data</button>
        <span class="small muted">${S.res.y1 - S.res.y0 + 1} years of hourly data · ${src === 'nasa' ? 'one request per year' : 'two-year requests'} · processed locally in your browser</span></div>`;
      $('#btnFetch').onclick = fetchResource;
    } else if (src === 'upload') {
      P.innerHTML = uploadPanel();
      bindUpload(P);
    } else {
      P.innerHTML = `<div class="row-flex"><button class="btn gold" id="btnSample">${IC.play}Use sample profile</button><span class="small muted">Loads the Damoh hourly profile (PVsyst 8.1 solar 1,670 kWh/kWp; renewables.ninja wind) shipped with the original model, so the plant simulation can be explored immediately.</span></div>`;
      $('#btnSample').onclick = () => { S.prof.srcSolar = 'sample'; S.prof.srcWind = 'sample'; U.persist(); buildProfile(); computePlant(); refresh(); toast('Sample profile loaded'); };
    }
  }
  function uploadPanel() {
    return `<div class="grid g2"><div><div class="drop" data-drop>${IC.ul}<b>Drop the efficiency workbook here, or click to browse</b><div class="small">.xlsx (sheet "Efficiency") · .csv · PVsyst hourly CSV (E_Grid)</div><input type="file" accept=".xlsx,.csv,.txt" hidden></div></div>
      <div><div class="note"><b>Accepted formats</b><br>1. TrueRE template / original <code>RE_Production_Efficiency_data.xlsx</code> — columns "Solar Efficiency" and "Wind Efficiency" in % kW/kWp.<br>2. PVsyst hourly output with an <code>E_Grid</code> column in kW — converted with the reference capacity below.<br>3. Any CSV with the same headers. Leap years are trimmed to 8760 h.</div>
      <div class="mt">${U.field('prof', ['pvsystKwp', 'Reference DC capacity for PVsyst E_Grid import', 'kWp', { step: 1, min: 1 }])}</div><button class="btn gold mt" data-tpl style="width:100%">${IC.dl}Download blank Excel template</button>
      <div class="log mt" data-uplog>${S.upload ? `Loaded: ${esc(S.upload.info)}` : ''}</div></div></div>`;
  }
  function bindUpload(root) {
    const dz = root.querySelector('[data-drop]'), inp = dz.querySelector('input');
    dz.onclick = () => inp.click();
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
    dz.ondragleave = () => dz.classList.remove('over');
    dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0], root); };
    inp.onchange = () => { if (inp.files[0]) handleUpload(inp.files[0], root); inp.value = ''; };
    const tpl = root.querySelector('[data-tpl]'); if (tpl) tpl.onclick = downloadTemplate;
  }
  async function handleUpload(file, root) {
    const log = root.querySelector('[data-uplog]');
    try {
      log.className = 'log mt'; log.textContent = 'Reading ' + file.name + '…';
      const r = await U.parseProfileFile(file, S.prof.pvsystKwp || 1000);
      S.upload = { solar: r.solar.map(x => +x.toFixed(4)), wind: r.wind.map(x => +x.toFixed(4)), info: r.info, name: file.name, at: new Date().toISOString() };
      S.prof.srcSolar = 'upload'; if (sum(r.wind) > 0) S.prof.srcWind = 'upload'; else if (S.prof.srcWind === 'upload') S.prof.srcWind = 'none';
      U.persist(); buildProfile(); computePlant();
      log.innerHTML = `<span class="badge">Loaded</span> ${esc(r.info)} · solar ${fmt(sum(r.solar) / 100, 0)} kWh/kWp · wind ${fmt(sum(r.wind) / 100, 0)} kWh/kW${r.notes.length ? '<br>' + r.notes.map(esc).join('<br>') : ''}`;
      toast('Profile uploaded and applied to the plant simulation'); refresh();
    } catch (err) { log.className = 'log mt err'; log.textContent = 'Could not read the file: ' + err.message; }
  }
  async function downloadTemplate() {
    const blob = await U.exportEfficiencyWorkbook(new Array(8760).fill(0), new Array(8760).fill(0), {}, true);
    U.download('TrueRE_RE_Efficiency_Template.xlsx', blob); toast('Template downloaded');
  }
  let fetchCtl = null;
  async function fetchResource() {
    const { lat, lon } = S.site; let y0 = Math.round(S.res.y0), y1 = Math.round(S.res.y1);
    if (y1 < y0) [y0, y1] = [y1, y0];
    if (y1 - y0 > 19) { toast('Limit the period to 20 years.'); return; }
    fetchCtl = new AbortController();
    busy(true, `Downloading ${S.res.source === 'nasa' ? 'NASA POWER' : 'ERA5'} hourly data…`, 0.02, `${lat.toFixed(4)}, ${lon.toFixed(4)} · ${y0}–${y1}`);
    try {
      const fn = S.res.source === 'nasa' ? TRE.fetchNasaPower : TRE.fetchOpenMeteo;
      const w = await fn(lat, lon, y0, y1, (f, m) => busy(true, null, 0.05 + 0.8 * f, m), fetchCtl.signal);
      w.years = [y0, y1];
      if (w.elev != null && isFinite(w.elev)) S.site.elev = Math.round(w.elev);
      w.elev = S.site.elev;
      R.weather = w;
      if (S.res.basis === 'single' && (S.res.year < y0 || S.res.year > y1)) S.res.year = y1;
      busy(true, 'Running PV and wind yield models…', 0.9, `${w.n.toLocaleString()} hourly records`);
      await new Promise(r => setTimeout(r, 30));
      S.prof.srcSolar = 'model'; S.prof.srcWind = 'model';
      recomputeAll(); busy(false);
      toast(`Resource processed: ${w.n.toLocaleString()} hours in ${fmt(R.re.ms, 0)} ms`);
      $$('#page-site [data-p="site.elev"]').forEach(i => i.value = S.site.elev);
      rendered.pv = rendered.wind = false; refresh();
    } catch (err) {
      busy(false);
      const msg = /Failed to fetch|NetworkError|Load failed/i.test(err.message) ? 'The data service could not be reached (network or firewall). Use the Excel template or try the other source.' : err.message;
      toast('Download failed: ' + msg, 6000);
    }
  }
  function updateSite() {
    const el = $('#siteRes'); if (!el) return;
    if (!R.re) {
      el.innerHTML = S.cache ? `<div class="note">A model profile from a previous session (${esc(S.cache.dataset || '')}, ${S.cache.years ? S.cache.years.join('–') : ''}) is cached and in use. Fetch the data again to edit the PV / wind design or view resource statistics.</div>` :
        `<div class="card">${emptyState('No meteorological data loaded yet', 'Pick a source above and fetch, upload an hourly efficiency file, or start from the sample project.')}</div>`;
      return;
    }
    const pr = R.re.prof, w = R.weather;
    const ghi = sum(pr.ghi) / 1000, dni = sum(pr.dni) / 1000, dhi = sum(pr.dhi) / 1000;
    const vref = mean(TRE.toLocalYear(w.wsHi, w.t0, S.site.tz, w.years[1]));
    const wb = TRE.weibullFit(pr.vhub);
    el.innerHTML = `
      <div class="kpis">
        ${kpi('Global horizontal (GHI)', fmt(ghi, 0), 'kWh/m²·yr', `${fmt(ghi / 365, 2)} kWh/m²·day`, 'var(--solar)')}
        ${kpi('Direct normal (DNI)', fmt(dni, 0), 'kWh/m²·yr', `Diffuse fraction ${pct(dhi / ghi)}`, 'var(--gold)')}
        ${kpi('Mean ambient temperature', fmt(mean(pr.temp), 1), '°C', `Max ${fmt(Math.max(...pr.temp), 1)} °C`, 'var(--curt)')}
        ${kpi(`Wind speed @ ${w.hHi} m`, fmt(vref, 2), 'm/s', `ERA5/MERRA-2 reference height`, 'var(--wind)')}
        ${kpi(`Wind speed @ hub ${S.wind.hub} m`, fmt(mean(pr.vhub), 2), 'm/s', `Weibull k ${fmt(wb.k, 2)} · A ${fmt(wb.A, 2)}`, 'var(--wind)')}
        ${kpi('Shear exponent α', fmt(R.re.wRes.shear.mean, 3), '', 'From 10 m / ' + w.hHi + ' m data', 'var(--nh3)')}
        ${kpi('Mean air density @ hub', fmt(R.re.wRes.meanRho, 3), 'kg/m³', `Site elevation ${fmt(S.site.elev)} m`, 'var(--bess)')}
        ${kpi('Dataset', `${w.years[0]}–${w.years[1]}`, '', esc(w.source.split(',')[0]), 'var(--grid)')}
      </div>
      <div class="grid g2">
        ${card('Monthly irradiation & temperature', S.res.basis === 'tmy' ? 'Typical meteorological year' : 'Year ' + S.res.year, '<div class="chart" id="chIrr"></div>')}
        ${card('Wind rose at hub height', 'Frequency by direction and speed class', '<div class="chart" id="chRose"></div>')}
        ${card('Inter-annual variability', 'Annual GHI and mean hub wind speed per year', '<div class="chart" id="chIav"></div>')}
        ${card('Resource diurnal / seasonal pattern', 'Mean by month and local hour', '<div class="chart" id="chHeatRes"></div>', `<div class="seg" id="heatSel"><button class="on" data-k="ghi">GHI</button><button data-k="vhub">Wind</button><button data-k="temp">Temp.</button></div>`)}
      </div>
      ${S.res.basis === 'tmy' && R.re.tmy ? card('Typical meteorological year — selected months', 'Lowest weighted Finkelstein–Schafer statistic per month', tmyTable()) : ''}`;
    el.lastElementChild && el.lastElementChild.classList.add('mt');
    const t = theme();
    const mGhi = [], mDni = [], mDhi = [], mT = [];
    for (let m = 1; m <= 12; m++) { let a = 0, b = 0, c = 0, tt = 0, n = 0; for (let h = 0; h < 8760; h++) if (CAL.month[h] === m) { a += pr.ghi[h]; b += pr.dni[h]; c += pr.dhi[h]; tt += pr.temp[h]; n++; } mGhi.push(a / 1000); mDni.push(b / 1000); mDhi.push(c / 1000); mT.push(tt / n); }
    chart('chIrr', baseOpt({ xAxis: { type: 'category', data: MONTHS }, yAxis: [{ type: 'value', name: 'kWh/m²' }, { type: 'value', name: '°C', splitLine: { show: false } }], grid: { left: 50, right: 46, top: 52, bottom: 30 },
      series: [{ name: 'GHI', type: 'bar', data: mGhi.map(x => +x.toFixed(1)), itemStyle: { color: t.solar, borderRadius: [4, 4, 0, 0] } }, { name: 'DNI', type: 'bar', data: mDni.map(x => +x.toFixed(1)), itemStyle: { color: t.gold, opacity: .55, borderRadius: [4, 4, 0, 0] } },
        { name: 'DHI', type: 'bar', data: mDhi.map(x => +x.toFixed(1)), itemStyle: { color: t.grid2, opacity: .6, borderRadius: [4, 4, 0, 0] } }, { name: 'T amb', type: 'line', yAxisIndex: 1, smooth: true, data: mT.map(x => +x.toFixed(1)), itemStyle: { color: t.curt }, symbolSize: 6 }] }));
    // wind rose
    const bins = [0, 3, 5, 7, 9, 12], names = ['0–3', '3–5', '5–7', '7–9', '9–12', '≥12 m/s'], dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const rose = names.map(() => new Array(16).fill(0));
    for (let h = 0; h < 8760; h++) { const d = Math.floor(((pr.wdir[h] + 11.25) % 360) / 22.5); let b = 0; while (b < 5 && pr.vhub[h] >= bins[b + 1]) b++; rose[b][d]++; }
    const roseCol = ['#CFE8E9', '#9AD1D4', '#5FB8BD', '#2C9AA1', '#0E7C83', '#0A5A60'];
    chart('chRose', { ...baseOpt(), tooltip: { trigger: 'item', formatter: (p) => `${p.name} · ${p.seriesName}: ${(p.value / 87.6).toFixed(1)} %` }, polar: { radius: ['8%', '72%'], center: ['50%', '54%'] },
      angleAxis: { type: 'category', data: dirs, startAngle: 90 + 11.25, axisLabel: { color: t.text, fontSize: 10 }, axisLine: { lineStyle: { color: t.border } } },
      radiusAxis: { axisLabel: { show: false }, splitLine: { lineStyle: { color: t.grid } }, axisLine: { show: false } },
      series: rose.map((r, i) => ({ type: 'bar', coordinateSystem: 'polar', stack: 'w', name: names[i], data: r, itemStyle: { color: roseCol[i] } })), legend: { top: 0, textStyle: { color: t.text, fontSize: 10 }, itemWidth: 10 } });
    // IAV
    const an = R.re.annual;
    chart('chIav', baseOpt({ xAxis: { type: 'category', data: an.map(a => a.year) }, yAxis: [{ type: 'value', name: 'kWh/m²', min: (v) => Math.floor(v.min * 0.9 / 50) * 50 }, { type: 'value', name: 'm/s', splitLine: { show: false }, min: (v) => Math.floor(v.min * 0.9 * 2) / 2 }], grid: { left: 54, right: 44, top: 52, bottom: 30 },
      series: [{ name: 'GHI', type: 'bar', data: an.map(a => +a.ghi.toFixed(0)), itemStyle: { color: t.solar, borderRadius: [4, 4, 0, 0] }, markLine: { symbol: 'none', data: [{ type: 'average', name: 'mean' }], lineStyle: { color: t.solar, type: 'dashed' }, label: { color: t.text } } },
        { name: 'Hub wind', type: 'line', yAxisIndex: 1, data: an.map(a => +a.vhub.toFixed(2)), itemStyle: { color: t.wind }, symbolSize: 7 }] }));
    const heat = (k) => {
      const M = []; let mx = 0, mn = 1e9;
      for (let m = 0; m < 12; m++) for (let h = 0; h < 24; h++) { let s = 0, n = 0; for (let d = 0; d < 8760; d++) if (CAL.month[d] === m + 1 && CAL.hour[d] === h) { s += pr[k][d]; n++; } const v = s / n; M.push([h, m, +v.toFixed(2)]); mx = Math.max(mx, v); mn = Math.min(mn, v); }
      const cols = k === 'ghi' ? ['#FFF8E1', '#FFD54F', '#F2B705', '#E07B00', '#A63D00'] : k === 'vhub' ? ['#EAF6F6', '#9AD1D4', '#2C9AA1', '#0A5A60', '#062E33'] : ['#2B6CB0', '#9AC5E6', '#FFF3C4', '#F59E5B', '#C2412D'];
      chart('chHeatRes', { ...baseOpt(), tooltip: { formatter: (p) => `${MONTHS[p.value[1]]} ${String(p.value[0]).padStart(2, '0')}:00 — ${p.value[2]} ${k === 'ghi' ? 'W/m²' : k === 'vhub' ? 'm/s' : '°C'}` },
        grid: { left: 40, right: 70, top: 14, bottom: 30 }, xAxis: { type: 'category', data: [...Array(24).keys()], axisLabel: { color: t.text, fontSize: 10 }, axisLine: { lineStyle: { color: t.border } } },
        yAxis: { type: 'category', data: MONTHS, inverse: true, axisLabel: { color: t.text, fontSize: 10 }, axisLine: { lineStyle: { color: t.border } } },
        visualMap: { min: +mn.toFixed(1), max: +mx.toFixed(1), calculable: true, orient: 'vertical', right: 4, top: 'center', itemHeight: 150, textStyle: { color: t.text, fontSize: 10 }, inRange: { color: cols } },
        series: [{ type: 'heatmap', data: M, itemStyle: { borderColor: t.surface, borderWidth: 1 } }] });
    };
    heat('ghi');
    $('#heatSel').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; $$('#heatSel button').forEach(x => x.classList.toggle('on', x === b)); heat(b.dataset.k); };
  }
  function tmyTable() {
    const yrs = R.re.annual.map(a => a.year);
    return `<div class="tblwrap"><table class="t"><thead><tr><th>Month</th>${MONTHS.map(m => `<th class="n">${m}</th>`).join('')}</tr></thead><tbody>
      <tr><td>Selected year</td>${R.re.monthYear.map(i => `<td class="n"><span class="badge gold">${yrs[i]}</span></td>`).join('')}</tr>
      <tr><td>Weighted FS score</td>${R.re.tmy.scores.map((s, m) => `<td class="n">${s[R.re.monthYear[m]].toFixed(3)}</td>`).join('')}</tr>
      <tr><td>Next best</td>${R.re.tmy.scores.map((s, m) => { const o = s.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); return `<td class="n muted">${o[1] ? yrs[o[1][1]] : '—'}</td>`; }).join('')}</tr>
    </tbody></table></div>`;
  }

  /* =================================================================
   *  PAGE 2 — SOLAR PV
   * ================================================================= */
  function pvForm() {
    const p = S.pv, fixed = () => S.pv.mounting === 'fixed', trk = () => S.pv.mounting === 'tracker', bif = () => S.pv.bifacial;
    return section('Mounting & orientation', 'target', 'pv', [
      ['mounting', 'Mounting system', '', { type: 'sel', options: [['fixed', 'Fixed tilt (rows facing equator)'], ['tracker', 'Single-axis tracker (N–S axis)']], full: true }],
      ['tilt', 'Tilt angle', '°', { step: 1, min: 0, max: 60, show: fixed, range: true, help: 'Plane tilt from horizontal. Default ≈ 0.76·|lat| + 3.1° (annual optimum).' }],
      ['azimuth', 'Azimuth', '°', { step: 1, min: 0, max: 359, show: fixed, help: '180 = south-facing (northern hemisphere). Compass convention, clockwise from north.' }],
      ['trackerMax', 'Max rotation ±', '°', { step: 1, min: 30, max: 75, show: trk }],
      ['axisAzimuth', 'Axis azimuth', '°', { step: 1, min: 0, max: 359, show: trk, help: '180 = north–south axis.' }],
      ['backtracking', 'Backtracking (no row shading)', '', { type: 'tog', show: trk, full: true }],
      ['gcr', 'Ground cover ratio', '', { step: 0.01, min: 0.15, max: 0.8, range: true, help: 'Collector width / row pitch. Drives row-to-row shading, sky-view and rear irradiance.' }],
      ['transposition', 'Transposition model', '', { type: 'sel', options: [['perez', 'Perez 1990 (anisotropic)'], ['hay', 'Hay–Davies'], ['iso', 'Isotropic (Liu–Jordan)']] }],
      ['albedo', 'Ground albedo', '', { step: 0.01, min: 0.05, max: 0.9, help: 'Dry soil 0.20, light gravel 0.30, white membrane 0.60+' }],
      ['horizonLoss', 'Far-shading / horizon loss', '%', { step: 0.1, min: 0, max: 20, help: 'Applied to beam and circumsolar irradiance (from a horizon survey or PVsyst far-shading result).' }]
    ], true) +
    section('PV module technology', 'layers', 'pv', [
      ['tech', 'Technology preset', '', { type: 'sel', options: Object.entries(TRE.PV_TECH).map(([k, v]) => [k, v.label]), full: true, help: 'Loads typical datasheet coefficients; every value remains editable.' }],
      ['gamma', 'Power temp. coefficient', '%/°C', { step: 0.01, min: -0.6, max: 0 }],
      ['etaModule', 'Module efficiency', '', { step: 0.001, min: 0.1, max: 0.3, help: 'Used by the PVsyst thermal balance (energy not converted heats the module).' }],
      ['lowLight', 'Rel. efficiency at 200 W/m²', '%', { step: 0.1, min: -8, max: 2, help: 'Low-irradiance behaviour versus STC (log-linear model).' }],
      ['quality', 'Module quality loss', '%', { step: 0.1, min: -2, max: 3, help: 'Negative = gain from positive power tolerance.' }],
      ['lid', 'LID / LeTID', '%', { step: 0.1, min: 0, max: 5 }],
      ['bifacial', 'Bifacial modules', '', { type: 'tog', full: true }],
      ['bifaciality', 'Bifaciality factor', '', { step: 0.01, min: 0, max: 1, show: bif }],
      ['rearShading', 'Rear structure shading', '%', { step: 0.5, min: 0, max: 20, show: bif }],
      ['rearMismatch', 'Rear mismatch', '%', { step: 0.5, min: 0, max: 20, show: bif }],
      ['rearViewFactor', 'Rear ground-view factor', '', { step: 0.01, min: 0.2, max: 1, show: bif, help: 'Fraction of illuminated ground seen by the rear side (2-D view factor calibration; 0.5–0.65 typical, higher for tall trackers).' }]
    ]) +
    section('Optical, soiling & thermal', 'sun', 'pv', [
      ['iamModel', 'IAM model', '', { type: 'sel', options: [['fresnel', 'Fresnel (physical, AR-coated)'], ['ashrae', 'ASHRAE (b₀)']] }],
      ['iamN', 'Refractive index (Fresnel)', '', { step: 0.01, min: 1.1, max: 1.6, show: () => S.pv.iamModel === 'fresnel', help: '1.30 ≈ AR-coated glass, 1.526 = plain glass.' }],
      ['iamB0', 'ASHRAE b₀', '', { step: 0.005, min: 0, max: 0.2, show: () => S.pv.iamModel === 'ashrae' }],
      ['soiling', 'Monthly soiling loss', '%', { type: 'months', help: 'Monthly mean soiling loss; lower in monsoon months due to natural cleaning.' }],
      ['Uc', 'Thermal loss factor Uc', 'W/m²K', { step: 0.5, min: 10, max: 40, help: 'PVsyst: 29 free-standing, 20 semi-integrated, 15 integrated.' }],
      ['Uv', 'Wind loss factor Uv', 'W/m²K·s/m', { step: 0.1, min: 0, max: 5 }],
      ['shadingElec', 'Electrical shading factor', '×', { step: 0.1, min: 1, max: 4, help: '1 = linear (thin-film / half-cut 2P); up to 3–4 = "according to strings" for landscape full-cell layouts.' }]
    ]) +
    section('DC losses & degradation', 'cable', 'pv', [
      ['mismatch', 'Module mismatch', '%', { step: 0.1, min: 0, max: 5 }],
      ['dcOhmic', 'DC ohmic loss at STC', '%', { step: 0.1, min: 0, max: 5, help: 'Resistive loss ∝ I² — scales with instantaneous power.' }],
      ['degrBasis', 'Degradation basis', '', { type: 'sel', options: [['year1', 'Operating year N'], ['lifetime', '25-year average']] }],
      ['opYear', 'Operating year N', '', { step: 1, min: 1, max: 40, show: () => S.pv.degrBasis === 'year1' }],
      ['degrFirst', 'First-year degradation', '%', { step: 0.1, min: 0, max: 5 }],
      ['degrAnnual', 'Annual degradation', '%/yr', { step: 0.05, min: 0, max: 2 }]
    ]) +
    section('Inverter', 'inv', 'pv', [
      ['dcac', 'DC/AC ratio', '', { step: 0.01, min: 0.8, max: 2, range: true, help: 'Installed DC / inverter AC rating. Profile is normalised to DC capacity, as in PVsyst E_Grid / kWp.' }],
      ['invEta', 'European / CEC efficiency', '%', { step: 0.1, min: 90, max: 99.5 }],
      ['invThreshold', 'Power threshold', '% Pdc0', { step: 0.1, min: 0, max: 5 }],
      ['invPmaxCold', 'Pmax at ≤ 25 °C', '× Pnom', { step: 0.01, min: 1, max: 1.2, help: 'Overload capability at low ambient (e.g. 1.10 for central inverters).' }],
      ['invTnom', 'Nominal rating up to', '°C', { step: 1, min: 25, max: 60 }],
      ['invDerateSlope', 'Derating above nominal T', '%/°C', { step: 0.1, min: 0, max: 10 }]
    ]) +
    section('AC, evacuation & availability', 'bolt', 'pv', [
      ['acOhmic', 'AC LV ohmic loss', '%', { step: 0.1, min: 0, max: 5 }],
      ['mvCopper', 'MV transformer copper', '%', { step: 0.1, min: 0, max: 3 }],
      ['mvIron', 'MV transformer iron', '%', { step: 0.01, min: 0, max: 1 }],
      ['nightDisconnect', 'Disconnect MV transformers at night', '', { type: 'tog', full: true }],
      ['hvCopper', 'HV/pooling transformer copper', '%', { step: 0.1, min: 0, max: 3 }],
      ['hvIron', 'HV transformer iron', '%', { step: 0.01, min: 0, max: 1 }],
      ['lineLoss', 'Transmission line loss at rated', '%', { step: 0.1, min: 0, max: 8, help: 'Evacuation line loss at full AC power (∝ I²).' }],
      ['auxDay', 'Auxiliaries (day)', 'W/kWp', { step: 0.05, min: 0, max: 5, help: 'Trackers, SCADA, lighting during production.' }],
      ['auxNight', 'Auxiliaries (night)', 'W/kWp', { step: 0.05, min: 0, max: 5, help: 'Reported separately; not deducted from the injection profile (night import).' }],
      ['availability', 'Plant availability', '%', { step: 0.1, min: 80, max: 100 }],
      ['poiLimit', 'POI export limit', '% of AC', { step: 1, min: 10, max: 120 }]
    ]);
  }
  function renderPV() {
    $('#page-pv').innerHTML = `<div class="split wide"><div class="sticky" id="pvForm">${pvForm()}</div><div id="pvOut"></div></div>`;
  }
  function needWeather(where) {
    return `<div class="card">${emptyState('Site weather data required', `The ${where} model computes the hourly profile from irradiance, temperature and wind data for the selected coordinates. Fetch ERA5 or NASA POWER data on the Site & Resource page. Uploaded or sample profiles can still be used directly in the plant simulation.`, `<button class="btn primary" onclick="TRE_APP.go('site')">${IC.site}Go to Site &amp; Resource</button>`)}</div>`;
  }
  function lossRows(rows) {
    // rows: {type:'stage'|'loss', label, value, unit, rel}
    let html = '<div class="loss">';
    for (const r of rows) {
      if (r.type === 'stage') { html += `<div class="stage ${r.g ? 'g' : ''}"><span>${r.label}</span><span>${fmt(r.value, r.d == null ? 0 : r.d)} ${r.unit || ''}</span></div>`; continue; }
      if (Math.abs(r.rel) < 0.00005 && !r.keep) continue;
      const gain = r.rel > 0;
      const w = Math.min(100, Math.abs(r.rel) * 100 * 6);
      html += `<div class="row ${gain ? 'gain' : 'lossr'}"><span class="nm">${r.label}</span><span class="bar"><i style="width:${Math.max(2, Math.min(44, w * 0.44))}px"></i></span><span class="pct">${gain ? '+' : ''}${fmt(r.rel * 100, 2)}%</span><span class="val">${fmt(r.abs, 1)}</span></div>`;
    }
    return html + '</div>';
  }
  function pvLossTable() {
    const L = R.re.pvRes.loss, ny = L.hours > 0 ? R.weather.n / 8766 : 1;
    const y = (x) => x / ny;
    const rows = [];
    let cur = L.ghi;
    rows.push({ type: 'stage', label: 'Global horizontal irradiation', value: y(L.ghi), unit: 'kWh/m²' });
    rows.push({ label: 'Global incident in collector plane', rel: L.poa / L.ghi - 1, abs: y(L.poa - L.ghi) });
    cur = L.poa;
    const step = (label, loss) => { const r = { label, rel: -loss / cur, abs: -y(loss) }; cur -= loss; rows.push(r); };
    step('Far shading / horizon', L.horizon); step('Near shading: irradiance loss', L.nearShade); step('IAM factor on global', L.iamL); step('Soiling loss', L.soilL);
    rows.push({ type: 'stage', label: 'Effective irradiation on collectors', value: y(L.geffFront), unit: 'kWh/m²' });
    if (S.pv.bifacial) rows.push({ label: `Bifacial: rear irradiance ${fmt(y(L.rear), 0)} kWh/m² → effective gain`, rel: L.bifGain / L.geffFront, abs: y(L.bifGain) });
    rows.push({ type: 'stage', label: `Array nominal energy (STC, η=${fmt(S.pv.etaModule * 100, 1)}%)`, value: y(L.stc), unit: 'kWh/kWp', g: true });
    cur = L.stc;
    step('PV loss due to irradiance level', L.irrLevel); step('PV loss due to temperature', L.temp); step('Shading: electrical loss', L.shadeElec);
    step('Module quality loss', L.quality); step('LID / LeTID', L.lid); step('Degradation', L.degr); step('Module array mismatch', L.mismatch); step('Ohmic wiring loss (DC)', L.ohmic);
    rows.push({ type: 'stage', label: 'Array virtual energy at MPP', value: y(L.earray), unit: 'kWh/kWp', g: true });
    cur = L.earray;
    step('Inverter loss during operation (efficiency)', L.invOp); step('Inverter loss over nominal power (clipping)', L.invClip); step('Inverter loss due to power threshold', L.invThr);
    step(L.invTemp < 0 ? 'Inverter overload gain at low temperature' : 'Inverter temperature derating', L.invTemp);
    rows.push({ type: 'stage', label: 'Available energy at inverter output', value: y(L.eInv), unit: 'kWh/kWp', g: true });
    cur = L.eInv;
    step('AC ohmic loss', L.acOhm); step('MV transformer loss', L.mvTr); step('HV transformer loss', L.hvTr); step('Transmission line loss', L.line); step('Auxiliaries (daytime)', L.aux); step('System unavailability', L.avail); step('POI export limitation', L.poi);
    rows.push({ type: 'stage', label: 'Energy injected at POI (E_Grid)', value: y(L.egrid), unit: 'kWh/kWp', g: true });
    return { rows, pr: L.egrid / L.poa, night: y(L.nightAux), yieldAll: y(L.egrid) };
  }
  function updatePV() {
    const out = $('#pvOut'); if (!out) return;
    if (!R.re) { out.innerHTML = needWeather('solar PV'); return; }
    const prof = R.re.prof.solar, yld = sum(prof), lt = pvLossTable();
    const ex = TRE.exceedance(R.re.annual.map(a => a.solar), yld, S.prof.uncSolar);
    const clipPct = R.re.pvRes.loss.invClip / R.re.pvRes.loss.earray;
    out.innerHTML = `
    <div class="kpis">
      ${kpi('Specific yield (P50)', fmt(yld, 0), 'kWh/kWp', `${S.res.basis === 'tmy' ? 'TMY' : S.res.year} · DC basis`, 'var(--solar)')}
      ${kpi('Performance ratio', pct(lt.pr), '', 'E_Grid / (POA × kWp)', 'var(--green-2)')}
      ${kpi('CUF (DC)', pct(yld / 8760), '', `AC: ${pct(yld * S.pv.dcac / 8760)}`, 'var(--gold)')}
      ${kpi('Peak output', fmt(Math.max(...prof) * 100, 1), '% kWp', `AC limit ${fmt(100 / S.pv.dcac, 1)} % kWp`, 'var(--nh3)')}
      ${kpi('P90 (1-year)', fmt(ex.P90_1y, 0), 'kWh/kWp', `IAV ${pct(ex.iav)} · unc. ${fmt(S.prof.uncSolar, 1)}%`, 'var(--curt)')}
      ${kpi('Inverter clipping', pct(clipPct, 2), '', `DC/AC ${fmt(S.pv.dcac, 2)}`, 'var(--bess)')}
    </div>
    <div class="grid" style="grid-template-columns:minmax(0,1.12fr) minmax(0,1fr)">
      ${card('Energy loss diagram', 'Annual, PVsyst sequence', lossRows(lt.rows) + `<div class="small muted mt">Night auxiliary import ${fmt(lt.night, 2)} kWh/kWp·yr (not deducted). Values per year averaged over the dataset; KPIs use the ${S.res.basis === 'tmy' ? 'TMY' : 'selected year'}.</div>`)}
      <div class="grid">
        ${card('Monthly energy & performance ratio', '', '<div class="chart" id="chPvM"></div>')}
        ${card('Average daily profile', 'Output in % of DC capacity, by month', '<div class="chart short" id="chPvD"></div>')}
      </div>
    </div>
    <div class="grid g2 mt">
      ${card('Hourly output heatmap', '8760 h · day of year × local hour', '<div class="chart" id="chPvH"></div>')}
      ${card('Yield per weather year & exceedance', '', '<div class="chart short" id="chPvY"></div>' + exTable(ex, 'kWh/kWp'))}
    </div>`;
    const t = theme();
    const mE = [], mPR = [], mPOA = [];
    for (let m = 1; m <= 12; m++) { let e = 0, p = 0; for (let h = 0; h < 8760; h++) if (CAL.month[h] === m) { e += prof[h]; p += R.re.prof.poa[h] / 1000; } mE.push(+e.toFixed(1)); mPR.push(+(p > 0 ? e / p * 100 : 0).toFixed(1)); mPOA.push(+p.toFixed(1)); }
    chart('chPvM', baseOpt({ xAxis: { type: 'category', data: MONTHS }, yAxis: [{ type: 'value', name: 'kWh/kWp' }, { type: 'value', name: 'PR %', min: 50, max: 100, splitLine: { show: false } }], grid: { left: 50, right: 46, top: 52, bottom: 30 },
      series: [{ name: 'E_Grid', type: 'bar', data: mE, itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#FFC83D' }, { offset: 1, color: t.solar }] }, borderRadius: [5, 5, 0, 0] } },
        { name: 'POA (kWh/m²)', type: 'line', data: mPOA, itemStyle: { color: t.grid2 }, lineStyle: { type: 'dashed' }, symbol: 'none' }, { name: 'PR', type: 'line', yAxisIndex: 1, data: mPR, itemStyle: { color: t.green }, smooth: true, symbolSize: 6 }] }));
    const ser = [];
    for (let m = 0; m < 12; m++) { const d = new Array(24).fill(0); let n = 0; for (let h = 0; h < 8760; h++) if (CAL.month[h] === m + 1) { d[CAL.hour[h]] += prof[h] * 100; if (CAL.hour[h] === 0) n++; } ser.push({ name: MONTHS[m], type: 'line', smooth: true, symbol: 'none', data: d.map(x => +(x / n).toFixed(2)), lineStyle: { width: 1.6 } }); }
    chart('chPvD', baseOpt({ color: ['#2B6CB0', '#3A7FC2', '#5BA0C8', '#E8A600', '#F2B705', '#FFD23F', '#9BC53D', '#6BAA3A', '#4F9A5A', '#D9822B', '#B85C38', '#4A5FA8'], xAxis: { type: 'category', data: [...Array(24).keys()], name: 'h' }, yAxis: { type: 'value', name: '% kWp' }, legend: { type: 'scroll', top: 2, textStyle: { color: t.text, fontSize: 10 } }, grid: { left: 46, right: 18, top: 52, bottom: 28 }, series: ser }));
    heat8760('chPvH', prof, 100, ['#0E1A12', '#3A2E05', '#8A6500', '#F2B705', '#FFE38A'], '% kWp');
    yieldYears('chPvY', R.re.annual.map(a => [a.year, a.solar]), t.solar, yld);
  }
  function heat8760(id, arr, scale, cols, unit) {
    const t = theme(), data = [];
    let mx = 0;
    for (let d = 0; d < 365; d++) for (let h = 0; h < 24; h++) { const v = arr[d * 24 + h] * scale; mx = Math.max(mx, v); data.push([d, h, +v.toFixed(2)]); }
    const dl = []; for (let d = 0; d < 365; d++) { const i = d * 24; dl.push(`${CAL.day[i]} ${MONTHS[CAL.month[i] - 1]}`); }
    chart(id, { ...baseOpt(), tooltip: { formatter: (p) => `${dl[p.value[0]]} ${String(p.value[1]).padStart(2, '0')}:00 — ${p.value[2]} ${unit}` }, grid: { left: 36, right: 64, top: 12, bottom: 30 },
      xAxis: { type: 'category', data: dl, axisLabel: { color: t.text, fontSize: 10, interval: 30 }, axisLine: { lineStyle: { color: t.border } }, axisTick: { show: false } },
      yAxis: { type: 'category', data: [...Array(24).keys()], axisLabel: { color: t.text, fontSize: 10, interval: 3 }, axisLine: { lineStyle: { color: t.border } } },
      visualMap: { min: 0, max: Math.max(1, +mx.toFixed(0)), calculable: true, right: 2, top: 'center', itemHeight: 150, textStyle: { color: t.text, fontSize: 10 }, inRange: { color: cols } },
      series: [{ type: 'heatmap', data, progressive: 3000 }] });
  }
  function yieldYears(id, pairs, color, p50) {
    const t = theme();
    chart(id, baseOpt({ xAxis: { type: 'category', data: pairs.map(p => p[0]) }, yAxis: { type: 'value', min: (v) => Math.floor(v.min * 0.92 / 10) * 10 }, grid: { left: 52, right: 16, top: 30, bottom: 26 },
      series: [{ name: 'Annual yield', type: 'bar', data: pairs.map(p => +p[1].toFixed(0)), itemStyle: { color, borderRadius: [4, 4, 0, 0] }, markLine: { symbol: 'none', data: [{ yAxis: +p50.toFixed(0), name: 'Profile' }], lineStyle: { color: t.textMain, type: 'dashed' }, label: { formatter: 'Profile {c}', color: t.text } } }] }));
  }
  function exTable(ex, unit) {
    const r = (k) => `<tr><td>${k}</td><td class="n">${fmt(ex[k + '_1y'], 0)}</td><td class="n">${fmt(ex[k + '_10y'], 0)}</td><td class="n">${pct(ex[k + '_1y'] / ex.p50 - 1)}</td></tr>`;
    return `<table class="t mt"><thead><tr><th>Exceedance (${unit})</th><th class="n">1-year</th><th class="n">10-year</th><th class="n">Δ vs P50 (1-yr)</th></tr></thead><tbody><tr><td>P50</td><td class="n">${fmt(ex.p50, 0)}</td><td class="n">${fmt(ex.p50, 0)}</td><td class="n">—</td></tr>${['P75', 'P90', 'P99'].map(r).join('')}</tbody></table>`;
  }

  /* =================================================================
   *  PAGE 3 — WIND
   * ================================================================= */
  function windForm() {
    const cust = () => S.wind.model === 'custom';
    return section('Wind turbine generator', 'wind', 'wind', [
      ['model', 'Turbine model', '', { type: 'sel', options: Object.entries(TRE.WTG_LIB).map(([k, v]) => [k, v.label]).concat([['custom', 'Custom power curve (paste table)']]), full: true }],
      ['hub', 'Hub height', 'm', { step: 1, min: 40, max: 200, range: true }],
      ['cp', 'Max power coefficient Cp', '', { step: 0.005, min: 0.35, max: 0.52, show: () => !cust(), help: 'Aero-electrical Cp of the generic curve (0.45–0.48 for modern rotors).' }],
      ['ti', 'Turbulence intensity', '%', { step: 0.5, min: 4, max: 25, show: () => !cust(), help: 'Smooths the knee of the power curve (Gaussian speed averaging).' }],
      ['softCutout', 'High-wind ride-through (soft cut-out)', '', { type: 'tog', full: true, show: () => !cust() }],
      ['custom', 'Power curve: wind speed [m/s], power [kW] per line', '', { type: 'area', show: cust, ph: '3, 40\n4, 160\n5, 380\n…\n25, 3300' }]
    ], true) +
    section('Shear, calibration & density', 'chart', 'wind', [
      ['shearMode', 'Vertical extrapolation', '', { type: 'sel', options: [['matrix', 'Shear matrix (month × hour, from data)'], ['mean', 'Annual mean shear (from data)'], ['fixed', 'Fixed power-law exponent']], full: true }],
      ['alphaFixed', 'Shear exponent α', '', { step: 0.01, min: 0, max: 0.6, show: () => S.wind.shearMode === 'fixed' }],
      ['targetMean', 'Calibrate to mean speed at hub', 'm/s', { step: 0.05, min: 0, max: 15, help: '0 = no calibration. Enter the long-term mean from a met mast, LiDAR or Global Wind Atlas to remove reanalysis bias (MCP-style scaling).' }],
      ['speedScale', 'Speed scaling factor', '×', { step: 0.01, min: 0.5, max: 1.5, show: () => !(S.wind.targetMean > 0) }],
      ['densityCorr', 'Air-density correction (IEC 61400-12-1)', '', { type: 'tog', full: true }],
      ['tHigh', 'High-temperature derating above', '°C', { step: 1, min: 25, max: 55 }],
      ['tHighDerate', 'Output limit when hot', '%', { step: 1, min: 0, max: 100 }],
      ['tLow', 'Low-temperature shutdown below', '°C', { step: 1, min: -40, max: 10 }]
    ]) +
    section('Energy losses (EYA categories)', 'shield', 'wind', [
      ['wake', 'Wake effect (internal)', '%', { step: 0.1, min: 0, max: 25, help: 'Array losses from turbine layout; 5–10% typical for multi-row farms.' }],
      ['extWake', 'External wakes', '%', { step: 0.1, min: 0, max: 15 }],
      ['availWTG', 'Turbine availability', '%', { step: 0.1, min: 80, max: 100 }],
      ['availBOP', 'BOP availability', '%', { step: 0.1, min: 90, max: 100 }],
      ['availGrid', 'Grid availability', '%', { step: 0.1, min: 90, max: 100 }],
      ['elec', 'Electrical losses to POI', '%', { step: 0.1, min: 0, max: 10 }],
      ['perf', 'Turbine performance (power curve)', '%', { step: 0.1, min: 0, max: 10 }],
      ['hysteresis', 'High-wind hysteresis', '%', { step: 0.1, min: 0, max: 3 }],
      ['env', 'Environmental (icing, blade degradation)', '%', { step: 0.1, min: 0, max: 10 }],
      ['curtail', 'Curtailment / sector management', '%', { step: 0.1, min: 0, max: 30 }],
      ['degr', 'Long-term degradation', '%', { step: 0.1, min: 0, max: 5 }]
    ]);
  }
  function renderWind() { $('#page-wind').innerHTML = `<div class="split wide"><div class="sticky" id="wForm">${windForm()}</div><div id="wOut"></div></div>`; }
  function updateWind() {
    const out = $('#wOut'); if (!out) return;
    if (!R.re) { out.innerHTML = needWeather('wind'); return; }
    const wr = R.re.wRes, prof = R.re.prof.wind, aep = sum(prof), vh = R.re.prof.vhub;
    const wb = TRE.weibullFit(vh);
    const ex = TRE.exceedance(R.re.annual.map(a => a.wind), aep, S.prof.uncWind);
    const L = wr.loss, ny = R.weather.n / 8766;
    const grossAEP = L.grossIdeal / ny;
    out.innerHTML = `
    <div class="kpis">
      ${kpi('Net capacity factor (P50)', pct(aep / 8760), '', `${fmt(aep, 0)} MWh/MW·yr`, 'var(--wind)')}
      ${kpi('Mean speed at hub', fmt(mean(vh), 2), 'm/s', wr.calFactor !== 1 ? `Calibrated ×${fmt(wr.calFactor, 3)}` : `${S.wind.hub} m hub`, 'var(--wind)')}
      ${kpi('Weibull k / A', `${fmt(wb.k, 2)} / ${fmt(wb.A, 2)}`, '', 'Method of moments', 'var(--nh3)')}
      ${kpi('Air density at hub', fmt(wr.meanRho, 3), 'kg/m³', `${pct(wr.meanRho / 1.225 - 1)} vs 1.225`, 'var(--bess)')}
      ${kpi('Gross → net losses', pct(1 - L.net / L.grossIdeal), '', 'Incl. density & temperature', 'var(--curt)')}
      ${kpi('P90 (1-year)', fmt(ex.P90_1y, 0), 'MWh/MW', `IAV ${pct(ex.iav)} · unc. ${fmt(S.prof.uncWind, 1)}%`, 'var(--gold)')}
    </div>
    <div class="grid g2">
      ${card('Power curve', `Standard vs site air density`, '<div class="chart" id="chPc"></div>')}
      ${card('Energy loss cascade', 'Annual, per MW installed', lossRows(windLossRows(L, ny)))}
      ${card('Monthly capacity factor & wind speed', '', '<div class="chart" id="chWm"></div>')}
      ${card('Wind speed distribution at hub', 'Histogram with fitted Weibull', '<div class="chart" id="chWb"></div>')}
      ${card('Hourly output heatmap', '8760 h · day of year × local hour', '<div class="chart" id="chWh"></div>')}
      ${card('Yield per weather year & exceedance', '', '<div class="chart short" id="chWy"></div>' + exTable(ex, 'MWh/MW'))}
    </div>`;
    const t = theme(), pc = wr.curve;
    const std = [], site = [], f = Math.cbrt(wr.meanRho / 1.225);
    for (let v = 0; v <= 30; v += 0.5) { std.push([v, +(TRE.curveAt(pc, v) / 1000).toFixed(3)]); site.push([v, +(TRE.curveAt(pc, v * f) / 1000).toFixed(3)]); }
    chart('chPc', baseOpt({ xAxis: { type: 'value', name: 'm/s', max: 30 }, yAxis: { type: 'value', name: 'MW' }, grid: { left: 46, right: 30, top: 52, bottom: 34 },
      series: [{ name: 'ρ = 1.225 kg/m³', type: 'line', data: std, symbol: 'none', lineStyle: { width: 2.5, color: t.wind }, itemStyle: { color: t.wind }, areaStyle: { color: t.wind, opacity: .07 } },
        { name: `Site ρ = ${fmt(wr.meanRho, 3)}`, type: 'line', data: site, symbol: 'none', lineStyle: { width: 2, type: 'dashed', color: t.gold }, itemStyle: { color: t.gold } }] }));
    const mCF = [], mV = [];
    for (let m = 1; m <= 12; m++) { let e = 0, v = 0, n = 0; for (let h = 0; h < 8760; h++) if (CAL.month[h] === m) { e += prof[h]; v += vh[h]; n++; } mCF.push(+(e / n * 100).toFixed(1)); mV.push(+(v / n).toFixed(2)); }
    chart('chWm', baseOpt({ xAxis: { type: 'category', data: MONTHS }, yAxis: [{ type: 'value', name: 'CF %' }, { type: 'value', name: 'm/s', splitLine: { show: false } }], grid: { left: 46, right: 44, top: 52, bottom: 30 },
      series: [{ name: 'Net CF', type: 'bar', data: mCF, itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#39B5BC' }, { offset: 1, color: t.wind }] }, borderRadius: [5, 5, 0, 0] } }, { name: 'Hub speed', type: 'line', yAxisIndex: 1, data: mV, smooth: true, itemStyle: { color: t.nh3 } }] }));
    const hist = new Array(30).fill(0); for (const v of vh) hist[Math.min(29, Math.floor(v))]++;
    const pdf = []; for (let v = 0.5; v < 30; v += 1) pdf.push(+(8760 * (wb.k / wb.A) * Math.pow(v / wb.A, wb.k - 1) * Math.exp(-Math.pow(v / wb.A, wb.k))).toFixed(1));
    chart('chWb', baseOpt({ xAxis: { type: 'category', data: hist.map((_, i) => `${i}`), name: 'm/s' }, yAxis: { type: 'value', name: 'hours' }, grid: { left: 50, right: 30, top: 52, bottom: 34 },
      series: [{ name: 'Hours', type: 'bar', data: hist, barWidth: '86%', itemStyle: { color: t.wind, opacity: .75, borderRadius: [3, 3, 0, 0] } }, { name: `Weibull k=${fmt(wb.k, 2)}`, type: 'line', data: pdf, smooth: true, symbol: 'none', lineStyle: { color: t.curt, width: 2 }, itemStyle: { color: t.curt } }] }));
    heat8760('chWh', prof, 100, ['#F2FAFA', '#9AD1D4', '#2C9AA1', '#0A5A60', '#04282B'], '% kW');
    yieldYears('chWy', R.re.annual.map(a => [a.year, a.wind]), t.wind, aep);
  }
  function windLossRows(L, ny) {
    const y = (x) => x / ny, rows = [];
    rows.push({ type: 'stage', label: 'Gross energy (standard density, free stream)', value: y(L.grossIdeal), unit: 'MWh/MW' });
    let cur = L.grossIdeal;
    const step = (label, loss) => { rows.push({ label, rel: -loss / cur, abs: -y(loss) }); cur -= loss; };
    step('Air-density adjustment', L.density); step('High/low temperature derating', L.temp);
    step('Wake effects (internal + external)', L.wake); step('Availability (WTG, BOP, grid)', L.avail); step('Electrical losses', L.elec);
    step('Turbine performance & hysteresis', L.perf); step('Environmental & degradation', L.env); step('Curtailment', L.curtail);
    rows.push({ type: 'stage', label: 'Net energy at POI', value: y(L.net), unit: 'MWh/MW', g: true });
    return rows;
  }

  /* =================================================================
   *  PAGE 4 — PROFILE & EXPORT
   * ================================================================= */
  function renderProfile() {
    const srcOpts = [['model', 'Location model (Steps 2–3)'], ['upload', 'Uploaded file'], ['sample', 'Sample (Damoh)'], ['none', 'Not used (zero)']];
    $('#page-profile').innerHTML = `
    <div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">
      ${card('Profile sources & exceedance level', 'Mix sources per technology; the result feeds the plant simulation', `
        <div class="sec" style="border:0;margin:0"><div class="body" style="padding:0">
          ${U.field('prof', ['srcSolar', 'Solar profile source', '', { type: 'sel', options: srcOpts }])}
          ${U.field('prof', ['srcWind', 'Wind profile source', '', { type: 'sel', options: srcOpts }])}
          ${U.field('prof', ['plevel', 'Exceedance level', '', { type: 'sel', options: [['P50', 'P50 (median)'], ['P75', 'P75'], ['P90', 'P90'], ['P99', 'P99']], help: 'Scales the hourly profile by Pxx/P50 using inter-annual variability and the uncertainties below (normal distribution).' }])}
          ${U.field('prof', ['pbasis', 'Exceedance horizon', '', { type: 'sel', options: [['1y', '1-year'], ['10y', '10-year average']] }])}
          ${U.field('prof', ['uncSolar', 'Solar uncertainty (resource + model)', '%', { step: 0.5, min: 0, max: 20 }])}
          ${U.field('prof', ['uncWind', 'Wind uncertainty (resource + model)', '%', { step: 0.5, min: 0, max: 30 }])}
        </div></div>`)}
      ${card('Excel template & file exchange', 'Model-ready workbook — same layout as RE_Production_Efficiency_data.xlsx', uploadPanel() + `
        <div class="row-flex mt"><button class="btn primary" id="btnExpX">${IC.dl}Export efficiency workbook (.xlsx)</button><button class="btn" id="btnExpC">${IC.dl}Export CSV</button></div>`)}
    </div>
    <div id="profOut" class="mt"></div>`;
    bindUpload($('#page-profile'));
    $('#btnExpX').onclick = exportProfileXlsx; $('#btnExpC').onclick = exportProfileCsv;
  }
  function profMeta() {
    return { place: S.site.place, source: 'TrueRE Hybrid Studio', srcSolar: S.prof.srcSolar, srcWind: S.prof.srcWind, dataset: R.weather ? R.weather.source : (S.cache ? S.cache.dataset : ''), basis: R.weather ? (S.res.basis === 'tmy' ? `TMY ${R.weather.years.join('–')}` : `Year ${S.res.year}`) : '', plevel: `${S.prof.plevel} (${S.prof.pbasis})`, detail: R.re ? R.re.prof : null };
  }
  async function exportProfileXlsx() {
    if (!R.profile) return toast('No profile available yet.');
    busy(true, 'Building workbook…', 0.5, '');
    try { const blob = await U.exportEfficiencyWorkbook(R.profile.solar, R.profile.wind, profMeta(), false); U.download(`RE_Production_Efficiency_${(S.site.place || 'site').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40)}_${S.prof.plevel}.xlsx`, blob); toast('Workbook exported — drop it into the Python model as the profile file.'); }
    finally { busy(false); }
  }
  function exportProfileCsv() {
    if (!R.profile) return toast('No profile available yet.');
    const lines = ['date,Solar Efficiency (% kW/kWp),Wind Efficiency (% kW/kWp),Month,Day,Hour'];
    for (let h = 0; h < 8760; h++) lines.push(`${String(CAL.day[h]).padStart(2, '0')}-${String(CAL.month[h]).padStart(2, '0')}-1990 ${String(CAL.hour[h]).padStart(2, '0')}:00,${R.profile.solar[h].toFixed(4)},${R.profile.wind[h].toFixed(4)},${CAL.month[h]},${CAL.day[h]},${CAL.hour[h]}`);
    U.download('RE_Efficiency_profile.csv', new Blob([lines.join('\n')], { type: 'text/csv' }));
  }
  function updateProfile() {
    const out = $('#profOut'); if (!out) return;
    if (!R.profile) { out.innerHTML = `<div class="card">${emptyState('No profile available', 'Fetch weather data, upload an Excel/PVsyst file or choose the sample profile as source.')}</div>`; return; }
    const { solar, wind } = R.profile, c = S.plant;
    const hy = solar.map((s, i) => s * c.Solar_Capacity_MWp / 100 + wind[i] * c.Wind_Capacity_MWp / 100);
    const auxMW = c.Ammonia_Loop_Installed_Capacity * c.Aux_MW_per_300MTPD / 300;
    const ys = sum(solar) / 100, yw = sum(wind) / 100, cap = c.Solar_Capacity_MWp + c.Wind_Capacity_MWp;
    let cov = 0; const ms = mean(solar), mw = mean(wind); let vs = 0, vw = 0;
    for (let i = 0; i < 8760; i++) { cov += (solar[i] - ms) * (wind[i] - mw); vs += (solar[i] - ms) ** 2; vw += (wind[i] - mw) ** 2; }
    const corr = vs > 0 && vw > 0 ? cov / Math.sqrt(vs * vw) : 0;
    const src = (k) => ({ model: 'Location model', upload: 'Uploaded file', sample: 'Sample', none: 'Not used' }[k]);
    out.innerHTML = `
      ${R.profile.fs !== 1 || R.profile.fw !== 1 ? `<div class="note warn mb">${S.prof.plevel} (${S.prof.pbasis}) applied: solar ×${fmt(R.profile.fs, 3)}, wind ×${fmt(R.profile.fw, 3)}.</div>` : ''}
      <div class="kpis">
        ${kpi('Solar specific yield', fmt(ys * 100 / 100, 0), 'kWh/kWp', `${src(S.prof.srcSolar)} · CUF ${pct(ys / 8760)}`, 'var(--solar)')}
        ${kpi('Wind specific yield', fmt(yw, 0), 'kWh/kW', `${src(S.prof.srcWind)} · CUF ${pct(yw / 8760)}`, 'var(--wind)')}
        ${kpi('Hybrid RE energy', fmt(sum(hy) / 1000, 1), 'GWh/yr', `${fmt(c.Solar_Capacity_MWp)} MWp + ${fmt(c.Wind_Capacity_MWp)} MW`, 'var(--green-2)')}
        ${kpi('Hybrid CUF', cap > 0 ? pct(sum(hy) / 8760 / cap) : '—', '', 'On installed RE capacity', 'var(--gold)')}
        ${kpi('Hours RE ≥ NH₃ aux load', fmt(hy.filter(x => x >= auxMW).length), 'h', `Aux ${fmt(auxMW, 1)} MW`, 'var(--nh3)')}
        ${kpi('Solar–wind correlation', fmt(corr, 2), '', corr < 0 ? 'Complementary' : 'Coincident', 'var(--bess)')}
      </div>
      <div class="grid g2">
        ${card('Average diurnal hybrid generation', 'MW at plant capacities · selected month', '<div class="chart" id="chHyD"></div>', `<select id="hyMonth" class="btn sm">${['All year'].concat(MONTHS).map((m, i) => `<option value="${i}">${m}</option>`).join('')}</select>`)}
        ${card('Generation duration curves', 'Sorted hourly output at plant capacities', '<div class="chart" id="chDur"></div>')}
        ${card('Monthly energy', 'GWh at plant capacities', '<div class="chart" id="chHyM"></div>')}
        ${card('Weekly time series', 'Drag the slider to scan the year', '<div class="chart" id="chWk"></div>')}
      </div>`;
    const t = theme();
    const diur = (m) => {
      const s = new Array(24).fill(0), w = new Array(24).fill(0); let n = 0;
      for (let h = 0; h < 8760; h++) if (!m || CAL.month[h] === m) { s[CAL.hour[h]] += solar[h] * c.Solar_Capacity_MWp / 100; w[CAL.hour[h]] += wind[h] * c.Wind_Capacity_MWp / 100; if (CAL.hour[h] === 0) n++; }
      chart('chHyD', baseOpt({ xAxis: { type: 'category', data: [...Array(24).keys()].map(h => String(h).padStart(2, '0')) }, yAxis: { type: 'value', name: 'MW' }, grid: { left: 50, right: 18, top: 52, bottom: 28 },
        series: [{ name: 'Solar', type: 'bar', stack: 'g', data: s.map(x => +(x / n).toFixed(1)), itemStyle: { color: t.solar } }, { name: 'Wind', type: 'bar', stack: 'g', data: w.map(x => +(x / n).toFixed(1)), itemStyle: { color: t.wind, borderRadius: [3, 3, 0, 0] } },
          { name: 'NH₃ aux', type: 'line', data: new Array(24).fill(+auxMW.toFixed(1)), symbol: 'none', lineStyle: { type: 'dashed', color: t.nh3 }, itemStyle: { color: t.nh3 } }] }));
    };
    diur(0); $('#hyMonth').onchange = (e) => diur(+e.target.value);
    const dc = (a) => { const s = Float64Array.from(a).sort().reverse(); const o = []; for (let i = 0; i < 8760; i += 20) o.push([i, +s[i].toFixed(1)]); return o; };
    chart('chDur', baseOpt({ xAxis: { type: 'value', name: 'hours', max: 8760 }, yAxis: { type: 'value', name: 'MW' }, grid: { left: 50, right: 40, top: 52, bottom: 34 },
      series: [{ name: 'Hybrid', type: 'line', data: dc(hy), symbol: 'none', lineStyle: { width: 2.5, color: t.green }, itemStyle: { color: t.green }, areaStyle: { color: t.green, opacity: .08 } },
        { name: 'Solar', type: 'line', data: dc(solar.map(x => x * c.Solar_Capacity_MWp / 100)), symbol: 'none', itemStyle: { color: t.solar } }, { name: 'Wind', type: 'line', data: dc(wind.map(x => x * c.Wind_Capacity_MWp / 100)), symbol: 'none', itemStyle: { color: t.wind } }] }));
    const mS = [], mW = []; for (let m = 1; m <= 12; m++) { let a = 0, b = 0; for (let h = 0; h < 8760; h++) if (CAL.month[h] === m) { a += solar[h] * c.Solar_Capacity_MWp / 100; b += wind[h] * c.Wind_Capacity_MWp / 100; } mS.push(+(a / 1000).toFixed(2)); mW.push(+(b / 1000).toFixed(2)); }
    chart('chHyM', baseOpt({ xAxis: { type: 'category', data: MONTHS }, yAxis: { type: 'value', name: 'GWh' }, series: [{ name: 'Solar', type: 'bar', stack: 'e', data: mS, itemStyle: { color: t.solar } }, { name: 'Wind', type: 'bar', stack: 'e', data: mW, itemStyle: { color: t.wind, borderRadius: [4, 4, 0, 0] } }] }));
    const lab = []; for (let h = 0; h < 8760; h++) lab.push(`${CAL.day[h]} ${MONTHS[CAL.month[h] - 1]} ${String(CAL.hour[h]).padStart(2, '0')}h`);
    chart('chWk', baseOpt({ xAxis: { type: 'category', data: lab, axisLabel: { interval: 23, fontSize: 10 } }, yAxis: { type: 'value', name: 'MW' }, grid: { left: 50, right: 18, top: 52, bottom: 62 },
      dataZoom: [{ type: 'slider', startValue: 4000, endValue: 4167, height: 18, bottom: 8, borderColor: t.border, textStyle: { color: t.text } }, { type: 'inside' }],
      series: [{ name: 'Solar', type: 'line', stack: 'r', areaStyle: { opacity: .55 }, symbol: 'none', data: solar.map(x => +(x * c.Solar_Capacity_MWp / 100).toFixed(1)), itemStyle: { color: t.solar }, lineStyle: { width: 0 } },
        { name: 'Wind', type: 'line', stack: 'r', areaStyle: { opacity: .55 }, symbol: 'none', data: wind.map(x => +(x * c.Wind_Capacity_MWp / 100).toFixed(1)), itemStyle: { color: t.wind }, lineStyle: { width: 0 } }] }));
  }

  /* =================================================================
   *  PAGE 5 — PLANT SIMULATION
   * ================================================================= */
  function plantForm() {
    return `<div class="card mb"><div class="bd"><div class="row-flex"><b class="small">Configuration case</b><select class="btn sm" id="caseSel">${Object.keys(TRE.PLANT_CASES).map(k => `<option ${k === S.plantCase ? 'selected' : ''}>${k}</option>`).join('')}<option value="__custom" ${S.plantCase === '__custom' ? 'selected' : ''}>Custom</option></select><span class="small muted">Cases mirror inputs.xlsx</span></div></div></div>` +
    section('Renewable capacity', 'bolt', 'plant', [
      ['Solar_Capacity_MWp', 'Solar PV capacity', 'MWp', { step: 5, min: 0, range: true, max: 2000 }],
      ['Wind_Capacity_MWp', 'Wind capacity', 'MW', { step: 5, min: 0, range: true, max: 1000 }]
    ], true) +
    section('Electrolyser fleet (PEM + alkaline)', 'flask', 'plant', [
      ['Electrolyzer_Design_MW', 'Total electrolyser rating', 'MW', { step: 5, min: 0, range: true, max: 1500 }],
      ['Electrolyzer_PEM_ratio', 'PEM share of rating', '', { step: 0.01, min: 0, max: 1 }],
      ['PEM_Efficiency_kWhPERkg', 'PEM specific energy', 'kWh/kg', { step: 0.1 }],
      ['Alkaline_Efficiency_kWhPERkg', 'Alkaline specific energy', 'kWh/kg', { step: 0.1 }],
      ['PEM_Min_Turndown_Percent', 'PEM min. load', '%', { step: 1 }], ['Alkaline_Min_Turndown_Percent', 'Alkaline min. load', '%', { step: 1 }],
      ['PEM_Ramp_Rate_PercentPERmin', 'PEM ramp', '%/min', { step: 0.5 }], ['Alkaline_Ramp_Rate_PercentPERmin', 'Alkaline ramp', '%/min', { step: 0.5 }],
      ['Electrolyzer_Dispatch_Priority', 'Loading order', '', { type: 'sel', options: [['Efficiency', 'Efficiency (lowest kWh/kg first)'], ['PEM_First', 'PEM first'], ['Alkaline_First', 'Alkaline first']], full: true }]
    ]) +
    section('Ammonia loop (Haber–Bosch)', 'plant', 'plant', [
      ['Ammonia_Loop_Installed_Capacity', 'Installed capacity', 'MTPD', { step: 5 }], ['Derivative_Normal_MTPD', 'Normal operating rate', 'MTPD', { step: 5 }],
      ['Derivative_per_H2_kgPERkg', 'NH₃ yield per kg H₂', 'kg/kg', { step: 0.01 }], ['Aux_MW_per_300MTPD', 'Loop auxiliary load', 'MW/300 MTPD', { step: 0.5 }],
      ['Derivative_Ramp_rate', 'Loop ramp rate', '%/min', { step: 0.1 }], ['Derivative_Min_Turndown_Percent', 'Minimum turndown', '%', { step: 1 }],
      ['Derivative_Turndown_Step_Percent', 'Turndown step', '% pts', { step: 1 }], ['Derivative_Obligation_TPM', 'Monthly obligation', 't/month', { step: 100 }]
    ]) +
    section('Hydrogen & battery storage', 'bat', 'plant', [
      ['Hydrogen_Storage_Ton', 'H₂ buffer storage', 't', { step: 1, min: 0, range: true, max: 300 }],
      ['BESS_Total_MWh', 'BESS energy (total)', 'MWh', { step: 10, min: 0, range: true, max: 3000 }],
      ['BESS_Derivative_Fraction_of_Total', 'Share for NH₃ loop aux', '', { step: 0.05, min: 0, max: 1 }], ['BESS_Charge_C_Max', 'C-rate', 'C', { step: 0.05, min: 0.05, max: 4 }],
      ['BESS_Derivative_RoundTrip_Eff_Percent', 'RTE (loop BESS)', '%', { step: 0.5 }], ['BESS_Electrolyzer_RoundTrip_Eff_Percent', 'RTE (electrolyser BESS)', '%', { step: 0.5 }],
      ['BESS_derivative_Min_SOC', 'Min SOC (loop BESS)', '%', { step: 1 }], ['BESS_Electrolyzer_Min_SOC', 'Min SOC (ely BESS)', '%', { step: 1 }]
    ]) +
    section('Grid energy banking', 'cable', 'plant', [
      ['Grid_Banking_Max_MWh', 'Bank ceiling', 'MWh', { step: 100 }], ['Grid_Banking_Percent_ofInjection', 'Bankable share of injection', '%', { step: 1 }],
      ['Grid_Banking_Tariff_Percent', 'Banking charge (energy)', '%', { step: 0.5 }], ['Grid_Banking_Peak_Hrs', 'Peak hours (no withdrawal)', '', { type: 'text', full: true }]
    ]) +
    section('Look-ahead ride-through', 'target', 'plant', [
      ['LookAhead_Enable', 'Enable look-ahead rationing', '', { type: 'tog', full: true }],
      ['LookAhead_Horizon_Hours', 'Horizon', 'h', { step: 1 }], ['LookAhead_RE_Recovery_Factor', 'RE recovery factor', '× aux', { step: 0.1 }],
      ['LookAhead_H2_Reserve_Factor', 'H₂ reserve factor', '', { step: 0.05 }], ['LookAhead_Energy_Reserve_Factor', 'Energy reserve factor', '', { step: 0.05 }],
      ['Enable_ElyBESS_Support_Derivative', 'Electrolyser BESS may support loop BESS', '', { type: 'tog', full: true }]
    ]) +
    section('Product storage & offtake', 'tank', 'plant', [
      ['Derivative_Storage_Capacity_Ton', 'NH₃ tank capacity', 't', { step: 100 }], ['Derivative_Storage_Initial_Ton', 'Initial inventory', 't', { step: 100 }],
      ['Derivative_Offtake_TPM', 'Offtake contract', 't/month', { step: 100 }], ['Derivative_Offtake_Frequency', 'Lifting frequency', '', { type: 'sel', options: [['Daily', 'Daily'], ['Monthly', 'Monthly']] }],
      ['Analysis_Month_start', 'Operating year starts (month)', '', { step: 1, min: 1, max: 12 }], ['Analysis_Day_start', 'Start day', '', { step: 1, min: 1, max: 28 }],
      ['Derivative_Offtake_Prorate_Partial_Month', 'Pro-rate partial months (monthly lifting)', '', { type: 'tog', full: true }]
    ]);
  }
  function renderPlant() {
    $('#page-plant').innerHTML = `<div class="split"><div class="sticky" id="plForm">${plantForm()}</div><div id="plOut"></div></div>`;
    bindCase();
  }
  function bindCase() {
    $('#caseSel').onchange = (e) => {
      const k = e.target.value; S.plantCase = k;
      if (TRE.PLANT_CASES[k]) Object.assign(S.plant, TRE.PLANT_CASES[k]);
      U.persist(); $('#plForm').innerHTML = plantForm(); bindCase(); computePlant(); refresh();
    };
  }
  function updatePlant() {
    const out = $('#plOut'); if (!out) return;
    if (!R.plant) { out.innerHTML = `<div class="card">${emptyState('No RE profile available', 'Load site data, upload an efficiency workbook or use the sample profile to run the hourly simulation.', `<button class="btn gold" onclick="TRE_APP.useSample()">${IC.play}Run with sample profile</button>`)}</div>`; return; }
    const r = R.plant, a = r.annual, c = r.cfg;
    const ful = a.offtakeDue > 0 ? a.offtakeDispatched / a.offtakeDue : 1;
    out.innerHTML = `
    ${r.warnings.length ? `<div class="note warn mb">${r.warnings.map(esc).join('<br>')}</div>` : ''}
    <div class="kpis">
      ${kpi('Annual NH₃ production', fmt(a.nh3, 0), 't/yr', `${fmt(a.nh3 / 365, 1)} t/day · ${pct(a.nh3 / (c.Derivative_Normal_MTPD * 365))} of normal`, 'var(--nh3)')}
      ${kpi('Offtake fulfilment', pct(ful), '', `${a.daysMet}/${a.days} days met · ${a.monthsMet}/12 months`, ful > 0.98 ? 'var(--ok)' : 'var(--warn)')}
      ${kpi('Green H₂ produced', fmt(a.h2, 0), 't/yr', `PEM ${fmt(a.h2pem, 0)} · ALK ${fmt(a.h2alk, 0)}`, 'var(--h2)')}
      ${kpi('Electrolyser CUF', pct(a.elyCUF / 100), '', `PEM ${fmt(a.pemUtil, 1)}% · ALK ${fmt(a.alkUtil, 1)}%`, 'var(--h2)')}
      ${kpi('NH₃ loop utilisation', pct(a.loopUtil / 100), '', `${fmt(a.hoursRunning)} h running`, 'var(--nh3)')}
      ${kpi('RE curtailment', pct(a.re > 0 ? a.curtailed / a.re : 0), '', `${fmt(a.curtailed / 1000, 1)} GWh of ${fmt(a.re / 1000, 1)} GWh`, 'var(--curt)')}
      ${kpi('Loop shutdowns', fmt(a.shutdowns), '/yr', `${fmt(a.hoursRationed)} h rationed (look-ahead)`, 'var(--warn)')}
      ${kpi('Excess NH₃ (tank full)', fmt(a.excess, 0), 't/yr', `Shortfall ${fmt(a.offtakeShortfall, 0)} t`, 'var(--gold)')}
    </div>
    <div class="grid g2">
      ${card('Annual energy flow', 'MWh/yr · busbar balance closed every hour', '<div class="chart tall" id="chSankey"></div>')}
      ${card('Monthly production vs obligation', 't NH₃', '<div class="chart tall" id="chPlM"></div>')}
    </div>
    ${card('Hourly dispatch explorer', 'Power balance and storage states · zoom with the slider', '<div class="chart xtall" id="chDisp"></div>', '', 'mt')}
    <div class="grid g2 mt">
      ${card('Daily NH₃ production', 't/day versus normal rate', '<div class="chart" id="chDay"></div>')}
      ${card('Product tank & offtake ledger', `Operating year from ${c.Analysis_Day_start}/${c.Analysis_Month_start} · ${esc(c.Derivative_Offtake_Frequency)} lifting`, ledgerTable(r.tank.ledger), `<button class="btn sm" id="btnExpPlant">${IC.dl}Hourly results .xlsx</button>`)}
    </div>
    <div class="small muted mt">Simulation: 8,760 h + 72 h cyclic warm-up in ${fmt(r.ms, 0)} ms · max busbar imbalance ${a.balanceErr.toExponential(1)} MW · electrolyser loading order ${r.derived.ORDER.join(' → ')} · PEM ${fmt(r.derived.PEM_D, 0)} MW / ALK ${fmt(r.derived.ALK_D, 0)} MW.</div>`;
    $('#btnExpPlant').onclick = exportPlant;
    const t = theme(), H = r.hourly;
    // sankey
    const bessLoss = a.bessCharge - a.bessDisch;
    const nodes = [{ name: 'Solar PV' }, { name: 'Wind' }, { name: 'RE busbar' }, { name: 'Electrolysers' }, { name: 'NH₃ loop aux' }, { name: 'BESS losses' }, { name: 'Curtailed' }, { name: 'Bank charges' }, { name: 'Green H₂' }, { name: 'Ammonia' }, { name: 'Conversion heat' }];
    const links = [];
    const L = (s, tt, v) => { if (v > 1) links.push({ source: s, target: tt, value: Math.round(v) }); };
    L('Solar PV', 'RE busbar', a.solar); L('Wind', 'RE busbar', a.wind);
    L('RE busbar', 'Electrolysers', a.ely); L('RE busbar', 'NH₃ loop aux', a.aux); L('RE busbar', 'BESS losses', Math.max(0, bessLoss)); L('RE busbar', 'Curtailed', a.curtailed); L('RE busbar', 'Bank charges', a.bankTariff);
    L('Electrolysers', 'Green H₂', a.h2 * 33.33); L('Electrolysers', 'Conversion heat', a.ely - a.h2 * 33.33); L('Green H₂', 'Ammonia', a.h2 * 33.33);
    const nc = { 'Solar PV': t.solar, 'Wind': t.wind, 'RE busbar': t.green, 'Electrolysers': t.h2, 'NH₃ loop aux': t.nh3, 'BESS losses': t.bess, 'Curtailed': t.curt, 'Bank charges': t.grid2, 'Green H₂': '#5FB760', 'Ammonia': t.nh3, 'Conversion heat': '#B0B8B3' };
    chart('chSankey', { ...baseOpt(), tooltip: { trigger: 'item', formatter: (p) => p.dataType === 'edge' ? `${p.data.source} → ${p.data.target}: ${fmt(p.data.value)} MWh` : `${p.name}` },
      series: [{ type: 'sankey', left: 8, right: 118, top: 16, bottom: 16, nodeWidth: 16, nodeGap: 14, nodeAlign: 'justify', emphasis: { focus: 'adjacency' }, data: nodes.filter(n => links.some(l => l.source === n.name || l.target === n.name)).map(n => ({ ...n, itemStyle: { color: nc[n.name] } })), links,
        label: { color: t.textMain, fontSize: 11, position: 'right', formatter: (p) => `${p.name}\n{v|${fmt(p.value / 1000, 1)} GWh}`, rich: { v: { color: t.text, fontSize: 10 } } }, lineStyle: { color: 'gradient', opacity: .35, curveness: .5 } }] });
    const ob = c.Derivative_Obligation_TPM;
    chart('chPlM', baseOpt({ xAxis: { type: 'category', data: MONTHS }, yAxis: { type: 'value', name: 't' }, grid: { left: 56, right: 18, top: 52, bottom: 30 },
      series: [{ name: 'Production', type: 'bar', data: r.monthly.map(m => +m.nh3.toFixed(0)), itemStyle: { color: t.nh3, borderRadius: [4, 4, 0, 0] } },
        { name: 'Dispatched to offtaker', type: 'bar', data: r.monthly.map(m => +m.lifted.toFixed(0)), itemStyle: { color: t.green, borderRadius: [4, 4, 0, 0] } },
        { name: 'Shortfall', type: 'bar', data: r.monthly.map(m => +m.short.toFixed(0)), itemStyle: { color: t.curt, borderRadius: [4, 4, 0, 0] } },
        { name: 'Obligation', type: 'line', data: new Array(12).fill(ob), symbol: 'none', lineStyle: { type: 'dashed', color: t.gold, width: 2 }, itemStyle: { color: t.gold } }] }));
    // dispatch
    const lab = []; for (let h = 0; h < 8760; h++) lab.push(`${CAL.day[h]} ${MONTHS[CAL.month[h] - 1]} ${String(CAL.hour[h]).padStart(2, '0')}:00`);
    const r1 = (x) => Math.round(x * 10) / 10;
    const bessCh = Array.from(H.BD_bus, (x, i) => r1(-Math.min(0, x) - Math.min(0, H.BE_bus[i])));
    const bessDis = Array.from(H.BD_bus, (x, i) => r1(Math.max(0, x) + Math.max(0, H.BE_bus[i])));
    const gridIn = Array.from(H.GB_p, x => r1(Math.max(0, x))), gridOut = Array.from(H.GB_p, x => r1(Math.max(0, -x)));
    const ar = (name, data, color, stack, ax, extra) => Object.assign({ name, type: 'line', stack, xAxisIndex: ax, yAxisIndex: ax, symbol: 'none', areaStyle: { opacity: .75 }, lineStyle: { width: 0 }, itemStyle: { color }, data, sampling: 'lttb' }, extra || {});
    chart('chDisp', baseOpt({
      grid: [{ left: 56, right: 56, top: 58, height: '42%' }, { left: 56, right: 56, top: '65%', height: '21%' }],
      xAxis: [{ type: 'category', data: lab, gridIndex: 0, axisLabel: { show: false } }, { type: 'category', data: lab, gridIndex: 1, axisLabel: { interval: 23, fontSize: 10 } }],
      yAxis: [{ type: 'value', name: 'MW', gridIndex: 0 }, { type: 'value', name: '%', gridIndex: 1, max: 120 }],
      axisPointer: { link: [{ xAxisIndex: 'all' }] }, legend: { top: 4, type: 'scroll', textStyle: { color: t.text, fontSize: 11 } },
      dataZoom: [{ type: 'slider', xAxisIndex: [0, 1], startValue: 2880, endValue: 3047, height: 18, bottom: 6, borderColor: t.border, textStyle: { color: t.text } }, { type: 'inside', xAxisIndex: [0, 1] }],
      series: [
        ar('Electrolysers', Array.from(H.EP, r1), t.h2, 'use', 0), ar('NH₃ loop aux', Array.from(H.DP, r1), t.nh3, 'use', 0), ar('BESS charging', bessCh, t.bess, 'use', 0),
        ar('Grid bank deposit', gridOut, t.grid2, 'use', 0), ar('Curtailed', Array.from(H.CURT, x => r1(Math.max(0, x))), t.curt, 'use', 0, { areaStyle: { opacity: .35 } }),
        { name: 'RE generation', type: 'line', xAxisIndex: 0, yAxisIndex: 0, symbol: 'none', data: Array.from(H.RE, r1), lineStyle: { color: t.textMain, width: 1.4 }, itemStyle: { color: t.textMain }, sampling: 'lttb' },
        { name: 'BESS discharge', type: 'line', xAxisIndex: 0, yAxisIndex: 0, symbol: 'none', data: bessDis, lineStyle: { color: t.bess, width: 1.2, type: 'dashed' }, itemStyle: { color: t.bess } },
        { name: 'NH₃ loop load %', type: 'line', xAxisIndex: 1, yAxisIndex: 1, symbol: 'none', data: Array.from(H.DC, x => r1(x / r.derived.margin)), lineStyle: { color: t.nh3, width: 1.6 }, itemStyle: { color: t.nh3 }, step: 'end' },
        { name: 'H₂ storage %', type: 'line', xAxisIndex: 1, yAxisIndex: 1, symbol: 'none', data: Array.from(H.H2pct, r1), lineStyle: { color: t.h2, width: 1.4 }, itemStyle: { color: t.h2 }, areaStyle: { color: t.h2, opacity: .08 } },
        { name: 'BESS SOC %', type: 'line', xAxisIndex: 1, yAxisIndex: 1, symbol: 'none', data: Array.from(H.BD_e, (x, i) => c.BESS_Total_MWh > 0 ? r1((x + H.BE_e[i]) / c.BESS_Total_MWh * 100) : 0), lineStyle: { color: t.bess, width: 1.2 }, itemStyle: { color: t.bess } },
        { name: 'NH₃ tank %', type: 'line', xAxisIndex: 1, yAxisIndex: 1, symbol: 'none', data: Array.from(H.tankLevel, x => c.Derivative_Storage_Capacity_Ton > 0 ? r1(x / c.Derivative_Storage_Capacity_Ton * 100) : 0), lineStyle: { color: t.gold, width: 1.4 }, itemStyle: { color: t.gold } }
      ] }));
    const day = [], dl = []; for (let d = 0; d < 365; d++) { let s = 0; for (let h = 0; h < 24; h++) s += H.DProd[d * 24 + h]; day.push(+s.toFixed(1)); dl.push(`${CAL.day[d * 24]} ${MONTHS[CAL.month[d * 24] - 1]}`); }
    chart('chDay', baseOpt({ xAxis: { type: 'category', data: dl, axisLabel: { interval: 30, fontSize: 10 } }, yAxis: { type: 'value', name: 't/day' }, grid: { left: 50, right: 18, top: 52, bottom: 30 },
      visualMap: { show: false, dimension: 1, pieces: [{ lt: c.Derivative_Normal_MTPD * 0.5, color: t.curt }, { gte: c.Derivative_Normal_MTPD * 0.5, lt: c.Derivative_Normal_MTPD * 0.95, color: t.gold }, { gte: c.Derivative_Normal_MTPD * 0.95, color: t.nh3 }] },
      series: [{ name: 'NH₃', type: 'bar', data: day, barWidth: '90%' }, { name: 'Normal rate', type: 'line', data: new Array(365).fill(c.Derivative_Normal_MTPD), symbol: 'none', lineStyle: { type: 'dashed', color: t.textMain, width: 1 } }] }));
  }
  function ledgerTable(L) {
    const tot = L.reduce((s, x) => ({ prod: s.prod + x.prod, excess: s.excess + x.excess, due: s.due + x.due, lifted: s.lifted + x.lifted, short: s.short + x.short }), { prod: 0, excess: 0, due: 0, lifted: 0, short: 0 });
    return `<div class="tblwrap"><table class="t"><thead><tr><th>Month</th><th class="n">Open</th><th class="n">Production</th><th class="n">Excess</th><th class="n">Due</th><th class="n">Dispatched</th><th class="n">Shortfall</th><th class="n">Close</th><th class="n">Fulfil.</th></tr></thead><tbody>
      ${L.map(l => `<tr><td>${MONTHS[l.month - 1]}</td><td class="n">${fmt(l.open)}</td><td class="n">${fmt(l.prod)}</td><td class="n">${fmt(l.excess)}</td><td class="n">${fmt(l.due)}</td><td class="n">${fmt(l.lifted)}</td><td class="n">${l.short > 0.5 ? `<span class="badge red">${fmt(l.short)}</span>` : '0'}</td><td class="n">${fmt(l.close)}</td><td class="n">${l.due > 0 ? pct(l.lifted / l.due) : '—'}</td></tr>`).join('')}
      <tr class="tot"><td>Year</td><td></td><td class="n">${fmt(tot.prod)}</td><td class="n">${fmt(tot.excess)}</td><td class="n">${fmt(tot.due)}</td><td class="n">${fmt(tot.lifted)}</td><td class="n">${fmt(tot.short)}</td><td></td><td class="n">${tot.due > 0 ? pct(tot.lifted / tot.due) : '—'}</td></tr></tbody></table></div>`;
  }
  async function exportPlant() {
    const r = R.plant; if (!r) return;
    busy(true, 'Writing hourly results…', 0.4, '');
    try {
      const wb = new ExcelJS.Workbook(); wb.creator = 'TrueRE Hybrid Studio';
      const ws = wb.addWorksheet('Hourly', { views: [{ state: 'frozen', ySplit: 1 }] });
      const H = r.hourly;
      const cols = [['Solar MW', H.solarMW], ['Wind MW', H.windMW], ['RE MW', H.RE], ['NH3 loop %', H.DC], ['NH3 aux MW', H.DP], ['NH3 t/h', H.DProd], ['Electrolyser MW', H.EP], ['PEM MW', H.PEM_P], ['ALK MW', H.ALK_P], ['H2 t/h', H.H2E], ['H2 storage t', H.H2S_e], ['BESS loop MWh', H.BD_e], ['BESS ely MWh', H.BE_e], ['Bank MWh', H.GB_e], ['Bank flow MW', H.GB_p], ['Curtailed(+)/Import(-) MW', H.CURT], ['Look-ahead setpoint %', H.LA_sp], ['NH3 tank t', H.tankLevel]];
      ws.addRow(['date'].concat(cols.map(c => c[0]))); U.hdrStyle(ws.getRow(1));
      const rows = []; for (let h = 0; h < 8760; h++) rows.push([U.excelDate(h)].concat(cols.map(c => +(+c[1][h]).toFixed(4))));
      ws.addRows(rows); ws.getColumn(1).numFmt = 'dd-mm-yyyy hh:mm'; ws.columns.forEach(c => c.width = 14); ws.getColumn(1).width = 18;
      const m = wb.addWorksheet('Monthly'); m.addRow(['Month', 'NH3 t', 'H2 t', 'RE MWh', 'Electrolyser MWh', 'Curtailed MWh', 'Shutdowns', 'Offtake due t', 'Dispatched t', 'Shortfall t', 'Excess t']); U.hdrStyle(m.getRow(1));
      r.monthly.forEach(x => m.addRow([MONTHS[x.m - 1], x.nh3, x.h2, x.re, x.ely, x.curt, x.shutdowns, x.due, x.lifted, x.short, x.excess].map(v => typeof v === 'number' ? +v.toFixed(2) : v)));
      m.columns.forEach(c => c.width = 15);
      const k = wb.addWorksheet('Summary'); k.addRow(['KPI', 'Value']); U.hdrStyle(k.getRow(1));
      Object.entries(r.annual).forEach(([kk, v]) => { if (typeof v === 'number') k.addRow([kk, +v.toFixed(3)]); });
      if (R.fin) { k.addRow([]); [['Total CAPEX (Cr)', R.fin.capex], ['LCOA (INR/kg)', R.fin.lcoa], ['LCOH (INR/kg)', R.fin.lcoh], ['Project IRR', R.fin.pirr], ['Equity IRR', R.fin.eirr], ['WACC', R.fin.wacc]].forEach(x => k.addRow([x[0], +(+x[1]).toFixed(4)])); }
      k.addRow([]); k.addRow(['Configuration', '']); U.hdrStyle(k.lastRow, 'FFE6F2E2'); Object.entries(S.plant).forEach(([kk, v]) => k.addRow([kk, v]));
      k.getColumn(1).width = 40; k.getColumn(2).width = 22;
      const buf = await wb.xlsx.writeBuffer(); U.download('TrueRE_Plant_Simulation.xlsx', new Blob([buf], { type: U.XLSX_MIME }));
    } finally { busy(false); }
  }

  /* =================================================================
   *  PAGE 6 — ECONOMICS
   * ================================================================= */
  function finForm() {
    return section('CAPEX unit rates', 'coin', 'fin', [
      ['SolarPV_Cost_Per_MWp', 'Solar PV', 'Cr/MWp', { step: 0.05 }], ['Wind_Cost_Per_MWp', 'Wind', 'Cr/MW', { step: 0.1 }], ['BESS_Cost_Per_MWh', 'BESS', 'Cr/MWh', { step: 0.05 }],
      ['PEM_Cost_Per_MW', 'PEM electrolyser', 'Cr/MW', { step: 0.1 }], ['Alkaline_Cost_Per_MW', 'Alkaline electrolyser', 'Cr/MW', { step: 0.1 }], ['H2Storage_Cost_Per_Ton', 'H₂ storage', 'Cr/t', { step: 0.1 }],
      ['AmmoniaLoop_BaseCost', 'Ammonia loop (at reference)', 'Cr', { step: 5 }], ['AmmoniaLoop_Ref_MTPD', 'Reference loop size', 'MTPD', { step: 10 }], ['AmmoniaLoop_Scale_Exp', 'Scale exponent', '', { step: 0.05, help: '0 = fixed package cost (as financial_model.py); 0.6–0.8 for scaled studies.' }],
      ['BOP_BaseCost', 'BOP & utilities', 'Cr', { step: 5 }], ['Others_BaseCost', 'Others', 'Cr', { step: 5 }], ['Evacuation_Cost_Per_MWp', 'Evacuation', 'Cr/MW RE', { step: 0.01 }],
      ['Land_Cost_INR_Lakh_per_Acre', 'Land cost', 'lakh/acre', { step: 0.5 }], ['Contingency_Percent', 'Contingency', '% EPC', { step: 0.5 }], ['Owners_Cost_Percent', "Owner's cost", '% EPC', { step: 0.5 }], ['PreOperative_Percent', 'Pre-operative', '% EPC', { step: 0.1 }]
    ], true) +
    section('Timeline & funding', 'shield', 'fin', [
      ['Construction_Period_Years', 'Construction period', 'yr', { step: 1, min: 1, max: 5 }], ['Drawdown_Y1', 'Year-1 drawdown', '%', { step: 5 }], ['PLANT_LIFETIME', 'Operating life', 'yr', { step: 1 }],
      ['Gearing_Percent', 'Gearing (debt)', '%', { step: 1 }], ['Interest_Rate_Percent', 'Interest rate', '%', { step: 0.1 }], ['Loan_Tenor_Years', 'Loan tenor', 'yr', { step: 1 }], ['Moratorium_Years', 'Moratorium', 'yr', { step: 1 }],
      ['Cost_of_Equity_Percent', 'Cost of equity', '%', { step: 0.25 }], ['Tax_Rate_Percent', 'Tax rate (115BAA)', '%', { step: 0.1 }]
    ]) +
    section('Revenue & incentives', 'chart', 'fin', [
      ['Ammonia_Price_INR_per_kg', 'Green NH₃ price', 'INR/kg', { step: 0.25 }], ['Grey_Ammonia_Price_INR_per_kg', 'Excess NH₃ price (grey)', 'INR/kg', { step: 0.5 }],
      ['Subsidy_NH3_Y1', 'SIGHT incentive yr 1', 'INR/kg', { step: 0.01 }], ['Subsidy_NH3_Y2', 'SIGHT incentive yr 2', 'INR/kg', { step: 0.01 }], ['Subsidy_NH3_Y3', 'SIGHT incentive yr 3', 'INR/kg', { step: 0.01 }],
      ['Ramp_Y1', 'Year-1 output', '%', { step: 1 }], ['Plant_Availability_Percent', 'Plant availability', '%', { step: 0.5 }], ['Output_Degradation_Percent_per_Year', 'Output degradation', '%/yr', { step: 0.05 }]
    ]) +
    section('OPEX & major maintenance', 'gear', 'fin', [
      ['OM_Solar', 'O&M solar', '% capex', { step: 0.05 }], ['OM_Wind', 'O&M wind', '% capex', { step: 0.05 }], ['OM_BESS', 'O&M BESS', '% capex', { step: 0.05 }], ['OM_PEM', 'O&M PEM', '% capex', { step: 0.05 }], ['OM_ALK', 'O&M alkaline', '% capex', { step: 0.05 }], ['OM_NH3', 'O&M NH₃ loop', '% capex', { step: 0.05 }],
      ['Manpower_Cost_Crore_per_Year', 'Manpower', 'Cr/yr', { step: 0.1 }], ['Admin_Cost_Crore_per_Year', 'Admin', 'Cr/yr', { step: 0.1 }], ['Insurance_Percent_of_Capex', 'Insurance', '% capex', { step: 0.05 }], ['Water_Cost_INR_per_m3', 'Water cost', 'INR/m³', { step: 1 }],
      ['Opex_Escalation_Percent', 'OPEX escalation', '%/yr', { step: 0.25 }],
      ['PEM_Stack_Interval', 'PEM stack replacement every', 'yr', { step: 1 }], ['PEM_Stack_Percent', 'PEM stack cost', '% capex', { step: 1 }],
      ['ALK_Stack_Interval', 'ALK stack replacement every', 'yr', { step: 1 }], ['ALK_Stack_Percent', 'ALK stack cost', '% capex', { step: 1 }],
      ['BESS_Aug_Interval', 'BESS augmentation every', 'yr', { step: 1 }], ['BESS_Aug_Percent', 'BESS augmentation', '% capex', { step: 1 }]
    ]);
  }
  function renderEcon() { $('#page-econ').innerHTML = `<div class="split"><div class="sticky">${finForm()}</div><div id="ecOut"></div></div>`; }
  function updateEcon() {
    const out = $('#ecOut'); if (!out) return;
    if (!R.fin) { out.innerHTML = `<div class="card">${emptyState('Run the plant simulation first', 'Economics are struck on the simulated annual production.')}</div>`; return; }
    const f = R.fin, a = R.plant.annual;
    out.innerHTML = `
    <div class="kpis">
      ${kpi('Total project cost', fmt(f.capex, 0), 'Cr', `EPC ${fmt(f.epc, 0)} · IDC ${fmt(f.idc, 0)} · land ${fmt(f.land, 0)}`, 'var(--nh3)')}
      ${kpi('Levelised cost of NH₃', fmt(f.lcoa, 1), 'INR/kg', `${fmt(f.lcoa * 1000 / 83.5, 0)} USD/t @ 83.5`, 'var(--green-2)')}
      ${kpi('Levelised cost of H₂', fmt(f.lcoh, 1), 'INR/kg', `${fmt(f.lcoh / 83.5, 2)} USD/kg`, 'var(--h2)')}
      ${kpi('Project IRR (post-tax)', isFinite(f.pirr) ? pct(f.pirr) : 'n/a', '', `WACC ${pct(f.wacc)}`, f.pirr > f.wacc ? 'var(--ok)' : 'var(--curt)')}
      ${kpi('Equity IRR', isFinite(f.eirr) ? pct(f.eirr) : 'n/a', '', `Gearing ${fmt(S.fin.Gearing_Percent)}%`, 'var(--gold)')}
      ${kpi('Minimum DSCR', isFinite(f.minDSCR) ? fmt(f.minDSCR, 2) + '×' : '—', '', `Tenor ${S.fin.Loan_Tenor_Years} yr`, f.minDSCR >= 1.3 ? 'var(--ok)' : 'var(--warn)')}
      ${kpi('Breakeven green NH₃ price', fmt(f.breakeven, 1), 'INR/kg', 'Project NPV @ WACC = 0', 'var(--bess)')}
      ${kpi('Specific CAPEX', fmt(f.capex * 1e7 / Math.max(1, a.nh3 * 1000), 0), 'INR per kg/yr', `${fmt(f.capex / R.plant.cfg.Ammonia_Loop_Installed_Capacity, 2)} Cr/MTPD`, 'var(--grid)')}
    </div>
    <div class="grid g2">
      ${card('CAPEX breakdown', 'Crore INR', '<div class="chart tall" id="chCapex"></div>')}
      ${card('Levelised cost build-up', 'INR per kg NH₃', '<div class="chart tall" id="chLcoa"></div>')}
    </div>
    ${card('Project cash flows', 'Crore INR, nominal', '<div class="chart" id="chCf"></div>', '', 'mt')}
    <div class="note mt">Screening economics consistent with the unit rates and conventions of <code>financial_model.py</code> (CRF-levelised cost, straight-line book depreciation for tax, equal-principal debt). Use the Python model for the lender-grade schedule (WDV tax depreciation, MAT, DSRA, working capital, sculpting).</div>`;
    const t = theme();
    const pal = { 'Solar PV': t.solar, 'Wind': t.wind, 'BESS': t.bess, 'Electrolyser - PEM': '#4CAF50', 'Electrolyser - Alkaline': t.h2, 'H2 Storage': '#81C784', 'Ammonia Loop': t.nh3, 'BOP': '#7E8F9E', 'Others': '#B7C2BA', 'Evacuation': '#C9A227' };
    const items = Object.entries(f.sec).filter(([, v]) => v > 0).map(([k, v]) => ({ name: k, value: +v.toFixed(1), itemStyle: { color: pal[k] } }));
    items.push({ name: 'Soft costs + land + IDC', value: +(f.soft + f.land + f.idc).toFixed(1), itemStyle: { color: '#D9C7A0' } });
    chart('chCapex', { ...baseOpt(), tooltip: { trigger: 'item', formatter: '{b}: {c} Cr ({d}%)' }, legend: { type: 'scroll', orient: 'vertical', right: 0, top: 'middle', width: '38%', textStyle: { color: t.text, fontSize: 11 }, formatter: (n) => { const it = items.find(x => x.name === n); return `${n}  ${it ? fmt(it.value / f.capex * 100, 1) + '%' : ''}`; } },
      series: [{ type: 'pie', radius: ['38%', '62%'], center: ['26%', '52%'], itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 4 }, label: { show: false }, data: items }],
      title: { text: fmt(f.capex, 0), subtext: 'Crore INR', left: '25.5%', top: '44%', textAlign: 'center', textStyle: { color: t.textMain, fontSize: 20, fontWeight: 700 }, subtextStyle: { color: t.text, fontSize: 11 }, itemGap: 2 } });
    const kg = a.nh3 * 1000 * S.fin.Plant_Availability_Percent / 100;
    const comps = Object.entries(f.sec).filter(([, v]) => v > 0).map(([k, v]) => [k, v * (f.capex / f.epc) * f.crf * 1e7 / kg]);
    comps.push(['OPEX & replacements', f.annOpex * 1e7 / kg]);
    let acc = 0; const base = [], val = [];
    comps.forEach(([, v]) => { base.push(+acc.toFixed(2)); val.push(+v.toFixed(2)); acc += v; });
    chart('chLcoa', baseOpt({ xAxis: { type: 'category', data: comps.map(c => c[0]).concat(['LCOA']), axisLabel: { interval: 0, rotate: 32, fontSize: 10 } }, yAxis: { type: 'value', name: 'INR/kg' }, grid: { left: 50, right: 16, top: 30, bottom: 96 }, legend: { show: false },
      tooltip: { trigger: 'axis', formatter: (p) => { const x = p.find(s => s.seriesName === 'v'); return x ? `${x.name}: ${fmt(x.value, 2)} INR/kg` : ''; } },
      series: [{ name: 'b', type: 'bar', stack: 'w', data: base.concat([0]), itemStyle: { color: 'transparent' } },
        { name: 'v', type: 'bar', stack: 'w', data: val.map((v, i) => ({ value: v, itemStyle: { color: pal[comps[i][0]] || t.grid2, borderRadius: 3 } })).concat([{ value: +acc.toFixed(2), itemStyle: { color: t.green, borderRadius: 3 } }]), label: { show: true, position: 'top', fontSize: 10, color: t.text, formatter: (p) => p.value >= 0.5 ? fmt(p.value, 1) : '' } }] }));
    const yrs = ['C1'].concat(S.fin.Construction_Period_Years > 1 ? ['C2'] : []).concat(f.rows.map(r => 'Y' + r.yr));
    let cum = 0; const cumA = f.cf.map(x => +(cum += x).toFixed(0));
    chart('chCf', baseOpt({ xAxis: { type: 'category', data: yrs.slice(0, f.cf.length) }, yAxis: [{ type: 'value', name: 'Cr' }, { type: 'value', name: 'cumulative', splitLine: { show: false } }], grid: { left: 60, right: 66, top: 52, bottom: 30 },
      series: [{ name: 'Revenue', type: 'bar', data: new Array(f.cf.length - f.rows.length).fill(0).concat(f.rows.map(r => +r.rev.toFixed(0))), itemStyle: { color: t.green, opacity: .35 } },
        { name: 'Free cash flow', type: 'bar', data: f.cf.map(x => ({ value: +x.toFixed(0), itemStyle: { color: x >= 0 ? t.green : t.curt } })) },
        { name: 'Cumulative', type: 'line', yAxisIndex: 1, data: cumA, smooth: true, symbol: 'none', lineStyle: { color: t.gold, width: 2.5 }, itemStyle: { color: t.gold } }] }));
  }

  /* =================================================================
   *  PAGE 7 — SIZING EXPLORER & SENSITIVITY
   * ================================================================= */
  const EXP_PARAMS = [['Solar_Capacity_MWp', 'Solar capacity (MWp)'], ['Wind_Capacity_MWp', 'Wind capacity (MW)'], ['Electrolyzer_Design_MW', 'Electrolyser rating (MW)'], ['BESS_Total_MWh', 'BESS energy (MWh)'], ['Hydrogen_Storage_Ton', 'H₂ storage (t)'], ['Derivative_Storage_Capacity_Ton', 'NH₃ tank (t)'], ['Electrolyzer_PEM_ratio', 'PEM share (–)']];
  const METRICS = { lcoa: ['LCOA (INR/kg)', (r, f) => f.lcoa, 'min'], nh3: ['NH₃ production (t/yr)', (r) => r.annual.nh3, 'max'], ful: ['Offtake fulfilment (%)', (r) => r.annual.offtakeDue > 0 ? r.annual.offtakeDispatched / r.annual.offtakeDue * 100 : 100, 'max'], eirr: ['Equity IRR (%)', (r, f) => f.eirr * 100, 'max'], curt: ['Curtailment (%)', (r) => r.annual.curtailed / Math.max(1, r.annual.re) * 100, 'min'], sd: ['Shutdowns (/yr)', (r) => r.annual.shutdowns, 'min'] };
  function renderExplore() {
    const pOpt = EXP_PARAMS;
    $('#page-explore').innerHTML = `
    ${card('Two-parameter sizing map', 'Every cell is a full 8760 h simulation with economics', `
      <div class="grid g4" style="align-items:end">
        ${U.field('explore', ['x', 'X parameter', '', { type: 'sel', options: pOpt }])}${U.field('explore', ['x0', 'X from', '', { step: 'any' }])}${U.field('explore', ['x1', 'X to', '', { step: 'any' }])}${U.field('explore', ['nx', 'X steps', '', { step: 1, min: 2, max: 15 }])}
        ${U.field('explore', ['y', 'Y parameter', '', { type: 'sel', options: pOpt }])}${U.field('explore', ['y0', 'Y from', '', { step: 'any' }])}${U.field('explore', ['y1', 'Y to', '', { step: 'any' }])}${U.field('explore', ['ny', 'Y steps', '', { step: 1, min: 2, max: 15 }])}
        ${U.field('explore', ['metric', 'Metric', '', { type: 'sel', options: Object.entries(METRICS).map(([k, v]) => [k, v[0]]) }])}
        <div class="row-flex" style="grid-column:span 3"><button class="btn primary" id="btnMap">${IC.play}Run sizing map</button><span class="small muted" id="mapInfo"></span></div>
      </div>
      <div class="grid mt" style="grid-template-columns:minmax(0,1fr) 300px"><div class="chart xtall" id="chMap"></div><div id="mapBest"></div></div>`)}
    ${card('Tornado sensitivity on LCOA', '±20 % on key technical and commercial drivers', '<div class="row-flex mb"><button class="btn" id="btnTor">' + IC.play + 'Run sensitivity</button><span class="small muted">Technical drivers re-run the hourly simulation.</span></div><div class="chart tall" id="chTor"></div>', '', 'mt')}`;
    $('#btnMap').onclick = runMap; $('#btnTor').onclick = runTornado;
  }
  function updateExplore() { if (!R.profile) $('#mapInfo') && ($('#mapInfo').textContent = 'Load a profile first.'); }
  async function runMap() {
    if (!R.profile) return toast('Load an RE profile first.');
    const E = S.explore, nx = Math.max(2, Math.min(15, Math.round(E.nx))), ny = Math.max(2, Math.min(15, Math.round(E.ny)));
    const xs = [...Array(nx).keys()].map(i => E.x0 + (E.x1 - E.x0) * i / (nx - 1)), ys = [...Array(ny).keys()].map(i => E.y0 + (E.y1 - E.y0) * i / (ny - 1));
    const [mName, mFn, dir] = METRICS[E.metric];
    const data = []; let best = null; const t0 = performance.now();
    busy(true, 'Running sizing map…', 0, `${nx * ny} simulations`);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const cfg = Object.assign({}, S.plant, { [E.x]: xs[i], [E.y]: ys[j] });
        const r = TRE.runPlant(cfg, R.profile.solar, R.profile.wind), f = TRE.runFinance(S.fin, r);
        const v = mFn(r, f);
        data.push([i, j, isFinite(v) ? +v.toFixed(2) : null]);
        if (isFinite(v) && (!best || (dir === 'min' ? v < best.v : v > best.v))) best = { v, x: xs[i], y: ys[j], r, f };
      }
      busy(true, null, (j + 1) / ny, `${(j + 1) * nx} / ${nx * ny} simulations`);
      await new Promise(r => setTimeout(r, 0));
    }
    busy(false);
    const t = theme(), vals = data.map(d => d[2]).filter(v => v != null);
    const lab = (k) => EXP_PARAMS.find(p => p[0] === k)[1];
    const fx = (x) => Math.abs(x) < 10 ? +x.toFixed(2) : Math.round(x);
    chart('chMap', { ...baseOpt(), tooltip: { formatter: (p) => `${lab(E.x)}: ${fx(xs[p.value[0]])}<br>${lab(E.y)}: ${fx(ys[p.value[1]])}<br><b>${mName}: ${fmt(p.value[2], 2)}</b>` },
      grid: { left: 70, right: 80, top: 20, bottom: 56 }, xAxis: { type: 'category', data: xs.map(fx), name: lab(E.x), nameLocation: 'middle', nameGap: 32, axisLabel: { color: t.text }, nameTextStyle: { color: t.text } },
      yAxis: { type: 'category', data: ys.map(fx), name: lab(E.y), nameLocation: 'middle', nameGap: 52, axisLabel: { color: t.text }, nameTextStyle: { color: t.text } },
      visualMap: { min: Math.min(...vals), max: Math.max(...vals), calculable: true, right: 4, top: 'center', textStyle: { color: t.text }, inRange: { color: dir === 'min' ? ['#1E8E4E', '#9BD08A', '#FFE38A', '#F59E5B', '#D9483B'] : ['#D9483B', '#F59E5B', '#FFE38A', '#9BD08A', '#1E8E4E'] } },
      series: [{ type: 'heatmap', data, label: { show: nx * ny <= 100, fontSize: 10, color: '#13201A', formatter: (p) => p.value[2] == null ? '' : (Math.abs(p.value[2]) >= 1000 ? fmt(p.value[2] / 1000, 1) + 'k' : fmt(p.value[2], 1)) }, itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 4 } }] });
    $('#mapInfo').textContent = `${nx * ny} simulations in ${fmt((performance.now() - t0) / 1000, 1)} s`;
    if (best) {
      $('#mapBest').innerHTML = `<div class="kpi" style="--accent:var(--gold)"><div class="l">Best ${esc(mName)}</div><div class="v">${fmt(best.v, 2)}</div><div class="s">${esc(lab(E.x))} = ${fx(best.x)}<br>${esc(lab(E.y))} = ${fx(best.y)}</div></div>
        <table class="t mt"><tbody><tr><td>NH₃</td><td class="n">${fmt(best.r.annual.nh3)} t</td></tr><tr><td>LCOA</td><td class="n">${fmt(best.f.lcoa, 1)} INR/kg</td></tr><tr><td>Fulfilment</td><td class="n">${pct(best.r.annual.offtakeDispatched / Math.max(1, best.r.annual.offtakeDue))}</td></tr><tr><td>Curtailment</td><td class="n">${pct(best.r.annual.curtailed / Math.max(1, best.r.annual.re))}</td></tr><tr><td>Equity IRR</td><td class="n">${pct(best.f.eirr)}</td></tr></tbody></table>
        <button class="btn gold mt" id="btnApply" style="width:100%">${IC.check}Apply to plant design</button>`;
      $('#btnApply').onclick = () => { S.plant[E.x] = +fx(best.x); S.plant[E.y] = +fx(best.y); S.plantCase = '__custom'; U.persist(); rendered.plant = false; computePlant(); toast('Applied — see Plant Simulation'); };
    }
  }
  async function runTornado() {
    if (!R.profile) return toast('Load an RE profile first.');
    const base = R.fin.lcoa, d = 0.2;
    const tests = [
      ['Solar CAPEX', 'fin', 'SolarPV_Cost_Per_MWp'], ['Electrolyser CAPEX', 'fin', ['PEM_Cost_Per_MW', 'Alkaline_Cost_Per_MW']], ['NH₃ loop CAPEX', 'fin', 'AmmoniaLoop_BaseCost'], ['BESS CAPEX', 'fin', 'BESS_Cost_Per_MWh'],
      ['Cost of equity', 'fin', 'Cost_of_Equity_Percent'], ['Interest rate', 'fin', 'Interest_Rate_Percent'], ['Solar yield', 'yield', 'solar'], ['Electrolyser kWh/kg', 'plant', ['PEM_Efficiency_kWhPERkg', 'Alkaline_Efficiency_kWhPERkg']],
      ['Solar capacity', 'plant', 'Solar_Capacity_MWp'], ['Electrolyser rating', 'plant', 'Electrolyzer_Design_MW']
    ];
    busy(true, 'Running sensitivity…', 0, '');
    const res = [];
    for (let k = 0; k < tests.length; k++) {
      const [name, kind, keys] = tests[k]; const out = [];
      for (const s of [-d, d]) {
        const fin = Object.assign({}, S.fin), plant = Object.assign({}, S.plant);
        let sol = R.profile.solar;
        [].concat(keys).forEach(key => { if (kind === 'fin') fin[key] *= 1 + s; if (kind === 'plant') plant[key] *= 1 + s; });
        if (kind === 'yield') sol = R.profile.solar.map(x => x * (1 + s));
        const r = kind === 'fin' ? R.plant : TRE.runPlant(plant, sol, R.profile.wind);
        out.push(TRE.runFinance(fin, r).lcoa);
      }
      res.push([name, out[0] - base, out[1] - base]);
      busy(true, null, (k + 1) / tests.length, name); await new Promise(r => setTimeout(r, 0));
    }
    busy(false);
    res.sort((a, b) => Math.max(Math.abs(a[1]), Math.abs(a[2])) - Math.max(Math.abs(b[1]), Math.abs(b[2])));
    const t = theme();
    chart('chTor', baseOpt({ tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p) => `${p[0].name}<br>${p.map(s => `${s.seriesName}: ${s.value >= 0 ? '+' : ''}${fmt(s.value, 2)} INR/kg`).join('<br>')}` },
      grid: { left: 150, right: 40, top: 52, bottom: 30 }, xAxis: { type: 'value', name: 'Δ LCOA INR/kg' }, yAxis: { type: 'category', data: res.map(r => r[0]) },
      series: [{ name: '−20 %', type: 'bar', stack: 't', data: res.map(r => +r[1].toFixed(2)), itemStyle: { color: t.green, borderRadius: 3 } }, { name: '+20 %', type: 'bar', stack: 't2', barGap: '-100%', data: res.map(r => +r[2].toFixed(2)), itemStyle: { color: t.curt, borderRadius: 3 } }],
      title: { text: `Base LCOA ${fmt(base, 2)} INR/kg`, right: 10, bottom: 34, textStyle: { fontSize: 12, color: t.text, fontWeight: 600 } } }));
  }

  /* =================================================================
   *  PAGE 8 — METHODOLOGY
   * ================================================================= */
  function renderDocs() {
    $('#page-docs').innerHTML = `<div class="card"><div class="bd doc">
      <h2 style="margin-top:4px">Workflow</h2>
      <p>The studio converts a site location into an hourly 8760 generation profile for solar PV and wind, expressed in <b>% kW/kWp</b> (energy at the point of interconnection per unit of installed capacity), and runs the hourly green-hydrogen / ammonia dispatch on that profile. The profile can alternatively be supplied through the Excel template or a PVsyst hourly export. All computation runs locally in the browser.</p>
      <h2>Meteorological data</h2>
      <ul>
        <li><b>ERA5 reanalysis</b> (ECMWF, via the Open-Meteo archive API): hourly GHI, DNI, DHI, 2 m temperature, surface pressure, 10 m and 100 m wind speed, 100 m wind direction; 0.25° grid, 1940 to present. Radiation is a backward hourly mean; state variables are averaged to the interval mid-point.</li>
        <li><b>NASA POWER</b> (CERES SYN1deg irradiance, MERRA-2 meteorology): hourly GHI, DNI, DHI, T2M, PS, 10 m and 50 m wind; 2001 to present.</li>
        <li>Physics is evaluated on the native UTC intervals with the sun position at the interval mid-point, then resampled to <b>hour-beginning local standard time</b> (fractional offsets such as IST +5:30 are interpolated). 29 February is removed.</li>
        <li><b>Typical meteorological year:</b> Sandia method — for each calendar month the candidate year with the lowest weighted Finkelstein–Schafer statistic (daily GHI, DNI, mean/max/min temperature and hub-height wind) is selected. The same year is used for solar and wind in a month, preserving their co-variability for dispatch.</li>
        <li><b>Exceedance:</b> Pxx = P50 · (1 − z·√(σ<sub>IAV</sub>² + σ<sub>unc</sub>²)); σ<sub>IAV</sub> from the per-year yields of the downloaded period, σ<sub>unc</sub> user-defined (resource + model). The 10-year value uses σ<sub>IAV</sub>/√10.</li>
      </ul>
      <h2>Solar PV model (PVsyst-type sequence)</h2>
      <ul>
        <li>Solar geometry: NOAA algorithm; Kasten–Young air mass; beam closure DNI = (GHI − DHI)/cos Z.</li>
        <li>Transposition: Perez 1990 (all-sites composite coefficients), Hay–Davies or isotropic; ground-reflected with user albedo.</li>
        <li>Mounting: fixed tilt or horizontal single-axis tracker with backtracking (true-tracking angle and GCR-based correction).</li>
        <li>Near shading: 2-D infinite-row geometry — beam shaded fraction f<sub>s</sub> = 1 − sin α<sub>p</sub>/(GCR·sin(α<sub>p</sub>+β)); sky-view reduction by the front row; optional electrical shading multiplier.</li>
        <li>IAM: Fresnel/physical model (refractive index, AR coating) or ASHRAE b₀; diffuse and ground IAM at Brandemuehl–Beckman effective angles. Monthly soiling.</li>
        <li>Bifacial: rear irradiance from ground-reflected beam (with row shadow fraction) and diffuse light through a calibrated 2-D view factor, bifaciality, rear shading and rear mismatch.</li>
        <li>Thermal: PVsyst balance T<sub>c</sub> = T<sub>a</sub> + α·G·(1−η)/(U<sub>c</sub> + U<sub>v</sub>·v). Power: linear temperature coefficient and log-linear low-irradiance efficiency.</li>
        <li>DC: module quality, LID/LeTID, degradation (year N or 25-year mean), mismatch, I²R ohmic loss. Inverter: CEC-curve efficiency, power threshold, clipping at P<sub>nom</sub>·f(T) with low-temperature overload and high-temperature derating.</li>
        <li>AC: LV ohmic, MV and HV transformer iron + copper losses, transmission line (I²R), daytime auxiliaries, availability and POI export limit. Night auxiliary consumption is reported separately.</li>
      </ul>
      <h2>Wind model</h2>
      <ul>
        <li>Vertical extrapolation by power law with a month × hour shear matrix derived from the two reanalysis heights (captures diurnal stability), an annual mean exponent, or a fixed value; optional calibration to a measured / Global Wind Atlas mean speed.</li>
        <li>Air density at hub from surface pressure and temperature (barometric and lapse-rate correction); IEC 61400-12-1 density normalisation v<sub>eq</sub> = v·(ρ/ρ₀)<sup>1/3</sup> for pitch-regulated turbines.</li>
        <li>Power curves: generic IEC-class turbines from rotor area, rated power and C<sub>p</sub>, smoothed by turbulence intensity, with soft or hard cut-out; or a custom tabulated curve.</li>
        <li>Losses in standard energy-yield categories: wake, availability, electrical, turbine performance, hysteresis, environmental, curtailment and degradation; high/low temperature derating evaluated hourly.</li>
      </ul>
      <h2>Plant simulation</h2>
      <p>A line-by-line JavaScript port of <code>technical_model.GreenAmmoniaTechnicalModel</code> (Rev9): hourly busbar cascade (ammonia loop → loop BESS → PEM/alkaline fleet with minimum load, ramp limits and merit order → electrolyser BESS → grid energy bank), look-ahead ride-through rationing, H₂ buffer, 72-hour cyclic warm-up, product tank with daily/monthly lifting and steady-state inventory cycling. On the four cases of <code>inputs.xlsx</code> with the sample profile it reproduces the Python results for NH₃, H₂, curtailment, shutdowns and offtake exactly. Minimum SOC limits of the batteries are enforced.</p>
      <h2>Excel template</h2>
      <p>Sheet <code>Efficiency</code>: row 5 headers <code>date | Solar Efficiency | Wind Efficiency</code>, row 6 units <code>% kW/kWp</code>, rows 7–8766 hourly values for a non-leap year (1990), plus Month/Day/Hour in columns G–I — identical to <code>RE_Production_Efficiency_data.xlsx</code>, so exported workbooks are read directly by the Python model. Exports add <code>Assumptions</code>, <code>Monthly</code> and <code>Hourly_Detail</code> sheets for traceability.</p>
      <h2>References</h2>
      <ul>
        <li>Perez R. et al. (1990) Modeling daylight availability and irradiance components from direct and global irradiance. Solar Energy 44(5).</li>
        <li>PVsyst SA, PVsyst 8 user manual — array thermal losses, IAM, ohmic, inverter and transformer loss models.</li>
        <li>Hersbach H. et al. (2020) The ERA5 global reanalysis. Q. J. R. Meteorol. Soc. 146. · NASA POWER project documentation.</li>
        <li>Wilcox S., Marion W. (2008) Users manual for TMY3 data sets, NREL/TP-581-43156 (Finkelstein–Schafer method).</li>
        <li>IEC 61400-12-1:2022 Power performance measurements of electricity producing wind turbines.</li>
        <li>Duffie J.A., Beckman W.A. Solar Engineering of Thermal Processes — effective incidence angles for diffuse radiation.</li>
      </ul>
    </div></div>`;
  }

  const RENDER = { site: renderSite, pv: renderPV, wind: renderWind, profile: renderProfile, plant: renderPlant, econ: renderEcon, explore: renderExplore, docs: renderDocs };
  const UPDATE = { site: updateSite, pv: updatePV, wind: updateWind, profile: updateProfile, plant: updatePlant, econ: updateEcon, explore: updateExplore };

  /* =================================================================
   *  FIELD CHANGE ROUTING
   * ================================================================= */
  U.onField((path, v, ev) => {
    const root = path.split('.')[0], key = path.split('.')[1];
    if (root === 'pv') {
      if (key === 'tech' && ev === 'change') { const t = TRE.PV_TECH[v]; Object.assign(S.pv, { gamma: t.gamma, etaModule: t.eta, lid: t.lid, lowLight: t.lowLight, quality: t.quality, bifaciality: t.bifi, bifacial: t.bifi > 0 }); }
      if (key === 'mounting' && ev === 'change') { if (v === 'tracker') { S.pv.gcr = 0.33; S.pv.rearViewFactor = 0.62; S.pv.Uc = 29; } else { S.pv.gcr = 0.40; S.pv.rearViewFactor = 0.50; } }
      if (ev === 'change' && ['tech', 'mounting', 'bifacial', 'iamModel', 'degrBasis', 'backtracking'].includes(key)) { const f = $('#pvForm'); const open = $$('#pvForm details').map(d => d.open); f.innerHTML = pvForm(); $$('#pvForm details').forEach((d, i) => d.open = open[i]); }
      schedule(0);
    } else if (root === 'wind') {
      if (key === 'model' && ev === 'change' && TRE.WTG_LIB[v]) { S.wind.hub = TRE.WTG_LIB[v].hub; S.wind.cp = TRE.WTG_LIB[v].cp; }
      if (ev === 'change' && ['model', 'shearMode', 'targetMean'].includes(key)) { const open = $$('#wForm details').map(d => d.open); $('#wForm').innerHTML = windForm(); $$('#wForm details').forEach((d, i) => d.open = open[i]); }
      schedule(0);
    } else if (root === 'res') {
      if (key === 'basis' && ev === 'change') srcPanel();
      if (R.weather && ['basis', 'year', 'wGhi', 'wDni', 'wT', 'wWind'].includes(key)) schedule(0);
    } else if (root === 'site') {
      if ((key === 'lat' || key === 'lon') && ev === 'change') { setSite(S.site.lat, S.site.lon, true); map && map.setView([S.site.lat, S.site.lon]); }
      if (key === 'tz' && R.weather) schedule(0);
      chrome();
    } else if (root === 'prof') {
      schedule(1);
    } else if (root === 'plant') {
      if (ev === 'change' || ev === 'input') { if (S.plantCase !== '__custom' && TRE.PLANT_CASES[S.plantCase] && key in TRE.PLANT_CASES[S.plantCase]) { S.plantCase = '__custom'; const cs = $('#caseSel'); if (cs) cs.value = '__custom'; } }
      schedule(2);
    } else if (root === 'fin') schedule(3);
  });

  /* =================================================================
   *  PROJECT FILES, THEME, BOOT
   * ================================================================= */
  function saveProject() {
    const data = JSON.parse(JSON.stringify(S)); data.savedAt = new Date().toISOString(); data.app = 'TrueRE Hybrid Studio';
    U.download(`${(S.site.project || 'project').replace(/[^A-Za-z0-9]+/g, '_')}.trueRE.json`, new Blob([JSON.stringify(data)], { type: 'application/json' }));
    toast('Project saved (design, profile cache and uploads included)');
  }
  async function openProject(file) {
    try {
      const d = JSON.parse(await file.text());
      U.setS(U.mergeDeep(U.defaultState(), d));
      R.weather = null; R.re = null;
      Object.keys(rendered).forEach(k => rendered[k] = false);
      buildProfile(); computePlant(); go(S.page || 'site'); toast('Project opened');
    } catch (e) { toast('Not a valid project file: ' + e.message); }
  }
  function applyTheme(t) {
    if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
    U.disposeCharts(); const id = S.page; if (UPDATE[id]) UPDATE[id]();
  }
  function boot() {
    buildNav();
    if (S.theme) document.documentElement.setAttribute('data-theme', S.theme);
    $('#btnTheme').onclick = () => { const dark = (S.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark'; S.theme = dark ? 'light' : 'dark'; U.persist(); applyTheme(S.theme); };
    $('#btnSave').onclick = saveProject; $('#btnOpen').onclick = () => $('#fileProject').click();
    $('#fileProject').onchange = (e) => { if (e.target.files[0]) openProject(e.target.files[0]); e.target.value = ''; };
    $('#menuBtn').onclick = () => $('#side').classList.toggle('open');
    if (S.prof.srcSolar === 'model' && !S.cache) S.prof.srcSolar = 'sample';
    if (S.prof.srcWind === 'model' && !S.cache) S.prof.srcWind = 'sample';
    buildProfile(); computePlant();
    go(S.page || 'site');
  }
  window.TRE_APP = { go, useSample: () => { S.prof.srcSolar = 'sample'; S.prof.srcWind = 'sample'; U.persist(); buildProfile(); computePlant(); refresh(); }, state: S, R, recomputeAll, refresh };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
