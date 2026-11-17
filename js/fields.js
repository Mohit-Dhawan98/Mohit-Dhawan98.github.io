/* "How I help": one pinned stage whose code-drawn scene changes as the page scrolls, one state per kind of work.
   Same cells and palette as the hero (five greys, orange, white). Scroll position drives everything: scrubbed and reversible,
   and the page scrolls normally. Each scene builds from nothing to a settled picture a cold reader can name:

     agents     a task goes through plan, act (with tools) and a check; the check fails once, it retries, then passes
     nlp        a raw line of product text falls apart into labelled fields
     classical  a line swings through a scatter of points until the gaps to it are as small as they get

   Nothing is drawn while the stage is off screen. With reduced motion (or no scroll-driven stage) every state becomes a still panel. */
(function () {
  "use strict";
  const stage = document.querySelector("[data-stage]"); if (!stage) return;
  const mo = window.motion || {}, reduced = !!mo.reduced;
  const states = Array.from(stage.querySelectorAll(".state")), pin = stage.querySelector(".stage-pin");
  const PALS = { dark: [[0, 0, 0], [38, 38, 38], [84, 84, 84], [146, 146, 146], [232, 232, 232], [255, 89, 4], [255, 255, 255]],
                 light: [[236, 234, 228], [214, 211, 203], [174, 170, 161], [118, 115, 108], [42, 41, 38], [240, 80, 0], [18, 18, 17]] };
  let PAL, theme = "";
  function setPal() { theme = getComputedStyle(document.documentElement).colorScheme.indexOf("dark") >= 0 ? "dark" : "light"; PAL = PALS[theme].map(([r, g, b]) => (255 << 24 | b << 16 | g << 8 | r) >>> 0); }
  setPal();
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const G = 2, D = 3, W = 4, O = 5, HI = 6;                       // grey, light grey, near white, orange, white

  /* A 5 by 7 pixel face for labels inside the scenes: capitals, digits and a few marks. */
  const F = {}, GL = { A: "01110100011000111111100011000110001", B: "11110100011000111110100011000111110", C: "01110100011000010000100001000101110", D: "11110100011000110001100011000111110", E: "11111100001000011110100001000011111", F: "11111100001000011110100001000010000", G: "01110100011000010111100011000101111", H: "10001100011000111111100011000110001", I: "01110001000010000100001000010001110", J: "00111000100001000010000101001001100", K: "10001100101010011000101001001010001", L: "10000100001000010000100001000011111", M: "10001110111010110101100011000110001", N: "10001110011010110011100011000110001", O: "01110100011000110001100011000101110", P: "11110100011000111110100001000010000", Q: "01110100011000110001101011001001101", R: "11110100011000111110101001001010001", S: "01111100001000001110000010000111110", T: "11111001000010000100001000010000100", U: "10001100011000110001100011000101110", V: "10001100011000110001100010101000100", W: "10001100011000110101101011101110001", X: "10001100010101000100010101000110001", Y: "10001100010101000100001000010000100", Z: "11111000010001000100010001000011111",
    0: "01110100011001110101110011000101110", 1: "00100011000010000100001000010001110", 2: "01110100010000100010001000100011111", 3: "11110000010000101110000010000111110", 4: "00010001100101010010111110001000010", 5: "11111100001111000001000011000101110", 6: "00110010001000011110100011000101110", 7: "11111000010001000100010000100001000", 8: "01110100011000101110100011000101110", 9: "01110100011000101111000010001001100", ".": "00000000000000000000000000011000110", "-": "00000000000000011111000000000000000", " ": "00000000000000000000000000000000000" };
  for (const k in GL) { F[k] = []; for (let i = 0; i < 35; i++) if (GL[k][i] === "1") F[k].push(i % 5, i / 5 | 0); }
  const tw = s => s.length * 6 - 1, TH = 7;

  function Surface(cv) {
    const ctx = cv.getContext("2d", { alpha: false }); let cw = 0, ch = 0, img, px, alpha = 1;
    const s = {
      get w() { return cw; }, get h() { return ch; },
      fit() {
        const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return false;
        const cell = w < 640 || s.still ? 3 : Math.max(4, Math.ceil(w / 400)), nw = Math.ceil(w / cell), nh = Math.ceil(h / cell);
        if (nw !== cw || nh !== ch) { cw = nw; ch = nh; cv.width = cw; cv.height = ch; img = ctx.createImageData(cw, ch); px = new Uint32Array(img.data.buffer); cv.parentNode.style.setProperty("--cell", cell + "px"); }
        return true;
      },
      clear() { px.fill(PAL[0]); }, flush() { ctx.putImageData(img, 0, 0); },
      fade(a) { alpha = a; },                                         // everything drawn after this dissolves in or out through the dither
      put(x, y, c) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= cw || y >= ch) return; if (alpha < 1 && BAYER[(y & 3) << 2 | x & 3] > alpha) return; px[y * cw + x] = PAL[c]; },
      rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) s.put(x + i, y + j, c); },
      box(x, y, w, h, c) { for (let i = 0; i < w; i++) { s.put(x + i, y, c); s.put(x + i, y + h - 1, c); } for (let j = 0; j < h; j++) { s.put(x, y + j, c); s.put(x + w - 1, y + j, c); } },
      line(x0, y0, x1, y1, c, dot) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) | 0 || 1; for (let k = 0; k <= n; k++) if (!dot || !(k & 1)) s.put(x0 + (x1 - x0) * k / n + 0.5, y0 + (y1 - y0) * k / n + 0.5, c); },
      text(str, x, y, c) { x |= 0; y |= 0; for (const chr of str) { const g = F[chr] || F[" "]; for (let k = 0; k < g.length; k += 2) s.put(x + g[k], y + g[k + 1], c); x += 6; } },
    };
    return s;
  }
  const ease = t => t < 0 ? 0 : t > 1 ? 1 : 1 - Math.pow(1 - t, 3), clamp = t => t < 0 ? 0 : t > 1 ? 1 : t, lerp = (a, b, t) => a + (b - a) * t;
  // Where a scene may draw: beside the text on a wide screen, above it on a narrow one.
  function region(s) { if (s.still) return { x: 4, y: 6, w: s.w - 8, h: s.h - 12 }; return s.w * 4 > 760 ? { x: s.w * 0.47 | 0, y: s.h * 0.16 | 0, w: s.w * 0.47 | 0, h: s.h * 0.66 | 0 } : { x: 8, y: s.h * 0.36 | 0, w: s.w - 16, h: s.h * 0.3 | 0 }; }

  /* ---- Agents: plan, act with tools, check, retry, pass ---- */
  function agents(s, p) {
    const R = region(s), names = ["TASK", "PLAN", "ACT", "CHECK", "DONE"], bh = 13, gap = Math.max(6, Math.min(12, (R.h - 26 - bh * 5) / 4 | 0)), N = [];
    const cx = R.x + (R.w * (s.w * 4 > 760 ? 0.42 : 0.56) | 0); let y = R.y + (R.h - 14 - bh * 5 - gap * 4 >> 1);
    for (const n of names) { const w = tw(n) + 10; N.push({ n, x: cx - (w >> 1), y, w }); y += bh + gap; }
    const P = N.map(n => [cx, n.y + (bh >> 1)]), lx = cx - (N[3].w >> 1) - 14;
    // the route: task, plan, act, check (fails), back round to plan, act, check (passes), done
    const route = [P[0], P[1], P[2], P[3], [lx, P[3][1]], [lx, P[1][1]], P[1], P[2], P[3], P[4]], seg = [0]; let len = 0;
    for (let k = 1; k < route.length; k++) { len += Math.abs(route[k][0] - route[k - 1][0]) + Math.abs(route[k][1] - route[k - 1][1]); seg.push(len); }
    const d = ease((p - 0.05) / 0.5) * len, at = k => d >= seg[k] - 0.01;
    const tools = ["SEARCH", "SQL", "CODE"], tx = N[2].x + N[2].w + 12, ty = P[2][1] - 12;
    const acting = at(2) && !at(3) || at(7) && !at(8), u = acting ? (d - seg[at(7) ? 7 : 2]) / (seg[3] - seg[2]) : 0;
    const head = (x, y, dx, dy, c) => { for (let k = 1; k <= 2; k++) { s.put(x - dx * k + dy * k, y - dy * k + dx * k, c); s.put(x - dx * k - dy * k, y - dy * k - dx * k, c); } };   // an arrowhead
    for (let k = 0; k < 4; k++) { const c = at(k + 1) ? D : G; s.line(P[k][0], P[k][1], P[k + 1][0], P[k + 1][1], c); head(cx, N[k + 1].y - 1, 0, 1, c); }
    s.line(P[3][0], P[3][1], lx, P[3][1], at(4) ? D : G, true); s.line(lx, P[3][1], lx, P[1][1], at(5) ? D : G, true); s.line(lx, P[1][1], P[1][0], P[1][1], at(6) ? D : G, true); head(N[1].x - 1, P[1][1], 1, 0, at(6) ? W : G);
    s.text("RETRY", Math.max(2, lx - tw("RETRY") - 4), (P[1][1] + P[3][1] >> 1) - 3, at(4) ? W : G);
    s.line(N[2].x + N[2].w, P[2][1], tx - 3, P[2][1], G, true);
    tools.forEach((t, i) => s.text(t, tx, ty + i * 9, acting && (u * 3 | 0) === i ? O : at(2) ? D : G));
    N.forEach((n, i) => {
      const seen = at(i === 4 ? 9 : i), done = i === 4 && at(9);
      s.rect(n.x, n.y, n.w, bh, 0); s.box(n.x, n.y, n.w, bh, done ? O : seen ? W : G); if (done) s.box(n.x - 2, n.y - 2, n.w + 4, bh + 4, O); s.text(n.n, n.x + 5, n.y + 3, seen ? HI : D);
    });
    const verdict = at(8) ? "PASSED ON TRY 2" : at(3) ? "FAILED - RETRY" : "";
    if (verdict) s.text(verdict, cx - (tw(verdict) >> 1), N[4].y + bh + 6, at(8) ? HI : O);
    if (d < len) { let k = 1; while (k < seg.length - 1 && d > seg[k]) k++; const a = route[k - 1], b = route[k], t = (d - seg[k - 1]) / Math.max(1, seg[k] - seg[k - 1]); s.rect(lerp(a[0], b[0], t) - 1, lerp(a[1], b[1], t) - 1, 3, 3, O); }
  }

  /* ---- NLP: a raw line of text becomes labelled fields ---- */
  function nlp(s, p) {
    const R = region(s), rows = [["BRAND", "SONY"], ["MODEL", "WH1000"], ["FEATURE", "WIRELESS"], ["TYPE", "HEADPHONES"], ["COLOR", "BLACK"]];
    const kw = tw("FEATURE") + 8, tableW = kw + tw("HEADPHONES"), tx = R.x + (R.w - tableW >> 1), rawY = R.y + 12, ty = rawY + 30;
    let x = tx, y = rawY; const raw = rows.map(([, v]) => { if (x + tw(v) > tx + tableW + 6) { x = tx; y += 10; } const at = [x, y]; x += tw(v) + 6; return at; });
    s.text("RAW TEXT", tx, rawY - 12, D);
    rows.forEach(([k, v], i) => {
      const t = ease((p - 0.08 - i * 0.06) / 0.26), ry = ty + 14 + i * 12, X = lerp(raw[i][0], tx + kw, t), Y = lerp(raw[i][1], ry, t);
      if (t > 0) s.text(v, raw[i][0], raw[i][1], D);                                              // the word stays, faint, where it came from
      if (t > 0.9) { s.text(k, tx, ry, D); s.line(tx, ry + 9, tx + tableW, ry + 9, 1); s.rect(tx + kw - 5, ry + 2, 2, 3, O); }
      s.text(v, X, Y, t >= 1 ? HI : t > 0 ? O : W);
    });
    if (p > 0.12) { const ax = tx + (tableW * 0.62 | 0), ay = ty - 8; s.line(ax, ay, ax, ay + 12, D); for (let k = 1; k <= 3; k++) { s.put(ax - k, ay + 12 - k, D); s.put(ax + k, ay + 12 - k, D); } s.text("STRUCTURE", tx, ty, p > 0.4 ? W : G); }   // raw text, an arrow down, then the structure
  }

  /* ---- Classical: a line is fitted to points ---- */
  const PTS = [[0.08, 0.86], [0.15, 0.74], [0.2, 0.83], [0.27, 0.66], [0.33, 0.7], [0.4, 0.55], [0.46, 0.62], [0.52, 0.47], [0.58, 0.5], [0.65, 0.37], [0.71, 0.42], [0.78, 0.27], [0.85, 0.31], [0.92, 0.17]];
  function classical(s, p) {
    const R = region(s), w = Math.min(R.w - 16, 150), h = Math.min(R.h - 44, 96), x0 = R.x + (R.w - w >> 1) + 2, y0 = R.y + (R.h + h >> 1) - 2;
    const t = ease((p - 0.08) / 0.46), fit = [0.93, -0.83], from = [0.42, 0.18], a = lerp(from[0], fit[0], t), b = lerp(from[1], fit[1], t);
    s.line(x0, y0, x0 + w, y0, D); s.line(x0, y0, x0, y0 - h, D);
    s.text("PRICE", x0 + w - tw("PRICE"), y0 + 4, D); s.text("DEMAND", x0, y0 - h - 21, D);
    let sum = 0;
    for (const [u, v] of PTS) {
      const X = x0 + u * w, Y = y0 - v * h, L = y0 - (a + b * u) * h; sum += Math.abs(v - (a + b * u));
      s.line(X, Y, X, L, t >= 1 ? G : O, true);                                                  // the gap between each point and the line
    }
    for (const [u, v] of PTS) s.rect(x0 + u * w - 1, y0 - v * h - 1, 3, 3, HI);
    const yA = Math.max(0, Math.min(1, a)), yB = Math.max(0, Math.min(1, a + b)); s.line(x0, y0 - yA * h, x0 + w, y0 - yB * h, t >= 1 ? O : W);
    const e = "AVG MISS " + (sum / PTS.length).toFixed(2); s.text(e, x0 + w - tw(e), y0 - h - 11, t >= 1 ? HI : O);
    s.text(t >= 1 ? "FITTED" : "FITTING", x0 + w - tw("FITTING"), y0 - h - 21, t >= 1 ? O : G);
  }

  /* ---- Art and tools: a photo becomes a numbered outline, then a painting ---- */
  function art(s, p) {
    const R = region(s), w = Math.min(R.w - 12, 132) & ~1, h = Math.min(R.h - 26, 84), x0 = R.x + (R.w - w >> 1), y0 = R.y + (R.h - h >> 1) + 6;
    const zone = (i, j) => { const u = i / w, v = j / h, dx = u - 0.7, dy = (v - 0.3) * h / w; if (dx * dx + dy * dy < 0.011) return 4; if (v > 0.62 + 0.1 * Math.sin(u * 5.5)) return 1; if (v > 0.46 + 0.09 * Math.sin(u * 3.1 + 1.8)) return 2; return 3; };
    const tone = [0, 1, 2, 3], a = clamp((p - 0.08) / 0.18), b = clamp((p - 0.32) / 0.26), label = b >= 1 ? "3 PAINTED BY NUMBER" : a >= 1 ? "2 NUMBERED OUTLINE" : "1 PHOTO";
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const z = zone(i, j), edge = z !== zone(i + 1, j) || z !== zone(i, j + 1), bay = BAYER[(j & 3) << 2 | i & 3];
      const u = i / w, v = j / h, photo = z === 4 ? 4 : Math.min(3.6, 0.6 + (1 - v) * 1.6 + (z === 1 ? -0.2 : z === 2 ? 0.5 : 1.3) + 0.5 * Math.sin(u * 23 + v * 31) * Math.cos(u * 11 - v * 17));
      const painted = b > 0 && u < b * 1.02;                                                      // paint arrives left to right
      let c = painted ? (z === 4 ? O : tone[z]) : a >= 1 ? 0 : Math.min(4, photo * (1 - a) + bay | 0);
      if (a > 0 && edge && bay < a + 0.2) c = painted ? W : D;                                    // the outline of each region
      s.put(x0 + i, y0 + j, c);
    }
    if (a >= 1) [[0.14, 0.2, "3"], [0.28, 0.56, "2"], [0.42, 0.82, "1"], [0.68, 0.26, "4"]].forEach(([u, v, n]) => { const done = b > u + 0.1; s.rect(x0 + u * w - 2, y0 + v * h - 5, 9, 11, done ? 0 : 0); s.text(n, x0 + u * w, y0 + v * h - 3, done ? D : W); });
    s.box(x0 - 2, y0 - 2, w + 4, h + 4, G); s.text(label, x0, y0 - 12, b >= 1 ? HI : W);
  }
  const SCENES = { agents, nlp, classical, art };

  /* ---- Still panels: reduced motion, or when the stage is not pinned ---- */
  function stills() {
    stage.classList.add("still");
    states.forEach(st => {
      let cv = st.querySelector("canvas"); if (!cv) { cv = document.createElement("canvas"); cv.className = "state-cv"; cv.setAttribute("aria-hidden", "true"); st.insertBefore(cv, st.firstChild); }
      const s = Surface(cv); s.still = true; const paint = () => { if (!s.fit()) return; s.clear(); s.fade(1); SCENES[st.dataset.kind](s, 0.8); s.flush(); };
      paint(); new ResizeObserver(paint).observe(cv); st.classList.add("on");
      const re = () => { setPal(); paint(); }; document.addEventListener("themechange", re); matchMedia("(prefers-color-scheme: dark)").addEventListener("change", re);
    });
  }
  if (reduced || !CSS.supports("position", "sticky")) return stills();

  /* ---- The pinned stage ---- */
  const cv = stage.querySelector(".stage-cv"), s = Surface(cv), dots = Array.from(stage.querySelectorAll(".stage-step"));
  let visible = false, queued = false, lastKey = "";
  function progress() { const r = stage.getBoundingClientRect(), span = r.height - pin.offsetHeight; return span > 0 ? Math.max(0, Math.min(0.9999, -r.top / span)) : 0; }
  function frame() {
    queued = false; if (!visible || !s.fit()) return;
    const P = progress() * states.length, i = Math.min(states.length - 1, P | 0), raw = P - i, key = i + ":" + (raw * 400 | 0) + ":" + s.w + "x" + s.h + ":" + theme;
    // the first field is already under way when the page opens, so the first screen is never empty
    const p = i === 0 ? 0.5 + raw * 0.5 : raw;
    states.forEach((st, k) => st.classList.toggle("on", k === i && (i === 0 || raw > 0.2) && (raw < 0.94 || k === states.length - 1)));
    dots.forEach((d, k) => d.classList.toggle("on", k === i));
    stage.classList.toggle("deep", P > 0.55);
    if (key === lastKey) return; lastKey = key;
    s.clear(); s.fade(Math.min(1, i === 0 ? 1 : raw / 0.07, i === states.length - 1 ? 1 : (1 - raw) / 0.06));
    SCENES[states[i].dataset.kind](s, p); s.flush();
  }
  const ask = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };
  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) ask(); }).observe(stage);
  addEventListener("scroll", ask, { passive: true }); new ResizeObserver(() => { lastKey = ""; ask(); }).observe(pin);
  // The step marks jump to a state: to the point in the scroll where its scene has settled.
  dots.forEach((d, k) => d.addEventListener("click", () => { const span = stage.offsetHeight - pin.offsetHeight; scrollTo({ top: stage.getBoundingClientRect().top + scrollY + span * (k + 0.75) / states.length, behavior: "smooth" }); }));
  stage.classList.add("live"); ask();
  const retheme = () => { setPal(); lastKey = ""; ask(); };
  document.addEventListener("themechange", retheme); matchMedia("(prefers-color-scheme: dark)").addEventListener("change", retheme);
})();
