/* =====================================================================
 * TrueRE Hybrid Studio — isometric plant view
 * Hand-built line-art isometric illustration of the hybrid green
 * ammonia complex, composed from parametric primitives and depth sorted.
 * Animated: turbine rotors, product/H2/power flows on the pipe rack,
 * column vapour, aviation lights, trucks and cars on the site roads.
 * ===================================================================== */
(function () {
  'use strict';
  const S = 5.7, OX = 500, OY = 262, C30 = Math.cos(Math.PI / 6), S30 = 0.5;
  const P = (x, y, z) => [OX + (x - y) * C30 * S, OY + (x + y) * S30 * S - (z || 0) * S];
  const pt = (x, y, z) => P(x, y, z).map(v => v.toFixed(1)).join(',');
  const INK = '#3E416B', LW = 0.9;
  const items = [];
  const add = (depth, svg) => items.push([depth, svg]);
  const poly = (pts, fill, extra) => `<polygon points="${pts.map(p => pt(...p)).join(' ')}" fill="${fill}" stroke="${INK}" stroke-width="${LW}" stroke-linejoin="round" ${extra || ''}/>`;

  function box(x, y, z, w, d, h, c, depthBias, opt) {
    const o = opt || {};
    const top = [[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]];
    const right = [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]];
    const left = [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]];
    let s = poly(left, c[1]) + poly(right, c[2]) + poly(top, c[0]);
    if (o.windows) { // window strip on the left (front) face
      for (let i = 0; i < o.windows; i++) { const wx = x + (i + 0.6) * w / (o.windows + 0.2); s += poly([[wx, y + d, z + h * 0.55], [wx + w / (o.windows * 2.2), y + d, z + h * 0.55], [wx + w / (o.windows * 2.2), y + d, z + h * 0.78], [wx, y + d, z + h * 0.78]], '#E9F5FD'); }
    }
    if (o.door) s += poly([[x + w * 0.42, y + d, z], [x + w * 0.58, y + d, z], [x + w * 0.58, y + d, z + h * 0.45], [x + w * 0.42, y + d, z + h * 0.45]], c[2]);
    if (o.ribs) for (let i = 1; i < o.ribs; i++) { const yy = y + d * i / o.ribs; s += `<line x1="${P(x + w, yy, z)[0]}" y1="${P(x + w, yy, z)[1]}" x2="${P(x + w, yy, z + h)[0]}" y2="${P(x + w, yy, z + h)[1]}" stroke="${INK}" stroke-width=".45" opacity=".55"/>`; }
    add(x + w / 2 + y + d / 2 + (depthBias || 0), s);
  }
  function gable(x, y, z, w, d, h, rh, c) { // building with a gable roof (ridge along x)
    const left = [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]];
    const right = [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y + d / 2, z + h + rh], [x + w, y, z + h]];
    const roofF = [[x, y + d, z + h], [x + w, y + d, z + h], [x + w, y + d / 2, z + h + rh], [x, y + d / 2, z + h + rh]];
    const roofB = [[x, y, z + h], [x + w, y, z + h], [x + w, y + d / 2, z + h + rh], [x, y + d / 2, z + h + rh]];
    let s = poly(roofB, c[0]) + poly(left, c[1]) + poly(right, c[2]) + poly(roofF, c[3] || c[0]);
    for (let i = 1; i < 9; i++) { const xx = x + w * i / 9; s += `<line x1="${P(xx, y + d, z + h)[0]}" y1="${P(xx, y + d, z + h)[1]}" x2="${P(xx, y + d / 2, z + h + rh)[0]}" y2="${P(xx, y + d / 2, z + h + rh)[1]}" stroke="${INK}" stroke-width=".4" opacity=".45"/>`; }
    for (let i = 0; i < 6; i++) { const wx = x + 1.2 + i * (w - 2) / 6; s += poly([[wx, y + d, z + h * 0.5], [wx + 1.6, y + d, z + h * 0.5], [wx + 1.6, y + d, z + h * 0.8], [wx, y + d, z + h * 0.8]], '#E9F5FD'); }
    s += poly([[x + w * 0.62, y + d, z], [x + w * 0.8, y + d, z], [x + w * 0.8, y + d, z + h * 0.62], [x + w * 0.62, y + d, z + h * 0.62]], '#D3EEE2');
    add(x + w / 2 + y + d / 2, s);
  }
  let gid = 0;
  function cyl(cx, cy, z, r, h, col, opt) {
    const o = opt || {};
    const a = r * S * Math.SQRT2 * C30, b = r * S * Math.SQRT2 * S30;
    const [tx, ty] = P(cx, cy, z + h), [bx, by] = P(cx, cy, z);
    const id = 'cg' + (gid++);
    let s = `<defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="${col[1]}"/><stop offset=".55" stop-color="${col[0]}"/><stop offset="1" stop-color="${col[2]}"/></linearGradient></defs>`;
    s += `<path d="M${(bx - a).toFixed(1)},${by.toFixed(1)} L${(tx - a).toFixed(1)},${ty.toFixed(1)} A${a.toFixed(1)},${b.toFixed(1)} 0 0 0 ${(tx + a).toFixed(1)},${ty.toFixed(1)} L${(bx + a).toFixed(1)},${by.toFixed(1)} A${a.toFixed(1)},${b.toFixed(1)} 0 0 1 ${(bx - a).toFixed(1)},${by.toFixed(1)} Z" fill="url(#${id})" stroke="${INK}" stroke-width="${LW}"/>`;
    if (o.rings) for (let i = 1; i < o.rings; i++) { const yy = by - (by - ty) * i / o.rings; s += `<path d="M${(bx - a).toFixed(1)},${yy.toFixed(1)} A${a.toFixed(1)},${b.toFixed(1)} 0 0 0 ${(bx + a).toFixed(1)},${yy.toFixed(1)}" fill="none" stroke="${INK}" stroke-width=".45" opacity=".5" transform="scale(1,1)"/>`.replace('0 0 0', '0 0 0'); }
    if (o.dome) {
      const dh = o.dome * S;
      s += `<path d="M${(tx - a).toFixed(1)},${ty.toFixed(1)} C${(tx - a).toFixed(1)},${(ty - dh).toFixed(1)} ${(tx + a).toFixed(1)},${(ty - dh).toFixed(1)} ${(tx + a).toFixed(1)},${ty.toFixed(1)} A${a.toFixed(1)},${b.toFixed(1)} 0 0 1 ${(tx - a).toFixed(1)},${ty.toFixed(1)} Z" fill="${col[3] || col[0]}" stroke="${INK}" stroke-width="${LW}"/>`;
      s += `<path d="M${(tx - a * 0.5).toFixed(1)},${(ty - dh * 0.62).toFixed(1)} Q${tx.toFixed(1)},${(ty - dh * 0.86).toFixed(1)} ${(tx + a * 0.35).toFixed(1)},${(ty - dh * 0.7).toFixed(1)}" fill="none" stroke="#fff" stroke-width="2" opacity=".55" stroke-linecap="round"/>`;
    } else s += `<ellipse cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" rx="${a.toFixed(1)}" ry="${b.toFixed(1)}" fill="${col[3] || col[0]}" stroke="${INK}" stroke-width="${LW}"/>`;
    if (o.platforms) o.platforms.forEach(pz => { const [px, py] = P(cx, cy, z + pz); s += `<ellipse cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" rx="${(a * 1.45).toFixed(1)}" ry="${(b * 1.45).toFixed(1)}" fill="none" stroke="${INK}" stroke-width="1.1"/><ellipse cx="${px.toFixed(1)}" cy="${(py - 3).toFixed(1)}" rx="${(a * 1.45).toFixed(1)}" ry="${(b * 1.45).toFixed(1)}" fill="none" stroke="${INK}" stroke-width=".5" opacity=".6"/>`; });
    if (o.ladder) { const [lx, ly] = P(cx + r * 0.7, cy + r * 0.7, z); const [lx2, ly2] = P(cx + r * 0.7, cy + r * 0.7, z + h); s += `<path d="M${lx - 2},${ly} L${lx2 - 2},${ly2} M${lx + 2},${ly} L${lx2 + 2},${ly2}" stroke="${INK}" stroke-width=".6"/>`; for (let k = 0; k < h; k += 1.2) { const [rx, ry] = P(cx + r * 0.7, cy + r * 0.7, z + k); s += `<line x1="${rx - 2}" y1="${ry}" x2="${rx + 2}" y2="${ry}" stroke="${INK}" stroke-width=".45"/>`; } }
    if (o.light) s += `<circle class="blink" cx="${tx.toFixed(1)}" cy="${(ty - (o.dome ? o.dome * S : 0) - 3).toFixed(1)}" r="2.2" fill="#FF6B6B"/>`;
    if (o.steam) for (let k = 0; k < 3; k++) s += `<circle class="isteam" style="animation-delay:${-k * 1.4}s" cx="${tx.toFixed(1)}" cy="${(ty - 4).toFixed(1)}" r="${(a * 0.7).toFixed(1)}" fill="#FFFFFF"/>`;
    add(cx + cy + (o.bias || 0), s);
  }
  function hvessel(x, y, z, len, r, col, along) { // horizontal vessel on saddles
    const a = along === 'y';
    const p1 = a ? P(x, y, z + r) : P(x, y, z + r), p2 = a ? P(x, y + len, z + r) : P(x + len, y, z + r);
    const w = r * 2 * S;
    let s = '';
    for (const t of [0.2, 0.8]) { const sx = a ? x : x + len * t, sy = a ? y + len * t : y; s += `<line x1="${P(sx, sy, 0)[0]}" y1="${P(sx, sy, 0)[1]}" x2="${P(sx, sy, z + r)[0]}" y2="${P(sx, sy, z + r)[1]}" stroke="${INK}" stroke-width="2.2"/>`; }
    s += `<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="${INK}" stroke-width="${w + 1.8}" stroke-linecap="round"/>`;
    s += `<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="${col[0]}" stroke-width="${w}" stroke-linecap="round"/>`;
    s += `<line x1="${p1[0]}" y1="${p1[1] - w * 0.22}" x2="${p2[0]}" y2="${p2[1] - w * 0.22}" stroke="#FFFFFF" stroke-width="${w * 0.18}" stroke-linecap="round" opacity=".6"/>`;
    add(x + y + len / 2 + 1, s);
  }
  // long element split into short depth-sorted segments
  function pipe(pts, col, wpx, cls, bias) {
    for (let i = 0; i < pts.length - 1; i++) {
      const A = pts[i], B = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) / 5));
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const a = A.map((v, j) => v + (B[j] - v) * t0), b = A.map((v, j) => v + (B[j] - v) * t1);
        const p1 = P(...a), p2 = P(...b);
        let s = `<line x1="${p1[0].toFixed(1)}" y1="${p1[1].toFixed(1)}" x2="${p2[0].toFixed(1)}" y2="${p2[1].toFixed(1)}" stroke="${INK}" stroke-width="${wpx + 1.8}" stroke-linecap="round"/><line x1="${p1[0].toFixed(1)}" y1="${p1[1].toFixed(1)}" x2="${p2[0].toFixed(1)}" y2="${p2[1].toFixed(1)}" stroke="${col}" stroke-width="${wpx}" stroke-linecap="round"/>`;
        if (cls) s += `<line class="${cls}" x1="${p1[0].toFixed(1)}" y1="${p1[1].toFixed(1)}" x2="${p2[0].toFixed(1)}" y2="${p2[1].toFixed(1)}" stroke-width="${Math.max(1.2, wpx * 0.45)}" stroke-linecap="round"/>`;
        add((a[0] + b[0]) / 2 + (a[1] + b[1]) / 2 + (bias || 0.3), s);
      }
    }
  }
  function rackX(x0, x1, y, h, d) { // pipe rack along x: bents every 5 units
    for (let x = x0; x <= x1; x += 5) {
      let s = '';
      for (const yy of [y, y + d]) { const a = P(x, yy, 0), b = P(x, yy, h); s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${INK}" stroke-width="2.4"/><line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#B8B2E4" stroke-width="1.2"/>`; }
      const c = P(x, y, h), e = P(x, y + d, h), m1 = P(x, y, h * 0.55), m2 = P(x, y + d, h * 0.55);
      s += `<line x1="${c[0]}" y1="${c[1]}" x2="${e[0]}" y2="${e[1]}" stroke="${INK}" stroke-width="2"/><line x1="${m1[0]}" y1="${m1[1]}" x2="${m2[0]}" y2="${m2[1]}" stroke="${INK}" stroke-width="1.2"/>`;
      add(x + y + d / 2 - 0.4, s);
    }
    const beam = (yy, z) => pipe([[x0, yy, z], [x1, yy, z]], '#9D97CF', 1.6, null, -0.2);
    beam(y, h); beam(y + d, h); beam(y, h * 0.55); beam(y + d, h * 0.55);
  }
  function stairs(x, y, h) {
    let s = '', n = Math.ceil(h / 0.8);
    for (let i = 0; i < n; i++) { const a = P(x + i * 0.45, y, i * 0.8), b = P(x + (i + 1) * 0.45, y, i * 0.8); s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#E8A35A" stroke-width="1.6"/>`; }
    const a = P(x, y, 0), b = P(x + n * 0.45, y, h), a2 = P(x, y, 1.1), b2 = P(x + n * 0.45, y, h + 1.1);
    s += `<line x1="${a2[0]}" y1="${a2[1]}" x2="${b2[0]}" y2="${b2[1]}" stroke="${INK}" stroke-width=".8"/><line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${INK}" stroke-width="1"/>`;
    add(x + y + 2, s);
  }
  function solarField(x0, y0, nx, ny) {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i * 3.4, y = y0 + j * 2.6;
      const q = [[x, y, 0.7], [x + 3, y, 0.7], [x + 3, y + 1.9, 1.9], [x, y + 1.9, 1.9]];
      let s = `<polygon points="${q.map(p => pt(...p)).join(' ')}" fill="#93A6EC" stroke="#5E6BAE" stroke-width=".5"/>`;
      const m1 = P(x + 1.5, y, 0.9), m2 = P(x + 1.5, y + 1.4, 1.9); s += `<line x1="${m1[0]}" y1="${m1[1]}" x2="${m2[0]}" y2="${m2[1]}" stroke="#C4CEF7" stroke-width=".4"/>`;
      add(x + y - 3, s);
    }
  }
  function turbine(x, y, h, bladeL, delay) {
    const b = P(x, y, 0), t = P(x, y, h);
    let s = `<path d="M${b[0] - 2.4},${b[1]} L${t[0] - 1},${t[1]} L${t[0] + 1},${t[1]} L${b[0] + 2.4},${b[1]} Z" fill="#FFFFFF" stroke="${INK}" stroke-width=".7"/>`;
    s += `<rect x="${t[0] - 2}" y="${t[1] - 2.6}" width="7" height="4.4" rx="2" fill="#F4F2FB" stroke="${INK}" stroke-width=".6"/>`;
    const L = bladeL * S;
    const bl = `M0,0 C${L * 0.07},${-L * 0.18} ${L * 0.06},${-L * 0.6} ${L * 0.015},${-L} L${-L * 0.015},${-L} C${-L * 0.05},${-L * 0.6} ${-L * 0.06},${-L * 0.18} 0,0Z`;
    s += `<g class="rotor" style="transform-origin:${t[0]}px ${t[1]}px;animation-delay:${delay}s">${[0, 120, 240].map(a => `<path d="${bl}" transform="translate(${t[0]},${t[1]}) rotate(${a})" fill="#FFFFFF" stroke="${INK}" stroke-width=".6"/>`).join('')}</g><circle cx="${t[0]}" cy="${t[1]}" r="1.8" fill="#fff" stroke="${INK}" stroke-width=".6"/><circle class="blink" cx="${t[0] + 3}" cy="${t[1] - 3}" r="1.2" fill="#FF6B6B"/>`;
    add(x + y - 20, s);
  }
  function transformer(x, y) {
    box(x, y, 0, 2.6, 2.2, 2.4, ['#CDEFE0', '#A9DEC7', '#8FCFB4'], 0, { ribs: 5 });
    [0.5, 1.3, 2.1].forEach(k => { const a = P(x + k, y + 0.6, 2.4), b = P(x + k, y + 0.6, 3.6); add(x + y + 2.6, `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${INK}" stroke-width="1.6"/><circle cx="${b[0]}" cy="${b[1]}" r="1.2" fill="#FFC3A6" stroke="${INK}" stroke-width=".5"/>`); });
  }
  function gantry(x, y, w, h) {
    let s = '';
    for (const xx of [x, x + w]) { const a = P(xx, y, 0), b = P(xx, y, h); s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${INK}" stroke-width="1.4"/>`; }
    const a = P(x, y, h), b = P(x + w, y, h); s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${INK}" stroke-width="1.4"/>`;
    for (let k = 0; k < 3; k++) { const c = P(x + w * (k + 0.5) / 3, y, h); s += `<line x1="${c[0]}" y1="${c[1]}" x2="${c[0]}" y2="${c[1] + 5}" stroke="${INK}" stroke-width=".8"/>`; }
    add(x + y + 0.5, s);
  }
  function vehicle(kind, cls, x, y, delay) {
    // drawn at origin of its road; CSS animation moves it along the road vector
    const c = kind === 'tanker' ? ['#FFFFFF', '#F2EFFC', '#D9D3F2'] : ['#FFCBB5', '#F7AE93', '#E3907A'];
    const parts = [];
    const tmp = items.length;
    if (kind === 'tanker') { box(x, y, 0.5, 3.6, 1.6, 1.6, ['#E7E4F6', '#CFC8EE', '#B9B0E4']); box(x + 3.8, y, 0.5, 1.6, 1.6, 1.9, ['#FFD9C8', '#F7AE93', '#E3907A']); }
    else box(x, y, 0.4, 2.4, 1.4, 1.2, c), box(x + 0.5, y, 1.6, 1.2, 1.4, 0.8, ['#FFE3D6', '#FFC9B3', '#F2AD95']);
    const mine = items.splice(tmp);
    const s = mine.map(m => m[1]).join('');
    return `<g class="${cls}" style="animation-delay:${delay}s">${s}</g>`;
  }
  function tag(x, y, z, title, val, color) {
    const [px, py] = P(x, y, z);
    return `<g class="itag" transform="translate(${px.toFixed(1)},${py.toFixed(1)})"><line x1="0" y1="0" x2="0" y2="-16" stroke="${INK}" stroke-width=".8"/><circle r="2.6" fill="${color}" stroke="${INK}" stroke-width=".6"/>
      <g transform="translate(-62,-52)"><rect width="124" height="36" rx="10" fill="#FFFFFF" stroke="${INK}" stroke-width=".8"/><rect x="8" y="9" width="5" height="18" rx="2.5" fill="${color}"/>
      <text x="19" y="15" font-size="9.5" fill="#6E6A8A" font-weight="600">${title}</text><text x="19" y="29" font-size="12" fill="#24213D" font-weight="800">${val}</text></g></g>`;
  }

  function isoPlant(d) {
    items.length = 0; gid = 0;
    d = d || {};
    // ---- ground & zones (drawn first, unsorted)
    const ground = (pts, fill, op) => `<polygon points="${pts.map(p => pt(p[0], p[1], 0)).join(' ')}" fill="${fill}" ${op ? `opacity="${op}"` : ''}/>`;
    let base = `<rect x="0" y="168" width="1200" height="700" fill="#E3F1E8"/>`;
    base += ground([[-14, -12], [30, -12], [30, 18], [-14, 18]], '#DCE4F7');                 // solar field land
    base += ground([[0, 20], [27, 20], [27, 40], [0, 40]], '#F6E7B4');                      // substation pad
    base += ground([[30, 8], [72, 8], [72, 41], [30, 41]], '#F6E7B4');                      // process pad
    base += ground([[57, -14], [110, -14], [110, 30], [57, 30]], '#F3DFAE', .9);           // storage pad
    base += ground([[0, 52], [90, 52], [90, 70], [0, 70]], '#F6E7B4');                      // utilities pad
    base += ground([[-40, 43], [120, 43], [120, 47], [-40, 47]], '#B7BEDB');                // road along x
    base += ground([[52, -30], [55.5, -30], [55.5, 80], [52, 80]], '#B7BEDB');              // road along y
    base += ground([[-40, 74], [120, 74], [120, 78], [-40, 78]], '#B7BEDB');
    for (let x = -36; x < 120; x += 6) base += `<line x1="${P(x, 45, 0)[0]}" y1="${P(x, 45, 0)[1]}" x2="${P(x + 2.6, 45, 0)[0]}" y2="${P(x + 2.6, 45, 0)[1]}" stroke="#FFFFFF" stroke-width="1.4"/>`;
    for (let y = -26; y < 80; y += 6) base += `<line x1="${P(53.75, y, 0)[0]}" y1="${P(53.75, y, 0)[1]}" x2="${P(53.75, y + 2.6, 0)[0]}" y2="${P(53.75, y + 2.6, 0)[1]}" stroke="#FFFFFF" stroke-width="1.4"/>`;
    // ---- renewable generation
    for (const [x, y, h, dl] of [[-34, -14, 17, -0.3], [-22, -17, 18, -1.1], [-9, -19, 17, -1.9], [5, -21, 18, -0.7], [19, -23, 17, -1.5], [33, -25, 18, -2.3], [-46, -8, 16, -2.7]]) turbine(x, y, h, 7, dl);
    solarField(-12, -10, 12, 10);
    // ---- substation
    transformer(3, 23); transformer(8, 23); transformer(13, 23);
    gantry(2, 30, 10, 6); gantry(14, 30, 10, 6); gantry(2, 36, 22, 5);
    box(19, 23, 0, 6, 4, 3.2, ['#FFF7E3', '#FBE7BC', '#F1D392'], 0, { windows: 3, door: true });
    // ---- process area: ASU, synthesis columns, separators
    cyl(34, 14, 0, 1.6, 36, ['#F4F2FB', '#FFFFFF', '#CFC8EE'], { rings: 6, platforms: [12, 24, 33], ladder: true, light: true, steam: true });
    cyl(38.5, 17, 0, 1.1, 27, ['#F4F2FB', '#FFFFFF', '#CFC8EE'], { rings: 4, platforms: [14, 24], ladder: true });
    cyl(41, 27, 0, 2.3, 22, ['#FFE0D3', '#FFF2EC', '#F4B9A2'], { rings: 4, platforms: [10, 19], ladder: true, steam: true });          // NH3 converter
    cyl(46, 24, 0, 1.4, 14, ['#E8F5FD', '#FFFFFF', '#B7D8F2'], { rings: 3, platforms: [9] });                                       // separator
    cyl(36, 34, 0, 1.0, 8, ['#FFD3E2', '#FFF0F5', '#F2A9C2']); cyl(44.5, 33.5, 0, 1.1, 9, ['#FFD3E2', '#FFF0F5', '#F2A9C2']);
    box(31, 22, 0, 6, 7, 7, ['#D9D3F7', '#C4BBF0', '#AEA4E6'], -2);                       // steel frame block
    hvessel(43, 37, 1.2, 6, 1.0, ['#FFC9B3']); hvessel(31, 37.5, 1.2, 4, 0.8, ['#CFE8FB']);
    for (const [cx, cy] of [[48, 12], [51.5, 11], [48.5, 16.5]]) cyl(cx, cy, 0, 1.9, 3.6, ['#C9EEDF', '#E6F7F0', '#9ED9C2'], { bias: 0 });   // water / cooling tanks
    // ---- compressor & utilities house
    box(58, 30, 0, 12, 9, 7, ['#C9EEDF', '#A9DEC7', '#8FCFB4'], 0, { windows: 4, door: true, ribs: 6 });
    cyl(61, 32, 7, 0.9, 3, ['#F4F2FB', '#FFFFFF', '#CFC8EE'], { steam: true }); cyl(66, 33, 7, 0.9, 3, ['#F4F2FB', '#FFFFFF', '#CFC8EE'], { steam: true });
    hvessel(60, 21, 0.6, 9, 1.2, ['#FFD3E2']); hvessel(60, 25, 0.6, 9, 1.2, ['#FFD3E2']);   // H2 bullets
    // ---- NH3 storage & loading
    cyl(66, -6, 0, 7, 10, ['#FFC3A6', '#FFDCCB', '#F09E80', '#FFD1BD'], { dome: 3.2, rings: 3, ladder: true, light: true });
    cyl(84, -10, 0, 8, 11, ['#FFC3A6', '#FFDCCB', '#F09E80', '#FFD1BD'], { dome: 3.6, rings: 3, ladder: true });
    cyl(100, 4, 0, 5, 8, ['#FFB4A2', '#FFD2C7', '#EC8D78', '#FFC7B8'], { dome: 2.4, rings: 2 });
    cyl(101, -12, 0, 4.2, 7, ['#FFC3A6', '#FFDCCB', '#F09E80', '#FFD1BD'], { dome: 2, rings: 2 });
    box(78, 18, 5, 26, 7, 0.8, ['#E7E4F6', '#CFC8EE', '#B9B0E4'], 4);                     // loading canopy
    for (const [x, y] of [[78, 18], [104, 18], [78, 25], [104, 25], [91, 18], [91, 25]]) pipe([[x, y, 0], [x, y, 5]], '#B8B2E4', 1.4, null, 2);
    // ---- electrolyser hall, stacks, BESS
    gable(2, 54, 0, 22, 12, 7, 3.4, ['#C9EEDF', '#B3E5D1', '#95D3BA', '#BCE8D6']);
    transformer(26, 56); transformer(26, 61);
    for (let i = 0; i < 3; i++) hvessel(31 + i * 0.1, 55 + i * 3.6, 0.6, 7, 1.0, ['#CFF0E3']);   // separator drums
    cyl(41, 57, 0, 1.8, 5, ['#BFE6F7', '#E6F5FD', '#8FCBEA']); cyl(45, 57, 0, 1.8, 5, ['#BFE6F7', '#E6F5FD', '#8FCBEA']);       // water
    for (let i = 0; i < 4; i++) box(60 + i * 6.2, 57, 0, 5.4, 2.4, 2.6, ['#FFE1EC', '#FBC9DB', '#F2AFC8'], 0, { ribs: 6 });    // BESS containers
    for (let i = 0; i < 4; i++) box(60 + i * 6.2, 62, 0, 5.4, 2.4, 2.6, ['#FFE1EC', '#FBC9DB', '#F2AFC8'], 0, { ribs: 6 });
    // ---- pipe racks and process pipes
    rackX(-2, 100, 48, 5, 2.4);
    pipe([[-2, 48.6, 5.6], [100, 48.6, 5.6]], '#C9C3EE', 2.6, 'iflow nh3', 0.5);
    pipe([[-2, 49.4, 5.6], [100, 49.4, 5.6]], '#CDEFE2', 2.6, 'iflow h2', 0.6);
    pipe([[-2, 50.2, 5.6], [100, 50.2, 5.6]], '#FBE2B5', 1.8, 'iflow pow', 0.7);
    pipe([[24, 56, 3], [24, 50.2, 5.6]], '#CDEFE2', 2.4, 'iflow h2');
    pipe([[48, 49.4, 5.6], [48, 38, 5.6], [48, 30, 3]], '#CDEFE2', 2.4, 'iflow h2');
    pipe([[44, 29, 8], [50, 29, 8], [56, 29, 8], [56, 26, 3], [60, 26, 2]], '#CDEFE2', 2.2, 'iflow h2');
    pipe([[41, 27, 14], [41, 20, 14], [46, 20, 10]], '#FFD6C6', 2.2, 'iflow nh3');
    pipe([[46, 24, 6], [56, 24, 6], [62, 14, 6], [66, 2, 6]], '#C9C3EE', 2.6, 'iflow nh3');
    pipe([[66, 2, 6], [84, -1, 6]], '#C9C3EE', 2.4, 'iflow nh3');
    pipe([[84, -1, 6], [88, 12, 6], [90, 18, 5.8]], '#C9C3EE', 2.4, 'iflow nh3');
    pipe([[34, 16, 18], [34, 22, 12], [36, 26, 8]], '#D7E8FB', 2, 'iflow n2');
    pipe([[12, 31, 6], [12, 47, 5.6]], '#FBE2B5', 1.6, 'iflow pow');
    pipe([[26, -2, 2], [27, 20, 4]], '#FBE2B5', 1.4, 'iflow pow');
    stairs(70, 40, 5.5); stairs(28, 41.5, 5.2);
    // ---- static parked vehicles
    // ---- assemble (painter's algorithm)
    items.sort((a, b) => a[0] - b[0]);
    const body = items.map(i => i[1]).join('');
    items.length = 0;
    // moving vehicles (rendered on top of road, below racks visually acceptable)
    const vX = vehicle('tanker', 'ivx', -30, 44, 0) + vehicle('car', 'ivx2', -30, 43.6, -9);
    const vY = vehicle('tanker', 'ivy', 52.6, -26, -4) + vehicle('car', 'ivy2', 53.2, -26, -12);
    const truckDock = vehicle('tanker', 'idock', 84, 21, 0) + vehicle('tanker', 'idock2', 95, 21.5, -6);
    const tags = [
      tag(4, -6, 3, 'Solar PV', d.solar || '—', '#F5A65B'), tag(-9, -19, 12, 'Wind', d.wind || '—', '#5EAEEB'),
      tag(12, 60, 11, 'Electrolysers', d.ely || '—', '#4CC3A0'), tag(72, 62, 3, 'BESS', d.bess || '—', '#EF86AE'),
      tag(41, 27, 24, 'Haber–Bosch loop', d.loop || '—', '#9284F7'), tag(64, 23, 3, 'H₂ buffer', d.h2s || '—', '#4CC3A0'),
      tag(84, -10, 15, 'NH₃ storage', d.tank || '—', '#7C6CF2'), tag(98, 21, 6, 'Offtake', d.offtake || '—', '#5EAEEB')
    ].join('');
    const dx = 150 * C30 * S, dy = 150 * S30 * S;
    return `<svg class="iso" viewBox="0 10 1200 690" role="img" aria-label="Isometric view of the hybrid green ammonia plant" style="--ivx-x:${dx.toFixed(0)}px;--ivx-y:${dy.toFixed(0)}px">
      <defs><linearGradient id="isoSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF3DA"/><stop offset="1" stop-color="#EAF2FB"/></linearGradient></defs>
      <rect y="0" width="1200" height="800" fill="url(#isoSky)"/>
      <path d="M0,128 C120,96 220,118 330,98 C450,76 560,108 680,88 C800,66 920,100 1040,84 C1120,74 1170,80 1200,76 L1200,190 L0,190 Z" fill="#DCD5FB"/>
      <path d="M0,152 C160,128 300,146 460,130 C620,112 780,138 940,122 C1060,110 1150,118 1200,116 L1200,190 L0,190 Z" fill="#CBEAF0"/>
      <path d="M0,170 C200,156 380,166 560,158 C760,150 960,162 1200,154 L1200,190 L0,190 Z" fill="#D7EEDF"/>
      <g class="icloud"><ellipse cx="220" cy="54" rx="46" ry="10" fill="#fff" opacity=".8"/><ellipse cx="240" cy="46" rx="22" ry="12" fill="#fff" opacity=".8"/></g>
      <g class="icloud c2"><ellipse cx="860" cy="40" rx="38" ry="9" fill="#fff" opacity=".7"/><ellipse cx="874" cy="33" rx="18" ry="10" fill="#fff" opacity=".7"/></g>
      ${base}
      <g class="ivx-road">${vX}</g><g class="ivy-road">${vY}</g>${truckDock}
      ${body}
      <g font-family="Inter,sans-serif">${tags}</g>
    </svg>`;
  }
  window.TRE_SCENE = Object.assign(window.TRE_SCENE || {}, { isoPlant });
})();
