/* Frontier Labs: page logic (subjects, sliders, uploads, results, languages). Edit freely. */
(function () {
'use strict';
/* ================= settings you can edit ================= */
const CONFIG = {
  // Optional: the URL of your own server endpoint that forwards prompts to Claude (see server.py).
  // It receives POST JSON { prompt, image?: { base64, mediaType } } and must reply with JSON { text }.
  // Leave it as null to use the built-in assessment. Map legends then need a manual key.
  claudeEndpoint: null,
  bootstrap: 120,                 // bootstrap resamples per subject (lower is faster)
  defaultWeights: { temperature: 50, topography: 50, composition: 50 },
};
const ENG = window.AnalogEngine;
const EX = window.ANALOG_EXAMPLES || null;
const I18N = window.LAB_I18N, LANGS = window.LAB_LANGS;
const SUBJECTS = ['temperature', 'topography', 'composition'];
const $ = id => document.getElementById(id);

/* ================= language ================= */
let LANG = 'en';
try { const saved = localStorage.getItem('lab-lang'); if (saved && I18N[saved]) LANG = saved; else { const nav = (navigator.language || 'en').slice(0, 2); if (I18N[nav]) LANG = nav; } } catch (e) { }
/* Audience modes (js/audience.js) can reword English interface text. Other languages keep their translation. */
const audText = k => LANG === 'en' && window.LAB_AUDIENCE_TEXT ? window.LAB_AUDIENCE_TEXT[k] : undefined;
const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } } };
let LEVEL = 'students';   // the wording level (kids, teens, students, scientists). The audience bar chooses it, see AUDIENCE_LEVEL below.
const vT = l => t((LEVEL === 'kids' ? 'kv_' : 'v_') + l);   // verdict words, simpler for kids
let AI_NAME = 'Claude';   // only used by the optional server.py connection
const t = (k, v = {}) => String(audText(k) ?? (I18N[LANG] && (I18N[LANG][k + '@' + LEVEL] ?? I18N[LANG][k])) ?? I18N.en[k + '@' + LEVEL] ?? I18N.en[k] ?? k)   // a level can have its own wording (key@kids, key@scientists, ...)
 .replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '').replace(/\bClaude\b/g, AI_NAME);
const FONTS = { bn: 'Noto+Sans+Bengali:wght@400;600;700', zh: 'Noto+Sans+SC:wght@400;600;700', ja: 'Noto+Sans+JP:wght@400;600;700', hi: 'Noto+Sans+Devanagari:wght@400;600;700', ar: 'Noto+Sans+Arabic:wght@400;600;700' };
const RTL = ['ar'];
function applyLang() {
  document.documentElement.lang = LANG;
  document.documentElement.dir = RTL.includes(LANG) ? 'rtl' : 'ltr';
  if (FONTS[LANG] && !document.getElementById('font-' + LANG)) { const l = document.createElement('link'); l.id = 'font-' + LANG; l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=' + FONTS[LANG] + '&display=swap'; document.head.appendChild(l); }
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); el.title = t(el.dataset.i18nAria); });
  document.querySelectorAll('select.unitsel').forEach(sel => { const o = sel.querySelector('option[value=auto]'); if (o) o.textContent = t('unitsAuto'); });
  document.querySelectorAll('select.keysel').forEach(sel => { const o = sel.querySelector('option[value=ai]'); if (o) o.textContent = t('mapAI'); });
  updateShares();
  if (analysisData()) { renderOverall(); if (S.active && S.results[S.active]) showDetails(S.active, true); }
  window.labPlanetNames = { mercury: t('b_mercury'), venus: t('p_venus'), earth: t('p_earth'), mars: t('b_mars'), jupiter: t('p_jupiter'), saturn: t('p_saturn'), uranus: t('p_uranus'), neptune: t('p_neptune') };
  if (window.labRedrawOrrery) window.labRedrawOrrery();
  if (window.labRenderLibrary) window.labRenderLibrary();
}
function setLang(l) { LANG = l; try { localStorage.setItem('lab-lang', l); } catch (e) { } document.querySelectorAll('.langsel').forEach(s => { s.value = l; }); applyLang(); }

/* ================= state ================= */
/* Zero state: every result field starts empty. S.submitted turns true only after the visitor presses Analyze (or a Load example button)
   and the engine returns real numbers. analysisData() is the one guard every results view goes through. */
const S = { on: { temperature: true, topography: true, composition: true }, w: { ...CONFIG.defaultWeights }, files: {}, data: {}, results: {}, combined: null, active: null, ai: {}, key: 0, c: null, e: null, res: null, ctx: null, submitted: false };
const analysisData = () => S.submitted && S.combined && S.combined.likeness != null ? S.combined : null;
SUBJECTS.forEach(s => { S.files[s] = { c: null, e: null }; });
let sample = null, downloads = null;   // only set when the page runs inside claude.ai

/* Claude access: inside claude.ai the page uses Claude directly; elsewhere it uses CONFIG.claudeEndpoint if you set one. */
const claudeAvailable = () => !!(sample || CONFIG.claudeEndpoint);
const blobToBase64 = blob => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = no; r.readAsDataURL(blob); });
async function askClaude(prompt, { image = null, tier = 'default' } = {}) {
  if (sample) return (await sample(prompt, { modelTier: tier, cache: true, ...(image ? { images: [image] } : {}) })).text;
  if (CONFIG.claudeEndpoint) {
    const body = { prompt };
    if (image) body.image = { base64: await blobToBase64(image), mediaType: image.type || 'image/png' };
    const res = await fetch(CONFIG.claudeEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('Claude endpoint returned ' + res.status);
    return (await res.json()).text;
  }
  throw new Error('Claude is not available');
}

/* ================= small helpers ================= */
const showMsg = (el, kind, title, body, fix) => { el.insertAdjacentHTML('beforeend', `<div class="msg ${kind}"><b>${title}</b>${body ? `<div>${body}</div>` : ''}${fix ? `<div class="fix">${fix}</div>` : ''}</div>`); };
const esc = x => String(x ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = x => x == null || !isFinite(x) ? '–' : Math.round(x) + '%';
const f1 = x => x == null || !isFinite(x) ? '–' : (+x).toFixed(1), f2 = x => x == null || !isFinite(x) ? '–' : (+x).toFixed(2);
const fmtp = p => p < 1e-4 ? '< 0.0001' : '= ' + p.toFixed(4);
const duT = () => $('uT').value, duZ = () => $('uZ').value;
const dispT = k => duT() === 'K' ? k : k - 273.15, tU = () => duT() === 'K' ? 'K' : '°C';
const T = k => f1(dispT(k)) + ' ' + tU(), dT = k => f1(k) + ' ' + (duT() === 'K' ? 'K' : '°C');
const dispZ = m => duZ() === 'km' ? m / 1000 : m, zU = () => duZ() === 'km' ? 'km' : 'm';
const Z = m => (duZ() === 'km' ? (m / 1000).toFixed(2) : Math.round(m).toLocaleString()) + ' ' + zU();
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function countUp(el, target) {
  if (target == null || !isFinite(target)) { el.textContent = '–'; return; }
  if (reduceMotion()) { el.textContent = pct(target); return; }
  const t0 = performance.now(), dur = 1100, ease = x => 1 - Math.pow(1 - x, 3);
  (function step(now) { const k = Math.max(0, Math.min(1, (now - t0) / dur)); el.textContent = Math.round(target * ease(k)) + '%'; if (k < 1) requestAnimationFrame(step); })(t0);
}
const growBars = root => requestAnimationFrame(() => requestAnimationFrame(() => root.querySelectorAll('i[data-w]').forEach(i => { i.style.width = i.dataset.w; })));
const levelOf = p => p >= 60 ? 'strong' : p >= 35 ? 'good' : p >= 15 ? 'limited' : 'poor';
const levelColor = p => p >= 35 ? 'var(--good)' : p >= 15 ? 'var(--warn)' : 'var(--bad)';
const uiFix = f => esc(f || '').replace(/,? or pass (opts\.)?units ?= ?[^.]*\./, '.');
const mkFile = (name, text) => ({ name, text: async () => text });
function setStatus(txt, spin) { $('status').innerHTML = (spin ? '<span class="spin"></span> ' : '') + esc(txt); }
const bodyName = () => t('b_' + $('cbody').value);
function ctxFor(s) {
  const cO = $('cname2-' + s).value.trim(), eO = $('ename2-' + s).value.trim();
  return { body: $('cbody').value, celestialSite: cO || $('cname').value.trim() || 'the target site', earthSite: eO || $('ename').value.trim() || 'the Earth site', language: (LANGS.find(l => l[0] === LANG) || [])[2] };
}

/* ================= subject cards and sliders ================= */
const UNIT_OPTS = { temperature: [['K', 'K'], ['C', '°C'], ['F', '°F']], topography: [['m', 'm'], ['km', 'km'], ['ft', 'ft']], composition: [['wt%', 'wt%'], ['vol%', 'vol%'], ['%', '%'], ['fraction', 'fraction (0–1)'], ['ppm', 'ppm']] };
const KEY_OPTS = '<option value="ai">Read the legend with Claude</option><option value="gray">Grayscale</option><option value="viridis">Viridis</option><option value="inferno">Inferno</option><option value="jet">Jet / rainbow</option>';
function buildTopics() {
  $('topics').innerHTML = SUBJECTS.map(s => `<div class="topic${S.on[s] ? ' on' : ''}" id="tp-${s}">
    <label class="toggle"><input type="checkbox" id="on-${s}"${S.on[s] ? ' checked' : ''}><span class="knob" aria-hidden="true"></span><b data-i18n="s_${s}"></b></label>
    <p class="small mute" data-i18n="d_${s}"></p>
    <div class="slider"><label for="w-${s}"><span data-i18n="importance"></span> <output id="wo-${s}">${S.w[s]}</output></label>
    <input type="range" id="w-${s}" min="0" max="100" step="5" value="${S.w[s]}"><span class="share small" id="ws-${s}"></span></div>
  </div>`).join('');
  SUBJECTS.forEach(s => {
    $('on-' + s).onchange = e => { S.on[s] = e.target.checked; $('tp-' + s).classList.toggle('on', S.on[s]); $('blk-' + s).classList.toggle('hidden', !S.on[s]); updateShares(); updateUnitPickers(); if (S.combined) recombine(); };
    $('w-' + s).oninput = e => { S.w[s] = +e.target.value; $('wo-' + s).textContent = S.w[s]; updateShares(); if (S.combined) recombine(); };
  });
}
function updateShares() {
  const tot = SUBJECTS.filter(s => S.on[s]).reduce((a, s) => a + S.w[s], 0);
  SUBJECTS.forEach(s => { const el = $('ws-' + s); if (!el) return; el.textContent = !S.on[s] ? '' : S.w[s] === 0 || tot === 0 ? t('off') : t('shareOf', { p: pct(100 * S.w[s] / tot) }); const r = $('w-' + s); if (r) r.style.setProperty('--fill', S.w[s] + '%'); });
}
function updateUnitPickers() { $('uTbox').classList.toggle('hidden', !S.on.temperature); $('uZbox').classList.toggle('hidden', !S.on.topography); }

/* ================= data blocks (one per subject) ================= */
function buildBlocks() {
  $('blocks').innerHTML = SUBJECTS.map(s => {
    const units = `<option value="auto"></option>` + UNIT_OPTS[s].map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    const side = (r, cls, lbl) => `<div class="side ${cls}"><div class="sidehead"><span class="dot"></span><span data-i18n="${lbl}"></span></div>
      <div class="drop" id="d${r}-${s}" tabindex="0" role="button"><b data-i18n="drop"></b><div class="small mute" data-i18n="hint_${s}"></div><input type="file" id="f${r}-${s}"><div class="fname" id="n${r}-${s}"></div></div>
      <div id="s${r}-${s}"></div></div>`;
    const maps = s === 'composition' ? '' : `<div class="row">
        <div><label for="kc-${s}" data-i18n="mapKeyCel"></label><select class="keysel" id="kc-${s}">${KEY_OPTS}</select></div><div><label for="kcmin-${s}" data-i18n="keyMin"></label><input type="number" id="kcmin-${s}"></div><div><label for="kcmax-${s}" data-i18n="keyMax"></label><input type="number" id="kcmax-${s}"></div>${s === 'topography' ? `<div><label for="pc-${s}" data-i18n="pixelSize"></label><input type="number" id="pc-${s}"></div>` : ''}</div>
      <div class="row"><div><label for="ke-${s}" data-i18n="mapKeyEarth"></label><select class="keysel" id="ke-${s}">${KEY_OPTS}</select></div><div><label for="kemin-${s}" data-i18n="keyMin"></label><input type="number" id="kemin-${s}"></div><div><label for="kemax-${s}" data-i18n="keyMax"></label><input type="number" id="kemax-${s}"></div>${s === 'topography' ? `<div><label for="pe-${s}" data-i18n="pixelSize"></label><input type="number" id="pe-${s}"></div>` : ''}</div>`;
    const elev = s !== 'temperature' ? '' : `<label class="check"><input type="checkbox" id="elev-${s}"> <span data-i18n="elevCorr"></span></label>
      <div class="row"><div><label for="ez0-${s}" data-i18n="dataElev"></label><input type="number" id="ez0-${s}"></div><div><label for="ez1-${s}" data-i18n="targetElev"></label><input type="number" id="ez1-${s}"></div><div><label for="elr-${s}" data-i18n="lapse"></label><input type="number" id="elr-${s}" value="6.5" step="0.1"></div></div>`;
    return `<div class="card block${S.on[s] ? '' : ' hidden'}" id="blk-${s}">
      <div class="blockhead"><h3 data-i18n="s_${s}"></h3><span class="small mute" data-i18n="d_${s}"></span></div>
      <div class="grid2">${side('c', 'c', 'celData')}${side('e', 'e', 'earthData')}</div>
      <details class="key"><summary data-i18n="options"></summary>
        <div class="row"><div><label for="uc-${s}" data-i18n="unitsCel"></label><select class="unitsel" id="uc-${s}">${units}</select></div><div><label for="ue-${s}" data-i18n="unitsEarth"></label><select class="unitsel" id="ue-${s}">${units}</select></div></div>
        ${maps}${elev}
        <p class="small mute" style="margin-top:12px" data-i18n="siteOverride"></p>
        <div class="row"><div><label for="cname2-${s}" data-i18n="celSite"></label><input type="text" id="cname2-${s}" data-i18n-ph="sameAbove"></div><div><label for="ename2-${s}" data-i18n="earthSite"></label><input type="text" id="ename2-${s}" data-i18n-ph="sameAbove"></div></div>
      </details>
    </div>`;
  }).join('');
  SUBJECTS.forEach(s => ['c', 'e'].forEach(r => {
    const dz = $(`d${r}-${s}`), inp = $(`f${r}-${s}`);
    dz.onclick = () => inp.click(); dz.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
    inp.onchange = () => inp.files[0] && setFile(s, r, inp.files[0]);
    dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = () => dz.classList.remove('over');
    dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); e.dataTransfer.files[0] && setFile(s, r, e.dataTransfer.files[0]); };
  }));
}
function setFile(s, r, f) { S.files[s][r] = f; $(`n${r}-${s}`).textContent = f ? f.name : ''; $(`s${r}-${s}`).innerHTML = ''; $(`d${r}-${s}`).classList.toggle('has', !!f); }

