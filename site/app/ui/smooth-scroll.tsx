"use client";

import type Lenis from "lenis";
import { useEffect } from "react";

/* The page's soft scroller while it runs (wheel and trackpad, motion allowed); null otherwise. */
let current: Lenis | null = null;
export const softScroll = () => current;

/*
  Soft scrolling for wheel and trackpad (Lenis): the page eases to where you scrolled instead of stepping,
  so everything on the page that moves with the scroll glides with it. Lenis drives the real window scroll,
  so sticky parts, the scroll-linked CSS animations and the observers all keep working.
  - Phones keep their own native touch momentum (syncTouch off).
  - Anything that scrolls on its own (the phone menu, text areas, code and logs) scrolls natively.
  - With reduced motion nothing changes: native scrolling.
*/
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let dead = false;
    let stop = () => {};
    void import("lenis").then(({ default: Lenis }) => {
      if (dead) return;
      const lenis = new Lenis({
        // Soft but not floaty: each frame closes 9% of the remaining distance.
        lerp: 0.09,
        wheelMultiplier: 0.95,
        smoothWheel: true,
        syncTouch: false,
        allowNestedScroll: true,
        prevent: (node) => Boolean(node.closest?.("[data-lenis-prevent], .nav-menu, textarea")),
        // In-page links glide too, landing below the floating header.
        anchors: { offset: -80 },
        autoRaf: true,
      });
      current = lenis;
      stop = () => {
        lenis.destroy();
        if (current === lenis) current = null;
      };
    });
    return () => {
      dead = true;
      stop();
    };
  }, []);
  return null;
}
