/* Planetary Analog Engine (browser build): the same code as analog-engine.js / analog_engine.py, available as window.AnalogEngine. */
window.AnalogEngine = (function () {
'use strict';
/**
 * Planetary Analog Engine: temperature, topography and surface composition
 * -------------------------------------------------------------------------
 * The analysis "brain" of the Planetary Analog Lab, without any website UI.
 * Works in Node.js 18+ and in browsers (ES module, no dependencies).
 *
 * Pick ONE subject per comparison: 'temperature', 'topography' or 'composition'.
 *
 * What it does
 *   1. Reads a dataset for that subject (CSV/TSV/TXT/JSON, NASA POWER JSON for temperature, or a map image
 *      with a colour key for temperature or topography) and refuses data without a usable key
 *      (throws AnalogError with a code: E-NOKEY, E-NOUNITS, E-NOTEMP, E-NOELEV, E-NOCOMP, E-NOSHARED ...).
 *   2. Compares the celestial dataset with the Earth dataset and returns a percent likeness with a
 *      95% bootstrap interval, the components behind it, and detailed statistics for that subject.
 *        temperature  distributions, daily and seasonal cycles, Welch/KS/Wasserstein tests, thresholds
 *        topography   relief, hypsometry, slopes, roughness, landing and mobility thresholds
 *        composition  oxide or mineral abundances, Bray–Curtis and Aitchison similarity, Mg#, CIA, TAS class
 *   3. Writes a verdict + recommended experiments, rule-based (offline) or by Claude.
 *
 * Quick start (Node):
 *   import fs from 'node:fs';
 *   import { parseText, analyze, assess, toMarkdown } from './analog-engine.js';
 *   const subject = 'topography';                       // or 'temperature' / 'composition'
 *   const mars  = parseText(fs.readFileSync('mars.csv','utf8'),  'mars.csv',  { role: 'celestial', subject });
 *   const earth = parseText(fs.readFileSync('earth.csv','utf8'), 'earth.csv', { role: 'earth', subject });
 *   const result = await analyze(mars, earth, { subject, body: 'mars' });
 *   const ctx = { body: 'mars', celestialSite: 'Gale crater', earthSite: 'Atacama', apiKey: process.env.ANTHROPIC_API_KEY };
 *   const report = await assess(result, ctx);           // omit apiKey → rule-based
 *   console.log(toMarkdown(result, report, ctx));
 *
 * Units: temperature in kelvin, elevation in metres, slopes in degrees, composition in percent.
 */

/* ============================== errors ============================== */
class AnalogError extends Error {
  constructor(code, message, fix) { super(message); this.name = 'AnalogError'; this.code = code; this.fix = fix; }
}

/* ============================== bodies ============================== */
const BODIES = {
  mars:    { name: 'Mars',      atmosphere: 'about 6 mbar, 95% CO2', note: 'CO2 frost forms near 148 K at typical surface pressure. Perchlorate brines can stay liquid down to about 198 to 206 K.' },
  moon:    { name: 'the Moon',  atmosphere: 'effectively none (exosphere)', note: 'There is no atmosphere, and a lunar day lasts about 29.5 Earth days. Permanently shadowed craters fall below 110 K, cold enough to trap water ice.' },
  mercury: { name: 'Mercury',   atmosphere: 'none (exosphere)', note: 'The equatorial surface swings from about 100 K at night to 700 K at noon. Polar craters hold water ice.' },
  europa:  { name: 'Europa',    atmosphere: 'none (trace O2)', note: 'The icy surface sits near 50 to 130 K, above a liquid ocean kilometres below.' },
  titan:   { name: 'Titan',     atmosphere: 'about 1.5 bar, N2 and CH4', note: 'A thick atmosphere keeps the surface near 94 K with very little daily change. Methane and ethane are liquid there.' },
  other:   { name: 'the selected body', atmosphere: 'unknown', note: '' },
};

/* ============================== units ============================== */
const toK = (v, u) => u === 'K' ? v : u === 'C' ? v + 273.15 : (v - 32) * 5 / 9 + 273.15;
const kToC = k => k - 273.15;
function unitFromName(h) {
  const s = h.toLowerCase();
  if (/°c|degc|deg_c|deg c|celsius|\(c\)|\[c\]|_c\b|\bc\)/.test(s)) return 'C';
  if (/°f|degf|fahrenheit|\(f\)|\[f\]|_f\b/.test(s)) return 'F';
  if (/kelvin|\(k\)|\[k\]|_k\b|\bdegk\b|\bk\)/.test(s)) return 'K';
  return null;
}

/* ============================== parsing ============================== */
/** Split one line; handles quoted fields ("a, b") and doubled quotes inside them. */
function splitLine(l, d) {
  if (d === 'ws') return l.trim().split(/\s+/);
  if (!l.includes('"')) return l.split(d).map(x => x.trim());
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === '"') { if (inQ && l[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === d && !inQ) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim()); return out;
}

/**
 * Parse a delimited text table (CSV, TSV, semicolon, pipe or whitespace) with a header row.
 * opts.role: 'celestial' | 'earth'   (Earth dates are converted to an approximate solar longitude)
 * opts.units: 'auto' | 'K' | 'C' | 'F'   ('auto' = read from the header; missing units → E-NOUNITS)
 */
