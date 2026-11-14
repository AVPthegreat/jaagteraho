"use client";

import { useEffect, useRef } from "react";

/*
  The hero's one visual: a radar over the parts of an app it watches. An illustration, not live data:
  about once a second a different part turns red ("caught"), and when the sweep passes over it, it
  flashes green ("fixed") and settles back to normal. Driven by the GSAP ticker; it pauses when the
  radar is off-screen or the tab is hidden. With reduced motion (or before script) it is a still picture.
*/
const C = 280;
const SWEEP_S = 2.6; // one full turn of the sweep
const EVERY_S = 1.05; // a new part fails about once a second
const BLIPS: Array<{ id: string; label: string; a: number; r: number }> = [
  { id: "exam", label: "exam portal", a: 322, r: 168 },
  { id: "jobs", label: "jobs", a: 280, r: 220 },
  { id: "pay", label: "payments", a: 52, r: 120 },
  { id: "login", label: "login", a: 148, r: 196 },
  { id: "api", label: "api", a: 228, r: 92 },
  { id: "search", label: "search", a: 100, r: 236 },
  { id: "mail", label: "mail", a: 190, r: 140 },
];

function at(a: number, r: number) {
  const rad = (a * Math.PI) / 180;
  return { x: C + r * Math.cos(rad), y: C + r * Math.sin(rad) };
}

