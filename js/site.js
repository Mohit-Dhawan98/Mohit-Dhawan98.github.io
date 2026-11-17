/* Shared behaviour for every page: sound and haptics, theme, the way back, (i) tags, copy, reveals, the reading line,
   figure motion, image lightbox, and the seam under the band. No dependencies. Exposes window.motion. */
(function () {
  "use strict";
  const root = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  let px = innerWidth / 2;                                               // the pointer's x, for panning sounds
  addEventListener("pointerdown", e => { px = e.clientX; }, { capture: true, passive: true });
  addEventListener("pointermove", e => { px = e.clientX; }, { passive: true });

  /* ---- Sound: short, quiet synthesized sounds on actions only. Through a compressor and a short reverb, panned to
     where the pointer is, a little different each time, rate-limited per voice. Nothing on hover, nothing before the first press. ---- */
  const sound = (function () {
    const AC = window.AudioContext || window.webkitAudioContext;
    let ctx = null, out = null, wet = null, noise = null, on = true, unlocked = false, hinted = 0;
    const last = {};
    try { on = localStorage.getItem("sound") !== "off"; } catch (e) {}
    function init() {
      try { if (navigator.audioSession) navigator.audioSession.type = "ambient"; } catch (e) {}   // never interrupts the visitor's music
      ctx = new AC({ latencyHint: "interactive" });
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.18;
      out = ctx.createGain(); out.gain.value = 0.5; out.connect(comp).connect(ctx.destination);
      const verb = ctx.createConvolver(), len = ctx.sampleRate * 0.6 | 0, ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
      verb.buffer = ir; wet = ctx.createGain(); wet.gain.value = 1; wet.connect(verb).connect(comp);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    function unlock() { if (!AC || unlocked) return; try { if (!ctx) init(); if (ctx.state !== "running") ctx.resume(); unlocked = true; } catch (e) {} }
    // Creating an audio context takes about a tenth of a second. Do it while the page is idle, not inside the first press.
    if (AC) (window.requestIdleCallback || (f => setTimeout(f, 1200)))(() => { try { if (!ctx) init(); } catch (e) {} }, { timeout: 4000 });
    ["pointerdown", "keydown", "touchend"].forEach(t => addEventListener(t, unlock, { capture: true, passive: true }));
    document.addEventListener("visibilitychange", () => { if (ctx) document.hidden ? ctx.suspend() : unlocked && ctx.resume(); });
    const rnd = (a, b) => a + Math.random() * (b - a);
    function bus(pan, send) {                                           // a voice's own panner, and a little reverb for the softer sounds
      const p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(out);
      if (send) { const s = ctx.createGain(); s.gain.value = send; p.connect(s).connect(wet); }
      return p;
    }
    function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
    function click(o, t, freq, dur, gain, q) {
      const s = ctx.createBufferSource(); s.buffer = noise; s.playbackRate.value = rnd(0.85, 1.15);
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q || 1.5;
      const g = ctx.createGain(); env(g, t, 0.002, gain, dur); s.connect(f).connect(g).connect(o); s.start(t, rnd(0, 0.7)); s.stop(t + dur + 0.05);
    }
    function tone(o, t, f0, f1, dur, gain, type) {
      const k = ctx.createOscillator(); k.type = type || "sine"; k.frequency.setValueAtTime(f0 * rnd(0.99, 1.01), t); if (f1) k.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = ctx.createGain(); env(g, t, 0.004, gain, dur); k.connect(g).connect(o); k.start(t); k.stop(t + dur + 0.05);
    }
    // name: [reverb send, minimum ms between plays, how it sounds]
    const voices = {
      tick: [0, 25, (o, t) => click(o, t, rnd(3800, 4600), 0.012, 0.05)],
      open: [0.2, 25, (o, t) => { tone(o, t, 420, 640, 0.07, 0.06); click(o, t, 2600, 0.01, 0.025); }],
      close: [0.2, 25, (o, t) => { tone(o, t, 600, 400, 0.06, 0.05); click(o, t, 2200, 0.01, 0.025); }],
      toggle: [0.25, 25, (o, t) => tone(o, t, 520, 780, 0.07, 0.06)],
      step: [0, 60, (o, t, f) => click(o, t, f || 3000, 0.014, 0.04)],
      blip: [0.2, 25, (o, t) => tone(o, t, rnd(880, 940), 0, 0.05, 0.03, "triangle")],
      bad: [0.25, 25, (o, t) => tone(o, t, 300, 220, 0.12, 0.05)],
      land: [0.35, 25, (o, t) => [523.25, 783.99].forEach((f, i) => tone(o, t + i * 0.07, f, 0, 0.3, 0.04))],
      success: [0.35, 25, (o, t) => [659.25, 987.77].forEach((f, i) => tone(o, t + i * 0.085, f, 0, 0.4, 0.05))],
    };
    let pulseT = 0;
    function pulse() { if (reduced) return; const now = performance.now(); if (now - pulseT < 120) return; pulseT = now; root.classList.add("sound-pulse"); setTimeout(() => root.classList.remove("sound-pulse"), 160); }
    return {
      play(name, x, arg) {
        const v = voices[name]; if (!on || !v) return;
        if (!unlocked || !ctx || ctx.state !== "running") {                // sound is on but the browser has not let it start: the speaker wiggles once
          const now = performance.now(); if (!reduced && now - hinted > 15000) { hinted = now; root.classList.add("sound-hint"); setTimeout(() => root.classList.remove("sound-hint"), 1400); }
          return;
        }
        const now = performance.now(); if (now - (last[name] || 0) < v[1]) return; last[name] = now;
        const pan = Math.max(-1, Math.min(1, (x === undefined ? px : x) / innerWidth * 2 - 1)) * 0.6;
        try { v[2](bus(pan, v[0]), ctx.currentTime + 0.001, arg); pulse(); } catch (e) {}
      },
      get on() { return on; },
      set(v) { on = !!v; root.classList.toggle("sound-off", !on); try { localStorage.setItem("sound", on ? "on" : "off"); } catch (e) {} sync(); },
    };
  })();
  function sync() {
    $$("[data-sound-toggle]").forEach(b => {
      b.setAttribute("aria-pressed", sound.on ? "true" : "false"); b.setAttribute("aria-label", sound.on ? "Sound on. Turn it off." : "Sound off. Turn it on.");
      const l = b.querySelector("[data-sound-label]") || b; l.textContent = sound.on ? "Sound on" : "Sound off";
    });
  }
  root.classList.toggle("sound-off", !sound.on); sync();

  /* ---- Haptics, on touch screens only: a short tick, a tap, a success ---- */
  const HAPTIC = { detent: 4, tick: 8, tap: 14, success: [12, 70, 22] };
  let hLast = 0;
  const haptic = name => { if (!coarse || !navigator.vibrate || !sound.on) return; const now = performance.now(); if (now - hLast < 35) return; hLast = now; try { navigator.vibrate(HAPTIC[name] || 8); } catch (e) {} };
  window.motion = { reduced, sound, haptic };

  /* ---- Theme: follows the system until the switch is used. Everything follows it. The change is one soft-edged circle
     from the switch over the whole page; canvases redraw inside it so the new frame is finished, and nothing eases inside it. ---- */
  const isDark = () => getComputedStyle(root).colorScheme.indexOf("dark") >= 0;
  const themeColor = () => { const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = getComputedStyle(root).getPropertyValue("--b-bg").trim() || "#000"; };
  function theme(btn) {
    const dark = !isDark();
    const apply = () => { root.dataset.theme = dark ? "dark" : "light"; try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {} $$("[data-theme-toggle]").forEach(b => b.setAttribute("aria-pressed", String(dark))); themeColor(); document.dispatchEvent(new CustomEvent("themechange")); };
    const r = btn.getBoundingClientRect(); sound.play("toggle", r.left + r.width / 2); haptic("tap");
    if (!document.startViewTransition || reduced) return apply();
    root.style.setProperty("--vx", r.left + r.width / 2 + "px"); root.style.setProperty("--vy", r.top + r.height / 2 + "px");
    root.classList.add("vt"); document.startViewTransition(apply).finished.finally(() => root.classList.remove("vt"));
  }
  $$("[data-theme-toggle]").forEach(b => b.setAttribute("aria-pressed", String(isDark())));
  themeColor(); matchMedia("(prefers-color-scheme: dark)").addEventListener("change", themeColor);

  /* ---- One click handler ---- */
  document.addEventListener("click", e => {
    const t = e.target.closest("a, button"); if (!t) return;
    const x = e.clientX || (t.getBoundingClientRect().left + t.getBoundingClientRect().width / 2);
    if (t.matches("[data-sound-toggle]")) { sound.set(!sound.on); haptic("tap"); return sound.play("toggle", x); }
    if (t.matches("[data-theme-toggle]")) return theme(t);
    if (t.matches("[data-copy]")) {
      const done = () => { t.classList.add("copied"); sound.play("success", x); haptic("success"); const n = t.querySelector("[data-copy-note]"); if (n) n.textContent = "Copied to the clipboard"; clearTimeout(t._t); t._t = setTimeout(() => { t.classList.remove("copied"); if (n) n.textContent = ""; }, 1800); };
      return void (navigator.clipboard ? navigator.clipboard.writeText(t.dataset.copy) : Promise.reject()).then(done, () => {});
    }
    const hash = t.matches("a[href^='#']") && t.getAttribute("href").slice(1);
    if (hash) {
      const target = document.getElementById(hash);
      if (target) { e.preventDefault(); target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" }); try { history.replaceState(null, "", "#" + hash); } catch (err) {} }
    }
    sound.play("tick", x); haptic("tick");
  });

  /* ---- The way back. When the visitor came from the page the control points at, step back through history, so the
     scroll position and the card they left are restored. Either way the page transition plays in reverse. ---- */
  const sameDoc = (a, b) => { try { const x = new URL(a, location.href), y = new URL(b, location.href); return x.origin === y.origin && x.pathname.replace(/index\.html$/, "") === y.pathname.replace(/index\.html$/, ""); } catch (e) { return false; } };
  function goBack(a) {
    try { sessionStorage.setItem("nav-back", "1"); } catch (e) {}
    if (document.referrer && sameDoc(document.referrer, a.href) && history.length > 1) { history.back(); return true; }
    return false;
  }
  $$("[data-back]").forEach(a => a.addEventListener("click", e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; sound.play("close", e.clientX); if (goBack(a)) e.preventDefault(); }));
  document.addEventListener("keydown", e => {                         // Escape on a project page goes back, unless something is open or focus is in a field
    if (e.key !== "Escape" || e.defaultPrevented || !document.querySelector("main.project")) return;
    if (document.querySelector(".info.open, .bubble.on, .lightbox") || e.target.closest("input, textarea, select, [contenteditable]")) return;
    const a = document.querySelector(".back-row [data-back]"); if (a && !goBack(a)) location.href = a.href;
  });
  const isBack = activation => { try { if (sessionStorage.getItem("nav-back")) return true; return !!(activation && activation.navigationType === "traverse" && activation.from && activation.entry && activation.entry.index < activation.from.index); } catch (e) { return false; } };
  addEventListener("pageswap", e => { if (e.viewTransition && isBack(e.activation && { navigationType: e.activation.navigationType, from: navigation.currentEntry, entry: e.activation.entry })) e.viewTransition.types.add("back"); });
  addEventListener("pagereveal", e => { if (!e.viewTransition) return; const back = isBack(window.navigation && navigation.activation); try { sessionStorage.removeItem("nav-back"); } catch (err) {} if (back) e.viewTransition.types.add("back"); });

  /* ---- (i) tags: open on hover, focus or tap; close on leaving, Escape, or a tap elsewhere ---- */
  const infos = $$(".info");
  const showInfo = (box, on) => { box.classList.toggle("open", on); const b = box.querySelector(".itag"); if (b) b.setAttribute("aria-expanded", String(on)); };
  const syncInfo = box => showInfo(box, !!(box._hover || box._focus || box._pin));
  infos.forEach(box => {
    const b = box.querySelector(".itag"); if (!b) return;
    box.addEventListener("pointerenter", e => { if (e.pointerType === "mouse") { box._hover = true; syncInfo(box); } });
    box.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") { box._hover = false; syncInfo(box); } });
    b.addEventListener("focus", () => { box._focus = true; syncInfo(box); });
    b.addEventListener("blur", () => { box._focus = false; box._pin = false; syncInfo(box); });
    b.addEventListener("click", e => { e.stopPropagation(); box._pin = !box._pin; if (!box._pin) { box._hover = false; box._focus = false; } syncInfo(box); sound.play(box._pin ? "open" : "close", e.clientX); });
  });
  const closeInfos = keep => infos.forEach(box => { if (box !== keep) { box._hover = box._pin = box._focus = false; showInfo(box, false); } });
  document.addEventListener("pointerdown", e => closeInfos(e.target.closest ? e.target.closest(".info") : null));
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeInfos(); });

  /* ---- Reveals: each element eases in, slightly blurred, as it enters; whatever arrives together is staggered 60 ms apart.
     Once an element has arrived its reveal classes are removed, so its own hover and press transitions are its own again.
     Nothing starts before the fonts are in, so no line re-wraps while it moves. ---- */
  {
    const cand = $$(".page > *, .work-h > *, .kind-h > *, .carousel, .writing > li, .dd > *, .facts > div, .results > li, .doors > .door, .hero-tl, .hero-bl, .hud, .after > *, .all-list > li, .stage-head > *, .back-row");
    cand.filter(n => !cand.some(m => m !== n && n.contains(m))).forEach(n => n.classList.add("rv"));   // the innermost of each, so things arrive one by one
  }
  const rv = $$(".rv");
  const arrive = (n, k) => {
    n.style.setProperty("--d", Math.min(k, 8) * 60 + "ms"); n.classList.add("seen", "shown");
    setTimeout(() => { n.classList.remove("rv", "seen"); n.style.removeProperty("--d"); }, 1100 + Math.min(k, 8) * 60);
  };
  if (reduced || !("IntersectionObserver" in window)) rv.forEach(n => { n.classList.add("shown"); n.classList.remove("rv"); });
  else {
    const io = new IntersectionObserver(es => {
      es.filter(en => en.isIntersecting).sort((a, b) => a.target.compareDocumentPosition(b.target) & 2 ? 1 : -1).forEach((en, k) => { arrive(en.target, k); io.unobserve(en.target); });
    }, { rootMargin: "0px 0px -7% 0px" });
    (document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 900))]) : Promise.resolve()).then(() => rv.forEach(n => io.observe(n)));
    addEventListener("scroll", () => {                                // at the very bottom, nothing is left waiting
      if (scrollY + innerHeight >= document.documentElement.scrollHeight - 4) $$(".rv:not(.seen)").forEach((n, k) => { arrive(n, k); io.unobserve(n); });
    }, { passive: true });
  }

  /* ---- One scroll loop, once per frame: the reading line on long pages, and images drifting against the scroll ---- */
  const line = document.querySelector(".read-line"), pics = $$(".pic img");
  let queued = false;
  function onFrame() {
    queued = false;
    if (line) { const h = document.documentElement.scrollHeight - innerHeight, w = innerWidth, p = h > 0 ? Math.min(1, scrollY / h) : 0; line.style.transform = `scaleX(${(Math.round(p * w / 4) * 4 / w).toFixed(4)})`; }
    if (!reduced) { const vh = innerHeight; pics.forEach(im => { const r = im.getBoundingClientRect(); if (r.bottom < 0 || r.top > vh) return; im.style.setProperty("--py", ((r.top + r.height / 2 - vh / 2) / vh * -10).toFixed(1) + "px"); }); }
  }
  if (line || pics.length) { addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(onFrame); } }, { passive: true }); addEventListener("resize", onFrame); onFrame(); }

  /* ---- Images open larger in place: the picture grows from where it sits, and goes back there ---- */
  pics.forEach(im => {
    im.tabIndex = 0; im.setAttribute("role", "button"); im.setAttribute("aria-label", "Enlarge: " + (im.alt || "image"));
    const open = () => {
      const r = im.getBoundingClientRect(), box = document.createElement("div"), big = im.cloneNode();
      box.className = "lightbox"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", im.alt || "Image"); big.removeAttribute("tabindex"); big.removeAttribute("role"); big.style.cssText = "";
      box.appendChild(big); document.body.appendChild(box);
      const W = Math.min(innerWidth * 0.92, (innerHeight * 0.86) * im.naturalWidth / im.naturalHeight), H = W * im.naturalHeight / im.naturalWidth;
      big.style.width = W + "px"; big.style.height = H + "px";
      const b = big.getBoundingClientRect(), s = r.width / b.width;
      const from = `translate(${r.left - b.left}px, ${r.top - b.top}px) scale(${s})`;
      if (!reduced) { big.animate([{ transform: from, transformOrigin: "0 0" }, { transform: "none", transformOrigin: "0 0" }], { duration: 650, easing: "cubic-bezier(.16,1,.3,1)" }); }
      requestAnimationFrame(() => box.classList.add("on")); sound.play("open"); im.style.visibility = "hidden";
      const close = () => {
        box.classList.remove("on"); sound.play("close");
        const b2 = big.getBoundingClientRect(), r2 = im.getBoundingClientRect();
        const done = () => { box.remove(); im.style.visibility = ""; im.focus({ preventScroll: true }); };
        if (reduced) return done();
        big.animate([{ transform: "none", transformOrigin: "0 0" }, { transform: `translate(${r2.left - b2.left}px, ${r2.top - b2.top}px) scale(${r2.width / b2.width})`, transformOrigin: "0 0" }], { duration: 420, easing: "cubic-bezier(.65,0,.35,1)", fill: "forwards" }).finished.then(done);
        removeEventListener("keydown", key, true);
      };
      const key = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } };
      box.addEventListener("click", close); addEventListener("keydown", key, true);
    };
    im.addEventListener("click", open); im.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });

  /* ---- The 404 says where the visitor tried to go ---- */
  const lost = document.querySelector("[data-lost-path]"); if (lost) lost.textContent = location.pathname;

  /* ---- The seam: the band dissolves into the page as ordered-dither cells, in the band's own colour. ---- */
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function drawSeams() {
    $$("canvas.seam").forEach(cv => {
      const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
      const cell = w < 600 ? 3 : Math.max(4, Math.ceil(w / 400)), cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
      cv.width = cols; cv.height = rows;
      const c = cv.getContext("2d"); c.clearRect(0, 0, cols, rows); c.fillStyle = getComputedStyle(root).getPropertyValue("--b-bg").trim() || "#000";
      for (let y = 0; y < rows; y++) {
        const keep = Math.pow(1 - y / rows, 1.6) * 16.5;   // how many of the 16 thresholds stay filled on this row
        for (let x = 0; x < cols; x++) if (BAYER[(y & 3) << 2 | x & 3] < keep) c.fillRect(x, y, 1, 1);
      }
    });
  }
  drawSeams(); document.addEventListener("themechange", drawSeams); matchMedia("(prefers-color-scheme: dark)").addEventListener("change", drawSeams);
  let rs = 0; addEventListener("resize", () => { clearTimeout(rs); rs = setTimeout(drawSeams, 120); });

  try { console.log("%c■%c Mohit Dhawan. Hand-written HTML, CSS and JavaScript; every canvas is drawn in code. Write to mohit.dhawan2510@gmail.com", "color:#ff5904", "color:inherit"); } catch (e) {}
})();
