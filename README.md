# Green-Ammonia — HyProfile

`HyProfile_Studio.html` is a self-contained, single-file web application (open it in Chrome or Edge, no installation) for:

| Step | Function |
|---|---|
| Site & Resource | Map / search / coordinates; hourly ERA5 (Open-Meteo) or NASA POWER download; Sandia TMY or single year; P50–P99 statistics |
| Solar PV Design | PVsyst-type loss chain: Perez transposition, row shading, IAM, soiling, bifacial, thermal, DC/inverter/AC/MV/HV/line losses |
| Wind Farm Design | Turbine library or custom curve, shear matrix, air-density correction (IEC 61400-12-1), EYA loss categories |
| RE Profile & Export | Excel template, upload (template / PVsyst E_Grid / CSV), model-ready `Efficiency` workbook export |
| Plant Simulation | JavaScript port of `technical_model.py` (Rev9) hourly dispatch — reproduces the Python results |
| Economics / Sizing Explorer | Screening LCOA / LCOH / IRR, two-parameter sizing maps, tornado sensitivity |
| Run report | **Report** button (top bar, Plant and Economics pages): choice of **Technical**, **Financial / economics** or **Techno-economic** report as A4 PDF and/or formatted Excel workbook. Content is data-only (KPIs, tables, figures, inputs); engine warnings are listed as model notes |

Libraries (ECharts 5.5.1, Leaflet 1.9.4, ExcelJS 4.4.0, jsPDF 4.2.1, jsPDF-AutoTable 5.0.9) are embedded, so the file works offline except for map tiles and the weather APIs.

## Rebuilding

Sources are in `app/src`, vendored libraries in `app/vendor`.

```bash
python app/build.py
```
