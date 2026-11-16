/* Shared behaviour for every page: sound, theme, rows that open, copy, the field filter, reveals, and the seam under the black band.
   No dependencies. Exposes window.motion for js/scene.js and js/descent.js. */
(function () {
  "use strict";
  const root = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

  /* ---- Sound: a few short, quiet synthesized clicks on actions. Nothing on hover, nothing before the first press. ---- */
  const sound = (function () {
    const AC = window.AudioContext || window.webkitAudioContext;
    let ctx = null, out = null, noise = null, on = true, unlocked = false;
    try { on = localStorage.getItem("sound") !== "off"; } catch (e) {}
    function init() {
      ctx = new AC({ latencyHint: "interactive" });
      out = ctx.createGain(); out.gain.value = 0.5; out.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate / 2, ctx.sampleRate);
      const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    function unlock() { if (!AC || unlocked) return; try { if (!ctx) init(); if (ctx.state !== "running") ctx.resume(); unlocked = true; } catch (e) {} }
    ["pointerdown", "keydown"].forEach(t => addEventListener(t, unlock, { capture: true, passive: true }));
    document.addEventListener("visibilitychange", () => { if (ctx) document.hidden ? ctx.suspend() : unlocked && ctx.resume(); });
    const rnd = (a, b) => a + Math.random() * (b - a);
    function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
    function click(t, freq, dur, gain, q) {
      const s = ctx.createBufferSource(); s.buffer = noise; const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q || 1.5;
      const g = ctx.createGain(); env(g, t, 0.002, gain, dur); s.connect(f).connect(g).connect(out); s.start(t, rnd(0, 0.3)); s.stop(t + dur + 0.05);
    }
    function tone(t, f0, f1, dur, gain, type) {
      const o = ctx.createOscillator(); o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = ctx.createGain(); env(g, t, 0.004, gain, dur); o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
    }
    const voices = {
      tick: t => click(t, rnd(3800, 4600), 0.012, 0.05),
      open: t => { tone(t, 420, 640, 0.07, 0.06); click(t, 2600, 0.01, 0.025); },
      close: t => { tone(t, 600, 400, 0.06, 0.05); click(t, 2200, 0.01, 0.025); },
      toggle: t => tone(t, 520, 780, 0.07, 0.06),
      step: t => click(t, 3000, 0.014, 0.04),
      blip: t => tone(t, rnd(880, 940), 0, 0.05, 0.03, "triangle"),
      bad: t => tone(t, 300, 220, 0.12, 0.05),
      land: t => [523.25, 783.99].forEach((f, i) => tone(t + i * 0.07, f, 0, 0.3, 0.04)),
      success: t => [659.25, 987.77].forEach((f, i) => tone(t + i * 0.085, f, 0, 0.4, 0.05)),
    };
    return {
      play(name) { if (!on || !unlocked || !ctx || ctx.state !== "running" || !voices[name]) return; try { voices[name](ctx.currentTime + 0.001); } catch (e) {} },
      get on() { return on; },
      set(v) { on = !!v; root.classList.toggle("sound-off", !on); try { localStorage.setItem("sound", on ? "on" : "off"); } catch (e) {} sync(); },
    };
  })();
  function sync() { $$("[data-sound-toggle]").forEach(b => { b.setAttribute("aria-pressed", sound.on ? "true" : "false"); b.textContent = sound.on ? "Sound on" : "Sound off"; }); }
  root.classList.toggle("sound-off", !sound.on); sync();
  window.motion = { reduced, sound };

  /* ---- Rows that open in place ---- */
  function setExp(btn, open) {
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    const p = document.getElementById(btn.getAttribute("aria-controls")); if (p) p.classList.toggle("open", open);
  }

  /* ---- The field filter on the work grid ---- */
  const map = document.querySelector(".map");
  function setFilter(f) {
    if (!map) return;
    const cur = map.dataset.filter || "", next = cur === f ? "" : f;
    if (next) map.dataset.filter = next; else delete map.dataset.filter;
    $$("button[data-filter]", map).forEach(b => b.setAttribute("aria-pressed", String((b.dataset.filter || "") === next)));
    $$(".cos > li", map).forEach(li => li.classList.toggle("none", !!next && !li.querySelector('.proj > li[data-f="' + next + '"]')));
    const total = $$(".proj > li", map).length, n = next ? $$('.proj > li[data-f="' + next + '"]', map).length : total;
    const name = next ? map.querySelector('.fbtn[data-filter="' + next + '"] b').textContent : "";
    map.querySelector(".map-status").textContent = next ? "Showing " + n + " of " + total + ": " + name : "All " + total + " projects";
  }

  /* ---- Theme: follows the system until the switch is used. The black band does not change. ---- */
  const isDark = () => getComputedStyle(root).colorScheme.indexOf("dark") >= 0;
  function theme(btn) {
    const dark = !isDark();
    const apply = () => { root.dataset.theme = dark ? "dark" : "light"; try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {} btn.setAttribute("aria-pressed", String(dark)); };
    sound.play("toggle");
    if (!document.startViewTransition || reduced) return apply();
    const r = btn.getBoundingClientRect();
    root.style.setProperty("--vx", r.left + r.width / 2 + "px"); root.style.setProperty("--vy", r.top + r.height / 2 + "px");
    root.classList.add("vt"); document.startViewTransition(apply).finished.finally(() => root.classList.remove("vt"));
  }
  $$("[data-theme-toggle]").forEach(b => b.setAttribute("aria-pressed", String(isDark())));

  /* ---- One click handler ---- */
  document.addEventListener("click", e => {
    const t = e.target.closest("a, button"); if (!t) return;
    if (t.matches("[data-exp]")) { const open = t.getAttribute("aria-expanded") !== "true"; setExp(t, open); return sound.play(open ? "open" : "close"); }
    if (t.matches("[data-sound-toggle]")) { sound.set(!sound.on); return sound.play("toggle"); }
    if (t.matches("button[data-filter]")) { setFilter(t.dataset.filter || ""); return sound.play("toggle"); }
    if (t.matches("[data-theme-toggle]")) return theme(t);
    if (t.matches("[data-copy]")) {
      const l = t.querySelector("[data-copy-label]") || t;
      if (!t._was) t._was = l.textContent;
      const done = () => { t.classList.add("copied"); l.textContent = "Copied"; sound.play("success"); clearTimeout(t._t); t._t = setTimeout(() => { t.classList.remove("copied"); l.textContent = t._was; }, 1500); };
      return void (navigator.clipboard ? navigator.clipboard.writeText(t.dataset.copy) : Promise.reject()).then(done, () => {});
    }
    const hash = t.matches("a[href^='#']") && t.getAttribute("href").slice(1);
    if (hash) {
      const target = document.getElementById(hash);
      if (target) {
        e.preventDefault();
        const row = target.matches("[data-exp]") ? target : null; if (row) setExp(row, true);
        target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
        if (row) row.focus({ preventScroll: true });
        try { history.replaceState(null, "", "#" + hash); } catch (err) {}
      }
    }
    sound.play("tick");
  });

  /* ---- A phrase and its number light each other (pointer only, silent) ---- */
  $$(".field").forEach(f => {
    const link = (p, on) => $$('[data-p="' + p + '"]', f).forEach(n => n.classList.toggle("lit", on));
    $$("[data-p]", f).forEach(n => { n.addEventListener("pointerenter", () => link(n.dataset.p, true)); n.addEventListener("pointerleave", () => link(n.dataset.p, false)); });
  });

  /* ---- Reveals ---- */
  const rv = $$(".rv");
  if (reduced || !("IntersectionObserver" in window)) rv.forEach(n => n.classList.add("seen"));
  else { const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add("seen"); io.unobserve(en.target); } }), { rootMargin: "0px 0px -8% 0px" }); rv.forEach(n => io.observe(n)); }

  /* ---- The seam: the black band dissolves into the page as ordered-dither cells. Drawn once, and again on resize. ---- */
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function drawSeams() {
    $$("canvas.seam").forEach(cv => {
      const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
      const cell = w < 600 ? 3 : Math.max(4, Math.ceil(w / 400)), cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
      cv.width = cols; cv.height = rows;
      const c = cv.getContext("2d"); c.clearRect(0, 0, cols, rows); c.fillStyle = "#000";
      for (let y = 0; y < rows; y++) {
        const keep = Math.pow(1 - y / rows, 1.6) * 16.5;   // how many of the 16 thresholds stay black on this row
        for (let x = 0; x < cols; x++) if (BAYER[(y & 3) << 2 | x & 3] < keep) c.fillRect(x, y, 1, 1);
      }
    });
  }
  drawSeams();
  let rs = 0; addEventListener("resize", () => { clearTimeout(rs); rs = setTimeout(drawSeams, 120); });
})();