/* ================= reading files ================= */
async function readImage(file, s, role) {
  const sel = $(`k${role}-${s}`).value, uo = $(`u${role}-${s}`).value;
  if (s === 'composition') return ENG.decodeMapPixels(null, null, 'composition');
  const url = URL.createObjectURL(file), im = new Image();
  await new Promise((ok, no) => { im.onload = ok; im.onerror = () => no(new ENG.AnalogError('E-IMAGE', 'The image could not be opened.', 'Try PNG or JPG.')); im.src = url; });
  const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  const g = cv.getContext('2d'); g.drawImage(im, 0, 0); const data = g.getImageData(0, 0, cv.width, cv.height).data;
  let key;
  if (sel === 'ai') {
    if (!claudeAvailable()) throw new ENG.AnalogError('E-NOKEY', 'This map has no machine-readable key, and Claude isn’t available here to read its legend.', 'Choose a colour scale and enter the key’s minimum, maximum and units in the options below.');
    key = await ENG.readLegendWithClaude(null, { subject: s, ask: p => askClaude(p, { image: file }) });
    if (uo !== 'auto') key.units = uo;
  } else {
    const lo = parseFloat($(`k${role}min-${s}`).value), hi = parseFloat($(`k${role}max-${s}`).value);
    if (isNaN(lo) || isNaN(hi) || uo === 'auto') throw new ENG.AnalogError('E-NOKEY', 'No key: a manual colour scale needs a minimum, a maximum and units.', 'Fill in the key minimum, maximum and units in the options below.');
    key = { stops: ENG.stopsFromColormap(sel, lo, hi), units: uo };
  }
  const px = parseFloat(($(`p${role}-${s}`) || {}).value); if (s === 'topography' && px > 0) key.pixelSize_m = px;
  return ENG.decodeMapPixels({ rgba: data, width: cv.width, height: cv.height }, key, s);
}
async function readDataset(s, role) {
  const f = S.files[s][role], box = $(`s${role}-${s}`); box.innerHTML = '';
  if (!f) { showMsg(box, 'err', t('noFile'), '', t('noFileFix')); return null; }
  try {
    const d = /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name) ? await readImage(f, s, role) : ENG.parseText(await f.text(), f.name, { role: role === 'c' ? 'celestial' : 'earth', units: $(`u${role}-${s}`).value, subject: s });
    const m = d.meta, cols = m.columns;
    const what = s === 'composition' ? t('readC', { n: d.n.toLocaleString(), k: cols.components.length }) : s === 'topography' ? t('readZ', { n: d.z.length.toLocaleString() }) : t('readT', { n: d.T.length.toLocaleString() });
    const detail = s === 'composition' ? `${esc(cols.components.join(', '))} · ${esc(m.units)}` : s === 'topography' ? `${esc(cols.elevation)} · ${esc(m.units)}${cols.position ? ' · ' + esc(cols.position) : ''}` : `${esc(cols.temperature)} · ${esc(m.units)}${cols.timeOfDay ? ' · ' + esc(cols.timeOfDay) : ''}${cols.season ? ' · ' + esc(cols.season) : ''}`;
    showMsg(box, 'ok', what, detail);
    m.warnings.forEach(w => showMsg(box, 'warn', t('checkThis'), esc(w)));
    return d;
  } catch (e) {
    if (e instanceof ENG.AnalogError) showMsg(box, 'err', `${e.code}: ${esc(e.message)}`, '', uiFix(e.fix)); else showMsg(box, 'err', 'E-READ: The file could not be read.', '', esc(e.message || e));
    return null;
  }
}

/* ================= running the comparison ================= */
async function run() {
  const subs = SUBJECTS.filter(s => S.on[s]);
  $('runerr').innerHTML = '';
  if (!subs.length) { showMsg($('runerr'), 'err', t('needSubject')); return; }
  $('run').disabled = true; setStatus(t('reading'), true);
  let ok = true;
  for (const s of subs) { const c = await readDataset(s, 'c'), e = await readDataset(s, 'e'); S.data[s] = { c, e }; if (!c || !e) ok = false; }
  if (!ok) { setStatus(t('fixErrors')); $('run').disabled = false; clearResults(); return; }
  S.results = {}; S.ai = {};
  for (const s of subs) {
    const { c, e } = S.data[s];
    const opts = { subject: s, body: $('cbody').value, bootstrap: CONFIG.bootstrap, onProgress: f => setStatus(t('bootstrapping', { s: t('s_' + s).toLowerCase(), p: pct(100 * f) }), true) };
    if (s === 'temperature' && $('elev-temperature').checked) { const z0 = parseFloat($('ez0-temperature').value), z1 = parseFloat($('ez1-temperature').value), lr = parseFloat($('elr-temperature').value); if (![z0, z1, lr].some(isNaN)) opts.elevation = { from_m: z0, to_m: z1, lapseRate_K_per_km: lr }; }
    setStatus(t('analyzing', { s: t('s_' + s).toLowerCase() }), true);
    try { S.results[s] = await ENG.analyze(c, e, opts); }
    catch (err) {
      const box = $('runerr');
      if (err instanceof ENG.AnalogError) showMsg(box, 'err', `${t('analysisFailed', { s: t('s_' + s) })} ${err.code}: ${esc(err.message)}`, '', uiFix(err.fix)); else showMsg(box, 'err', t('analysisFailed', { s: t('s_' + s) }), '', esc(err.message || err));
    }
  }
  $('run').disabled = false; setStatus('');
  if (!Object.keys(S.results).length) { clearResults(); return; }
  S.key = Math.random();
  S.submitted = true;                       // real data came back from a user-triggered run
  $('zerostate').classList.add('hidden'); $('results').classList.remove('hidden');
  recombine();
  showDetails(Object.keys(S.results)[0]);
  if (claudeAvailable()) runAI();
  $('overallsec').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth' });
}
/* Back to the zero state: no scores, charts, tables or written assessment anywhere on the page. */
function clearResults() {
  S.results = {}; S.combined = null; S.submitted = false; S.active = null; S.res = null; S.c = null; S.e = null; S.ai = {}; S.ctx = null;
  ['overall', 'tabs', 'score', 'ci', 'verdict', 'vline', 'scorelabel', 'bars', 'ai', 'tstats', 'dq', 'fhero', 'lhero', 'chero', 'f1', 'f2', 'l1', 'l2', 'c1', 'c2', 'ttests', 'tthr', 'cthr', 'methods', 'h1fig', 'hf1', 'hf2', 'hstats', 'hthr']
    .forEach(id => { const el = $(id); if (el) el.innerHTML = ''; });
  $('results').classList.add('hidden'); $('zerostate').classList.remove('hidden');
  window.dispatchEvent(new Event('lab:overall'));
}
function recombine() {
  const list = SUBJECTS.filter(s => S.on[s] && S.results[s]).map(s => S.results[s]);
  S.combined = list.length ? ENG.combineLikeness(list, S.w) : null;
  if (S.submitted) renderOverall();
}


