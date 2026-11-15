/* Frontier Labs: space intro (starfield, rotating Earth, dive-in transition) and the spinning solar system. Edit freely.
 * Needs window.EARTH_TEXTURE (an equirectangular Earth image as a data: URL), set in earth-texture.js.
 * After the dive it shows the introduction; the lab opens with the "Enter the lab" button (or "Skip the intro"),
 * and then it dispatches a "lab:enter" event on window.
 */
(function () {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = id => document.getElementById(id);

  /* ---------- starfield ---------- */
  const sc = $('stars'), sg = sc.getContext('2d');
  let stars = [], warp = 0;
  function sizeStars() {
    const d = Math.min(devicePixelRatio || 1, 2); sc.width = innerWidth * d; sc.height = innerHeight * d;
    const n = Math.round(innerWidth * innerHeight / 5200);
    stars = Array.from({ length: n }, () => ({ x: Math.random() * sc.width, y: Math.random() * sc.height, r: (Math.random() ** 4 * 1.25 + .3) * d, a: Math.random() * .55 + .2, p: Math.random() * 6.28, s: Math.random() * .5 + .12, hue: Math.random() < .18 ? (Math.random() < .5 ? 'rgba(206,196,255,' : 'rgba(186,212,255,') : 'rgba(255,255,255,' }));
  }
  function drawStars(t) {
    sg.clearRect(0, 0, sc.width, sc.height);
    const cx = sc.width / 2, cy = sc.height / 2;
    for (const s of stars) {
      const tw = reduce ? 1 : .78 + .22 * Math.sin(t / 1000 * s.s + s.p);
      sg.globalAlpha = s.a * tw;
      if (warp > 0) {
        const k = 1 + warp * .35, x2 = cx + (s.x - cx) * k, y2 = cy + (s.y - cy) * k;
        sg.strokeStyle = s.hue + '1)'; sg.lineWidth = s.r; sg.beginPath(); sg.moveTo(s.x, s.y); sg.lineTo(x2, y2); sg.stroke();
      } else { sg.fillStyle = s.hue + '1)'; sg.beginPath(); sg.arc(s.x, s.y, s.r, 0, 6.2832); sg.fill(); }
    }
    sg.globalAlpha = 1;
  }

  /* ---------- globe renderer: orthographic sphere with axial tilt and fixed sunlight ---------- */
  /* The globe is drawn pixel by pixel. Each frame, every visible point on the disc is turned by the globe's current
     orientation (a 3 × 3 rotation) and looked up in the Blue Marble image, so it can face any direction. */
  function makeGlobe(canvas, tex, res, speed) {
    const N = res; canvas.width = N; canvas.height = N;
    const g = canvas.getContext('2d'), img = g.createImageData(N, N), o = img.data;
    const { data: T, width: TW, height: TH } = tex;
    const idx = [], NX = [], NY = [], NZ = [], SHv = [], RIMv = [];
    let L = [-.5, .38, .78]; const ln = Math.hypot(...L); L = L.map(v => v / ln);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const nx = 2 * (x + .5) / N - 1, ny = 1 - 2 * (y + .5) / N, r2 = nx * nx + ny * ny;
      if (r2 > 1) continue;
      const nz = Math.sqrt(1 - r2), d = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      idx.push(y * N + x); NX.push(nx); NY.push(ny); NZ.push(nz);
      SHv.push((.06 + .94 * Math.pow(d, .85)) * (.78 + .22 * nz)); RIMv.push(Math.pow(1 - nz, 2.6) * (.35 + .65 * d));
    }
    const P = idx.length, I = Int32Array.from(idx), X = Float32Array.from(NX), Y = Float32Array.from(NY), Z = Float32Array.from(NZ), SH = Float32Array.from(SHv), RIM = Float32Array.from(RIMv);
    const AS = new Float32Array(4097); for (let i = 0; i <= 4096; i++) AS[i] = Math.asin(i / 2048 - 1);   // fast arcsine lookup
    // M turns a direction on screen into a direction on the planet. Start with Earth's 23.4° tilt, Americas facing us.
    const mul = (A, B) => [0, 1, 2].flatMap(r => [0, 1, 2].map(c => A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]));
    const rotX = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
    const rotY = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
    const rotZ = a => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
    let M = mul(rotY(.62 * 2 * Math.PI), rotZ(-23.4 * Math.PI / 180));
    let last = performance.now(), running = true, pendX = 0, pendY = 0;
    function draw() {
      const m0 = M[0], m1 = M[1], m2 = M[2], m3 = M[3], m4 = M[4], m5 = M[5], m6 = M[6], m7 = M[7], m8 = M[8], k2 = 1 / (2 * Math.PI);
      for (let p = 0; p < P; p++) {
        const x = X[p], y = Y[p], z = Z[p];
        const bx = m0 * x + m1 * y + m2 * z, by = m3 * x + m4 * y + m5 * z, bz = m6 * x + m7 * y + m8 * z;
        let u = Math.atan2(bx, bz) * k2 + .5; if (u >= 1) u -= 1;
        const lat = AS[((by < -1 ? -1 : by > 1 ? 1 : by) + 1) * 2048 | 0], v = (.5 - lat / Math.PI) * (TH - 1) | 0;
        const k = (v * TW + (u * TW | 0)) * 4, j = I[p] * 4, s = SH[p], r = RIM[p];
        o[j] = T[k] * s + 70 * r; o[j + 1] = T[k + 1] * s + 125 * r; o[j + 2] = T[k + 2] * s + 230 * r; o[j + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }
    function frame(now) {
      const dt = Math.min(.1, (now - last) / 1000); last = now;
      M = mul(rotY(dt * speed * 2 * Math.PI), M);   // the daily spin, about the planet's own axis
      if (pendX || pendY) {                          // turns from the wheel or a drag, about the screen's axes, eased in
        const sx = pendX * .25, sy = pendY * .25; pendX = Math.abs(pendX - sx) < 1e-4 ? 0 : pendX - sx; pendY = Math.abs(pendY - sy) < 1e-4 ? 0 : pendY - sy;
        M = mul(M, mul(rotY(-sx), rotX(sy)));
      }
      draw();
    }
    // dx turns it left and right, dy tips it up and down (radians)
    function nudge(dx, dy = 0) { pendX += dx; pendY += dy; }
    // The latitude and longitude (degrees) under a point of the disc, sx and sy running -1 to 1 from the left and the bottom. null off the globe.
    function pick(sx, sy) {
      const r2 = sx * sx + sy * sy; if (r2 > 1) return null;
      const z = Math.sqrt(1 - r2), bx = M[0] * sx + M[1] * sy + M[2] * z, by = M[3] * sx + M[4] * sy + M[5] * z, bz = M[6] * sx + M[7] * sy + M[8] * z;
      return { lat: Math.asin(Math.max(-1, Math.min(1, by))) * 180 / Math.PI, lon: Math.atan2(bx, bz) * 180 / Math.PI };
    }
    return { frame, nudge, pick, stop() { running = false; }, get running() { return running; } };
  }

  /* ---------- the solar system: planets circling the Sun, Earth and Mars picked out ---------- */
  const PLANETS = [   // name key, colour, size, orbit index, orbital period in years
    ['mercury', '#b9b2a6', 2.4, 0, .24], ['venus', '#e9c47c', 4.2, 1, .62], ['earth', '#4f9dff', 4.6, 2, 1], ['mars', '#e2703f', 3.5, 3, 1.88],
    ['jupiter', '#d8b48d', 10, 4, 11.86], ['saturn', '#e6d29a', 8.4, 5, 29.46], ['uranus', '#93d9e6', 6.2, 6, 84], ['neptune', '#6683ff', 6, 7, 164.8]];
  const oc = $('orrery'), og = oc.getContext('2d');
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) * k | 0},${(n >> 8 & 255) * k | 0},${(n & 255) * k | 0})`; };
  const angle0 = PLANETS.map((p, i) => [5.2, 1.4, 4.1, 2.6, .6, 3.6, 5.6, 2.1][i]);
  let oW = 0, oH = 0, oD = 1, oStars = [], oVisible = false, oT0 = performance.now();
  function sizeOrrery() {
    const r = oc.getBoundingClientRect(); oD = Math.min(devicePixelRatio || 1, 2); oW = r.width; oH = r.height;
    oc.width = Math.max(1, oW * oD); oc.height = Math.max(1, oH * oD);
    oStars = Array.from({ length: Math.round(oW * oH / 1700) }, () => [Math.random() * oW, Math.random() * oH, Math.random() * .9 + .25, Math.random() * .6 + .2]);
  }
  function drawOrrery(now) {
    if (!oW) return;
    const g = og; g.setTransform(oD, 0, 0, oD, 0, 0); g.clearRect(0, 0, oW, oH);
    for (const [x, y, r, a] of oStars) { g.globalAlpha = a; g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, r * .6, 0, 6.283); g.fill(); }
    g.globalAlpha = 1;
    const tilt = .42, cx = oW / 2, cy = oH / 2, maxR = Math.min(oW * .47, oH * .44 / tilt);
    const radius = i => maxR * (.16 + .84 * Math.pow((i + 1) / 8, .9));
    const scale = Math.max(.9, Math.min(1.7, oW / 520));
    const yrs = reduce ? 0 : (now - oT0) / 1000 * .2;   // one Earth year every 5 seconds
    const names = window.labPlanetNames || {};
    const pos = PLANETS.map(([k, col, size, i, per], j) => { const a = angle0[j] + yrs * 2 * Math.PI / per; return { k, col, size: size * scale, x: cx + Math.cos(a) * radius(i), y: cy + Math.sin(a) * radius(i) * tilt, z: Math.sin(a), ring: k === 'saturn' }; });
    // orbits
    g.lineWidth = 1;
    PLANETS.forEach(([k, , , i]) => { g.strokeStyle = k === 'earth' ? 'rgba(98,173,255,.45)' : k === 'mars' ? 'rgba(255,141,94,.45)' : 'rgba(190,185,255,.16)'; g.beginPath(); g.ellipse(cx, cy, radius(i), radius(i) * tilt, 0, 0, 6.283); g.stroke(); });
    const drawPlanet = p => {
      const gr = g.createRadialGradient(p.x - (p.x - cx) * .02 - p.size * .35 * Math.sign(p.x - cx || 1), p.y - p.size * .3, p.size * .1, p.x, p.y, p.size);
      gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.22, p.col); gr.addColorStop(1, shade(p.col, .42));
      if (p.ring) { g.strokeStyle = 'rgba(230,210,154,.55)'; g.lineWidth = Math.max(1, p.size * .28); g.beginPath(); g.ellipse(p.x, p.y, p.size * 2.1, p.size * .62, -.25, 0, 6.283); g.stroke(); }
      g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.size, 0, 6.283); g.fill();
      if (p.k === 'earth' || p.k === 'mars') { g.strokeStyle = p.k === 'earth' ? 'rgba(98,173,255,.8)' : 'rgba(255,141,94,.8)'; g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y, p.size + 5, 0, 6.283); g.stroke(); }
    };
    pos.filter(p => p.z < 0).forEach(drawPlanet);
    // the Sun
    const sr = 17 * scale, glow = g.createRadialGradient(cx, cy, 0, cx, cy, sr * 5);
    glow.addColorStop(0, 'rgba(255,236,190,.95)'); glow.addColorStop(.18, 'rgba(255,196,110,.55)'); glow.addColorStop(.45, 'rgba(196,160,255,.12)'); glow.addColorStop(1, 'rgba(160,140,255,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(cx, cy, sr * 5, 0, 6.283); g.fill();
    g.fillStyle = '#fff4dc'; g.beginPath(); g.arc(cx, cy, sr, 0, 6.283); g.fill();
    pos.filter(p => p.z >= 0).forEach(drawPlanet);
    // labels
    g.textBaseline = 'middle'; g.textAlign = 'left'; g.direction = 'ltr';
    pos.forEach(p => {
      const strong = p.k === 'earth' || p.k === 'mars', name = names[p.k] || p.k[0].toUpperCase() + p.k.slice(1);
      g.font = `${strong ? 700 : 500} ${strong ? 14 : 12}px ${getComputedStyle(document.body).fontFamily}`;
      g.fillStyle = strong ? (p.k === 'earth' ? '#9ccbff' : '#ffb08a') : 'rgba(220,222,255,.72)';
      const tx = p.x + p.size + (strong ? 9 : 6), w = g.measureText(name).width;
      g.fillText(name, Math.min(tx, oW - w - 4), p.y - (strong ? 0 : 1));
    });
  }
  function orreryLoop(now) { if (oVisible && !document.hidden) drawOrrery(now); if (!reduce) requestAnimationFrame(orreryLoop); }
  new ResizeObserver(() => { sizeOrrery(); drawOrrery(performance.now()); }).observe(oc);
  new IntersectionObserver(es => { oVisible = es[0].isIntersecting; if (oVisible) drawOrrery(performance.now()); }, { threshold: 0 }).observe(oc);
  window.labRedrawOrrery = () => drawOrrery(performance.now());
  requestAnimationFrame(orreryLoop);

  /* ---------- wiring ---------- */
  const intro = $('intro'), app = $('app'), flash = $('flash');
  let globes = [], entered = false, bigGlobe = null, pressed = null;   // pressed: { lat, lon } under the pointer when the Earth was clicked
  function loop(t) {
    drawStars(t);
    for (const gl of globes) if (gl.visible()) gl.r.frame(t);
    if (!reduce || warp > 0) requestAnimationFrame(loop);
  }
  function loadTexture(src) {
    return new Promise((ok, no) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext('2d'); x.drawImage(im, 0, 0); ok(x.getImageData(0, 0, c.width, c.height)); }; im.onerror = no; im.src = src; });
  }
  /* Two screens after the dive: the introduction (story and solar system), and the lab behind its own button. */
  function setView(v) { app.classList.toggle('view-lab', v === 'lab'); app.classList.toggle('view-story', v !== 'lab'); }
  function showLab() {
    if (app.classList.contains('view-lab')) return;
    setView('lab'); scrollTo(0, 0);
    window.dispatchEvent(new Event('lab:enter'));
    $('mini').focus({ preventScroll: true });
  }
  window.labShowLab = showLab;
  function showApp(toLab) {
    intro.classList.add('gone'); app.style.display = ''; document.documentElement.classList.add('in-app');
    requestAnimationFrame(() => {
      app.classList.add('in');
      const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .08 });
      document.querySelectorAll('.reveal').forEach((el, i) => { el.style.transitionDelay = Math.min(i, 6) * 90 + 'ms'; io.observe(el); });
      window.labReveal = el => io.observe(el);
    });
    if (toLab) showLab(); else {
      setView('story'); scrollTo(0, 0); $('toLab').focus({ preventScroll: true });
      window.dispatchEvent(new CustomEvent('lab:site', { detail: pressed }));   // the introduction dialog (js/briefing.js) opens for the clicked place
    }
    pressed = null;
  }
  function enter() {
    if (entered) return; entered = true;
    if (reduce) { showApp(); return; }
    intro.classList.add('diving');
    const t0 = performance.now();
    (function ramp(t) { warp = Math.min(1, (t - t0) / 1500); if (warp < 1) requestAnimationFrame(ramp); })(t0);
    setTimeout(() => flash.classList.add('on'), 1150);
    setTimeout(() => { warp = 0; showApp(); flash.classList.remove('on'); flash.classList.add('off'); }, 1650);
    setTimeout(() => flash.classList.remove('off'), 3000);
  }
  function replay() {
    if (reduce) return;
    entered = false; intro.classList.remove('gone', 'diving'); app.classList.remove('in', 'view-lab', 'view-story'); document.documentElement.classList.remove('in-app'); scrollTo(0, 0);
    setTimeout(() => { app.style.display = 'none'; }, 50);
    $('globeBtn').focus();
  }
  /* A clean click (not a drag) reads the place under the pointer, then dives in. Enter or Space on the focused globe has no pointer, so no place. */
  $('globeBtn').addEventListener('click', e => {
    pressed = null;
    if (e.detail > 0 && bigGlobe) { const r = $('globeBtn').getBoundingClientRect(); pressed = bigGlobe.pick(2 * (e.clientX - r.left) / r.width - 1, 1 - 2 * (e.clientY - r.top) / r.height); }
    enter();
  });
  $('skip').addEventListener('click', () => { entered = true; showApp(true); });
  $('toLab').addEventListener('click', showLab);
  $('mini').addEventListener('click', replay);
  addEventListener('resize', () => { sizeStars(); if (reduce) drawStars(0); });
  sizeStars();
  loadTexture(window.EARTH_TEXTURE).then(tex => {
    // A fixed resolution: inside an embedded frame the window can still measure 0 × 0 while the page loads.
    const big = makeGlobe($('globe'), tex, 520, .018);
    const mini = makeGlobe($('miniGlobe'), tex, 120, .03);
    bigGlobe = big;
    globes = [{ r: big, visible: () => !intro.classList.contains('gone') }, { r: mini, visible: () => app.style.display !== 'none' }];
    big.frame(performance.now()); mini.frame(performance.now());
    // Spin the Earth with the scroll wheel, or by dragging it
    const spinWith = (el, gl) => {
      // Mouse wheel tips the Earth up and down, Shift + wheel or a sideways swipe turns it left and right, and dragging turns it any way
      el.addEventListener('wheel', e => {
        e.preventDefault(); const k = e.deltaMode ? 0.05 : 0.0025;
        if (e.shiftKey) gl.nudge(e.deltaY * k, 0); else gl.nudge(e.deltaX * k, e.deltaY * k);
        if (reduce) gl.frame(performance.now());
      }, { passive: false });
      let last = null, moved = 0;
      el.addEventListener('pointerdown', e => { last = [e.clientX, e.clientY]; moved = 0; });
      addEventListener('pointermove', e => {
        if (!last || !(e.buttons & 1)) return;
        const dx = e.clientX - last[0], dy = e.clientY - last[1], w = el.clientWidth || 300; last = [e.clientX, e.clientY]; moved += Math.abs(dx) + Math.abs(dy);
        gl.nudge(dx / w * 3, -dy / w * 3); if (reduce) gl.frame(performance.now());
      });
      addEventListener('pointerup', () => { last = null; });
      addEventListener('pointercancel', () => { last = null; });
      el.addEventListener('keydown', e => {   // the arrow keys turn the globe too
        const k = { ArrowLeft: [-.4, 0], ArrowRight: [.4, 0], ArrowUp: [0, -.4], ArrowDown: [0, .4] }[e.key];
        if (k) { e.preventDefault(); gl.nudge(k[0], k[1]); if (reduce) gl.frame(performance.now()); }
      });
      el.addEventListener('click', e => { if (moved > 6) { e.stopImmediatePropagation(); e.preventDefault(); } moved = 0; }, true);   // a drag isn't a click
    };
    spinWith($('globeBtn'), big); spinWith($('mini'), mini);
    if (reduce) drawStars(0);
  }).catch(() => {
    [$('globe'), $('miniGlobe')].forEach(c => { c.width = c.height = 256; const g = c.getContext('2d'), gr = g.createRadialGradient(90, 80, 10, 128, 128, 128); gr.addColorStop(0, '#9fd0ff'); gr.addColorStop(.5, '#2f6fd6'); gr.addColorStop(1, '#0a1a44'); g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 128, 0, 6.283); g.fill(); });
  });
  requestAnimationFrame(loop);
  if (reduce) drawStars(0);
})();
