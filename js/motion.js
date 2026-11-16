/* Shared motion and feel: reveals, word splitting, sound, theme, spotlight, clock, copy. No dependencies. */
(function () {
  "use strict";
  const root = document.documentElement;
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---- Sound: tiny synthesized clicks, panned to where the pointer is. Off switch in the nav. ---- */
  const sound = (function () {
    const AC = window.AudioContext || window.webkitAudioContext;
    let ctx = null, out = null, noise = null, on = true, unlocked = false;
    try { on = localStorage.getItem("sound") !== "off"; } catch (e) {}
    function init() {
      ctx = new AC({ latencyHint: "interactive" });
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.18;
      out = ctx.createGain(); out.gain.value = 0.9; out.connect(comp).connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    function unlock() { if (!AC) return; if (!ctx) init(); if (ctx.state !== "running") ctx.resume(); unlocked = true; }
    ["pointerdown", "keydown", "touchend"].forEach(t => addEventListener(t, unlock, { capture: true, passive: true }));
    document.addEventListener("visibilitychange", () => { if (ctx) document.hidden ? ctx.suspend() : unlocked && ctx.resume(); });
    const rnd = (a, b) => a + Math.random() * (b - a);
    const pan = x => x == null ? 0 : Math.max(-1, Math.min(1, x / innerWidth * 2 - 1)) * 0.6;
    function route(node, p) {
      if (ctx.createStereoPanner) { const s = ctx.createStereoPanner(); s.pan.value = p; node.connect(s).connect(out); } else node.connect(out);
    }
    function env(g, t, attack, peak, decay) {
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    }
    function click(t, { freq = 4200, q = 1.4, dur = 0.012, gain = 0.07, p = 0 }) {
      const src = ctx.createBufferSource(); src.buffer = noise; src.playbackRate.value = rnd(0.85, 1.15);
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); env(g, t, 0.002, gain, dur);
      src.connect(f).connect(g); route(g, p); src.start(t, rnd(0, 0.7)); src.stop(t + dur + 0.06);
    }
    function tone(t, { f0, f1, dur = 0.1, gain = 0.1, type = "sine", p = 0 }) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = ctx.createGain(); env(g, t, 0.004, gain, dur);
      o.connect(g); route(g, p); o.start(t); o.stop(t + dur + 0.06);
    }
    const voices = {
      tick: (t, p) => { click(t, { freq: rnd(3800, 4600), p }); tone(t, { f0: rnd(2300, 2600), dur: 0.012, gain: 0.016, p }); },
      hover: (t, p) => click(t, { freq: rnd(5200, 6200), q: 2, dur: 0.007, gain: 0.02, p }),
      tap: (t, p) => { tone(t, { f0: rnd(680, 740), f1: 470, dur: 0.06, gain: 0.1, p }); click(t, { freq: 1800, q: 1, gain: 0.035, p }); },
      toggle: (t, p) => { tone(t, { f0: 520, f1: 780, dur: 0.07, gain: 0.08, p }); click(t, { freq: 3000, gain: 0.03, p }); },
      step: (t, p) => { click(t, { freq: rnd(2600, 3000), q: 2.2, dur: 0.01, gain: 0.05, p }); },
      bad: (t, p) => tone(t, { f0: 300, f1: 170, dur: 0.16, gain: 0.11, type: "triangle", p }),
      success: (t, p) => [659.25, 987.77].forEach((f, i) => { tone(t + i * 0.085, { f0: f, dur: 0.42, gain: 0.07, p }); tone(t + i * 0.085, { f0: f * 2, dur: 0.2, gain: 0.016, p }); }),
    };
    return {
      play(name, x) { if (!on || !unlocked || !ctx || ctx.state !== "running" || !voices[name]) return; voices[name](ctx.currentTime + 0.001, pan(x)); },
      get on() { return on; },
      set(v) { on = !!v; root.classList.toggle("sound-off", !on); try { localStorage.setItem("sound", on ? "on" : "off"); } catch (e) {} },
    };
  })();

  document.addEventListener("click", e => {
    const el = e.target.closest("a, button");
    if (el && !el.hasAttribute("data-quiet")) sound.play(el.dataset.sound || "tick", e.clientX);
  });
  if (finePointer) $$("a.row, .top-nav a, .checks a, .pill").forEach(el => el.addEventListener("pointerenter", e => sound.play("hover", e.clientX)));

  const soundBtn = document.getElementById("sound-btn");
  if (soundBtn) { soundBtn.setAttribute("data-quiet", ""); soundBtn.addEventListener("click", e => { sound.set(!sound.on); sound.play("toggle", e.clientX); }); }

  /* ---- Split headings into words so they can cascade in. Screen readers get the plain sentence. ---- */
  function split(el) {
    if (el.dataset.splitDone) return; el.dataset.splitDone = "1";
    const plain = document.createElement("span"); plain.className = "sr-only"; plain.textContent = el.textContent.replace(/\s+/g, " ").trim();
    const vis = document.createElement("span"); vis.setAttribute("aria-hidden", "true");
    let wi = 0;
    (function walk(node, into) {
      node.childNodes.forEach(ch => {
        if (ch.nodeType === 3) {
          ch.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { into.appendChild(document.createTextNode(" ")); return; }
            const w = document.createElement("span"); w.className = "w"; w.style.setProperty("--wi", wi++); w.textContent = part; into.appendChild(w);
          });
        } else { const clone = ch.cloneNode(false); into.appendChild(clone); walk(ch, clone); }
      });
    })(el, vis);
    el.textContent = ""; el.append(plain, vis); el.classList.add("split");
  }
  $$("[data-split]").forEach(split);

  /* ---- Reveal on scroll ---- */
  const show = el => { el.classList.add("visible"); el.dispatchEvent(new CustomEvent("reveal")); };
  const targets = $$(".reveal, .reveal-split");
  if (reduced || !("IntersectionObserver" in window)) targets.forEach(show);
  else {
    const io = new IntersectionObserver(entries => entries.forEach(en => { if (en.isIntersecting) { show(en.target); io.unobserve(en.target); } }), { rootMargin: "0px 0px -7% 0px" });
    targets.forEach(el => io.observe(el));
  }

  /* ---- Theme: the new theme wipes down the page, like a document re-rendering. ---- */
  const themeBtn = document.getElementById("theme-btn"), themeMeta = document.querySelector('meta[name="theme-color"]');
  const isDark = () => root.getAttribute("data-theme") === "dark";
  const syncMeta = () => themeMeta && (themeMeta.content = isDark() ? "#0f0f0f" : "#f5f5f4");
  syncMeta();
  if (themeBtn) {
    themeBtn.setAttribute("data-quiet", "");
    themeBtn.addEventListener("click", e => {
      const dark = !isDark();
      const apply = () => { dark ? root.setAttribute("data-theme", "dark") : root.removeAttribute("data-theme"); syncMeta(); };
      try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch (err) {}
      sound.play("toggle", e.clientX);
      if (!document.startViewTransition || reduced) return apply();
      root.classList.add("theme-vt");
      document.startViewTransition(apply).finished.finally(() => root.classList.remove("theme-vt"));
    });
  }

  /* ---- Cursor spotlight on card borders ---- */
  $$("[data-spotlight]").forEach(el => el.addEventListener("pointermove", e => {
    const r = el.getBoundingClientRect(); el.style.setProperty("--mx", (e.clientX - r.left).toFixed(0) + "px"); el.style.setProperty("--my", (e.clientY - r.top).toFixed(0) + "px");
  }));

  /* ---- Copy to clipboard, with the icon morphing to a check ---- */
  $$("[data-copy]").forEach(btn => {
    btn.setAttribute("data-quiet", "");
    btn.addEventListener("click", async e => {
      try { await navigator.clipboard.writeText(btn.dataset.copy); } catch (err) { return; }
      const label = btn.querySelector("[data-copy-label]"), was = label && label.textContent;
      btn.classList.add("copied"); if (label) label.textContent = "copied";
      sound.play("success", e.clientX);
      clearTimeout(btn._t); btn._t = setTimeout(() => { btn.classList.remove("copied"); if (label) label.textContent = was; }, 1600);
    });
  });

  /* ---- A live clock in Bengaluru time; each digit rolls when it changes. ---- */
  const clocks = $$("[data-clock]");
  if (clocks.length) {
    const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    const ease = "cubic-bezier(0.16, 1, 0.3, 1)";
    function roll(el, text) {
      if (!el._slots) { el._slots = []; el.textContent = ""; }
      while (el._slots.length < text.length) { const s = document.createElement("span"); s.className = "clock-slot"; el.appendChild(s); el._slots.push(s); }
      [...text].forEach((ch, i) => {
        const slot = el._slots[i]; if (slot.dataset.v === ch) return; slot.dataset.v = ch;
        const old = slot.lastElementChild, next = document.createElement("span"); next.textContent = ch; slot.appendChild(next);
        if (!old) return; if (document.hidden || reduced) return old.remove();
        old.animate([{ transform: "none", opacity: 1 }, { transform: "translateY(-70%)", opacity: 0, filter: "blur(2px)" }], { duration: 420, easing: ease }).onfinish = () => old.remove();
        next.animate([{ transform: "translateY(70%)", opacity: 0, filter: "blur(2px)" }, { transform: "none", opacity: 1 }], { duration: 520, easing: ease });
      });
    }
    const tick = () => clocks.forEach(c => roll(c, fmt.format(new Date())));
    tick(); setInterval(tick, 1000);
  }

  window.motion = { sound, reduced, show, split };
})();
