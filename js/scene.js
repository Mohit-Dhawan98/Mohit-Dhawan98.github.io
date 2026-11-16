/* Figure 1: a stepped scene. Runs only while on screen, loops, and can be paused or stepped by hand.
   Each step: caption types out, the path in use lights up, a chip travels the real path, the result lands. */
(function () {
  "use strict";
  const fig = document.querySelector("[data-scene]"); if (!fig) return;
  const svg = fig.querySelector("svg"), $ = id => svg.querySelector("#" + id);
  const M = window.motion || {}, reduced = !!M.reduced, play = (n, x) => M.sound && M.sound.play(n, x);
  const textEl = fig.querySelector("[data-scene-text]"), nEl = fig.querySelector("[data-scene-n]"), countEl = fig.querySelector("[data-scene-count]");
  const pills = Array.from(fig.querySelectorAll("[data-step]")), chip = $("chip");
  const vLabel = svg.querySelector("[data-v-label]"), vVal = svg.querySelector("[data-v]");
  const bars = [0, 1, 2].map(i => $("bar-" + i));

  const STEPS = [
    { text: "Introduce you to your top-ranked candidate. They rank you 47th. You say yes and hear nothing.",
      node: "n-1", row: 1, out: "e-1", back: "b-1", backArrives: false, pill: "p-1", tone: "hot", bars: 1,
      label: "chance both say yes ", value: "≈ 10%", sound: "bad" },
    { text: "Check dealbreakers before any score. Sounding alike cannot outvote wanting different lives.",
      node: "n-2", row: 2, out: "e-2", stopAt: 0.62, breaker: true, pill: "p-2", tone: "hot", bars: 2,
      label: "dealbreaker mismatches ", value: "0 shown", sound: "bad" },
    { text: "Choose the pair where each is near the top of the other's list. Your #3. Their #2.",
      node: "n-3", row: 3, out: "e-3", back: "b-3", backArrives: true, pill: "p-3", tone: "ok", bars: 3,
      label: "chance both say yes ", value: "≈ 84%", sound: "success" },
  ];
  const HOLD = 3400;
  let step = 0, paused = false, visible = false, timer = 0, run = 0;

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const figX = () => { const r = fig.getBoundingClientRect(); return r.left + r.width / 2; };

  function travel(path, from, to, ms, token) {
    const len = path.getTotalLength();
    return new Promise(resolve => {
      const t0 = performance.now();
      (function frame(now) {
        if (token !== run) return resolve();
        const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
        const p = path.getPointAtLength(len * (from + (to - from) * e));
        chip.setAttribute("cx", p.x); chip.setAttribute("cy", p.y);
        k < 1 ? requestAnimationFrame(frame) : resolve();
      })(t0);
    });
  }

  function type(str, token) {
    if (reduced) { textEl.textContent = str; return Promise.resolve(); }
    textEl.textContent = "";
    return new Promise(resolve => {
      let i = 0;
      (function next() {
        if (token !== run) return resolve();
        textEl.textContent = str.slice(0, ++i);
        i < str.length ? setTimeout(next, 14) : resolve();
      })();
    });
  }

  /* Put the diagram in the resting look for a step: what is lit, what is dimmed, which bars are filled. */
  function stage(s, done) {
    const st = STEPS[s];
    ["n-1", "n-2", "n-3"].forEach(id => { const g = $(id); g.classList.remove("hot", "ok"); g.classList.toggle("dim", id !== st.node); });
    $(st.node).classList.add(st.tone); $("n-you").classList.add("hot");
    ["e-1", "e-2", "e-3"].forEach(id => { const e = $(id); e.classList.remove("hot", "ok"); e.classList.toggle("dim", id !== st.out); });
    $(st.out).classList.add(st.tone);
    ["b-1", "b-3"].forEach(id => { const b = $(id); b.classList.remove("hot", "ok"); b.setAttribute("opacity", done && id === st.back ? 1 : 0); });
    if (st.back) $(st.back).classList.add(st.tone);
    [1, 2, 3].forEach(r => ["a", "b"].forEach(c => $("r-" + r + c).classList.toggle("dim", r !== st.row)));
    ["p-1", "p-2", "p-3"].forEach(id => $(id).classList.toggle("on", done && id === st.pill));
    $("brk").classList.toggle("on", !!(done && st.breaker));
    bars.forEach((g, i) => {
      const bar = g.querySelector(".bar"); g.classList.toggle("dim", i >= st.bars);
      bar.setAttribute("width", i < st.bars ? bar.dataset.w : 0);
    });
    vLabel.textContent = st.label; vVal.textContent = done ? st.value : "…";
    chip.classList.toggle("ok", st.tone === "ok");
    if (done) {
      const end = st.back && st.backArrives ? $(st.back) : $(st.out), at = st.back && st.backArrives ? 1 : (st.stopAt || 1);
      const p = end.getPointAtLength(end.getTotalLength() * at); chip.setAttribute("cx", p.x); chip.setAttribute("cy", p.y);
    }
    nEl.textContent = "STEP " + (s + 1) + " OF " + STEPS.length; countEl.textContent = (s + 1) + " / " + STEPS.length;
    pills.forEach((p, i) => p.setAttribute("aria-pressed", String(i === s)));
  }

  async function show(s, animate) {
    const token = ++run; step = s; clearTimeout(timer);
    const st = STEPS[s];
    if (!animate || reduced) { stage(s, true); textEl.textContent = st.text; return schedule(token); }
    stage(s, false);
    play("step", figX());
    const typing = type(st.text, token);
    await wait(350); if (token !== run) return;
    await travel($(st.out), 0, st.stopAt || 1, 900, token); if (token !== run) return;
    if (st.back) {
      $(st.back).setAttribute("opacity", 1);
      if (st.backArrives) { await wait(200); await travel($(st.back), 0, 1, 900, token); }
      else await wait(500);
      if (token !== run) return;
    }
    stage(s, true); play(st.sound, figX());
    await typing; if (token !== run) return;
    schedule(token);
  }

  function schedule(token) {
    clearTimeout(timer);
    if (paused || !visible || reduced) return;
    timer = setTimeout(() => { if (token === run) show((step + 1) % STEPS.length, true); }, HOLD);
  }

  pills.forEach((p, i) => p.addEventListener("click", () => show(i, true)));
  fig.querySelector("[data-prev]").addEventListener("click", () => show((step + STEPS.length - 1) % STEPS.length, true));
  fig.querySelector("[data-next]").addEventListener("click", () => show((step + 1) % STEPS.length, true));
  const pauseBtn = fig.querySelector("[data-pause]");
  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    pauseBtn.innerHTML = paused ? '<svg viewBox="0 0 12 12"><path d="M3 1.5v9l7-4.5z"/></svg>' : '<svg viewBox="0 0 12 12"><path d="M2.5 1.5h2.5v9H2.5zM7 1.5h2.5v9H7z"/></svg>';
    paused ? clearTimeout(timer) : schedule(run);
  });

  /* Rest state first, so a still frame reads; start moving only once the figure is on screen. */
  stage(0, true); textEl.textContent = STEPS[0].text;
  let started = false;
  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    if (!visible) return clearTimeout(timer);
    if (!started) { started = true; show(0, true); } else schedule(run);
  }, { threshold: 0.45 }).observe(fig);
})();