/* ---------- charts ---------- */
function chart(el, draw) { el.className = 'fig'; const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); el.innerHTML = ''; el.appendChild(s); const go = () => draw(s, el.clientWidth, el.clientHeight); new ResizeObserver(go).observe(el); go(); }
function axes(W, H, P, xlo, xhi, ylo, yhi, xt, yt, xl, yl, xfmt = v => Math.round(v)) {
  const X = x => P.l + (x - xlo) / (xhi - xlo) * (W - P.l - P.r), Y = y => H - P.b - (y - ylo) / (yhi - ylo) * (H - P.t - P.b); let g = ''; const small = W < 520;
  yt.forEach(v => { g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${P.l - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="12" fill="var(--mute)">${+v.toFixed(2)}</text>`; });
  xt.filter((_, i) => !small || i % 2 === 0).forEach(v => { g += `<text x="${X(v)}" y="${H - P.b + 16}" text-anchor="middle" font-size="12" fill="var(--mute)">${xfmt(v)}</text>`; });
  g += `<text x="${(P.l + W - P.r) / 2}" y="${H - 4}" text-anchor="middle" font-size="12" fill="var(--mute)">${xl}</text><text x="12" y="${P.t - 6}" font-size="12" fill="var(--mute)">${yl}</text>`;
  return { X, Y, g };
}
const ticks = (lo, hi, n = 6) => { const st = Math.pow(10, Math.floor(Math.log10((hi - lo) / n || 1))); const s = [1, 2, 5, 10].map(m => m * st).find(m => (hi - lo) / m <= n) || st * 10; const o = []; for (let v = Math.ceil(lo / s) * s; v <= hi + 1e-9; v += s) o.push(+v.toFixed(10)); return o; };
function drawKDE(el, a, b, xl, minBw, note) {
  chart(el, (s, W, H) => {
    const lo = Math.min(...a, ...b), hi = Math.max(...a, ...b), pad = (hi - lo) * .06 || 1, xlo = lo - pad, xhi = hi + pad, G = 400, dx = (xhi - xlo) / (G - 1);
    const A = Array.from(ENG.kde(a, xlo, xhi, G, minBw).f), B = Array.from(ENG.kde(b, xlo, xhi, G, minBw).f), ym = Math.max(...A, ...B) * 1.08, P = { l: 44, r: 12, t: 22, b: 36 };
    const { X, Y, g } = axes(W, H, P, xlo, xhi, 0, ym, ticks(xlo, xhi, W < 520 ? 5 : 8), [], xl, 'Probability density', v => +v.toFixed(2));
    const path = F => F.map((v, i) => `${i ? 'L' : 'M'}${X(xlo + i * dx).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    const ov = 'M' + X(xlo) + ',' + Y(0) + A.map((v, i) => `L${X(xlo + i * dx).toFixed(1)},${Y(Math.min(v, B[i])).toFixed(1)}`).join('') + `L${X(xhi)},${Y(0)}Z`;
    s.innerHTML = g + `<path d="${ov}" fill="var(--ink)" opacity=".18"/><path d="${path(B)}" fill="none" stroke="var(--earth)" stroke-width="2.5"/><path d="${path(A)}" fill="none" stroke="var(--cel)" stroke-width="2.5"/><line x1="${P.l}" x2="${W - P.r}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--ink)"/>`;
  });
}
function drawLines(el, xs, sc, se, xl, yl, xlo, xhi, note, fy = v => v) {
  if (!sc || !se || (!sc.some(Boolean) && !se.some(Boolean))) { el.className = ''; el.innerHTML = `<div class="msg warn"><b>${t('notAvail')}</b><div>${note}</div></div>`; return false; }
  chart(el, (s, W, H) => {
    const vals = [...sc, ...se].filter(Boolean).flatMap(o => [fy(o.m - (o.s || 0)), fy(o.m + (o.s || 0))]); let lo = Math.min(...vals), hi = Math.max(...vals); const pd = (hi - lo) * .08 || 1; lo -= pd; hi += pd;
    const P = { l: 48, r: 12, t: 22, b: 36 }; const { X, Y, g } = axes(W, H, P, xlo, xhi, lo, hi, ticks(xlo, xhi, W < 520 ? 5 : 8), ticks(lo, hi, 5), xl, yl, v => +v.toFixed(2));
    const ser = (arr, col) => { let p = '', d = ''; arr.forEach((v, i) => { if (!v) return; const x = X(xs[i]), y = Y(fy(v.m)); if (v.s) d += `<line x1="${x}" x2="${x}" y1="${Y(fy(v.m - v.s))}" y2="${Y(fy(v.m + v.s))}" stroke="${col}" opacity=".45" stroke-width="2"/>`; d += `<circle cx="${x}" cy="${y}" r="3.5" fill="${col}"/>`; p += (p && arr[i - 1] ? 'L' : 'M') + x + ',' + y; }); return `<path d="${p}" fill="none" stroke="${col}" stroke-width="2"/>` + d; };
    s.innerHTML = g + ser(se, 'var(--earth)') + ser(sc, 'var(--cel)');
  });
  return true;
}
const legend2 = () => `<span><i class="sw" style="background:var(--cel)"></i>${esc(S.ctx.celestialSite)}</span><span><i class="sw" style="background:var(--earth)"></i>${esc(S.ctx.earthSite)}</span>`;
function rowsTable(el, head, rows) { el.innerHTML = `<thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((v, i) => `<td data-l="${esc(head[i])}">${v}</td>`).join('')}</tr>`).join('')}</tbody>`; }

/* ---------- render: temperature ---------- */
function renderTemp(r) {
  const c = S.c, Te = r.earth.elevationCorrection_K ? S.e.T.map(x => x + r.earth.elevationCorrection_K) : S.e.T, A = r.celestial.stats, B = r.earth.stats;
  $('h1fig').textContent = t('h_fig_t'); $('fhero').className = 'fig';
  drawKDE($('fhero'), c.T.map(dispT), Te.map(dispT), `Temperature (${tU()})`, 0.5);
  $('lhero').innerHTML = legend2() + `<span><i class="sw" style="background:var(--ink);opacity:.25"></i>Shared area = ${pct(100 * r.tests.overallOverlap)} overlap</span>`;
  $('chero').textContent = `Kernel density estimates of all readings (Gaussian kernel, Silverman bandwidth). n = ${A.n.toLocaleString()} and ${B.n.toLocaleString()}.`;
  $('hstats').textContent = t('h_stats_t');
  rowsTable($('tstats'), ['Statistic', S.ctx.celestialSite, S.ctx.earthSite], [
    ['Readings (n)', A.n.toLocaleString(), B.n.toLocaleString()], ['Mean ± standard error', `${T(A.mean)} ± ${f2(A.se)}`, `${T(B.mean)} ± ${f2(B.se)}`], ['Median', T(A.median), T(B.median)], ['Standard deviation', dT(A.sd), dT(B.sd)], ['Minimum', T(A.min), T(B.min)], ['5th percentile', T(A.p5), T(B.p5)], ['25th percentile', T(A.p25), T(B.p25)], ['75th percentile', T(A.p75), T(B.p75)], ['95th percentile', T(A.p95), T(B.p95)], ['Maximum', T(A.max), T(B.max)], ['Interquartile range', dT(A.iqr), dT(B.iqr)], ['Skewness', f2(A.skewness), f2(B.skewness)], ['Excess kurtosis', f2(A.excessKurtosis), f2(B.excessKurtosis)], ['Coefficient of variation (in K)', pct(100 * A.sd / A.mean), pct(100 * B.sd / B.mean)]]);
  if (r.earth.elevationCorrection_K) showMsg($('dq'), 'ok', 'Elevation correction', `Every Earth value was shifted by ${f1(r.earth.elevationCorrection_K)} K with a lapse rate.`);
  if (r.daily && r.daily.commonHours.length < 24) showMsg($('dq'), 'warn', 'Time-of-day matching', `${esc(S.ctx.celestialSite)} only has readings at local hours ${r.daily.commonHours.map(h => h + ':00').join(', ')}. Daily-cycle comparisons use only those hours from both datasets.`);
  if (r.seasonal && r.seasonal.hemisphereShift_deg) showMsg($('dq'), 'warn', 'Hemisphere alignment', 'The two sites are in opposite hemispheres, so Earth’s seasons were shifted by 180° of solar longitude.');
  $('hf1').textContent = t('h_daily'); $('hf2').textContent = t('h_season');
  const hs = Array.from({ length: 24 }, (_, i) => i + .5), hr = a => a && a.map(o => o && { m: o.mean_K, s: o.sd_K });
  const ok1 = drawLines($('f1'), hs, hr(r.celestial.hourly), hr(r.earth.hourly), 'Local solar hour', tU(), 0, 24, 'Both datasets need a time-of-day column (local time, hour, or a date-time) to compare daily cycles.', dispT);
  $('l1').innerHTML = ok1 ? legend2() : ''; $('c1').textContent = ok1 ? `Mean ± 1 standard deviation by local solar hour.${r.daily && r.daily.swing ? ` Day–night swing: ${dT(r.daily.swing.celestial_K)} vs ${dT(r.daily.swing.earth_K)}.` : ''}` : '';
  const so = r.seasonal ? [r.seasonal.celestial_K.map(v => v == null ? null : { m: v }), r.seasonal.earth_K.map(v => v == null ? null : { m: v })] : [null, null];
  const ok2 = drawLines($('f2'), r.seasonal ? r.seasonal.binsLs : [], so[0], so[1], 'Solar longitude Ls (°)', tU(), 0, 360, 'Both datasets need a season column: Ls for other worlds, or dates for Earth.', dispT);
  $('l2').innerHTML = ok2 ? legend2() : ''; $('c2').textContent = ok2 ? `Mean temperature in 30° bins of solar longitude${r.seasonal.daytimeOnly ? ' at matched daytime hours' : ''}.${r.seasonal.r != null ? ` Pearson r = ${f2(r.seasonal.r)} over ${r.seasonal.nBins} bins.` : ''}` : '';
  const tt = r.tests, w = tt.welch, d = tt.cohensD;
  rowsTable($('ttests'), ['Test', 'Result', 'Meaning'], [
    ['Mean difference (95% CI)', `${dT(tt.meanDifference_K)} (${dT(tt.meanDifferenceCI95_K[0])} to ${dT(tt.meanDifferenceCI95_K[1])})`, `${esc(S.ctx.celestialSite)} is ${tt.meanDifference_K > 0 ? 'warmer' : 'colder'} on average`],
    ['Welch’s t-test', `t = ${f2(w.t)}, df = ${Math.round(w.df)}, p ${fmtp(w.p)}`, w.p < .05 ? 'Means differ significantly' : 'No significant mean difference'],
    ['Cohen’s d', f2(d), Math.abs(d) < .2 ? 'Negligible effect' : Math.abs(d) < .5 ? 'Small effect' : Math.abs(d) < .8 ? 'Medium effect' : 'Large effect'],
    ['Kolmogorov–Smirnov D', `${f2(tt.kolmogorovSmirnov.D)} (p ${fmtp(tt.kolmogorovSmirnov.p)})`, 'Largest gap between the cumulative distributions'],
    ['Wasserstein distance', dT(tt.wasserstein_K), 'Average shift needed to turn one distribution into the other'],
    ['Overlap coefficient', pct(100 * tt.overallOverlap), 'Share of the two density curves that coincide']]);
  $('hthr').textContent = t('h_thr_t');
  const a = r.celestial.thresholdsPercent, b = r.earth.thresholdsPercent;
  rowsTable($('tthr'), ['Share of readings', S.ctx.celestialSite, S.ctx.earthSite], [
    ['Above 273 K (water ice melts)', pct(a.above273K_waterIceMelts), pct(b.above273K_waterIceMelts)], ['Below 252 K (NaCl brine eutectic)', pct(a.below252K_NaClBrineEutectic), pct(b.below252K_NaClBrineEutectic)], ['Below 206 K (Mg-perchlorate brine eutectic)', pct(a.below206K_MgPerchlorateEutectic), pct(b.below206K_MgPerchlorateEutectic)], ['Below 148 K (CO₂ frost on Mars)', pct(a.below148K_CO2FrostOnMars), pct(b.below148K_CO2FrostOnMars)], ['Below 110 K (water ice stable for billions of years)', pct(a.below110K_iceStableGeologically), pct(b.below110K_iceStableGeologically)],
    ...(b.freezeThawCycles != null ? [['Freeze–thaw cycles (Earth series)', '–', `${Math.round(b.freezeThawCycles)} over ${Math.round(b.freezeThawSpanDays)} days (${f2(b.freezeThawPerDay)} per day)`]] : [])]);
  $('cthr').textContent = ENG.BODIES[S.ctx.body].note;
}

/* ---------- render: topography ---------- */
function renderTopo(r) {
  const C = r.celestial, E = r.earth;
  $('h1fig').textContent = t('h_fig_z'); $('fhero').className = 'fig';
  drawKDE($('fhero'), C.sample.relative_m.map(dispZ), E.sample.relative_m.map(dispZ), `Elevation relative to median (${zU()})`, duZ() === 'km' ? 0.001 : 1);
  $('lhero').innerHTML = legend2() + `<span><i class="sw" style="background:var(--ink);opacity:.25"></i>Shared area = ${pct(100 * r.tests.relativeElevation.overlap)} overlap</span>`;
  $('chero').textContent = `Each site is centred on its own median elevation, since Mars and Earth measure height from different reference surfaces. n = ${C.stats.n.toLocaleString()} and ${E.stats.n.toLocaleString()}.`;
  $('hstats').textContent = t('h_stats_z');
  const sl = p => p.slopeStats ? `${f1(p.slopeStats.median)}°` : '–', ar = p => p.area_km2 ? Math.round(p.area_km2).toLocaleString() + ' km²' : '–';
  rowsTable($('tstats'), ['Statistic', S.ctx.celestialSite, S.ctx.earthSite], [
    ['Elevation points (n)', C.stats.n.toLocaleString(), E.stats.n.toLocaleString()], ['Minimum elevation', Z(C.stats.min), Z(E.stats.min)], ['Median elevation', Z(C.stats.median), Z(E.stats.median)], ['Maximum elevation', Z(C.stats.max), Z(E.stats.max)],
    ['Relief (5th to 95th percentile)', Z(C.relief_m), Z(E.relief_m)], ['Full range', Z(C.range_m), Z(E.range_m)], ['Standard deviation', Z(C.stats.sd), Z(E.stats.sd)], ['Hypsometric integral', f2(C.hypsometricIntegral), f2(E.hypsometricIntegral)],
    ['Roughness (SD about a fitted plane)', C.roughness_m != null ? Z(C.roughness_m) : '–', E.roughness_m != null ? Z(E.roughness_m) : '–'],
    ['Median slope', sl(C), sl(E)], ['Mean slope', C.slopeStats ? f1(C.slopeStats.mean) + '°' : '–', E.slopeStats ? f1(E.slopeStats.mean) + '°' : '–'], ['95th percentile slope', C.slopeStats ? f1(C.slopeStats.p95) + '°' : '–', E.slopeStats ? f1(E.slopeStats.p95) + '°' : '–'],
    ['Grid spacing for slopes', C.spacing_m ? Math.round(C.spacing_m) + ' m' : '–', E.spacing_m ? Math.round(E.spacing_m) + ' m' : '–'], ['Area covered', ar(C), ar(E)]]);
  $('hf1').textContent = t('h_hyps'); $('hf2').textContent = t('h_slopes');
  const xs = Array.from({ length: 21 }, (_, i) => i / 20);
  drawLines($('f1'), xs, C.hypsometry.map(v => ({ m: v })), E.hypsometry.map(v => ({ m: v })), 'Fraction of area above that height', 'Relative height', 0, 1, '');
  $('l1').innerHTML = legend2(); $('c1').textContent = `Height scaled from each site’s lowest (0) to highest (1) point. A curve that stays high means most of the area sits near the top of its range. Hypsometric integrals: ${f2(C.hypsometricIntegral)} and ${f2(E.hypsometricIntegral)}.`;
  if (C.sample.slopes_deg && E.sample.slopes_deg) { $('f2').className = 'fig'; drawKDE($('f2'), C.sample.slopes_deg, E.sample.slopes_deg, 'Slope (°)', 0.2); $('l2').innerHTML = legend2(); $('c2').textContent = `Slopes from the elevation grid${C.spacing_m ? `, measured over about ${Math.round(C.spacing_m)} m and ${Math.round(E.spacing_m || 0)} m` : ''}.`; }
  else { $('f2').className = ''; $('f2').innerHTML = '<div class="msg warn"><b>' + t('notAvail') + '</b><div>Slopes need latitude and longitude on a regular grid, a slope column, or a map pixel size in both datasets.</div></div>'; $('l2').innerHTML = ''; $('c2').textContent = ''; }
  const tt = r.tests;
  rowsTable($('ttests'), ['Test', 'Result', 'Meaning'], [
    ['Kolmogorov–Smirnov D (relative elevation)', `${f2(tt.relativeElevation.kolmogorovSmirnov.D)} (p ${fmtp(tt.relativeElevation.kolmogorovSmirnov.p)})`, 'Largest gap between the cumulative height distributions'],
    ['Wasserstein distance (relative elevation)', Z(tt.relativeElevation.wasserstein_m), 'Average height shift needed to turn one distribution into the other'],
    ['Overlap coefficient (relative elevation)', pct(100 * tt.relativeElevation.overlap), 'Share of the two height distributions that coincide'],
    ...(tt.slope ? [['Kolmogorov–Smirnov D (slope)', `${f2(tt.slope.kolmogorovSmirnov.D)} (p ${fmtp(tt.slope.kolmogorovSmirnov.p)})`, 'Largest gap between the slope distributions'], ['Median slope difference', `${f2(tt.slope.medianDifference_deg)}°`, `${esc(S.ctx.celestialSite)} is ${tt.slope.medianDifference_deg > 0 ? 'steeper' : 'gentler'} at the median`], ['Overlap coefficient (slope)', pct(100 * tt.slope.overlap), 'Share of the two slope distributions that coincide']] : [])]);
  $('hthr').textContent = t('h_thr_z');
  if (C.slopeThresholds && E.slopeThresholds) {
    rowsTable($('tthr'), ['Share of area', S.ctx.celestialSite, S.ctx.earthSite], [['Flatter than 5° (gentle ground)', pct(C.slopeThresholds.below5deg_gentle), pct(E.slopeThresholds.below5deg_gentle)], ['Flatter than 15° (a common lander limit)', pct(C.slopeThresholds.below15deg_landingSafe), pct(E.slopeThresholds.below15deg_landingSafe)], ['Steeper than 30° (near the angle of repose)', pct(C.slopeThresholds.above30deg_nearAngleOfRepose), pct(E.slopeThresholds.above30deg_nearAngleOfRepose)]]);
    $('cthr').textContent = 'Slope limits depend on the distance slopes are measured over. Steep ground at the scale of a lander can hide inside gentle 1 km slopes.';
  } else { $('tthr').innerHTML = ''; $('cthr').textContent = 'Needs slopes for both datasets.'; }
}

/* ---------- render: composition ---------- */
function renderComp(r) {
  const tb = r.table; const mx = Math.max(...tb.flatMap(x => [x.celestialNormalized, x.earthNormalized]));
  $('h1fig').textContent = t('h_fig_c');
  $('fhero').className = ''; $('fhero').innerHTML = `<div class="cbars">${tb.map(x => `<div class="cb"><span class="n">${esc(x.component)}</span><span class="tr"><i style="width:${Math.max(.5, 100 * x.celestialNormalized / mx)}%;background:var(--cel)"></i><i style="width:${Math.max(.5, 100 * x.earthNormalized / mx)}%;background:var(--earth)"></i></span><span class="val">${f2(x.celestialNormalized)} · ${f2(x.earthNormalized)}%</span></div>`).join('')}</div>`;
  $('lhero').innerHTML = legend2(); $('chero').textContent = `Means of ${r.celestial.n.toLocaleString()} and ${r.earth.n.toLocaleString()} samples, each scaled so the shared components add up to 100%.`;
  $('hstats').textContent = t('h_stats_c');
  rowsTable($('tstats'), ['Component', `${S.ctx.celestialSite} mean ± SD (n)`, `${S.ctx.earthSite} mean ± SD (n)`, 'Renormalised', 'Difference'], tb.map(x => [esc(x.component) + ` <span class="mute small">${esc(x.basis)}</span>`, `${f2(x.celestialMean)} ± ${f2(x.celestialSD)} (${x.celestialN})`, `${f2(x.earthMean)} ± ${f2(x.earthSD)} (${x.earthN})`, `${f2(x.celestialNormalized)} · ${f2(x.earthNormalized)}`, (x.difference >= 0 ? '+' : '') + f2(x.difference)]));
  $('hf1').textContent = t('h_clr'); $('hf2').textContent = t('h_idx');
  const lm = Math.max(...tb.map(x => Math.abs(x.clrDifference)), 0.01);
  $('f1').className = ''; $('f1').innerHTML = tb.map(x => { const w = 50 * Math.abs(x.clrDifference) / lm, left = x.clrDifference >= 0 ? 50 : 50 - w; return `<div class="dv"><span><b>${esc(x.component)}</b></span><span class="ax"><i style="left:${left}%;width:${Math.max(.5, w)}%;background:${x.clrDifference >= 0 ? 'var(--cel)' : 'var(--earth)'}"></i></span><span class="val">${(x.clrDifference >= 0 ? '+' : '') + f2(x.clrDifference)}</span></div>`; }).join('');
  $('l1').innerHTML = `<span><i class="sw" style="background:var(--cel)"></i>Richer at ${esc(S.ctx.celestialSite)}</span><span><i class="sw" style="background:var(--earth)"></i>Richer at ${esc(S.ctx.earthSite)}</span>`;
  $('c1').textContent = 'Centred log-ratio difference for each component. Log-ratios treat a change in a minor oxide as seriously as one in a major oxide, which is the basis of the Aitchison distance.';
  const ic = r.celestial.indices, ie = r.earth.indices, v = (o, k, d = 0) => o[k] != null ? (+o[k]).toFixed(d) : '–', tas = (o, k) => o.TAS ? (k === 'rock' ? esc(o.TAS.rockType) : k === 'series' ? o.TAS.series : f1(o.TAS[k])) : '–';
  $('f2').className = ''; $('f2').innerHTML = `<div class="scroll"><table class="stack" id="tidx"></table></div>`;
  rowsTable($('tidx'), ['Index', S.ctx.celestialSite, S.ctx.earthSite], [['Mg number', v(ic, 'mgNumber'), v(ie, 'mgNumber')], ['Chemical index of alteration', v(ic, 'CIA'), v(ie, 'CIA')], ['SiO₂ (volatile-free, wt%)', tas(ic, 'SiO2'), tas(ie, 'SiO2')], ['Na₂O + K₂O (volatile-free, wt%)', tas(ic, 'alkalis'), tas(ie, 'alkalis')], ['Rock type (TAS, approximate)', tas(ic, 'rock'), tas(ie, 'rock')], ['Series', tas(ic, 'series'), tas(ie, 'series')]]);
  $('l2').innerHTML = ''; $('c2').textContent = 'Mg number = 100·Mg/(Mg+Fe) in moles. CIA = 100·Al₂O₃/(Al₂O₃+CaO+Na₂O+K₂O) in moles, with CaO not corrected for carbonate or apatite. Fresh basalt sits near 30 to 45, weathered material above 55.';
  const tt = r.tests;
  rowsTable($('ttests'), ['Measure', 'Result', 'Meaning'], [
    ['Bray–Curtis similarity', pct(100 * tt.brayCurtisSimilarity), 'Share of the renormalised compositions that coincide'],
    ['Aitchison distance', f2(tt.aitchisonDistance), 'Distance between log-ratio compositions. Below about 0.5 is very close, above 2 is a different rock type'],
    ['Cosine similarity', f2(tt.cosineSimilarity), 'Angle between the composition vectors, dominated by the major oxides'],
    ['Sample-to-sample overlap', tt.sampleOverlap != null ? pct(100 * tt.sampleOverlap) : '–', 'How much the spread of individual samples overlaps, averaged over components']]);
  $('hthr').textContent = t('h_thr_c');
  rowsTable($('tthr'), ['Item', 'Value'], [['Shared components', String(r.sharedComponents.length)], ['Samples', `${r.celestial.n.toLocaleString()} and ${r.earth.n.toLocaleString()}`]]);
  $('cthr').textContent = r.sharedComponents.join(', ');
}

/* ---------- methods ---------- */
const METHODS = {
  temperature: r => `<p><b>Inputs.</b> Every value is converted to kelvin. Fill values (≤ −900) and impossible values (≤ 0 K or > 1000 K) are removed. Units come from the file’s key (header, NASA POWER metadata or map legend). Files without a usable key are rejected with an error code.${r.earth.elevationCorrection_K ? ` Earth values were shifted by ${f1(r.earth.elevationCorrection_K)} K with a lapse rate.` : ''}</p><p><b>Time matching.</b> Local time is in hours of each world’s own solar day. Daily comparisons use only the local hours both datasets contain. Day is 08:00 to 17:59 and night 20:00 to 05:59. Earth dates become solar longitude with Ls ≈ (day of year − 79) × 360 / 365.25, and sites in opposite hemispheres are shifted by 180°.</p><p><b>Likeness score.</b> The mean of the available components: daytime and night-time overlap (overlap coefficient of Gaussian kernel density estimates, Silverman bandwidth), day–night swing ratio, and seasonal correlation (negative values count as 0). Without time of day, the score uses overall overlap, the shared 5–95% range and mean closeness exp(−|Δμ| / 30 K). The 95% interval comes from ${r.bootstrapResamples} bootstrap resamples.</p>`,
  topography: r => `<p><b>Inputs.</b> Elevations are converted to metres. Fill values (≤ −9999, including SRTM voids) and values beyond ±30 km are removed. Units come from the file’s key. Each site is compared relative to its own median, because Mars and Earth heights use different reference surfaces.</p><p><b>Slopes.</b> When latitude and longitude form a regular grid (or a map’s pixel size is given), slopes come from central differences on the grid, using the body’s mean radius (Mars ${(3389.5).toLocaleString()} km, Earth ${(6371).toLocaleString()} km). Slopes depend on grid spacing, so the lab warns when the two spacings differ by more than three times.</p><p><b>Likeness score.</b> The mean of: overlap of the relative-elevation distributions, the relief ratio (smaller 5–95% spread ÷ larger), the hypsometric curve match (1 minus the mean gap between the two normalised curves), and slope distribution overlap when both have slopes. The 95% interval comes from ${r.bootstrapResamples} bootstrap resamples.</p>`,
  composition: r => `<p><b>Inputs.</b> Each column is an oxide or mineral with units in its header (wt%, vol%, %, fraction or ppm), converted to percent. Fe₂O₃ is converted to total iron as FeO (× 0.8998). Identifier columns and uncertainty columns are skipped. Only components present in both files are compared, renormalised to 100%.</p><p><b>Likeness score.</b> The mean of: Bray–Curtis similarity of the mean compositions, Aitchison similarity exp(−d/2) where d is the distance between centred log-ratio compositions (values below 0.01% are set to 0.01% first), and the mean overlap of sample distributions per component when both files have at least 3 samples. The 95% interval comes from ${r.bootstrapResamples} bootstrap resamples of whole samples.</p><p><b>Indices.</b> Mg number, the chemical index of alteration (CIA) and an approximate total alkali versus silica class are reported for context. They are not part of the score.</p>`,
};


/* ================= overall result ================= */
const capFirst = x => x.charAt(0).toUpperCase() + x.slice(1);
function renderOverall() {
  const C = analysisData(), box = $('overall');
  if (!C) { box.innerHTML = ''; $('tabs').innerHTML = ''; window.dispatchEvent(new Event('lab:overall')); return; }
  const ctx = ctxFor(C.parts[0].subject), multi = C.parts.length > 1;
  const sorted = [...C.parts].filter(p => p.share > 0).sort((a, b) => b.likeness - a.likeness);
  const lvl = levelOf(C.likeness);
  box.innerHTML = `<div class="ovl-left">
      <div class="small mute">${esc(multi ? t('overall') : t('likenessOf', { s: t('s_' + C.parts[0].subject) }))}</div>
      <div class="score" id="ovscore"></div>
      <div class="ci lv-t">${C.ci95 ? esc(t('ci', { lo: pct(C.ci95[0]), hi: pct(C.ci95[1]) })) : esc(t('noci'))}</div>
      <div class="verdict" style="color:${levelColor(C.likeness)}">${esc(vT(lvl))}</div>
      <p>${esc(capFirst(t(multi ? 'overallLine' : 'singleLine', { earth: ctx.earthSite, cel: ctx.celestialSite, body: bodyName() })))}</p>
      ${multi && sorted.length > 1 ? `<p class="mute small">${esc(t('strongest', { s: t('s_' + sorted[0].subject), p: pct(sorted[0].likeness) }))} ${esc(t('weakest', { s: t('s_' + sorted[sorted.length - 1].subject), p: pct(sorted[sorted.length - 1].likeness) }))}</p>` : ''}
    </div>
    <div class="ovl-parts">${C.parts.map(p => `<button class="part" data-s="${p.subject}">
      <span class="pname"><span class="pdot ${p.subject}"></span>${esc(t('s_' + p.subject))}</span>
      <span class="pval">${pct(p.likeness)}</span>
      <span class="ptrack"><i data-w="${Math.max(1, p.likeness)}%" style="width:0"></i></span>
      <span class="pshare small mute">${esc(p.share > 0 ? t('shareOf', { p: pct(100 * p.share) }) : t('off'))} · ${esc(t('details'))} →</span>
    </button>`).join('')}</div>`;
  countUp($('ovscore'), C.likeness); growBars(box);
  box.querySelectorAll('.part').forEach(b => b.onclick = () => { showDetails(b.dataset.s); $('detailsec').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth' }); });
  $('tabs').innerHTML = C.parts.map(p => `<button role="tab" data-s="${p.subject}" aria-selected="${p.subject === S.active}">${esc(t('s_' + p.subject))} <span class="mute">${pct(p.likeness)}</span></button>`).join('');
  $('tabs').querySelectorAll('button').forEach(b => b.onclick = () => showDetails(b.dataset.s));
  window.dispatchEvent(new Event('lab:overall'));
}

/* ================= one subject in detail ================= */
function showDetails(s, quiet) {
  if (!analysisData() || !S.results[s]) return;
  S.active = s; S.res = S.results[s]; S.c = S.data[s].c; S.e = S.data[s].e; S.ctx = ctxFor(s);
  $('tabs').querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', b.dataset.s === s));
  render(quiet);
}
function render(quiet) {
  const r = S.res;
  $('scorelabel').textContent = t('likenessOf', { s: t('s_' + r.subject) });
  if (quiet) $('score').textContent = pct(r.likeness); else countUp($('score'), r.likeness);
  $('ci').textContent = r.ci95 ? t('ci', { lo: pct(r.ci95[0]), hi: pct(r.ci95[1]) }) : t('noci');
  $('verdict').innerHTML = `<span style="color:${levelColor(r.likeness)}">${esc(vT(levelOf(r.likeness)))}</span>`;
  $('vline').textContent = t('scoreParts');
  $('bars').innerHTML = r.components.map(x => `<div class="bar"><span>${esc(x.name)}${x.weight != null && x.weight !== 1 ? ` <span class="mute small">(× ${x.weight})</span>` : ''}</span><span class="v">${pct(x.percent)}</span><span class="t"><i data-w="${Math.max(1, x.percent)}%" style="width:0"></i></span></div>`).join('');
  growBars($('bars'));
  $('dq').innerHTML = ''; (r.warnings || []).forEach(w => showMsg($('dq'), 'warn', t('checkThis'), esc(w)));
  ({ temperature: renderTemp, topography: renderTopo, composition: renderComp })[r.subject](r);
  $('methods').innerHTML = METHODS[r.subject](r);
  renderAI();
  window.dispatchEvent(new Event('lab:details'));
}

/* ================= assessment ================= */
const shouldText = v => v === 'Yes' ? t('yes') : v === 'No' ? t('no') : /specific/i.test(v || '') ? t('yesSpecific') : (v || '');
function renderAIObj(o, by) {
  const col = o.should && /^(yes|sí|si|sim|ja|oui|はい|是|হ্যাঁ|हाँ|نعم|ya|да|có)/i.test(o.should) ? 'var(--good)' : 'var(--bad)';
  const note = o.source !== 'claude' && LANG !== 'en' ? `<p class="small mute">${esc(t('englishNote'))}</p>` : '';
  $('ai').innerHTML = `<p><span class="pill" style="color:${col}">${esc(t('expHere'))} ${esc(shouldText(o.should))}</span> <span class="small mute">${esc(by)}</span></p>${note}
  <h3 class="aihead">${esc(o.headline)}</h3><p>${esc(o.summary)}</p>
  ${o.experiments && o.experiments.length ? `<h3 style="margin-top:20px">${esc(t('recExp'))}</h3><div class="exp">${o.experiments.map(x => `<div class="card"><h3>${esc(x.title)}</h3><p><b>${esc(t('goal'))}.</b> ${esc(x.objective)}</p><p><b>${esc(t('method'))}.</b> ${esc(x.method)}</p><p><b>${esc(t('measure'))}.</b> ${esc(x.measure)}</p></div>`).join('')}</div>` : ''}
  ${o.caveats && o.caveats.length ? `<h3 style="margin-top:20px">${esc(t('caveats'))}</h3><ul>${o.caveats.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`;
}
/* The assessment writes itself: the built-in one shows at once, and an AI one replaces it when it arrives. */
const aiPending = {};
async function runAI(s = S.active) {
  const key = S.key, lvl = LEVEL, tag = `${s}|${key}|${lvl}`;
  if (aiPending[tag] || !S.results[s]) return;
  aiPending[tag] = true;
  let o = null;
  try { o = await ENG.assess(S.results[s], { ...ctxFor(s), audience: lvl, ask: p => askClaude(p, { tier: 'complex' }) }); } catch (e) { o = null; }
  delete aiPending[tag];
  if (!o || key !== S.key || lvl !== LEVEL) return;
  S.ai[s] = { o, by: o.source === 'claude' ? 'byClaude' : 'claudeUnavailable' };
  if (S.active === s) renderAI();
}
function renderAI() {
  const s = S.active, got = S.ai[s];
  if (got) { renderAIObj(got.o, t(got.by)); return; }
  renderAIObj(ENG.ruleBasedAssessment(S.res, S.ctx), t('ruleBased'));
  if (claudeAvailable()) { $('ai').insertAdjacentHTML('afterbegin', `<p class="small mute"><span class="spin"></span> ${esc(t('claudeWriting'))}</p>`); runAI(s); }
}

/* ================= report ================= */
function report() {
  const C = S.combined, parts = SUBJECTS.filter(s => S.results[s] && S.on[s]);
  const head = C && parts.length > 1 ? `# Planetary analog report\n\nOverall likeness: ${pct(C.likeness)}${C.ci95 ? ` (95% CI ${pct(C.ci95[0])} to ${pct(C.ci95[1])})` : ''}. ${C.verdict}.\n\n| Subject | Likeness | Weight |\n|---|---|---|\n${C.parts.map(p => `| ${p.subject} | ${pct(p.likeness)} | ${pct(100 * p.share)} |`).join('\n')}\n\n---\n\n` : '';
  return head + parts.map(s => { const ctx = ctxFor(s); return ENG.toMarkdown(S.results[s], (S.ai[s] && S.ai[s].o) || ENG.ruleBasedAssessment(S.results[s], ctx), ctx); }).join('\n---\n\n');
}
$('copy').onclick = async () => { try { await navigator.clipboard.writeText(report()); $('copied').textContent = t('copied'); } catch (e) { $('copied').textContent = t('copyBlocked'); } };
async function saveFile(filename, data) {
  if (downloads) await downloads.save({ filename, data });
  else { const a = document.createElement('a'); a.href = URL.createObjectURL(data); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); }
}
$('dl').onclick = async () => {
  const filename = 'analog-report.md', data = new Blob([report()], { type: 'text/markdown' });
  try {
    await saveFile(filename, data);
    $('copied').textContent = t('saved');
  } catch (e) { $('copied').textContent = t('cancelled'); }
};

