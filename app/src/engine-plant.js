/* =====================================================================
 * TrueRE Hybrid Studio — Green ammonia plant engine
 *   Faithful JavaScript port of technical_model.GreenAmmoniaTechnicalModel
 *   (Rev9): hourly busbar cascade NH3 loop -> derivative BESS ->
 *   PEM/ALK electrolyser fleet -> electrolyser BESS -> grid bank,
 *   look-ahead ride-through, ramp limits, H2 buffer, product tank and
 *   offtake ledger. Plus a screening-level financial model consistent
 *   with financial_model.ProjectFinanceModel unit rates.
 * ===================================================================== */
(function (G) {
  'use strict';
  const TRE = G.TRE;
  const CAL = TRE.CAL;

  function defaultPlant() {
    return {
      Ammonia_Loop_Installed_Capacity: 200, Derivative_Normal_MTPD: 180, Derivative_Obligation_TPM: 5000,
      Derivative_per_H2_kgPERkg: 5.67, Derivative_Ramp_rate: 3, Derivative_Min_Turndown_Percent: 30, Derivative_Turndown_Step_Percent: 10,
      Electrolyzer_Design_MW: 220, Electrolyzer_PEM_ratio: 0.1818, PEM_Efficiency_kWhPERkg: 52, Alkaline_Efficiency_kWhPERkg: 55,
      PEM_Min_Turndown_Percent: 10, Alkaline_Min_Turndown_Percent: 30, PEM_Ramp_Rate_PercentPERmin: 20, Alkaline_Ramp_Rate_PercentPERmin: 5,
      Electrolyzer_Dispatch_Priority: 'Efficiency', Electrolyzer_Efficiency_kWhPERkg: 54.45,
      Solar_Capacity_MWp: 480, Wind_Capacity_MWp: 0,
      Grid_Banking_Max_MWh: 0, Grid_Banking_Percent_ofInjection: 0, Grid_Banking_Tariff_Percent: 8, Grid_Banking_Peak_Hrs: '7,8,9,10,11,18,19,20,21,22',
      BESS_Total_MWh: 300, BESS_Derivative_Fraction_of_Total: 0.5, BESS_Charge_C_Max: 0.5,
      BESS_Derivative_RoundTrip_Eff_Percent: 85, BESS_Electrolyzer_RoundTrip_Eff_Percent: 85,
      BESS_derivative_Max_SOC: 100, BESS_derivative_Min_SOC: 0, BESS_Electrolyzer_Max_SOC: 100, BESS_Electrolyzer_Min_SOC: 0,
      LookAhead_Enable: true, LookAhead_Horizon_Hours: 12, LookAhead_RE_Recovery_Factor: 1, LookAhead_H2_Reserve_Factor: 0.9, LookAhead_Energy_Reserve_Factor: 1,
      Enable_ElyBESS_Support_Derivative: true, Hydrogen_Storage_Ton: 25,
      Derivative_Storage_Capacity_Ton: 6000, Derivative_Storage_Initial_Ton: 0, Derivative_Offtake_TPM: 5000, Derivative_Offtake_Frequency: 'Daily',
      Derivative_Offtake_Prorate_Partial_Month: true, Analysis_Month_start: 1, Analysis_Day_start: 1,
      Aux_MW_per_300MTPD: 13
    };
  }
  const PLANT_CASES = {
    'Solar-BESS':           { Electrolyzer_Design_MW: 220, Electrolyzer_PEM_ratio: 0.1818, Solar_Capacity_MWp: 480, Wind_Capacity_MWp: 0, Grid_Banking_Max_MWh: 0, Grid_Banking_Percent_ofInjection: 0, BESS_Total_MWh: 300, BESS_Derivative_Fraction_of_Total: 0.5, Hydrogen_Storage_Ton: 25 },
    'Solar-Wind-BESS':      { Electrolyzer_Design_MW: 800, Electrolyzer_PEM_ratio: 0.1818, Solar_Capacity_MWp: 310, Wind_Capacity_MWp: 90, Grid_Banking_Max_MWh: 0, Grid_Banking_Percent_ofInjection: 0, BESS_Total_MWh: 200, BESS_Derivative_Fraction_of_Total: 0.8, Hydrogen_Storage_Ton: 25 },
    'Solar-BESS-Grid':      { Electrolyzer_Design_MW: 100, Electrolyzer_PEM_ratio: 0.2, Solar_Capacity_MWp: 520, Wind_Capacity_MWp: 0, Grid_Banking_Max_MWh: 20000, Grid_Banking_Percent_ofInjection: 30, BESS_Total_MWh: 50, BESS_Derivative_Fraction_of_Total: 0.8, Hydrogen_Storage_Ton: 25 },
    'Solar-Wind-BESS-Grid': { Electrolyzer_Design_MW: 80, Electrolyzer_PEM_ratio: 0.1818, Solar_Capacity_MWp: 485, Wind_Capacity_MWp: 0, Grid_Banking_Max_MWh: 20000, Grid_Banking_Percent_ofInjection: 30, BESS_Total_MWh: 200, BESS_Derivative_Fraction_of_Total: 0.8, Hydrogen_Storage_Ton: 53 }
  };

  function derive(cfg) {
    const c = Object.assign({}, cfg);
    c.PEM_Capacity_MW = Math.ceil(c.Electrolyzer_PEM_ratio * c.Electrolyzer_Design_MW / 5) * 5;
    c.PEM_Capacity_MW = Math.min(c.PEM_Capacity_MW, c.Electrolyzer_Design_MW);
    c.Alkaline_Capacity_MW = c.Electrolyzer_Design_MW - c.PEM_Capacity_MW;
    c.Derivative_Design_Margin = c.Ammonia_Loop_Installed_Capacity / c.Derivative_Normal_MTPD;
    c.Derivative_Aux_Power_MW = c.Ammonia_Loop_Installed_Capacity * (c.Aux_MW_per_300MTPD / 300);
    c.BESS_Derivative_Capacity_MWh = c.BESS_Total_MWh * c.BESS_Derivative_Fraction_of_Total;
    c.BESS_Electrolyzer_Capacity_MWh = c.BESS_Total_MWh * (1 - c.BESS_Derivative_Fraction_of_Total);
    const ph = typeof c.Grid_Banking_Peak_Hrs === 'string' ? c.Grid_Banking_Peak_Hrs.split(/[ ,;]+/).filter(Boolean).map(Number) : (c.Grid_Banking_Peak_Hrs || []);
    c._peak = new Uint8Array(24); ph.forEach(h => { if (h >= 0 && h < 24) c._peak[h] = 1; });
    return c;
  }

  /** solarEff/windEff: % kW/kWp, 8760 local hours. Returns result object. */
  function runPlant(cfgIn, solarEff, windEff) {
    const c = derive(cfgIn);
    const n = 8760;
    const warnings = [];
    // ---------- derived parameters
    const H2N = c.Derivative_Normal_MTPD / c.Derivative_per_H2_kgPERkg;          // t/day at normal
    const PEM_D = c.PEM_Capacity_MW, ALK_D = c.Alkaline_Capacity_MW;
    const Y = { PEM: 1000 / c.PEM_Efficiency_kWhPERkg, ALK: 1000 / c.Alkaline_Efficiency_kWhPERkg };
    const DES = { PEM: PEM_D, ALK: ALK_D };
    const MIN = { PEM: PEM_D * c.PEM_Min_Turndown_Percent / 100, ALK: ALK_D * c.Alkaline_Min_Turndown_Percent / 100 };
    const RAMP = { PEM: PEM_D * c.PEM_Ramp_Rate_PercentPERmin * 0.6, ALK: ALK_D * c.Alkaline_Ramp_Rate_PercentPERmin * 0.6 };
    const pr = c.Electrolyzer_Dispatch_Priority;
    const ORDER = pr === 'PEM_First' ? ['PEM', 'ALK'] : pr === 'Alkaline_First' ? ['ALK', 'PEM']
      : (c.PEM_Efficiency_kWhPERkg <= c.Alkaline_Efficiency_kWhPERkg ? ['PEM', 'ALK'] : ['ALK', 'PEM']);
    const totMW = c.Electrolyzer_Design_MW;
    const H2perMW = totMW > 1e-9 ? (PEM_D * Y.PEM + ALK_D * Y.ALK) / totMW : 1000 / c.Electrolyzer_Efficiency_kWhPERkg;
    const elyNormalMW = H2N / 24 * (1000 / H2perMW);
    const H2cap = c.Hydrogen_Storage_Ton;
    const BD_rated = c.BESS_Charge_C_Max * c.BESS_Derivative_Capacity_MWh;
    const BE_rated = c.BESS_Charge_C_Max * c.BESS_Electrolyzer_Capacity_MWh;
    const aux = c.Derivative_Aux_Power_MW, margin = c.Derivative_Design_Margin;
    for (const [name, ramp, mn, d] of [['PEM', RAMP.PEM, MIN.PEM, PEM_D], ['Alkaline', RAMP.ALK, MIN.ALK, ALK_D]]) {
      if (d > 1e-9 && ramp > 0 && ramp < mn) warnings.push(`${name}: ramp of ${ramp.toFixed(1)} MW/h cannot reach the ${mn.toFixed(1)} MW minimum load within one hour; the stack cannot restart once it trips.`);
    }
    if (c.Derivative_Ramp_rate * 60 > 0 && c.Derivative_Ramp_rate * 60 < c.Derivative_Min_Turndown_Percent) warnings.push('Ammonia loop ramp cannot reach minimum turndown within one hour.');

    // ---------- arrays
    const F = () => new Float64Array(n);
    const solarMW = F(), windMW = F(), RE = F();
    for (let i = 0; i < n; i++) { solarMW[i] = Math.max(0, solarEff[i] || 0) * c.Solar_Capacity_MWp / 100; windMW[i] = Math.max(0, windEff[i] || 0) * c.Wind_Capacity_MWp / 100; RE[i] = solarMW[i] + windMW[i]; }
    const DC = F(), DP = F(), H2D = F(), DProd = F(), DRL = F();
    const EP = F(), PEM_P = F(), ALK_P = F(), H2PEM = F(), H2ALK = F(), H2E = F(), ERL = F(), ECap = F();
    const H2S_s = F(), H2S_e = F(), H2fromS = F(), H2pct = F();
    const BD_s = F(), BD_e = F(), BD_p = F(), BD_bus = F();
    const BE_s = F(), BE_e = F(), BE_p = F(), BE_bus = F();
    const GB_s = F(), GB_e = F(), GB_p = F(), GB_t = F(), GB_d = F();
    const P0 = F(), P5 = F(), CURT = F(), LA_h = F(), LA_sp = F(), LA_b = F(), BT = F(), Ebal = F(), Hbal = F();
    const prev = (i) => (i === 0 ? n - 1 : i - 1);
    // power injection window (25 h centred on midnight)
    const reCum = new Float64Array(n + 1); for (let i = 0; i < n; i++) reCum[i + 1] = reCum[i] + RE[i];
    const PI = F(); for (let i = 0; i < n; i++) { const ds = Math.floor(i / 24) * 24; const lo = Math.max(0, Math.min(n, ds - 12)), hi = Math.max(0, Math.min(n, ds + 13)); PI[i] = reCum[hi] - reCum[lo]; }
    // look-ahead tables (cyclic)
    const maxH = Math.max(1, Math.floor(c.LookAhead_Horizon_Hours));
    const recov = aux * c.LookAhead_RE_Recovery_Factor;
    const reC2 = new Float64Array(2 * n + 1), h2C2 = new Float64Array(2 * n + 1);
    for (let k = 0; k < 2 * n; k++) {
      const i = k % n, s = Math.max(RE[i] - aux, 0);
      const lead = ORDER[0], trail = ORDER[1];
      const pl = Math.min(s, DES[lead]), pt = Math.min(s - pl, DES[trail]);
      reC2[k + 1] = reC2[k] + RE[i]; h2C2[k + 1] = h2C2[k] + (pl * Y[lead] + pt * Y[trail]) / 1000;
    }
    const horizon = new Float64Array(n);
    for (let i = 0; i < n; i++) { horizon[i] = maxH; for (let k = 1; k <= maxH; k++) { if (RE[(i + k) % n] >= recov) { horizon[i] = k; break; } } }
    const win = (cum, i, h) => cum[i + h] - cum[i];
    const rtD = Math.sqrt(c.BESS_Derivative_RoundTrip_Eff_Percent / 100), rtE = Math.sqrt(c.BESS_Electrolyzer_RoundTrip_Eff_Percent / 100);
    const BD_min = c.BESS_Derivative_Capacity_MWh * c.BESS_derivative_Min_SOC / 100, BD_max = c.BESS_Derivative_Capacity_MWh * c.BESS_derivative_Max_SOC / 100;
    const BE_min = c.BESS_Electrolyzer_Capacity_MWh * c.BESS_Electrolyzer_Min_SOC / 100, BE_max = c.BESS_Electrolyzer_Capacity_MWh * c.BESS_Electrolyzer_Max_SOC / 100;
    const delivD = (i) => Math.max(0, Math.min(BD_s[i] - BD_min, BD_rated)) * rtD;
    const delivE = (i) => Math.max(0, Math.min(BE_s[i] - BE_min, BE_rated)) * rtE;

    // ---------- component functions
    function derivative(i, PT0, H2avail) {
      DP[i] = Math.max(DC[i], 85) / 100 * aux; H2D[i] = DC[i] / 100 * H2N / 24;
      let guard = 0;
      while ((DP[i] > PT0 + 1e-12 || H2D[i] > H2avail + 1e-12) && guard++ < 40) {
        DC[i] = Math.max(0, DC[i] - 10);
        DP[i] = Math.max(DC[i], 60) / 100 * aux; H2D[i] = DC[i] / 100 * H2N / 24;
        if (DC[i] <= 1) { DP[i] = 0; H2D[i] = 0; break; }
      }
      const ramp = c.Derivative_Ramp_rate;
      if (ramp > 0 && DC[i] > 1) { const floor = DC[prev(i)] - ramp * 60; if (DC[i] < floor - 1e-9) { DC[i] = 0; DP[i] = 0; DRL[i] = 2; } }
      if (DC[i] <= 1) { DC[i] = DC[i] <= 1 ? DC[i] : DC[i]; }
      H2D[i] = DC[i] / 100 * H2N / 24; DProd[i] = DC[i] / 100 * c.Derivative_Normal_MTPD / 24;
      return PT0 - DP[i];
    }
    function bounds(t, prevMW) {
      if (DES[t] <= 1e-9) return [0, 0];
      if (RAMP[t] <= 0) return [MIN[t], DES[t]];
      return [Math.max(MIN[t], prevMW - RAMP[t]), Math.min(DES[t], prevMW + RAMP[t])];
    }
    function elyDispatch(i, pLimit, h2Limit) {
      pLimit = Math.max(0, pLimit);
      const pv = { PEM: PEM_P[prev(i)], ALK: ALK_P[prev(i)] };
      const p = { PEM: 0, ALK: 0 }; let code = 0, rem = pLimit;
      for (const t of ORDER) {
        const [lo, hi] = bounds(t, pv[t]);
        if (hi <= 1e-9 || lo > hi + 1e-9) continue;
        if (rem + 1e-9 < lo) continue;
        const load = Math.min(rem, hi); p[t] = load; rem -= load;
        if (DES[t] > 1e-9 && load < Math.min(DES[t], pLimit) - 1e-6 && Math.abs(load - hi) < 1e-6) code += t === 'PEM' ? 1 : 2;
      }
      let h2 = (p.PEM * Y.PEM + p.ALK * Y.ALK) / 1000;
      if (h2Limit != null && h2 > h2Limit + 1e-12) {
        for (const t of [ORDER[1], ORDER[0]]) {
          if (h2 <= h2Limit + 1e-12) break;
          if (p[t] <= 1e-9) continue;
          const [lo] = bounds(t, pv[t]);
          let nl = p[t] - (h2 - h2Limit) * (1000 / Y[t]);
          if (nl < lo - 1e-9) nl = 0;
          p[t] = Math.max(0, nl); h2 = (p.PEM * Y.PEM + p.ALK * Y.ALK) / 1000;
        }
      }
      return [p.PEM, p.ALK, h2, code];
    }
    function setEly(i, pp, pa, h2, code) {
      PEM_P[i] = pp; ALK_P[i] = pa; H2PEM[i] = pp * Y.PEM / 1000; H2ALK[i] = pa * Y.ALK / 1000;
      EP[i] = pp + pa; H2E[i] = h2; ECap[i] = elyNormalMW > 1e-9 ? 100 * (pp + pa) / elyNormalMW : 0; if (code != null) ERL[i] = code;
    }
    function h2store(i, ex) {
      H2S_e[i] = Math.max(0, Math.min(H2cap, H2S_s[i] + ex)); H2fromS[i] = H2S_s[i] - H2S_e[i]; H2pct[i] = H2cap > 0 ? H2S_e[i] / H2cap * 100 : 0;
    }
    function electrolyzer(i, P) {
      if (EP[i] > P) EP[i] = Math.max(0, P);
      let r = elyDispatch(i, EP[i]); setEly(i, r[0], r[1], r[2], r[3]);
      let ex = H2E[i] - H2D[i]; h2store(i, ex);
      let rem = ex + H2fromS[i];
      if (rem > 0) {
        r = elyDispatch(i, EP[i], H2E[i] - rem); setEly(i, r[0], r[1], r[2], r[3]);
        ex = H2E[i] - H2D[i]; h2store(i, ex); rem = ex + H2fromS[i];
      }
      const retry = rem < -0.001 ? H2E[i] + H2fromS[i] : null;
      return [P - EP[i], retry];
    }
    function bess(i, PT, S, E, Pw, Bus, cap, rated, rt, mn, mx) {
      let pb = PT >= 0 ? PT * rt : PT / rt;
      pb = pb >= 0 ? Math.min(pb, rated) : Math.max(pb, -rated);
      E[i] = cap > 0 ? Math.max(Math.min(S[i], mn), Math.min(mx, S[i] + pb)) : 0;
      Pw[i] = S[i] - E[i];
      const bus = Pw[i] * (PT >= 0 ? 1 / rt : rt);
      Bus[i] = bus; return PT + bus;
    }
    function bank(i, PT) {
      const avail = Math.min(c.Grid_Banking_Max_MWh, PI[i] / 100 * c.Grid_Banking_Percent_ofInjection);
      GB_e[i] = Math.max(0, Math.min(avail, GB_s[i] + PT)); GB_p[i] = GB_s[i] - GB_e[i];
      if (c._peak[CAL.hour[i]] && GB_p[i] > 0) { GB_p[i] = 0; GB_e[i] = GB_s[i]; }
      GB_t[i] = GB_p[i] < 0 ? -GB_p[i] * c.Grid_Banking_Tariff_Percent / 100 : 0;
      return PT + GB_p[i];
    }
    function laSetpoint(i, h) {
      let h2r = (H2S_s[i] + win(h2C2, i, h)) * c.LookAhead_H2_Reserve_Factor;
      let er = BD_s[i] * rtD + GB_s[i];
      if (c.Enable_ElyBESS_Support_Derivative) er += BE_s[i] * rtD;
      er = (er + win(reC2, i, h)) * c.LookAhead_Energy_Reserve_Factor;
      const design = 100 * margin, mn = c.Derivative_Min_Turndown_Percent, st = c.Derivative_Turndown_Step_Percent, rate = H2N / 24 / 100;
      let cap = design;
      while (cap >= mn - 1e-9) {
        const hN = cap * rate * h, eN = Math.max(cap, 60) / 100 * aux * h;
        if (hN <= h2r && eN <= er) {
          if (cap >= design - 1e-9) return [cap, 0];
          const nx = cap + st, hn = nx * rate * h, en = Math.max(nx, 60) / 100 * aux * h;
          return [cap, (hn > h2r ? 1 : 0) + (en > er ? 2 : 0)];
        }
        cap -= st;
      }
      return [design, 4];
    }
    function transfer(i, h) {
      if (!c.Enable_ElyBESS_Support_Derivative || c.BESS_Electrolyzer_Capacity_MWh <= 0 || c.BESS_Derivative_Capacity_MWh <= 0) return;
      const out = BE_s[i] - BE_min; if (out <= 1e-9) return;
      const need = aux * h - win(reC2, i, h) - GB_s[i];
      const short = need - BD_s[i]; if (short <= 0) return;
      const t = Math.min(short, out, BD_max - BD_s[i], Math.min(BE_rated, BD_rated));
      if (t <= 1e-9) return;
      BE_s[i] -= t; BD_s[i] += t; BT[i] = t;
    }
    // ---------- core loop (72 h cyclic warm-up)
    const seq = []; for (let i = n - 72; i < n; i++) seq.push(i); for (let i = 0; i < n; i++) seq.push(i);
    for (const i of seq) {
      const p = prev(i);
      DC[i] = 100 * margin; EP[i] = totMW; H2D[i] = H2N / 24 * margin; DRL[i] = 0; ERL[i] = 0; BT[i] = 0;
      H2S_s[i] = H2S_e[p]; BD_s[i] = BD_e[p]; BE_s[i] = BE_e[p]; GB_s[i] = Math.max(0, GB_e[p] - GB_t[p]);
      GB_d[i] = c._peak[CAL.hour[i]] ? 0 : GB_s[i];
      if (c.LookAhead_Enable) {
        const h = horizon[i]; transfer(i, h);
        const [sp, bnd] = laSetpoint(i, h); LA_h[i] = h; LA_sp[i] = sp; LA_b[i] = bnd;
        if (sp < DC[i]) { DC[i] = sp; H2D[i] = sp / 100 * H2N / 24; }
      }
      if (c.Derivative_Ramp_rate > 0) { const ceil = DC[p] + c.Derivative_Ramp_rate * 60; if (DC[i] > ceil) { DC[i] = ceil; H2D[i] = ceil / 100 * H2N / 24; DRL[i] = 1; } }
      const bd = delivD(i), be = delivE(i), bk = GB_d[i];
      const PT0 = RE[i] + bd + bk;
      let Havail = elyDispatch(i, totMW)[2] + H2S_s[i];
      P0[i] = PT0;
      let P1 = 0, P2 = 0, P3 = 0;
      for (let k = 0; k < 12; k++) {
        P1 = derivative(i, PT0, Havail);
        P2 = bess(i, P1 - bd - bk, BD_s, BD_e, BD_p, BD_bus, c.BESS_Derivative_Capacity_MWh, BD_rated, rtD, BD_min, BD_max);
        const r = electrolyzer(i, P2 + be + bk); P3 = r[0];
        if (r[1] == null) break; Havail = r[1];
      }
      const P4 = bess(i, P3 - be - bk, BE_s, BE_e, BE_p, BE_bus, c.BESS_Electrolyzer_Capacity_MWh, BE_rated, rtE, BE_min, BE_max);
      P5[i] = bank(i, P4); CURT[i] = P5[i];
      Hbal[i] = H2D[i] - H2E[i] - H2fromS[i];
      Ebal[i] = RE[i] + BD_bus[i] + BE_bus[i] + GB_p[i] - DP[i] - EP[i] - CURT[i];
    }
    // ---------- shutdowns
    const countShutdowns = (arr) => {
      const st = []; for (const x of arr) { if (x > 0.1) st.push(1); else if (x === 0) st.push(0); }
      let ch = st.length ? 1 : 0; for (let i = 1; i < st.length; i++) if (st[i] !== st[i - 1]) ch++;
      return Math.max(0, Math.floor((ch - 1) / 2));
    };
    // ---------- product tank & offtake
    const tank = productTank(c, DProd);
    // ---------- aggregates
    const sum = (a) => a.reduce((s, x) => s + x, 0);
    let curt = 0, imp = 0; for (const x of CURT) { if (x > 0) curt += x; else imp -= x; }
    const monthly = [];
    for (let m = 1; m <= 12; m++) {
      const idx = []; for (let i = 0; i < n; i++) if (CAL.month[i] === m) idx.push(i);
      const s = (a) => idx.reduce((t, i) => t + a[i], 0);
      monthly.push({
        m, nh3: s(DProd), h2: s(H2E), h2pem: s(H2PEM), h2alk: s(H2ALK), solar: s(solarMW), wind: s(windMW), re: s(RE),
        ely: s(EP), aux: s(DP), curt: idx.reduce((t, i) => t + Math.max(0, CURT[i]), 0), imp: idx.reduce((t, i) => t + Math.max(0, -CURT[i]), 0),
        shutdowns: countShutdowns(idx.map(i => DC[i])), due: s(tank.dueCal), lifted: s(tank.liftedCal), short: s(tank.shortCal), excess: s(tank.excessCal)
      });
    }
    const balErr = Math.max(...Array.from(Ebal, Math.abs));
    const rationed = LA_sp.filter(x => x < 100 * margin - 1e-9).length;
    const res = {
      cfg: c, warnings, n,
      hourly: { solarMW, windMW, RE, DC, DP, H2D, DProd, EP, PEM_P, ALK_P, H2E, H2PEM, H2ALK, H2S_e, H2pct, BD_e, BE_e, BD_bus, BE_bus, GB_e, GB_p, GB_t, CURT, LA_sp, LA_b, BT, ERL, DRL, tankLevel: tank.levelCal },
      monthly, tank,
      annual: {
        nh3: sum(DProd), h2: sum(H2E), h2pem: sum(H2PEM), h2alk: sum(H2ALK), re: sum(RE), solar: sum(solarMW), wind: sum(windMW),
        ely: sum(EP), aux: sum(DP), curtailed: curt, imported: imp, bankTariff: sum(GB_t), shutdowns: countShutdowns(DC),
        bessDisch: sum(Array.from(BD_bus).map(x => Math.max(0, x))) + sum(Array.from(BE_bus).map(x => Math.max(0, x))),
        bessCharge: -sum(Array.from(BD_bus).map(x => Math.min(0, x))) - sum(Array.from(BE_bus).map(x => Math.min(0, x))),
        bankIn: -sum(Array.from(GB_p).map(x => Math.min(0, x))), bankOut: sum(Array.from(GB_p).map(x => Math.max(0, x))),
        loopUtil: sum(DC) / n / (100 * margin) * 100, elyCUF: totMW > 0 ? sum(EP) / n / totMW * 100 : 0,
        pemUtil: PEM_D > 0 ? sum(PEM_P) / n / PEM_D * 100 : 0, alkUtil: ALK_D > 0 ? sum(ALK_P) / n / ALK_D * 100 : 0,
        hoursRationed: rationed, hoursRampLimited: ERL.filter(x => x > 0).length, trips: DRL.filter(x => x === 2).length,
        bessTransfer: sum(BT), balanceErr: balErr, hoursRunning: Array.from(DC).filter(x => x > 0.1).length,
        offtakeDue: tank.annualDue, offtakeDispatched: tank.annualLifted, offtakeShortfall: tank.annualShort, excess: tank.annualExcess,
        daysMet: tank.daysMet, days: tank.days, monthsMet: tank.monthsMet, steady: tank.yearProfile[tank.yearProfile.length - 1]
      },
      derived: { PEM_D, ALK_D, H2N, aux, margin, elyNormalMW, ORDER, H2perMW }
    };
    return res;
  }

  function productTank(c, prodCal) {
    const n = 8760;
    const cap = Math.max(0, +c.Derivative_Storage_Capacity_Ton), tpm = Math.max(0, +c.Derivative_Offtake_TPM);
    const daily = String(c.Derivative_Offtake_Frequency).toLowerCase() !== 'monthly';
    const prorate = daily || !!c.Derivative_Offtake_Prorate_Partial_Month;
    const init = Math.min(Math.max(0, +c.Derivative_Storage_Initial_Ton), cap);
    let start = 0;
    for (let i = 0; i < n; i++) if (CAL.month[i] === +c.Analysis_Month_start && CAL.day[i] === +c.Analysis_Day_start && CAL.hour[i] === 0) { start = i; break; }
    const order = new Int32Array(n); for (let h = 0; h < n; h++) order[h] = (h + start) % n;
    const mon = Array.from(order, r => CAL.month[r]), day = Array.from(order, r => CAL.day[r]);
    const prod = Float64Array.from(order, r => prodCal[r]);
    const monthHours = new Array(13).fill(0); for (let i = 0; i < n; i++) monthHours[CAL.month[i]]++;
    const newM = mon.map((m, h) => h === 0 || m !== mon[h - 1]);
    const newD = day.map((d, h) => h === 0 || d !== day[h - 1] || mon[h] !== mon[h - 1]);
    const ps = daily ? newD : newM;
    const settle = ps.map((_, h) => h === n - 1 ? true : ps[h + 1]);
    const pid = []; let cnt = -1; for (let h = 0; h < n; h++) { if (ps[h]) cnt++; pid.push(cnt); }
    const ph = new Array(cnt + 1).fill(0); pid.forEach(p => ph[p]++);
    const due = new Float64Array(n);
    for (let h = 0; h < n; h++) if (settle[h]) { const share = prorate ? ph[pid[h]] / monthHours[mon[h]] : 1; due[h] = tpm * Math.min(share, 1); }
    function pass(open) {
      const ls = new Float64Array(n), st = new Float64Array(n), ex = new Float64Array(n), lf = new Float64Array(n), sh = new Float64Array(n), le = new Float64Array(n);
      let lvl = open;
      for (let h = 0; h < n; h++) {
        ls[h] = lvl; const acc = Math.min(prod[h], cap - lvl); st[h] = acc; ex[h] = prod[h] - acc; lvl += acc;
        if (settle[h]) { lf[h] = Math.min(due[h], lvl); sh[h] = due[h] - lf[h]; lvl -= lf[h]; }
        le[h] = lvl;
      }
      return { ls, st, ex, lf, sh, le, close: lvl };
    }
    const y1 = pass(init);
    const sum = (a) => a.reduce((s, x) => s + x, 0);
    const yearProfile = [{ lifted: sum(y1.lf), excess: sum(y1.ex), dInv: y1.close - init }];
    let open = y1.close;
    for (let k = 0; k < 10; k++) { const y = pass(open); yearProfile.push({ lifted: sum(y.lf), excess: sum(y.ex), dInv: y.close - open }); if (Math.abs(y.close - open) < 1e-3) break; open = y.close; }
    const toCal = (a) => { const o = new Float64Array(n); for (let h = 0; h < n; h++) o[order[h]] = a[h]; return o; };
    // daily & monthly ledgers (operating order)
    let daysMet = 0, days = 0, dayShort = 0; for (let h = 0; h < n; h++) { dayShort += y1.sh[h]; if (h === n - 1 || newD[h + 1]) { days++; if (dayShort <= 1e-6) daysMet++; dayShort = 0; } }
    const ledger = []; let cur = null;
    for (let h = 0; h < n; h++) {
      if (newM[h]) { cur = { month: mon[h], open: y1.ls[h], prod: 0, stored: 0, excess: 0, due: 0, lifted: 0, short: 0, close: 0, peak: 0, min: 1e18, full: 0, hours: 0 }; ledger.push(cur); }
      cur.prod += prod[h]; cur.stored += y1.st[h]; cur.excess += y1.ex[h]; cur.due += due[h]; cur.lifted += y1.lf[h]; cur.short += y1.sh[h];
      cur.close = y1.le[h]; cur.peak = Math.max(cur.peak, y1.le[h], cur.open); cur.min = Math.min(cur.min, y1.le[h]); if (y1.le[h] >= cap - 1e-9) cur.full++; cur.hours++;
    }
    const monthsMet = ledger.filter(l => l.short <= 1e-6).length;
    return {
      levelCal: toCal(y1.le), dueCal: toCal(due), liftedCal: toCal(y1.lf), shortCal: toCal(y1.sh), excessCal: toCal(y1.ex),
      annualDue: sum(due), annualLifted: sum(y1.lf), annualShort: sum(y1.sh), annualExcess: sum(y1.ex), closing: y1.close,
      yearProfile, ledger, daysMet, days, monthsMet, startIndex: start
    };
  }

  /* ---------------- screening economics ----------------------------- */
  function defaultFinance() {
    return {
      SolarPV_Cost_Per_MWp: 1.7, Wind_Cost_Per_MWp: 7.5, BESS_Cost_Per_MWh: 0.7, PEM_Cost_Per_MW: 3.0, Alkaline_Cost_Per_MW: 1.5,
      H2Storage_Cost_Per_Ton: 4.0, AmmoniaLoop_BaseCost: 300, AmmoniaLoop_Ref_MTPD: 200, AmmoniaLoop_Scale_Exp: 0, BOP_BaseCost: 150, Others_BaseCost: 150,
      Evacuation_Cost_Per_MWp: 0.1, Land_Acres_per_MWp_Solar: 2.7, Land_Acres_per_MWp_Wind: 1.5, Land_Acres_Plant: 100, Land_Cost_INR_Lakh_per_Acre: 5,
      Contingency_Percent: 3, Owners_Cost_Percent: 1.5, PreOperative_Percent: 0.5, Construction_Period_Years: 2, Drawdown_Y1: 30,
      PLANT_LIFETIME: 25, Gearing_Percent: 70, Interest_Rate_Percent: 9, Loan_Tenor_Years: 15, Moratorium_Years: 1, Cost_of_Equity_Percent: 14,
      Tax_Rate_Percent: 25.168, Book_Residual_Percent: 5,
      Ammonia_Price_INR_per_kg: 52.25, Grey_Ammonia_Price_INR_per_kg: 30, Subsidy_NH3_Y1: 8.82, Subsidy_NH3_Y2: 7.06, Subsidy_NH3_Y3: 5.3,
      Ramp_Y1: 98, Plant_Availability_Percent: 100, Output_Degradation_Percent_per_Year: 0,
      OM_Solar: 0.5, OM_Wind: 0.5, OM_BESS: 0.5, OM_PEM: 0.75, OM_ALK: 0.75, OM_H2S: 0.5, OM_NH3: 1.0, OM_BOP: 1.0, OM_Evac: 0.5,
      Manpower_Cost_Crore_per_Year: 2.5, Admin_Cost_Crore_per_Year: 1.5, Insurance_Percent_of_Capex: 0.25, Water_m3_per_kg_H2: 0.015, Water_Cost_INR_per_m3: 40,
      Opex_Escalation_Percent: 3,
      PEM_Stack_Interval: 9, PEM_Stack_Percent: 35, ALK_Stack_Interval: 13, ALK_Stack_Percent: 30, BESS_Aug_Interval: 10, BESS_Aug_Percent: 40,
      Catalyst_Interval: 15, Catalyst_Percent: 2, Salvage_Percent_of_EPC: 5
    };
  }
  function irr(cfs) {
    const npv = (r) => cfs.reduce((s, c, t) => s + c / Math.pow(1 + r, t), 0);
    let lo = -0.9, hi = 1.0, flo = npv(lo), fhi = npv(hi);
    if (flo * fhi > 0) return NaN;
    for (let k = 0; k < 120; k++) { const mid = (lo + hi) / 2, f = npv(mid); if (f * flo > 0) { lo = mid; flo = f; } else hi = mid; }
    return (lo + hi) / 2;
  }
  function runFinance(f, res) {
    const c = res.cfg, a = res.annual, d = res.derived;
    const nh3Inst = c.Ammonia_Loop_Installed_Capacity;
    const sec = {
      'Solar PV': c.Solar_Capacity_MWp * f.SolarPV_Cost_Per_MWp,
      'Wind': c.Wind_Capacity_MWp * f.Wind_Cost_Per_MWp,
      'BESS': c.BESS_Total_MWh * f.BESS_Cost_Per_MWh,
      'Electrolyser - PEM': d.PEM_D * f.PEM_Cost_Per_MW,
      'Electrolyser - Alkaline': d.ALK_D * f.Alkaline_Cost_Per_MW,
      'H2 Storage': c.Hydrogen_Storage_Ton * f.H2Storage_Cost_Per_Ton,
      'Ammonia Loop': f.AmmoniaLoop_BaseCost * Math.pow(nh3Inst / Math.max(1, f.AmmoniaLoop_Ref_MTPD), f.AmmoniaLoop_Scale_Exp),
      'BOP': f.BOP_BaseCost, 'Others': f.Others_BaseCost,
      'Evacuation': (c.Solar_Capacity_MWp + c.Wind_Capacity_MWp) * f.Evacuation_Cost_Per_MWp
    };
    const epc = Object.values(sec).reduce((s, x) => s + x, 0);
    const land = (c.Solar_Capacity_MWp * f.Land_Acres_per_MWp_Solar + c.Wind_Capacity_MWp * f.Land_Acres_per_MWp_Wind + f.Land_Acres_Plant) * f.Land_Cost_INR_Lakh_per_Acre / 100;
    const soft = epc * (f.Contingency_Percent + f.Owners_Cost_Percent + f.PreOperative_Percent) / 100;
    const hard = epc + soft + land;
    const debt = hard * f.Gearing_Percent / 100, i = f.Interest_Rate_Percent / 100;
    const N = Math.max(1, Math.round(f.Construction_Period_Years));
    const draw = N === 1 ? [1] : [f.Drawdown_Y1 / 100].concat(new Array(N - 1).fill((1 - f.Drawdown_Y1 / 100) / (N - 1)));
    let idcF = 0; draw.forEach((x, y) => { idcF += x * (N - y - 0.5); });
    const idc = debt * i * idcF;
    const capex = hard + idc;
    const tax = f.Tax_Rate_Percent / 100;
    const wacc = f.Gearing_Percent / 100 * i * (1 - tax) + (1 - f.Gearing_Percent / 100) * f.Cost_of_Equity_Percent / 100;
    const om = { 'Solar PV': f.OM_Solar, 'Wind': f.OM_Wind, 'BESS': f.OM_BESS, 'Electrolyser - PEM': f.OM_PEM, 'Electrolyser - Alkaline': f.OM_ALK, 'H2 Storage': f.OM_H2S, 'Ammonia Loop': f.OM_NH3, 'BOP': f.OM_BOP, 'Evacuation': f.OM_Evac, 'Others': 0 };
    let omC = 0; for (const k in sec) omC += sec[k] * (om[k] || 0) / 100;
    const water = a.h2 * 1000 * f.Water_m3_per_kg_H2 * f.Water_Cost_INR_per_m3 / 1e7;
    const fixedOpex = { 'O&M (asset)': omC, 'Manpower': f.Manpower_Cost_Crore_per_Year, 'Admin': f.Admin_Cost_Crore_per_Year, 'Insurance': capex * f.Insurance_Percent_of_Capex / 100, 'Water': water };
    const opex1 = Object.values(fixedOpex).reduce((s, x) => s + x, 0);
    const life = f.PLANT_LIFETIME;
    const repl = (yr) => {
      let r = 0;
      if (f.PEM_Stack_Interval > 0 && yr % f.PEM_Stack_Interval === 0 && yr < life) r += sec['Electrolyser - PEM'] * f.PEM_Stack_Percent / 100;
      if (f.ALK_Stack_Interval > 0 && yr % f.ALK_Stack_Interval === 0 && yr < life) r += sec['Electrolyser - Alkaline'] * f.ALK_Stack_Percent / 100;
      if (f.BESS_Aug_Interval > 0 && yr % f.BESS_Aug_Interval === 0 && yr < life) r += sec['BESS'] * f.BESS_Aug_Percent / 100;
      if (f.Catalyst_Interval > 0 && yr % f.Catalyst_Interval === 0 && yr < life) r += sec['Ammonia Loop'] * f.Catalyst_Percent / 100;
      return r;
    };
    // volumes: green offtake (dispatched) + excess at grey price, steady state after year 1
    const st = a.steady || { lifted: a.offtakeDispatched, excess: a.excess };
    const vol = (yr) => {
      const ramp = yr === 1 ? f.Ramp_Y1 / 100 : 1;
      const deg = Math.pow(1 - f.Output_Degradation_Percent_per_Year / 100, yr - 1) * f.Plant_Availability_Percent / 100;
      const base = yr === 1 ? { lifted: a.offtakeDispatched, excess: a.excess } : st;
      return { green: base.lifted * ramp * deg, grey: base.excess * ramp * deg, total: a.nh3 * ramp * deg };
    };
    const subs = [f.Subsidy_NH3_Y1, f.Subsidy_NH3_Y2, f.Subsidy_NH3_Y3];
    const build = (price) => {
      const cf = []; const rows = [];
      draw.forEach(x => cf.push(-hard * x));          // construction years (IDC excluded from project IRR)
      cf[cf.length - 1] -= 0;
      const dep = (hard * (1 - f.Book_Residual_Percent / 100)) / life;
      let npvCost = 0, npvVol = 0;
      for (let yr = 1; yr <= life; yr++) {
        const v = vol(yr);
        const esc = Math.pow(1 + f.Opex_Escalation_Percent / 100, yr - 1);
        const rev = (v.green * 1000 * (price + (subs[yr - 1] || 0)) + v.grey * 1000 * f.Grey_Ammonia_Price_INR_per_kg) / 1e7;
        const opx = opex1 * esc + repl(yr);
        const ebitda = rev - opx;
        const tx = Math.max(0, (ebitda - dep) * tax);
        let fcf = ebitda - tx;
        if (yr === life) fcf += epc * f.Salvage_Percent_of_EPC / 100;
        cf.push(fcf); rows.push({ yr, rev, opex: opx, ebitda, tax: tx, fcf });
        const df = Math.pow(1 + wacc, yr);
        npvCost += opx / df; npvVol += v.total / df;
      }
      return { cf, rows, npvCost, npvVol };
    };
    const base = build(f.Ammonia_Price_INR_per_kg);
    const pirr = irr(base.cf);
    // levelised cost (pre-tax, real-WACC CRF method) INR/kg
    const crf = wacc / (1 - Math.pow(1 + wacc, -life));
    const annCap = capex * crf;
    const annOpex = base.npvCost * crf;
    const lcoa = a.nh3 > 0 ? (annCap + annOpex) * 1e7 / (a.nh3 * 1000 * f.Plant_Availability_Percent / 100) : NaN;
    // LCOH excluding ammonia loop, H2->NH3 related O&M
    const nh3Share = (sec['Ammonia Loop'] + sec['H2 Storage'] * 0) / epc;
    const lcoh = a.h2 > 0 ? (annCap + annOpex) * (1 - nh3Share) * 1e7 / (a.h2 * 1000) : NaN;
    // breakeven price (project NPV@WACC = 0, post-tax)
    const npvAt = (pp) => build(pp).cf.reduce((s, x, t) => s + x / Math.pow(1 + wacc, t), 0);
    let lo = 0, hi = 500;
    if (npvAt(hi) > 0) { for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (npvAt(mid) > 0) hi = mid; else lo = mid; } }
    const breakeven = (lo + hi) / 2;
    // equity IRR & DSCR (equal principal after moratorium)
    const eq = []; draw.forEach(x => eq.push(-(hard + idc) * x * (1 - f.Gearing_Percent / 100)));
    let bal = debt; const tenor = f.Loan_Tenor_Years, mor = f.Moratorium_Years, prin = debt / Math.max(1, tenor - mor);
    let minDSCR = Infinity;
    base.rows.forEach(r => {
      const intr = bal * i; const pp = r.yr > mor && bal > 1e-9 ? Math.min(prin, bal) : 0; const ds = intr + pp;
      const cfads = r.ebitda - r.tax;
      if (ds > 0) minDSCR = Math.min(minDSCR, cfads / ds);
      bal -= pp; eq.push(r.fcf - ds + intr * tax);
    });
    const eirr = irr(eq);
    return { sec, epc, land, soft, idc, hard, capex, wacc, fixedOpex, opex1, lcoa, lcoh, pirr, eirr, minDSCR, breakeven, rows: base.rows, cf: base.cf, crf, annCap, annOpex };
  }

  Object.assign(TRE, { defaultPlant, PLANT_CASES, derivePlant: derive, runPlant, defaultFinance, runFinance, irr });
})(typeof window !== 'undefined' ? window : globalThis);
