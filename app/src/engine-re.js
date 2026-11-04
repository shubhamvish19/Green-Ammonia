/* =====================================================================
 * TrueRE Hybrid Studio — Renewable resource & energy-yield engine
 *   Solar: NOAA solar position, Perez-1990 / Hay-Davies transposition,
 *          row-to-row shading, IAM, soiling, PVsyst thermal model,
 *          low-irradiance, bifacial rear gain, DC/AC loss chain,
 *          CEC-curve inverter with clipping & thermal derating,
 *          AC / MV / HV losses, availability, POI limit.
 *   Wind:  dual-height shear (month x hour matrix), air-density
 *          correction (IEC 61400-12-1), smoothed power curves,
 *          temperature derating, wake/availability/electrical losses.
 *   Resource: Open-Meteo (ERA5) & NASA POWER hourly fetchers,
 *          UTC -> local standard time resampling, Sandia-type TMY
 *          (Finkelstein-Schafer), P50 / P90 statistics.
 * ===================================================================== */
(function (G) {
  'use strict';
  const D2R = Math.PI / 180, R2D = 180 / Math.PI, HOUR = 3600e3;
  const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  /* ---------------- calendar for a non-leap 8760 h year --------------- */
  const CAL = (() => {
    const month = new Uint8Array(8760), day = new Uint8Array(8760), hour = new Uint8Array(8760), doy = new Uint16Array(8760);
    let i = 0;
    for (let m = 0; m < 12; m++) for (let d = 1; d <= MONTH_DAYS[m]; d++) for (let h = 0; h < 24; h++) {
      month[i] = m + 1; day[i] = d; hour[i] = h; doy[i] = Math.floor(i / 24) + 1; i++;
    }
    return { month, day, hour, doy, n: 8760 };
  })();

  /* ---------------- solar geometry (NOAA) ---------------------------- */
  function solarPosition(tMs, lat, lon) {
    const d = new Date(tMs);
    const y = d.getUTCFullYear();
    const start = Date.UTC(y, 0, 1);
    const doy = Math.floor((tMs - start) / 86400e3) + 1;
    const hr = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
    const ndays = ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 366 : 365;
    const g = 2 * Math.PI / ndays * (doy - 1 + (hr - 12) / 24);
    const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const tst = hr * 60 + eqt + 4 * lon;
    const ha = (tst / 4 - 180) * D2R;
    const phi = lat * D2R;
    let cosz = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
    cosz = clamp(cosz, -1, 1);
    const zen = Math.acos(cosz) * R2D;
    let az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) * R2D + 180;
    az = ((az % 360) + 360) % 360;
    const E0 = 1367 * (1 + 0.033 * Math.cos(2 * Math.PI * doy / ndays));
    return { zen, az, cosz, E0, doy };
  }
  function airMassKY(zen) {
    if (zen >= 90) return 38;
    return 1 / (Math.cos(zen * D2R) + 0.50572 * Math.pow(96.07995 - zen, -1.6364));
  }

  /* ---------------- Perez 1990 coefficients -------------------------- */
  const PEREZ_EPS = [1.065, 1.23, 1.5, 1.95, 2.8, 4.5, 6.2];
  const PEREZ = {
    f11: [-0.008, 0.130, 0.330, 0.568, 0.873, 1.132, 1.060, 0.678],
    f12: [0.588, 0.683, 0.487, 0.187, -0.392, -1.237, -1.600, -0.327],
    f13: [-0.062, -0.151, -0.221, -0.295, -0.362, -0.412, -0.359, -0.250],
    f21: [-0.060, -0.019, 0.055, 0.109, 0.226, 0.288, 0.264, 0.156],
    f22: [0.072, 0.066, -0.064, -0.152, -0.462, -0.823, -1.127, -1.377],
    f23: [-0.022, -0.029, -0.026, -0.014, 0.001, 0.056, 0.131, 0.251]
  };
  /** Sky-diffuse components on a tilted plane: {iso, circ, hor} W/m2 */
  function skyDiffuse(model, tilt, cosAOI, zen, dhi, dni, E0, am) {
    const ct = Math.cos(tilt * D2R), st = Math.sin(tilt * D2R);
    if (dhi <= 0) return { iso: 0, circ: 0, hor: 0 };
    const a = Math.max(0, cosAOI), b = Math.max(Math.cos(85 * D2R), Math.cos(zen * D2R));
    if (model === 'iso') return { iso: dhi * (1 + ct) / 2, circ: 0, hor: 0 };
    if (model === 'hay') {
      const Ai = clamp(dni / E0, 0, 1);
      return { iso: dhi * (1 - Ai) * (1 + ct) / 2, circ: dhi * Ai * a / b, hor: 0 };
    }
    const z = zen * D2R, k = 1.041;
    const eps = ((dhi + dni) / dhi + k * z * z * z) / (1 + k * z * z * z);
    let bin = 0; while (bin < 7 && eps >= PEREZ_EPS[bin]) bin++;
    const delta = dhi * am / E0;
    const F1 = Math.max(0, PEREZ.f11[bin] + PEREZ.f12[bin] * delta + PEREZ.f13[bin] * z);
    const F2 = PEREZ.f21[bin] + PEREZ.f22[bin] * delta + PEREZ.f23[bin] * z;
    const iso = dhi * (1 - F1) * (1 + ct) / 2, circ = dhi * F1 * a / b, hor = dhi * F2 * st;
    // guard against negative total
    const tot = iso + circ + hor;
    if (tot < 0) return { iso: 0, circ: 0, hor: 0 };
    return { iso, circ, hor };
  }

  /* ---------------- incidence angle modifiers ------------------------ */
  function makeIAM(p) {
    if (p.iamModel === 'fresnel') {
      const n = p.iamN || 1.526, K = 4, L = 0.002;
      const tau = (th) => {
        const t = Math.max(th, 1e-6) * D2R;
        const tr = Math.asin(Math.sin(t) / n);
        const rs = Math.pow(Math.sin(tr - t), 2) / Math.pow(Math.sin(tr + t), 2);
        const rp = Math.pow(Math.tan(tr - t), 2) / Math.pow(Math.tan(tr + t), 2);
        return Math.exp(-K * L / Math.cos(tr)) * (1 - 0.5 * (rs + rp));
      };
      const t0 = Math.exp(-K * L) * (1 - Math.pow((n - 1) / (n + 1), 2));
      const tbl = new Float64Array(91);
      for (let i = 0; i <= 90; i++) tbl[i] = i >= 90 ? 0 : clamp(tau(i) / t0, 0, 1);
      return (th) => { if (th >= 90) return 0; const i = Math.floor(th), f = th - i; return tbl[i] * (1 - f) + tbl[Math.min(90, i + 1)] * f; };
    }
    const b0 = p.iamB0 == null ? 0.05 : p.iamB0;
    return (th) => { if (th >= 90) return 0; const c = Math.cos(th * D2R); return clamp(1 - b0 * (1 / Math.max(c, 1e-3) - 1), 0, 1); };
  }
  // Brandemuehl & Beckman effective incidence angles for diffuse
  const effAngleSky = (b) => 59.7 - 0.1388 * b + 0.001497 * b * b;
  const effAngleGnd = (b) => 90 - 0.5788 * b + 0.002693 * b * b;

  /* ---------------- PV technology presets ---------------------------- */
  const PV_TECH = {
    topcon: { label: 'n-type TOPCon (bifacial glass-glass)', gamma: -0.29, eta: 0.225, lid: 0.5, lowLight: -1.8, bifi: 0.80, quality: -0.4 },
    perc:   { label: 'p-type Mono PERC (bifacial)',           gamma: -0.35, eta: 0.212, lid: 1.5, lowLight: -2.5, bifi: 0.70, quality: -0.3 },
    hjt:    { label: 'Heterojunction HJT (bifacial)',          gamma: -0.26, eta: 0.228, lid: 0.3, lowLight: -1.5, bifi: 0.85, quality: -0.4 },
    cdte:   { label: 'CdTe thin film (monofacial)',            gamma: -0.28, eta: 0.192, lid: 0.0, lowLight: -1.0, bifi: 0.00, quality: 0.0 }
  };

  /* ---------------- default PV design (PVsyst-like) ------------------ */
  function defaultPV(lat) {
    const north = lat >= 0;
    return {
      mounting: 'fixed', tilt: Math.round(Math.min(40, Math.abs(lat) * 0.76 + 3.1)), azimuth: north ? 180 : 0,
      gcr: 0.40, trackerMax: 55, backtracking: true, axisAzimuth: 180,
      transposition: 'perez', albedo: 0.20,
      tech: 'topcon', gamma: -0.29, etaModule: 0.225, lowLight: -1.8,
      bifacial: true, bifaciality: 0.80, rearShading: 5, rearMismatch: 10, rearViewFactor: 0.60,
      iamModel: 'fresnel', iamN: 1.30, iamB0: 0.05,
      soiling: [3, 3, 3, 3.5, 4, 2, 1, 1, 1.5, 2, 2.5, 3],
      shadingElec: 1.0, horizonLoss: 0.0,
      Uc: 29, Uv: 0, alphaAbs: 0.9,
      quality: -0.4, lid: 0.5, mismatch: 1.0, dcOhmic: 1.5, degrFirst: 0.0, degrAnnual: 0.4, degrBasis: 'year1', opYear: 1,
      dcac: 1.40, invEta: 98.6, invThreshold: 0.5, invPmaxCold: 1.00, invTnom: 50, invDerateSlope: 2.0,
      acOhmic: 0.6, mvIron: 0.10, mvCopper: 1.0, nightDisconnect: true,
      hvIron: 0.05, hvCopper: 0.5, lineLoss: 1.0,
      auxDay: 0.4, auxNight: 0.15, availability: 99.0, poiLimit: 100
    };
  }

  /* ---------------- PV simulation on native (UTC) weather ------------ */
  /** weather: {t0, n, ghi, dni, dhi, temp, ws10, lat, lon}  (interval-start UTC timestamps, 1 h)
   *  returns {p: Float64Array kW/kWp net at POI, nightAux kW/kWp, ...diagnostics, loss: {...} kWh/kWp sums} */
  function simulatePV(w, p) {
    const n = w.n, lat = w.lat, lon = w.lon;
    const out = new Float64Array(n), poaArr = new Float64Array(n), geffArr = new Float64Array(n), tcArr = new Float64Array(n), edcArr = new Float64Array(n);
    const iam = makeIAM(p);
    const L = { ghi: 0, poa: 0, horizon: 0, nearShade: 0, iamL: 0, soilL: 0, geffFront: 0, rear: 0, bifGain: 0, stc: 0,
      irrLevel: 0, temp: 0, shadeElec: 0, quality: 0, lid: 0, degr: 0, mismatch: 0, ohmic: 0, earray: 0,
      invOp: 0, invClip: 0, invThr: 0, invTemp: 0, eInv: 0, acOhm: 0, mvTr: 0, hvTr: 0, line: 0, aux: 0, avail: 0, poi: 0, egrid: 0, nightAux: 0, hours: 0 };
    const gcr = clamp(p.gcr, 0.05, 0.95);
    const g = p.gamma / 100, k200 = p.lowLight / 100, ln02 = Math.log(0.2);
    const degrF = p.degrBasis === 'lifetime'
      ? (1 - p.degrFirst / 100) * (1 - p.degrAnnual / 100 * (24 / 2))   // 25-yr mean
      : (1 - p.degrFirst / 100) * Math.pow(1 - p.degrAnnual / 100, Math.max(0, p.opYear - 1));
    const fQual = 1 - p.quality / 100, fLid = 1 - p.lid / 100, fMis = 1 - p.mismatch / 100;
    const pac0 = 1 / p.dcac, etaN = p.invEta / 100, pdc0i = pac0 / etaN, pso = pdc0i * p.invThreshold / 100;
    const avail = p.availability / 100, poi = pac0 * p.poiLimit / 100;
    const bif = p.bifacial ? p.bifaciality : 0;
    const fHor = 1 - (p.horizonLoss || 0) / 100;
    let dateCache = -1, month = 0;
    for (let k = 0; k < n; k++) {
      const t = w.t0 + k * HOUR;
      const ghi = Math.max(0, w.ghi[k] || 0);
      const ta = w.temp[k] == null ? 25 : w.temp[k];
      if (ghi < 1) { out[k] = 0; L.nightAux += p.auxNight / 1000; continue; }
      const dayIdx = Math.floor(t / 86400e3);
      if (dayIdx !== dateCache) { dateCache = dayIdx; month = new Date(t).getUTCMonth(); }
      let sp = solarPosition(t + HOUR / 2, lat, lon);
      let zen = sp.zen;
      if (zen > 89.5) {
        // sunrise/sunset hour: evaluate at the sun-up part of the interval
        const a = solarPosition(t + HOUR * 0.75, lat, lon), b = solarPosition(t + HOUR * 0.25, lat, lon);
        sp = a.zen < b.zen ? a : b; zen = Math.min(sp.zen, 89.5);
      }
      const cosz = Math.cos(zen * D2R), az = sp.az;
      // closure: keep GHI, rebuild beam
      let dhi = clamp(w.dhi ? (w.dhi[k] || 0) : ghi, 0, ghi);
      let bh = ghi - dhi;
      let dni = cosz > 0.0872 ? bh / cosz : (w.dni ? Math.min(w.dni[k] || 0, bh / Math.max(cosz, 0.02)) : 0);
      dni = clamp(dni, 0, Math.min(sp.E0, 1150));
      bh = dni * cosz; dhi = ghi - bh;
      // ---- surface orientation
      let tilt, sAz, sunProjOK = true, alphaP = 90;
      if (p.mounting === 'tracker') {
        const ax = p.axisAzimuth * D2R;
        const sx = Math.sin(zen * D2R) * Math.sin(az * D2R), sy = Math.sin(zen * D2R) * Math.cos(az * D2R), sz = cosz;
        // component perpendicular to axis (horizontal axis)
        const xp = sx * Math.cos(ax) - sy * Math.sin(ax);
        let th = Math.atan2(xp, sz) * R2D;                // true-tracking rotation
        const thTrue = th;
        if (p.backtracking) {
          const temp = Math.min(Math.abs(Math.cos(thTrue * D2R)) / gcr, 1);
          const wid = Math.acos(temp) * R2D;
          th = thTrue - Math.sign(thTrue) * wid;
        }
        th = clamp(th, -p.trackerMax, p.trackerMax);
        tilt = Math.abs(th);
        sAz = th >= 0 ? (p.axisAzimuth + 90) % 360 : (p.axisAzimuth + 270) % 360;
        alphaP = 90 - Math.abs(thTrue);
      } else {
        tilt = p.tilt; sAz = p.azimuth;
        const c = Math.cos((az - sAz) * D2R);
        if (c <= 0) sunProjOK = false;
        else alphaP = 90 - Math.atan(Math.tan(zen * D2R) * c) * R2D;
      }
      const ct = Math.cos(tilt * D2R), st = Math.sin(tilt * D2R);
      const cosAOI = clamp(cosz * ct + Math.sin(zen * D2R) * st * Math.cos((az - sAz) * D2R), -1, 1);
      const aoi = Math.acos(cosAOI) * R2D;
      const am = airMassKY(zen);
      const sky = skyDiffuse(p.transposition, tilt, cosAOI, zen, dhi, dni, sp.E0, am);
      const beam = dni * Math.max(0, cosAOI) * fHor;
      const gnd = ghi * p.albedo * (1 - ct) / 2;
      const poa = beam + sky.circ * fHor + sky.iso + Math.max(sky.hor, -sky.iso) + gnd;
      // ---- near shading (row-to-row, 2-D infinite rows)
      let fs = 0;
      if (cosAOI > 0 && sunProjOK && tilt > 0.5 && !(p.mounting === 'tracker' && p.backtracking)) {
        const ap = Math.max(alphaP, 0.5) * D2R;
        fs = clamp(1 - Math.sin(ap) / (gcr * Math.sin(ap + tilt * D2R)), 0, 1);
      }
      // sky-view reduction by the row in front, averaged over the collector
      let vfIso = 1;
      if (tilt > 0.5) {
        let acc = 0; const tb = tilt * D2R;
        for (const u of [0.1, 0.3, 0.5, 0.7, 0.9]) {
          const psi = Math.atan((1 - u) * Math.sin(tb) / (1 / gcr - (1 - u) * Math.cos(tb)));
          acc += (1 + Math.cos(tb + psi)) / (1 + Math.cos(tb));
        }
        vfIso = acc / 5;
      }
      const beamS = beam * (1 - fs), circS = sky.circ * fHor * (1 - fs);
      const isoS = sky.iso * vfIso, horS = Math.max(sky.hor, -sky.iso) * vfIso, gndS = gnd * (1 - gcr);
      const poaShaded = beamS + circS + isoS + horS + gndS;
      // ---- IAM
      const iB = iam(aoi), iS = iam(effAngleSky(tilt)), iG = iam(effAngleGnd(tilt));
      const poaIam = (beamS + circS) * iB + (isoS + horS) * iS + gndS * iG;
      // ---- soiling
      const soil = 1 - (p.soiling[month] || 0) / 100;
      const gFront = poaIam * soil;
      // ---- bifacial rear irradiance
      let gRear = 0;
      if (bif > 0) {
        let shG = 0;
        if (sunProjOK || p.mounting === 'tracker') {
          const ap = Math.max(alphaP, 1) * D2R;
          shG = clamp(gcr * Math.sin(ap + tilt * D2R) / Math.sin(ap), 0, 1);
        }
        const gGround = bh * (1 - shG) + dhi * (1 - 0.6 * gcr);
        gRear = p.albedo * gGround * (1 + ct) / 2 * p.rearViewFactor + dhi * (1 - ct) / 2 * 0.9;
      }
      const gRearEff = gRear * bif * (1 - p.rearShading / 100) * (1 - p.rearMismatch / 100);
      const geff = gFront + gRearEff;
      // ---- DC power (per kWp)
      const pStc = geff / 1000;
      let etaRel = geff > 1 ? 1 + k200 * Math.log(Math.min(geff, 1000) / 1000) / ln02 : 0;
      etaRel = clamp(etaRel, 0, 1.0);
      const pIrr = pStc * etaRel;
      const tc = ta + p.alphaAbs * (gFront + gRear * 0.5) * (1 - p.etaModule) / (p.Uc + p.Uv * (w.ws10 ? (w.ws10[k] || 0) : 1));
      const pT = pIrr * (1 + g * (tc - 25));
      // electrical shading effect beyond geometric
      const beamShareShaded = (beam + sky.circ * fHor) > 0 && geff > 0 ? ((beam + sky.circ * fHor) * iB * soil) / Math.max(geff, 1) : 0;
      const elecF = fs > 0 ? clamp(1 - beamShareShaded * (Math.min(1, p.shadingElec * fs) - fs), 0, 1) : 1;
      const pE = pT * (p.shadingElec > 1 ? elecF : 1);
      const pQ = pE * fQual, pL = pQ * fLid, pD = pL * degrF, pM = pD * fMis;
      const ohm = p.dcOhmic / 100 * pM * pM; // fraction at STC x (P/Pstc)
      const pdc = Math.max(0, pM - ohm);
      // ---- inverter
      let pacUnc = 0, pac = 0, lThr = 0;
      if (pdc > pso) {
        const z = pdc / pdc0i;
        const eta = clamp(etaN / 0.9637 * (-0.0162 * z - 0.0059 / z + 0.9858), 0, 0.995);
        pacUnc = pdc * eta;
      } else lThr = pdc;
      let fT;
      if (ta <= 25) fT = p.invPmaxCold;
      else if (ta <= p.invTnom) fT = p.invPmaxCold + (1 - p.invPmaxCold) * (ta - 25) / Math.max(1, p.invTnom - 25);
      else fT = Math.max(0, 1 - p.invDerateSlope / 100 * (ta - p.invTnom));
      const clipNom = Math.min(pacUnc, pac0);
      pac = Math.min(pacUnc, pac0 * fT);
      const lClip = pacUnc - clipNom, lTemp = clipNom - pac;   // lTemp < 0 => overload gain
      // ---- AC side
      const r = pac / pac0;
      const lAc = p.acOhmic / 100 * pac * r;
      let pA = pac - lAc;
      const lMv = pA > 0 ? (p.mvIron / 100 * pac0 + p.mvCopper / 100 * pA * (pA / pac0)) : (p.nightDisconnect ? 0 : p.mvIron / 100 * pac0);
      let pB = pA - lMv;
      const lHv = pB > 0 ? (p.hvIron / 100 * pac0 + p.hvCopper / 100 * pB * (pB / pac0)) : 0;
      let pC = pB - lHv;
      const lLine = pC > 0 ? p.lineLoss / 100 * pC * (pC / pac0) : 0;
      let pDd = pC - lLine;
      const lAux = pDd > 0 ? Math.min(pDd, p.auxDay / 1000) : 0;
      let pEe = pDd - lAux;
      const pF = pEe * avail;
      const pG = Math.max(0, Math.min(pF, poi));
      out[k] = pG; poaArr[k] = poa; geffArr[k] = geff; tcArr[k] = tc; edcArr[k] = pdc;
      if (pG <= 0) L.nightAux += p.auxNight / 1000;
      // ---- loss accounting (kWh/m2 for irradiance, kWh/kWp for energy)
      L.ghi += ghi / 1000; L.poa += (beam / fHor + sky.circ + sky.iso + Math.max(sky.hor, -sky.iso) + gnd) / 1000;
      L.horizon += (beam / fHor + sky.circ - beam - sky.circ * fHor) / 1000;
      L.nearShade += (poa - poaShaded) / 1000; L.iamL += (poaShaded - poaIam) / 1000; L.soilL += (poaIam - gFront) / 1000;
      L.geffFront += gFront / 1000; L.rear += gRear / 1000; L.bifGain += gRearEff / 1000; L.stc += pStc;
      L.irrLevel += pStc - pIrr; L.temp += pIrr - pT; L.shadeElec += pT - pE; L.quality += pE - pQ; L.lid += pQ - pL;
      L.degr += pL - pD; L.mismatch += pD - pM; L.ohmic += pM - pdc; L.earray += pdc;
      L.invThr += lThr; L.invOp += (pdc > pso ? pdc - pacUnc : 0); L.invClip += lClip; L.invTemp += lTemp; L.eInv += pac;
      L.acOhm += lAc; L.mvTr += lMv; L.hvTr += lHv; L.line += lLine; L.aux += lAux; L.avail += pEe - pF; L.poi += Math.max(0, pF) - pG; L.egrid += pG;
      L.hours++;
    }
    return { p: out, poa: poaArr, geff: geffArr, tcell: tcArr, edc: edcArr, loss: L };
  }

  /* ---------------- wind turbine library & power curves -------------- */
  const WTG_LIB = {
    g27: { label: 'Generic 2.7 MW · D132 · IEC S (low wind)', prated: 2700, D: 132, vin: 3.0, vout: 22, cp: 0.47, hub: 120 },
    g33: { label: 'Generic 3.3 MW · D140 · IEC IIIA',          prated: 3300, D: 140, vin: 3.0, vout: 22, cp: 0.47, hub: 130 },
    g36: { label: 'Generic 3.6 MW · D150 · IEC S',             prated: 3600, D: 150, vin: 3.0, vout: 22, cp: 0.47, hub: 140 },
    g42: { label: 'Generic 4.2 MW · D158 · IEC S',             prated: 4200, D: 158, vin: 3.0, vout: 24, cp: 0.465, hub: 140 },
    g52: { label: 'Generic 5.2 MW · D163 · IEC IIIA',          prated: 5200, D: 163, vin: 3.0, vout: 25, cp: 0.46, hub: 150 },
    g62: { label: 'Generic 6.2 MW · D170 · IEC IIB',           prated: 6200, D: 170, vin: 3.0, vout: 25, cp: 0.455, hub: 150 }
  };
  function defaultWind() {
    return {
      model: 'g33', custom: '', hub: 130, cp: 0.47, ti: 10, softCutout: true,
      shearMode: 'matrix', alphaFixed: 0.20, speedScale: 1.0, targetMean: 0,
      densityCorr: true,
      tHigh: 40, tHighDerate: 80, tLow: -20,
      wake: 7.0, extWake: 0.0, availWTG: 97.0, availBOP: 99.5, availGrid: 99.5,
      elec: 2.5, perf: 2.0, hysteresis: 0.3, env: 1.0, curtail: 0.0, degr: 0.0
    };
  }
  /** Returns {v: Float64Array, p: Float64Array kW, prated} on 0.25 m/s grid, standard density */
  function powerCurve(wp) {
    const step = 0.25, N = 141, v = new Float64Array(N), P = new Float64Array(N);
    if (wp.model === 'custom' && wp.custom && wp.custom.trim()) {
      const pts = wp.custom.split(/\n|;/).map(s => s.trim().split(/[\s,\t]+/).map(Number)).filter(a => a.length >= 2 && isFinite(a[0]) && isFinite(a[1])).sort((a, b) => a[0] - b[0]);
      if (pts.length >= 3) {
        const pr = Math.max(...pts.map(q => q[1]));
        for (let i = 0; i < N; i++) {
          const x = i * step; v[i] = x;
          if (x < pts[0][0] || x > pts[pts.length - 1][0]) { P[i] = 0; continue; }
          let j = 0; while (j < pts.length - 2 && pts[j + 1][0] < x) j++;
          const [x0, y0] = pts[j], [x1, y1] = pts[j + 1];
          P[i] = Math.max(0, y0 + (y1 - y0) * (x - x0) / Math.max(1e-9, x1 - x0));
        }
        return { v, p: P, prated: pr, D: wp.customD || 140, label: 'Custom power curve' };
      }
    }
    const m = WTG_LIB[wp.model] || WTG_LIB.g33;
    const A = Math.PI * m.D * m.D / 4, cp = wp.cp || m.cp, ti = (wp.ti || 10) / 100;
    const base = new Float64Array(N);
    for (let i = 0; i < N; i++) { const x = i * step; v[i] = x; base[i] = x < m.vin ? 0 : Math.min(m.prated, 0.5 * 1.225 * A * cp * x * x * x / 1000); }
    for (let i = 0; i < N; i++) {
      const x = v[i];
      if (x < m.vin) { P[i] = 0; continue; }
      const s = Math.max(0.3, ti * x);
      let num = 0, den = 0;
      for (let j = 0; j < N; j++) { const d = (v[j] - x) / s; if (d > 4 || d < -4) continue; const wgt = Math.exp(-0.5 * d * d); num += wgt * (v[j] < m.vin ? 0 : base[j]); den += wgt; }
      P[i] = Math.min(m.prated, num / den);
      if (wp.softCutout) {
        if (x > m.vout - 2 && x <= m.vout + 5) P[i] = Math.min(P[i], m.prated * clamp(1 - 0.8 * (x - (m.vout - 2)) / 7, 0, 1));
        if (x > m.vout + 5) P[i] = 0;
      } else if (x >= m.vout) P[i] = 0;
    }
    return { v, p: P, prated: m.prated, D: m.D, label: m.label };
  }
  const curveAt = (pc, x) => { if (x <= 0) return 0; const f = x / 0.25, i = Math.floor(f); if (i >= pc.v.length - 1) return 0; const r = f - i; return pc.p[i] * (1 - r) + pc.p[i + 1] * r; };

  /** shear matrix month x hour(UTC index) */
  function shearMatrix(w) {
    const S = Array.from({ length: 12 }, () => new Float64Array(24)), C = Array.from({ length: 12 }, () => new Float64Array(24));
    let sum = 0, cnt = 0;
    if (!w.ws10 || !w.wsHi) return { S, mean: 0.14, ok: false };
    const lnH = Math.log(w.hHi / 10);
    for (let k = 0; k < w.n; k++) {
      const a = w.ws10[k], b = w.wsHi[k];
      if (!(a > 0.5 && b > 0.5)) continue;
      const al = clamp(Math.log(b / a) / lnH, -0.1, 0.6);
      const d = new Date(w.t0 + k * HOUR), m = d.getUTCMonth(), h = d.getUTCHours();
      S[m][h] += al; C[m][h]++; sum += al; cnt++;
    }
    const mean = cnt ? sum / cnt : 0.14;
    for (let m = 0; m < 12; m++) for (let h = 0; h < 24; h++) S[m][h] = C[m][h] ? S[m][h] / C[m][h] : mean;
    return { S, mean, ok: cnt > 0 };
  }

  function simulateWind(w, wp) {
    const n = w.n, out = new Float64Array(n), vhub = new Float64Array(n), rho = new Float64Array(n);
    const pc = powerCurve(wp);
    const sh = shearMatrix(w);
    const H = wp.hub, Href = w.hHi || 100;
    const lossF = (1 - wp.wake / 100) * (1 - wp.extWake / 100) * (wp.availWTG / 100) * (wp.availBOP / 100) * (wp.availGrid / 100)
      * (1 - wp.elec / 100) * (1 - wp.perf / 100) * (1 - wp.hysteresis / 100) * (1 - wp.env / 100) * (1 - wp.curtail / 100) * (1 - (wp.degr || 0) / 100);
    // first pass: hub-height speed
    let vs = 0;
    for (let k = 0; k < n; k++) {
      const ref = w.wsHi ? w.wsHi[k] : (w.ws10 ? w.ws10[k] * Math.pow(Href / 10, 0.14) : 0);
      let al;
      if (wp.shearMode === 'fixed') al = wp.alphaFixed;
      else if (wp.shearMode === 'mean') al = sh.mean;
      else { const d = new Date(w.t0 + k * HOUR); al = sh.S[d.getUTCMonth()][d.getUTCHours()]; }
      vhub[k] = Math.max(0, (ref || 0) * Math.pow(H / Href, al) * (wp.speedScale || 1));
      vs += vhub[k];
    }
    const meanV = vs / n;
    const cal = wp.targetMean > 0 && meanV > 0 ? wp.targetMean / meanV : 1;
    let gross = 0, net = 0, dens = 0, lossT = 0;
    const L = { grossIdeal: 0, density: 0, temp: 0, wake: 0, avail: 0, elec: 0, perf: 0, env: 0, curtail: 0, net: 0 };
    for (let k = 0; k < n; k++) {
      const v = vhub[k] * cal; vhub[k] = v;
      const T = (w.temp[k] == null ? 25 : w.temp[k]) - 0.0065 * (H - 2) + 273.15;
      const ps = (w.ps && w.ps[k] ? w.ps[k] : 1013.25 * Math.pow(1 - 2.25577e-5 * (w.elev || 0), 5.25588)) * 100;
      const pz = ps * Math.exp(-9.80665 * H / (287.05 * T));
      const r = pz / (287.05 * T); rho[k] = r; dens += r;
      const pStd = curveAt(pc, v) / pc.prated;
      let pr = wp.densityCorr ? curveAt(pc, v * Math.cbrt(r / 1.225)) / pc.prated : pStd;
      const tC = T - 273.15;
      let pt = pr;
      if (tC > wp.tHigh) pt = Math.min(pr, wp.tHighDerate / 100);
      if (tC < wp.tLow) pt = 0;
      const pn = pt * lossF;
      out[k] = pn;
      L.grossIdeal += pStd; L.density += pStd - pr; L.temp += pr - pt; L.net += pn;
      gross += pt;
    }
    // split aggregate losses for reporting (sequential, multiplicative)
    let e = gross;
    const take = (f) => { const l = e * f; e -= l; return l; };
    L.wake = take(1 - (1 - wp.wake / 100) * (1 - wp.extWake / 100));
    L.avail = take(1 - (wp.availWTG / 100) * (wp.availBOP / 100) * (wp.availGrid / 100));
    L.elec = take(wp.elec / 100);
    L.perf = take(1 - (1 - wp.perf / 100) * (1 - wp.hysteresis / 100));
    L.env = take(1 - (1 - wp.env / 100) * (1 - (wp.degr || 0) / 100));
    L.curtail = take(wp.curtail / 100);
    return { p: out, vhub, rho, curve: pc, shear: sh, meanV: meanV * cal, calFactor: cal, meanRho: dens / n, loss: L };
  }

  /* ---------------- statistics helpers -------------------------------- */
  function weibullFit(arr) {
    let s = 0, s2 = 0, c = 0;
    for (const x of arr) { if (x > 0) { s += x; s2 += x * x; c++; } }
    const mu = s / c, sd = Math.sqrt(Math.max(1e-9, s2 / c - mu * mu));
    const k = Math.pow(sd / mu, -1.086);
    const A = mu / gammaFn(1 + 1 / k);
    return { k, A, mean: mu };
  }
  function gammaFn(z) { // Lanczos
    const gC = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z));
    z -= 1; let x = 0.99999999999980993; for (let i = 0; i < 8; i++) x += gC[i] / (z + i + 1);
    const t = z + 7.5; return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
  }

  /* ---------------- UTC -> local standard time ----------------------- */
  /** shift a native series (index 0 starts at t0 UTC) to local hours of `year` (8760, Feb-29 removed). */
  function toLocalYear(arr, t0, tz, year) {
    const out = new Float64Array(8760);
    const startLocalUTC = Date.UTC(year, 0, 1) - tz * HOUR;
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    let j = 0;
    for (let h = 0; h < (isLeap ? 8784 : 8760); h++) {
      if (isLeap && h >= 59 * 24 && h < 60 * 24) continue;   // drop 29-Feb
      const x = (startLocalUTC + h * HOUR - t0) / HOUR;
      const i = Math.floor(x), f = x - i;
      const a = arr[i], b = arr[i + 1];
      out[j++] = (a == null || isNaN(a)) ? (b || 0) : (b == null || isNaN(b)) ? a : a * (1 - f) + b * f;
    }
    return out;
  }

  /* ---------------- Typical Meteorological Year (Sandia / FS) -------- */
  function finkelsteinSchafer(sample, ref) {
    // ref sorted; sample sorted
    if (!sample.length || !ref.length) return 1;
    let fs = 0;
    for (let i = 0; i < sample.length; i++) {
      const x = sample[i];
      const cs = (i + 1) / sample.length;
      let lo = 0, hi = ref.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (ref[mid] <= x) lo = mid + 1; else hi = mid; }
      fs += Math.abs(cs - lo / ref.length);
    }
    return fs / sample.length;
  }
  /** yearsLocal: [{year, ghi, dni, temp, wind}] each 8760 local; returns {months:[year per month], scores} */
  function buildTMY(yearsLocal, weights) {
    const W = weights || { ghi: 0.30, dni: 0.20, tmean: 0.10, tmax: 0.05, tmin: 0.05, wind: 0.30 };
    const daily = yearsLocal.map(Y => {
      const d = { ghi: [], dni: [], tmean: [], tmax: [], tmin: [], wind: [], month: [] };
      for (let day = 0; day < 365; day++) {
        let g = 0, n = 0, tm = 0, tx = -99, tn = 99, wd = 0;
        for (let h = 0; h < 24; h++) {
          const i = day * 24 + h; g += Y.ghi[i]; n += Y.dni[i]; const t = Y.temp[i]; tm += t; tx = Math.max(tx, t); tn = Math.min(tn, t); wd += Y.wind[i];
        }
        d.ghi.push(g); d.dni.push(n); d.tmean.push(tm / 24); d.tmax.push(tx); d.tmin.push(tn); d.wind.push(wd / 24); d.month.push(CAL.month[day * 24] - 1);
      }
      return d;
    });
    const months = [], scores = [];
    for (let m = 0; m < 12; m++) {
      const refs = {};
      for (const key of Object.keys(W)) {
        const all = [];
        daily.forEach(d => d[key].forEach((v, i) => { if (d.month[i] === m) all.push(v); }));
        refs[key] = Float64Array.from(all).sort();
      }
      let best = 0, bestS = 1e9; const sc = [];
      daily.forEach((d, yi) => {
        let s = 0;
        for (const key of Object.keys(W)) {
          const smp = Float64Array.from(d[key].filter((v, i) => d.month[i] === m)).sort();
          s += W[key] * finkelsteinSchafer(smp, refs[key]);
        }
        sc.push(s); if (s < bestS) { bestS = s; best = yi; }
      });
      months.push(best); scores.push(sc);
    }
    return { months, scores };
  }
  function assembleByMonths(seriesPerYear, monthYearIdx) {
    const out = new Float64Array(8760);
    for (let i = 0; i < 8760; i++) out[i] = seriesPerYear[monthYearIdx[CAL.month[i] - 1]][i];
    return out;
  }

  /* ---------------- resource data fetchers --------------------------- */
  async function fetchJSON(url, signal) {
    const r = await fetch(url, { signal });
    if (!r.ok) { let t = ''; try { t = await r.text(); } catch (e) { } throw new Error(`HTTP ${r.status} ${t.slice(0, 180)}`); }
    return r.json();
  }
  const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  async function fetchOpenMeteo(lat, lon, y0, y1, onProgress, signal) {
    const vars = 'temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_speed_100m,wind_direction_100m,shortwave_radiation,direct_normal_irradiance,diffuse_radiation';
    const chunks = [];
    for (let y = y0; y <= y1; y += 2) chunks.push([y, Math.min(y + 1, y1)]);
    const parts = [];
    let done = 0;
    for (const [a, b] of chunks) {
      const s = a === y0 ? ymd(a - 1, 12, 31) : ymd(a, 1, 1);
      const e = b === y1 ? ymd(b + 1, 1, 1) : ymd(b, 12, 31);
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&start_date=${s}&end_date=${e}&hourly=${vars}&wind_speed_unit=ms&timezone=GMT`;
      const j = await fetchJSON(url, signal);
      parts.push(j); done++; onProgress && onProgress(done / chunks.length, `ERA5 ${a}–${b} received`);
    }
    // merge
    const time = [], cols = {};
    const keys = vars.split(',');
    keys.forEach(k => cols[k] = []);
    let elev = parts[0].elevation;
    for (const j of parts) {
      const H = j.hourly;
      for (let i = 0; i < H.time.length; i++) { time.push(H.time[i]); keys.forEach(k => cols[k].push(H[k][i])); }
    }
    const t0raw = Date.parse(time[0] + ':00Z');
    const n = time.length;
    // radiation stamps = end of preceding hour -> interval start = stamp - 1h ; state vars averaged to mid-interval
    const mid = (a) => { const o = new Float64Array(n); for (let i = 0; i < n; i++) { const x = a[i], y = i > 0 ? a[i - 1] : a[i]; o[i] = (x == null ? y : y == null ? x : (x + y) / 2) || 0; } return o; };
    const raw = (a) => Float64Array.from(a, v => (v == null ? 0 : v));
    return {
      source: 'Open-Meteo ERA5 reanalysis (ECMWF), 0.25° / ~25 km, hourly', lat, lon, elev, t0: t0raw - HOUR, n,
      ghi: raw(cols.shortwave_radiation), dni: raw(cols.direct_normal_irradiance), dhi: raw(cols.diffuse_radiation),
      temp: mid(cols.temperature_2m), rh: mid(cols.relative_humidity_2m), ps: mid(cols.surface_pressure),
      ws10: mid(cols.wind_speed_10m), wsHi: mid(cols.wind_speed_100m), wdHi: raw(cols.wind_direction_100m), hHi: 100,
      years: [y0, y1]
    };
  }

  async function fetchNasaPower(lat, lon, y0, y1, onProgress, signal) {
    const params = 'ALLSKY_SFC_SW_DWN,ALLSKY_SFC_SW_DNI,ALLSKY_SFC_SW_DIFF,T2M,RH2M,PS,WS10M,WS50M,WD50M';
    const keys = params.split(',');
    const cols = {}; keys.forEach(k => cols[k] = []);
    let t0 = null, elev = 0, done = 0;
    const tot = y1 - y0 + 1;
    for (let y = y0; y <= y1; y++) {
      const s = y === y0 ? `${y - 1}1231` : `${y}0101`;
      const e = y === y1 ? `${y + 1}0101` : `${y}1231`;
      const url = `https://power.larc.nasa.gov/api/temporal/hourly/point?parameters=${params}&community=RE&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}&start=${s}&end=${e}&format=JSON&time-standard=UTC`;
      const j = await fetchJSON(url, signal);
      const P = j.properties.parameter;
      elev = (j.geometry && j.geometry.coordinates && j.geometry.coordinates[2]) || elev;
      const stamps = Object.keys(P[keys[0]]).sort();
      if (t0 === null) { const s0 = stamps[0]; t0 = Date.UTC(+s0.slice(0, 4), +s0.slice(4, 6) - 1, +s0.slice(6, 8), +s0.slice(8, 10)); }
      for (const st of stamps) keys.forEach(k => { const v = P[k][st]; cols[k].push(v === -999 || v == null ? NaN : v); });
      done++; onProgress && onProgress(done / tot, `NASA POWER ${y} received`);
    }
    const fill = (a, def) => { const o = Float64Array.from(a); let last = def; for (let i = 0; i < o.length; i++) { if (isNaN(o[i])) o[i] = last; else last = o[i]; } return o; };
    return {
      source: 'NASA POWER (CERES SYN1deg / MERRA-2), 0.5°x0.625°, hourly', lat, lon, elev, t0, n: cols.T2M.length,
      ghi: fill(cols.ALLSKY_SFC_SW_DWN, 0), dni: fill(cols.ALLSKY_SFC_SW_DNI, 0), dhi: fill(cols.ALLSKY_SFC_SW_DIFF, 0),
      temp: fill(cols.T2M, 25), rh: fill(cols.RH2M, 50), ps: Float64Array.from(fill(cols.PS, 101.3), v => v * 10),
      ws10: fill(cols.WS10M, 3), wsHi: fill(cols.WS50M, 4), wdHi: fill(cols.WD50M, 0), hHi: 50, years: [y0, y1]
    };
  }
  async function geocode(q) {
    const j = await fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`);
    return (j.results || []).map(r => ({ name: [r.name, r.admin1, r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude, elev: r.elevation, tz: r.timezone }));
  }
  function guessTZ(lat, lon) {
    if (lat > 6 && lat < 37.5 && lon > 68 && lon < 97.5) return 5.5;      // India (IST)
    if (lat > 26 && lat < 30.5 && lon > 80 && lon < 88.3) return 5.75;     // Nepal
    if (lat > 20 && lat < 27 && lon > 88 && lon < 92.7) return 6;          // Bangladesh
    if (lat > 16 && lat < 33 && lon > 34 && lon < 60) return Math.round(lon / 15);
    return Math.round(lon / 15 * 2) / 2;
  }

  /* ---------------- whole-pipeline resource processing --------------- */
  /** From native multi-year weather + designs: per-year local arrays + TMY profile */
  function processResource(w, pv, wd, opts) {
    const tz = opts.tz;
    const pvRes = simulatePV(w, pv);
    const wRes = simulateWind(w, wd);
    const years = [];
    for (let y = w.years[0]; y <= w.years[1]; y++) {
      years.push({
        year: y,
        solar: toLocalYear(pvRes.p, w.t0, tz, y), wind: toLocalYear(wRes.p, w.t0, tz, y),
        ghi: toLocalYear(w.ghi, w.t0, tz, y), dni: toLocalYear(w.dni, w.t0, tz, y), dhi: toLocalYear(w.dhi, w.t0, tz, y),
        temp: toLocalYear(w.temp, w.t0, tz, y), wind100: toLocalYear(w.wsHi, w.t0, tz, y), vhub: toLocalYear(wRes.vhub, w.t0, tz, y),
        wdir: toLocalYear(w.wdHi, w.t0, tz, y), poa: toLocalYear(pvRes.poa, w.t0, tz, y), tcell: toLocalYear(pvRes.tcell, w.t0, tz, y),
        edc: toLocalYear(pvRes.edc, w.t0, tz, y)
      });
    }
    let monthYear;
    let tmy = null;
    if (opts.basis === 'single') {
      const idx = Math.max(0, years.findIndex(Y => Y.year === opts.year));
      monthYear = new Array(12).fill(idx);
    } else {
      tmy = buildTMY(years.map(Y => ({ ghi: Y.ghi, dni: Y.dni, temp: Y.temp, wind: Y.vhub })), opts.weights);
      monthYear = tmy.months;
    }
    const pick = (key) => assembleByMonths(years.map(Y => Y[key]), monthYear);
    const prof = { solar: pick('solar'), wind: pick('wind'), ghi: pick('ghi'), dni: pick('dni'), dhi: pick('dhi'), temp: pick('temp'), vhub: pick('vhub'), wdir: pick('wdir'), poa: pick('poa'), tcell: pick('tcell'), edc: pick('edc') };
    // annual statistics per year
    const sum = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; };
    const annual = years.map(Y => ({ year: Y.year, solar: sum(Y.solar), wind: sum(Y.wind), ghi: sum(Y.ghi) / 1000, vhub: sum(Y.vhub) / 8760 }));
    // loss scaling: native multi-year sums -> per-year average
    const nyr = years.length;
    return { pvRes, wRes, years, annual, monthYear, tmy, prof, nyr };
  }

  function exceedance(values, p50, uncPct, nYears) {
    const n = values.length;
    const m = values.reduce((a, b) => a + b, 0) / n;
    const sd = n > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - m) * (b - m), 0) / (n - 1)) : 0;
    const iav = m > 0 ? sd / m : 0;
    const unc = (uncPct || 0) / 100;
    const z = { P75: 0.674, P90: 1.282, P95: 1.645, P99: 2.326 };
    const out = { iav, mean: m, p50 };
    for (const [k, zz] of Object.entries(z)) {
      out[k + '_1y'] = p50 * (1 - zz * Math.sqrt(iav * iav + unc * unc));
      out[k + '_10y'] = p50 * (1 - zz * Math.sqrt(iav * iav / 10 + unc * unc));
    }
    return out;
  }

  G.TRE = Object.assign(G.TRE || {}, {
    CAL, MONTH_DAYS, clamp, solarPosition, airMassKY, skyDiffuse, makeIAM, PV_TECH, defaultPV, simulatePV,
    WTG_LIB, defaultWind, powerCurve, curveAt, simulateWind, shearMatrix, weibullFit, toLocalYear,
    buildTMY, assembleByMonths, fetchOpenMeteo, fetchNasaPower, geocode, guessTZ, processResource, exceedance
  });
})(typeof window !== 'undefined' ? window : globalThis);
