"use client";

import { useEffect } from "react";

/*
  Gentle smooth scrolling (Lenis) for wheel and trackpad. Touch keeps the phone's native scrolling,
  and with reduced motion nothing changes. Lenis drives the real window scroll, so scroll events,
  ScrollTrigger and the auto-hiding nav keep working; in-page anchor links glide too.
*/
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let dead = false;
    let stop = () => {};
    void import("lenis").then(({ default: Lenis }) => {
      if (dead) return;
      const lenis = new Lenis({ duration: 1.05, smoothWheel: true, anchors: { offset: -16 } });
      let raf = 0;
      const loop = (t: number) => {
        lenis.raf(t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      stop = () => {
        cancelAnimationFrame(raf);
        lenis.destroy();
      };
    });
    return () => {
      dead = true;
      stop();
    };
  }, []);
  return null;
}