function parseTemperature(text, opts = {}) {
  const role = opts.role === 'earth' ? 'e' : 'c', uo = opts.units || 'auto';
  const lines = text.split(/\r?\n/).filter(l => l.trim() && !/^\s*(#|%|\/\/)/.test(l));
  if (lines.length < 2) throw new AnalogError('E-EMPTY', 'The file has no data rows.', 'Check that the file is a table with one header row and at least one row of values.');
  const h0 = lines[0];
  const d = ['\t', ',', ';', '|'].map(c => [c, h0.split(c).length]).sort((a, b) => b[1] - a[1])[0];
  const del = d[1] > 1 ? d[0] : lines[1].trim().split(/\s+/).length > 1 ? 'ws' : '\n';   // '\n' = a single column
  const head = splitLine(h0, del);
  if (head.every(x => x !== '' && !isNaN(+x))) throw new AnalogError('E-NOKEY', 'No key: the file has no header row.', 'Without column names the engine cannot tell which column is temperature, what units it uses, or which column is time. Add a header row such as "local_time (h), T_surface (K)".');
  subjectGuard(head, 'temperature');
  const find = re => head.findIndex(x => re.test(x));
  const iH = find(/local[ _-]?time|^lt\b|ltst|^lst\b|^hour|time[ _]of[ _]day/i);
  const iD = find(/date|timestamp|utc|^time$/i);
  const iL = find(/^ls\b|^l_s|solar[ _]?lon|areocentric/i);
  const iLat = find(/^lat/i), iLon = find(/^lon/i);
  let iT = -1;
  head.forEach((x, i) => { if (iT < 0 && i !== iH && i !== iD && i !== iL && /temp|tsurf|^ts\b|^ts[ _(]|t2m|^t[ _(]|^t$|brightness|^tb\b|bolometric|skin/i.test(x)) iT = i; });
  if (iT < 0) throw new AnalogError('E-NOTEMP', 'No temperature column found in the key.', `The header lists: ${head.join(', ')}. Name the temperature column with "temp", "T", "TS" or "T_surface" and include its units, e.g. "T_surface (K)".${subjectHint(head, 'temperature')}`);
  const u = uo !== 'auto' ? uo : unitFromName(head[iT]);
  if (!u) throw new AnalogError('E-NOUNITS', `The temperature column "${head[iT]}" has no units in its key.`, 'Add units to the header, e.g. "T (K)", or pass opts.units = "K" | "C" | "F".');
  const out = { T: [], hour: iH >= 0 || (iD >= 0 && role === 'e') ? [] : null, ls: iL >= 0 || (iD >= 0 && role === 'e') ? [] : null, lat: [], lon: [], t: iD >= 0 ? [] : null };
  let fill = 0, imp = 0, bad = 0;
  for (let r = 1; r < lines.length; r++) {
    const c = splitLine(lines[r], del); const v = parseFloat(c[iT]);
    if (c[iT] === undefined || c[iT] === '' || isNaN(v)) { bad++; continue; }
    if (v <= -900 || Math.abs(v) >= 1e20) { fill++; continue; }
    const k = toK(v, u); if (k <= 0 || k > 1000) { imp++; continue; }
    let hr = null, ls = null, tm = null;
    if (iD >= 0) {
      const m = c[iD].match(/(\d{4})-?(\d{2})-?(\d{2})(?:[ T](\d{1,2})(?::(\d{2}))?)?/);
      if (m) {
        const dt = Date.UTC(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)); tm = dt;
        if (m[4] !== undefined && role === 'e') hr = +m[4] + (+(m[5] || 0)) / 60;
        const doy = (dt - Date.UTC(+m[1], 0, 1)) / 864e5 + 1;
        if (role === 'e') ls = ((doy - 79) * 360 / 365.25 % 360 + 360) % 360;
      }
    }
    if (iH >= 0) { const x = parseFloat(c[iH]); if (!isNaN(x)) hr = x % 24; }
    if (iL >= 0) { const x = parseFloat(c[iL]); if (!isNaN(x)) ls = (x % 360 + 360) % 360; }
    out.T.push(k); if (out.hour) out.hour.push(hr); if (out.ls) out.ls.push(ls); if (out.t) out.t.push(tm);
    out.lat.push(iLat >= 0 ? parseFloat(c[iLat]) : NaN); out.lon.push(iLon >= 0 ? parseFloat(c[iLon]) : NaN);
  }
  if (out.T.length < 3) throw new AnalogError('E-FEW', 'Fewer than 3 usable temperature values.', `${fill} fill values, ${imp} impossible values and ${bad} unreadable cells were removed. Check the column and units.`);
  const warnings = [];
  if (out.hour && out.hour.every(x => x == null)) out.hour = null;
  if (out.ls && out.ls.every(x => x == null)) out.ls = null;
  const med = [...out.T].sort((a, b) => a - b)[out.T.length >> 1];
  if (u === 'C' && med > 420) warnings.push('Values labelled °C look like Kelvin (median above 150). Check the units.');
  if (iD >= 0 && iH < 0 && role === 'c') warnings.push('Dates on another world cannot be turned into local time or season. Add local-time and Ls columns for daily and seasonal analysis.');
  return { subject: 'temperature', ...out, meta: { kind: 'series', columns: { temperature: head[iT], timeOfDay: out.hour ? (iH >= 0 ? head[iH] : head[iD] + ' (time of day)') : null, season: out.ls ? (iL >= 0 ? head[iL] : head[iD] + ' (day of year → Ls)') : null }, units: u, unitsFrom: uo !== 'auto' ? 'given manually' : 'file key', removedFill: fill, removedImpossible: imp, unreadable: bad, warnings } };
}

/** Parse a table for the chosen subject (opts.subject: 'temperature' default, 'topography', 'composition'). */
function parseTable(text, opts = {}) {
  const s = opts.subject || 'temperature';
  if (!SUBJECTS.includes(s)) throw new AnalogError('E-SUBJECT', `Unknown subject "${s}".`, `Use one of: ${SUBJECTS.join(', ')}.`);
  return s === 'topography' ? parseTopography(text, opts) : s === 'composition' ? parseComposition(text, opts) : parseTemperature(text, opts);
}

/** Parse NASA POWER JSON (temperature), or an array of records ([{...}] or {data:[...]}) for any subject. */
function parseJSON(text, opts = {}) {
  const uo = opts.units || 'auto';
  let j; try { j = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { throw new AnalogError('E-JSON', 'The JSON file could not be read.', 'The file is not valid JSON: ' + e.message); }
  if (j.properties && j.properties.parameter) {
    if ((opts.subject || 'temperature') !== 'temperature') throw new AnalogError('E-SUBJECT', 'NASA POWER files hold weather data, not ' + opts.subject + '.', 'Choose the temperature subject for this file, or use a ' + opts.subject + ' dataset.');
    const P = j.properties.parameter;
    const p = ['TS', 'T2M', 'T2M_MAX', 'T2M_MIN'].find(k => P[k]) || Object.keys(P).find(k => /^T/.test(k));
    if (!p) throw new AnalogError('E-NOTEMP', 'This NASA POWER file has no temperature parameter.', 'Request TS (skin temperature) or T2M (air temperature at 2 m).');
    let u = uo !== 'auto' ? uo : (j.parameters && j.parameters[p] && j.parameters[p].units) || null;
    if (u) u = u.replace('°', '').toUpperCase().slice(0, 1);
    if (!u || !'KCF'.includes(u)) throw new AnalogError('E-NOUNITS', "The file's key does not state temperature units.", 'Pass opts.units = "K" | "C" | "F".');
    const fv = j.header && j.header.fill_value != null ? j.header.fill_value : -999;
    const lines = [`date,${p} (${u})`];
    for (const [k, v] of Object.entries(P[p])) { if (k.length < 8) continue; lines.push(`${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}${k.length >= 10 ? ' ' + k.slice(8, 10) + ':00' : ''},${v === fv ? -999 : v}`); }
    const d = parseTemperature(lines.join('\n'), { ...opts, units: u });
    d.meta.columns.temperature = p + ((j.parameters && j.parameters[p] && j.parameters[p].longname) ? ' (' + j.parameters[p].longname + ')' : '');
    if (j.header && j.header.time_standard === 'UTC') d.meta.warnings.push('Times are in UTC, not local solar time, so the daily cycle is shifted. Request time-standard=LST from NASA POWER.');
    if (j.geometry && j.geometry.coordinates) { const [lo, la, z] = j.geometry.coordinates; d.lat = d.T.map(() => la); d.lon = d.T.map(() => lo); if (z != null) d.meta.gridElevation_m = z; }
    d.meta.source = 'NASA POWER ' + (j.header && j.header.sources ? j.header.sources.join(', ') : '');
    return d;
  }
  const arr = Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : null;
  if (!arr || !arr.length || typeof arr[0] !== 'object') throw new AnalogError('E-JSON', 'The JSON layout is not recognised.', 'Use NASA POWER JSON, or an array of records such as [{"local_time (h)":14, "T (K)":250}].');
  const h = Object.keys(arr[0]);
  return parseTable([h.join('\t'), ...arr.map(o => h.map(k => o[k]).join('\t'))].join('\n'), opts);
}

/** Pick the parser from the file name. Images are not text: use decodeMapPixels(). */
function parseText(text, fileName, opts = {}) {
  const n = (fileName || '').toLowerCase();
  if (/\.json$/.test(n)) return parseJSON(text, opts);
  if (/\.(csv|tsv|txt|tab|dat)$/.test(n) || !n) return parseTable(text, opts);
  if (/\.(png|jpe?g|webp|gif|bmp)$/.test(n)) throw new AnalogError('E-IMAGE', 'Map images must be decoded from pixels.', 'Use decodeMapPixels() with the image RGBA data, a colour key and the subject.');
  throw new AnalogError('E-FORMAT', 'This file format is not supported.', 'Supported: CSV, TSV, TXT, JSON, and map images with a colour key. Export NetCDF, HDF, GeoTIFF or PDS binary tables to CSV first (e.g. with NASA Panoply, xarray or pds4_tools).');
}

/* ============================== map images ============================== */
const COLORMAPS = {
  gray: ['#000000', '#ffffff'],
  viridis: ['#440154', '#48186a', '#472d7b', '#424086', '#3b528b', '#33638d', '#2c728e', '#26828e', '#21918c', '#1fa088', '#28ae80', '#3fbc73', '#5ec962', '#84d44b', '#addc30', '#d8e219', '#fde725'],
  inferno: ['#000004', '#0b0724', '#210c4a', '#3d0965', '#57106e', '#71196e', '#8a226a', '#a32c61', '#bc3754', '#d24644', '#e45a31', '#f1731d', '#f98e09', '#fcac11', '#f9cb35', '#f2ea69', '#fcffa4'],
  jet: ['#00007f', '#0000ff', '#00ffff', '#ffff00', '#ff0000', '#7f0000'],
};
const hex2 = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
/** Build colour-key stops from a named colormap and its min/max values. */
const stopsFromColormap = (name, min, max) => { const c = COLORMAPS[name]; if (!c) throw new AnalogError('E-NOKEY', `Unknown colormap "${name}".`, 'Use gray, viridis, inferno or jet, or pass explicit stops.'); return c.map((h, i) => ({ hex: h, value: min + (max - min) * i / (c.length - 1) })); };
function lutFrom(stops) { const L = []; for (let i = 0; i < stops.length - 1; i++) { const a = stops[i], b = stops[i + 1], A = hex2(a.hex), B = hex2(b.hex); for (let s = 0; s < 24; s++) { const f = s / 24; L.push({ c: A.map((x, j) => x + (B[j] - x) * f), v: a.value + (b.value - a.value) * f }); } } const z = stops[stops.length - 1]; L.push({ c: hex2(z.hex), v: z.value }); return L; }

/**
 * Turn a map image into values using its colour key. Works for temperature and topography maps.
 * img:  { rgba: Uint8ClampedArray|Uint8Array, width, height }   (e.g. canvas getImageData, or `pngjs`/`sharp` raw output)
 * key:  { stops: [{hex:'#rrggbb', value}], units, region?: {x0,y0,x1,y1} fractions holding the map, pixelSize_m?: number }
 *       units: 'K'|'C'|'F' for temperature, 'm'|'km'|'ft' for topography. pixelSize_m (topography) enables slopes.
 *       Get stops from stopsFromColormap(), from your own legend, or from readLegendWithClaude().
 * subject: 'temperature' (default) or 'topography'. Composition maps are not supported: use a table.
 */
/** Find a colour bar (legend strip) inside a decoded map grid: a row or column that climbs smoothly across most of the key. */
function colourBarMask(g, nR, nC, span) {
  const bad = new Uint8Array(nR * nC); let rows = 0, cols = 0;
  const isBar = idx => {
    const v = []; for (const i of idx) if (g[i] === g[i]) v.push(g[i]);
    if (v.length < 12) return false;
    let up = 0, dn = 0, lo = Infinity, hi = -Infinity;
    for (let k = 0; k < v.length; k++) { if (v[k] < lo) lo = v[k]; if (v[k] > hi) hi = v[k]; if (k) { if (v[k] > v[k - 1]) up++; else if (v[k] < v[k - 1]) dn++; } }
    return up + dn >= 6 && Math.max(up, dn) >= 0.9 * (up + dn) && hi - lo >= 0.6 * span;
  };
  for (let r = 0; r < nR; r++) { const idx = Array.from({ length: nC }, (_, c) => r * nC + c); if (isBar(idx)) { idx.forEach(i => { bad[i] = 1; }); rows++; } }
  for (let c = 0; c < nC; c++) { const idx = Array.from({ length: nR }, (_, r) => r * nC + c); if (isBar(idx)) { idx.forEach(i => { bad[i] = 1; }); cols++; } }
  return { bad, rows, cols };
}

function decodeMapPixels(img, key, subject = (key && key.subject) || 'temperature') {
  if (subject === 'composition') throw new AnalogError('E-FORMAT', 'Composition maps cannot be compared directly.', 'A composition map shows one mineral or oxide at a time. Export the abundances as a table with one column per component and units in the header.');
  if (!key || !key.stops || key.stops.length < 2) throw new AnalogError('E-NOKEY', 'No key: a map needs a colour key to be read.', 'Pass key.stops (colour → value) and key.units, or read the legend with readLegendWithClaude().');
  const okU = subject === 'topography' ? ['m', 'km', 'ft'] : ['K', 'C', 'F'];
  if (!key.units || !okU.includes(key.units)) throw new AnalogError('E-NOUNITS', "The map's key has no usable units.", `Pass key.units = ${okU.map(u => '"' + u + '"').join(' | ')}.`);
  const conv = subject === 'topography' ? v => toM(v, key.units) : v => toK(v, key.units);
  const { rgba: px, width: W, height: H } = img, reg = key.region || { x0: 0, y0: 0, x1: 1, y1: 1 }, L = lutFrom(key.stops);
  const x0 = Math.floor(reg.x0 * W), x1 = Math.ceil(reg.x1 * W), y0 = Math.floor(reg.y0 * H), y1 = Math.ceil(reg.y1 * H);
  const st = Math.max(1, Math.floor(Math.sqrt((x1 - x0) * (y1 - y0) / 40000))); const V = []; let miss = 0;
  const nR = Math.ceil((y1 - y0) / st), nC = Math.ceil((x1 - x0) / st), g = new Float64Array(nR * nC).fill(NaN);
  for (let y = y0, r = 0; y < y1; y += st, r++) for (let x = x0, c = 0; x < x1; x += st, c++) {
    const i = (y * W + x) * 4; if (px[i + 3] < 128) { miss++; continue; }
    let bd = 1e9, bv = 0; for (const e of L) { const d = (px[i] - e.c[0]) ** 2 + (px[i + 1] - e.c[1]) ** 2 + (px[i + 2] - e.c[2]) ** 2; if (d < bd) { bd = d; bv = e.v; } }
    if (bd > 45 * 45) { miss++; continue; } const v = conv(bv); V.push(v); g[r * nC + c] = v;
  }
  // Leave out the colour bar if the image has one: it holds every value on the key and would be counted as data.
  const vals = L.map(e => conv(e.v)), bar = colourBarMask(g, nR, nC, Math.max(...vals) - Math.min(...vals));
  if (bar.rows || bar.cols) { V.length = 0; for (let i = 0; i < g.length; i++) if (g[i] === g[i]) { if (bar.bad[i]) { miss++; g[i] = NaN; } else V.push(g[i]); } }
  const tot = V.length + miss;
  if (V.length < 50 || V.length / tot < 0.25) throw new AnalogError('E-KEYMISMATCH', "The map's colours don't match its key.", `Only ${Math.round(100 * V.length / tot)}% of pixels matched a colour on the key. The legend may be misread, or the map may use shading or overlays.`);
  const warn = [`Map decoded from ${V.length} pixels. ${Math.round(100 * miss / tot)}% were off-key (borders, labels, background${bar.rows || bar.cols ? ', colour bar' : ''}) and skipped.`];
  const meta = { kind: 'map', units: key.units, unitsFrom: 'colour key', removedFill: 0, removedImpossible: 0, unreadable: miss, warnings: warn };
  if (subject === 'topography') {
    if (!key.pixelSize_m) warn.push('No pixel size was given, so slopes cannot be worked out from this map.');
    return { subject: 'topography', z: V, lat: [], lon: [], slope: null, grid: key.pixelSize_m ? { g, nR, nC, dx_m: key.pixelSize_m * st, dy_m: key.pixelSize_m * st } : null, meta: { ...meta, columns: { elevation: 'pixel colour → elevation', slope: null, position: key.pixelSize_m ? `pixel grid, ${key.pixelSize_m * st} m spacing` : null } } };
  }
  return { subject: 'temperature', T: V, hour: null, ls: null, lat: [], lon: [], t: null, meta: { ...meta, columns: { temperature: 'pixel colour → temperature', timeOfDay: null, season: null } } };
}

/* ============================== statistics ============================== */
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1 || 1)); };
const q = (s, p) => { const i = (s.length - 1) * p, l = Math.floor(i); return s[l] + (s[Math.min(l + 1, s.length - 1)] - s[l]) * (i - l); };
const amin = a => { let m = Infinity; for (const x of a) if (x < m) m = x; return m; };
const amax = a => { let m = -Infinity; for (const x of a) if (x > m) m = x; return m; };
function describe(a) {
  const s = Float64Array.from(a).sort(), m = mean(a), d = sd(a), n = a.length; let m3 = 0, m4 = 0;
  for (const x of a) { const z = (x - m) / (d || 1); m3 += z ** 3; m4 += z ** 4; }
  return { n, mean: m, sd: d, se: d / Math.sqrt(n), median: q(s, .5), min: s[0], max: s[n - 1], p5: q(s, .05), p25: q(s, .25), p75: q(s, .75), p95: q(s, .95), iqr: q(s, .75) - q(s, .25), skewness: m3 / n, excessKurtosis: m4 / n - 3, sorted: s };
}
/** Binned Gaussian KDE (Silverman bandwidth, floor minBw) on G points between lo and hi. */
function kde(a, lo, hi, G = 700, minBw = 0.5) {
  const dx = (hi - lo) / (G - 1), h = new Float64Array(G); for (const x of a) { const i = Math.round((x - lo) / dx); if (i >= 0 && i < G) h[i]++; }
  const st = describe(a); let bw = 0.9 * Math.min(st.sd, st.iqr / 1.34 || st.sd) * a.length ** -0.2; bw = Math.max(bw || 0, minBw);
  const sg = bw / dx, R = Math.ceil(4 * sg), K = []; for (let k = -R; k <= R; k++) K.push(Math.exp(-0.5 * (k / sg) ** 2)); const ks = K.reduce((s, x) => s + x, 0);
  const f = new Float64Array(G); for (let i = 0; i < G; i++) { if (!h[i]) continue; for (let k = -R; k <= R; k++) { const j = i + k; if (j >= 0 && j < G) f[j] += h[i] * K[k + R] / ks; } }
  for (let i = 0; i < G; i++) f[i] /= a.length * dx; return { x: Array.from({ length: G }, (_, i) => lo + i * dx), f, bandwidth: bw };
}
/** Overlap coefficient of two KDEs (0–1). */
function overlap(a, b, opt = {}) {
  if (a.length < 3 || b.length < 3) return null;
  const pad = opt.pad ?? 20, minBw = opt.minBw ?? 0.5;
  const lo = Math.min(amin(a), amin(b)) - pad, hi = Math.max(amax(a), amax(b)) + pad, G = 700, dx = (hi - lo) / (G - 1);
  const A = kde(a, lo, hi, G, minBw).f, B = kde(b, lo, hi, G, minBw).f; let s = 0; for (let i = 0; i < G; i++) s += Math.min(A[i], B[i]); return Math.min(1, s * dx);
}
function ksTest(sa, sb) {
  let i = 0, j = 0, D = 0; const n = sa.length, m = sb.length;
  while (i < n && j < m) { const x = Math.min(sa[i], sb[j]); while (i < n && sa[i] <= x) i++; while (j < m && sb[j] <= x) j++; D = Math.max(D, Math.abs(i / n - j / m)); }
  const ne = n * m / (n + m), l = (Math.sqrt(ne) + 0.12 + 0.11 / Math.sqrt(ne)) * D; let p = 0; for (let k = 1; k < 100; k++) p += 2 * (-1) ** (k - 1) * Math.exp(-2 * k * k * l * l);
  return { D, p: Math.max(0, Math.min(1, p)) };
}
function wasserstein(sa, sb) {
  const all = Float64Array.from(new Set([...sa, ...sb])).sort(); let i = 0, j = 0, w = 0;
  for (let k = 0; k < all.length - 1; k++) { while (i < sa.length && sa[i] <= all[k]) i++; while (j < sb.length && sb[j] <= all[k]) j++; w += Math.abs(i / sa.length - j / sb.length) * (all[k + 1] - all[k]); }
  return w;
}
function lgam(x) { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const v of c) s += v / ++y; return -t + Math.log(2.5066282746310005 * s / x); }
function bcf(a, b, x) { const T = 1e-30, qab = a + b, qap = a + 1, qam = a - 1; let c = 1, d = 1 - qab * x / qap; d = 1 / (Math.abs(d) < T ? T : d); let h = d; for (let m = 1; m < 200; m++) { const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2)); d = 1 + aa * d; d = 1 / (Math.abs(d) < T ? T : d); c = 1 + aa / c; c = Math.abs(c) < T ? T : c; h *= d * c; aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); d = 1 + aa * d; d = 1 / (Math.abs(d) < T ? T : d); c = 1 + aa / c; c = Math.abs(c) < T ? T : c; const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-12) break; } return h; }
function betai(a, b, x) { if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(lgam(a + b) - lgam(a) - lgam(b) + a * Math.log(x) + b * Math.log(1 - x)); return x < (a + 1) / (a + b + 2) ? bt * bcf(a, b, x) / a : 1 - bt * bcf(b, a, 1 - x) / b; }
const tTwoSidedP = (t, df) => betai(df / 2, 0.5, df / (df + t * t));
const tCrit95 = df => { let lo = 0, hi = 50; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; tTwoSidedP(m, df) > 0.05 ? lo = m : hi = m; } return (lo + hi) / 2; };
function welch(A, B) {
  const v = A.sd ** 2 / A.n + B.sd ** 2 / B.n, t = (A.mean - B.mean) / Math.sqrt(v), df = v * v / ((A.sd ** 2 / A.n) ** 2 / (A.n - 1) + (B.sd ** 2 / B.n) ** 2 / (B.n - 1)), cr = tCrit95(df);
  return { t, df, p: tTwoSidedP(Math.abs(t), df), meanDiffCI95_K: [A.mean - B.mean - cr * Math.sqrt(v), A.mean - B.mean + cr * Math.sqrt(v)] };
}
const pearson = (x, y) => { const mx = mean(x), my = mean(y); let a = 0, b = 0, c = 0; for (let i = 0; i < x.length; i++) { a += (x[i] - mx) * (y[i] - my); b += (x[i] - mx) ** 2; c += (y[i] - my) ** 2; } return a / Math.sqrt(b * c); };

