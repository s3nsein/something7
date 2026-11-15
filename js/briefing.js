/* Globe flow: Earth globe -> Introduction (briefing) -> Comparer.
 * intro.js dives into the globe and dispatches "lab:site". Instead of dropping the visitor straight into the form,
 * this file opens an Introduction dialog: it introduces an Earth analog site, says what makes it notable, explains how
 * the comparison works, and has a "Launch Comparer" button. Choosing a site only pre-fills the site names and the body.
 * It never runs an analysis. Edit the SITES list to change the featured places. Text here is English; the dialog is
 * simplified automatically in Kids mode.
 */
(function () {
'use strict';
const $ = id => document.getElementById(id);
const dlg = $('brief');
if (!dlg) return;

const SITES = [
  { id: 'atacama', lat: -24, lon: -69, earth: 'the Atacama Desert', place: 'Atacama Desert, Chile', body: 'mars', cel: 'Gale crater',
    notable: 'One of the driest places on Earth. Its salty, nearly lifeless soils and huge temperature swings make it a favourite stand-in for Mars.',
    kids: 'It is so dry that almost nothing grows there, just like on Mars. Scientists test robots there.' },
  { id: 'hawaii', lat: 19.8, lon: -155.5, earth: 'Mauna Kea, Hawaii', place: 'Mauna Kea, Hawaii, USA', body: 'moon', cel: '',
    notable: 'Its volcanic ash and basalt are used to test lunar rovers and ways of making resources from rock, because they resemble the ground of the Moon and Mars.',
    kids: 'The ground is made of volcano rock and ash, a bit like the dusty ground on the Moon.' },
  { id: 'devon', lat: 75.4, lon: -89.7, earth: 'Haughton crater, Devon Island', place: 'Haughton crater, Devon Island, Canada', body: 'mars', cel: '',
    notable: 'A cold, dry impact crater in the Canadian Arctic where space agencies rehearse exploring a crater, living in a habitat and working in a pressure suit.',
    kids: 'It is a cold, rocky crater where astronauts practise for Mars.' },
  { id: 'dryvalleys', lat: -77.5, lon: 162.5, earth: 'the McMurdo Dry Valleys', place: 'McMurdo Dry Valleys, Antarctica', body: 'europa', cel: '',
    notable: 'Ice-free, bitterly cold valleys with frozen ground and salty brines. They are used to study how life and ice behave on Mars and on icy moons such as Europa.',
    kids: 'A freezing, dry place with ice and salt, a bit like the icy moons of Jupiter.' },
  { id: 'iceland', lat: 65, lon: -17, earth: 'Askja, Iceland', place: 'Askja, Iceland', body: 'moon', cel: '',
    notable: 'A volcanic caldera where Apollo astronauts trained to recognise lunar rocks and landforms before flying to the Moon.',
    kids: 'Apollo astronauts practised here before they walked on the Moon.' },
  { id: 'riotinto', lat: 37.7, lon: -6.6, earth: 'the Rio Tinto, Spain', place: 'Rio Tinto, Spain', body: 'mars', cel: '',
    notable: 'A blood-red, acidic river rich in iron minerals. Its chemistry resembles minerals found on Mars and shows how life can live in harsh water.',
    kids: 'A bright red river full of iron, a bit like the rusty rocks of Mars.' },
];
const BODY_NAME = { mars: 'Mars', moon: 'the Moon', mercury: 'Mercury', europa: 'Europa', titan: 'Titan', other: 'another world' };
const STEPS = ['Name the two sites: one on Earth and one on another world.', 'Pick the subjects to compare (temperature, topography, surface composition) and how much each should count.', 'Add one data file for each world in each subject, or load a ready-made NASA comparison from the data library.', 'Press Analyze. The lab measures how alike the two sites are, gives a percent likeness with its uncertainty, and suggests experiments to run on Earth.'];
const KID_STEPS = ['Pick a place on Earth and a place on another world.', 'Choose what to compare: how hot, how bumpy, or what the ground is made of.', 'Add a file of measurements for each place.', 'Press Analyze to see how much the two places are alike. 100% would be perfect twins.'];

let chosen = SITES[0], opener = null, pickNote = '';
const rad = d => d * Math.PI / 180;
function nearest(lat, lon) {   // featured site closest to a point on the globe (great-circle distance)
  let best = SITES[0], bd = 1e9;
  for (const s of SITES) { const c = Math.sin(rad(lat)) * Math.sin(rad(s.lat)) + Math.cos(rad(lat)) * Math.cos(rad(s.lat)) * Math.cos(rad(lon - s.lon)), d = Math.acos(Math.max(-1, Math.min(1, c))) * 6371; if (d < bd) { bd = d; best = s; } }
  return { site: best, km: Math.round(bd) };
}
const fmtLL = (lat, lon) => `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`;
const kids = () => document.body.dataset.audience === 'kids';


function render() {
  const k = kids();
  $('briefList').innerHTML = SITES.map(s => `<button type="button" class="briefsite" data-id="${s.id}" aria-pressed="${s.id === chosen.id}">${s.earth.replace(/^the /, '')}</button>`).join('');
  $('briefList').querySelectorAll('button').forEach(b => b.onclick = () => { chosen = SITES.find(s => s.id === b.dataset.id); render(); });
  $('briefPlace').textContent = chosen.place;
  $('briefWhy').textContent = k ? chosen.kids : chosen.notable;
  $('briefPair').textContent = k ? `Its space twin could be ${BODY_NAME[chosen.body]}.` : `Suggested comparison: ${chosen.place} with ${chosen.cel || 'a site'} on ${BODY_NAME[chosen.body]}.`;
  $('briefSteps').innerHTML = (k ? KID_STEPS : STEPS).map(x => `<li>${x}</li>`).join('');
  $('briefHow').textContent = k ? 'How to play' : 'How the comparison works';
  $('briefPick').textContent = pickNote;
  $('briefNote').textContent = k ? '' : 'Nothing is calculated until you press Analyze. Choosing a site here only fills in the names.';
}
function open(from) {
  opener = from || document.activeElement;
  render();
  dlg.classList.remove('hidden'); dlg.setAttribute('aria-hidden', 'false'); document.body.classList.add('briefing');
  $('briefLaunch').focus();
}
function close() {
  pickNote = '';
  dlg.classList.add('hidden'); dlg.setAttribute('aria-hidden', 'true'); document.body.classList.remove('briefing');
  if (opener && opener.focus && document.contains(opener)) opener.focus();
}
function launch() {
  if (window.labShowLab) window.labShowLab();   // leave the story page for the lab itself
  $('ename').value = chosen.earth; $('cbody').value = chosen.body; $('cname').value = chosen.cel;
  ['ename', 'cbody', 'cname'].forEach(id => $(id).dispatchEvent(new Event('change')));   // same path as the visitor typing
  dlg.classList.add('hidden'); dlg.setAttribute('aria-hidden', 'true'); document.body.classList.remove('briefing');
  setTimeout(() => $('compare').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 60);
  setTimeout(() => $('cname').focus({ preventScroll: true }), 400);
}
$('briefLaunch').onclick = launch;
$('briefClose').onclick = close;
dlg.addEventListener('mousedown', e => { if (e.target === dlg) close(); });
document.addEventListener('keydown', e => {
  if (dlg.classList.contains('hidden')) return;
  if (e.key === 'Escape') { e.preventDefault(); close(); }
  if (e.key === 'Tab') {   // keep focus inside the dialog
    const f = [...dlg.querySelectorAll('button')].filter(b => b.offsetParent !== null); if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
window.addEventListener('lab:site', e => {
  /* Sent by js/intro.js after the dive. e.detail is where the visitor pressed on the globe, or null (keyboard). */
  const d = e.detail;
  if (d && isFinite(d.lat)) { const n = nearest(d.lat, d.lon); chosen = n.site; pickNote = kids() ? `You pressed near ${fmtLL(d.lat, d.lon)}. The closest featured place is ${chosen.place}.` : `You pressed near ${fmtLL(d.lat, d.lon)}. The closest featured analog site is ${chosen.place}, about ${n.km.toLocaleString()} km away.`; }
  else pickNote = '';
  open($('toLab'));
});
window.addEventListener('lab:audience', () => { if (!dlg.classList.contains('hidden')) render(); });
})();