export function Radar() {
  const root = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let dead = false;
    let stop = () => {};
    (async () => {
      const { gsap } = await import("gsap");
      if (dead) return;
      const sweep = el.querySelector<SVGGElement>(".rd-sweep");
      const pill = el.querySelector<HTMLElement>("[data-pill]");
      const pillDot = el.querySelector<HTMLElement>("[data-pill-dot]");
      const blips = BLIPS.map((b) => ({
        ...b,
        g: el.querySelector<SVGGElement>(`[data-blip="${b.id}"]`)!,
        state: el.querySelector<SVGTextElement>(`[data-blip="${b.id}"] .rd-state`)!,
        ripple: el.querySelector<SVGCircleElement>(`[data-blip="${b.id}"] .rd-ripple`)!,
        failing: false,
        caughtAt: 0,
      }));

      const say = (text: string, kind: "wake" | "ok") => {
        if (!pill || !pillDot) return;
        pill.textContent = text;
        pillDot.className = kind;
      };

      let t = 0; // our own clock, so pausing freezes the scene
      let prev = 340;
      let nextFail = 0.4;
      let order = 0;
      const pickOrder = [0, 2, 1, 4, 3, 6, 5];

      const tick = (_time: number, dtMs: number) => {
        t += Math.min(dtMs, 100) / 1000;
        const ang = (340 + (t / SWEEP_S) * 360) % 360;
        sweep?.setAttribute("transform", `rotate(${ang.toFixed(2)} ${C} ${C})`);

        // A new part fails about once a second, never one that is already failing.
        if (t >= nextFail) {
          nextFail = t + EVERY_S;
          for (let k = 0; k < pickOrder.length; k++) {
            const b = blips[pickOrder[(order + k) % pickOrder.length]];
            if (b.failing) continue;
            order = (order + k + 1) % pickOrder.length;
            b.failing = true;
            b.caughtAt = t;
            b.g.dataset.state = "fail";
            b.state.textContent = "failing";
            gsap.fromTo(b.ripple, { attr: { r: 6 }, opacity: 0.9 }, { attr: { r: 30 }, opacity: 0, duration: 0.9, ease: "power2.out" });
            say(`${b.label} failing · caught`, "wake");
            break;
          }
        }

        // When the sweep passes a failing part (at least 0.3 s after it failed), it is fixed.
        const crossed = (a: number) => (prev <= ang ? a > prev && a <= ang : a > prev || a <= ang);
        for (const b of blips) {
          if (!b.failing || t - b.caughtAt < 0.3 || !crossed(b.a)) continue;
          b.failing = false;
          b.g.dataset.state = "fixed";
          b.state.textContent = "fixed";
          say(`${b.label} fixed`, "ok");
          gsap.delayedCall(0.7, () => {
            if (b.failing) return;
            delete b.g.dataset.state;
            b.state.textContent = "";
          });
        }
        prev = ang;
      };

      let running = false;
      const run = (on: boolean) => {
        if (on === running) return;
        running = on;
        if (on) gsap.ticker.add(tick);
        else gsap.ticker.remove(tick);
      };
      let visible = false;
      const io = new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        run(visible && !document.hidden);
      });
      io.observe(el);
      const onVis = () => run(visible && !document.hidden);
      document.addEventListener("visibilitychange", onVis);
      stop = () => {
        run(false);
        io.disconnect();
        document.removeEventListener("visibilitychange", onVis);
      };
    })();
    return () => {
      dead = true;
      stop();
    };
  }, []);

  return (
    <figure className="radar" ref={root} aria-labelledby="radar-cap">
      <svg viewBox="0 0 560 560" role="img" aria-labelledby="radar-cap" focusable="false">
        <defs>
          <radialGradient id="rd-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#14223f" stopOpacity=".9" />
            <stop offset=".7" stopColor="#0b1324" stopOpacity=".6" />
            <stop offset="1" stopColor="#06080d" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="rd-sweep" gradientUnits="userSpaceOnUse" x1={at(-40, 270).x} y1={at(-40, 270).y} x2={C + 270} y2={C}>
            <stop offset="0" stopColor="#7aa7ff" stopOpacity="0" />
            <stop offset="1" stopColor="#7aa7ff" stopOpacity=".42" />
          </linearGradient>
          <radialGradient id="rd-core">
            <stop offset="0" stopColor="#ffd27a" stopOpacity=".95" />
            <stop offset=".35" stopColor="#f5b544" stopOpacity=".35" />
            <stop offset="1" stopColor="#f5b544" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={C} cy={C} r="276" fill="url(#rd-bg)" />
        <g fill="none" stroke="rgba(160,190,255,.16)">
          {[70, 140, 210, 270].map((r) => (
            <circle key={r} cx={C} cy={C} r={r} />
          ))}
          <path d={`M${C} 10V550M10 ${C}H550`} strokeDasharray="2 6" />
        </g>
        <g className="rd-sweep" transform={`rotate(340 ${C} ${C})`}>
          <path d={`M${C} ${C} L${C + 270} ${C} A270 270 0 0 0 ${at(-40, 270).x} ${at(-40, 270).y} Z`} fill="url(#rd-sweep)" />
          <line x1={C} y1={C} x2={C + 270} y2={C} stroke="#a9c6ff" strokeOpacity=".7" strokeWidth="1.2" />
        </g>
        {BLIPS.map((b) => {
          const p = at(b.a, b.r);
          return (
            <g key={b.id} className="rd-blip" data-blip={b.id} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}>
              <circle className="rd-ripple" r="6" fill="none" opacity="0" />
              <circle className="rd-dot" r="5" />
              <text className="rd-name" x="12" y="4">
                {b.label}
              </text>
              <text className="rd-state" x="12" y="19" />
            </g>
          );
        })}
        <circle cx={C} cy={C} r="46" fill="url(#rd-core)" className="rd-core" />
        <g transform={`translate(${C - 12} ${C - 14})`}>
          <path d="M8 2h8M12 0v2" stroke="#c9d3ea" strokeOpacity=".6" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M6 5h12l-1.2 15H7.2L6 5Z" stroke="#f5b544" strokeWidth="1.6" strokeLinejoin="round" fill="rgba(245,181,68,.18)" />
          <ellipse cx="12" cy="12.5" rx="2" ry="3" fill="#ffd27a" />
        </g>
      </svg>
      <figcaption id="radar-cap" className="radar-cap">
        <span className="sr-only">
          An illustration: JaagteRaho watching seven parts of an app. One part after another turns red, and each turns green again as the watch passes over
          it.
        </span>
        <span className="rc" aria-hidden="true">
          <i data-pill-dot className="ok" /> <span data-pill>All quiet · 7 parts watched</span>
        </span>
        <span className="rc-note" aria-hidden="true">
          Illustration
        </span>
      </figcaption>
    </figure>
  );
}
