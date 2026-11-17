/* Circling cards: one row per kind of work that loops slowly, can be dragged or swiped with momentum, steps with the
   arrow keys and the previous and next buttons, and always comes to rest on a card, never between two.
   It stops while the pointer or focus is on it, while it is off screen, and in a hidden tab.
   A row that fits on screen does not move. Under reduced motion nothing moves: the row wraps into a plain grid. */
(function () {
  "use strict";
  const reduced = !!(window.motion || {}).reduced, sound = (window.motion || {}).sound || { play() {} };
  document.querySelectorAll("[data-carousel]").forEach(root => {
    const track = root.querySelector(".car-track"), originals = Array.from(track.children);
    if (reduced || !originals.length) { root.classList.add("static", "still"); return; }

    let set = 0, step = 0, x = 0, v = 0, target = null, drag = null, held = false, visible = false, raf = 0, last = 0, moved = 0, looping = false;
    const DRIFT = 22;                                                   // px a second, while nobody is looking closely

    function measure() {
      root.classList.remove("static");
      const cards = Array.from(track.children).filter(c => !c.dataset.clone);
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      step = cards[0].getBoundingClientRect().width + gap;
      set = step * cards.length;
      const cs = getComputedStyle(root), fits = set - gap <= root.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1;
      if (fits) { root.classList.add("static"); looping = false; track.style.transform = ""; clones(false); return; }
      looping = true; clones(true);
      x = ((x % set) + set) % set; paint();
    }
    function clones(on) {
      track.querySelectorAll("[data-clone]").forEach(n => n.remove());
      if (!on) return;
      for (const pass of [0, 1]) originals.forEach(c => {           // two more copies, so the row never runs out
        const k = c.cloneNode(true); k.dataset.clone = "1"; k.removeAttribute("id"); k.setAttribute("aria-hidden", "true");
        k.querySelectorAll("a, button").forEach(a => a.setAttribute("tabindex", "-1"));
        k.querySelectorAll("[style*=view-transition-name]").forEach(n => n.style.viewTransitionName = "none");
        track.appendChild(k);
      });
    }
    const wrap = () => { if (x >= set) { x -= set; if (target !== null) target -= set; } if (x < 0) { x += set; if (target !== null) target += set; } };
    const paint = () => { track.style.transform = `translate3d(${-x}px,0,0)`; };
    const settle = dir => { const base = Math.round(x / step) * step; target = dir ? Math.round((x + dir * step * 0.51) / step) * step : base; };

    function tick(now) {
      raf = 0; if (!looping || !visible || document.hidden) return;
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
      if (drag) { /* the pointer moves it */ }
      else if (target !== null) {                                     // ease onto a card: a critically damped spring
        const d = target - x; v = 0;
        x += d * (1 - Math.exp(-dt * 9));
        if (Math.abs(d) < 0.4) { x = target; target = null; v = 0; }
      } else if (Math.abs(v) > 8) {                                   // momentum after a fling, slowing, then settling on a card
        x += v * dt; v *= Math.exp(-dt * 3.2);
        if (Math.abs(v) < 220) settle(Math.sign(v) * 0);
      } else if (!held) x += DRIFT * dt;
      else if (target === null && x % step > 0.5 && step - x % step > 0.5) settle(0);
      wrap(); paint();
      if (!(held && target === null && !drag && Math.abs(v) <= 8)) raf = requestAnimationFrame(tick);
    }
    const go = () => { if (!raf && looping && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(tick); } };

    // hold still while someone is reading it
    root.addEventListener("pointerenter", e => { if (e.pointerType === "mouse") { held = true; if (target === null) settle(0); go(); } });
    root.addEventListener("pointerleave", e => { if (e.pointerType === "mouse" && !root.contains(document.activeElement)) { held = false; go(); } });
    root.addEventListener("focusin", e => {
      held = true; const li = e.target.closest(".card");
      if (li && looping) { const i = Array.from(track.children).indexOf(li); const want = i * step; target = want; if (target >= set) { x -= set; target -= set; } }
      go();
    });
    root.addEventListener("focusout", () => setTimeout(() => { if (!root.contains(document.activeElement)) { held = false; go(); } }, 0));

    // drag or swipe, with momentum
    track.addEventListener("dragstart", e => e.preventDefault());   // a link dragged as a link would cancel the swipe
    const view = root;
    view.addEventListener("pointerdown", e => {
      if (!looping || e.button > 0 || e.target.closest(".car-ctl")) return;
      drag = { x0: e.clientX, y0: e.clientY, xs: x, t: performance.now(), lx: e.clientX, id: e.pointerId, axis: null }; moved = 0; target = null; v = 0; held = true; go();
    });
    view.addEventListener("pointermove", e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (!drag.axis && Math.hypot(dx, dy) > 6) { drag.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y"; if (drag.axis === "x") { view.setPointerCapture(e.pointerId); root.classList.add("dragging"); } }
      if (drag.axis !== "x") return;
      const now = performance.now(), ddt = Math.max(1, now - drag.t);
      v = Math.max(-2400, Math.min(2400, -(e.clientX - drag.lx) / ddt * 1000)); drag.t = now; drag.lx = e.clientX;
      x = drag.xs - dx; moved = Math.abs(dx); wrap(); paint();
    });
    const up = e => {
      if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.id)) return;
      const wasX = drag.axis === "x"; drag = null; root.classList.remove("dragging");
      if (wasX) { if (Math.abs(v) < 120) settle(0); sound.play("tick"); }
      if (e.pointerType !== "mouse") held = false;
      go();
    };
    view.addEventListener("pointerup", up); view.addEventListener("pointercancel", up);
    view.addEventListener("click", e => { if (moved > 6) { e.preventDefault(); e.stopPropagation(); moved = 0; } }, true);   // a drag is not a click
    view.addEventListener("wheel", e => { if (!looping || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; e.preventDefault(); target = null; x += e.deltaX; v = e.deltaX * 30; wrap(); paint(); held = true; go(); }, { passive: false });

    // previous and next, and the arrow keys
    const nudge = dir => { if (!looping) return; target = null; v = 0; settle(dir); held = true; go(); sound.play("step"); };
    root.querySelectorAll("[data-car]").forEach(b => b.addEventListener("click", () => nudge(+b.dataset.car)));
    root.addEventListener("keydown", e => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const cards = Array.from(track.querySelectorAll(".card:not([data-clone]) .card-a")), i = cards.indexOf(document.activeElement);
      if (i < 0) return; e.preventDefault();
      cards[(i + (e.key === "ArrowRight" ? 1 : -1) + cards.length) % cards.length].focus();
    });

    new IntersectionObserver(es => { visible = es[0].isIntersecting; go(); }).observe(root);
    document.addEventListener("visibilitychange", go);
    new ResizeObserver(() => { measure(); go(); }).observe(root);
    // arriving from a project page: rest on its card
    const id = location.hash.slice(1), at = id ? originals.findIndex(c => c.id === id) : -1;
    measure();
    if (at > -1 && looping) { x = at * step; paint(); held = true; }
  });
})();