/* ============================== likeness core ============================== */
/** How much each temperature component counts in the likeness (1 = normal). */
const COMPONENT_WEIGHT = { season: 0.25 };
const DAY = new Set([8, 9, 10, 11, 12, 13, 14, 15, 16, 17]), NIGHT = new Set([20, 21, 22, 23, 0, 1, 2, 3, 4, 5]);
function likenessCore(c, e, Te) {
  const comp = [], out = {};
  if (c.hour && e.hour) {
    const cb = new Set(c.hour.filter(h => h != null).map(h => Math.floor(h) % 24)), eb = new Set(e.hour.filter(h => h != null).map(h => Math.floor(h) % 24));
    const common = [...cb].filter(b => eb.has(b)).sort((a, b) => a - b); out.commonHours = common;
    const pick = (d, T, set) => T.filter((_, i) => d.hour[i] != null && set.has(Math.floor(d.hour[i]) % 24));
    const dS = new Set(common.filter(b => DAY.has(b))), nS = new Set(common.filter(b => NIGHT.has(b)));
    const cd = pick(c, c.T, dS), ed = pick(e, Te, dS), cn = pick(c, c.T, nS), en = pick(e, Te, nS);
    out.day = { celestial: cd, earth: ed, hours: [...dS] }; out.night = { celestial: cn, earth: en, hours: [...nS] };
    if (cd.length >= 3 && ed.length >= 3) { out.dayOverlap = overlap(cd, ed); comp.push({ key: 'day', name: `Daytime overlap (${[...dS].map(h => h + ':00').join(', ')})`, percent: 100 * out.dayOverlap }); }
    if (cn.length >= 3 && en.length >= 3) { out.nightOverlap = overlap(cn, en); comp.push({ key: 'night', name: `Night-time overlap (${[...nS].map(h => h + ':00').join(', ')})`, percent: 100 * out.nightOverlap }); }
    if (cd.length && cn.length && ed.length && en.length) { const ac = mean(cd) - mean(cn), ae = mean(ed) - mean(en); out.swing = { celestial_K: ac, earth_K: ae, ratio: Math.min(Math.abs(ac), Math.abs(ae)) / Math.max(Math.abs(ac), Math.abs(ae), 1e-9) }; comp.push({ key: 'swing', name: 'Day–night swing ratio', percent: 100 * out.swing.ratio }); }
  }
  if (c.ls && e.ls) {
    let sh = 0; const lc = mean(c.lat.filter(isFinite)), le = mean(e.lat.filter(isFinite));
    if (isFinite(lc) && isFinite(le) && Math.sign(lc) !== Math.sign(le) && Math.abs(lc) > 5 && Math.abs(le) > 5) sh = 180; out.hemisphereShift = sh;
    const useDay = out.day && out.day.hours.length; const set = useDay ? new Set(out.day.hours) : null;
    const bin = (d, T, s) => { const b = Array.from({ length: 12 }, () => []); T.forEach((x, i) => { if (d.ls[i] == null) return; if (set && (d.hour[i] == null || !set.has(Math.floor(d.hour[i]) % 24))) return; b[Math.floor(((d.ls[i] + s) % 360) / 30)].push(x); }); return b.map(a => a.length ? mean(a) : null); };
    const bc = bin(c, c.T, 0), be = bin(e, Te, sh); out.season = { binsLs: Array.from({ length: 12 }, (_, i) => i * 30 + 15), celestial_K: bc, earth_K: be, daytimeOnly: !!useDay };
    const idx = bc.map((v, i) => v != null && be[i] != null ? i : -1).filter(i => i >= 0);
    if (idx.length >= 4) { out.season.r = pearson(idx.map(i => bc[i]), idx.map(i => be[i])); out.season.nBins = idx.length; comp.push({ key: 'season', name: `Seasonal pattern match (r = ${out.season.r.toFixed(2)}, ${idx.length} season bins)`, percent: 100 * Math.max(0, out.season.r) }); }
  }
  if (!comp.some(x => x.key === 'day' || x.key === 'night')) {
    const A = describe(c.T), B = describe(Te); out.overallOverlap = overlap(c.T, Te);
    comp.push({ key: 'all', name: 'Overall distribution overlap', percent: 100 * out.overallOverlap });
    const ilo = Math.max(A.p5, B.p5), ihi = Math.min(A.p95, B.p95), ulo = Math.min(A.p5, B.p5), uhi = Math.max(A.p95, B.p95);
    comp.push({ key: 'range', name: 'Shared 5–95% temperature range', percent: 100 * Math.max(0, ihi - ilo) / (uhi - ulo || 1) });
    comp.push({ key: 'mean', name: 'Mean closeness (e-fold 30 K)', percent: 100 * Math.exp(-Math.abs(A.mean - B.mean) / 30) });
  }
  // The seasonal pattern says when a place warms and cools, not how warm it is, so it counts a quarter as much as the other parts.
  comp.forEach(x => { x.weight = COMPONENT_WEIGHT[x.key] ?? 1; });
  const W = comp.reduce((s, x) => s + x.weight, 0);
  out.components = comp; out.likeness = comp.length ? comp.reduce((s, x) => s + x.weight * x.percent, 0) / W : null; return out;
}
function resample(d, T) { const n = T.length, idx = Array.from({ length: n }, () => Math.floor(Math.random() * n)); return { T: idx.map(i => T[i]), hour: d.hour ? idx.map(i => d.hour[i]) : null, ls: d.ls ? idx.map(i => d.ls[i]) : null, lat: d.lat.length ? idx.map(i => d.lat[i]) : [] }; }
function thresholds(d, T) {
  const n = T.length, f = th => 100 * T.filter(x => x < th).length / n;
  const r = { above273K_waterIceMelts: 100 - f(273.15), below252K_NaClBrineEutectic: f(252), below206K_MgPerchlorateEutectic: f(206), below148K_CO2FrostOnMars: f(148), below110K_iceStableGeologically: f(110) };
  if (d.t && d.t.every(x => x != null)) {
    const o = d.t.map((t, i) => [t, T[i]]).sort((a, b) => a[0] - b[0]); let cr = 0;
    for (let i = 1; i < o.length; i++) if (o[i][0] - o[i - 1][0] <= 3 * 36e5 && (o[i][1] - 273.15) * (o[i - 1][1] - 273.15) < 0) cr++;
    const days = (o[o.length - 1][0] - o[0][0]) / 864e5 || 1; r.freezeThawCycles = cr / 2; r.freezeThawSpanDays = days; r.freezeThawPerDay = cr / 2 / days;
  }
  return r;
}
function verdictFor(p, subject = 'temperature') { const w = subject === 'topography' ? 'topographic' : subject === 'composition' ? 'compositional' : 'thermal'; return p >= 60 ? `Strong ${w} analog` : p >= 35 ? 'Good partial analog' : p >= 15 ? 'Limited analog' : `Poor ${w} analog`; }

/**
 * Compare two temperature datasets.
 * opts.elevation: { from_m, to_m, lapseRate_K_per_km = 6.5 }  shifts Earth values (e.g. grid cell → summit)
 * opts.bootstrap: number of bootstrap resamples for the 95% interval (default 120; 0 = skip)
 * opts.onProgress: (fraction 0–1) => void
 */
async function analyzeTemperature(celestial, earth, opts = {}) {
  const c = celestial, e = earth;
  let adj = 0; const el = opts.elevation;
  if (el && isFinite(el.from_m) && isFinite(el.to_m)) adj = -(el.lapseRate_K_per_km ?? 6.5) * (el.to_m - el.from_m) / 1000;
  const Te = adj ? e.T.map(x => x + adj) : e.T;
  const out = likenessCore(c, e, Te);
  const A = describe(c.T), B = describe(Te);
  const ks = ksTest(A.sorted, B.sorted), w = wasserstein(A.sorted, B.sorted), wt = welch(A, B);
  const d = (A.mean - B.mean) / Math.sqrt(((A.n - 1) * A.sd ** 2 + (B.n - 1) * B.sd ** 2) / (A.n + B.n - 2));
  const hourly = (d_, T) => d_.hour ? Array.from({ length: 24 }, (_, h) => { const v = T.filter((_, i) => d_.hour[i] != null && Math.floor(d_.hour[i]) % 24 === h); return v.length ? { hour: h, mean_K: mean(v), sd_K: v.length > 1 ? sd(v) : 0, n: v.length } : null; }) : null;
  const nB = opts.bootstrap ?? 120, sc = [];
  for (let b = 0; b < nB; b++) {
    if (b % 20 === 0) { opts.onProgress && opts.onProgress(b / nB); await new Promise(r => setTimeout(r, 0)); }
    const rc = resample(c, c.T), re = resample(e, Te); const o = likenessCore(rc, re, re.T); if (o.likeness != null) sc.push(o.likeness);
  }
  sc.sort((a, b) => a - b); opts.onProgress && opts.onProgress(1);
  const strip = s => { const { sorted, ...rest } = s; return { ...rest, mean_C: kToC(s.mean), median_C: kToC(s.median), min_C: kToC(s.min), max_C: kToC(s.max) }; };
  return {
    subject: 'temperature',
    likeness: out.likeness,
    ci95: sc.length > 10 ? [q(sc, .025), q(sc, .975)] : null,
    bootstrapResamples: sc.length, bootstrapScores: sc,
    verdict: verdictFor(out.likeness),
    components: out.components,
    celestial: { stats: strip(A), thresholdsPercent: thresholds(c, c.T), hourly: hourly(c, c.T), meta: c.meta },
    earth: { stats: strip(B), thresholdsPercent: thresholds(e, Te), hourly: hourly(e, Te), meta: e.meta, elevationCorrection_K: adj },
    tests: {
      meanDifference_K: A.mean - B.mean, meanDifferenceCI95_K: wt.meanDiffCI95_K,
      welch: { t: wt.t, df: wt.df, p: wt.p }, cohensD: d,
      kolmogorovSmirnov: ks, wasserstein_K: w,
      overallOverlap: out.overallOverlap ?? overlap(c.T, Te),
    },
    daily: out.day ? {
      commonHours: out.commonHours, dayHours: out.day.hours, nightHours: out.night.hours,
      dayMean_K: out.day.celestial.length && out.day.earth.length ? { celestial: mean(out.day.celestial), earth: mean(out.day.earth) } : null,
      nightMean_K: out.night.celestial.length && out.night.earth.length ? { celestial: mean(out.night.celestial), earth: mean(out.night.earth) } : null,
      dayOverlap: out.dayOverlap ?? null, nightOverlap: out.nightOverlap ?? null, swing: out.swing ?? null,
    } : null,
    seasonal: out.season ? { ...out.season, hemisphereShift_deg: out.hemisphereShift } : null,
  };
}

/* ============================== assessment ============================== */
const fC = k => (k - 273.15).toFixed(1) + ' °C', dK = k => k.toFixed(1) + ' K', pc = x => Math.round(x) + '%';

