#!/usr/bin/env python3
"""Assemble app/src into the single self-contained HTML deliverable.

Usage:  python app/build.py [--libs DIR]
DIR must contain echarts.min.js, leaflet.js, leaflet.css and exceljs.min.js
(default: app/vendor). Output: TrueRE_Hybrid_Studio.html at the repo root.
"""
import pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / 'src'
libs = pathlib.Path(sys.argv[sys.argv.index('--libs') + 1]) if '--libs' in sys.argv else ROOT / 'vendor'
rd = lambda p: pathlib.Path(p).read_text(encoding='utf-8')
safe = lambda js: js.replace('</script', '<\\/script')
html = rd(SRC / 'index.html')
parts = {
    '/*@@LEAFLET_CSS@@*/': rd(libs / 'leaflet.css'),
    '/*@@STYLES@@*/': rd(SRC / 'styles.css'),
    '<!--@@LOGO@@-->': rd(SRC / 'logo.svg'),
    '/*@@LIBS@@*/': safe('\n'.join(rd(libs / f) for f in ('echarts.min.js', 'leaflet.js', 'exceljs.min.js'))),
    '/*@@SAMPLE@@*/': safe(rd(SRC / 'sample-data.js')),
    '/*@@ENGINE_RE@@*/': safe(rd(SRC / 'engine-re.js')),
    '/*@@ENGINE_PLANT@@*/': safe(rd(SRC / 'engine-plant.js')),
    '/*@@SCENE@@*/': safe(rd(SRC / 'scene.js')),
    '/*@@SCENE_ISO@@*/': safe(rd(SRC / 'scene-iso.js')),
    '/*@@UI@@*/': safe(rd(SRC / 'ui-core.js') + '\n' + rd(SRC / 'ui-pages.js')),
}
for k, v in parts.items():
    assert k in html, k
    html = html.replace(k, v)
out = ROOT.parent / 'TrueRE_Hybrid_Studio.html'
out.write_text(html, encoding='utf-8')
print(f'wrote {out} ({out.stat().st_size/1e6:.2f} MB)')