/* ================= examples ================= */
function loadExample(bad) {
  if (!EX) return;
  $('cbody').value = EX.shared.body; $('cname').value = EX.shared.cSite; $('ename').value = EX.shared.eSite;
  SUBJECTS.forEach(s => {
    const x = EX[s];
    setFile(s, 'c', bad ? mkFile(EX.bad[s].name, EX.bad[s].text) : mkFile(x.cName, x.c)); setFile(s, 'e', mkFile(x.eName, x.e));
    $('uc-' + s).value = 'auto'; $('ue-' + s).value = 'auto';
    $('cname2-' + s).value = !bad && x.cSite ? x.cSite : ''; $('ename2-' + s).value = x.eSite || '';
  });
}

/* ================= wiring and start ================= */
function buildLangPickers() {
  document.querySelectorAll('.langsel').forEach(sel => { sel.innerHTML = LANGS.map(([c, n]) => `<option value="${c}">${n}</option>`).join(''); sel.value = LANG; sel.onchange = () => setLang(sel.value); });
}
buildLangPickers(); buildTopics(); buildBlocks(); updateUnitPickers();
$('run').onclick = () => run();
$('ex1').onclick = () => { loadExample(false); run(); };
$('ex2').onclick = () => { loadExample(true); run(); };
$('uT').onchange = $('uZ').onchange = () => { if (S.active) showDetails(S.active, true); };
['cname', 'ename', 'cbody'].forEach(id => $(id).addEventListener('change', () => { if (analysisData()) { renderOverall(); if (S.active) showDetails(S.active, true); } }));
$('dl').classList.toggle('hidden', !!(window.claude && claude.use));
if (!EX) { $('ex1').classList.add('hidden'); $('ex2').classList.add('hidden'); $('exnote').classList.add('hidden'); }
applyLang();
/* Zero state: nothing runs when the visitor enters the lab. The example buttons and Analyze are the only things that start an analysis. */
clearResults();
/* What js/audience.js and js/briefing.js need from this file. They read results and never change them. */
window.LAB = { S, ENG, SUBJECTS, t, esc, pct, ctxFor, bodyName, applyLang, saveFile, report, analysis: analysisData, lang: () => LANG, showDetails };