/** Offline, rule-based verdict + experiments (always available). Written to read naturally: no em dashes or semicolons. */
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
function ruleTemperature(r, ctx = {}) {
  const b = BODIES[ctx.body] || BODIES.other, cName = ctx.celestialSite || 'the target site', eName = ctx.earthSite || 'the Earth site';
  const body = b.name, D = r.daily || {}, tc = r.celestial.thresholdsPercent, te = r.earth.thresholdsPercent, s = r.likeness;
  const S = [], ex = [];
  S.push(s >= 60 ? `${cap(eName)} works well as a thermal stand-in for ${cName}.` : s >= 35 ? `${cap(eName)} matches ${cName} in some ways but not in others.` : s >= 15 ? `${cap(eName)} only resembles ${cName} in a few narrow ways.` : `${cap(eName)} is not a good thermal match for ${cName}.`);
  if (D.dayOverlap != null) S.push(D.dayOverlap >= .3
    ? `Afternoon temperatures line up fairly well. ${cap(cName)} averages ${fC(D.dayMean_K.celestial)} and ${eName} averages ${fC(D.dayMean_K.earth)}.`
    : `Afternoons differ. ${cap(cName)} averages ${fC(D.dayMean_K.celestial)}, while ${eName} averages ${fC(D.dayMean_K.earth)}, and only ${pc(100 * D.dayOverlap)} of the two temperature ranges overlap.`);
  if (D.nightOverlap != null) S.push(D.nightOverlap >= .3
    ? `Nights are similar too, about ${fC(D.nightMean_K.celestial)} for ${cName} and ${fC(D.nightMean_K.earth)} for ${eName}.`
    : `Nights are where the two sites part ways. ${cap(cName)} drops to about ${fC(D.nightMean_K.celestial)} after dark, while ${eName} stays near ${fC(D.nightMean_K.earth)}.`);
  if (D.swing) S.push(D.swing.ratio >= .5
    ? `The daily swing is comparable, ${dK(D.swing.celestial_K)} for ${cName} and ${dK(D.swing.earth_K)} for ${eName}.`
    : `The surface at ${cName} swings about ${dK(D.swing.celestial_K)} between day and night. ${cap(eName)} swings only ${dK(D.swing.earth_K)}, about ${pc(100 * D.swing.ratio)} of that range.`);
  if (r.seasonal && r.seasonal.r != null) { const rr = r.seasonal.r.toFixed(2); S.push(r.seasonal.r >= .5 ? `Both sites warm and cool through the year in step (r = ${rr}).` : r.seasonal.r < 0 ? `Their seasons move in opposite directions (r = ${rr}).` : `Their seasonal cycles barely track each other (r = ${rr}).`); }
  if (D.dayOverlap == null && D.nightOverlap == null) S.push(`Taken as a whole, the two temperature distributions overlap by ${pc(100 * r.tests.overallOverlap)}, and their averages are ${dK(Math.abs(r.tests.meanDifference_K))} apart.`);
  const gap = r.tests.meanDifference_K;
  if (s >= 35 && Math.abs(gap) > 20) S.push(`The score leans on the pattern match, though. On average ${eName} is still ${dK(Math.abs(gap))} ${gap < 0 ? 'warmer' : 'colder'} than ${cName}, so field results will need correcting for that offset.`);
  if (D.dayOverlap >= .25) ex.push({ title: 'Daytime field operations test', objective: `Afternoons at ${eName} fall in the same range as at ${cName}, which makes them useful for testing how hardware warms up and runs in the cold.`, method: 'Operate rover or lander hardware during the matched hours and log component temperatures, power draw and any failures.', measure: 'Time to reach operating temperature, battery capacity loss and actuator torque margins.' });
  if (D.swing && D.swing.ratio < .4) ex.push({ title: 'Field samples plus chamber cycling', objective: `The day-night swing at ${eName} is only ${pc(100 * D.swing.ratio)} of the swing at ${cName}, so the field alone cannot reproduce the full thermal stress.`, method: `Collect rock, soil and material samples on site, then cycle them in a thermal vacuum chamber between ${fC(r.celestial.stats.p5)} and ${fC(r.celestial.stats.p95)}.`, measure: 'Crack growth, grain breakdown and fatigue in coatings and adhesives after each cycle.' });
  const crosses = t => t.above273K_waterIceMelts > 5 && t.above273K_waterIceMelts < 95;
  if (crosses(tc) && crosses(te)) ex.push({ title: 'Freeze-thaw weathering', objective: 'Both sites cross 0 °C, so freeze-thaw weathering can be studied on Earth under realistic conditions.', method: `Fit rocks and soil with thermocouples and strain gauges and record them through repeated cycles. Compare the crossing frequency with the rate at ${cName}.`, measure: 'Freeze-thaw cycles per day, fracture growth and production of fine grains.' });
  if (ctx.body === 'mars' && te.above273K_waterIceMelts < 50) ex.push({ title: 'Brine and ice stability', objective: `Perchlorate brines on Mars can stay liquid well below 0 °C. The cold at ${eName} makes it possible to test when such brines form and freeze.`, method: 'Set up soil plots mixed with perchlorate and chloride salts, add humidity and temperature sensors, and record when brines appear and freeze.', measure: 'Temperature at which brine forms, how long it stays liquid, and the salt crusts it leaves.' });
  if (ctx.body === 'mars' && te.above273K_waterIceMelts < 70) ex.push({ title: 'Microbial cold-survival test', objective: 'Whether microbes survive these temperatures bears directly on Mars habitability and planetary protection.', method: 'Leave dried microbial samples on site, collect them at set intervals, then culture or sequence them.', measure: 'Survival rate, metabolic activity and DNA damage over time.' });
  if (D.nightOverlap != null && D.nightOverlap < .1) ex.push({ title: 'Night survival in a cryogenic chamber', objective: `Nights at ${cName}, about ${fC(D.nightMean_K.celestial)}, are far colder than anything ${eName} reaches. This part has to be tested in the lab.`, method: 'Hold flight hardware at the night temperature with heaters running on a fixed power budget.', measure: 'Heater energy per night and how reliably the electronics restart from cold.' });
  if (r.seasonal && r.seasonal.r >= .5) ex.push({ title: 'Year-round thermal monitoring', objective: `Both sites follow the same seasonal pattern (r = ${r.seasonal.r.toFixed(2)}), so a full year of measurements at ${eName} can show how materials and instruments respond to that cycle.`, method: 'Install a weather station and buried temperature probes at several depths, and run them for at least one full year.', measure: 'Surface and subsurface temperature, seasonal heating rate, and the lag between the surface and depth.' });
  if (!ex.length) ex.push({ title: 'Instrument calibration campaign', objective: 'Even a weak thermal match can serve to check temperature sensors against ground truth before a mission.', method: 'Place a flight-like radiometer next to ground thermocouples and record both for several days.', measure: 'Bias and noise of the radiometer readings compared with the thermocouples.' });
  return {
    source: 'rule-based', verdict: verdictFor(s), should: s >= 35 ? 'Yes' : s >= 15 ? 'Yes, for specific tests' : 'No',
    headline: `${cap(eName)} is a ${verdictFor(s).toLowerCase()} for ${cName} on ${body}, with ${pc(s)} temperature likeness.`,
    summary: S.join(' '),
    experiments: ex.slice(0, 4),
    caveats: ['This looks at temperature only. Pressure, radiation, chemistry and gravity also matter when choosing an analog site.'],
  };
}

/** Remove em dashes and semicolons that slip into generated text. */
function tidyText(t) {
  if (typeof t !== 'string') return t;
  return t.replace(/\s*—\s*/g, ', ').replace(/\s+–\s+/g, ', ').replace(/;\s*([a-z])/g, (_, c) => '. ' + c.toUpperCase()).replace(/;\s*/g, '. ').replace(/,\s*,/g, ',').replace(/\s{2,}/g, ' ').trim();
}
function tidyAssessment(a) {
  const o = { ...a };
  for (const k of ['headline', 'summary']) o[k] = tidyText(o[k]);
  o.experiments = (o.experiments || []).map(x => ({ title: tidyText(x.title), objective: tidyText(x.objective), method: tidyText(x.method), measure: tidyText(x.measure) }));
  o.caveats = (o.caveats || []).map(tidyText);
  return o;
}

function payloadTemperature(r, ctx = {}) {
  const b = BODIES[ctx.body] || BODIES.other, k = x => x == null ? null : +(+x).toFixed(2);
  const st = s => ({ n: s.n, mean: k(s.mean), sd: k(s.sd), min: k(s.min), p5: k(s.p5), median: k(s.median), p95: k(s.p95), max: k(s.max) });
  return {
    subject: 'surface temperature',
    celestial: { body: b.name, site: ctx.celestialSite || null, atmosphere: b.atmosphere, context: b.note, stats_K: st(r.celestial.stats), hours_available: r.daily ? r.daily.commonHours : null },
    earth: { site: ctx.earthSite || null, elevation_correction_K: k(r.earth.elevationCorrection_K), stats_K: st(r.earth.stats) },
    likeness_percent: k(r.likeness), ci95: r.ci95 && r.ci95.map(k), components: r.components.map(x => ({ name: x.name, percent: k(x.percent) })),
    day_means_K: r.daily && r.daily.dayMean_K ? { celestial: k(r.daily.dayMean_K.celestial), earth: k(r.daily.dayMean_K.earth) } : null,
    night_means_K: r.daily && r.daily.nightMean_K ? { celestial: k(r.daily.nightMean_K.celestial), earth: k(r.daily.nightMean_K.earth) } : null,
    swing_K: r.daily && r.daily.swing ? { celestial: k(r.daily.swing.celestial_K), earth: k(r.daily.swing.earth_K) } : null,
    seasonal_r: r.seasonal ? k(r.seasonal.r) : null,
    tests: { welch_p: r.tests.welch.p, cohens_d: k(r.tests.cohensD), ks_D: k(r.tests.kolmogorovSmirnov.D), wasserstein_K: k(r.tests.wasserstein_K), overall_overlap: k(r.tests.overallOverlap) },
    thresholds_percent_of_readings: { celestial: r.celestial.thresholdsPercent, earth: r.earth.thresholdsPercent },
  };
}

const WRITING_STYLE = `WRITING RULES (act as a skilled human editor: every text field must sound completely natural, conversational and written by a real person):
- Target reader and tone: follow AUDIENCE below. If there is no AUDIENCE, write for a busy colleague in a warm, plain-spoken tone.
- Do not use em dashes, semicolons, or overly complex corporate buzzwords.
- Leave out AI cliches and formulaic transitions such as "It's important to remember", "It is worth noting", "In conclusion", "Furthermore", "Moreover", "Additionally" or "Delve".
- Vary sentence length on purpose: mix short, punchy sentences with longer, flowing ones.
- Use active voice, contractions (don't, can't, it's) and natural everyday language.
- No Markdown bullet points, bold text or headings inside the strings.
- Keep list (do not change): every number, unit, site name, instrument name, date and citation must stay exactly as given. You may convert kelvin to °C, rounded to one decimal place. Don't claim more than the numbers show.`;

const SUBJECT_BRIEF = {
  temperature: { units: 'temperatures in kelvin', what: 'thermal analog' },
  topography: { units: 'elevations and lengths in metres, slopes in degrees, areas in km²', what: 'topographic analog (terrain shape: relief, height distribution and slopes)' },
  composition: { units: 'abundances in percent', what: 'compositional analog (bulk chemistry or mineralogy)' },
};
/** Who an assessment is written for: kids, teens, students or scientists. */
const AUDIENCE = {
 "kids": "Target reader: children about 8 to 11. Tone: playful and encouraging, like a favourite science teacher. Very simple words, short sentences, one fun everyday comparison, and no statistics words (say what a number means in plain terms). Suggest experiments a class could imagine or try safely.",
 "teens": "Target reader: teenagers about 13 to 17. Tone: friendly and direct, never talking down. Everyday words, and explain any science or statistics term in a few words the first time it comes up.",
 "students": "Target reader: university science students. Tone: clear and warm, like a good lab instructor. Standard science terms are fine, with a short explanation of the statistics.",
 "scientists": "Target reader: professional planetary scientists. Tone: direct, precise and plain-spoken, like a colleague in a team meeting. Use exact terminology, cite the statistics, instruments and methods, and state the limitations."
};
function assessmentPrompt(r, ctx = {}) {
  const sb = SUBJECT_BRIEF[r.subject || 'temperature'];
  return `You are a planetary scientist specialising in terrestrial analog sites. Using ONLY the computed statistics below (${sb.units}), decide whether the Earth site is a useful ${sb.what} for the site on the other body, and recommend concrete field experiments that suit this comparison.
Be quantitative: cite the numbers you rely on. Be honest about what the site cannot reproduce. Do not invent data.

${WRITING_STYLE}

Reply with JSON only:
{"verdict":"Strong|Good partial|Limited|Poor","should":"Yes|Yes, for specific tests|No","headline":"one sentence with the likeness percent","summary":"3 to 5 sentences of scientific interpretation","experiments":[{"title":"...","objective":"why this site suits it, with numbers","method":"what to do on site and with what instruments","measure":"what to record"}],"caveats":["..."]}
Give 2 to 4 experiments, ordered by scientific value.${ctx.audience && AUDIENCE[ctx.audience] ? '\nAUDIENCE: ' + AUDIENCE[ctx.audience] : ''}${ctx.language && !/^en/i.test(ctx.language) ? `
Write every text field in ${ctx.language}. Keep chemical formulas, units and numbers as they are.` : ''}

DATA:
${JSON.stringify(assessmentPayload(r, ctx))}`;
}

/**
 * Call Claude through the Anthropic Messages API.
 * In a browser this exposes your API key to the page's users: prefer calling it from your server.
 */
async function callClaude({ apiKey, prompt, model = 'claude-sonnet-5-5', maxTokens = 2000, image }) {
  const content = image ? [{ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } }, { type: 'text', text: prompt }] : prompt;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const j = await res.json(); return j.content.filter(b => b.type === 'text').map(b => b.text).join('');
}
const firstJSON = t => { const m = t.match(/\{[\s\S]*\}/); if (!m) throw new Error('No JSON in reply'); return JSON.parse(m[0]); };

/**
 * Verdict + experiments. Uses Claude when ctx.apiKey or ctx.ask is given, otherwise (or on failure) the rule-based version.
 * ctx: { body: 'mars'|'moon'|..., celestialSite, earthSite, apiKey?, model?, ask?: async (prompt) => replyText }
 */
async function assess(r, ctx = {}) {
  const fallback = ruleBasedAssessment(r, ctx);
  if (!ctx.apiKey && !ctx.ask) return fallback;
  try {
    const prompt = assessmentPrompt(r, ctx);
    const text = ctx.ask ? await ctx.ask(prompt) : await callClaude({ apiKey: ctx.apiKey, model: ctx.model, prompt });
    return tidyAssessment({ source: 'claude', ...firstJSON(text) });
  } catch (err) { return { ...fallback, source: 'rule-based (Claude failed: ' + err.message + ')' }; }
}

/**
 * Ask Claude to read a map's colour legend. Returns a key for decodeMapPixels(), or throws E-NOKEY / E-SUBJECT / E-NOUNITS.
 * image: { base64, mediaType: 'image/png'|'image/jpeg' }
 */
async function readLegendWithClaude(image, { apiKey, model, ask, subject = 'temperature' } = {}) {
  const what = subject === 'topography' ? 'ELEVATION (topography)' : 'TEMPERATURE', units = subject === 'topography' ? '"m"|"km"|"ft"' : '"K"|"C"|"F"';
  const prompt = `You are checking a scientific map image before quantitative analysis. Decide whether it has a colour key (legend or colour bar) that maps colours to ${what} values with readable tick labels. Reply with JSON only, no prose:
{"has_key":true|false,"is_subject":true|false,"unit":${units}|null,"stops":[{"hex":"#rrggbb","value":number}],"map_region":{"x0":0-1,"y0":0-1,"x1":0-1,"y1":0-1},"reason":"one sentence"}
stops: 5 to 12 entries ordered along the colour bar; for each labelled tick, give the tick's value and the bar's colour at that tick. map_region: the bounding box of the data area only (exclude legend, titles, axes), as fractions of image width and height. If there is no key, or the tick labels are unreadable, or no units are given, set has_key false and explain in reason.`;
  const text = ask ? await ask(prompt, image) : await callClaude({ apiKey, model, prompt, image });
  const r = firstJSON(text);
  if (!r.has_key || !r.stops || r.stops.length < 2) throw new AnalogError('E-NOKEY', 'No key: this map has no readable colour legend.', (r.reason || '') + ' Without a key the colours cannot be turned into temperatures.');
  if (r.is_subject === false) throw new AnalogError('E-SUBJECT', `The map's key is not ${subject}.`, r.reason || '');
  if (!r.unit) throw new AnalogError('E-NOUNITS', "The map's key has no units.", 'Pass the units yourself and build the key with stopsFromColormap().');
  return { stops: r.stops, units: r.unit, region: r.map_region || undefined, reason: r.reason, subject };
}

