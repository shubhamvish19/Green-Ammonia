#!/usr/bin/env python3
"""Generate the HyProfile logo (mark + wordmark) and the stand-alone mark.

The mark is a 24-spoke radial bar chart — one spoke per hour of the day —
whose lengths trace a hybrid solar + wind generation profile and whose colours
run through the day (night indigo, dawn cyan, morning green, noon amber,
evening coral, dusk violet). At its centre sits a hydrogen droplet carrying
a white production-profile wave.

Writes app/src/logo.svg and app/src/mark.svg.
"""
import math, pathlib

OUT = pathlib.Path(__file__).resolve().parent / 'src'
STOPS = [(0, '#5B4CF5'), (4, '#2F7BFF'), (7, '#00B8D9'), (9, '#12C46B'),
         (12, '#FFC21A'), (15, '#FF8A1F'), (18, '#FF4D6D'), (21, '#B04CFF'), (24, '#5B4CF5')]


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def colour(hour):
    for (h0, c0), (h1, c1) in zip(STOPS, STOPS[1:]):
        if h0 <= hour <= h1:
            t = (hour - h0) / (h1 - h0)
            a, b = hexrgb(c0), hexrgb(c1)
            return '#%02X%02X%02X' % tuple(round(x + (y - x) * t) for x, y in zip(a, b))
    return STOPS[0][1]


def profile(h):
    solar = max(0.0, math.sin((h - 6) / 12 * math.pi)) if 6 <= h <= 18 else 0.0
    wind = 0.42 + 0.18 * math.cos((h - 2) / 24 * 2 * math.pi)
    return min(1.0, 0.55 * solar + wind)


def mark(cx=32.0, cy=32.0, prefix='m'):
    parts = []
    r0 = 14.6
    for h in range(24):
        a = math.radians(h * 15 - 90)
        L = 4.0 + 12.0 * profile(h + 0.5)
        x1, y1 = cx + r0 * math.cos(a), cy + r0 * math.sin(a)
        x2, y2 = cx + (r0 + L) * math.cos(a), cy + (r0 + L) * math.sin(a)
        parts.append(f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" stroke="{colour(h + 0.5)}" stroke-width="3.1" stroke-linecap="round"/>')
    # hydrogen droplet
    s = 11.2
    top = cy - s * 1.02
    drop = (f'M{cx:.2f},{top:.2f} C{cx + s * 0.18:.2f},{cy - s * 0.62:.2f} {cx + s * 0.78:.2f},{cy - s * 0.08:.2f} {cx + s * 0.78:.2f},{cy + s * 0.32:.2f} '
            f'A{s * 0.78:.2f},{s * 0.78:.2f} 0 0 1 {cx - s * 0.78:.2f},{cy + s * 0.32:.2f} '
            f'C{cx - s * 0.78:.2f},{cy - s * 0.08:.2f} {cx - s * 0.18:.2f},{cy - s * 0.62:.2f} {cx:.2f},{top:.2f} Z')
    wave = (f'M{cx - s * 0.52:.2f},{cy + s * 0.34:.2f} C{cx - s * 0.30:.2f},{cy + s * 0.02:.2f} {cx - s * 0.12:.2f},{cy + s * 0.02:.2f} {cx:.2f},{cy + s * 0.30:.2f} '
            f'S{cx + s * 0.30:.2f},{cy + s * 0.58:.2f} {cx + s * 0.52:.2f},{cy + s * 0.22:.2f}')
    defs = (f'<linearGradient id="{prefix}g" x1="0" y1="0" x2="1" y2="1">'
            f'<stop offset="0" stop-color="#22D3EE"/><stop offset=".55" stop-color="#2F7BFF"/><stop offset="1" stop-color="#5B4CF5"/></linearGradient>')
    body = ''.join(parts) + (f'<path d="{drop}" fill="url(#{prefix}g)"/>'
                             f'<path d="{wave}" fill="none" stroke="#FFFFFF" stroke-width="2.3" stroke-linecap="round"/>'
                             f'<circle cx="{cx - s * 0.36:.2f}" cy="{cy - s * 0.18:.2f}" r="{s * 0.13:.2f}" fill="#FFFFFF" opacity=".85"/>')
    return defs, body


d, b = mark()
(OUT / 'mark.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>{d}</defs>{b}</svg>\n')
d2, b2 = mark(prefix='lg')
logo = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 252 64" role="img" aria-label="HyProfile — Hourly green hydrogen simulator">'
        f'<defs>{d2}</defs>{b2}'
        '<text x="72" y="33" font-family="\'Plus Jakarta Sans\',Inter,\'Segoe UI\',system-ui,sans-serif" font-size="25" font-weight="800" letter-spacing="-.6" fill="currentColor">Hy<tspan fill="#2F7BFF">Profile</tspan></text>'
        '<text x="73" y="49" font-family="Inter,\'Segoe UI\',system-ui,sans-serif" font-size="8.6" font-weight="600" letter-spacing="1.35" fill="currentColor" opacity=".55">HOURLY GREEN H₂ SIMULATOR</text>'
        '</svg>\n')
(OUT / 'logo.svg').write_text(logo)
print('written', OUT / 'logo.svg', OUT / 'mark.svg')
