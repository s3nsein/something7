/* Planetary Analog Lab: audience modes (Auto, Kids, Students, Educators, Scientists, Managers). Edit freely.
 *
 * How it works
 *   - The pills in the top bar set one piece of state, activeAudience. It is stored on <body data-audience="...">,
 *     so css/audience.css can show, hide and resize things for each audience.
 *   - AUDIENCE_TEXT rewords parts of the English interface for an audience (js/app.js reads window.LAB_AUDIENCE_TEXT).
 *     Other languages keep their own translation. The audience panels below are written in English only.
 *   - The comparison tool itself (sites, subjects, files, results) is the same in every mode.
 *
 * Start-up choice ("Auto"): a link such as index.html?audience=kids wins, then the mode this visitor picked
 * last time on this device, otherwise the standard view. Nothing about the visitor is guessed.
 *
 * Figures, dates and links in the Students and Managers content were checked in November 2026.
 * Each one carries its source. Update them in the lists below when they change.
 */
(function () {
'use strict';

/* ================= settings you can edit ================= */
const AUDIENCE_CONFIG = {
  // Where the educator form is sent. Give the URL of a service that accepts POST JSON (your own server, or a form
  // service). While this is null, the form saves the entry in this browser only and tells the teacher so.
  educatorFormEndpoint: null,
};

const LAB = window.LAB;
if (!LAB) return;
const { S, ENG, SUBJECTS, esc, pct } = LAB;
const $ = id => document.getElementById(id);
const cap = x => String(x).charAt(0).toUpperCase() + String(x).slice(1);
const link = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;

/* ================= the audiences ================= */
const MODES = [
  { id: 'auto', label: 'Auto-Detect', note: 'Auto: the standard view. Pick who you are at the top to tailor the lab.' },
  { id: 'kids', label: 'Kids (Ages 8–12)', note: 'Kids mode (ages 8 to 12): simple words, big buttons and space facts.' },
  { id: 'students', label: 'Students (Ages 13–18)', note: 'Students mode (ages 13 to 18): missions to watch, careers and citizen science.' },
  { id: 'educators', label: 'Educators', note: 'Educators mode: classroom uses, lessons, worksheets and curriculum packages.' },
  { id: 'scientist', label: 'Scientists', note: 'Scientist mode: technical wording, similarity matrix, raw data export and references.' },
  { id: 'manager', label: 'Managers', note: 'Manager mode: decision brief, market benchmarks, case studies and the investment analyzer.' },
];

/* English wording changes for each audience. Keys are the same as in js/i18n.js. */
const AUDIENCE_TEXT = {
  kids: {
    intro_sub: 'Which places on Earth are like the Moon or Mars? Let’s go and find a twin!',
    lede: 'Pick a place on another world and a place on Earth. The lab checks how alike they are and gives them a twin score.',
    step1: 'Which two places?', step2: 'What should we check?', step2help: 'Switch on the things you want to check.',
    step3: 'Add the measurements', step3help: 'Each thing needs one file from the other world and one from Earth. No files? Press “Try the example”.',
    body: 'Which world?', celSite: 'Place on that world', earthSite: 'Place on Earth',
    s_temperature: 'Hot and cold', s_topography: 'Hills and valleys', s_composition: 'What the ground is made of',
    d_temperature: 'How hot it gets in the day and how cold at night.', d_topography: 'How bumpy, steep or flat the land is.', d_composition: 'What the rocks and soil are made of.',
    drop: 'Tap to pick a file', analyze: 'Find the twin score', loadEx: 'Try the example',
    overall: 'Twin score', likenessOf: '{s} twin score', overallLine: '{earth} and {cel} on {body}.', singleLine: '{earth} and {cel} on {body}.',
    strongest: 'Most alike: {s} ({p}).', weakest: 'Least alike: {s} ({p}).',
    ci: 'We are fairly sure the real score is between {lo} and {hi}.', noci: 'There were too few measurements to say how sure we are.',
    v_strong: 'Great twin!', v_good: 'Pretty good twin', v_limited: 'A little bit alike', v_poor: 'Not very alike',
    details: 'See more', shareOf: 'counts for {p}',
  },
  scientist: {
    lede: 'Quantify how closely a terrestrial site reproduces a planetary site. Each subject returns a similarity index with a bootstrap 95% confidence interval, the component scores behind it and the underlying test statistics.',
    step2help: 'Select subjects and set their weights in the composite index (weight ÷ sum of weights of the selected subjects).',
    importance: 'Weight', overall: 'Composite similarity index', likenessOf: '{s} similarity index',
    overallLine: '{earth} against {cel} on {body}, weighted mean of the subject indices.',
    strongest: 'Highest index: {s}, {p}.', weakest: 'Lowest index: {s}, {p}.',
    ci: 'Bootstrap 95% CI: {lo} to {hi}', noci: 'No bootstrap interval (too few samples to resample)',
    scoreParts: 'Index = arithmetic mean of these components:', details: 'Statistics',
  },
  manager: {
    lede: 'See whether an Earth site is a close enough stand-in for a Moon or Mars site to justify field testing there, and how confident that result is.',
    step2help: 'Pick what matters for your programme. The sliders set how much each subject counts in the overall fit.',
    overall: 'Analog fit', likenessOf: '{s} fit', ci: 'Confidence range (95%): {lo} to {hi}',
    v_strong: 'Strong fit', v_good: 'Good partial fit', v_limited: 'Limited fit', v_poor: 'Poor fit',
    assessment: 'Recommendation', details: 'See the evidence',
  },
};

/* ================= state ================= */
let activeAudience = 'auto';
let returnTo = null;                     // set while an educator is previewing Kids mode
const openTab = {};                      // which tab is open in each audience panel
const KEY = 'lab-audience';
const isMode = id => MODES.some(m => m.id === id);
function initialAudience() {
  try { const q = new URLSearchParams(location.search).get('audience'); if (isMode(q)) return q; } catch (e) { }
  try { const saved = localStorage.getItem(KEY); if (isMode(saved)) return saved; } catch (e) { }
  return 'auto';
}
function setAudience(id, opts = {}) {
  if (!isMode(id)) id = 'auto';
  activeAudience = id;
  returnTo = opts.preview ? opts.from : null;
  if (!opts.preview) { try { localStorage.setItem(KEY, id); } catch (e) { } }
  document.body.dataset.audience = id;
  window.LAB_AUDIENCE_TEXT = AUDIENCE_TEXT[id] || null;
  const mode = MODES.find(m => m.id === id);
  $('audpills').querySelectorAll('button').forEach(b => { const on = b.dataset.a === id; b.setAttribute('aria-pressed', on); if (on && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
  $('audnote').textContent = mode.note; $('audnoteIntro').textContent = mode.note;
  if (id === 'scientist') document.querySelectorAll('details.key').forEach(d => { d.open = true; });
  LAB.applyLang();                       // rewords the interface and redraws any results
  renderPanel(); renderResults(); renderTail();
  window.dispatchEvent(new Event('lab:audience'));
}
function buildPills() {
  $('audpills').innerHTML = MODES.map(m => `<button type="button" data-a="${m.id}" aria-pressed="false">${esc(m.label)}</button>`).join('');
  $('audpills').querySelectorAll('button').forEach(b => { b.onclick = () => setAudience(b.dataset.a); });
}

/* ================= small building blocks ================= */
function tabs(mode, items) {
  const cur = items.some(i => i.id === openTab[mode]) ? openTab[mode] : items[0].id;
  return `<div class="audtabs" role="tablist">${items.map(i => `<button type="button" role="tab" data-tab="${i.id}" aria-selected="${i.id === cur}">${esc(i.label)}</button>`).join('')}</div>
    ${items.map(i => `<div class="audtab${i.id === cur ? '' : ' hidden'}" role="tabpanel" data-panel="${i.id}">${i.html}</div>`).join('')}`;
}
function wireTabs(root, mode) {
  root.querySelectorAll('.audtabs button').forEach(b => b.onclick = () => {
    openTab[mode] = b.dataset.tab;
    root.querySelectorAll('.audtabs button').forEach(x => x.setAttribute('aria-selected', x === b));
    root.querySelectorAll('.audtab').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== b.dataset.tab));
  });
}
const save = async (filename, text, type) => { try { await LAB.saveFile(filename, new Blob([text], { type })); } catch (e) { } };
const money = m => m >= 1000 ? '$' + (+(m / 1000).toFixed(m >= 10000 ? 1 : 2)) + ' billion' : '$' + (+m.toFixed(1)) + ' million';

/* =====================================================================================================
 * KIDS
 * ===================================================================================================== */
const KID_FACTS = [
  'On the Moon you would weigh about one sixth of what you weigh on Earth.',
  'On Mars you would weigh a bit more than one third of what you weigh on Earth.',
  'A day on Mars is about 40 minutes longer than a day on Earth.',
  'Olympus Mons on Mars is about 22 kilometres tall. That is about two and a half times as tall as Mount Everest.',
  'Sunsets on Mars look blue.',
  'The Moon has no wind and no rain, so astronaut footprints can stay there for millions of years.',
  'Apollo astronauts practised in Iceland and at a big crater in Arizona before they flew to the Moon.',
  'The Atacama Desert in Chile is so dry that scientists test Mars rovers there.',
];
let factIndex = 0;
function kidsPanel() {
  return `<div class="audgrid two">
    <div class="card kidcard">
      <h2>What is a planetary twin?</h2>
      <p>It is hard to practise on the Moon or Mars. They are very far away! So scientists look for places on Earth that are a lot like them: just as cold, just as bumpy, or made of the same kind of rock.</p>
      <p>A place like that is called an <b>analog</b>. You can think of it as a <b>planetary twin</b>.</p>
      <p>No twin is perfect. Earth pulls you down harder than the Moon or Mars do, so a twin only matches in some ways. This lab shows you which ways.</p>
    </div>
    <div class="card kidcard">
      <h2>How to play</h2>
      <ol class="kidsteps"><li>Pick a place on another world and a place on Earth.</li><li>Choose what to check: hot and cold, hills and valleys, or what the ground is made of.</li><li>Press <b>Find the twin score</b>. No files? Press <b>Try the example</b>.</li></ol>
      <div class="factbox" aria-live="polite"><div class="small mute">Space fact</div><p id="kidfact">${esc(KID_FACTS[factIndex])}</p><button type="button" id="kidnext">Tell me another</button></div>
    </div>
  </div>`;
}
function kidsResults() {
  const C = LAB.analysis(); if (!C) return '';
  const ctx = LAB.ctxFor(C.parts[0].subject), body = LAB.bodyName(), p = C.likeness;
  const main = p >= 60 ? `These two places are a great match. People could practise at ${ctx.earthSite} before a trip to ${body}.`
    : p >= 35 ? `These two places match in some ways but not in others. ${ctx.earthSite} is good for practising some things.`
      : p >= 15 ? `These two places are only a little bit alike.` : `These two places are quite different. Keep looking for a better twin!`;
  const c = k => (k - 273.15).toFixed(0), m = x => Math.round(x).toLocaleString();
  const lines = C.parts.map(part => {
    const r = S.results[part.subject], cx = LAB.ctxFor(part.subject);
    let more = '';
    if (part.subject === 'temperature') more = `In these measurements, ${cx.earthSite} is about ${c(r.earth.stats.mean)} °C on average and ${cx.celestialSite} is about ${c(r.celestial.stats.mean)} °C.`;
    if (part.subject === 'topography') more = `At ${cx.earthSite}, the land goes up and down by about ${m(r.earth.relief_m)} metres. At ${cx.celestialSite} it is about ${m(r.celestial.relief_m)} metres.`;
    if (part.subject === 'composition') { const top = [...r.table].sort((a, b) => b.celestialNormalized - a.celestialNormalized)[0]; more = `The rocks share ${r.sharedComponents.length} ingredients. The biggest one at ${cx.celestialSite} is ${top.component}.`; }
    return `<li><b>${esc(LAB.t('s_' + part.subject))}: ${pct(part.likeness)} alike.</b> ${esc(more)}</li>`;
  }).join('');
  const g = { mars: 'Mars', moon: 'the Moon', mercury: 'Mercury', europa: 'Europa', titan: 'Titan' }[ctx.body];
  return `<div class="card kidcard"><h2>What does the score mean?</h2><p class="kidbig">${esc(main)}</p><ul class="kidlist">${lines}</ul>
    ${g ? `<p class="mute">Remember: gravity on Earth is stronger than on ${esc(g)}, so jumping, driving and dust all behave differently there.</p>` : ''}</div>`;
}

/* =====================================================================================================
 * STUDENTS
 * ===================================================================================================== */
const MISSIONS = [
  { name: 'Artemis (NASA)', text: 'Artemis II carried four astronauts around the Moon in April 2026. NASA now plans Artemis III for 2027 as a test in Earth orbit, where the Orion capsule practises docking with the new lunar landers, and aims to land astronauts on the Moon with Artemis IV in 2028.', src: ['Payload, October 2026', 'https://payloadspace.com/nasa-outlines-the-details-of-artemis-iii-and-iv-missions/'] },
  { name: 'Commercial Lunar Payload Services (NASA)', text: 'NASA pays companies to carry science instruments to the Moon. Thirteen companies can bid for deliveries, and Firefly’s Blue Ghost lander completed a full surface mission in 2025.', src: ['NASA', 'https://www.nasa.gov/missions/artemis/clps'] },
  { name: 'Rosalind Franklin rover (ESA)', text: 'Europe’s first Mars rover carries a drill that can reach two metres below the surface to look for signs of past life. Launch is planned for 2028 on a Falcon Heavy rocket.', src: ['European Spaceflight', 'https://europeanspaceflight.com/esas-mars-rover-to-launch-aboard-spacex-falcon-heavy-in-2028/'] },
  { name: 'Dragonfly (NASA)', text: 'A car-sized rotorcraft that will fly from place to place on Titan, Saturn’s largest moon. Launch is planned for July 2028, with arrival in 2034.', src: ['NASA Science', 'https://science.nasa.gov/missions/dragonfly/nasas-dragonfly-rotorcraft-mission-to-saturns-moon-titan-confirmed/'] },
  { name: 'LUNA analog facility (ESA and DLR)', text: 'A hall in Cologne, Germany, with 700 square metres of artificial Moon surface where astronauts and robots train. It opened in September 2024 and is a human-built analog site.', src: ['DLR', 'https://www.dlr.de/en/latest/news/2024/training-facility-for-astronautical-and-robotic-missions-to-the-moon'] },
];
const CAREERS = [
  { name: 'Planetary scientist', does: 'Works out how other worlds formed and changed, using rocks, maps and spacecraft data.', study: 'Geology, physics, chemistry, maths', here: 'The surface composition comparison uses the same rock chemistry they do.' },
  { name: 'Aerospace engineer', does: 'Designs and tests rockets, landers, rovers and habitats.', study: 'Physics, maths, engineering, computing', here: 'The slope and temperature limits in the results are the kind of numbers a lander is designed around.' },
  { name: 'GIS and remote sensing analyst', does: 'Turns satellite images and elevation data into maps people can make decisions with.', study: 'Geography, computing, statistics', here: 'The topography comparison is a small GIS analysis: elevation grids, slopes and area.' },
  { name: 'Data scientist', does: 'Finds patterns in large datasets and says how certain the answer is.', study: 'Maths, statistics, programming', here: 'The likeness score and its uncertainty range are worked out with standard statistical methods.' },
  { name: 'Robotics engineer', does: 'Builds machines that can drive, drill and decide for themselves far from Earth.', study: 'Engineering, computing, electronics', here: 'Analog sites are where rovers get tested. The recommended experiments show what would be tried.' },
  { name: 'Astrobiologist', does: 'Studies where life could survive, on Earth and beyond.', study: 'Biology, chemistry, geology', here: 'The temperature results show how often water or salty brines could stay liquid.' },
];
const CITSCI = [
  { name: 'Planet Hunters TESS', text: 'Look through star brightness measurements from the TESS space telescope for the small dips that reveal a planet.', needs: 'Phone or laptop', url: 'https://science.nasa.gov/citizen-science/planet-hunters-tess/' },
  { name: 'Cloudspotting on Mars', text: 'Mark clouds in data from a Mars orbiter to help scientists understand the Martian atmosphere.', needs: 'Phone or laptop', url: 'https://science.nasa.gov/citizen-science/cloudspotting/' },
  { name: 'Lunar Melt', text: 'A Moon project you can take part in from a laptop.', needs: 'Laptop', url: 'https://science.nasa.gov/citizen-science/lunar-melt/' },
  { name: 'JunoCam', text: 'Work with raw images of Jupiter from the Juno spacecraft’s camera.', needs: 'Laptop', url: 'https://science.nasa.gov/citizen-science/junocam-2/' },
  { name: 'Exoplanet Watch', text: 'Help track planets around other stars as they pass in front of them.', needs: 'Laptop', url: 'https://science.nasa.gov/citizen-science/exoplanet-watch/' },
  { name: 'Galaxy Zoo: Clump Scout II', text: 'Your classifications help train machines to find features in galaxy images.', needs: 'Phone or laptop', url: 'https://science.nasa.gov/citizen-science/galaxy-zoo-clump-scout-ii/' },
  { name: 'Artifact InSPECtor', text: 'Label flaws in space telescope images to train the tools that remove them.', needs: 'Phone or laptop', url: 'https://science.nasa.gov/citizen-science/artifact-inspector/' },
];
function studentsPanel() {
  const missions = `<p class="mute">Plans change often. These dates were checked in November 2026.</p><div class="audgrid">${MISSIONS.map(x => `<div class="card"><h3>${esc(x.name)}</h3><p>${esc(x.text)}</p><p class="small">${link(x.src[1], 'Source: ' + x.src[0])}</p></div>`).join('')}</div>`;
  const careers = `<p class="mute">Each of these jobs uses something this lab does.</p><div class="scroll"><table class="stack audtable"><thead><tr><th>Career</th><th>What they do</th><th>Subjects to study</th><th>Where you see it in this lab</th></tr></thead><tbody>${CAREERS.map(c => `<tr><td data-l="Career"><b>${esc(c.name)}</b></td><td data-l="What they do">${esc(c.does)}</td><td data-l="Subjects to study">${esc(c.study)}</td><td data-l="In this lab">${esc(c.here)}</td></tr>`).join('')}</tbody></table></div>`;
  const cit = `<h3>How you can take part in citizen science</h3><p>NASA lists 49 citizen science projects that are open to everyone, with no citizenship requirement. You help real research teams by spotting, sorting and labelling things in their data. These are a good place to start:</p>
    <div class="audgrid">${CITSCI.map(x => `<div class="card"><h3>${esc(x.name)}</h3><p>${esc(x.text)}</p><p class="small mute">You need: ${esc(x.needs)}</p><p class="small">${link(x.url, 'Open the project page')}</p></div>`).join('')}</div>
    <p class="small">${link('https://science.nasa.gov/citizenscience', 'See every NASA citizen science project')}</p>`;
  return `<h2>For students</h2>` + tabs('students', [{ id: 'missions', label: 'Missions to watch', html: missions }, { id: 'careers', label: 'Careers', html: careers }, { id: 'citsci', label: 'Citizen science', html: cit }]);
}

/* =====================================================================================================
 * EDUCATORS
 * ===================================================================================================== */
const AGE_RANGES = ['3-5', '3-6', '6-8', '6-12', '9-12'];
const CLASSROOM = [
  ['Introduce what an analog site is', 'Open Kids mode, read “What is a planetary twin?” together, then press “Try the example”.', 'Kids', '15 min', '6 to 12'],
  ['Read and compare graphs', 'Run the example and compare the two curves in the temperature chart. Ask which place is colder and when.', 'Kids or Auto', '30 min', '8 to 14'],
  ['Practise percentages and averages', 'Change the importance sliders and predict the new overall score before it updates.', 'Auto', '30 min', '10 to 16'],
  ['Discuss uncertainty in science', 'Compare the score with its 95% range. Ask why a range is more honest than one number.', 'Students', '40 min', '13 to 18'],
  ['Plan an investigation', 'Read the recommended experiments in the assessment, then have groups design their own for a local site.', 'Students', '50 min', '13 to 18'],
  ['Work with real data files', 'Download NASA POWER temperatures for your own town and compare them with the Mars example.', 'Scientists', '60 min', '15 to 18'],
];
const LESSONS = [
  { id: 'hot-cold', title: 'Hot place, cold place', ages: '3-5', subject: 'Temperature', minutes: 20,
    summary: 'Children sort objects and pictures into warm and cold, then meet Mars as a very cold place.',
    objectives: ['Use the words hot, warm, cool and cold', 'Know that some places are much colder than home'],
    materials: ['A warm object and a cold object that are safe to touch', 'Picture cards: desert, snow, the Moon, Mars', 'Two sorting hoops or trays'],
    steps: ['Pass round the warm and cold objects. Ask how each one feels.', 'Sort the picture cards into a warm hoop and a cold hoop together.', 'Show Mars. Explain that Mars is usually far colder than the inside of a freezer.', 'Ask what you would wear to visit Mars.'],
    questions: ['Draw something hot.', 'Draw something cold.', 'Draw what you would wear on Mars.'],
    note: 'Mars averages roughly −60 °C. A home freezer is about −18 °C.' },
  { id: 'moon-crater', title: 'Make a Moon crater', ages: '3-6', subject: 'Topography', minutes: 30,
    summary: 'Children drop marbles into a tray of flour and cocoa to make craters like the ones on the Moon.',
    objectives: ['See that falling objects make round holes called craters', 'Compare big and small craters'],
    materials: ['A deep tray', 'Flour (bottom layer) and cocoa powder (thin top layer)', 'Marbles or pebbles of different sizes', 'A photo of the Moon’s surface'],
    steps: ['Fill the tray with flour and sprinkle cocoa on top.', 'Drop a small marble from knee height. Look at the hole and the splash of white flour.', 'Try a bigger marble, then a higher drop.', 'Compare the tray with the Moon photo.'],
    questions: ['Draw your biggest crater.', 'Circle the one that made the biggest crater: the small marble or the big marble.'],
    note: 'Do this on a floor covering. The white rays of flour match the bright rays around young lunar craters.' },
  { id: 'rock-detectives', title: 'Rock detectives', ages: '3-6', subject: 'Surface composition', minutes: 25,
    summary: 'Children sort rocks by colour, feel and weight, the first step toward asking what rocks are made of.',
    objectives: ['Describe rocks with words such as rough, smooth, dark and light', 'Sort objects by one property at a time'],
    materials: ['A mixed set of 8 to 10 rocks', 'Magnifying glasses', 'Sorting trays'],
    steps: ['Give each group a few rocks and a magnifying glass.', 'Sort by colour, then mix and sort by rough or smooth.', 'Find the heaviest and the lightest rock.', 'Explain that scientists sort Mars rocks too, using robots.'],
    questions: ['Draw your favourite rock.', 'Is it rough or smooth? Circle one.'],
    note: 'Wash hands afterwards. Avoid crumbly or sharp samples.' },
  { id: 'day-night', title: 'Day and night on two worlds', ages: '6-8', subject: 'Temperature', minutes: 40,
    summary: 'Pupils read the lab’s temperature example and colour thermometers for day and night on Earth and on Mars.',
    objectives: ['Read a temperature from a simple chart', 'Compare day and night temperatures in two places'],
    materials: ['The lab on a shared screen (Kids mode)', 'Worksheet thermometers', 'Red and blue pencils'],
    steps: ['Press “Try the example” in Kids mode.', 'Read out the average temperature for each place from “What does the score mean?”.', 'Colour the worksheet thermometers for a warm afternoon and a cold night in each place.', 'Talk about which place has the bigger change between day and night.'],
    questions: ['Which place is colder on average?', 'Which place changes more between day and night?', 'What would be hardest about living there?'],
    note: 'Thin air on Mars holds little heat, so nights get much colder than on Earth.' },
  { id: 'bumpy-flat', title: 'Bumpy or flat?', ages: '6-8', subject: 'Topography', minutes: 40,
    summary: 'Pupils build two modelling-clay landscapes and measure how much each one goes up and down.',
    objectives: ['Measure heights in centimetres', 'Find the difference between the highest and lowest point'],
    materials: ['Modelling clay', 'Rulers', 'Card bases'],
    steps: ['Each pair builds a flat landscape and a mountainous one.', 'Measure the highest and lowest point of each.', 'Subtract to find how much each landscape goes up and down.', 'Compare with the hills and valleys score in the lab’s example.'],
    questions: ['Highest point: ____ cm. Lowest point: ____ cm.', 'How much does your landscape go up and down?', 'Which landscape would be easier to land a spacecraft on? Why?'],
    note: 'Scientists call the up-and-down difference “relief”.' },
  { id: 'find-twin', title: 'Find Earth’s twin', ages: '6-12', subject: 'All three', minutes: 45,
    summary: 'The class runs the built-in comparison, records the twin scores and discusses why no twin is perfect.',
    objectives: ['Explain what an analog site is', 'Read a percentage score and say what it means', 'Give one way Earth can never match the Moon or Mars'],
    materials: ['The lab in Kids mode', 'Worksheet score table'],
    steps: ['Read “What is a planetary twin?” together.', 'Press “Try the example” and record the three scores and the overall twin score.', 'Switch one subject off and see how the overall score changes.', 'Discuss gravity and air: things a place on Earth cannot copy.'],
    questions: ['Hot and cold score: ____ %. Hills and valleys score: ____ %. Ground score: ____ %.', 'Which was the closest match?', 'Name one thing about Mars that no place on Earth can copy.'],
    note: 'The example compares Gale crater on Mars with the Atacama Desert in Chile.' },
  { id: 'safe-slopes', title: 'Safe landing slopes', ages: '9-12', subject: 'Topography', minutes: 50,
    summary: 'Pupils tilt a ramp to find when a model lander tips, then compare with the slope limits in the lab.',
    objectives: ['Measure an angle with a protractor', 'Run a fair test and record results', 'Link a measurement to a real engineering limit'],
    materials: ['A board to use as a ramp', 'Protractor', 'A model lander (a box with four legs works well)', 'The lab’s topography results (Auto mode)'],
    steps: ['Place the lander on the flat ramp. Raise one end slowly.', 'Record the angle at which it slides or tips. Repeat three times.', 'Open the topography results and find “Landing and mobility thresholds”.', 'Compare your tipping angle with the 15° limit often used for landers.'],
    questions: ['Tipping angle, three tries: ____°, ____°, ____°. Average: ____°.', 'What share of the Mars site is flatter than 15°?', 'How could you change the lander so it tips later?'],
    note: 'A wider leg span and a lower centre of mass both raise the tipping angle.' },
  { id: 'rock-recipe', title: 'Recipe of a rock', ages: '9-12', subject: 'Surface composition', minutes: 50,
    summary: 'Pupils read the composition bars as a recipe, check that the parts add up to 100% and draw their own chart.',
    objectives: ['Read percentages from a bar chart', 'Know that rocks are mixtures of a few main ingredients', 'Compare two compositions and name the biggest difference'],
    materials: ['The lab’s composition results (Auto mode)', 'Squared paper', 'Coloured pencils'],
    steps: ['Run the example and open the surface composition results.', 'List the four largest ingredients for each site with their percentages.', 'Draw a bar chart with both sites side by side.', 'Find the ingredient with the biggest difference.'],
    questions: ['The largest ingredient in both rocks is: ________.', 'Which ingredient differs the most between the two sites?', 'Do the percentages add up to about 100? Show your working.'],
    note: 'SiO2 (silica) is the main ingredient of most rocks on both Earth and Mars.' },
];
const PACKAGES = [
  { n: '01', title: 'First steps in space', ages: 'Ages 3 to 6', lessons: ['hot-cold', 'moon-crater', 'rock-detectives'] },
  { n: '02', title: 'Two worlds, one thermometer', ages: 'Ages 6 to 12', lessons: ['day-night', 'find-twin'] },
  { n: '03', title: 'The shape of the land', ages: 'Ages 3 to 12', lessons: ['moon-crater', 'bumpy-flat', 'safe-slopes'] },
  { n: '04', title: 'What worlds are made of', ages: 'Ages 3 to 12', lessons: ['rock-detectives', 'rock-recipe'] },
  { n: '05', title: 'Mission planner', ages: 'Ages 6 to 12', lessons: ['find-twin', 'safe-slopes', 'rock-recipe'] },
];
const lessonById = id => LESSONS.find(l => l.id === id);
/* A printable page: lesson plan for the teacher, then a worksheet for the pupil. Opens in any browser. */
function lessonHTML(l) {
  const li = a => a.map(x => `<li>${esc(x)}</li>`).join('');
  return `<section><h1>${esc(l.title)}</h1><p class="meta">Ages ${esc(l.ages.replace('-', ' to '))} · ${esc(l.subject)} · ${l.minutes} minutes</p><p>${esc(l.summary)}</p>
    <h2>Pupils will</h2><ul>${li(l.objectives)}</ul><h2>You need</h2><ul>${li(l.materials)}</ul><h2>What to do</h2><ol>${li(l.steps)}</ol><p class="note"><b>Teacher note.</b> ${esc(l.note)}</p></section>
    <section class="sheet"><h1>${esc(l.title)}: worksheet</h1><p class="meta">Name: ______________________ &nbsp; Date: ______________</p>${l.questions.map((q, i) => `<div class="q"><p><b>${i + 1}.</b> ${esc(q)}</p><div class="box"></div></div>`).join('')}</section>`;
}
const printable = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>
body{font:16px/1.55 Georgia,serif;color:#111;max-width:720px;margin:32px auto;padding:0 20px}h1{font-size:28px;margin:0 0 4px}h2{font-size:18px;margin:22px 0 6px}
.meta{color:#555;margin:0 0 14px}.note{border-left:3px solid #999;padding-left:12px}.q{margin:18px 0}.box{border:1px solid #999;border-radius:6px;height:110px}
section{page-break-after:always}section:last-child{page-break-after:auto}footer{color:#555;font-size:13px;margin-top:30px}</style></head><body>${body}<footer>Planetary Analog Lab. Free to copy for classroom use.</footer></body></html>`;
let ageFilter = 'all', dataFilter = 'all';
const DATASETS = ['Temperature', 'Topography', 'Surface composition'];
const dash = a => String(a).replace('-', '–');
function curriculumList() {
  const list = LESSONS.filter(l => (ageFilter === 'all' || l.ages === ageFilter) && (dataFilter === 'all' || l.subject === dataFilter || l.subject === 'All three'));
  return list.map(l => `<div class="card lesson"><div class="lessonhead"><h3>${esc(l.title)}</h3><span class="agechip">Ages ${esc(dash(l.ages))}</span></div>
    <p class="small mute">${esc(l.subject)} · ${l.minutes} minutes</p><p>${esc(l.summary)}</p>
    <button type="button" data-lesson="${l.id}">Download lesson</button></div>`).join('') || '<p class="mute">No lessons match these filters yet.</p>';
}
function educatorsPanel() {
  const start = `<div class="trybox card"><div><h3>See what your pupils will see</h3><p class="mute">Kids mode uses simple words, big buttons and a built-in example. It is free and needs no account.</p></div><button type="button" class="go big" id="tryfree">Try for free</button></div>
    <h3 class="audh">How teachers use the lab</h3>
    <div class="scroll"><table class="stack audtable"><thead><tr><th>Classroom goal</th><th>What to do in the lab</th><th>Mode</th><th>Time</th><th>Ages</th></tr></thead><tbody>${CLASSROOM.map(r => `<tr>${['Classroom goal', 'What to do', 'Mode', 'Time', 'Ages'].map((h, i) => `<td data-l="${h}">${i === 0 ? '<b>' + esc(r[i]) + '</b>' : esc(r[i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const curr = `<p class="mute">Lessons built on the lab’s three subjects. Each download is a printable page with a lesson plan and a pupil worksheet.</p>
    <div class="agepick"><label for="agesel">Age range</label><select id="agesel"><option value="all">All ages</option>${AGE_RANGES.map(a => `<option value="${a}"${ageFilter === a ? ' selected' : ''}>Ages ${dash(a)}</option>`).join('')}</select></div>
    <div class="chips" role="group" aria-label="Filter by dataset"><button type="button" data-data="all" aria-pressed="${dataFilter === 'all'}">All datasets</button>${DATASETS.map(d => `<button type="button" data-data="${d}" aria-pressed="${dataFilter === d}">${d}</button>`).join('')}</div>
    <div class="audgrid" id="currlist">${curriculumList()}</div>`;
  const arch = `<p class="mute">Earlier curriculum packages. Each one bundles several lessons and worksheets into a single printable file.</p>
    <div class="audgrid">${PACKAGES.map(p => `<div class="card lesson"><div class="lessonhead"><h3>Package ${p.n}: ${esc(p.title)}</h3><span class="agechip">${esc(p.ages)}</span></div>
      <ul class="small">${p.lessons.map(id => `<li>${esc(lessonById(id).title)}</li>`).join('')}</ul><button type="button" data-package="${p.n}">Download package</button></div>`).join('')}</div>
    <p class="small mute">To hear about new packages, leave your details under “Stay in touch”.</p>`;
  const form = `<form id="eduform" class="card eduform" novalidate>
      <h3>Tell us what you need</h3><p class="mute">Ask for a curriculum topic, an age range or a dataset, and hear when new packages are ready.</p>
      <div class="row"><div><label for="edu-name">Your name</label><input type="text" id="edu-name" autocomplete="name"></div><div><label for="edu-email">Email</label><input type="text" inputmode="email" id="edu-email" autocomplete="email" required></div></div>
      <div class="row"><div><label for="edu-school">School or organisation</label><input type="text" id="edu-school" autocomplete="organization"></div><div><label for="edu-ages">Ages you teach</label><select id="edu-ages"><option value="">Choose</option>${AGE_RANGES.map(a => `<option>Ages ${a}</option>`).join('')}<option>Ages 13 to 18</option></select></div></div>
      <label for="edu-msg">What would help your class?</label><textarea id="edu-msg" rows="3"></textarea>
      <label class="check"><input type="checkbox" id="edu-ok"> <span>You may email me about new curriculum packages.</span></label>
      <div class="actions"><button type="submit" class="go">Send request</button><span id="edustatus" class="small" role="status"></span></div>
    </form>`;
  return `<h2>For educators</h2>` + tabs('educators', [{ id: 'start', label: 'Start here', html: start }, { id: 'curr', label: 'Lessons and worksheets', html: curr }, { id: 'arch', label: 'Package archive', html: arch }, { id: 'form', label: 'Stay in touch', html: form }]);
}
function wireEducators(root) {
  root.querySelector('#tryfree').onclick = () => { setAudience('kids', { preview: true, from: 'educators' }); $('audpanel').scrollIntoView({ block: 'start' }); };
  const wireLessons = () => root.querySelectorAll('[data-lesson]').forEach(b => b.onclick = () => { const l = lessonById(b.dataset.lesson); save(`lesson-${l.id}.html`, printable(l.title, lessonHTML(l)), 'text/html'); });
  wireLessons();
  root.querySelector('#agesel').onchange = e => {
    ageFilter = e.target.value;
    root.querySelector('#currlist').innerHTML = curriculumList(); wireLessons();
  };
  root.querySelectorAll('[data-data]').forEach(b => b.onclick = () => {
    dataFilter = b.dataset.data; root.querySelectorAll('[data-data]').forEach(x => x.setAttribute('aria-pressed', x === b));
    root.querySelector('#currlist').innerHTML = curriculumList(); wireLessons();
  });
  root.querySelectorAll('[data-package]').forEach(b => b.onclick = () => { const p = PACKAGES.find(x => x.n === b.dataset.package); save(`curriculum-package-${p.n}.html`, printable(`Package ${p.n}: ${p.title}`, p.lessons.map(id => lessonHTML(lessonById(id))).join('')), 'text/html'); });
  root.querySelector('#eduform').onsubmit = async e => {
    e.preventDefault();
    const st = root.querySelector('#edustatus'), v = id => root.querySelector('#' + id).value.trim();
    const entry = { name: v('edu-name'), email: v('edu-email'), school: v('edu-school'), ages: v('edu-ages'), message: v('edu-msg'), updates: root.querySelector('#edu-ok').checked, sent: new Date().toISOString() };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(entry.email)) { st.style.color = 'var(--bad)'; st.textContent = 'Enter an email address, such as name@school.org.'; root.querySelector('#edu-email').focus(); return; }
    if (AUDIENCE_CONFIG.educatorFormEndpoint) {
      st.style.color = 'var(--mute)'; st.textContent = 'Sending…';
      try {
        const res = await fetch(AUDIENCE_CONFIG.educatorFormEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry) });
        if (!res.ok) throw new Error(String(res.status));
        st.style.color = 'var(--good)'; st.textContent = 'Request sent.'; e.target.reset();
      } catch (err) { st.style.color = 'var(--bad)'; st.textContent = 'The request could not be sent. Check your connection and send it again.'; }
      return;
    }
    let kept = false;
    try { const all = JSON.parse(localStorage.getItem('lab-educator-requests') || '[]'); all.push(entry); localStorage.setItem('lab-educator-requests', JSON.stringify(all)); kept = true; } catch (err) { }
    st.style.color = 'var(--warn)';
    st.textContent = kept ? 'Saved in this browser only. This site is not connected to a mailing list yet, so nothing was sent.' : 'This site is not connected to a mailing list yet, so nothing was sent.';
  };
}

/* =====================================================================================================
 * SCIENTISTS
 * ===================================================================================================== */
const REFERENCES = [
  ['Analog sites', 'Navarro-González, R., et al. (2003). Mars-like soils in the Atacama Desert, Chile, and the dry limit of microbial life. Science, 302, 1018–1021.', '10.1126/science.1089143'],
  ['Mars topography (MOLA)', 'Smith, D. E., et al. (2001). Mars Orbiter Laser Altimeter: Experiment summary after the first year of global mapping of Mars. Journal of Geophysical Research, 106(E10), 23689–23722.', '10.1029/2000JE001364'],
  ['Mars surface temperature (TES)', 'Christensen, P. R., et al. (2001). Mars Global Surveyor Thermal Emission Spectrometer experiment: Investigation description and surface science results. Journal of Geophysical Research, 106(E10), 23823–23871.', '10.1029/2000JE001370'],
  ['Lunar cold traps (Diviner)', 'Paige, D. A., et al. (2010). Diviner Lunar Radiometer observations of cold traps in the Moon’s south polar region. Science, 330, 479–482.', '10.1126/science.1187726'],
  ['Compositional data (log-ratios)', 'Aitchison, J. (1982). The statistical analysis of compositional data. Journal of the Royal Statistical Society B, 44, 139–177.', '10.1111/j.2517-6161.1982.tb01195.x'],
  ['Chemical index of alteration', 'Nesbitt, H. W., & Young, G. M. (1982). Early Proterozoic climates and plate motions inferred from major element chemistry of lutites. Nature, 299, 715–717.', '10.1038/299715a0'],
  ['Total alkali–silica classification', 'Le Bas, M. J., et al. (1986). A chemical classification of volcanic rocks based on the total alkali–silica diagram. Journal of Petrology, 27, 745–750.', '10.1093/petrology/27.3.745'],
  ['Hypsometry', 'Strahler, A. N. (1952). Hypsometric (area-altitude) analysis of erosional topography. GSA Bulletin, 63, 1117–1142.', '10.1130/0016-7606(1952)63[1117:HAAOET]2.0.CO;2'],
  ['Bootstrap', 'Efron, B. (1979). Bootstrap methods: Another look at the jackknife. The Annals of Statistics, 7, 1–26.', '10.1214/aos/1176344552'],
  ['Welch’s t-test', 'Welch, B. L. (1947). The generalization of “Student’s” problem when several different population variances are involved. Biometrika, 34, 28–35.', '10.1093/biomet/34.1-2.28'],
];
/* Similarity matrix: one row per subject, one cell per score component, shaded by its percent. */
function scientistResults() {
  const C = LAB.analysis(); if (!C) return '';
  const rows = C.parts.map(p => {
    const r = S.results[p.subject];
    const cells = r.components.map(x => { const v = Math.max(0, Math.min(100, x.percent || 0)); return `<div class="mcell" style="--v:${(v / 100).toFixed(3)}"><span class="mname">${esc(x.name)}</span><span class="mval">${pct(x.percent)}</span></div>`; }).join('');
    return `<div class="mrow"><div class="mhead"><b>${esc(LAB.t('s_' + p.subject))}</b><span class="mval">${pct(r.likeness)}</span><span class="small mute">${r.ci95 ? `95% CI ${pct(r.ci95[0])} to ${pct(r.ci95[1])}` : 'no interval'} · weight ${pct(100 * p.share)} · ${r.bootstrapResamples ?? '–'} resamples</span></div><div class="mcells">${cells}</div></div>`;
  }).join('');
  return `<div class="card"><h2>Similarity matrix</h2><p class="mute small">Score components by subject. Each subject index is the arithmetic mean of its row. Cell shading is proportional to the component score, from 0% (none) to 100% (full).</p><div class="matrix">${rows}</div></div>`;
}
function csvOf(d) {
  const q = v => v == null || (typeof v === 'number' && !isFinite(v)) ? '' : String(v);
  let head, n, col;
  if (d.subject === 'composition') { const ks = Object.keys(d.comps); head = ks.map(k => `${k} (%)`); n = Math.max(...ks.map(k => d.comps[k].length)); col = ks.map(k => d.comps[k]); }
  else if (d.subject === 'topography') { head = ['elevation_m']; col = [d.z]; n = d.z.length; if (d.lat && d.lat.length === n) { head.push('lat_deg', 'lon_deg'); col.push(d.lat, d.lon); } if (d.slope && d.slope.length === n) { head.push('slope_deg'); col.push(d.slope); } }
  else { head = ['temperature_K']; col = [d.T]; n = d.T.length; if (d.hour) { head.push('local_hour'); col.push(d.hour); } if (d.ls) { head.push('Ls_deg'); col.push(d.ls); } if (d.lat && d.lat.some(isFinite)) { head.push('lat_deg', 'lon_deg'); col.push(d.lat, d.lon); } }
  const out = [head.join(',')];
  for (let i = 0; i < n; i++) out.push(col.map(c => q(c[i])).join(','));
  return out.join('\n');
}
function scientistTail() {
  const subs = SUBJECTS.filter(s => S.results[s] && S.data[s] && S.data[s].c && S.data[s].e);
  const raw = subs.length ? `<div class="scroll"><table class="stack audtable"><thead><tr><th>Subject</th><th>Other world</th><th>Earth</th></tr></thead><tbody>${subs.map(s => {
    const n = d => (d.T || d.z || { length: d.n }).length.toLocaleString();
    return `<tr><td data-l="Subject"><b>${esc(LAB.t('s_' + s))}</b></td><td data-l="Other world"><button type="button" data-csv="${s}:c">CSV, ${n(S.data[s].c)} rows</button></td><td data-l="Earth"><button type="button" data-csv="${s}:e">CSV, ${n(S.data[s].e)} rows</button></td></tr>`;
  }).join('')}</tbody></table></div><div class="actions"><button type="button" id="rawjson">Download all results (JSON)</button><span class="small mute">Includes every statistic, component score and bootstrap draw.</span></div>` : '<p class="mute">Run a comparison to export its data.</p>';
  return `<div class="audgrid two">
    <div><h2>Raw data</h2><p class="mute small">The values as the engine read them: converted to kelvin, metres and percent, with fill values removed. Latitude and longitude are included where the file had them.</p>${raw}</div>
    <div><h2>References</h2><p class="mute small">Peer-reviewed sources for the data products and methods used here.</p><ol class="refs">${REFERENCES.map(([topic, cite, doi]) => `<li><span class="small mute">${esc(topic)}</span><br>${esc(cite)} ${link('https://doi.org/' + doi, 'doi:' + doi)}</li>`).join('')}</ol></div>
  </div>`;
}
function wireScientistTail(root) {
  root.querySelectorAll('[data-csv]').forEach(b => b.onclick = () => { const [s, r] = b.dataset.csv.split(':'); save(`${s}-${r === 'c' ? 'other-world' : 'earth'}.csv`, csvOf(S.data[s][r]), 'text/csv'); });
  const j = root.querySelector('#rawjson');
  if (j) j.onclick = () => save('analog-results.json', JSON.stringify({ combined: S.combined, weights: S.w, results: S.results }, (k, v) => ArrayBuffer.isView(v) ? Array.from(v) : v, 1), 'application/json');
}

/* =====================================================================================================
 * MANAGERS
 * ===================================================================================================== */
/* Market size and growth, as published. Estimates differ because each firm defines the space economy differently. */
const MARKET = [
  { stat: '$686 billion', what: 'Global space economy in 2025, up 12% on 2024. Commercial activity was $544.3 billion, 79% of the total.', src: ['Space Foundation, The State of the Global Space Economy (2026), as reported by NextMSC', 'https://www.nextmsc.com/news/commercial-rockets-surge-as-space-economy-hits-686-billion'] },
  { stat: '$626.4 billion', what: 'Global space economy in 2025 on a narrower definition, forecast to reach $1.01 trillion by 2034 (5.5% a year).', src: ['Novaspace, Space Economy Report, 12th edition (January 2026)', 'https://nova.space/?p=25639'] },
  { stat: '$1.8 trillion', what: 'Projected space economy in 2035, up from $630 billion in 2023, growing at almost twice the rate of global GDP.', src: ['World Economic Forum and McKinsey (April 2024)', 'https://www.weforum.org/media/space-economy-set-to-triple-to-1-8-trillion-by-2035-new-research-reveals/'] },
  { stat: '$12.4 billion', what: 'Private investment in space companies in 2025, up 48% on 2024. About $7.3 billion of it went to US companies.', src: ['Seraphim Space data, reported by TechRepublic (January 2026)', 'https://www.techrepublic.com/article/news-space-sector-investment-growth-2026/'] },
];
/* amount = US$ millions, used for sorting and filtering. shown = the figure as published. */
const SRC = {
  oig: ['NASA Office of Inspector General, IG-22-003 (2021)', 'https://oig.nasa.gov/docs/IG-22-003.pdf'],
  clps: ['NASA, Commercial Lunar Payload Services', 'https://www.nasa.gov/missions/artemis/clps'],
  jatan: ['Jatan Mehta, NASA CLPS Moon missions', 'https://jatan.space/nasa-clps-moon-missions/'],
};
const INVESTMENTS = [
  { name: 'Artemis programme, fiscal years 2012 to 2025', field: 'Human lunar exploration', funding: 'Public', year: 2021, amount: 93000, shown: '$93 billion', status: 'In progress', note: 'Projected NASA spending on the whole Artemis effort up to 2025.', src: SRC.oig },
  { name: 'One Artemis launch (SLS rocket, Orion and ground systems)', field: 'Human lunar exploration', funding: 'Public', year: 2021, amount: 4100, shown: '$4.1 billion per launch', status: 'In progress', note: 'Estimated production and operations cost for each of the first four Artemis flights.', src: SRC.oig },
  { name: 'SpaceX Starship Human Landing System', field: 'Crewed lunar landers', funding: 'Public', year: 2021, amount: 2890, shown: '$2.89 billion', status: 'In progress', note: 'Fixed-price NASA contract for the first crewed Artemis lander.', src: ['Via Satellite (April 2021)', 'https://www.satellitetoday.com/launch/2021/04/19/spacex-beats-out-blue-origin-dynetics-for-2-89b-nasa-moon-lander-contract'] },
  { name: 'Blue Origin Blue Moon Human Landing System', field: 'Crewed lunar landers', funding: 'Public', year: 2023, amount: 3400, shown: '$3.4 billion', status: 'In progress', note: 'NASA’s second crewed lander contract, awarded to keep two providers.', src: ['SpacePolicyOnline (May 2023)', 'https://spacepolicyonline.com/news/blue-origin-team-wins-nasas-second-hls-contract/'] },
  { name: 'Commercial Lunar Payload Services, contract ceiling', field: 'Robotic lunar delivery', funding: 'Public', year: 2018, amount: 2600, shown: 'Up to $2.6 billion through November 2028', status: 'In progress', note: 'Combined maximum value across a pool of 13 eligible US companies.', src: SRC.clps },
  { name: 'Firefly Blue Ghost Mission 1', field: 'Robotic lunar delivery', funding: 'Public', year: 2025, amount: 93.3, shown: '$93.3 million', status: 'Delivered', note: 'Landed and completed its science operations on the Moon.', src: SRC.jatan },
  { name: 'Astrobotic Peregrine Mission 1', field: 'Robotic lunar delivery', funding: 'Public', year: 2024, amount: 79.5, shown: '$79.5 million', status: 'Not delivered', note: 'Failed in transit, so no landing was attempted.', src: SRC.jatan },
  { name: 'Intuitive Machines IM-1', field: 'Robotic lunar delivery', funding: 'Public', year: 2024, amount: 77, shown: '$77 million', status: 'Partly delivered', note: 'Reached the surface with a hard landing.', src: SRC.jatan },
  { name: 'Intuitive Machines IM-2', field: 'Robotic lunar delivery', funding: 'Public', year: 2025, amount: 47, shown: '$47 million', status: 'Not delivered', note: 'Landed on its side and the mission failed.', src: SRC.jatan },
  { name: 'Chandrayaan-3 (India)', field: 'Robotic lunar delivery', funding: 'Public', year: 2023, amount: 75, shown: '₹615 crore (about $75 million)', status: 'Delivered', note: 'Reported budget of India’s 2023 lunar landing mission.', src: ['India TV News (August 2023)', 'https://www.indiatvnews.com/news/india/what-was-chandrayaan-3-s-budget-a-look-at-budgets-of-other-moon-missions-of-different-countries-2023-08-24-888658'] },
  { name: 'Mars 2020 Perseverance rover', field: 'Mars and outer-planet science', funding: 'Public', year: 2020, amount: 2725, shown: '$2.725 billion', status: 'Delivered', note: 'Development $2.2 billion, launch $243 million, and about $300 million for two years of operations.', src: ['The Planetary Society, Cost of Perseverance', 'https://planetary.org/space-policy/cost-of-perseverance'] },
  { name: 'Dragonfly rotorcraft to Titan', field: 'Mars and outer-planet science', funding: 'Public', year: 2024, amount: 3350, shown: '$3.35 billion', status: 'In progress', note: 'Total life-cycle cost confirmed by NASA, with launch planned for July 2028.', src: ['NASA Science (April 2024)', 'https://science.nasa.gov/missions/dragonfly/nasas-dragonfly-rotorcraft-mission-to-saturns-moon-titan-confirmed/'] },
  { name: 'LUNA analog facility, Cologne', field: 'Analog facilities', funding: 'Public', year: 2022, amount: 27, shown: '€25 million pledged (about $27 million)', status: 'Delivered', note: 'State funding pledged by North Rhine-Westphalia. The hall opened in September 2024.', src: ['DLR (September 2024)', 'https://www.dlr.de/en/latest/news/2024/training-facility-for-astronautical-and-robotic-missions-to-the-moon'] },
  { name: 'Private investment in space companies, 2025', field: 'Private capital', funding: 'Private', year: 2025, amount: 12400, shown: '$12.4 billion', status: 'Annual total', note: 'All private funding rounds worldwide in the year, up 48% on 2024.', src: MARKET[3].src },
];
const CASES = [
  { title: 'LUNA: a Moon surface indoors', money: '€25 million pledged by North Rhine-Westphalia. ESA paid for the hall and DLR for its equipment.', built: 'A 700 square metre simulated lunar surface holding up to 900 tonnes of regolith simulant.', result: 'Opened on 25 September 2024 as a shared ESA and DLR training and test site.', lesson: 'A purpose-built analog gives repeatable conditions. A natural site, like those this lab compares, gives realism at far lower cost.', src: INVESTMENTS[12].src },
  { title: 'CLPS: paying for delivery, not hardware', money: 'Up to $2.6 billion through November 2028, spent as fixed-price task orders of $47 million to $93 million each on the first four flights.', built: 'A market of 13 eligible companies that NASA can hire to land instruments on the Moon.', result: 'Of the first four flights, one fully succeeded (Blue Ghost, 2025), one made a hard landing and two failed.', lesson: 'Low prices came with a mixed record. Testing landers and instruments at analog sites first is one way to improve the odds.', src: SRC.jatan },
  { title: 'Human Landing System: two providers', money: '$2.89 billion to SpaceX (2021) and $3.4 billion to Blue Origin (2023).', built: 'Two independent crewed lunar landers under fixed-price contracts.', result: 'Both landers are due to be tested with Orion in Earth orbit on Artemis III in 2027.', lesson: 'Funding two suppliers costs more up front and protects the schedule if one slips.', src: ['Payload (October 2026)', 'https://payloadspace.com/nasa-outlines-the-details-of-artemis-iii-and-iv-missions/'] },
  { title: 'Perseverance: a flagship built on field testing', money: '$2.725 billion in total, of which $2.2 billion was spacecraft development.', built: 'A rover that drills and stores Mars rock samples in Jezero crater.', result: 'Landed in February 2021 and has operated on Mars since.', lesson: 'Flagship missions lean on years of rover and instrument trials at desert and volcanic analog sites on Earth.', src: INVESTMENTS[10].src },
];
const inv = { field: 'all', funding: 'all', status: 'all', min: 0, sort: 'amount' };
const MIN_STEPS = [0, 50, 100, 1000, 3000, 10000];
function investmentRows() {
  const list = INVESTMENTS.filter(x => (inv.field === 'all' || x.field === inv.field) && (inv.funding === 'all' || x.funding === inv.funding) && (inv.status === 'all' || x.status === inv.status) && x.amount >= inv.min)
    .sort((a, b) => inv.sort === 'year' ? b.year - a.year || b.amount - a.amount : inv.sort === 'name' ? a.name.localeCompare(b.name) : b.amount - a.amount);
  const sorted = [...list].sort((a, b) => a.amount - b.amount), med = sorted.length ? (sorted[(sorted.length - 1) >> 1].amount + sorted[sorted.length >> 1].amount) / 2 : null;
  const sum = list.length ? `${list.length} of ${INVESTMENTS.length} shown. Largest: ${money(sorted[sorted.length - 1].amount)}. Median: ${money(med)}.` : 'No investments match these filters. Widen a filter to see more.';
  const rows = list.map(x => `<tr><td data-l="Investment"><b>${esc(x.name)}</b><br><span class="small mute">${esc(x.note)}</span></td><td data-l="Field">${esc(x.field)}</td><td data-l="Amount">${esc(x.shown)}</td><td data-l="Year">${x.year}</td><td data-l="Outcome"><span class="status s-${x.status.replace(/\s/g, '').toLowerCase()}">${esc(x.status)}</span></td><td data-l="Source">${link(x.src[1], x.src[0])}</td></tr>`).join('');
  return { sum, rows };
}
function managerPanel() {
  const opt = (vals, cur) => vals.map(v => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
  const fields = [...new Set(INVESTMENTS.map(x => x.field))], statuses = [...new Set(INVESTMENTS.map(x => x.status))];
  const prices = INVESTMENTS.filter(x => ['One Artemis launch (SLS rocket, Orion and ground systems)', 'Mars 2020 Perseverance rover', 'Firefly Blue Ghost Mission 1', 'Intuitive Machines IM-2', 'Chandrayaan-3 (India)'].includes(x.name));
  const market = `<p class="mute">Published estimates of the market and its growth. They differ because each firm draws the edge of the “space economy” in a different place.</p>
    <div class="audgrid">${MARKET.map(m => `<div class="card stat"><div class="statnum">${esc(m.stat)}</div><p>${esc(m.what)}</p><p class="small">${link(m.src[1], m.src[0])}</p></div>`).join('')}</div>
    <h3 class="audh">What exploration costs</h3>
    <div class="scroll"><table class="stack audtable"><thead><tr><th>Benchmark</th><th>Price</th><th>Source</th></tr></thead><tbody>${prices.map(x => `<tr><td data-l="Benchmark"><b>${esc(x.name)}</b><br><span class="small mute">${esc(x.note)}</span></td><td data-l="Price">${esc(x.shown)}</td><td data-l="Source">${link(x.src[1], x.src[0])}</td></tr>`).join('')}</tbody></table></div>`;
  const cases = `<div class="audgrid two">${CASES.map(c => `<div class="card"><h3>${esc(c.title)}</h3><dl class="case"><dt>Money</dt><dd>${esc(c.money)}</dd><dt>What it bought</dt><dd>${esc(c.built)}</dd><dt>Result</dt><dd>${esc(c.result)}</dd><dt>Takeaway</dt><dd>${esc(c.lesson)}</dd></dl><p class="small">${link(c.src[1], 'Source: ' + c.src[0])}</p></div>`).join('')}</div>`;
  const { sum, rows } = investmentRows();
  const analyzer = `<p class="mute">Filter published investments in lunar and planetary exploration by field, funding, outcome and size.</p>
    <div class="row invfilters">
      <div><label for="inv-field">Field</label><select id="inv-field"><option value="all">All fields</option>${opt(fields, inv.field)}</select></div>
      <div><label for="inv-funding">Funding</label><select id="inv-funding"><option value="all">Public and private</option>${opt(['Public', 'Private'], inv.funding)}</select></div>
      <div><label for="inv-status">Outcome</label><select id="inv-status"><option value="all">Any outcome</option>${opt(statuses, inv.status)}</select></div>
      <div><label for="inv-min">Minimum size</label><select id="inv-min">${MIN_STEPS.map(v => `<option value="${v}"${v === inv.min ? ' selected' : ''}>${v ? money(v) + ' or more' : 'Any size'}</option>`).join('')}</select></div>
      <div><label for="inv-sort">Sort by</label><select id="inv-sort"><option value="amount">Largest first</option><option value="year"${inv.sort === 'year' ? ' selected' : ''}>Newest first</option><option value="name"${inv.sort === 'name' ? ' selected' : ''}>Name</option></select></div>
    </div>
    <p id="invsum" class="invsum" role="status">${esc(sum)}</p>
    <div class="scroll"><table class="stack audtable inv"><thead><tr><th>Investment</th><th>Field</th><th>Amount</th><th>Year</th><th>Outcome</th><th>Source</th></tr></thead><tbody id="invrows">${rows}</tbody></table></div>
    <p class="small mute">Amounts are as published and are not adjusted for inflation. The year is the award, launch or report year. Programme totals include some of the contracts listed, so rows should not be added together. This is reference information, not investment advice.</p>`;
  return `<h2>For programme leaders</h2>` + tabs('manager', [{ id: 'market', label: 'Market benchmarks', html: market }, { id: 'cases', label: 'Case studies', html: cases }, { id: 'analyzer', label: 'Investment analyzer', html: analyzer }]);
}
function wireManager(root) {
  const upd = () => { const { sum, rows } = investmentRows(); root.querySelector('#invsum').textContent = sum; root.querySelector('#invrows').innerHTML = rows; };
  [['inv-field', 'field'], ['inv-funding', 'funding'], ['inv-status', 'status'], ['inv-sort', 'sort']].forEach(([id, k]) => { root.querySelector('#' + id).onchange = e => { inv[k] = e.target.value; upd(); }; });
  root.querySelector('#inv-min').onchange = e => { inv.min = +e.target.value; upd(); };
}
/* Decision brief: the same results, read as go or no-go for field testing. Uses the engine's built-in assessment. */
function managerResults() {
  const C = LAB.analysis(); if (!C) return '';
  const ctx = LAB.ctxFor(C.parts[0].subject), p = C.likeness;
  const call = p >= 60 ? 'Suitable for field testing across the subjects compared.' : p >= 35 ? 'Suitable for targeted field tests. Check which subjects match before committing.' : p >= 15 ? 'Useful for a few specific tests only.' : 'Not a suitable stand-in on these measures. Consider other sites.';
  const rows = C.parts.map(part => { const a = ENG.ruleBasedAssessment(S.results[part.subject], LAB.ctxFor(part.subject)); return `<tr><td data-l="Subject"><b>${esc(LAB.t('s_' + part.subject))}</b></td><td data-l="Fit">${pct(part.likeness)}</td><td data-l="Counts for">${pct(100 * part.share)}</td><td data-l="Test here?">${esc(a.should)}</td><td data-l="First test to run">${esc(a.experiments && a.experiments[0] ? a.experiments[0].title : 'None recommended')}</td></tr>`; }).join('');
  return `<div class="card"><h2>Decision brief</h2><p class="kidbig">${esc(call)}</p>
    <p class="mute">${esc(cap(ctx.earthSite))} as a stand-in for ${esc(ctx.celestialSite)}: ${pct(p)} overall fit${C.ci95 ? `, with a 95% range of ${pct(C.ci95[0])} to ${pct(C.ci95[1])}` : ''}.</p>
    <div class="scroll"><table class="stack audtable"><thead><tr><th>Subject</th><th>Fit</th><th>Counts for</th><th>Test here?</th><th>First test to run</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="small mute">This compares measured data only. Gravity, air pressure and radiation at the Earth site will always differ from the target.</p></div>`;
}

/* ================= putting the panels on the page ================= */
function renderPanel() {
  const sec = $('audpanel'), box = $('audpanelin');
  const html = { kids: kidsPanel, students: studentsPanel, educators: educatorsPanel, manager: managerPanel }[activeAudience];
  sec.classList.toggle('hidden', !html);
  if (!html) { box.innerHTML = ''; return; }
  const back = returnTo ? `<div class="msg ok preview"><b>You are previewing Kids mode.</b><div class="fix">This is what your pupils see. <button type="button" id="backto">Back to Educators</button></div></div>` : '';
  box.innerHTML = back + html() + `<p class="jump"><a href="#compare">Go to the comparison tool</a></p>`;
  if (returnTo) box.querySelector('#backto').onclick = () => setAudience(returnTo);
  wireTabs(box, activeAudience);
  if (activeAudience === 'kids') box.querySelector('#kidnext').onclick = () => { factIndex = (factIndex + 1) % KID_FACTS.length; box.querySelector('#kidfact').textContent = KID_FACTS[factIndex]; };
  if (activeAudience === 'educators') wireEducators(box);
  if (activeAudience === 'manager') wireManager(box);
}
function renderResults() {
  const fn = { kids: kidsResults, scientist: scientistResults, manager: managerResults }[activeAudience];
  let html = '';
  try { html = fn ? fn() : ''; } catch (e) { html = ''; }
  $('audresults').classList.toggle('hidden', !html);
  $('audresultsin').innerHTML = html;
}
function renderTail() {
  const on = activeAudience === 'scientist' && !!LAB.analysis();   // zero state: nothing to export until real results exist
  $('audtail').classList.toggle('hidden', !on);
  $('audtailin').innerHTML = on ? scientistTail() : '';
  if (on) wireScientistTail($('audtailin'));
}

/* ================= start ================= */
buildPills();
window.addEventListener('lab:overall', () => { renderResults(); renderTail(); });
setAudience(initialAudience());
window.LAB_AUDIENCE = { set: setAudience, get: () => activeAudience, modes: MODES.map(m => m.id) };
(function(){var tb=document.getElementById('topbar');if(!tb)return;
function m(){document.documentElement.style.setProperty('--tbh',tb.offsetHeight+'px')}
m();if(window.ResizeObserver)new ResizeObserver(m).observe(tb);window.addEventListener('resize',m)})();
})();
