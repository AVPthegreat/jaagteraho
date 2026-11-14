"use client";

import { useEffect } from "react";

/*
  The floating nav hides while you scroll down and comes back as soon as you scroll up (or reach the
  top). It never hides while it holds focus or its phone menu is open (handled in CSS).
*/
export function Headroom() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".site-header");
    if (!header) return;
    let last = window.scrollY;
    let ticking = false;
    const update = () => {
      ticking = false;
      const y = window.scrollY;
      if (y < 80) header.dataset.hidden = "false";
      else if (y > last + 6) header.dataset.hidden = "true";
      else if (y < last - 6) header.dataset.hidden = "false";
      if (Math.abs(y - last) > 6 || y < 80) last = y;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return null;
}
