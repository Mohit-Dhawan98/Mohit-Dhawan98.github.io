/* A small pixel head of Mohit in the corner, drawn in the same cells and greys as the canvas.
   It blinks now and then, looks toward the pointer, raises a brow, smiles, and says one short line about what the
   visitor has reached: a section, a project card, a project page, a theme change, a run on the hero, the end of a page.
   The lines are his, in content/voice-lines.md, built into data/voice.json. Each line shows once per visit, beside the
   head and never over the page's text, and is announced politely to screen readers. Under reduced motion the head is
   still and a line appears as plain text. Dismissed once, it stays dismissed. */
(function () {
  "use strict";
  const root = window.SITE_ROOT || "", mo = window.motion || {}, reduced = !!mo.reduced;
  let off = false; try { off = localStorage.getItem("head") === "off"; } catch (e) {}

  const box = document.createElement("aside");
  box.className = "me"; box.setAttribute("aria-label", "Mohit, in pixels");
  box.innerHTML = '<p class="bubble" role="status" aria-live="polite"></p><div class="me-plate"><canvas class="me-cv" width="30" height="33" aria-hidden="true"></canvas>'
    + '<button type="button" class="me-x" aria-label="Hide the pixel head"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg></button></div>'
    + '<button type="button" class="me-back" aria-label="Show the pixel head again">m<i>.</i></button>';
  document.body.appendChild(box);
  const cv = box.querySelector(".me-cv"), ctx = cv.getContext("2d"), bubble = box.querySelector(".bubble");
  box.classList.toggle("off", off);

  let data = null, lines = {}, state = { eyes: "", brow: false, mouth: "closed" }, said = new Set();
  try { said = new Set(JSON.parse(sessionStorage.getItem("said") || "[]")); } catch (e) {}

  function draw() {
    if (!data) return;
    const g = data.base.map(r => r.slice());
    const apply = k => (data.states[k] || []).forEach(([x, y, c]) => { g[y][x] = c; });
    if (state.mouth === "closed") apply("closed"); else if (state.mouth === "talk") apply("talk");
    if (state.brow) apply("brow");
    if (state.eyes) apply(state.eyes);
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (let y = 0; y < data.h; y++) for (let x = 0; x < data.w; x++) { const c = g[y][x]; if (c >= 0) { ctx.fillStyle = data.palette[c]; ctx.fillRect(x, y, 1, 1); } }
  }

  /* ---- Speaking ---- */
  let hideT = 0, talkT = 0;
  function say(key) {
    if (off || !lines[key] || said.has(key)) return;
    said.add(key); try { sessionStorage.setItem("said", JSON.stringify([...said])); } catch (e) {}
    bubble.textContent = lines[key];
    if (coversText()) { bubble.textContent = ""; said.delete(key); return; }   // never over what the visitor is reading: try again later
    box.classList.add("talking"); bubble.classList.add("on");
    clearTimeout(hideT); clearInterval(talkT);
    const ms = Math.min(9000, 2600 + lines[key].length * 45);
    if (!reduced) { let k = 0; talkT = setInterval(() => { state.mouth = (k++ & 1) ? "talk" : "closed"; draw(); }, 170); setTimeout(() => { clearInterval(talkT); state.mouth = "smile"; draw(); }, Math.min(ms - 600, lines[key].length * 55)); }
    hideT = setTimeout(() => { bubble.classList.remove("on"); box.classList.remove("talking"); state.mouth = "closed"; draw(); }, ms);
  }
  window.say = say;
  // Is there text under where the bubble would sit? Sample a grid of points beneath it.
  function coversText() {
    bubble.style.visibility = "hidden"; bubble.style.display = "block"; const r = bubble.getBoundingClientRect(); bubble.style.visibility = ""; bubble.style.display = "";
    box.style.pointerEvents = "none"; const kids = box.querySelectorAll("*"); kids.forEach(k => k.style.pointerEvents = "none");
    let hit = false;
    for (let i = 0; i <= 3 && !hit; i++) for (let j = 0; j <= 2 && !hit; j++) {
      const el = document.elementFromPoint(r.left + r.width * i / 3, r.top + r.height * j / 2);
      if (el && !box.contains(el) && el.closest("p, h1, h2, h3, li, a, button, figcaption, dd, dt, label, .card-a, .view, .itip")) hit = true;
    }
    kids.forEach(k => k.style.pointerEvents = ""); box.style.pointerEvents = "";
    return hit;
  }

  /* ---- Small life: blinking, looking toward the pointer ---- */
  if (!reduced) {
    const blink = () => { if (!off) { state.eyes = "blink"; draw(); setTimeout(() => { state.eyes = ""; draw(); }, 140); } setTimeout(blink, 2800 + Math.random() * 3600); };
    setTimeout(blink, 2000);
    let lookT = 0;
    addEventListener("pointermove", e => {
      if (off || state.eyes === "blink") return;
      const r = cv.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), want = Math.abs(dx) < 90 ? "" : dx < 0 ? "look-left" : "look-right";
      if (want !== state.eyes) { state.eyes = want; draw(); }
      clearTimeout(lookT); lookT = setTimeout(() => { if (state.eyes !== "blink") { state.eyes = ""; draw(); } }, 2500);
    }, { passive: true });
  }
  const brow = () => { if (reduced) return; state.brow = true; draw(); setTimeout(() => { state.brow = false; draw(); }, 900); };

  /* ---- Dismiss and bring back ---- */
  box.querySelector(".me-x").addEventListener("click", () => { off = true; box.classList.add("off"); bubble.classList.remove("on"); try { localStorage.setItem("head", "off"); } catch (e) {} });
  box.querySelector(".me-back").addEventListener("click", () => { off = false; box.classList.remove("off"); try { localStorage.removeItem("head"); } catch (e) {} brow(); });
  box.querySelector(".me-plate").addEventListener("pointerenter", () => { if (!state.brow) { state.mouth = "smile"; draw(); } });
  box.querySelector(".me-plate").addEventListener("pointerleave", () => { if (!box.classList.contains("talking")) { state.mouth = "closed"; draw(); } });

  /* ---- What makes him speak ---- */
  function wire() {
    const page = document.querySelector("[data-voice-page]");
    let visited = false; try { visited = !!localStorage.getItem("visited"); localStorage.setItem("visited", "1"); } catch (e) {}
    if (document.querySelector("[data-descent]")) setTimeout(() => say(visited ? "return-visit" : "first-visit"), 1600);
    if (page) setTimeout(() => say("page:" + page.dataset.voicePage), 1400);
    const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { say(en.target.dataset.voice); io.unobserve(en.target); } }), { threshold: 0.6 });
    document.querySelectorAll("[data-voice]").forEach(n => { if (!n.dataset.voice.startsWith("project:")) io.observe(n); });
    document.addEventListener("pointerover", e => { const c = e.target.closest && e.target.closest('[data-voice^="project:"]'); if (c && !c.closest("[aria-hidden=true]")) say(c.dataset.voice); }, { passive: true });
    document.addEventListener("focusin", e => { const c = e.target.closest && e.target.closest('[data-voice^="project:"]'); if (c) say(c.dataset.voice); });
    document.addEventListener("themechange", () => { brow(); setTimeout(() => say("theme:" + (document.documentElement.dataset.theme || "light")), 500); });
    document.addEventListener("click", e => { if (e.target.closest("[data-sound-toggle]")) setTimeout(() => say("sound:" + (document.documentElement.classList.contains("sound-off") ? "off" : "on")), 50); });
    document.addEventListener("voice", e => say(e.detail));
    let idleT = 0; const idle = () => { clearTimeout(idleT); idleT = setTimeout(() => say("idle"), 45000); };
    ["pointermove", "keydown", "scroll"].forEach(t => addEventListener(t, idle, { passive: true })); idle();
    addEventListener("scroll", () => { if (innerHeight + scrollY >= document.documentElement.scrollHeight - 40) say("page-end"); }, { passive: true });
  }

  Promise.all([fetch(root + "data/head.json").then(r => r.json()), fetch(root + "data/voice.json").then(r => r.ok ? r.json() : {}).catch(() => ({}))])
    .then(([d, v]) => { data = d; lines = v; cv.width = d.w; cv.height = d.h; draw(); box.classList.add("ready"); wire(); })
    .catch(() => box.remove());
})();
