/* =====================================================================
 * TrueRE Hybrid Studio — animated hybrid-plant illustration
 * Hand-built SVG landscape: wind farm, solar field, evacuation line,
 * electrolyser hall, H2 bullet, NH3 spheres. Animation rates are driven
 * by the live results (rotor speed from hub wind, flow speed from output).
 * ===================================================================== */
(function () {
  'use strict';
  const f = (n) => Math.round(n * 10) / 10;

  function turbine(x, base, h, s, delay, op) {
    const hubY = base - h, L = 46 * s, w = 4.2 * s;
    const blade = `M0,0 C${f(w)},${f(-L * 0.12)} ${f(w * 0.9)},${f(-L * 0.55)} ${f(w * 0.25)},${f(-L)} L${f(-w * 0.25)},${f(-L * 0.98)} C${f(-w * 0.55)},${f(-L * 0.5)} ${f(-w * 0.6)},${f(-L * 0.12)} 0,0 Z`;
    return `<g opacity="${op}">
      <path d="M${f(x - 3.2 * s)},${base} L${f(x - 1.3 * s)},${f(hubY + 3)} L${f(x + 1.3 * s)},${f(hubY + 3)} L${f(x + 3.2 * s)},${base} Z" fill="url(#gTower)"/>
      <ellipse cx="${x}" cy="${base + 1}" rx="${f(9 * s)}" ry="${f(2 * s)}" fill="#6E63B8" opacity=".12"/>
      <rect x="${f(x - 3 * s)}" y="${f(hubY - 3.4 * s)}" width="${f(12 * s)}" height="${f(6.4 * s)}" rx="${f(2.6 * s)}" fill="#F7F6FD" stroke="#D9D4F0" stroke-width=".6"/>
      <g class="rotor" style="transform-origin:${x}px ${hubY}px;animation-delay:${delay}s">
        <path d="${blade}" transform="translate(${x},${hubY})" fill="url(#gBlade)" stroke="#D9D4F0" stroke-width=".5"/>
        <path d="${blade}" transform="translate(${x},${hubY}) rotate(120)" fill="url(#gBlade)" stroke="#D9D4F0" stroke-width=".5"/>
        <path d="${blade}" transform="translate(${x},${hubY}) rotate(240)" fill="url(#gBlade)" stroke="#D9D4F0" stroke-width=".5"/>
      </g>
      <circle cx="${x}" cy="${hubY}" r="${f(3.2 * s)}" fill="#FFFFFF" stroke="#CFC8EE" stroke-width=".8"/>
    </g>`;
  }
  function panelRow(x0, y0, n, pw, ph, skew, gap) {
    let s = '', clip = '';
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (pw + gap);
      const p = `M${f(x)},${f(y0)} L${f(x + pw)},${f(y0)} L${f(x + pw + skew)},${f(y0 + ph)} L${f(x + skew)},${f(y0 + ph)} Z`;
      s += `<path d="${p}" fill="url(#gPanel)" stroke="#8E9BDA" stroke-width=".6"/>`;
      // cell grid
      for (let c = 1; c < 6; c++) { const t = c / 6; s += `<line x1="${f(x + pw * t)}" y1="${f(y0)}" x2="${f(x + pw * t + skew)}" y2="${f(y0 + ph)}" stroke="#BFC8F1" stroke-width=".35"/>`; }
      for (let r = 1; r < 3; r++) { const t = r / 3; s += `<line x1="${f(x + skew * t)}" y1="${f(y0 + ph * t)}" x2="${f(x + pw + skew * t)}" y2="${f(y0 + ph * t)}" stroke="#BFC8F1" stroke-width=".35"/>`; }
      s += `<line x1="${f(x + skew * 0.6 + pw * 0.2)}" y1="${f(y0 + ph)}" x2="${f(x + skew * 0.6 + pw * 0.2)}" y2="${f(y0 + ph + 7)}" stroke="#A9A4C9" stroke-width="1.1"/><line x1="${f(x + skew * 0.6 + pw * 0.8)}" y1="${f(y0 + ph)}" x2="${f(x + skew * 0.6 + pw * 0.8)}" y2="${f(y0 + ph + 7)}" stroke="#A9A4C9" stroke-width="1.1"/>`;
      clip += p + ' ';
    }
    return { s, clip };
  }
  function pylon(x, base, h) {
    const t = base - h;
    return `<g stroke="#9E98C4" stroke-width=".9" fill="none" opacity=".85">
      <path d="M${x - 9},${base} L${x - 2},${t} L${x + 2},${t} L${x + 9},${base}"/>
      <path d="M${x - 7},${base - h * 0.25} L${x + 7},${base - h * 0.5} M${x + 7},${base - h * 0.25} L${x - 7},${base - h * 0.5} M${x - 5},${base - h * 0.55} L${x + 5},${base - h * 0.78} M${x + 5},${base - h * 0.55} L${x - 5},${base - h * 0.78}"/>
      <path d="M${x - 14},${t + 8} L${x + 14},${t + 8} M${x - 10},${t + 16} L${x + 10},${t + 16}"/></g>`;
  }
  function svg() {
    const G = 196; // ground line
    const rows = [panelRow(318, G - 34, 5, 26, 11, -7, 4), panelRow(304, G - 18, 6, 26, 11, -7, 4), panelRow(292, G - 2, 6, 27, 11, -7, 4)];
    const clip = rows.map(r => r.clip).join(' ');
    return `<svg class="scene" viewBox="0 0 900 230" preserveAspectRatio="xMaxYMax meet" aria-hidden="true">
    <defs>
      <linearGradient id="gTower" x1="0" x2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E4E0F5"/></linearGradient>
      <linearGradient id="gBlade" x1="0" x2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#ECE9F8"/></linearGradient>
      <linearGradient id="gPanel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8FA3F0"/><stop offset="1" stop-color="#6B7FD9"/></linearGradient>
      <linearGradient id="gGlint" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <linearGradient id="gHill1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D9D2FB"/><stop offset="1" stop-color="#E9E5FD"/></linearGradient>
      <linearGradient id="gHill2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C9EEDF"/><stop offset="1" stop-color="#E5F7F0"/></linearGradient>
      <linearGradient id="gGround" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F5FBF7"/><stop offset="1" stop-color="#FFFFFF" stop-opacity=".2"/></linearGradient>
      <linearGradient id="gHall" x1="0" x2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#ECE8FA"/></linearGradient>
      <linearGradient id="gBullet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#DDF3EB"/><stop offset="1" stop-color="#A9DFCB"/></linearGradient>
      <radialGradient id="gSphere" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#E7E2FB"/><stop offset="1" stop-color="#B9AEEC"/></radialGradient>
      <radialGradient id="gSun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFE6B3"/><stop offset=".55" stop-color="#FFD08A" stop-opacity=".55"/><stop offset="1" stop-color="#FFD08A" stop-opacity="0"/></radialGradient>
      <clipPath id="cPanels"><path d="${clip}"/></clipPath>
    </defs>
    <g class="sun"><circle cx="0" cy="0" r="46" fill="url(#gSun)"/><circle cx="0" cy="0" r="15" fill="#FFD597"/><circle cx="-4" cy="-4" r="6" fill="#FFE9C4"/></g>
    <g class="clouds" fill="#FFFFFF">
      <g class="cl c1" opacity=".9"><ellipse cx="540" cy="46" rx="30" ry="9"/><ellipse cx="528" cy="40" rx="14" ry="10"/><ellipse cx="548" cy="37" rx="17" ry="13"/></g>
      <g class="cl c2" opacity=".75"><ellipse cx="760" cy="30" rx="24" ry="7"/><ellipse cx="770" cy="24" rx="13" ry="10"/></g>
      <g class="cl c3" opacity=".6"><ellipse cx="340" cy="58" rx="20" ry="6"/><ellipse cx="348" cy="53" rx="10" ry="8"/></g>
    </g>
    <path d="M0,170 C90,130 170,150 250,128 C330,106 420,142 520,120 C610,100 700,132 780,114 C840,102 880,112 900,108 L900,230 L0,230 Z" fill="url(#gHill1)" opacity=".85"/>
    ${turbine(92, 168, 88, 0.72, -0.4, 0.75)}${turbine(168, 160, 92, 0.78, -1.3, 0.8)}${turbine(236, 166, 84, 0.68, -2.1, 0.7)}
    <path d="M0,192 C120,168 230,186 330,170 C450,152 560,182 690,166 C780,156 850,168 900,160 L900,230 L0,230 Z" fill="url(#gHill2)"/>
    ${turbine(48, 194, 112, 0.95, -0.9, 1)}${turbine(140, 196, 122, 1.0, -1.7, 1)}
    <rect x="0" y="${G}" width="900" height="40" fill="url(#gGround)"/>
    ${pylon(560, G - 2, 64)}
    <path class="wire" d="M548,${G - 58} C590,${G - 44} 620,${G - 46} 640,${G - 52}" stroke="#B9B3DB" stroke-width=".8" fill="none"/>
    <path class="wire" d="M490,${G - 30} C512,${G - 48} 530,${G - 56} 548,${G - 58}" stroke="#B9B3DB" stroke-width=".8" fill="none"/>
    <path class="elec" d="M490,${G - 30} C512,${G - 48} 530,${G - 56} 548,${G - 58} C590,${G - 44} 620,${G - 46} 640,${G - 52}" stroke="#F6B96C" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    ${rows.map(r => r.s).join('')}
    <g clip-path="url(#cPanels)"><rect class="glint" x="250" y="${G - 40}" width="60" height="60" fill="url(#gGlint)" transform="skewX(-20)"/></g>
    <!-- electrolyser hall -->
    <g>
      <ellipse cx="672" cy="${G + 1}" rx="46" ry="4" fill="#6E63B8" opacity=".10"/>
      <path d="M630,${G} L630,${G - 44} L672,${G - 58} L714,${G - 44} L714,${G} Z" fill="url(#gHall)" stroke="#D2CCEE" stroke-width=".8"/>
      <path d="M630,${G - 44} L672,${G - 58} L714,${G - 44}" fill="none" stroke="#9D8CF7" stroke-width="1.6" stroke-linejoin="round"/>
      ${[0, 1, 2, 3].map(i => `<rect x="${638 + i * 19}" y="${G - 34}" width="12" height="9" rx="2" fill="#E6F3FD" stroke="#C3DDF5" stroke-width=".6"/>`).join('')}
      <rect x="664" y="${G - 18}" width="16" height="18" rx="2" fill="#EEEBFF" stroke="#D2CCEE" stroke-width=".6"/>
      <text x="672" y="${G - 22}" font-size="5.2" text-anchor="middle" fill="#8E86B8" font-family="Inter,sans-serif" font-weight="700" letter-spacing=".6">ELECTROLYSER</text>
      <rect x="700" y="${G - 66}" width="6" height="20" rx="1.5" fill="#F1EEFB" stroke="#D2CCEE" stroke-width=".6"/>
      ${[0, 1, 2, 3, 4].map(i => `<circle class="bub b${i}" cx="${703 + (i % 2 ? 2 : -2)}" cy="${G - 68}" r="${2 + (i % 3)}" fill="#BDEBDB" opacity=".0"/>`).join('')}
    </g>
    <!-- H2 bullet -->
    <g><rect x="724" y="${G - 22}" width="40" height="15" rx="7.5" fill="url(#gBullet)" stroke="#9EDCC5" stroke-width=".8"/>
      <rect x="730" y="${G - 7}" width="3" height="7" fill="#B6B0D6"/><rect x="755" y="${G - 7}" width="3" height="7" fill="#B6B0D6"/>
      <text x="744" y="${G - 12.6}" font-size="5.5" text-anchor="middle" fill="#3E9F7F" font-family="Inter,sans-serif" font-weight="800">H₂</text></g>
    <!-- ammonia loop column -->
    <g><rect x="772" y="${G - 62}" width="9" height="62" rx="3" fill="url(#gHall)" stroke="#D2CCEE" stroke-width=".8"/>
      ${[0, 1, 2].map(i => `<circle class="steam s${i}" cx="776.5" cy="${G - 64}" r="4" fill="#FFFFFF" opacity="0"/>`).join('')}</g>
    <!-- NH3 spheres -->
    ${[[806, 22, ''], [852, 18, 'NH₃']].map(([cx, r, lab]) => `<g><ellipse cx="${cx}" cy="${G + 1}" rx="${r + 4}" ry="3" fill="#6E63B8" opacity=".12"/>
      <path d="M${cx - r * 0.6},${G - r * 0.6} L${cx - r * 0.75},${G} M${cx + r * 0.6},${G - r * 0.6} L${cx + r * 0.75},${G} M${cx},${G - r * 0.4} L${cx},${G}" stroke="#B6B0D6" stroke-width="1.6"/>
      <circle cx="${cx}" cy="${G - r - 6}" r="${r}" fill="url(#gSphere)" stroke="#C9C0F2" stroke-width=".8"/>
      <path d="M${cx - r},${G - r - 6} Q${cx},${G - r} ${cx + r},${G - r - 6}" fill="none" stroke="#C9C0F2" stroke-width=".6"/>
      ${lab ? `<text x="${cx}" y="${G - r - 3}" font-size="6.5" text-anchor="middle" fill="#7C6CF2" font-family="Inter,sans-serif" font-weight="800">${lab}</text>` : ''}</g>`).join('')}
    <!-- process pipes with product flow -->
    <path d="M714,${G - 10} L724,${G - 10} M764,${G - 14} L772,${G - 14} M781,${G - 30} L792,${G - 30} L792,${G - 40}" stroke="#C9C0F2" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path class="flow" d="M714,${G - 10} L724,${G - 10} M764,${G - 14} L772,${G - 14} M781,${G - 30} L792,${G - 30} L792,${G - 40}" stroke="#8FDCC3" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <path d="M828,${G - 26} L836,${G - 26}" stroke="#C9C0F2" stroke-width="3"/>
    </svg>`;
  }
  window.TRE_SCENE = { svg };

  /* ---------------- detailed animated process flow diagram ---------------- */
  function lbl(x, y, title, val, color) {
    return `<g class="pl"><rect x="${x - 66}" y="${y - 19}" width="132" height="38" rx="11" fill="var(--surface)" stroke="var(--border)" />
      <rect x="${x - 58}" y="${y - 10}" width="6" height="20" rx="3" fill="${color}"/>
      <text x="${x - 45}" y="${y - 3}" font-size="10" fill="var(--muted)" font-weight="600">${title}</text>
      <text x="${x - 45}" y="${y + 12}" font-size="12.5" fill="var(--text)" font-weight="800">${val}</text></g>`;
  }
  function processDiagram(d) {
    const B = 250; // ground
    let panels = '';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      const x = 28 + c * 27 - r * 6, y = B - 58 + r * 17;
      panels += `<path d="M${x},${y} L${x + 23},${y} L${x + 18},${y + 12} L${x - 5},${y + 12} Z" fill="url(#pPanel)" stroke="#8E9BDA" stroke-width=".6"/>
        <line x1="${x + 7.6}" y1="${y}" x2="${x + 2.6}" y2="${y + 12}" stroke="#C3CCF3" stroke-width=".4"/><line x1="${x + 15.3}" y1="${y}" x2="${x + 10.3}" y2="${y + 12}" stroke="#C3CCF3" stroke-width=".4"/>
        <line x1="${x + 9}" y1="${y + 12}" x2="${x + 9}" y2="${y + 17}" stroke="#AAA4CC" stroke-width="1"/>`;
    }
    const stacks = [0, 1, 2, 3].map(i => `<g transform="translate(0,${i * 15})">
        <rect x="300" y="${B - 82}" width="58" height="11" rx="5.5" fill="url(#pStack)" stroke="#A8DCC9" stroke-width=".7"/>
        ${[0, 1, 2, 3, 4, 5, 6, 7].map(k => `<line x1="${306 + k * 6.5}" y1="${B - 82}" x2="${306 + k * 6.5}" y2="${B - 71}" stroke="#9ED6C2" stroke-width=".7"/>`).join('')}
        <circle class="pbub" style="animation-delay:${-i * 0.45}s" cx="${362}" cy="${B - 77}" r="1.8" fill="#8FDCC3"/></g>`).join('');
    const soc = Math.max(0.08, Math.min(1, d.soc || 0.5));
    return `<svg class="pfd" viewBox="0 8 1200 262" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Animated process flow of the hybrid green ammonia plant">
    <defs>
      <linearGradient id="pPanel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9DB0F4"/><stop offset="1" stop-color="#7286DC"/></linearGradient>
      <linearGradient id="pStack" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#DDF4EC"/><stop offset="1" stop-color="#B4E4D3"/></linearGradient>
      <linearGradient id="pVessel" x1="0" x2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".45" stop-color="#F1EEFC"/><stop offset="1" stop-color="#CFC7F1"/></linearGradient>
      <linearGradient id="pHot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE1D8"/><stop offset="1" stop-color="#FFB4A2"/></linearGradient>
      <linearGradient id="pCont" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FDEBF3"/><stop offset="1" stop-color="#F6C9DB"/></linearGradient>
      <radialGradient id="pSph" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#E9E4FC"/><stop offset="1" stop-color="#B5A9EC"/></radialGradient>
      <linearGradient id="pGround" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--surface-3)"/><stop offset="1" stop-color="var(--surface)" stop-opacity="0"/></linearGradient>
      <clipPath id="pSoc"><rect x="214" y="${B - 46}" width="${58 * soc}" height="5" rx="2.5"/></clipPath>
    </defs>
    <rect x="0" y="${B}" width="1200" height="50" fill="url(#pGround)"/>
    <line x1="0" y1="${B}" x2="1200" y2="${B}" stroke="var(--border-strong)" stroke-dasharray="3 5"/>
    <!-- power bus -->
    <path d="M118,${B - 52} L170,${B - 52} L170,${B - 104} L300,${B - 104}" class="pp pow" />
    <path d="M196,${B - 52} L212,${B - 52}" class="pp pow"/>
    <path d="M60,${B - 140} L60,${B - 160} L170,${B - 160} L170,${B - 104}" class="pp pow"/>
    <path d="M272,${B - 52} L286,${B - 52} L286,${B - 96} L300,${B - 96}" class="pp pow dim"/>
    <!-- H2 line -->
    <path d="M362,${B - 60} L400,${B - 60}" class="pp h2"/>
    <path d="M436,${B - 60} L470,${B - 60} L470,${B - 40} L560,${B - 40}" class="pp h2"/>
    <!-- N2 line -->
    <path d="M524,${B - 120} L540,${B - 120} L540,${B - 52} L560,${B - 52}" class="pp n2"/>
    <!-- syngas -> converter -> separator -> storage -->
    <path d="M596,${B - 46} L640,${B - 46} L640,${B - 140} L668,${B - 140}" class="pp syn"/>
    <path d="M690,${B - 34} L740,${B - 34} L740,${B - 96} L756,${B - 96}" class="pp syn"/>
    <path d="M800,${B - 30} L850,${B - 30}" class="pp nh3"/>
    <path d="M778,${B - 132} L778,${B - 168} L654,${B - 168} L654,${B - 140}" class="pp rec"/>
    <path d="M956,${B - 30} L1010,${B - 30} L1010,${B - 58} L1046,${B - 58}" class="pp nh3"/>
    <!-- wind turbine -->
    <g><path d="M57,${B - 64} L59,${B - 140} L61,${B - 140} L63,${B - 64} Z" fill="url(#pVessel)" stroke="#D2CCEE" stroke-width=".6"/>
      <g class="rotor" style="transform-origin:60px ${B - 142}px">${[0, 120, 240].map(a => `<path d="M0,0 C3.5,-6 3.2,-22 1,-34 L-1,-34 C-2.6,-22 -3,-6 0,0Z" transform="translate(60,${B - 142}) rotate(${a})" fill="#FFFFFF" stroke="#CFC8EE" stroke-width=".6"/>`).join('')}</g>
      <circle cx="60" cy="${B - 142}" r="3" fill="#fff" stroke="#BDB4EA"/></g>
    ${panels}
    <rect class="glint2" x="10" y="${B - 62}" width="26" height="60" fill="#fff" opacity=".0"/>
    <!-- BESS container -->
    <g><rect x="212" y="${B - 64}" width="62" height="40" rx="4" fill="url(#pCont)" stroke="#EFB3CB" stroke-width=".8"/>
      ${[0, 1, 2, 3, 4, 5].map(i => `<line x1="${220 + i * 9}" y1="${B - 60}" x2="${220 + i * 9}" y2="${B - 52}" stroke="#F2BCD1" stroke-width="2"/>`).join('')}
      <rect x="214" y="${B - 46}" width="58" height="5" rx="2.5" fill="#FBDDE9"/><rect class="socfill" x="214" y="${B - 46}" width="58" height="5" rx="2.5" fill="#EF86AE" clip-path="url(#pSoc)"/>
      <rect x="216" y="${B - 36}" width="10" height="12" rx="1" fill="#F8D3E2"/><rect x="226" y="${B - 24}" width="40" height="3" fill="#D7A6BB"/></g>
    <!-- electrolyser skid -->
    <g><rect x="292" y="${B - 92}" width="78" height="76" rx="8" fill="none" stroke="var(--border-strong)" stroke-dasharray="3 3"/>${stacks}
      <rect x="300" y="${B - 16}" width="62" height="6" rx="2" fill="#CFC8EE"/></g>
    <!-- H2 vessel -->
    <g><rect x="400" y="${B - 112}" width="36" height="96" rx="18" fill="url(#pStack)" stroke="#9EDCC5" stroke-width=".9"/>
      <rect class="lvl" x="404" y="${B - 46}" width="28" height="26" rx="12" fill="#8FDCC3" opacity=".55"/>
      <path d="M406,${B - 16} L403,${B} M430,${B - 16} L433,${B}" stroke="#AAA4CC" stroke-width="1.6"/>
      <text x="418" y="${B - 66}" font-size="9" text-anchor="middle" fill="#2E9C79" font-weight="800">H₂</text></g>
    <!-- ASU column -->
    <g><rect x="500" y="${B - 168}" width="24" height="150" rx="10" fill="url(#pVessel)" stroke="#C9C0F2" stroke-width=".9"/>
      ${[0, 1, 2, 3, 4, 5, 6].map(i => `<line x1="502" y1="${B - 150 + i * 18}" x2="522" y2="${B - 150 + i * 18}" stroke="#DCD6F5" stroke-width=".8"/>`).join('')}
      <text x="512" y="${B - 176}" font-size="7.5" text-anchor="middle" fill="var(--muted)" font-weight="700">ASU · N₂</text></g>
    <!-- compressor -->
    <g><circle cx="578" cy="${B - 46}" r="18" fill="url(#pVessel)" stroke="#C9C0F2" stroke-width=".9"/>
      <g class="imp" style="transform-origin:578px ${B - 46}px">${[0, 60, 120, 180, 240, 300].map(a => `<path d="M0,0 Q5,-5 3,-13" transform="translate(578,${B - 46}) rotate(${a})" stroke="#9D8CF7" stroke-width="1.6" fill="none" stroke-linecap="round"/>`).join('')}</g>
      <circle cx="578" cy="${B - 46}" r="3" fill="#9D8CF7"/><rect x="566" y="${B - 28}" width="24" height="28" fill="#E2DDF6" rx="2"/></g>
    <!-- converter -->
    <g><rect x="668" y="${B - 186}" width="44" height="170" rx="20" fill="url(#pVessel)" stroke="#C9C0F2" stroke-width=".9"/>
      <rect class="hot" x="674" y="${B - 160}" width="32" height="110" rx="14" fill="url(#pHot)" opacity=".75"/>
      ${[0, 1, 2].map(i => `<line x1="676" y1="${B - 140 + i * 34}" x2="704" y2="${B - 140 + i * 34}" stroke="#FFFFFF" stroke-width="1.4" stroke-dasharray="2 2"/>`).join('')}
      <path d="M674,${B - 16} L670,${B} M706,${B - 16} L710,${B}" stroke="#AAA4CC" stroke-width="2"/>
      <text x="690" y="${B - 194}" font-size="7.5" text-anchor="middle" fill="var(--muted)" font-weight="700">HABER–BOSCH</text></g>
    <!-- separator / chiller -->
    <g><rect x="756" y="${B - 132}" width="44" height="116" rx="16" fill="url(#pVessel)" stroke="#C9C0F2" stroke-width=".9"/>
      ${[0, 1, 2, 3].map(i => `<circle class="drip" style="animation-delay:${-i * 0.5}s" cx="${770 + (i % 2) * 14}" cy="${B - 100}" r="2" fill="#9D8CF7"/>`).join('')}
      <rect x="760" y="${B - 46}" width="36" height="24" rx="10" fill="#C9BEF8" opacity=".6"/></g>
    <!-- NH3 storage spheres -->
    ${[[880, 30], [934, 24]].map(([cx, r]) => `<g><ellipse cx="${cx}" cy="${B + 2}" rx="${r + 6}" ry="3.5" fill="#6E63B8" opacity=".12"/>
      <path d="M${cx - r * .6},${B - r * .7} L${cx - r * .8},${B} M${cx + r * .6},${B - r * .7} L${cx + r * .8},${B} M${cx},${B - r * .5} L${cx},${B}" stroke="#AAA4CC" stroke-width="2"/>
      <circle cx="${cx}" cy="${B - r - 10}" r="${r}" fill="url(#pSph)" stroke="#C3B9F2" stroke-width=".9"/>
      <path d="M${cx - r},${B - r - 10} Q${cx},${B - r - 3} ${cx + r},${B - r - 10}" stroke="#C9C0F2" fill="none" stroke-width=".7"/></g>`).join('')}
    <text x="880" y="${B - 37}" font-size="10" text-anchor="middle" fill="#7C6CF2" font-weight="800">NH₃</text>
    <!-- loading gantry and tanker -->
    <g><path d="M1046,${B} L1046,${B - 70} L1084,${B - 70}" stroke="#AAA4CC" stroke-width="2" fill="none"/><path d="M1084,${B - 70} L1084,${B - 50}" stroke="#9D8CF7" stroke-width="1.6"/>
      <g class="truck"><rect x="1062" y="${B - 46}" width="76" height="30" rx="15" fill="url(#pSph)" stroke="#C3B9F2" stroke-width=".9"/>
        <path d="M1140,${B - 34} L1158,${B - 34} L1166,${B - 24} L1166,${B - 14} L1140,${B - 14} Z" fill="#FDE6F0" stroke="#EFB3CB" stroke-width=".9"/>
        <rect x="1146" y="${B - 31}" width="10" height="7" rx="1.5" fill="#E6F3FD"/>
        ${[1076, 1098, 1124, 1154].map(x => `<circle cx="${x}" cy="${B - 10}" r="6" fill="#6E6A8A"/><circle cx="${x}" cy="${B - 10}" r="2.4" fill="#D7D3E6"/>`).join('')}</g></g>
    <!-- labels -->
    ${lbl(92, B - 218, 'Renewable power', d.re, '#F5A65B')}
    ${lbl(246, B - 122, 'Battery storage', d.bess, '#EF86AE')}
    ${lbl(332, B - 160, 'Electrolysers', d.ely, '#4CC3A0')}
    ${lbl(430, B - 218, 'H₂ production', d.h2, '#4CC3A0')}
    ${lbl(596, B - 218, 'Synthesis loop', d.loop, '#9284F7')}
    ${lbl(790, B - 218, 'NH₃ to storage', d.nh3, '#9284F7')}
    ${lbl(908, B - 132, 'Tank inventory', d.tank, '#7C6CF2')}
    ${lbl(1110, B - 122, 'Offtake', d.offtake, '#5EAEEB')}
    </svg>`;
  }
  window.TRE_SCENE.processDiagram = processDiagram;
})();