/* On your own computer, server.py answers at api/health. When it has an API key, Claude features turn on by themselves. */
if (!(window.claude && claude.use) && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && !CONFIG.claudeEndpoint) {
  fetch('api/health').then(r => r.ok ? r.json() : null).then(j => {
    if (!j || !j.claude) return;
    CONFIG.claudeEndpoint = CONFIG.claudeEndpoint || 'api/claude';
    if (S.submitted && S.res && !S.ai[S.active]) renderAI();
  }).catch(() => { });
}
if (window.claude && claude.use) {
  claude.use('sample').then(x => { sample = x; if (S.submitted && S.res && !S.ai[S.active]) renderAI(); }).catch(() => { });
  claude.use('downloads').then(d => { downloads = d; if (d) $('dl').classList.remove('hidden'); }).catch(() => { });
}

/* ================= audience level and light/dark theme ================= */
function setLevel(l) {
  LEVEL = l; document.documentElement.dataset.level = l;
  S.ai = {};   // assessments are written for one level, so ask again for the new one
  applyLang();   // re-read every text, since the levels word things differently
  if (analysisData()) { renderOverall(); if (S.active && S.results[S.active]) showDetails(S.active, true); }
}
/* The audience bar (js/audience.js) picks the wording level: Kids use the kids wording, Students (13 to 18) the teens wording,
   Scientists the scientist wording, and Auto, Educators and Managers the standard student wording. */
const AUDIENCE_LEVEL = { auto: 'students', kids: 'kids', students: 'teens', educators: 'students', scientist: 'scientists', manager: 'students' };
window.addEventListener('lab:audience', () => { const l = AUDIENCE_LEVEL[document.body.dataset.audience] || 'students'; if (l !== LEVEL) setLevel(l); });
setLevel(LEVEL);
document.documentElement.dataset.font = 'source';

/* Citations window */
let citeReturn = null;
const closeCite = () => { $('cite').hidden = true; document.body.style.overflow = ''; if (citeReturn && citeReturn.focus) citeReturn.focus(); };
$('citeBtn').onclick = () => { citeReturn = document.activeElement; $('cite').hidden = false; document.body.style.overflow = 'hidden'; $('citeClose').focus(); };
$('citeClose').onclick = closeCite;
$('cite').addEventListener('click', e => { if (e.target === $('cite')) closeCite(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('cite').hidden) closeCite(); });

