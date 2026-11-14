"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/*
  The page's motion layer, kept in one place:
  - discrete objects marked data-rv (cards, panels, list items) rise in once as they enter, staggered by --d;
    headings and running text never wait for an animation,
  - the benchmark bars grow only once most of the chart is on screen, so the growth is actually seen,
  - below 980px the hero stage holds its 02:14 moment until it is in view (see .stage:not(.in) in globals.css).
  Content is visible without script: the hiding styles only apply under html.js.
*/
const LOOSE = "[data-rv]:not(.in)";
// "Late" targets start once this share of them is on screen. They are checked by position, not by
// IntersectionObserver: the waiting stage is clipped to nothing, and an observer counts the clip.
const LATE: [string, number][] = [
  [".bars:not(.in)", 0.6],
  [".stage:not(.in)", 0.4],
];

export function Motion() {
  const path = usePathname();

  useEffect(() => {
    if (!("IntersectionObserver" in window)) {
      document.documentElement.classList.remove("js");
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    });

    let frame = 0;
    const checkLate = () => {
      frame = 0;
      for (const [sel, share] of LATE)
        document.querySelectorAll(sel).forEach((el) => {
          const r = el.getBoundingClientRect();
          if (!r.height) return;
          const onScreen = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
          if (onScreen / Math.min(r.height, innerHeight) >= share) el.classList.add("in");
        });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(checkLate);
    };

    // The page streams in after the layout mounts, so keep watching for parts that arrive later.
    const seen = new WeakSet<Element>();
    const scan = () => {
      document.querySelectorAll(LOOSE).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        io.observe(el);
      });
      onScroll();
    };
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);

    scan();
    return () => {
      io.disconnect();
      mo.disconnect();
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [path]);

  return null;
}
