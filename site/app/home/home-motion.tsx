"use client";

import { useEffect } from "react";

/*
  The home page's GSAP layer. Loaded after the page is interactive (dynamic import), so it never
  delays the first paint. Everything is inside gsap.matchMedia: with reduced motion nothing moves,
  and the pinned story only runs on wide screens. Without script the page is complete and static.
*/
export function HomeMotion() {
  useEffect(() => {
    let dead = false;
    let cleanup = () => {};
    (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
      if (dead) return;
      gsap.registerPlugin(ScrollTrigger);
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // The hero's entrance is pure CSS (home.css, "Hero entrance"): it must not wait for this script,
        // or the headline stays invisible for seconds on a slow phone.

        // Shield: the rings draw themselves as the section arrives.
        const rings = gsap.utils.toArray<SVGPathElement>("[data-shield] .sh-ring");
        if (rings.length) {
          gsap.fromTo(
            rings,
            { strokeDashoffset: 1 },
            {
              strokeDashoffset: 0,
              duration: 1.6,
              ease: "power2.inOut",
              stagger: 0.14,
              // pathLength is 1, so the offset must not be rounded to whole numbers (the rings jumped to drawn).
              autoRound: false,
              // Created before the story pin below: refresh after it, or the trigger ignores the pin spacing.
              scrollTrigger: { trigger: "[data-shield]", start: "top 75%", once: true, refreshPriority: -1 },
            },
          );
        }

        // Proof: the numbers count up once.
        const counts = gsap.utils.toArray<HTMLElement>("[data-count]");
        counts.forEach((el) => {
          const end = Number(el.dataset.count);
          const dec = ((el.dataset.count ?? "").split(".")[1] ?? "").length;
          const o = { v: 0 };
          // Fraunces has no tabular figures: reserve the width of the widest digits ("0") at the final length,
          // right-aligned, so "/70", "%" and "a bug" stay put while the number counts.
          const shown = el.textContent ?? "";
          el.textContent = shown.replace(/[0-9]/g, "0");
          const w = el.getBoundingClientRect().width;
          el.textContent = shown;
          Object.assign(el.style, { display: "inline-block", minWidth: `${Math.ceil(w)}px`, textAlign: "right" });
          // Below the fold, start from 0, or the card fades in showing the final number and then resets.
          if (el.getBoundingClientRect().top > window.innerHeight) el.textContent = (0).toFixed(dec);
          gsap.to(o, {
            v: end,
            duration: 1.4,
            ease: "power2.out",
            // The same line the card's reveal uses (motion.tsx: 6% above the bottom).
            scrollTrigger: { trigger: el, start: "top 94%", once: true, refreshPriority: -1 },
            onUpdate: () => {
              el.textContent = o.v.toFixed(dec);
            },
          });
        });
        return () => {
          counts.forEach((el) => {
            el.textContent = el.dataset.count ?? el.textContent;
            el.style.removeProperty("display");
            el.style.removeProperty("min-width");
            el.style.removeProperty("text-align");
          });
        };
      });

      // The night story: pinned and scrubbed on wide screens only.
      mm.add("(min-width: 960px) and (min-height: 640px) and (prefers-reduced-motion: no-preference)", () => {
        const pin = document.querySelector<HTMLElement>("[data-story]");
        if (!pin) return;
        const steps = Array.from(pin.querySelectorAll<HTMLElement>("[data-step]"));
        const clock = pin.querySelector<HTMLElement>("[data-clock]");
        const bar = pin.querySelector<HTMLElement>("[data-bar]");
        pin.dataset.pinned = "";
        let cur = -1;
        const show = (i: number) => {
          if (i === cur) return;
          cur = i;
          steps.forEach((s, k) => s.classList.toggle("on", k === i));
          if (clock) clock.textContent = steps[i].dataset.time ?? "";
        };
        show(0);
        // Pin the story's own inner block, never the <section>: GSAP wraps what it pins in a spacer div,
        // and if that wrapped a top-level section React could not remove it when you navigate to another
        // page ("removeChild ... not a child"), which crashed client navigation from the home page.
        const st = ScrollTrigger.create({
          trigger: pin,
          pin: true,
          start: "top top",
          end: () => `+=${window.innerHeight * 1.6}`,
          scrub: true,
          onUpdate: (self) => {
            show(Math.min(steps.length - 1, Math.floor(self.progress * steps.length * 0.999)));
            if (bar) bar.style.transform = `scaleY(${self.progress})`;
          },
        });
        return () => {
          st.kill();
          delete pin.dataset.pinned;
          steps.forEach((s, k) => s.classList.toggle("on", k === 0));
          if (bar) bar.style.transform = "";
        };
      });

      // "What it watches" and "How safe is it": no pinning (it felt like the page stuck). As the section
      // scrolls through the view, the active card / layer follows the scroll position.
      mm.add("(min-width: 960px) and (min-height: 640px) and (prefers-reduced-motion: no-preference)", () => {
        const made = gsap.utils.toArray<HTMLElement>("[data-pin-steps]").map((sec) => {
          const n = Number(sec.dataset.pinSteps) || 1;
          let cur = -1;
          return ScrollTrigger.create({
            trigger: sec,
            start: "top 60%",
            end: "bottom 60%",
            onUpdate: (self) => {
              const i = Math.min(n - 1, Math.floor(self.progress * n * 0.999));
              if (i === cur) return;
              cur = i;
              sec.dispatchEvent(new CustomEvent("jr:step", { detail: i }));
            },
          });
        });
        return () => made.forEach((st) => st.kill());
      });

      cleanup = () => mm.revert();

      // A link from another page (/#safety) was resolved before the story pin added its scroll length, so it
      // landed about a screen and a half short. Measure again and go there.
      const id = location.hash ? decodeURIComponent(location.hash.slice(1)) : "";
      const target = id ? document.getElementById(id) : null;
      if (target) {
        ScrollTrigger.refresh();
        requestAnimationFrame(() => window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY, behavior: "instant" }));
      }
    })();
    return () => {
      dead = true;
      cleanup();
    };
  }, []);

  return null;
}