function setMode(m) { document.documentElement.dataset.mode = m; store.set('lab-mode', m); }
setMode(store.get('lab-mode') || (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'));
$('themeBtn').onclick = () => setMode(document.documentElement.dataset.mode === 'light' ? 'dark' : 'light');

/* ================= the data library ================= */
const LIB = window.LAB_LIBRARY || { files: {}, sets: [] };
let libFilter = 'all';
const canDownload = () => !!downloads || !(window.claude && claude.use);   // inside claude.ai only the downloads capability can save files

/* Each data file is a small script (data/<id>.js), so it loads on GitHub Pages, on claude.ai and from disk alike. */
function libFileLoad(id) {
  return new Promise((ok, no) => {
    if (window.LAB_FILES && LAB_FILES[id]) return ok(LAB_FILES[id]);
    const sc = document.createElement('script');
    sc.src = 'data/' + id + '.js';
    sc.onload = () => (window.LAB_FILES && LAB_FILES[id]) ? ok(LAB_FILES[id]) : no(new Error('data/' + id + '.js is empty'));
    sc.onerror = () => no(new Error('Could not load data/' + id + '.js. Keep the data folder next to index.html.'));
    document.head.appendChild(sc);
  });
}
function libAsFile(rec) {
  if (rec.b64) { const bin = atob(rec.b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new File([u], rec.name, { type: rec.mime }); }
  return new File([rec.text], rec.name, { type: rec.mime });
}
const worldName = w => w === 'earth' ? t('earthData') : t('b_' + w);
const fileLine = (f, r) => `<div class="lfile ${r}"><i></i><b>${esc(worldName(f.world))}</b>&nbsp;${esc(f.site)}<span>· ${esc(f.format)} ${esc(f.kind === 'image' ? t('lib_map') : t('lib_table'))}</span></div>`;

function renderLibrary() {
  if (!LIB.sets.length) { $('libsec').classList.add('hidden'); return; }
  const cats = ['all', ...SUBJECTS, 'tests'];
  $('libfilters').innerHTML = cats.map(c => `<button type="button" data-f="${c}" aria-pressed="${c === libFilter}">${esc(c === 'all' ? t('lib_all') : c === 'tests' ? t('lib_tests') : t('s_' + c))}</button>`).join('');
  $('libfilters').querySelectorAll('button').forEach(b => b.onclick = () => { libFilter = b.dataset.f; renderLibrary(); });
  const isTest = x => x.kind === 'test' || x.kind === 'error';
  const shown = LIB.sets.filter(x => libFilter === 'all' ? true : libFilter === 'tests' ? isTest(x) : x.subject === libFilter && !isTest(x));
  $('libgrid').innerHTML = shown.map(x => `<article class="lcard">
    <div class="ltop"><span class="lkind ${x.kind}">${esc(t('lk_' + x.kind))}</span><span class="lscore lv-s">${x.score != null ? esc(t('lib_expected', { p: pct(x.score) })) : ''}</span></div>
    <h3>${esc(x.title)}</h3>
    <p>${esc(x.blurb)}</p>
    <div class="lfiles">${fileLine(LIB.files[x.c], 'c')}${fileLine(LIB.files[x.e], 'e')}</div>
    <div class="lbtns"><button type="button" class="go" data-load="${x.id}">${esc(t('lib_load'))}</button><button type="button" data-pv="${x.id}">${esc(t('lib_preview'))}</button></div>
  </article>`).join('');
  $('libgrid').querySelectorAll('[data-load]').forEach(b => b.onclick = () => loadSet(b.dataset.load));
  $('libgrid').querySelectorAll('[data-pv]').forEach(b => b.onclick = () => previewSet(b.dataset.pv, b));
}
window.labRenderLibrary = renderLibrary;

/* Fill the lab with a set (topic, places, files, map keys, corrections) and run it. */
async function loadSet(id) {
  const x = LIB.sets.find(z => z.id === id); if (!x) return;
  if (window.labShowLab) window.labShowLab();
  const fc = LIB.files[x.c], fe = LIB.files[x.e], s = x.subject;
  $('runerr').innerHTML = ''; setStatus(t('lib_loading'), true);
  let rc, re;
  try { [rc, re] = await Promise.all([libFileLoad(x.c), libFileLoad(x.e)]); }
  catch (err) { setStatus(''); showMsg($('runerr'), 'err', t('lib_failed'), '', esc(err.message)); return; }
  SUBJECTS.forEach(k => { const on = k === s, box = $('on-' + k); if (box.checked !== on) { box.checked = on; box.onchange({ target: box }); } });
  $('cbody').value = x.body; $('cname').value = fc.site; $('ename').value = fe.site;
  $('cname2-' + s).value = ''; $('ename2-' + s).value = '';
  [['c', fc, rc], ['e', fe, re]].forEach(([r, f, rec]) => {
    setFile(s, r, libAsFile(rec));
    $(`u${r}-${s}`).value = f.key ? f.key.units : 'auto';
    if (f.key && $(`k${r}-${s}`)) {
      $(`k${r}-${s}`).value = f.key.map; $(`k${r}min-${s}`).value = f.key.min; $(`k${r}max-${s}`).value = f.key.max;
      if (f.key.px && $(`p${r}-${s}`)) $(`p${r}-${s}`).value = f.key.px;
    }
  });
  if (s === 'temperature') {
    $('elev-temperature').checked = !!x.elev;
    if (x.elev) { $('ez0-temperature').value = x.elev[0]; $('ez1-temperature').value = x.elev[1]; $('elr-temperature').value = x.elev[2]; }
  }
  setStatus('');
  await run(false);
}

/* ---------- preview window ---------- */
let pvReturn = null;
function openPv(from) { pvReturn = from || document.activeElement; $('pv').hidden = false; document.body.style.overflow = 'hidden'; $('pvClose').focus(); }
function closePv() { $('pv').hidden = true; document.body.style.overflow = ''; if (pvReturn && pvReturn.focus) pvReturn.focus(); }
$('pvClose').onclick = closePv;
$('pv').addEventListener('click', e => { if (e.target === $('pv')) closePv(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('pv').hidden) closePv(); });

function tablePreview(rec) {
  if (/json/.test(rec.mime)) return `<pre class="scroll small">${esc(rec.text.slice(0, 900))}…</pre>`;
  const lines = rec.text.split(/\r?\n/).filter(l => l.trim() && !/^\s*#/.test(l));
  const d = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const rows = lines.slice(0, 9).map(l => l.split(d));
  return `<div class="scroll"><table><thead><tr>${rows[0].map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="small mute">${esc((lines.length - 1).toLocaleString())} rows</p>`;
}
async function previewSet(id, from) {
  const x = LIB.sets.find(z => z.id === id); if (!x) return;
  $('pvTitle').textContent = x.title; $('pvBody').innerHTML = '<p><span class="spin"></span></p>'; openPv(from);
  let recs;
  try { recs = await Promise.all([libFileLoad(x.c), libFileLoad(x.e)]); }
  catch (err) { $('pvBody').innerHTML = `<p class="msg err">${esc(err.message)}</p>`; return; }
  $('pvBody').innerHTML = `<p>${esc(x.blurb)}</p>` + [[x.c, recs[0]], [x.e, recs[1]]].map(([fid, rec]) => { const f = LIB.files[fid]; return `<section style="margin-top:18px">
    <h3>${esc(worldName(f.world))} · ${esc(f.site)}</h3>
    <p class="pv-meta">${esc(f.name)} · ${esc(f.source)}. ${esc(f.note)}</p>
    ${rec.b64 ? `<img alt="${esc(f.name)}" src="data:${rec.mime};base64,${rec.b64}">` : tablePreview(rec)}
    ${canDownload() ? `<p><button type="button" data-dl="${fid}">${esc(t('lib_download'))} ${esc(f.name)}</button></p>` : ''}
  </section>`; }).join('') + `<div class="actions"><button type="button" class="go" id="pvLoad">${esc(t('lib_load'))}</button></div>`;
  $('pvBody').querySelectorAll('[data-dl]').forEach(b => b.onclick = () => libDownload(b.dataset.dl));
  $('pvLoad').onclick = () => { closePv(); loadSet(id); };
}
async function libDownload(fid) {
  const file = libAsFile(await libFileLoad(fid));
  try {
    if (downloads) await downloads.save({ filename: file.name, data: file });
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); }
  } catch (e) { /* the person cancelled */ }
}
renderLibrary();

/* ================= Marvin-AI: the statistics helper chat =================
 * Marvin-AI is built in and runs entirely in this page. It answers from the lab's own explanations, the numbers on screen and the
 * data library, with no Claude, no API key, no server and no network call. Marvin never curses, and answers anything off topic or
 * inappropriate with t('helper_refuse').
 */
/* ---------- no cursing: checked on what people type and on every reply ---------- */
const PROFANITY = /\b(f+u+c+k\w*|f+[*@#]+k\w*|wtf|stfu|fml|motherf\w*|sh[i1]+t\w*|bullsh\w*|b[i1]tch\w*|bastard\w*|a+ss+h[o0]le\w*|dumbass\w*|jackass\w*|asshat\w*|damn\w*|goddam\w*|crap\w*|hell|piss\w*|d[i1]ck(s|head\w*)?|c[o0]cks?|cunt\w*|tw[a@]t\w*|wh[o0]re\w*|slut\w*|pricks?|bollocks|wank\w*)\b/i;
const hasProfanity = x => PROFANITY.test(String(x).normalize('NFKC'));
const cleanReply = x => String(x).replace(new RegExp(PROFANITY.source, 'gi'), m => m[0] + '*'.repeat(Math.max(2, m.length - 1)));
const REFUSE = '[[REFUSE]]';

/* ---------- what Marvin-AI can see ---------- */
const helperHistory = [];
const HELPER_MAX_TURNS = 12;
const round1 = x => x == null || !isFinite(x) ? null : Math.round(x * 10) / 10;

function helperContext() {
  const subs = SUBJECTS.filter(s => S.on[s]);
  const W = subs.reduce((a, s) => a + (+S.w[s] || 0), 0);
  return {
    language: (LANGS.find(l => l[0] === LANG) || [])[2] || 'English',
    body: $('cbody').value,
    celestialSite: $('cname').value.trim() || null,
    earthSite: $('ename').value.trim() || null,
    subjectsChosen: subs.map(s => ({
      subject: s, importance: +S.w[s] || 0, share_percent: W ? Math.round(100 * (+S.w[s] || 0) / W) : 0,
      celestialFile: (S.files[s].c && S.files[s].c.name) || null, earthFile: (S.files[s].e && S.files[s].e.name) || null,
      ...(s === 'temperature' && $('elev-temperature') ? { elevationCorrection: $('elev-temperature').checked } : {}),
    })),
    overall: analysisData() ? {
      likeness_percent: round1(S.combined.likeness), ci95: S.combined.ci95 && S.combined.ci95.map(round1),
      parts: S.combined.parts.map(p => ({ subject: p.subject, likeness_percent: round1(p.likeness), share_percent: Math.round(100 * p.share) })),
    } : null,
    results: S.submitted ? Object.fromEntries(Object.entries(S.results).map(([s, r]) => [s, ENG.assessmentPayload(r, ctxFor(s))])) : {},
    subjectOnScreen: S.active,
    audience: LEVEL,
    library: LIB.sets.map(x => ({ id: x.id, title: x.title, subject: x.subject, kind: x.kind, expected_percent: x.score })),
    messagesOnPage: [...document.querySelectorAll('#blocks .msg, #runerr .msg')].map(m => m.innerText.trim()).slice(0, 6),
  };
}

/* ---------- built-in mode: answers from the page's own results, no AI needed (English) ---------- */
const SUBJ_WORDS = {
  temperature: /\b(temp\w*|hot|cold|heat|warm\w*|cool\w*|thermal|degrees?|kelvin|celsius|fahrenheit|day ?time|night\w*|season\w*)\b/i,
  topography: /\b(topograph\w*|terrain|elevation\w*|height\w*|slopes?|relief|hypsometr\w*|land ?shape|mountains?|craters?|altitude)\b/i,
  composition: /\b(composition|chemi\w*|rocks?|minerals?|oxides?|soils?|basalt\w*|granit\w*|sio2|feo\w*|mgo|aitchison|bray)\b/i,
};
const ON_TOPIC = /\b(score\w*|percent\w*|likeness|similar\w*|alike|match\w*|analog\w*|analogue\w*|result\w*|overall|total|average|weight\w*|sliders?|importance|uncertain\w*|confiden\w*|interval|range|bootstrap\w*|verdict|strong|weak|poor|limited|partial|experiment\w*|tests?|statistic\w*|stats|p-?value|welch|cohen\w*|kolmogorov|ks|wasserstein|overlap|density|kde|mean|median|variance|deviation|files?|uploads?|csv|tsv|json|data\w*|maps?|images?|legend|colou?r\w*|units?|headers?|columns?|keys?|errors?|e-[a-z]+|wrong|broken|fix\w*|mars|martian|moon|lunar|mercury|europa|titan|earth|planet\w*|nasa|pds|modis|tes|mola|aster|apxs|chemcam|power|earthdata|gale|atacama|hawaii|site|lab|marvin|accura\w*|trust\w*|reliab\w*|low|high|numbers?|mean(s|ing)?|\d{1,3}(\.\d)?)\b|%/i;
const SCIENCE = /\b(scien\w*|physic\w*|chemi\w*|biolog\w*|geolog\w*|astronom\w*|astrophys\w*|cosmo\w*|space|stars?|sun|solar|galax\w*|black holes?|universe|big bang|gravit\w*|orbit\w*|atoms?|molecul\w*|electron\w*|protons?|neutrons?|quantum|energy|forces?|light|waves?|magnet\w*|electric\w*|radiation|nuclear|cells?|dna|genes?|genetic\w*|evolution|species|bacteri\w*|virus\w*|photosynth\w*|ecosystem\w*|climate|weather|atmospher\w*|volcan\w*|earthquake\w*|tectonic\w*|oceans?|water|ice|fossil\w*|dinosaur\w*|math\w*|equations?|probabilit\w*|hypothes\w*|theory|elements?|periodic|reactions?|acids?|pressure|relativity|telescopes?|rovers?|satellites?|nasa|asteroids?|comets?|meteor\w*|moons?|planets?|mars|venus|jupiter|saturn|uranus|neptune|pluto|mercury|europa|titan|enceladus|aliens?|life|sky|skies|rainbows?|colou?rs?|sounds?|wind|clouds?|rain|snow|storms?|lightning|tornado\w*|hurricane\w*|tides?|seasons?|eclipse\w*|plants?|trees?|animals?|insects?|brains?|blood|bones?|body|organs?|immun\w*|vaccin\w*|medicin\w*|diseases?|food chain|metals?|crystals?|gas(es)?|liquids?|solids?|plasma|fire|boil\w*|freez\w*|melt\w*|sound barrier|speed|velocity|accelerat\w*|mass|weight|density|friction|inertia|momentum|newton\w*|einstein\w*|darwin\w*|carbon|oxygen|hydrogen|nitrogen|helium|ozone|greenhouse|fusion|fission|lasers?|microscop\w*|robots?|rockets?|astronauts?|spacecraft|iss)\b/i;
const RESULT_Q = /\b(scores?|percent\w*|results?|likeness|similar\w*|alike|analog\w*|my|files?|upload\w*|data\w*|sliders?|weights?|errors?|e-[a-z]+|uncertain\w*|range|maps?|legend|experiments?|overall|total|this|that|it|lab|marvin)\b|%|\d/i;
const SCIENCE_NEEDS_AI = "Good science question! I don't have that one built in. I can help with your results, the statistics behind them, file errors, the planets and moons in the lab, and which library datasets to try.";
const GLOSSARY = [
  [/\b(ks|kolmogorov)/i, "The Kolmogorov-Smirnov D is the biggest gap between the two sets of values when you line each one up from lowest to highest. A D of 0 means they're identical. A D of 1 means they don't overlap at all."],
  [/wasserstein/i, "The Wasserstein distance tells you how far one set of values would have to slide to match the other, in the data's own units. Think of it as moving a pile of sand into the shape of another pile. Smaller means more alike."],
  [/p-?value|welch|t-?test/i, "The Welch t-test checks whether the two averages really differ. With thousands of readings the p-value is almost always tiny, so it isn't very useful here. Look at the size of the gap and the overlap instead."],
  [/cohen/i, "Cohen's d is the gap between the two averages measured in standard deviations. Around 0.2 is small, 0.5 is medium and 0.8 or more is large."],
  [/aitchison/i, "Aitchison similarity compares rock chemistry using ratios between the oxides instead of the raw percentages. That's the standard way to compare numbers that have to add up to 100."],
  [/bray/i, "Bray-Curtis similarity compares the average amount of each oxide or mineral. It's 100% when the two average compositions are identical."],
  [/hypsometr/i, "A hypsometric curve shows how much of the area sits at each height, from the lowest point to the highest. Two places with matching curves have land spread across their heights in the same way."],
  [/overlap|density|kde/i, "Overlap is how much two sets of values share. The lab smooths each set into a curve and measures the area the two curves have in common. 100% means identical and 0% means they never meet."],
  [/bootstrap/i, "Bootstrapping means redrawing your data at random many times and working out the score again each time. The spread of those scores shows how much the result depends on which readings happened to be in your file."],
];

/* Common science questions Marvin-AI can answer on its own, with no AI connected (English). */
const SCIENCE_FAQ = [
  [/\bsky\b.*\bblue\b|\bblue\b.*\bsky\b/i, "Sunlight has every color in it. Air molecules scatter short blue waves much more than red ones, so blue light bounces around the sky and reaches your eyes from every direction. On Mars the thin, dusty air makes the daytime sky butterscotch and the sunsets blue."],
  [/\bmars\b.*\bred\b|\bred planet\b|\bwhy is mars (red|orange)/i, "Mars is red because its dust is full of iron oxide, which is basically rust. Fine dust coats the ground and floats in the air, so the whole planet looks reddish orange."],
  [/\bhow cold\b.*\bmars\b|\bmars\b.*\b(temperature|how cold|how hot)\b|\btemperature on mars\b/i, "Mars averages about −60 °C. At the equator on a summer afternoon the ground can reach about 20 °C, but nights drop to −70 °C or lower, and the poles can fall to about −125 °C. The thin air can't hold heat, so it swings hugely between day and night."],
  [/\bmars\b.*\bnights?\b.*\bcold|\bwhy\b.*\bcold\b.*\bnight\b.*\bmars\b/i, "Mars's air is about 100 times thinner than Earth's, so it holds very little heat. Once the Sun sets, the ground radiates its warmth straight to space, and temperatures can drop by 80 °C or more before dawn."],
  [/\bmars\b.*\b(atmosphere|air)\b|\b(atmosphere|air)\b.*\bmars\b/i, "Mars's atmosphere is about 95% carbon dioxide, with some nitrogen and argon. The pressure at the surface is under 1% of Earth's, so you'd need a pressure suit, not just an oxygen mask."],
  [/\bwater\b.*\bmars\b|\bmars\b.*\b(water|ice|lakes?|rivers?|oceans?)\b/i, "Mars has lots of water ice at its poles and frozen underground. Long ago liquid water flowed there too: Jezero crater, where Perseverance landed, was once a lake with a river delta. Today the air is too thin for liquid water to last on the surface."],
  [/\blife\b.*\bmars\b|\bmars\b.*\blife\b|\baliens?\b/i, "No life has been found on Mars so far. Rovers look for chemical and rock signs that life could have left behind, and Perseverance is collecting samples that a future mission may bring back to Earth for testing."],
  [/\b(how big|size)\b.*\bmars\b|\bmars\b.*\b(how big|size|diameter)\b/i, "Mars is about half as wide as Earth: 6,779 km across against Earth's 12,742 km. Its gravity is only 38% of ours, so you'd weigh a bit over a third as much there."],
  [/\b(how far|distance)\b.*\bmars\b|\bmars\b.*\b(how far|distance)\b/i, "Mars is between about 55 million and 400 million km from Earth, depending on where both planets are in their orbits. Radio signals take between 3 and 22 minutes to cross that gap, so rovers can't be driven live."],
  [/\bseasons?\b.*\bmars\b|\bmars\b.*\bseasons?\b|\bmars year\b|\blong is a year on mars/i, "Mars has seasons because it's tilted about 25°, similar to Earth's 23.4°. A Mars year lasts 687 Earth days, and its orbit is more oval than ours, so southern summers are shorter and hotter than northern ones."],
  [/\b(why|how) do we have seasons\b|\bseasons\b.*\bearth\b|\bwhat causes (the )?seasons\b/i, "Earth's seasons come from its 23.4° tilt, not its distance from the Sun. When your half of the planet leans toward the Sun, sunlight hits more directly and days are longer, so it's summer."],
  [/\bolympus mons\b/i, "Olympus Mons on Mars is the biggest volcano known in the solar system. It rises about 22 km above the plains around it, roughly two and a half times the height of Everest above sea level, and it's about as wide as France."],
  [/\bjezero\b/i, "Jezero crater on Mars is 45 km wide and once held a lake fed by a river. The delta that river left is a great place to look for signs of ancient life, which is why NASA's Perseverance rover landed there in 2021."],
  [/\bgale crater\b|\bmount sharp\b/i, "Gale crater is a 154 km wide crater near Mars's equator with a 5 km tall mountain, Mount Sharp, in the middle. Curiosity has been climbing its rock layers since 2012, reading billions of years of Martian history."],
  [/\b(analog|analogue) (site|sites)\b|\bwhat is an analog\b|\bwhat'?s an analog\b/i, "An analog site is a place on Earth that's like another world in some useful way. Scientists use them to test rovers, tools and ideas before a mission. The Atacama is as dry as Mars soil, Devon Island has a crater in polar desert, and Hawaiian lava is close to Martian basalt."],
  [/\bblack holes?\b/i, "A black hole forms when the core of a very massive star collapses at the end of its life. So much mass gets packed into such a small space that its gravity won't even let light escape."],
  [/\brockets?\b.*\bwork|\bhow do rockets\b/i, "Rockets work by pushing hot gas out of the back very fast. Newton's third law says every push has an equal push back, so the gas shoves the rocket forward. That works in space too, since the rocket isn't pushing against air."],
  [/\bgravity\b/i, "Gravity is the pull between anything that has mass. The more mass, the stronger the pull, which is why the Sun holds the planets in orbit. On Mars gravity is 38% of Earth's, and on the Moon it's about 17%."],
  [/\bphotosynthesis\b/i, "Photosynthesis is how plants make food. They use sunlight to turn carbon dioxide from the air and water from the soil into sugar, and they release oxygen as a by-product."],
  [/\bvaccines?\b/i, "A vaccine trains your immune system using a harmless piece or copy of a germ. Your body learns to recognise it, so if the real germ shows up later, it can fight it off much faster."],
  [/\bwhat is a planet\b|\bdefinition of a planet\b/i, "Astronomers call something a planet if it orbits the Sun, is big enough for gravity to pull it round, and has cleared its orbit of other large objects. That's why Pluto became a dwarf planet in 2006."],
  [/\bpluto\b/i, "Pluto has been called a dwarf planet since 2006. It's round and orbits the Sun, but it shares its region with many other icy bodies in the Kuiper belt. New Horizons flew past it in 2015 and found mountains of water ice and plains of frozen nitrogen."],
  [/\bmoon\b.*\bphases?\b|\bphases\b.*\bmoon\b/i, "The Moon's phases come from the angle we see it at. Half of the Moon is always lit by the Sun, and as it orbits us over about 29.5 days we see more or less of that lit half."],
  [/\btides?\b/i, "Tides happen because the Moon's gravity pulls on Earth's oceans, making them bulge on the side facing the Moon and on the opposite side. Earth spins through those bulges, so most coasts get two high tides a day."],
  [/\bstars?\b.*\btwinkle\b|\btwinkle\b/i, "Stars twinkle because their light passes through moving layers of air that bend it slightly differently from moment to moment. Planets twinkle less because they show up as tiny discs, not points."],
  [/\bwhat is the sun\b|\bhow does the sun\b|\bsun\b.*\b(made|work|shine|energy)\b/i, "The Sun is a star about 4.6 billion years old. In its core, hydrogen fuses into helium at about 15 million °C, and that releases the energy we see as sunlight."],
  [/\blight ?years?\b/i, "A light year is a distance, not a time. It's how far light travels in one year, about 9.46 trillion km. The nearest star after the Sun is about 4.2 light years away."],
  [/\bspeed of light\b|\bhow fast (is|does) light\b/i, "Light travels at about 300,000 km per second in empty space. It takes about 8 minutes 20 seconds to reach us from the Sun."],
  [/\bhow old\b.*\buniverse\b|\bbig bang\b/i, "The universe is about 13.8 billion years old. It began very hot and dense in the Big Bang and has been expanding and cooling ever since. Earth formed much later, about 4.5 billion years ago."],
  [/\beuropa\b/i, "Europa, a moon of Jupiter, has an icy shell over a salty ocean that may hold more water than all of Earth's oceans. That makes it one of the best places to look for life beyond Earth. NASA's Europa Clipper is on its way to study it."],
  [/\btitan\b/i, "Titan, Saturn's largest moon, has a thick nitrogen atmosphere and lakes of liquid methane and ethane. It's about −180 °C at the surface. NASA's Dragonfly helicopter is planned to fly there in the 2030s."],
  [/\bjupiter\b/i, "Jupiter is the biggest planet, more than 11 times wider than Earth. It's a gas giant with no solid surface, and its Great Red Spot is a storm wider than Earth that has lasted for centuries."],
  [/\bsaturn\b.*\brings?\b|\brings\b.*\bsaturn\b|\bsaturn\b/i, "Saturn's rings are made of countless chunks of water ice, from dust grains to pieces as big as houses. They're about 280,000 km across but mostly less than a kilometer thick."],
  [/\bvenus\b|\bhottest planet\b/i, "Venus is the hottest planet, about 465 °C at the surface, even though Mercury is closer to the Sun. Its thick carbon dioxide atmosphere traps heat in a runaway greenhouse effect."],
  [/\bgreenhouse\b/i, "The greenhouse effect is when gases like carbon dioxide and water vapor let sunlight in but trap some of the heat trying to escape. It keeps Earth livable. Too much of it, as on Venus, makes a planet far hotter."],
  [/\bvolcano(es)?\b|\blava\b|\bmagma\b/i, "A volcano forms where melted rock, called magma, rises through the crust and erupts as lava, ash and gas. Mars has the biggest volcanoes in the solar system because it has no moving plates, so lava piled up in the same spot for ages."],
  [/\bearthquakes?\b|\bmarsquakes?\b/i, "Earthquakes happen when stress builds up where pieces of the crust meet and then suddenly slips. Mars has quakes too: NASA's InSight lander recorded over 1,300 marsquakes and used them to map the planet's insides."],
  [/\bclimate\b.*\bweather\b|\bweather\b.*\bclimate\b/i, "Weather is what the air is doing today: rain, wind, temperature. Climate is the average pattern of weather over 30 years or more. Climate is what you expect, weather is what you get."],
  [/\bdna\b/i, "DNA is the molecule that carries the instructions for building and running living things. It's a long twisted ladder whose rungs are four chemical letters, and the order of those letters spells out genes."],
  [/\bboil\b.*\b(mars|altitude|mountain)\b|\b(mars|altitude|mountain)\b.*\bboil/i, "Water boils at a lower temperature when air pressure is lower. At the top of Everest it boils near 70 °C. On Mars the pressure is so low that liquid water would quickly boil or freeze."],
  [/\bkelvin\b|\babsolute zero\b/i, "Kelvin is a temperature scale that starts at absolute zero, the coldest anything can get. 0 K is −273.15 °C, and a change of 1 K is the same as a change of 1 °C, so 273 K is about 0 °C."],
  [/\bhow does (tes|the thermal emission)|\bthermal emission spectrometer\b|\binfrared\b.*\btemperature\b/i, "Warm things glow in infrared light, and the warmer they are, the more they glow. Instruments like TES on Mars Global Surveyor and MODIS on Earth satellites measure that glow from orbit to work out the surface temperature."],
  [/\bmola\b|\blaser altimeter\b/i, "MOLA, the Mars Orbiter Laser Altimeter, fired laser pulses at Mars and timed how long they took to bounce back. That gave the height of the ground to within about a meter, and it made the topography maps this lab uses."],
  [/\bapxs\b|\balpha particle x-?ray\b/i, "APXS, the Alpha Particle X-ray Spectrometer on Curiosity's arm, bombards a rock with radiation and reads the X-rays that come back. Each element gives off its own X-ray energies, so it can tell what the rock is made of."],
];
const ERROR_HELP = {
  'E-NOKEY': "E-NOKEY means the file has no header row, so the lab can't tell which column is which. Add a first row with column names and units, like T_surface (K).",
  'E-NOUNITS': "E-NOUNITS means a column has no units. Add them to the header in brackets, for example elevation (m), T_surface (K) or SiO2 (wt%).",
  'E-NOTEMP': "E-NOTEMP means no temperature column was found. Name it something like T_surface (K) or temperature (C).",
  'E-NOELEV': "E-NOELEV means no elevation column was found. Name it something like elevation (m) or height (km).",
  'E-NOCOMP': "E-NOCOMP means no oxide or mineral columns were found. Use headers like SiO2 (wt%) or FeOT (wt%).",
  'E-NOSHARED': "E-NOSHARED means the two composition files share fewer than two oxides or minerals, so there's nothing to compare. Use the same components in both.",
  'E-SUBJECT': "E-SUBJECT means the file looks like a different topic than the one it was dropped into. Check you put each file in the right box.",
  'E-FORMAT': "E-FORMAT means the file type isn't supported. Use CSV, TSV, TXT, JSON or a PNG or JPG map.",
  'E-KEYMISMATCH': "E-KEYMISMATCH means the map's colors don't match the color scale you picked. Check the legend type and its minimum and maximum.",
  'E-EMPTY': "E-EMPTY means the file has a header but no data rows.",
  'E-FEW': "E-FEW means fewer than 3 usable values were left after removing blanks and fill values.",
};
const P = x => x == null || !isFinite(x) ? 'n/a' : Math.round(x) + '%';
const SNAME = { temperature: 'Temperature', topography: 'Topography', composition: 'Surface composition' };
const cel = () => $('cname').value.trim() || 'the target site', earth = () => $('ename').value.trim() || 'the Earth site';
const cToStr = k => (k - 273.15).toFixed(1) + ' °C';


/* Pick library sets to suggest: ones for this topic first, the strongest analogs and starters before tests. */
function suggestSets(subject, n = 3) {
  const rank = { starter: 0, analog: 1, demo: 2, maps: 3, control: 4, test: 5, error: 6 };
  const loaded = new Set(Object.values(S.files).flatMap(f => [f.c && f.c.name, f.e && f.e.name]));
  return LIB.sets.filter(x => (!subject || x.subject === subject) && x.kind !== 'error' && !(loaded.has(LIB.files[x.c].name) && loaded.has(LIB.files[x.e].name)))
    .sort((a, b) => rank[a.kind] - rank[b.kind] || (b.score || 0) - (a.score || 0)).slice(0, n).map(x => `[[SET:${x.id}]]`).join('\n');
}
function explainSubject(s) {
  const r = S.results[s];
  if (!r) return `There's no ${SNAME[s].toLowerCase()} result yet. Switch that topic on, add a file for each place and press Compare.`;
  if (LEVEL === 'kids') {
    let k = `For ${SNAME[s].toLowerCase()}, the two places are ${P(r.likeness)} alike. `;
    if (s === 'temperature' && r.celestial && r.earth) { const a = r.celestial.stats.mean - 273.15, b = r.earth.stats.mean - 273.15; k += `${cel()} is about ${Math.round(a)} °C and ${earth()} is about ${Math.round(b)} °C, so ${a < b ? earth() + ' is warmer' : cel() + ' is warmer'}.`; }
    else if (s === 'topography') k += `That's about how similar the hills, valleys and slopes are.`;
    else k += `That's about how similar the rocks and soil are made.`;
    return k;
  }
  const comp = r.components || [], lo = [...comp].sort((a, b) => a.percent - b.percent)[0], hi = [...comp].sort((a, b) => b.percent - a.percent)[0];
  let out = `${SNAME[s]} came out at ${P(r.likeness)}, which counts as "${r.verdict}". That number is the average of ${comp.length} part${comp.length === 1 ? '' : 's'}: ${comp.map(c => `${c.name.toLowerCase()} at ${P(c.percent)}`).join(', ')}.`;
  if (comp.length > 1 && lo && hi && hi.percent - lo.percent > 15) out += ` The weakest part is ${lo.name.toLowerCase()} and the strongest is ${hi.name.toLowerCase()}.`;
  if (s === 'temperature' && r.celestial && r.earth) {
    const a = r.celestial.stats.mean, b = r.earth.stats.mean;
    out += ` On average ${cel()} sits at ${cToStr(a)} and ${earth()} at ${cToStr(b)}, a gap of ${Math.abs(a - b).toFixed(1)} °C.`;
    if (!r.daily) out += " These files don't say what time of day or season each reading is from, so the score only compares the temperatures themselves.";
  }
  if (s === 'topography' && r.celestial && r.earth) out += ` The relief, meaning the spread between low and high ground, is ${Math.round(r.celestial.relief_m)} m at ${cel()} and ${Math.round(r.earth.relief_m)} m at ${earth()}.`;
  if (s === 'composition' && r.table && r.table.length) {
    const big = [...r.table].sort((x, y) => Math.abs(y.difference) - Math.abs(x.difference))[0];
    out += ` The biggest difference is in ${big.component}: ${big.celestialNormalized.toFixed(1)} at ${cel()} against ${big.earthNormalized.toFixed(1)} at ${earth()}.`;
  }
  return out;
}

function explainOverall() {
  const C = analysisData();
  if (!C || C.likeness == null) return "There are no results yet. Pick your topics, drop a file for each place in every topic you switched on, then press Compare. You can also press Load example to try it.";
  const parts = C.parts.map(p => `${SNAME[p.subject].toLowerCase()} ${P(p.likeness)} (${p.share > 0 ? Math.round(100 * p.share) + '% of the total' : 'not counted'})`);
  if (C.parts.length === 1) return explainSubject(C.parts[0].subject);
  if (LEVEL === 'kids') { const best = [...C.parts].sort((a, b) => b.likeness - a.likeness)[0], worst = [...C.parts].sort((a, b) => a.likeness - b.likeness)[0]; return `Your two places are ${P(C.likeness)} alike overall! They match best on ${SNAME[best.subject].toLowerCase()} (${P(best.likeness)}) and least on ${SNAME[worst.subject].toLowerCase()} (${P(worst.likeness)}).`; }
  return `Your overall score is ${P(C.likeness)}. It's a weighted average of ${parts.join(', ')}. The sliders decide the shares, so moving one changes the total right away without redoing the comparison.`;
}

function offlineAnswer(q) {
  const text = q.trim();
  if (hasProfanity(text)) return REFUSE;
  if (/^(hi|hello|hey|yo|hiya|good (morning|afternoon|evening))\b[\s!.?]*$/i.test(text)) return t('helper_hello');
  if (/^(thanks?|thank you|thx|ty|cheers|great|cool|nice|ok(ay)?|got it)\b[\s\w!.?]{0,20}$/i.test(text)) return "You're welcome! Ask me anything else about your results.";
  if (/\b(who|what) are you\b|\byour name\b/i.test(text)) return "I'm Marvin-AI, the helper for this lab. I can explain your scores, the statistics behind them and any file errors.";
  const subj = SUBJECTS.find(s => SUBJ_WORDS[s].test(text));
  const aboutResults = RESULT_Q.test(text) || GLOSSARY.some(([re]) => re.test(text));
  const mine = /\b(my|our|this|these|the) (score|result|comparison|data|files?|numbers?)\b|%|\bwhy (is|did) (my|it)\b|\b(scores?|likeness|percent\w*|results?|compar\w*|total|overall|sliders?)\b/i.test(text);
  const faq = !mine && SCIENCE_FAQ.find(([re]) => re.test(text));
  if (faq) return faq[1];
  if (/\b(data ?sets?|library|examples?|sample data|more data|other (places|sites)|what (else )?(can|should|could) i compare|give me (some )?data|show me (some )?data)\b/i.test(text))
    return t('helper_sets') + '\n' + suggestSets(subj || null, subj ? 3 : 4);
  if (!subj && /\b(audience|modes?|kids?|children|educators?|teachers?|classroom|worksheets?|managers?|investment|invest|dark mode|bright mode|light mode|theme|fonts?|languages?)\b/i.test(text))
    return "The bar at the top has everything: pick who you are (Kids, Students, Educators, Scientists or Managers) and the wording and extra panels change, while the comparison tool stays the same. The sun and moon button switches Bright and Dark, and the language menu translates the page.";
  if (!subj && !aboutResults && SCIENCE.test(text)) return SCIENCE_NEEDS_AI;   // a general science question: fine, but it needs an AI
  if (!subj && !ON_TOPIC.test(text)) return REFUSE;
  if (/accura|trust|reliab|official|scientist|real(ly)? (right|correct)|is (it|this) (right|correct)/i.test(text))
    return "The percent is this lab's own summary, not a number scientists use. Researchers judge an analog by whether it reproduces the exact process they want to study. So use the score to compare places, and the details to see why they match or don't." + (S.combined && S.combined.likeness != null ? ` Right now your overall score is ${P(S.combined.likeness)}.` : '');
  const codes = [...new Set((text.match(/E-[A-Z]+/gi) || []).map(c => c.toUpperCase()))];
  if (codes.length || /\b(errors?|broken|won'?t (load|work)|not working|wrong file|fix)\b/i.test(text)) {
    const seen = codes.length ? codes : [...new Set([...document.querySelectorAll('#blocks .msg, #runerr .msg')].flatMap(m => m.innerText.match(/E-[A-Z]+/g) || []))];
    if (!seen.length) return "I don't see any error messages on the page right now. If a file won't load, check it has a header row with units, like T_surface (K) or elevation (m), and that it's in the right topic box.";
    return seen.map(c => ERROR_HELP[c] || `${c} is a file problem. The message under the drop box says how to fix it.`).join(' ');
  }
  if (/uncertain|confiden|interval|\brange\b|sure|margin/i.test(text)) {
    const C = analysisData();
    const base = "The 95% uncertainty range comes from redrawing your data at random many times and scoring it again each time. The middle 95% of those scores is the range. A narrow range means the score doesn't hinge on a few lucky readings. It doesn't check whether the method itself is right.";
    return C && C.ci95 ? `${base} Your overall range is ${P(C.ci95[0])} to ${P(C.ci95[1])}.` : base;
  }
  if (/slider|weight|importance|overall|total|combined|average|62|72/i.test(text) && !subj) return explainOverall();
  if (/experiment|what (can|should) i (do|test)|test (it )?here|next step/i.test(text)) {
    const s = subj && S.results[subj] ? subj : Object.keys(S.results)[0];
    if (!s) return "Run a comparison first and I'll suggest experiments that fit your results. Or start from real data:\n" + suggestSets(subj || null, 3);
    const a = ENG.ruleBasedAssessment(S.results[s], ctxFor(s)), ex = (a.experiments || []).slice(0, 2);
    const sets = suggestSets(subj || s, 3);
    return (ex.length ? `For ${SNAME[s].toLowerCase()}, two good ones: ${ex.map(e => `${e.title}. ${e.objective}`).join(' Then, ')}` : a.summary) + (sets ? '\n\n' + t('helper_sets') + '\n' + sets : '');
  }
  const g = GLOSSARY.find(([re]) => re.test(text));
  if (g) return g[1];
  if (/\b(maps?|images?|legend|colou?r scale|png|jpe?g)\b/i.test(text))
    return "To compare map images, drop each one in its box, then open Units, map legends and other options. Set the units, pick the legend type (viridis, inferno, jet or grayscale) and type the legend's minimum and maximum. Maps have no time of day or season, so they often score lower than tables of the same places.";
  if (/\b(how (do|can) i|upload|get started|start|use (this|the site)|load)\b/i.test(text))
    return "Pick the planet and name both places, switch on the topics you want and set their sliders. Then drop one file from the other world and one from Earth into each topic and press Compare. Load example fills everything in so you can see how it works.";
  if (subj) return explainSubject(subj);
  return explainOverall() + " You can ask me why a topic scored what it did, what the uncertainty range means, or how to fix a file error.";
}


/* ---------- Marvin-AI's family ---------- */
const FATHER_Q = /\b(who('?s| is| was)\s+your\s+(father|dad|daddy|papa|creator|maker|parents?)|who\s+(made|created|built|invented|coded|programmed|designed)\s+you|(tell me about|about)\s+your\s+(father|dad|creator)|do you have a (father|dad))\b/i;
const IS_MARVIN_WANG = /(\b(i\s*am|i'?m|im|this is|it'?s|my name is|i'?m called|call me)\s+marvin\s+wang\b|^\s*marvin\s+wang\s*[.!]*\s*$)/i;
let fatherGreeted = store.get('marvin-father-greeted') === '1';
/* Returns a fixed reply, or null. These turns are kept out of the conversation the AI sees. */
function specialReply(text) {
  if (IS_MARVIN_WANG.test(text)) {
    if (!fatherGreeted) { fatherGreeted = true; store.set('marvin-father-greeted', '1'); return 'Hello father Wang'; }
    return t('helper_hello');   // greeted once already: never again
  }
  if (FATHER_Q.test(text)) return t('helper_father');
  return null;
}
/* ---------- getting a reply ---------- */
async function aiReply() { return null; }   // Marvin-AI is local: no AI service is ever called

let offlineNoted = false;
async function helperReply() {
  const recent = helperHistory.slice(-HELPER_MAX_TURNS), last = recent[recent.length - 1].content;
  if (hasProfanity(last)) return t('helper_refuse');
  let reply = null, offline = false;
  try { reply = await aiReply(recent, helperContext()); } catch (e) { reply = null; }
  if (reply == null || !reply.trim()) { reply = offlineAnswer(last); offline = true; }
  if (reply.includes(REFUSE)) return t('helper_refuse');
  if (hasProfanity(reply)) { reply = offlineAnswer(last); offline = true; if (reply === REFUSE) return t('helper_refuse'); }   // an AI reply with a curse is thrown away
  reply = cleanReply(ENG.tidyText(reply.trim()));
  if (offline && !offlineNoted && LANG !== 'en') { offlineNoted = true; reply += '\n\n' + t('helper_offline'); }
  return reply;
}

/* ---------- the chat window ---------- */
function helperLine(who, text, cls) {
  const p = document.createElement('div'); p.className = 'hmsg ' + cls;
  const b = document.createElement('b'); b.textContent = who; p.appendChild(b);
  const body = document.createElement('div'); body.className = 'htext'; body.textContent = text; p.appendChild(body);
  $('helperLog').appendChild(p); $('helperLog').scrollTop = $('helperLog').scrollHeight;
  return body;
}
function setBotText(el, reply) {
  const ids = [];
  el.textContent = reply.replace(/\[\[SET:([\w-]+)\]\]/g, (_, id) => { if (LIB.sets.some(x => x.id === id) && !ids.includes(id)) ids.push(id); return ''; }).replace(/\n{3,}/g, '\n\n').trim();
  const old = el.parentNode.querySelector('.hset'); if (old) old.remove();
  if (!ids.length) return;
  const box = document.createElement('div'); box.className = 'hset';
  ids.slice(0, 4).forEach(id => {
    const x = LIB.sets.find(z => z.id === id), b = document.createElement('button');
    b.type = 'button'; b.textContent = '→ ' + x.title; b.title = t('lib_load');
    b.onclick = () => { if (innerWidth < 700) helperOpen(false); loadSet(id); };
    box.appendChild(b);
  });
  el.parentNode.appendChild(box);
}
function helperOpen(open) {
  $('helper').classList.toggle('open', open); $('helperFab').setAttribute('aria-expanded', open);
  if (open) { if (!$('helperLog').children.length) helperLine(t('helper_name'), t('helper_hello'), 'bot'); $('helperInput').focus(); }
}
$('helperFab').onclick = () => helperOpen(!$('helper').classList.contains('open'));
$('helperClose').onclick = () => helperOpen(false);
$('helperForm').addEventListener('submit', async e => {
  e.preventDefault();
  const input = $('helperInput'), text = input.value.trim();
  if (!text || $('helperSend').disabled) return;
  input.value = '';
  helperLine(t('helper_you'), text, 'me');
  const fixed = specialReply(text);
  if (fixed) { helperLine(t('helper_name'), fixed, 'bot'); return; }
  helperHistory.push({ role: 'user', content: text.slice(0, 2000) });
  const out = helperLine(t('helper_name'), t('helper_thinking'), 'bot wait');
  $('helperSend').disabled = true;
  try {
    const reply = await helperReply();
    setBotText(out, reply);
    if (reply === t('helper_refuse')) helperHistory.pop();   // declined messages don't stay in the conversation
    else helperHistory.push({ role: 'assistant', content: reply });
  } catch (err) {
    out.textContent = t('helper_error');
    helperHistory.pop();   // let the person ask again without a dangling question
  } finally {
    out.parentNode.classList.remove('wait'); $('helperSend').disabled = false; input.focus();
    $('helperLog').scrollTop = $('helperLog').scrollHeight;
  }
});

})();