function mdTemperature(r, a, ctx = {}) {
  const b = BODIES[ctx.body] || BODIES.other, A = r.celestial.stats, B = r.earth.stats, cN = ctx.celestialSite || 'Celestial site', eN = ctx.earthSite || 'Earth site';
  return `# Temperature analog report: ${eN} vs ${cN} (${b.name})

Likeness: ${pc(r.likeness)}${r.ci95 ? ` (95% CI ${pc(r.ci95[0])} to ${pc(r.ci95[1])})` : ''}. ${r.verdict}.

## Components
${r.components.map(x => `- ${x.name}: ${pc(x.percent)}`).join('\n')}

## Statistics
| | ${cN} | ${eN} |
|---|---|---|
| n | ${A.n} | ${B.n} |
| Mean | ${fC(A.mean)} | ${fC(B.mean)} |
| SD | ${dK(A.sd)} | ${dK(B.sd)} |
| Min | ${fC(A.min)} | ${fC(B.min)} |
| Max | ${fC(A.max)} | ${fC(B.max)} |

Welch p = ${r.tests.welch.p.toExponential(2)}, Cohen's d = ${r.tests.cohensD.toFixed(2)}, KS D = ${r.tests.kolmogorovSmirnov.D.toFixed(2)}, Wasserstein = ${dK(r.tests.wasserstein_K)}, overlap = ${pc(100 * r.tests.overallOverlap)}

## Assessment (${a.source})
Experiment here? ${a.should}

${a.headline}

${a.summary}

## Experiments
${(a.experiments || []).map(x => `### ${x.title}\n- Goal: ${x.objective}\n- Method: ${x.method}\n- Measure: ${x.measure}`).join('\n\n')}

## Caveats
${(a.caveats || []).map(x => '- ' + x).join('\n')}
`;
}

/* ============================== shared helpers for the newer subjects ============================== */
const SUBJECTS = ['temperature', 'topography', 'composition'];
/** Mean planetary radius in metres, used to turn latitude/longitude spacing into distance for slopes. */
const RADIUS_M = { earth: 6371000, mars: 3389500, moon: 1737400, mercury: 2439700, europa: 1560800, titan: 2574730, other: null };

function readHeaderTable(text, example) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() && !/^\s*(#|%|\/\/)/.test(l));
  if (lines.length < 2) throw new AnalogError('E-EMPTY', 'The file has no data rows.', 'Check that the file is a table with one header row and at least one row of values.');
  const h0 = lines[0];
  const d = ['\t', ',', ';', '|'].map(c => [c, h0.split(c).length]).sort((a, b) => b[1] - a[1])[0];
  const del = d[1] > 1 ? d[0] : lines[1].trim().split(/\s+/).length > 1 ? 'ws' : '\n';   // '\n' = a single column
  const head = splitLine(h0, del);
  if (head.every(x => x !== '' && !isNaN(+x))) throw new AnalogError('E-NOKEY', 'No key: the file has no header row.', `Without column names the engine cannot tell which column holds the measurements or what units they use. Add a header row such as "${example}".`);
  return { head, rows: lines.slice(1).map(l => splitLine(l, del)) };
}
const finite = a => a.filter(x => Number.isFinite(x));
const median = a => { const s = Float64Array.from(a).sort(); return s.length ? q(s, .5) : NaN; };

/* ============================== which subject does a file look like? ============================== */
const SUBJECT_LABEL = { temperature: 'Temperature', topography: 'Topography', composition: 'Surface composition' };
function compColumns(head) { return head.filter(h => { if (SKIP_RX.test(h.trim())) return false; const b = baseName(h), key = b.toLowerCase().replace(/\s+/g, ''); return !!OXIDE_NAMES[key] || MINERAL_RX.test(b); }); }
/** Best guess at which subject a header row belongs to: 'composition', 'topography', 'temperature' or null. */
function guessSubject(head) {
  if (compColumns(head).length >= 3) return 'composition';
  const temp = head.some(h => /temp|tsurf|^ts\b|^ts[ _(]|^t[ _(]|^t$|t2m|brightness|bolometric/i.test(h) && !/sh_temp|sensor|instrument|housing/i.test(h));
  if (head.some(h => ELEV_RX.test(h) && !/^lat|^lon/i.test(h)) && !temp) return 'topography';
  return temp ? 'temperature' : null;
}
function subjectHint(head, current) { const g = guessSubject(head); return g && g !== current ? ` This file looks like ${SUBJECT_LABEL[g].toLowerCase()} data, so try the ${SUBJECT_LABEL[g]} subject.` : ''; }
function subjectGuard(head, current) {
  if (current === 'composition') return;
  const c = compColumns(head);
  if (c.length >= 3) throw new AnalogError('E-SUBJECT', `This file looks like surface composition data, not ${current}.`, `It has composition columns such as ${c.slice(0, 4).join(', ')}. Switch the subject to Surface composition, or choose a ${current} file.`);
}

/* ============================== topography: parsing ============================== */
const ELEV_RX = /elev|height|altitude|^alt\b|topo|^dem\b|^dem[ _(]|mola|^z\b|^z[ _(]|^h\b|^h[ _(]|^radius/i;
function lengthUnit(h) {
  const s = h.toLowerCase();
  if (/\bkm\b|kilomet/.test(s)) return 'km';
  if (/\bft\b|feet|foot/.test(s)) return 'ft';
  if (/\(m\)|\[m\]|_m\b|\bmet(er|re)s?\b|\bm\)|\bm\]/.test(s)) return 'm';
  return null;
}
const toM = (v, u) => u === 'km' ? v * 1000 : u === 'ft' ? v * 0.3048 : v;

/** Parse an elevation table. Needs an elevation column whose header states m, km or ft (or opts.units). lat/lon columns enable slopes. */
function parseTopography(text, opts = {}) {
  const uo = opts.units || 'auto';
  const { head, rows } = readHeaderTable(text, 'lat, lon, elevation (m)');
  subjectGuard(head, 'topography');
  const find = re => head.findIndex(x => re.test(x));
  const iLat = find(/^lat/i), iLon = find(/^lon/i), iS = find(/slope/i);
  const iZ = head.findIndex((x, i) => i !== iLat && i !== iLon && i !== iS && ELEV_RX.test(x));
  if (iZ < 0) throw new AnalogError('E-NOELEV', 'No elevation column found in the key.', `The header lists: ${head.join(', ')}. Name the elevation column with "elevation", "height", "altitude" or "topography" and include its units, e.g. "elevation (m)".${subjectHint(head, 'topography')}`);
  const u = uo !== 'auto' ? uo : lengthUnit(head[iZ]);
  if (!u) throw new AnalogError('E-NOUNITS', `The elevation column "${head[iZ]}" has no units in its key.`, 'Add units to the header, e.g. "elevation (m)" or "height (km)", or pass opts.units = "m" | "km" | "ft".');
  const warnings = [];
  let slopeUnit = null;
  if (iS >= 0) { const s = head[iS].toLowerCase(); slopeUnit = /%|percent|grade/.test(s) ? 'pct' : 'deg'; if (!/deg|°|%|percent|grade/.test(s)) warnings.push(`The slope column "${head[iS]}" has no units, so it is read as degrees.`); }
  const z = [], lat = [], lon = [], slope = iS >= 0 ? [] : null; let fill = 0, imp = 0, bad = 0;
  for (const c of rows) {
    const v = parseFloat(c[iZ]);
    if (c[iZ] === undefined || c[iZ] === '' || isNaN(v)) { bad++; continue; }
    if (v <= -9999 || Math.abs(v) >= 1e20) { fill++; continue; }
    const m = toM(v, u); if (Math.abs(m) > 30000) { imp++; continue; }
    z.push(m); lat.push(iLat >= 0 ? parseFloat(c[iLat]) : NaN); lon.push(iLon >= 0 ? parseFloat(c[iLon]) : NaN);
    if (slope) { const s = parseFloat(c[iS]); slope.push(isNaN(s) ? NaN : slopeUnit === 'pct' ? Math.atan(s / 100) * 180 / Math.PI : s); }
  }
  if (z.length < 3) throw new AnalogError('E-FEW', 'Fewer than 3 usable elevation values.', `${fill} fill values, ${imp} impossible values and ${bad} unreadable cells were removed. Check the column and units.`);
  if (iLat < 0 || iLon < 0) warnings.push('No latitude and longitude columns, so slopes and roughness cannot be worked out unless a slope column is given.');
  return { subject: 'topography', z, lat, lon, slope, grid: null, meta: { kind: 'series', columns: { elevation: head[iZ], slope: iS >= 0 ? head[iS] : null, position: iLat >= 0 && iLon >= 0 ? `${head[iLat]}, ${head[iLon]}` : null }, units: u, unitsFrom: uo !== 'auto' ? 'given manually' : 'file key', removedFill: fill, removedImpossible: imp, unreadable: bad, warnings } };
}

/* ============================== topography: analysis ============================== */
function gridFromPoints(z, lat, lon) {
  const pts = []; for (let i = 0; i < z.length; i++) if (Number.isFinite(lat[i]) && Number.isFinite(lon[i])) pts.push([+lat[i].toFixed(6), +lon[i].toFixed(6), z[i]]);
  if (pts.length < 25) return null;
  const la = [...new Set(pts.map(p => p[0]))].sort((a, b) => b - a), lo = [...new Set(pts.map(p => p[1]))].sort((a, b) => a - b);
  if (la.length < 5 || lo.length < 5 || la.length * lo.length > 4 * pts.length) return null;
  const iR = new Map(la.map((v, i) => [v, i])), iC = new Map(lo.map((v, i) => [v, i]));
  const g = new Float64Array(la.length * lo.length).fill(0), n = new Uint32Array(la.length * lo.length);
  for (const [a, b, v] of pts) { const k = iR.get(a) * lo.length + iC.get(b); g[k] += v; n[k]++; }
  let filled = 0; for (let k = 0; k < g.length; k++) { if (n[k]) { g[k] /= n[k]; filled++; } else g[k] = NaN; }
  if (filled / g.length < 0.5) return null;
  const md = a => median(a.slice(1).map((v, i) => Math.abs(v - a[i])));
  return { g, nR: la.length, nC: lo.length, lats: la, dlatDeg: md(la), dlonDeg: md(lo) };
}
function slopesFromGrid(G, radius) {
  const { g, nR, nC } = G, out = []; let dxs = [], dy;
  const rad = Math.PI / 180;
  for (let r = 1; r < nR - 1; r++) {
    const dx = G.dx_m ?? radius * Math.cos(G.lats[r] * rad) * G.dlonDeg * rad; dy = G.dy_m ?? radius * G.dlatDeg * rad; dxs.push(dx);
    for (let c = 1; c < nC - 1; c++) {
      const zn = g[(r - 1) * nC + c], zs = g[(r + 1) * nC + c], zw = g[r * nC + c - 1], ze = g[r * nC + c + 1];
      if (![zn, zs, zw, ze].every(Number.isFinite)) continue;
      const gx = (ze - zw) / (2 * dx), gy = (zn - zs) / (2 * dy);
      out.push(Math.atan(Math.hypot(gx, gy)) * 180 / Math.PI);
    }
  }
  return { slopes: out, spacing_m: dxs.length ? (median(dxs) + dy) / 2 : null };
}
function planeResidualSD(z, x, y) {
  const n = z.length; if (n < 10) return null;
  let Sx = 0, Sy = 0, Sz = 0, Sxx = 0, Syy = 0, Sxy = 0, Sxz = 0, Syz = 0;
  for (let i = 0; i < n; i++) { Sx += x[i]; Sy += y[i]; Sz += z[i]; Sxx += x[i] * x[i]; Syy += y[i] * y[i]; Sxy += x[i] * y[i]; Sxz += x[i] * z[i]; Syz += y[i] * z[i]; }
  const M = [[n, Sx, Sy], [Sx, Sxx, Sxy], [Sy, Sxy, Syy]], v = [Sz, Sxz, Syz];
  const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(M); if (Math.abs(D) < 1e-12) return null;
  const sol = [0, 1, 2].map(j => det(M.map((row, i) => row.map((val, k) => k === j ? v[i] : val))) / D);
  let ss = 0; for (let i = 0; i < n; i++) { const r = z[i] - (sol[0] + sol[1] * x[i] + sol[2] * y[i]); ss += r * r; }
  return Math.sqrt(ss / (n - 3));
}
function hypsometry(z) { const s = Float64Array.from(z).sort(), lo = s[0], hi = s[s.length - 1], R = hi - lo || 1; return Array.from({ length: 21 }, (_, i) => (q(s, 1 - i / 20) - lo) / R); }
function topoProfile(d, radius) {
  const z = d.z, A = describe(z), rel = z.map(v => v - A.median);
  const prof = { stats: A, rel, relief_m: A.p95 - A.p5, range_m: A.max - A.min, hypsometricIntegral: (A.mean - A.min) / (A.max - A.min || 1), hypsometry: hypsometry(z), slopes: null, spacing_m: null, area_km2: null, roughness_m: null };
  const hasLL = d.lat.length && d.lat.some(Number.isFinite) && d.lon.some(Number.isFinite);
  let G = d.grid || (hasLL ? gridFromPoints(z, d.lat, d.lon) : null);
  if (d.slope && finite(d.slope).length >= 3) prof.slopes = finite(d.slope);
  else if (G && (G.dx_m || radius)) { const s = slopesFromGrid(G, radius); if (s.slopes.length >= 3) { prof.slopes = s.slopes; prof.spacing_m = s.spacing_m; } }
  if (hasLL && radius) {
    const la = finite(d.lat), lo = finite(d.lon), rad = Math.PI / 180, lat0 = mean(la) * rad, lon0 = mean(lo);
    const la1 = amin(la) * rad, la2 = amax(la) * rad;
    prof.area_km2 = (radius / 1000) ** 2 * (amax(lo) - amin(lo)) * rad * Math.abs(Math.sin(la2) - Math.sin(la1));
    const idx = z.map((_, i) => i).filter(i => Number.isFinite(d.lat[i]) && Number.isFinite(d.lon[i]));
    prof.roughness_m = planeResidualSD(idx.map(i => z[i]), idx.map(i => radius * Math.cos(lat0) * (d.lon[i] - lon0) * rad), idx.map(i => radius * d.lat[i] * rad));
  } else if (G && G.dx_m) {
    prof.area_km2 = G.nR * G.dy_m * G.nC * G.dx_m / 1e6;
    const zz = [], xx = [], yy = []; for (let r = 0; r < G.nR; r++) for (let c = 0; c < G.nC; c++) { const v = G.g[r * G.nC + c]; if (Number.isFinite(v)) { zz.push(v); xx.push(c * G.dx_m); yy.push(r * G.dy_m); } }
    prof.roughness_m = planeResidualSD(zz, xx, yy);
  }
  if (prof.slopes) { const n = prof.slopes.length, f = t => 100 * prof.slopes.filter(x => x < t).length / n; prof.slopeStats = (({ sorted, ...r }) => r)(describe(prof.slopes)); prof.slopeThresholds = { below5deg_gentle: f(5), below15deg_landingSafe: f(15), above30deg_nearAngleOfRepose: 100 - f(30) }; }
  return prof;
}
function topoCore(rc, re, sc, se, hc, he, reliefC, reliefE) {
  const span = Math.max(amax(rc), amax(re)) - Math.min(amin(rc), amin(re));
  const comp = [];
  const ov = overlap(rc, re, { minBw: 1, pad: Math.max(50, 0.1 * span) });
  comp.push({ key: 'relief_shape', name: 'Elevation distribution overlap (relative to each median)', percent: 100 * ov });
  comp.push({ key: 'relief_ratio', name: 'Relief ratio (5–95% elevation spread)', percent: 100 * Math.min(reliefC, reliefE) / Math.max(reliefC, reliefE, 1e-9) });
  comp.push({ key: 'hypsometry', name: 'Hypsometric curve match', percent: 100 * (1 - mean(hc.map((v, i) => Math.abs(v - he[i])))) });
  let sov = null;
  if (sc && se && sc.length >= 3 && se.length >= 3) { sov = overlap(sc, se, { minBw: 0.2, pad: 3 }); comp.push({ key: 'slope', name: 'Slope distribution overlap', percent: 100 * sov }); }
  return { comp, likeness: mean(comp.map(x => x.percent)), relOverlap: ov, slopeOverlap: sov };
}
const pick = (a, idx) => idx.map(i => a[i]);
const randIdx = n => Array.from({ length: n }, () => Math.floor(Math.random() * n));

async function analyzeTopography(celestial, earth, opts = {}) {
  const Rc = opts.radius_m ?? RADIUS_M[opts.body] ?? null, Pc = topoProfile(celestial, Rc), Pe = topoProfile(earth, RADIUS_M.earth);
  const core = topoCore(Pc.rel, Pe.rel, Pc.slopes, Pe.slopes, Pc.hypsometry, Pe.hypsometry, Pc.relief_m, Pe.relief_m);
  const nB = opts.bootstrap ?? 120, sc = [];
  for (let b = 0; b < nB; b++) {
    if (b % 20 === 0) { opts.onProgress && opts.onProgress(b / nB); await new Promise(r => setTimeout(r, 0)); }
    const zc = pick(celestial.z, randIdx(celestial.z.length)), ze = pick(earth.z, randIdx(earth.z.length));
    const mc = median(zc), me = median(ze), Ac = describe(zc), Ae = describe(ze);
    const s1 = Pc.slopes ? pick(Pc.slopes, randIdx(Pc.slopes.length)) : null, s2 = Pe.slopes ? pick(Pe.slopes, randIdx(Pe.slopes.length)) : null;
    sc.push(topoCore(zc.map(v => v - mc), ze.map(v => v - me), s1, s2, hypsometry(zc), hypsometry(ze), Ac.p95 - Ac.p5, Ae.p95 - Ae.p5).likeness);
  }
  sc.sort((a, b) => a - b); opts.onProgress && opts.onProgress(1);
  const warnings = [];
  if (Pc.spacing_m && Pe.spacing_m && Math.max(Pc.spacing_m, Pe.spacing_m) / Math.min(Pc.spacing_m, Pe.spacing_m) > 3) warnings.push(`Slopes are measured over different distances (${Math.round(Pc.spacing_m)} m and ${Math.round(Pe.spacing_m)} m). Slope depends on that distance, so the slope comparison is approximate.`);
  if (Pc.area_km2 && Pe.area_km2 && Math.max(Pc.area_km2, Pe.area_km2) / Math.min(Pc.area_km2, Pe.area_km2) > 4) warnings.push(`The two areas differ a lot in size (${Math.round(Pc.area_km2).toLocaleString()} km² and ${Math.round(Pe.area_km2).toLocaleString()} km²). Larger areas usually show more relief.`);
  if (!Pc.slopes || !Pe.slopes) warnings.push('Slopes could not be worked out for both datasets, so the score uses elevation only. Add latitude and longitude on a regular grid, a slope column, or the map pixel size.');
  const ks = ksTest(Float64Array.from(Pc.rel).sort(), Float64Array.from(Pe.rel).sort());
  const strip = P => { const { rel, slopes, stats, ...rest } = P; const { sorted, ...st } = stats; return { ...rest, stats: st, sample: { relative_m: thin(rel, 4000), slopes_deg: slopes ? thin(slopes, 4000) : null } }; };
  return {
    subject: 'topography', likeness: core.likeness, ci95: sc.length > 10 ? [q(sc, .025), q(sc, .975)] : null, bootstrapResamples: sc.length, bootstrapScores: sc,
    verdict: verdictFor(core.likeness, 'topography'), components: core.comp,
    celestial: { ...strip(Pc), meta: celestial.meta }, earth: { ...strip(Pe), meta: earth.meta },
    tests: {
      relativeElevation: { kolmogorovSmirnov: ks, wasserstein_m: wasserstein(Float64Array.from(Pc.rel).sort(), Float64Array.from(Pe.rel).sort()), overlap: core.relOverlap },
      slope: Pc.slopes && Pe.slopes ? { kolmogorovSmirnov: ksTest(Float64Array.from(Pc.slopes).sort(), Float64Array.from(Pe.slopes).sort()), overlap: core.slopeOverlap, medianDifference_deg: median(Pc.slopes) - median(Pe.slopes) } : null,
    },
    warnings,
  };
}
function thin(a, n) { if (a.length <= n) return Array.from(a); const st = a.length / n; return Array.from({ length: n }, (_, i) => a[Math.floor(i * st)]); }

/* ============================== composition: parsing ============================== */
const OXIDE_NAMES = { sio2: 'SiO2', tio2: 'TiO2', al2o3: 'Al2O3', cr2o3: 'Cr2O3', feo: 'FeOT', feot: 'FeOT', 'feo*': 'FeOT', feotot: 'FeOT', feototal: 'FeOT', fe2o3: 'Fe2O3', fe2o3t: 'Fe2O3', 'fe2o3*': 'Fe2O3', fe2o3tot: 'Fe2O3', mno: 'MnO', mgo: 'MgO', cao: 'CaO', na2o: 'Na2O', k2o: 'K2O', p2o5: 'P2O5', so3: 'SO3', cl: 'Cl', nio: 'NiO', zno: 'ZnO', br: 'Br', ni: 'Ni', zn: 'Zn', h2o: 'H2O', co2: 'CO2', loi: 'LOI' };
const MINERAL_RX = /olivine|pyroxene|augite|pigeonite|enstatite|plagioclase|feldspar|anorthite|albite|sanidine|quartz|glass|amorphous|smectite|clay|phyllosilicate|kaolinite|montmorillonite|nontronite|saponite|serpentine|chlorite|zeolite|sulfate|sulphate|gypsum|bassanite|anhydrite|jarosite|carbonate|calcite|dolomite|siderite|magnesite|hematite|magnetite|goethite|ilmenite|akaganeite|opal|cristobalite|tridymite|apatite|halite|perchlorate|mica|biotite|illite/i;
const SKIP_RX = /^(id|sample|name|sol|target|site|label|location|lat|lon|elev|height|depth|distance|date|time|total|sum|type|class|notes?|comment|rock|unit|description)\b/i;
function compUnit(h) {
  const s = h.toLowerCase();
  if (/wt\.?\s?%|weight\s?%|wt_?pct|wt\s?percent|\(wt\)/.test(s)) return 'wt%';
  if (/vol\.?\s?%|volume\s?%|vol_?pct/.test(s)) return 'vol%';
  if (/ppm|µg\/g|ug\/g|mg\/kg/.test(s)) return 'ppm';
  if (/fraction|\bfrac\b|\(0-1\)/.test(s)) return 'fraction';
  if (/%|pct|percent/.test(s)) return '%';
  return null;
}
const baseName = h => h.replace(/\(.*?\)|\[.*?\]/g, '').replace(/wt\.?\s?%|vol\.?\s?%|ppm|percent|pct|fraction|%/gi, '').replace(/[\s_-]+$/g, '').replace(/^[\s_-]+/g, '').trim();
const COMP_UNITS = ['wt%', 'vol%', '%', 'fraction', 'ppm'];

/** Parse a composition table: one row per sample, one column per oxide or mineral, units in the header (wt%, vol%, %, fraction, ppm). */
function parseComposition(text, opts = {}) {
  const uo = opts.units || 'auto';
  const { head, rows } = readHeaderTable(text, 'sample, SiO2 (wt%), FeOT (wt%), MgO (wt%)');
  const cols = [];
  head.forEach((h, i) => {
    if (SKIP_RX.test(h.trim())) return;
    const b = baseName(h), key = b.toLowerCase().replace(/\s+/g, ''), unit = compUnit(h);
    const oxide = OXIDE_NAMES[key], mineral = MINERAL_RX.test(b);
    if (!oxide && !mineral && !unit) return;
    if (!rows.some(r => r[i] !== undefined && r[i] !== '' && !isNaN(parseFloat(r[i])))) return;
    cols.push({ i, header: h, name: oxide || (b.charAt(0).toUpperCase() + b.slice(1).toLowerCase()), unit });
  });
  if (!cols.length) throw new AnalogError('E-NOCOMP', 'No composition columns found in the key.', `The header lists: ${head.join(', ')}. Use oxide names such as "SiO2 (wt%)" or mineral names such as "olivine (vol%)", with units.${subjectHint(head, 'composition')}`);
  const missing = cols.filter(c => !c.unit);
  if (missing.length && uo === 'auto') throw new AnalogError('E-NOUNITS', `These composition columns have no units in their key: ${missing.map(c => c.header).join(', ')}.`, 'Add units to each header, e.g. "SiO2 (wt%)", or pass opts.units = "wt%" | "vol%" | "%" | "fraction" | "ppm".');
  cols.forEach(c => { if (!c.unit) c.unit = uo; });
  const warnings = [], comps = {}, basis = {};
  let fill = 0, imp = 0;
  const conv = (v, u) => u === 'fraction' ? v * 100 : u === 'ppm' ? v / 1e4 : v;
  const hasFeO = cols.some(c => c.name === 'FeOT'), feCols = cols.filter(c => c.name === 'Fe2O3');
  if (feCols.length) warnings.push(hasFeO ? 'Fe2O3 was converted to FeO (× 0.8998) and added to FeO as total iron (FeOT).' : 'Fe2O3 was converted to total iron as FeO (FeOT = 0.8998 × Fe2O3).');
  for (const c of cols) { const nm = c.name === 'Fe2O3' ? 'FeOT' : c.name; if (!comps[nm]) { comps[nm] = rows.map(() => NaN); basis[nm] = c.unit === 'vol%' ? 'vol%' : c.unit === '%' ? '%' : 'wt%'; } }
  rows.forEach((r, k) => {
    for (const c of cols) {
      let v = parseFloat(r[c.i]); if (r[c.i] === undefined || r[c.i] === '' || isNaN(v)) continue;
      if (v <= -900) { fill++; continue; }
      if (v < 0) v = 0;
      v = conv(v, c.unit); if (v > 100) { imp++; continue; }
      const nm = c.name === 'Fe2O3' ? 'FeOT' : c.name; if (c.name === 'Fe2O3') v *= 0.8998;
      comps[nm][k] = Number.isFinite(comps[nm][k]) && (c.name === 'Fe2O3' || c.name === 'FeOT') ? comps[nm][k] + v : v;
    }
  });
  for (const k of Object.keys(comps)) if (!comps[k].some(Number.isFinite)) delete comps[k];
  const n = rows.filter((_, k) => Object.values(comps).some(a => Number.isFinite(a[k]))).length;
  if (!n) throw new AnalogError('E-FEW', 'No usable composition values.', `${fill} fill values and ${imp} values above 100% were removed.`);
  const bases = [...new Set(Object.values(basis))]; if (bases.includes('vol%') && bases.length > 1) warnings.push('The file mixes volume percent with other units. Weight and volume percentages are not directly comparable.');
  return { subject: 'composition', comps, basis, n, meta: { kind: 'table', columns: { components: Object.keys(comps) }, units: bases.join(', '), unitsFrom: uo !== 'auto' && missing.length ? 'given manually' : 'file key', removedFill: fill, removedImpossible: imp, unreadable: 0, warnings } };
}

/* ============================== composition: analysis ============================== */
const nanMean = a => { const f = finite(a); return f.length ? mean(f) : NaN; };
const MW = { SiO2: 60.08, TiO2: 79.87, Al2O3: 101.96, FeOT: 71.84, MnO: 70.94, MgO: 40.30, CaO: 56.08, Na2O: 61.98, K2O: 94.2, P2O5: 141.94 };
function indices(m) {
  const g = k => m[k], has = (...k) => k.every(x => Number.isFinite(g(x)));
  const out = {};
  if (has('MgO', 'FeOT')) out.mgNumber = 100 * (g('MgO') / MW.MgO) / (g('MgO') / MW.MgO + g('FeOT') / MW.FeOT);
  if (has('Al2O3', 'CaO', 'Na2O', 'K2O')) { const a = g('Al2O3') / MW.Al2O3; out.CIA = 100 * a / (a + g('CaO') / MW.CaO + g('Na2O') / MW.Na2O + g('K2O') / MW.K2O); }
  if (has('SiO2', 'Na2O', 'K2O')) {
    const vol = ['SO3', 'Cl', 'H2O', 'CO2', 'LOI', 'Br'], tot = Object.entries(m).filter(([k, v]) => Number.isFinite(v) && !vol.includes(k) && MW[k]).reduce((s, [, v]) => s + v, 0) || 100;
    const si = 100 * g('SiO2') / tot, alk = 100 * (g('Na2O') + g('K2O')) / tot;
    const series = alk > 0.37 * si - 14.43 ? 'alkaline' : 'subalkaline';
    const cls = si < 45 ? (alk < 3 ? 'picrobasalt' : 'basanite or foidite') : si < 52 ? (alk < 5 ? 'basalt' : 'trachybasalt') : si < 57 ? (alk < 5.9 ? 'basaltic andesite' : 'basaltic trachyandesite') : si < 63 ? (alk < 7 ? 'andesite' : 'trachyandesite') : si < 69 ? (alk < 8 ? 'dacite' : 'trachydacite') : 'rhyolite';
    out.TAS = { SiO2: si, alkalis: alk, rockType: cls, series };
  }
  return out;
}
function clr(v) { const l = v.map(x => Math.log(Math.max(x, 0.01))); const m = mean(l); return l.map(x => x - m); }
function compCore(c, e, shared, nSampled) {
  const mc = shared.map(k => nanMean(c[k])), me = shared.map(k => nanMean(e[k]));
  const sc = mc.reduce((s, x) => s + x, 0), se = me.reduce((s, x) => s + x, 0);
  const nc = mc.map(x => 100 * x / sc), ne = me.map(x => 100 * x / se);
  const bc = 1 - nc.reduce((s, x, i) => s + Math.abs(x - ne[i]), 0) / 200;
  const ca = clr(nc), ce = clr(ne), dA = Math.sqrt(ca.reduce((s, x, i) => s + (x - ce[i]) ** 2, 0));
  const comp = [{ key: 'braycurtis', name: 'Bray–Curtis similarity of mean composition', percent: 100 * bc }, { key: 'aitchison', name: `Aitchison similarity (distance ${dA.toFixed(2)})`, percent: 100 * Math.exp(-dA / 2) }];
  let ovs = null;
  if (nSampled) {
    const per = shared.map(k => { const a = finite(c[k]), b = finite(e[k]); if (a.length < 3 || b.length < 3) return null; const span = Math.max(amax(a), amax(b)) - Math.min(amin(a), amin(b)); return overlap(a, b, { minBw: 0.05, pad: Math.max(1, 0.2 * span) }); }).filter(x => x != null);
    if (per.length) { ovs = mean(per); comp.push({ key: 'spread', name: `Sample-to-sample overlap (mean of ${per.length} components)`, percent: 100 * ovs }); }
  }
  return { comp, likeness: mean(comp.map(x => x.percent)), mc, me, nc, ne, braycurtis: bc, aitchison: dA, clrC: ca, clrE: ce, spreadOverlap: ovs };
}
async function analyzeComposition(celestial, earth, opts = {}) {
  const C = celestial.comps, E = earth.comps;
  const shared = Object.keys(C).filter(k => E[k] && k !== 'LOI');
  if (shared.length < 2) throw new AnalogError('E-NOSHARED', 'The two datasets share fewer than two components.', `${opts.celestialLabel || 'Celestial'} has ${Object.keys(C).join(', ')}. ${opts.earthLabel || 'Earth'} has ${Object.keys(E).join(', ')}. Use the same oxides or minerals in both files.`);
  const both3 = celestial.n >= 3 && earth.n >= 3;
  const core = compCore(C, E, shared, both3);
  const nB = both3 ? (opts.bootstrap ?? 120) : 0, sc = [];
  for (let b = 0; b < nB; b++) {
    if (b % 20 === 0) { opts.onProgress && opts.onProgress(b / nB); await new Promise(r => setTimeout(r, 0)); }
    const ic = randIdx(celestial.n), ie = randIdx(earth.n), rc = {}, re = {};
    shared.forEach(k => { rc[k] = pick(C[k], ic); re[k] = pick(E[k], ie); });
    sc.push(compCore(rc, re, shared, true).likeness);
  }
  sc.sort((a, b) => a - b); opts.onProgress && opts.onProgress(1);
  const warnings = [];
  const covC = shared.reduce((s, k) => s + nanMean(C[k]), 0) / Object.keys(C).reduce((s, k) => s + (nanMean(C[k]) || 0), 0);
  const covE = shared.reduce((s, k) => s + nanMean(E[k]), 0) / Object.keys(E).reduce((s, k) => s + (nanMean(E[k]) || 0), 0);
  if (Math.min(covC, covE) < 0.8) warnings.push(`The shared components cover only ${Math.round(100 * covC)}% and ${Math.round(100 * covE)}% of each dataset, so part of each composition is left out of the comparison.`);
  const onlyC = Object.keys(C).filter(k => !E[k]), onlyE = Object.keys(E).filter(k => !C[k]);
  if (onlyC.length || onlyE.length) warnings.push(`Left out because only one dataset has them: ${[...onlyC, ...onlyE].join(', ')}.`);
  const basisMismatch = shared.filter(k => celestial.basis[k] !== earth.basis[k] && celestial.basis[k] !== '%' && earth.basis[k] !== '%');
  if (basisMismatch.length) warnings.push(`${basisMismatch.join(', ')} ${basisMismatch.length > 1 ? 'are' : 'is'} given as weight percent in one file and volume percent in the other.`);
  if (!both3) warnings.push('At least one dataset has fewer than 3 samples, so the score uses mean compositions only and has no uncertainty range.');
  const meanAll = X => Object.fromEntries(Object.keys(X).map(k => [k, nanMean(X[k])]));
  const sdOf = a => { const f = finite(a); return f.length > 1 ? sd(f) : 0; };
  const components = shared.map((k, i) => ({ component: k, celestialMean: core.mc[i], celestialSD: sdOf(C[k]), celestialN: finite(C[k]).length, earthMean: core.me[i], earthSD: sdOf(E[k]), earthN: finite(E[k]).length, celestialNormalized: core.nc[i], earthNormalized: core.ne[i], difference: core.nc[i] - core.ne[i], clrDifference: core.clrC[i] - core.clrE[i], basis: celestial.basis[k] }));
  const dot = core.nc.reduce((s, x, i) => s + x * core.ne[i], 0), cos = dot / Math.sqrt(core.nc.reduce((s, x) => s + x * x, 0) * core.ne.reduce((s, x) => s + x * x, 0));
  return {
    subject: 'composition', likeness: core.likeness, ci95: sc.length > 10 ? [q(sc, .025), q(sc, .975)] : null, bootstrapResamples: sc.length, bootstrapScores: sc,
    verdict: verdictFor(core.likeness, 'composition'), components: core.comp, sharedComponents: shared, table: components,
    celestial: { n: celestial.n, indices: indices(meanAll(C)), meta: celestial.meta }, earth: { n: earth.n, indices: indices(meanAll(E)), meta: earth.meta },
    tests: { brayCurtisSimilarity: core.braycurtis, aitchisonDistance: core.aitchison, cosineSimilarity: cos, sampleOverlap: core.spreadOverlap },
    warnings,
  };
}

/* ============================== assessments for the newer subjects ============================== */
const km = m => Math.abs(m) >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m';
function ruleTopography(r, ctx) {
  const b = BODIES[ctx.body] || BODIES.other, cN = ctx.celestialSite || 'the target site', eN = ctx.earthSite || 'the Earth site', E = cap(eN), s = r.likeness;
  const C = r.celestial, Ea = r.earth, S = [], ex = [];
  S.push(s >= 60 ? `${E} is a close topographic match for ${cN}.` : s >= 35 ? `${E} resembles the terrain at ${cN} in some ways but not in others.` : s >= 15 ? `${E} shares only a few terrain features with ${cN}.` : `${E} is not a good topographic match for ${cN}.`);
  const rr = Math.min(C.relief_m, Ea.relief_m) / Math.max(C.relief_m, Ea.relief_m);
  S.push(`Relief, measured as the spread between the 5th and 95th percentile elevations, is ${km(C.relief_m)} at ${cN} and ${km(Ea.relief_m)} at ${eN}.` + (rr < 0.5 ? ` That is a ${(1 / rr).toFixed(1)}-fold difference in scale.` : ''));
  const hc = C.hypsometricIntegral, he = Ea.hypsometricIntegral;
  S.push(`The hypsometric integral is ${hc.toFixed(2)} for ${cN} and ${he.toFixed(2)} for ${eN}, ` + (Math.abs(hc - he) < 0.1 ? 'so the two landscapes spread their height in a similar way.' : hc > he ? `so more of ${cN} sits high within its elevation range.` : `so more of ${cN} sits low within its elevation range.`));
  const st = r.tests.slope;
  if (st) S.push(`Median slopes are ${C.slopeStats.median.toFixed(1)}° and ${Ea.slopeStats.median.toFixed(1)}°, and the slope distributions overlap by ${pc(100 * st.overlap)}.`);
  else S.push('Slopes could not be compared because at least one dataset lacks the positions needed to work them out.');
  if (st && (st.overlap >= .3 || Math.abs(st.medianDifference_deg) < 5)) ex.push({ title: 'Rover mobility and route testing', objective: `Slopes at ${eN} resemble those at ${cN} (medians ${C.slopeStats.median.toFixed(1)}° and ${Ea.slopeStats.median.toFixed(1)}°), so the site suits tests of how a rover climbs, turns and plans routes on similar ground.`, method: 'Drive a rover prototype along planned routes across the steepest and flattest ground, and compare the route planner with the paths it actually completes.', measure: 'Wheel slip, energy per metre, success rate on slopes above 15°, and route-planning errors.' });
  if (C.slopeThresholds && Ea.slopeThresholds) ex.push({ title: 'Landing hazard detection', objective: `${pc(Ea.slopeThresholds.below15deg_landingSafe)} of ${eN} and ${pc(C.slopeThresholds.below15deg_landingSafe)} of ${cN} is flatter than 15°, a common limit for landers, so the site offers a realistic mix of safe and unsafe ground.`, method: 'Fly a lidar or camera hazard-detection system over the site from a drone or helicopter, and compare its safe-zone maps with a ground survey.', measure: 'False safe and false hazard rates, and the smallest slope and rock size the system detects.' });
  if (rr >= 0.5 || Math.abs(hc - he) < 0.1) ex.push({ title: 'Landform comparison', objective: `The two landscapes have ${rr >= 0.5 ? 'similar relief' : 'similar height distributions'}, so the processes that shaped ${eN} may help explain features at ${cN}.`, method: 'Map landforms on site with high-resolution elevation models, then compare their shapes and sizes with orbital data of the target.', measure: 'Slope profiles, channel or scarp geometry, and crater or cone dimensions.' });
  ex.push({ title: 'Elevation model validation', objective: `Even where the terrain differs, ${eN} can show how well orbital or drone elevation models capture real relief.`, method: 'Build an elevation model from stereo images or lidar, and check it against GPS ground-control points.', measure: 'Vertical and horizontal error, and how both change with slope.' });
  return { source: 'rule-based', verdict: verdictFor(s, 'topography'), should: s >= 35 ? 'Yes' : s >= 15 ? 'Yes, for specific tests' : 'No', headline: `${E} is a ${verdictFor(s, 'topography').toLowerCase()} for ${cN} on ${b.name}, with ${pc(s)} topographic likeness.`, summary: S.join(' '), experiments: ex.slice(0, 4), caveats: ['This looks at the shape of the land only. Gravity, surface material and lighting also affect how terrain behaves for rovers and landers.', ...r.warnings.slice(0, 2)] };
}
function ruleComposition(r, ctx) {
  const b = BODIES[ctx.body] || BODIES.other, cN = ctx.celestialSite || 'the target site', eN = ctx.earthSite || 'the Earth site', E = cap(eN), s = r.likeness, S = [], ex = [];
  S.push(s >= 60 ? `${E} is chemically close to ${cN}.` : s >= 35 ? `${E} shares much of its chemistry with ${cN}, with some clear differences.` : s >= 15 ? `${E} is only loosely similar in composition to ${cN}.` : `${E} is chemically very different from ${cN}.`);
  S.push(`The comparison uses the ${r.sharedComponents.length} components measured in both datasets.`);
  const top = [...r.table].sort((x, y) => Math.abs(y.difference) - Math.abs(x.difference)).slice(0, 3).filter(x => Math.abs(x.difference) >= 0.5);
  if (top.length) S.push(`The biggest differences are ${top.map(x => `${x.component} at ${x.celestialNormalized.toFixed(1)}% against ${x.earthNormalized.toFixed(1)}%`).join(', ').replace(/, ([^,]*)$/, ' and $1')}.`);
  const ic = r.celestial.indices, ie = r.earth.indices;
  if (ic.TAS && ie.TAS) S.push(ic.TAS.rockType === ie.TAS.rockType ? `Both plot as ${ic.TAS.rockType} on a total alkali versus silica diagram.` : `${cap(cN)} plots as ${ic.TAS.rockType} and ${eN} as ${ie.TAS.rockType} on a total alkali versus silica diagram.`);
  if (ic.CIA != null && ie.CIA != null) S.push(`The chemical index of alteration is ${ic.CIA.toFixed(0)} for ${cN} and ${ie.CIA.toFixed(0)} for ${eN}, ` + (ic.CIA < 55 && ie.CIA < 55 ? 'so neither shows much chemical weathering.' : ic.CIA >= 55 && ie.CIA >= 55 ? 'so both show signs of chemical weathering.' : 'so only one of them shows clear signs of chemical weathering.'));
  const sim = Math.exp(-r.tests.aitchisonDistance / 2);
  const sameType = ic.TAS && ie.TAS && ic.TAS.rockType === ie.TAS.rockType;
  if (sim >= 0.55 || sameType) ex.push({ title: 'Rover instrument calibration', objective: sim >= 0.55 ? `${E}'s chemistry is close enough to ${cN} (Aitchison distance ${r.tests.aitchisonDistance.toFixed(2)}) to serve as a calibration target for rover instruments.` : `Both plot as ${ic.TAS.rockType}, so ${eN} can serve as a calibration target, as long as the analysis allows for the difference in ${top.length ? top[0].component : 'the main oxides'}.`, method: 'Measure the same rocks with field or lab versions of APXS, LIBS or XRF instruments, and compare the results with laboratory chemistry.', measure: 'Accuracy and precision for each oxide, especially those that differ most between the sites.' });
  const so3 = k => r.table.find(x => x.component === 'SO3')?.[k];
  if ((ic.CIA >= 55 && ie.CIA >= 55) || (so3('celestialMean') > 1 && so3('earthMean') > 1)) ex.push({ title: 'Water alteration study', objective: `Both sites carry signs of alteration by water${ic.CIA != null && ie.CIA != null ? ` (CIA ${ic.CIA.toFixed(0)} and ${ie.CIA.toFixed(0)})` : ''}, so ${eN} can show how those minerals form and what they preserve.`, method: 'Sample fresh and altered rock across the site, and identify the minerals with X-ray diffraction and spectroscopy.', measure: 'Alteration minerals present, how alteration changes with depth or distance, and whether organic matter survives.' });
  if (sim >= 0.4) ex.push({ title: 'Regolith simulant development', objective: `Material from ${eN} could form the base of a simulant for ${cN}${top.length ? `, adjusted for the largest difference in ${top[0].component}` : ''}.`, method: 'Collect bulk material, crush and sieve it to the target grain size, and adjust its chemistry with additives where needed.', measure: 'Final chemistry against the target, grain size distribution, and behaviour in digging or oxygen-extraction tests.' });
  if (!ex.length) ex.push({ title: 'Geochemical reference survey', objective: `The chemistry differs too much for a direct analog, but a well-characterised survey of ${eN} still gives a reference point for testing instruments.`, method: 'Collect samples on a grid and analyse them by XRF and XRD.', measure: 'How much each oxide and mineral varies across the site.' });
  return { source: 'rule-based', verdict: verdictFor(s, 'composition'), should: s >= 35 ? 'Yes' : s >= 15 ? 'Yes, for specific tests' : 'No', headline: `${E} is a ${verdictFor(s, 'composition').toLowerCase()} for ${cN} on ${b.name}, with ${pc(s)} compositional likeness.`, summary: S.join(' '), experiments: ex.slice(0, 4), caveats: ['This compares bulk chemistry only. Mineralogy, grain size and weathering state also matter for an analog site.', ...r.warnings.slice(0, 2)] };
}
function payloadTopography(r, ctx) {
  const b = BODIES[ctx.body] || BODIES.other, k = x => x == null ? null : +(+x).toFixed(2);
  const P = p => ({ elevation_m: { n: p.stats.n, mean: k(p.stats.mean), min: k(p.stats.min), p5: k(p.stats.p5), median: k(p.stats.median), p95: k(p.stats.p95), max: k(p.stats.max) }, relief_p5_p95_m: k(p.relief_m), range_m: k(p.range_m), hypsometric_integral: k(p.hypsometricIntegral), slope_deg: p.slopeStats ? { median: k(p.slopeStats.median), mean: k(p.slopeStats.mean), p95: k(p.slopeStats.p95) } : null, slope_thresholds_percent: p.slopeThresholds || null, spacing_m: k(p.spacing_m), area_km2: k(p.area_km2), roughness_m: k(p.roughness_m) });
  return { subject: 'topography', celestial: { body: b.name, site: ctx.celestialSite || null, ...P(r.celestial) }, earth: { site: ctx.earthSite || null, ...P(r.earth) }, likeness_percent: k(r.likeness), ci95: r.ci95 && r.ci95.map(k), components: r.components.map(x => ({ name: x.name, percent: k(x.percent) })), tests: { relative_elevation_KS_D: k(r.tests.relativeElevation.kolmogorovSmirnov.D), relative_elevation_wasserstein_m: k(r.tests.relativeElevation.wasserstein_m), slope_KS_D: r.tests.slope ? k(r.tests.slope.kolmogorovSmirnov.D) : null }, warnings: r.warnings };
}
function payloadComposition(r, ctx) {
  const b = BODIES[ctx.body] || BODIES.other, k = x => x == null ? null : +(+x).toFixed(2);
  return { subject: 'surface composition', celestial: { body: b.name, site: ctx.celestialSite || null, samples: r.celestial.n, indices: r.celestial.indices }, earth: { site: ctx.earthSite || null, samples: r.earth.n, indices: r.earth.indices }, likeness_percent: k(r.likeness), ci95: r.ci95 && r.ci95.map(k), score_components: r.components.map(x => ({ name: x.name, percent: k(x.percent) })), per_component: r.table.map(x => ({ component: x.component, basis: x.basis, celestial_mean: k(x.celestialMean), earth_mean: k(x.earthMean), celestial_normalized: k(x.celestialNormalized), earth_normalized: k(x.earthNormalized) })), tests: { bray_curtis: k(r.tests.brayCurtisSimilarity), aitchison_distance: k(r.tests.aitchisonDistance), cosine: k(r.tests.cosineSimilarity) }, warnings: r.warnings };
}
function mdTopography(r, a, ctx) {
  const b = BODIES[ctx.body] || BODIES.other, C = r.celestial, E = r.earth, cN = ctx.celestialSite || 'Celestial site', eN = ctx.earthSite || 'Earth site', f = x => x == null ? 'n/a' : x;
  return `# Topography analog report: ${eN} vs ${cN} (${b.name})

Likeness: ${pc(r.likeness)}${r.ci95 ? ` (95% CI ${pc(r.ci95[0])} to ${pc(r.ci95[1])})` : ''}. ${r.verdict}.

## Components
${r.components.map(x => `- ${x.name}: ${pc(x.percent)}`).join('\n')}

## Terrain
| | ${cN} | ${eN} |
|---|---|---|
| Points | ${C.stats.n} | ${E.stats.n} |
| Elevation range | ${km(C.stats.min)} to ${km(C.stats.max)} | ${km(E.stats.min)} to ${km(E.stats.max)} |
| Relief (5–95%) | ${km(C.relief_m)} | ${km(E.relief_m)} |
| Hypsometric integral | ${C.hypsometricIntegral.toFixed(2)} | ${E.hypsometricIntegral.toFixed(2)} |
| Median slope | ${C.slopeStats ? C.slopeStats.median.toFixed(1) + '°' : 'n/a'} | ${E.slopeStats ? E.slopeStats.median.toFixed(1) + '°' : 'n/a'} |
| Flatter than 15° | ${C.slopeThresholds ? pc(C.slopeThresholds.below15deg_landingSafe) : 'n/a'} | ${E.slopeThresholds ? pc(E.slopeThresholds.below15deg_landingSafe) : 'n/a'} |
| Grid spacing | ${f(C.spacing_m && Math.round(C.spacing_m) + ' m')} | ${f(E.spacing_m && Math.round(E.spacing_m) + ' m')} |
| Area | ${f(C.area_km2 && Math.round(C.area_km2).toLocaleString() + ' km²')} | ${f(E.area_km2 && Math.round(E.area_km2).toLocaleString() + ' km²')} |
${mdAssessment(a)}`;
}
function mdComposition(r, a, ctx) {
  const b = BODIES[ctx.body] || BODIES.other, cN = ctx.celestialSite || 'Celestial site', eN = ctx.earthSite || 'Earth site', ic = r.celestial.indices, ie = r.earth.indices;
  return `# Composition analog report: ${eN} vs ${cN} (${b.name})

Likeness: ${pc(r.likeness)}${r.ci95 ? ` (95% CI ${pc(r.ci95[0])} to ${pc(r.ci95[1])})` : ''}. ${r.verdict}.

## Components of the score
${r.components.map(x => `- ${x.name}: ${pc(x.percent)}`).join('\n')}

## Mean composition (renormalised to the shared components)
| Component | ${cN} | ${eN} | Difference |
|---|---|---|---|
${r.table.map(x => `| ${x.component} | ${x.celestialNormalized.toFixed(2)} | ${x.earthNormalized.toFixed(2)} | ${(x.difference >= 0 ? '+' : '') + x.difference.toFixed(2)} |`).join('\n')}

Mg#: ${ic.mgNumber != null ? ic.mgNumber.toFixed(0) : 'n/a'} vs ${ie.mgNumber != null ? ie.mgNumber.toFixed(0) : 'n/a'}. CIA: ${ic.CIA != null ? ic.CIA.toFixed(0) : 'n/a'} vs ${ie.CIA != null ? ie.CIA.toFixed(0) : 'n/a'}. TAS: ${ic.TAS ? ic.TAS.rockType : 'n/a'} vs ${ie.TAS ? ie.TAS.rockType : 'n/a'}.
${mdAssessment(a)}`;
}
function mdAssessment(a) {
  return `
## Assessment (${a.source})
Experiment here? ${a.should}

${a.headline}

${a.summary}

## Experiments
${(a.experiments || []).map(x => `### ${x.title}\n- Goal: ${x.objective}\n- Method: ${x.method}\n- Measure: ${x.measure}`).join('\n\n')}

## Caveats
${(a.caveats || []).map(x => '- ' + x).join('\n')}
`;
}

/* ============================== dispatchers (one subject at a time) ============================== */
/**
 * Compare a celestial dataset with an Earth dataset for ONE subject.
 * opts.subject: 'temperature' | 'topography' | 'composition' (defaults to the datasets' subject)
 * opts.body: 'mars' | 'moon' | ... (topography uses it for the planetary radius when working out slopes)
 * opts.elevation (temperature only): { from_m, to_m, lapseRate_K_per_km }
 * opts.bootstrap, opts.onProgress: as before.
 */
async function analyze(celestial, earth, opts = {}) {
  const s = opts.subject || celestial.subject || 'temperature';
  if (celestial.subject && earth.subject && celestial.subject !== earth.subject) throw new AnalogError('E-SUBJECT', `The datasets were read for different subjects (${celestial.subject} and ${earth.subject}).`, 'Read both files with the same subject.');
  if ((celestial.subject || s) !== s) throw new AnalogError('E-SUBJECT', `The datasets hold ${celestial.subject} data, not ${s}.`, 'Read the files again with the subject you want to analyse.');
  return s === 'topography' ? analyzeTopography(celestial, earth, opts) : s === 'composition' ? analyzeComposition(celestial, earth, opts) : analyzeTemperature(celestial, earth, opts);
}
/** Offline, rule-based verdict + experiments for whichever subject the result is about. */
function ruleBasedAssessment(r, ctx = {}) { return r.subject === 'topography' ? ruleTopography(r, ctx) : r.subject === 'composition' ? ruleComposition(r, ctx) : ruleTemperature(r, ctx); }
/** The compact, numbers-only payload sent to Claude. */
function assessmentPayload(r, ctx = {}) { return r.subject === 'topography' ? payloadTopography(r, ctx) : r.subject === 'composition' ? payloadComposition(r, ctx) : payloadTemperature(r, ctx); }
/** Plain-text Markdown report of a result + assessment. */
function toMarkdown(r, a, ctx = {}) { return r.subject === 'topography' ? mdTopography(r, a, ctx) : r.subject === 'composition' ? mdComposition(r, a, ctx) : mdTemperature(r, a, ctx); }

/* ============================== combining several subjects ============================== */
/**
 * Combine the likeness of several subjects into one overall score, weighted by importance.
 * results: array of analyze() results (different subjects). weights: { temperature: 50, topography: 80, ... } (any scale, 0 drops a subject).
 * Returns { likeness, ci95, verdict, parts: [{ subject, likeness, ci95, weight, share }] }.
 * The 95% interval combines each subject's bootstrap scores, drawn independently.
 */
function combineLikeness(results, weights = {}) {
  const parts = results.filter(r => r && r.likeness != null).map(r => ({ subject: r.subject, likeness: r.likeness, ci95: r.ci95, weight: Math.max(0, +(weights[r.subject] ?? 1) || 0), scores: r.bootstrapScores || [] }));
  const W = parts.reduce((s, p) => s + p.weight, 0);
  if (!parts.length || W <= 0) return { likeness: null, ci95: null, verdict: null, parts: parts.map(({ scores, ...p }) => ({ ...p, share: 0 })) };
  parts.forEach(p => { p.share = p.weight / W; });
  const likeness = parts.reduce((s, p) => s + p.share * p.likeness, 0);
  let ci95 = null;
  if (parts.every(p => p.share === 0 || p.scores.length > 10)) {
    const draws = Array.from({ length: 2000 }, () => parts.reduce((s, p) => s + p.share * (p.scores.length ? p.scores[Math.floor(Math.random() * p.scores.length)] : p.likeness), 0)).sort((a, b) => a - b);
    ci95 = [q(draws, .025), q(draws, .975)];
  }
  const v = likeness >= 60 ? 'Strong overall analog' : likeness >= 35 ? 'Good partial analog' : likeness >= 15 ? 'Limited analog' : 'Poor overall analog';
  return { likeness, ci95, verdict: v, parts: parts.map(({ scores, ...p }) => p) };
}

return { AnalogError, BODIES, toK, kToC, parseTemperature, parseTable, parseJSON, parseText, COLORMAPS, stopsFromColormap, decodeMapPixels, describe, kde, overlap, COMPONENT_WEIGHT, verdictFor, analyzeTemperature, tidyText, WRITING_STYLE, AUDIENCE, assessmentPrompt, callClaude, assess, readLegendWithClaude, SUBJECTS, RADIUS_M, guessSubject, parseTopography, analyzeTopography, parseComposition, analyzeComposition, analyze, ruleBasedAssessment, assessmentPayload, toMarkdown, combineLikeness };
})();
