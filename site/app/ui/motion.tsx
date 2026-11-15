"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/*
  The page's motion layer, kept in one place: parts marked data-rv rise in once as they enter the view
  (staggered by --d), the benchmark bars grow and the shield's rings draw when they come into view.
  Nothing is ever hidden while the script loads: only parts that start below the fold are marked to wait
  (.rv-wait), and with reduced motion nothing waits at all. Off-screen sections pause their looping animations.
*/
export function Motion() {
  const path = usePathname();

  useEffect(() => {
    const SELECTOR = "[data-rv]:not(.in), .bars:not(.in), [data-flow]:not(.in), [data-draw]:not(.in)";
    if (!("IntersectionObserver" in window)) {
      document.documentElement.classList.remove("js");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      // As soon as an element enters the screen, so the short entrance is done before you start reading it.
      { rootMargin: "0px", threshold: 0 },
    );
    // Sections out of view (with a margin) pause their looping animations: see [data-idle] in globals.css.
    const idle = new IntersectionObserver(
      (entries) => {
        for (const e of entries) e.target.toggleAttribute("data-idle", !e.isIntersecting);
      },
      { rootMargin: "200px 0px" },
    );
    // Where entrances are tied to the scroll in CSS (globals.css, "Scroll choreography"), the words and cards
    // need nothing from here; only the benchmark bars still grow on arrival.
    const scrollLinked =
      CSS.supports("animation-timeline: view()") && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seen = new WeakSet<Element>();
    const scan = () => {
      const fold = window.innerHeight;
      document.querySelectorAll(SELECTOR).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        // On screen (or already scrolled past) when the script arrives: shown as it is, never hidden.
        if (el.getBoundingClientRect().top < fold || (scrollLinked && !el.classList.contains("bars"))) {
          el.classList.add("in");
          return;
        }
        // Below the fold: waits, then plays its short entrance as it comes into view.
        el.classList.add("rv-wait");
        io.observe(el);
      });
      document.querySelectorAll("main section").forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        idle.observe(el);
      });
    };
    // The page streams in after the layout mounts, so keep watching for parts that arrive later.
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    scan();
    return () => {
      io.disconnect();
      idle.disconnect();
      mo.disconnect();
    };
  }, [path]);

  return null;
}
