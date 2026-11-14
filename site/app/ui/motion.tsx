"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/*
  The page's motion layer, kept in one place: parts marked data-rv rise in once as they enter the view
  (staggered by --d), and the benchmark bars grow when the chart comes into view.
  Content is visible without script: the hiding styles only apply under html.js, and never with reduced motion.
*/
export function Motion() {
  const path = usePathname();

  useEffect(() => {
    const SELECTOR = "[data-rv]:not(.in), .bars:not(.in), [data-flow]:not(.in)";
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
      { rootMargin: "0px 0px -6% 0px", threshold: 0.01 },
    );
    // Sections out of view (with a margin) pause their looping animations: see [data-idle] in globals.css.
    const idle = new IntersectionObserver(
      (entries) => {
        for (const e of entries) e.target.toggleAttribute("data-idle", !e.isIntersecting);
      },
      { rootMargin: "200px 0px" },
    );
    const seen = new WeakSet<Element>();
    const scan = () => {
      document.querySelectorAll(SELECTOR).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
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
