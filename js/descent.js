/* The home hero: a model's error drawn as land in perspective, and painted the way photo-to-paint paints a photo.
   The ground is cut into regions by height, each outlined and numbered; "paint" fills the regions with a small palette
   of flat colours, lowest number first, and takes them off again. Four surfaces can be stepped through, each making
   one point about gradient descent. Orange is kept for the run.

   A click starts gradient descent where the pointer is: the path is worked out at once and played back over four to
   six seconds, a bright head ahead of a fading trail, the steps shortening as the ground flattens, a pulse and a small
   square where it settles. The camera never moves. One run at a time; the readout follows it.
   Draws only while on screen, the tab is visible and something moves, at about 30 frames a second, never wider than
   400 cells. With reduced motion every change is drawn finished. The palette follows the page theme. */
(function () {
  "use strict";
  const hero = document.querySelector("[data-descent]"); if (!hero) return;
  const mo = window.motion || {}, reduced = !!mo.reduced, sound = mo.sound || { play() {} };
  const cv = hero.querySelector(".hero-cv"), ctx = cv.getContext("2d", { alpha: false });
  const $ = s => hero.querySelector(s);
  const R = { steps: $("[data-run-steps]"), err: $("[data-run-err]"), curve: $("[data-run-curve]"), cue: $("[data-run-cue]"), verdict: $("[data-run-verdict]"), point: $("[data-surface-point]"), name: $("[data-surface-name]"), paint: $("[data-paint]") };
  const pathTag = $('[data-info="path"]'), groundTag = $('[data-info="ground"]');

  /* ---- Palettes. 0 ground, 1-4 more ink, 5 orange, 6 highlight, 7 outline, 8-14 the paints, lowest ground first ---- */
  const PALS = {
    dark: ["#000000", "#1c1c1c", "#3a3a3a", "#8a8a8a", "#e8e8e8", "#ff5904", "#ffffff", "#7c7c7c",
           "#243241", "#34505c", "#4f675a", "#7d7d5c", "#a48d63", "#c7b591", "#e9e2d2"],
    light: ["#eceae4", "#e0ddd5", "#cbc7bd", "#7b7870", "#2a2926", "#f05000", "#121211", "#8f8b82",
            "#2f4356", "#476877", "#6f8a76", "#a3a27a", "#c2a774", "#dcccab", "#f7f2e6"],
  };
  const hex32 = h => { const n = parseInt(h.slice(1), 16); return (255 << 24 | (n & 255) << 16 | (n >> 8 & 255) << 8 | n >> 16) >>> 0; };
  let PAL32;
  const isDark = () => getComputedStyle(document.documentElement).colorScheme.indexOf("dark") >= 0;
  function setPalette() { PAL32 = new Uint32Array(PALS[isDark() ? "dark" : "light"].map(hex32)); }
  setPalette();
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const ORANGE = 5, HI = 6, LINE = 7, PAINT0 = 8, BANDS = 7;

  /* ---- Four surfaces on one square of ground. u, v run 0..1; v = 1 is far from the viewer ---- */
  const G = (u, v, cu, cv_, s) => Math.exp(-((u - cu) ** 2 + (v - cv_) ** 2) / (2 * s * s));
  const SURFACES = [
    { name: "one bowl", point: "One bowl: from any start, descent reaches the bottom.", start: [0.24, 0.9],
      h: (u, v) => (u - 0.52) ** 2 + (v - 0.5) ** 2 + 0.006 * Math.sin(u * 19) * Math.cos(v * 17) },
    { name: "two valleys", point: "Two valleys with a saddle between: where a run starts decides where it ends.", start: [0.5, 0.92],
      h: (u, v) => 0.55 * ((u - 0.5) ** 2 + (v - 0.5) ** 2) - 0.2 * G(u, v, 0.3, 0.52, 0.13) - 0.17 * G(u, v, 0.72, 0.48, 0.13) },
    { name: "a dip beside the lowest point", point: "A shallow dip beside the true minimum: descent can stop short of it.", start: [0.16, 0.86],
      h: (u, v) => 0.5 * ((u - 0.5) ** 2 + (v - 0.5) ** 2) - 0.22 * G(u, v, 0.64, 0.46, 0.14) - 0.07 * G(u, v, 0.28, 0.62, 0.07) + 0.05 * G(u, v, 0.43, 0.56, 0.06) },
    { name: "bumpy ground", point: "Bumpy ground: small dips catch a run early.", start: [0.82, 0.9],
      h: (u, v) => 0.6 * ((u - 0.5) ** 2 + (v - 0.5) ** 2) + 0.022 * Math.sin(u * 23 + 1) * Math.sin(v * 21 + 2) + 0.012 * Math.cos(u * 41 - v * 37) },
  ];
  const N = 384, M = N - 1, HMAX = 230;
  let Hm, Bm, Em, Lm, labels, gmin, cur = 0;
  const cache = [];
  function build(k) {
    if (cache[k]) return cache[k];
    const S = SURFACES[k], H = new Float32Array(N * N); let lo = 1e9, hi = -1e9;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const h = S.h(x / M, y / M); H[y * N + x] = h; if (h < lo) lo = h; if (h > hi) hi = h; }
    let mn = 1e9;
    for (let i = 0; i < N * N; i++) { H[i] = (H[i] - lo) / (hi - lo) * HMAX; if (H[i] < mn) mn = H[i]; }
    const B = new Uint8Array(N * N), E = new Uint8Array(N * N), L = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) B[i] = Math.min(BANDS - 1, Math.pow(H[i] / HMAX, 0.8) * BANDS | 0);   // a little more detail low down
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, b = B[i];
      if ((x < M && B[i + 1] !== b) || (y < M && B[i + N] !== b)) E[i] = 1;
      const gx = H[y * N + Math.min(M, x + 1)] - H[y * N + Math.max(0, x - 1)], gy = H[Math.min(M, y + 1) * N + x] - H[Math.max(0, y - 1) * N + x];
      L[i] = Math.max(0, Math.min(255, 128 + (gx * -0.9 + gy * 0.8) * 22));
    }
    // One number per region: the connected areas of one band, labelled near their middle.
    const comp = new Int32Array(N * N).fill(-1), q = new Int32Array(N * N), lab = [];
    for (let s0 = 0; s0 < N * N; s0++) {
      if (comp[s0] >= 0) continue;
      const b = B[s0], id = lab.length; let qh = 0, qt = 0, sx = 0, sy = 0; q[qt++] = s0; comp[s0] = id;
      while (qh < qt) { const i = q[qh++], x = i % N, y = i / N | 0; sx += x; sy += y;
        if (x > 0 && comp[i - 1] < 0 && B[i - 1] === b) { comp[i - 1] = id; q[qt++] = i - 1; } if (x < M && comp[i + 1] < 0 && B[i + 1] === b) { comp[i + 1] = id; q[qt++] = i + 1; }
        if (y > 0 && comp[i - N] < 0 && B[i - N] === b) { comp[i - N] = id; q[qt++] = i - N; } if (y < M && comp[i + N] < 0 && B[i + N] === b) { comp[i + N] = id; q[qt++] = i + N; } }
      let cx = sx / qt, cy = sy / qt, best = q[0], bd = 1e9;
      for (let k2 = 0; k2 < qt; k2 += 7) { const i = q[k2], d = (i % N - cx) ** 2 + ((i / N | 0) - cy) ** 2; if (d < bd) { bd = d; best = i; } }
      lab.push({ x: best % N, y: best / N | 0, n: b + 1, area: qt });
    }
    return (cache[k] = { H, B, E, L, labels: lab.filter(l => l.area > 900), gmin: mn });
  }
  function use(k) { cur = k; const s = build(k); Hm = s.H; Bm = s.B; Em = s.E; Lm = s.L; labels = s.labels; gmin = s.gmin; if (R.name) R.name.textContent = (k + 1) + "/4 · " + SURFACES[k].name; if (R.point) R.point.textContent = SURFACES[k].point; }
  const inside = (x, y) => x >= 0 && y >= 0 && x <= M && y <= M;
  const at = (x, y) => {
    x = Math.max(0, Math.min(M - 0.001, x)); y = Math.max(0, Math.min(M - 0.001, y));
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * N + x0;
    const a = Hm[i], b = Hm[i + 1], c = Hm[i + N], d = Hm[i + N + 1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const err = h => 0.02 + 0.98 * (h - gmin) / (HMAX - gmin);

  /* ---- The camera: high, looking down at the square of ground, which sits right of the text on a wide screen ---- */
  const CAM_H = 520, ZFAR = 1100;
  let F = 0.95;
  let camX = 0, camY = 0, K = 0.42, HOR = 0.12;
  function place() {
    const narrow = hero.clientWidth < 640;
    K = narrow ? 0.42 : 0.6; HOR = narrow ? 0.2 : 0.1; F = narrow ? 0.62 : 0.95;
    camX = narrow ? N * 0.5 : 110; camY = narrow ? -300 : -310;
  }

  /* ---- Canvas state ---- */
  let cw = 0, ch = 0, cell = 4, img, img32, lev, zbuf, pkx, pky, ybuf;
  let running = false, visible = false, raf = 0, last = 0, run = null, shown = false;
  let paint = 0, paintTo = 0;                                         // 0 is the numbered outline, 1 the painted surface

  function size() {
    const w = hero.clientWidth, h = hero.clientHeight; if (!w || !h) return;
    cell = w < 640 ? 3 : Math.max(4, Math.ceil(w / 400));
    const nw = Math.ceil(w / cell), nh = Math.ceil(h / cell);
    if (nw === cw && nh === ch) return;
    cw = nw; ch = nh; cv.width = cw; cv.height = ch; cv.style.width = cw * cell + "px"; cv.style.height = ch * cell + "px";
    hero.style.setProperty("--cell", cell + "px");
    img = ctx.createImageData(cw, ch); img32 = new Uint32Array(img.data.buffer);
    lev = new Uint8Array(cw * ch); bb = new Uint8Array(cw * ch); zbuf = new Float32Array(cw * ch); pkx = new Float32Array(cw * ch); pky = new Float32Array(cw * ch); ybuf = new Int32Array(cw);
    place();
    if (!run) { run = start(...demoStart(), false); if (reduced) finish(run); }
    else if (run.done) placeTag(run);
    draw(performance.now()); setRun();
  }

  function proj(x, y, h) {
    const z = y - camY; if (z < 4) return null;
    return [((x - camX) / (z * F) + 1) * 0.5 * cw, (CAM_H - h) * K * ch / z + HOR * ch, z];
  }

  /* ---- The ground, front to back, one screen column at a time. Outlines are found on screen, so they stay unbroken at any distance ---- */
  let bb;
  function ground(now) {
    ybuf.fill(ch); zbuf.fill(1e9); lev.fill(0); pkx.fill(NaN); bb.fill(255);
    const sc = K * ch, z0 = Math.max(8, -camY), z1 = Math.min(ZFAR, M - camY);
    // how far the paint has come: each band fills in turn, lowest number first
    const amt = new Float32Array(BANDS); for (let b = 0; b < BANDS; b++) amt[b] = Math.max(0, Math.min(1, paint * (1 + BANDS * 0.12) - b * 0.12));
    for (let z = z0; z < z1; z += z < 600 ? 1 : 1.5) {
      const half = z * F, step = half * 2 / cw, wy = camY + z, iy = Math.min(M, wy | 0);
      const inv = sc / z, fog = Math.max(0.3, 1 - (z - z0) / (ZFAR * 1.2));
      let wx = camX - half + step * 0.5;
      for (let i = 0; i < cw; i++, wx += step) {
        if (wx < 0 || wx > M) continue;
        const idx = iy * N + (wx | 0);
        let sy = (CAM_H - Hm[idx]) * inv + HOR * ch | 0;
        let top = ybuf[i]; if (sy >= top) continue; if (sy < 0) sy = 0;
        if (top === ch) top = Math.min(ch, sy + 4);                     // the front edge of the board: a thin lip, not a wall
        const band = Bm[idx], light = Lm[idx] / 255, a = amt[band];
        for (let y = sy, k = sy * cw + i; y < top; y++, k += cw) {
          const bay = BAYER[(y & 3) << 2 | i & 3];
          lev[k] = bay > fog ? 0 : bay < a ? PAINT0 + band : bay < (1 - light) * 0.5 ? 1 : 0;   // painted flat, or paper with a little shading
          bb[k] = bay > fog * 1.3 ? 254 : band; zbuf[k] = z; pkx[k] = wx; pky[k] = wy;
        }
        ybuf[i] = sy;
      }
    }
    for (let y = 0; y < ch - 1; y++) for (let x = 0, k = y * cw; x < cw - 1; x++, k++) {      // the outline of every region
      const b = bb[k]; if (b > 250) continue;
      const r = bb[k + 1], d = bb[k + cw];
      if ((r !== b && r < 250) || (d !== b && d < 250)) lev[k] = amt[b] > 0.5 ? 2 : LINE;
    }
    // the numbers, where they are still unpainted
    for (const l of labels) {
      if (amt[l.n - 1] > 0.6) continue;
      const p = proj(l.x, l.y, Hm[l.y * N + l.x]); if (!p || !seen(p[0], p[1], p[2])) continue;
      digit(String(l.n), p[0] - 1, p[1] - 2);
    }
  }
  const DIG = { 1: "010110010010111", 2: "111001111100111", 3: "111001111001111", 4: "101101111001001", 5: "111100111001111", 6: "111100111101111", 7: "111001010010010" };
  function digit(s, x, y) { const g = DIG[s]; if (!g) return; for (let k = 0; k < 15; k++) if (g[k] === "1") put(x + k % 3, y + (k / 3 | 0), LINE); }

  /* ---- A run: plain gradient descent, worked out in full, then played back ---- */
  function path(x, y) {
    const pts = [[x, y, at(x, y)]];
    for (let k = 0; k < 900; k++) {
      const gx = (at(x + 1, y) - at(x - 1, y)) / 2, gy = (at(x, y + 1) - at(x, y - 1)) / 2;
      let sx = -2.2 * gx, sy = -2.2 * gy; const len = Math.hypot(sx, sy);
      if (len > 2.6) { sx *= 2.6 / len; sy *= 2.6 / len; }
      if (Math.hypot(sx, sy) < 0.05) break;                           // the ground is flat: it has settled
      const h0 = at(x, y); let t = 1; while (t > 0.05 && at(x + sx * t, y + sy * t) > h0) t /= 2;
      if (t <= 0.05) break;
      x = Math.max(0, Math.min(M, x + sx * t)); y = Math.max(0, Math.min(M, y + sy * t)); pts.push([x, y, Math.min(pts[pts.length - 1][2], at(x, y))]);
    }
    return pts;
  }
  function start(x, y, byUser) {
    const pts = path(x, y), n = pts.length - 1;
    const r = { pts, n, f: 0, i: 0, user: byUser, t0: performance.now(), dur: Math.max(4500, Math.min(6000, n / 30 * 1000)), done: false, pulse: -1e9 };
    if (R.cue) R.cue.hidden = true;
    pathTag.hidden = true; readout(r);
    return r;
  }
  function settle(r, now) {
    r.done = true; r.f = r.i = r.n; r.pulse = now; readout(r);
    const lowest = r.pts[r.n][2] - gmin < HMAX * 0.02;
    R.verdict.textContent = (r.user ? "Your run " : "This run ") + (lowest ? "reached the lowest point." : "stopped in a local dip, not the lowest point.");
    placeTag(r); if (R.cue) R.cue.hidden = false; shown = true;
    if (r.user) { sound.play("land"); voice(lowest ? "run:lowest" : "run:local"); }
  }
  function finish(r) { settle(r, performance.now() - 5000); }
  function readout(r) {
    const p = r.pts[r.i]; R.steps.textContent = String(r.i).padStart(3, "0"); R.err.textContent = err(p[2]).toFixed(2);
    const top = Math.max(err(r.pts[0][2]), 0.2), Y = k => (20 - err(r.pts[k][2]) / top * 18).toFixed(1), out = [], stride = Math.max(1, r.n / 60 | 0);
    for (let k = 0; k < r.i; k += stride) out.push((k / r.n * 64).toFixed(1) + "," + Y(k));
    out.push((r.i / Math.max(1, r.n) * 64).toFixed(1) + "," + Y(r.i));
    R.curve.setAttribute("points", out.join(" "));
  }
  const demoStart = () => SURFACES[cur].start.map(t => t * M);

  const voice = k => document.dispatchEvent(new CustomEvent("voice", { detail: k }));

  /* ---- The (i) tags that sit on the ground ---- */
  function placeTag(r) {
    const e = r.pts[r.n], p = proj(e[0], e[1], e[2]); if (!p) return;
    const W = hero.clientWidth;
    pathTag.style.left = Math.min(W - 30, p[0] * cell + 14) + "px"; pathTag.style.top = Math.max(8, p[1] * cell - 30) + "px";
    pathTag.classList.toggle("flip", p[0] * cell > W - 320);
    pathTag.hidden = false;
  }
  function placeGroundTag() {
    const p = proj(M * 0.92, M * 0.95, Hm[(M * 0.95 | 0) * N + (M * 0.92 | 0)]); if (!p) return;
    groundTag.style.left = Math.min(hero.clientWidth - 30, p[0] * cell) + "px"; groundTag.style.top = Math.max(60, p[1] * cell - 34) + "px";
    groundTag.classList.add("flip");
  }

  /* ---- Drawing ---- */
  const put = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < cw && y < ch) lev[y * cw + x] = c; };
  const seen = (x, y, z) => { x |= 0; y |= 0; return x >= 0 && y >= 0 && x < cw && y < ch && z <= zbuf[y * cw + x] + 6; };
  function ring(cx, cy, rad, c) { const n = Math.max(10, rad * 7 | 0); for (let k = 0; k < n; k += 2) { const a = k / n * 6.283; put(cx + Math.cos(a) * rad + 0.5, cy + Math.sin(a) * rad + 0.5, c); } }
  function draw(now) {
    ground(now);
    const r = run;
    if (r) {
      const upto = r.done ? r.n : r.i;
      for (let k = 0; k <= upto; k++) {                                // the trail: dense near the head, thinning behind it
        const p = proj(r.pts[k][0], r.pts[k][1], r.pts[k][2]); if (!p || !seen(p[0], p[1], p[2])) continue;
        const age = r.done ? (r.n - k) / r.n * 0.45 : (upto - k) / Math.max(30, upto);
        if (BAYER[((p[1] | 0) & 3) << 2 | (p[0] | 0) & 3] < 1 - age * 0.85) put(p[0], p[1], ORANGE);
      }
      const s = proj(r.pts[0][0], r.pts[0][1], r.pts[0][2]);           // where it started: a hollow square
      if (s) for (let k = -1; k <= 1; k++) { put(s[0] + k, s[1] - 1, ORANGE); put(s[0] + k, s[1] + 1, ORANGE); put(s[0] - 1, s[1] + k, ORANGE); put(s[0] + 1, s[1] + k, ORANGE); }
      const a = r.pts[r.i], b = r.pts[Math.min(r.n, r.i + 1)], t = r.done ? 0 : r.f - r.i;
      const hp = proj(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
      if (hp) {
        if (r.done) {                                                  // arrival: a pulse, then a small square that stays
          const u = (now - r.pulse) / 900; if (u >= 0 && u < 1) ring(hp[0], hp[1], 3 + u * 12, ORANGE);
          for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) put(hp[0] + ox, hp[1] + oy, Math.abs(ox) < 2 && Math.abs(oy) < 2 ? HI : ORANGE);
        } else {                                                       // the head: bright, ringed in orange while it moves
          for (let k = -2; k <= 2; k++) { put(hp[0] + k, hp[1] - 2, ORANGE); put(hp[0] + k, hp[1] + 2, ORANGE); put(hp[0] - 2, hp[1] + k, ORANGE); put(hp[0] + 2, hp[1] + k, ORANGE); }
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) put(hp[0] + ox, hp[1] + oy, HI);
        }
      }
    }
    for (let i = 0; i < cw * ch; i++) img32[i] = PAL32[lev[i]];
    ctx.putImageData(img, 0, 0);
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (now - last < 31) return;
    const dt = Math.min(0.1, (now - last) / 1000 || 0.033); last = now;
    let moving = false;
    const r = run;
    if (r && !r.done) {
      moving = true; const f = Math.min(r.n, (now - r.t0) / r.dur * r.n), i = f | 0; r.f = f;
      if (i !== r.i) { r.i = i; readout(r); }
      if (f >= r.n) settle(r, now);
    }
    if (paint !== paintTo) { moving = true; paint = paintTo > paint ? Math.min(paintTo, paint + dt / 1.4) : Math.max(paintTo, paint - dt / 1.0); }
    const pulsing = r && r.done && now - r.pulse < 950;
    draw(now);
    if (!moving && !pulsing) { running = false; cancelAnimationFrame(raf); }
  }
  function setRun() {
    const want = visible && !document.hidden && !reduced;
    if (want && !running) {
      running = true; last = 0; const now = performance.now();
      if (run && !run.done) run.t0 = now - run.f / run.n * run.dur;   // a paused run picks up where it stopped
      raf = requestAnimationFrame(tick);
    } else if (!want && running) { running = false; cancelAnimationFrame(raf); }
  }
  function redraw() { if (reduced) { paint = paintTo; if (run && !run.done) finish(run); } if (cw) draw(performance.now()); setRun(); }

  /* ---- Pointer and controls ---- */
  hero.addEventListener("click", e => {
    if (e.target.closest("a, button, .info, .hctl")) return;
    const b = hero.getBoundingClientRect(), x = (e.clientX - b.left) / cell | 0, y = (e.clientY - b.top) / cell | 0;
    if (x < 0 || y < 0 || x >= cw || y >= ch) return;
    const k = y * cw + x; if (isNaN(pkx[k])) return;
    run = start(pkx[k], pky[k], true); sound.play("blip"); redraw(); voice("run:start");
  });
  function surface(k) {
    use((k + SURFACES.length) % SURFACES.length); run = start(...demoStart(), false); placeGroundTag(); redraw(); voice("surface:" + (cur + 1));
  }
  hero.querySelectorAll("[data-surface-step]").forEach(b => b.addEventListener("click", () => { surface(cur + +b.dataset.surfaceStep); sound.play("step"); }));
  if (R.paint) R.paint.addEventListener("click", () => {
    paintTo = paintTo ? 0 : 1; R.paint.setAttribute("aria-pressed", String(!!paintTo)); sound.play("toggle"); redraw();
  });

  /* ---- Theme: redraw at once in the new palette, so a theme transition captures a finished frame ---- */
  document.addEventListener("themechange", () => { setPalette(); if (cw) draw(performance.now()); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { setPalette(); if (cw) draw(performance.now()); });

  use(0);
  new ResizeObserver(() => { size(); placeGroundTag(); }).observe(hero);
  new IntersectionObserver(es => { visible = es[0].isIntersecting; setRun(); }).observe(hero);
  document.addEventListener("visibilitychange", setRun);
  size(); placeGroundTag();
})();
