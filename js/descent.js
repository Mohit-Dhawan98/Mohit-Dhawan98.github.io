/* The home hero: a map of a model's error, seen from above, drawn in small square cells (five greys, orange and white).
   Bright is high error, dark is low. Contour rings close around each low point.
   An orange path is gradient descent: plain steps downhill, each as long as the slope is steep, so it slows as the ground flattens.

   The map never moves. A click starts a run where the pointer is. The whole path is worked out at once, then played back
   over four to six seconds: a white head, an orange trail, a square where it started, a ring and a label where it settled.
   The readout follows the run: steps, error, and a small curve of error against steps.

   Runs only while the hero is on screen and the tab is visible, at about 30 frames a second, never wider than 400 cells.
   With reduced motion it draws one finished, labelled run, and a click draws its finished path at once.
   No images, no libraries. */
(function () {
  "use strict";
  const hero = document.querySelector("[data-descent]"); if (!hero) return;
  const mo = window.motion || {}, reduced = !!mo.reduced, sound = mo.sound || { play() {} };
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const cv = hero.querySelector(".hero-cv"), ctx = cv.getContext("2d", { alpha: false });
  const layer = hero.querySelector(".hero-labels"), hint = hero.querySelector(".hud-hint");
  const R = { who: hero.querySelector("[data-run-who]"), steps: hero.querySelector("[data-run-steps]"), err: hero.querySelector("[data-run-err]"), state: hero.querySelector("[data-run-state]"), curve: hero.querySelector("[data-run-curve]") };

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const PAL = [[0, 0, 0], [38, 38, 38], [84, 84, 84], [146, 146, 146], [232, 232, 232], [255, 89, 4], [255, 255, 255]];
  const PAL32 = new Uint32Array(PAL.map(([r, g, b]) => (255 << 24 | b << 16 | g << 8 | r) >>> 0));
  const ORANGE = 5, WHITE = 6;

  /* ---- The surface. Coordinates: v runs 0..1 down the hero, u runs 0..A across it (A is width over height), so distance is the same both ways. ---- */
  let A = 1.6, basins = [], lo = 0, hi = 1, best = null;
  function layout(narrow) {
    return narrow
      ? [{ x: 0.6, y: 0.63, d: 1, s: 0.11 }, { x: 0.2, y: 0.74, d: 0.55, s: 0.065 }, { x: 0.86, y: 0.5, d: 0.45, s: 0.06 }]
      : [{ x: 0.665, y: 0.42, d: 1, s: 0.2 }, { x: 0.43, y: 0.7, d: 0.55, s: 0.125 }, { x: 0.9, y: 0.68, d: 0.5, s: 0.115 }];
  }
  function raw(u, v) {
    const g = basins[0], du = u - g.u, dv = v - g.v;
    let h = 0.42 * (du * du + dv * dv) + 0.02 * Math.sin(3.1 * u + 1) * Math.cos(4.3 * v + 2);
    for (const b of basins) { const x = u - b.u, y = v - b.v; h -= b.d * Math.exp(-(x * x + y * y) / (2 * b.s * b.s)); }
    return h;
  }
  const err = (u, v) => 0.03 + 0.97 * (raw(u, v) - lo) / (hi - lo);          // "error": 0.03 at the lowest point, 1 at the highest on screen

  /* ---- Canvas state ---- */
  let cw = 0, ch = 0, cell = 4, img, img32, base, running = false, visible = false, raf = 0, last = 0;
  let px = -1, py = -1, inside = false, runs = [], runId = 0, shown = false;
  const toUV = (cx, cy) => [cx / cw * A, cy / ch], toCell = (u, v) => [u / A * cw, v * ch];

  function size() {
    const w = hero.clientWidth, h = hero.clientHeight; if (!w || !h) return;
    const narrow = w < 640;
    cell = narrow ? 3 : Math.max(4, Math.ceil(w / 400));
    const nw = Math.ceil(w / cell), nh = Math.ceil(h / cell);
    if (nw === cw && nh === ch) return;
    cw = nw; ch = nh; cv.width = cw; cv.height = ch; cv.style.width = cw * cell + "px"; cv.style.height = ch * cell + "px";
    hero.style.setProperty("--cell", cell + "px");
    img = ctx.createImageData(cw, ch); img32 = new Uint32Array(img.data.buffer); base = new Uint8Array(cw * ch);
    A = cw / ch; basins = layout(narrow).map(b => ({ u: b.x * A, v: b.y, d: b.d, s: b.s }));
    build();
    runs.forEach(r => r.labels.forEach(l => l.remove())); runs = [];
    staticLabels();
    if (reduced || shown) { const r = start(...demoStart(), false); finish(r); } else if (visible) demo();
    draw(performance.now());
  }

  /* Draw the map once into `base`: brightness is height, with relief from a light at the upper left and a bright line at every contour.
     It is dimmed under the page's own text and sinks to black along the bottom edge. */
  function build() {
    const H = new Float32Array(cw * ch); lo = 1e9; hi = -1e9;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const h = raw((x + 0.5) / cw * A, (y + 0.5) / ch); H[y * cw + x] = h; if (h < lo) lo = h; if (h > hi) hi = h; }
    best = { h: 1e9 };
    for (const b of basins) {                                   // where each basin really bottoms out, and which is lowest
      let u = b.u, v = b.v;
      for (let k = 0; k < 400; k++) { const e = 1e-4, gx = (raw(u + e, v) - raw(u - e, v)) / (2 * e), gy = (raw(u, v + e) - raw(u, v - e)) / (2 * e); u -= 0.0006 * gx; v -= 0.0006 * gy; }
      b.mu = u; b.mv = v; b.h = raw(u, v); if (b.h < best.h) best = b;
    }
    lo = best.h;
    const hr = hero.getBoundingClientRect(), dim = [];
    hero.querySelectorAll("h1, .hero-id, .hero-key, .hero-bl, .hero-br").forEach(el => { const r = el.getBoundingClientRect(); if (r.width) dim.push([(r.left - hr.left) / cell, (r.top - hr.top) / cell, (r.right - hr.left) / cell, (r.bottom - hr.top) / cell]); });
    const STEP = 0.055, pad = 26 / cell * 4;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const i = y * cw + x, h = H[i], n = (h - lo) / (hi - lo);
      const hx = H[y * cw + Math.min(cw - 1, x + 1)], hy = H[Math.min(ch - 1, y + 1) * cw + x];
      const gx = (hx - h) * ch, gy = (hy - h) * ch;                       // slope per unit of v
      let s = 0.02 + 1.75 * Math.pow(n, 1.15) + Math.max(-0.7, Math.min(0.7, (gx * 0.62 + gy * 0.5) * 0.45));   // lit from the upper left
      const band = Math.floor(n / STEP);
      if (band !== Math.floor((hx - lo) / (hi - lo) / STEP) || band !== Math.floor((hy - lo) / (hi - lo) / STEP)) s = Math.min(4, s + 1.7);   // a contour line
      let m = 1;
      for (const [x0, y0, x1, y1] of dim) {
        const dx = Math.max(x0 - x, 0, x - x1), dy = Math.max(y0 - y, 0, y - y1), d = Math.hypot(dx, dy) / pad;
        m = Math.min(m, 0.16 + 0.84 * Math.min(1, d));
      }
      const fy = y / ch; if (fy > 0.84) m *= Math.max(0, 1 - (fy - 0.84) / 0.14);
      const ty = y * cell; if (ty < 76) m *= 0.15 + 0.85 * ty / 76;                       // quiet behind the nav
      const l = s * m + BAYER[(y & 3) << 2 | x & 3] | 0;
      base[i] = l < 0 ? 0 : l > 4 ? 4 : l;
    }
  }

  /* ---- A run: gradient descent, worked out in full, then played back ---- */
  function path(u, v) {
    const pts = [[u, v, err(u, v)]], maxStep = 2 / ch, e = 0.5 / ch;
    for (let k = 0; k < 900; k++) {
      const gx = (raw(u + e, v) - raw(u - e, v)) / (2 * e), gy = (raw(u, v + e) - raw(u, v - e)) / (2 * e);
      let sx = -0.0016 * gx, sy = -0.0016 * gy; const len = Math.hypot(sx, sy);
      if (len > maxStep) { sx *= maxStep / len; sy *= maxStep / len; }
      if (Math.hypot(sx, sy) < 0.06 / ch) break;                          // the ground is flat: it has settled
      const h0 = raw(u, v); let t = 1; while (t > 0.05 && raw(u + sx * t, v + sy * t) > h0) t /= 2;   // never a step uphill
      if (t <= 0.05) break;
      u = Math.max(0, Math.min(A, u + sx * t)); v = Math.max(0, Math.min(1, v + sy * t));
      pts.push([u, v, Math.min(pts[pts.length - 1][2], err(u, v))]);
    }
    return pts;
  }
  function label(cls, html, u, v, side, left) {
    const el = document.createElement("div"); el.className = "hl " + cls; el.innerHTML = html; layer.appendChild(el);
    const [cx, cy] = toCell(u, v), W = hero.clientWidth, w = el.offsetWidth, h = el.offsetHeight;
    let x = left ? cx * cell - w - 12 : cx * cell + 12, y = side === "below" ? cy * cell + 12 : cy * cell - h - 12;
    if (x + w > W - 8) x = cx * cell - w - 12; if (x < 8) x = cx * cell + 12; if (x + w > W - 8) x = W - 8 - w; if (y < 72) y = cy * cell + 14;
    el.style.left = x + "px"; el.style.top = y + "px"; return el;
  }
  const box = e => { const l = parseFloat(e.style.left) || 0, t = parseFloat(e.style.top) || 0; return { left: l, top: t, right: l + e.offsetWidth, bottom: t + e.offsetHeight }; };   // from the set position, not the rendered one, which may still be easing in
  const hits = (a, b) => { const x = box(a), y = box(b); return x.left < y.right + 4 && y.left < x.right + 4 && x.top < y.bottom + 4 && y.top < x.bottom + 4; };
  function staticLabels() {
    layer.querySelectorAll(".hl-min").forEach(n => n.remove());
    label("hl-min", "lowest point on the map", best.mu, best.mv, "below");
  }
  function start(u, v, byUser) {
    const pts = path(u, v), n = pts.length - 1, r = { id: ++runId, pts, n, i: 0, user: byUser, t0: performance.now(), dur: Math.max(4500, Math.min(6000, n / 30 * 1000)), done: false, pulse: 0, labels: [] };
    runs.forEach(o => { o.labels.forEach(l => l.remove()); o.labels = []; });   // only the newest run keeps its labels
    runs.push(r); while (runs.length > 1) runs.shift();   // one run on the map at a time, so nothing unexplained is left on it
    layer.querySelectorAll(".hl-min").forEach(n => n.hidden = false);
    r.labels.push(label("hl-start", "started here · error " + pts[0][2].toFixed(2), u, v, "above"));
    R.who.textContent = byUser ? "Your run" : "Example run"; R.state.textContent = "learning";
    hint.textContent = byUser ? "Your run. Each step goes downhill; the steps shorten as the ground flattens." : "An example run: a model learning, one step at a time.";
    hint.classList.remove("go"); readout(r);
    return r;
  }
  function settle(r, now) {
    r.done = true; r.i = r.n; r.pulse = now;
    const [u, v, e] = r.pts[r.n], lowest = raw(u, v) - best.h < 0.02 * (hi - lo) && Math.hypot(u - best.mu, v - best.mv) < 0.06;
    r.labels.push(label("hl-end", "<b>settled here</b> · error " + e.toFixed(2) + " · " + r.n + " steps<br>" + (lowest ? "It reached the lowest point on the map." : "A local dip, not the lowest point."), u, v, r.pts[0][1] < v ? "below" : "above", r.pts[0][0] > u));   // the label sits away from the path it ends
    const endL = r.labels[1], startL = r.labels[0];
    if (hits(endL, startL)) { const [su, sv] = r.pts[0]; startL.remove(); r.labels[0] = label("hl-start", startL.innerHTML, su, sv, "below"); if (hits(endL, r.labels[0])) r.labels[0].hidden = true; }   // labels never sit on each other
    layer.querySelectorAll(".hl-min").forEach(n => { n.hidden = false; n.hidden = lowest || hits(endL, n); });
    R.state.textContent = lowest ? "settled at the lowest point" : "settled in a dip, not the lowest"; readout(r);
    hint.textContent = (fine ? "Click" : "Tap") + (r.user ? " somewhere else. Not every start reaches the lowest point." : " anywhere on the map: a model starts learning there."); hint.classList.add("go");
    shown = true;
    if (r.user) sound.play("land");
  }
  function finish(r) { settle(r, performance.now() - 5000); draw(performance.now()); }
  function readout(r) {
    const p = r.pts[r.i]; R.steps.textContent = String(r.i).padStart(3, "0"); R.err.textContent = p[2].toFixed(2);
    const top = Math.max(r.pts[0][2], 0.2), y = k => (20 - r.pts[k][2] / top * 18).toFixed(1), pts = [], stride = Math.max(1, r.n / 60 | 0);
    for (let k = 0; k < r.i; k += stride) pts.push((k / r.n * 96).toFixed(1) + "," + y(k));
    pts.push((r.i / Math.max(1, r.n) * 96).toFixed(1) + "," + y(r.i));
    R.curve.setAttribute("points", pts.join(" "));
  }
  // A start that is high, in clear view, and ends in the lowest basin: the first thing a visitor sees.
  function demoStart() { const g = basins[0], narrow = hero.clientWidth < 640; return narrow ? [g.u - 0.12, g.v - 0.14] : [g.u - 0.36, g.v - 0.22]; }
  function demo() { start(...demoStart(), false); }

  /* ---- Drawing ---- */
  const put = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < cw && y < ch) img32[y * cw + x] = PAL32[c]; };
  function ring(cx, cy, rad, c, dotted) { const n = Math.max(8, rad * 7 | 0); for (let k = 0; k < n; k++) { if (dotted && k & 1) continue; const a = k / n * 6.283; put(cx + Math.cos(a) * rad + 0.5, cy + Math.sin(a) * rad + 0.5, c); } }
  function draw(now) {
    for (let i = 0; i < cw * ch; i++) img32[i] = PAL32[base[i]];
    const [bx, by] = toCell(best.mu, best.mv);                                         // the lowest point: a small white cross
    for (let k = -2; k <= 2; k++) { put(bx + k, by, 4); put(bx, by + k, 4); }
    runs.forEach((r, idx) => {
      const newest = idx === runs.length - 1;
      for (let k = 0; k <= r.i; k++) {                                                 // the trail: solid near the head, dotted further back
        const [x, y] = toCell(r.pts[k][0], r.pts[k][1]), age = r.i - k;
        if (newest ? age < 70 || r.done || (k & 3) < 2 : (k & 3) === 0) put(x, y, newest ? ORANGE : 3);   // only the newest run is orange; older ones fade to grey dots
      }
      const [sx, sy] = toCell(r.pts[0][0], r.pts[0][1]);                               // where it started: a hollow square
      const oc = newest ? ORANGE : 3; for (let k = -2; k <= 2; k++) { put(sx + k, sy - 2, oc); put(sx + k, sy + 2, oc); put(sx - 2, sy + k, oc); put(sx + 2, sy + k, oc); }
      const a = r.pts[r.i], b = r.pts[Math.min(r.n, r.i + 1)], t = r.done ? 0 : Math.max(0, (r.f || 0) - r.i);   // the head glides between steps
      const [hx, hy] = toCell(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      if (r.done) {                                                                    // where it settled: a ring, and a pulse when it arrives
        const t = (now - r.pulse) / 900; if (t >= 0 && t < 1) ring(hx, hy, 4 + t * 14, ORANGE, true);
        ring(hx, hy, 4, oc);
      }
      if (!r.done) for (let k = -2; k <= 2; k++) { put(hx + k, hy - 2, ORANGE); put(hx + k, hy + 2, ORANGE); put(hx - 2, hy + k, ORANGE); put(hx + 2, hy + k, ORANGE); }
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) put(hx + ox, hy + oy, r.done && !newest ? 3 : WHITE);   // the head: a white ball, ringed while it moves
    });
    if (inside && fine) { const cx = px / cell | 0, cy = py / cell | 0; for (const [ox, oy] of [[-4, 0], [-3, 0], [3, 0], [4, 0], [0, -4], [0, -3], [0, 3], [0, 4]]) put(cx + ox, cy + oy, 4); }
    ctx.putImageData(img, 0, 0);
  }

  const pulsing = now => runs.some(r => r.done && now - r.pulse < 950);
  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (now - last < 31) return; last = now;
    let live = false;
    for (const r of runs) if (!r.done) {
      live = true; const f = Math.min(r.n, (now - r.t0) / r.dur * r.n), i = f | 0; r.f = f;
      if (i !== r.i) { r.i = i; readout(r); }
      if (i >= r.n) settle(r, now);
    }
    if (!live && !pulsing(now)) { running = false; cancelAnimationFrame(raf); draw(now); return; }   // nothing moves: stop drawing until something does
    draw(now);
  }
  function setRun() {
    const want = visible && !document.hidden && !reduced;
    if (want && !running) {
      running = true; last = 0; const now = performance.now();
      runs.forEach(r => { if (!r.done) r.t0 = now - r.i / r.n * r.dur; });               // a paused run picks up where it stopped
      if (!runs.length) demo();
      raf = requestAnimationFrame(tick);
    } else if (!want && running) { running = false; cancelAnimationFrame(raf); }
  }

  /* ---- Pointer ---- */
  const tip = document.createElement("div"); tip.className = "hl hl-tip"; tip.hidden = true; layer.appendChild(tip);
  hero.addEventListener("pointermove", e => {
    const r = hero.getBoundingClientRect(); px = e.clientX - r.left; py = e.clientY - r.top; inside = true;
    if (!fine || e.target.closest("a, button, .hero-bl, .hero-br, h1, .hero-id, .hero-key")) { tip.hidden = true; return; }
    const [u, v] = toUV(px / cell, py / cell); tip.hidden = false; tip.textContent = "error here " + err(u, v).toFixed(2);
    tip.style.left = Math.min(r.width - 130, px + 16) + "px"; tip.style.top = py + 18 + "px";
    if (!running) draw(performance.now());
  });
  hero.addEventListener("pointerleave", () => { inside = false; tip.hidden = true; });
  hero.addEventListener("click", e => {
    if (e.target.closest("a, button")) return;
    const r = hero.getBoundingClientRect(), [u, v] = toUV((e.clientX - r.left) / cell, (e.clientY - r.top) / cell);
    if (v > 0.9) return;
    runs.forEach(o => { if (!o.done) { o.done = true; o.i = o.n; o.pulse = -1e9; } });      // an unfinished run steps aside for the visitor's
    const run = start(u, v, true); sound.play("blip"); tip.hidden = true;
    if (reduced) finish(run); else setRun();
  });

  new ResizeObserver(size).observe(hero);
  new IntersectionObserver(es => { visible = es[0].isIntersecting; setRun(); }).observe(hero);
  document.addEventListener("visibilitychange", setRun);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { cw = 0; size(); });   // the text moved once the faces loaded
  size();
})();
