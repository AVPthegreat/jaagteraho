"use client";

import { useEffect } from "react";

/*
  The home page's small motion layer, with no animation library and no scroll hijacking:
  - "One night": the moment crossing the middle of the screen becomes the active one (its scene shows on
    the sticky stage, the clock follows). Scrolling stays native; nothing is pinned or re-measured.
  - Proof: the numbers count up once when they come into view, holding their width so nothing beside them moves.
  The shield's rings draw in CSS (home.css, [data-draw]). With reduced motion nothing counts; the story still
  follows the scroll, because that is content, not decoration.
*/
export function HomeMotion() {
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const offs: Array<() => void> = [];

    // One night.
    const story = document.querySelector<HTMLElement>("[data-story]");
    if (story) {
      const steps = Array.from(story.querySelectorAll<HTMLElement>("[data-step]"));
      const scenes = Array.from(story.querySelectorAll<HTMLElement>("[data-scene]"));
      const clock = story.querySelector<HTMLElement>("[data-clock]");
      let cur = 0;
      const show = (i: number) => {
        if (i === cur || !steps[i]) return;
        cur = i;
        steps.forEach((s, k) => {
          s.classList.toggle("on", k === i);
          s.classList.toggle("past", k < i);
        });
        scenes.forEach((s, k) => s.classList.toggle("on", k === i));
        if (clock) {
          clock.textContent = steps[i].dataset.time ?? "";
          // The time settles in rather than swapping (a quarter second, on the compositor).
          if (!still) clock.animate([{ opacity: 0.35, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
        }
      };
      // The active moment is the last one whose words have come up to just below the middle of the screen,
      // where they also come into focus (home.css, step-focus). Read from positions on each scroll frame (not
      // from crossing events, which a fast flick can jump right over), and only while the story is near.
      const texts = steps.map((s) => s.querySelector<HTMLElement>(".st-text") ?? s);
      let raf = 0;
      const pick = () => {
        raf = 0;
        const line = window.innerHeight * 0.6;
        let i = 0;
        texts.forEach((t, k) => {
          const r = t.getBoundingClientRect();
          if (r.top + r.height / 2 <= line) i = k;
        });
        show(i);
      };
      const onScroll = () => {
        if (!raf) raf = requestAnimationFrame(pick);
      };
      const near = new IntersectionObserver(
        ([e]) => {
          if (e.isIntersecting) {
            window.addEventListener("scroll", onScroll, { passive: true });
            window.addEventListener("resize", onScroll);
            pick();
          } else {
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
            pick();
          }
        },
        { rootMargin: "50% 0px" },
      );
      near.observe(story);
      offs.push(() => {
        near.disconnect();
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
        if (raf) cancelAnimationFrame(raf);
      });
    }

    // Proof: count up once.
    const counts = still ? [] : Array.from(document.querySelectorAll<HTMLElement>("[data-count]"));
    if (counts.length) {
      const frames = new Set<number>();
      counts.forEach((el) => {
        // Fraunces has no tabular figures: reserve the width of the widest digits ("0") at the final length,
        // right-aligned, so "/70", "%" and "a bug" stay put while the number counts.
        const shown = el.textContent ?? "";
        el.textContent = shown.replace(/[0-9]/g, "0");
        const w = el.getBoundingClientRect().width;
        el.textContent = shown;
        Object.assign(el.style, { display: "inline-block", minWidth: `${Math.ceil(w)}px`, textAlign: "right" });
        // Below the fold, start from 0, so the card never shows the final number and then resets.
        const dec = ((el.dataset.count ?? "").split(".")[1] ?? "").length;
        if (el.getBoundingClientRect().top > window.innerHeight) el.textContent = (0).toFixed(dec);
      });
      const run = (el: HTMLElement) => {
        const end = Number(el.dataset.count);
        const dec = ((el.dataset.count ?? "").split(".")[1] ?? "").length;
        const t0 = performance.now();
        const step = (now: number) => {
          const p = Math.min(1, (now - t0) / 1100);
          el.textContent = (end * (1 - Math.pow(1 - p, 3))).toFixed(dec);
          if (p < 1) frames.add(requestAnimationFrame(step));
        };
        frames.add(requestAnimationFrame(step));
      };
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            io.unobserve(e.target);
            run(e.target as HTMLElement);
          }
        },
        { rootMargin: "0px 0px -10% 0px" },
      );
      counts.forEach((el) => io.observe(el));
      offs.push(() => {
        io.disconnect();
        frames.forEach((f) => cancelAnimationFrame(f));
        counts.forEach((el) => {
          el.textContent = el.dataset.count ?? el.textContent;
          el.style.removeProperty("display");
          el.style.removeProperty("min-width");
          el.style.removeProperty("text-align");
        });
      });
    }

    return () => offs.forEach((off) => off());
  }, []);

  return null;
}
