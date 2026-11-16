/* The home hero: a loss surface flown over slowly, drawn in small square cells, five greys and one orange.
   A tiled height map is rendered front to back, one screen column at a time, into a small ImageData,
   ordered-dithered to the palette and scaled up with crisp pixels. Click the surface and gradient descent
   with momentum walks downhill from that point. No images, no libraries.
   It runs only while the hero is on screen and the tab is visible, at about 30 frames a second, never wider than 400 cells.
   With reduced motion it draws one still frame, and a click draws the finished path at once. */
(function () {
  "use strict";
  const hero = document.querySelector("[data-descent]"); if (!hero) return;
  const mo = window.motion || {}, reduced = !!mo.reduced, sound = mo.sound || { play() {} };
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---- The surface ---- */
  const N = 512, M = N - 1, SH = 9;
  const Hm = new Float32Array(N * N), Sm = new Uint8Array(N * N), Tm = new Uint8Array(N * N);
  const HMAX = 118;
  function build() {
    let seed = 20261117; const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const comps = [];
    for (let k = 0; k < 16; k++) {
      const fx = Math.round(rnd() * 10 - 5), fy = Math.round(rnd() * 10 - 5); if (!fx && !fy) continue;
      comps.push([fx, fy, 1 / Math.pow(Math.hypot(fx, fy), 1.25), rnd() * 6.283]);
    }
    const sx = new Float32Array(N); let lo = 1e9, hi = -1e9;
    for (const [fx, fy, a, ph] of comps) {
      for (let x = 0; x < N; x++) sx[x] = 6.283185 * fx * x / N + ph;
      for (let y = 0; y < N; y++) { const oy = 6.283185 * fy * y / N, r = y << SH; for (let x = 0; x < N; x++) Hm[r | x] += a * Math.sin(sx[x] + oy); }
    }
    for (let i = 0; i < N * N; i++) { if (Hm[i] < lo) lo = Hm[i]; if (Hm[i] > hi) hi = Hm[i]; }
    for (let i = 0; i < N * N; i++) { const t = (Hm[i] - lo) / (hi - lo); Hm[i] = Math.pow(t, 1.5) * HMAX; }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y << SH | x, h = Hm[i];
      const gx = Hm[y << SH | (x + 1 & M)] - Hm[y << SH | (x - 1 & M)], gy = Hm[(y + 1 & M) << SH | x] - Hm[(y - 1 & M) << SH | x];
      let s = 0.3 + (gx * -0.62 + gy * 0.5) * 0.36;               // light from the upper left
      s = Math.max(0.05, Math.min(0.8, s)) * (0.5 + 0.5 * h / HMAX); // low loss sits in shadow
      const c = h / 7.5, fr = c - Math.floor(c), slope = Math.hypot(gx, gy);
      if (fr < 0.1 + slope * 0.09) s = Math.min(1, s + 0.5);        // contour lines, like a loss plot
      Sm[i] = s * 255;
    }
  }

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const PAL = [[0, 0, 0], [38, 38, 38], [84, 84, 84], [146, 146, 146], [232, 232, 232], [255, 89, 4]];
  const PAL32 = new Uint32Array(PAL.map(([r, g, b]) => (255 << 24 | b << 16 | g << 8 | r) >>> 0));

  function init(hero) {
    build();
    const cv = hero.querySelector(".hero-cv"), ctx = cv.getContext("2d", { alpha: false });
    const read = hero.querySelector(".hud-read"), hint = hero.querySelector(".hud-hint");
    const horizon = () => hero.clientWidth < 640 ? 0.25 : 0.3;
    let cw = 0, ch = 0, cell = 4, img, img32, lev, pick, ybuf, stars;
    let camX = 60, camY = 0, yaw = 0.35, yawT = 0.35, hor = 0, horT = 0, px = -1, py = -1, inside = false;
    let running = false, visible = false, active = true, raf = 0, last = 0, frame = 0, runs = 0, idle = 0;
    const walkers = [];

    function size() {
      const w = hero.clientWidth, h = hero.clientHeight; if (!w || !h) return;
      cell = w < 600 ? 3 : Math.max(4, Math.ceil(w / 400));
      const nw = Math.ceil(w / cell), nh = Math.ceil(h / cell);
      if (nw === cw && nh === ch) return;
      cw = nw; ch = nh; cv.width = cw; cv.height = ch; cv.style.width = cw * cell + "px"; cv.style.height = ch * cell + "px";
      hero.style.setProperty("--cell", cell + "px");
      img = ctx.createImageData(cw, ch); img32 = new Uint32Array(img.data.buffer);
      lev = new Uint8Array(cw * ch); pick = new Int32Array(cw * ch); ybuf = new Int32Array(cw);
      stars = new Uint8Array(cw * ch); let s = 99;
      for (let i = 0; i < cw * ch; i++) { s = Math.imul(s ^ s >>> 13, 1274126177) + i | 0; const r = (s >>> 8 & 4095) / 4096; stars[i] = r < 0.0028 ? 2 : r < 0.009 ? 1 : 0; }
      hor = horT = ch * horizon();
      if (!running) draw();
    }

    function draw() {
      const fx = Math.sin(yaw), fy = Math.cos(yaw), rx = fy, ry = -fx, F = 0.78, camH = 178, scale = ch * 0.92, zfar = 520;
      ybuf.fill(ch); pick.fill(-1);
      const fadeFrom = ch * 0.8, fadeLen = ch * 0.2;
      for (let i = 0; i < cw * ch; i++) lev[i] = stars[i];
      let z = 2, dz = 1;
      while (z < zfar) {
        const half = z * F, sxp = (rx * half * 2) / cw, syp = (ry * half * 2) / cw;
        let wx = camX + fx * z - rx * half, wy = camY + fy * z - ry * half;
        const inv = scale / z, fog = Math.pow(1 - z / zfar, 1.35) / 255 * 5.2;
        for (let i = 0; i < cw; i++, wx += sxp, wy += syp) {
          const idx = (wy & M) << SH | (wx & M);
          let sy = (camH - Hm[idx]) * inv + hor | 0;
          const top = ybuf[i]; if (sy >= top) continue; if (sy < 0) sy = 0;
          const v = Sm[idx] * fog, t = Tm[idx];
          for (let y = sy, k = sy * cw + i; y < top; y++, k += cw) {
            const b = BAYER[(y & 3) << 2 | i & 3];
            const fade = y > fadeFrom ? 1 - (y - fadeFrom) / fadeLen : 1;   // sinks into black along the bottom edge
            if (t && t > b * 200 && fade > b) lev[k] = 5; else { const l = v * fade + b | 0; lev[k] = l > 4 ? 4 : l; }
            pick[k] = idx;
          }
          ybuf[i] = sy;
        }
        z += dz; dz *= 1.011;
      }
      if (inside && fine) {                         // a small reticle where the pointer is
        const cx = px / cell | 0, cy = py / cell | 0;
        for (const [ox, oy] of [[-3, 0], [-2, 0], [2, 0], [3, 0], [0, -3], [0, -2], [0, 2], [0, 3]]) { const x = cx + ox, y = cy + oy; if (x >= 0 && y >= 0 && x < cw && y < ch) lev[y * cw + x] = 5; }
      }
      for (let i = 0; i < cw * ch; i++) img32[i] = PAL32[lev[i]];
      ctx.putImageData(img, 0, 0);
    }

    /* A walker is plain gradient descent with momentum on the height map. It paints its path into the map. */
    function paint(x, y, r) { for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) if (Math.abs(ox) + Math.abs(oy) <= r) Tm[(y + oy & M) << SH | (x + ox & M)] = 255; }
    function spawn(idx, byUser) {
      if (walkers.length > 5) walkers.shift();
      const w = { x: idx & M, y: idx >> SH, vx: 0, vy: 0, n: 0, still: 0, id: ++runs, user: byUser };
      paint(w.x | 0, w.y | 0, 2); walkers.push(w); return w;
    }
    function stepWalker(w) {
      const x = w.x | 0, y = w.y | 0;
      const gx = (Hm[(y & M) << SH | (x + 1 & M)] - Hm[(y & M) << SH | (x - 1 & M)]) / 2, gy = (Hm[(y + 1 & M) << SH | (x & M)] - Hm[(y - 1 & M) << SH | (x & M)]) / 2;
      w.vx = w.vx * 0.9 - gx * 0.2; w.vy = w.vy * 0.9 - gy * 0.2;
      const sp = Math.hypot(w.vx, w.vy); if (sp > 1) { w.vx /= sp; w.vy /= sp; }
      w.x += w.vx; w.y += w.vy; w.n++; paint(w.x | 0, w.y | 0, 1);
      w.still = sp < 0.05 ? w.still + 1 : 0;
      if (w.still > 14 || w.n > 1400) { w.done = true; paint(w.x | 0, w.y | 0, 4); }
    }
    const lossAt = w => (Hm[(w.y & M) << SH | (w.x & M)] / HMAX).toFixed(3);
    function hud(w) { read.textContent = `run ${String(w.id).padStart(2, "0")}  step ${String(w.n).padStart(4, "0")}  loss ${lossAt(w)}${w.done ? "  converged" : ""}`; }
    function autoSpawn() {
      for (let tries = 0; tries < 30; tries++) {
        const narrow = hero.clientWidth < 640;   // start where the surface is not under text
        const x = cw * (narrow ? 0.15 + Math.random() * 0.7 : 0.34 + Math.random() * 0.5) | 0, y = ch * (narrow ? 0.4 + Math.random() * 0.16 : 0.44 + Math.random() * 0.3) | 0, idx = pick[y * cw + x];
        if (idx >= 0 && Hm[idx] > HMAX * 0.3) return spawn(idx, false);
      }
    }

    function tick(now) {
      raf = requestAnimationFrame(tick);
      if (now - last < 31) return;
      const dt = Math.min(0.1, (now - last) / 1000 || 0.033); last = now; frame++;
      yaw += (yawT - yaw) * Math.min(1, dt * 2.2); hor += (horT - hor) * Math.min(1, dt * 2.2);
      camX += Math.sin(yaw) * 7 * dt; camY += Math.cos(yaw) * 7 * dt;
      let live = null;
      for (const w of walkers) if (!w.done) { for (let k = 0; k < 4 && !w.done; k++) stepWalker(w); live = w; if (w.done) { hud(w); if (w.user) sound.play("land"); } }
      if (live) { hud(live); idle = 0; } else if ((idle += dt) > 2.4) { idle = 0; autoSpawn(); }
      if (frame % 5 === 0) for (let i = 0; i < N * N; i++) if (Tm[i]) Tm[i]--;
      draw();
    }
    function setRun() {
      const want = active && visible && !document.hidden && !reduced;
      if (want && !running) { running = true; last = 0; raf = requestAnimationFrame(tick); }
      else if (!want && running) { running = false; cancelAnimationFrame(raf); }
    }
    function settle(w) { while (!w.done) stepWalker(w); hud(w); }

    hero.addEventListener("pointermove", e => {
      const r = hero.getBoundingClientRect(); px = e.clientX - r.left; py = e.clientY - r.top; inside = true;
      yawT = 0.35 + (px / r.width - 0.5) * 0.5; horT = ch * (horizon() - (py / r.height - 0.5) * 0.07);
    });
    hero.addEventListener("pointerleave", () => { inside = false; });
    hero.addEventListener("click", e => {
      if (e.target.closest("a, button")) return;
      const r = hero.getBoundingClientRect(), x = (e.clientX - r.left) / cell | 0, y = (e.clientY - r.top) / cell | 0, idx = pick ? pick[y * cw + x] : -1;
      if (idx < 0) return;
      const w = spawn(idx, true); sound.play("blip"); hint.textContent = "Each click starts gradient descent from that point";
      if (reduced) { settle(w); draw(); }
    });
    new ResizeObserver(size).observe(hero);
    new IntersectionObserver(es => { visible = es[0].isIntersecting; setRun(); }).observe(hero);
    document.addEventListener("visibilitychange", setRun);
    size();
    // A first frame that already reads as a still: two finished descents and one under way.
    draw(); [0, 1].forEach(() => { const w = autoSpawn(); if (w) settle(w); });
    const w3 = autoSpawn(); if (w3) { if (reduced) settle(w3); else for (let k = 0; k < 60; k++) stepWalker(w3); hud(w3); }
    draw();

  }
  init(hero);
})();
