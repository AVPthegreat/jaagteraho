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
        // Hero: the words settle in, then the radar opens.
        const hero = document.querySelector<HTMLElement>("[data-hero]");
        if (hero) {
          gsap
            .timeline({ defaults: { ease: "power3.out" } })
            .to(hero.querySelectorAll("[data-h]"), { opacity: 1, y: 0, duration: 1, stagger: 0.12 })
            .to(hero.querySelector(".radar"), { opacity: 1, scale: 1, duration: 1.4, ease: "expo.out" }, 0.15);
        }

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
              scrollTrigger: { trigger: "[data-shield]", start: "top 75%", once: true },
            },
          );
        }

        // Proof: the numbers count up once.
        gsap.utils.toArray<HTMLElement>("[data-count]").forEach((el) => {
          const end = Number(el.dataset.count);
          const dec = (el.dataset.count ?? "").includes(".") ? 1 : 0;
          const o = { v: 0 };
          gsap.to(o, {
            v: end,
            duration: 1.4,
            ease: "power2.out",
            scrollTrigger: { trigger: el, start: "top 88%", once: true },
            onUpdate: () => {
              el.textContent = o.v.toFixed(dec);
            },
          });
        });
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
        const st = ScrollTrigger.create({
          trigger: pin,
          pin: true,
          start: "top top+=64",
          end: () => `+=${window.innerHeight * 2.4}`,
          scrub: 0.4,
          anticipatePin: 1,
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

      cleanup = () => mm.revert();
    })();
    return () => {
      dead = true;
      cleanup();
    };
  }, []);

  return null;
}
