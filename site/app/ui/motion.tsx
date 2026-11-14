"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/*
  The page's motion layer, kept in one place:
  - parts marked data-rv rise in once as their section enters (staggered by --d),
  - the benchmark bars grow when the chart comes into view,
  - the night photograph drifts slowly with the scroll.
  Content is visible without script: the hiding styles only apply under html.js.
*/
export function Motion() {
  const path = usePathname();

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const SELECTOR = "[data-rv]:not(.in), .bars:not(.in)";
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
    // The page streams in after the layout mounts, so keep watching for parts that arrive later.
    const seen = new WeakSet<Element>();
    let photos: HTMLElement[] = [];
    const scan = () => {
      document.querySelectorAll(SELECTOR).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        io.observe(el);
      });
      photos = Array.from(document.querySelectorAll<HTMLElement>("[data-drift]"));
      onScroll();
    };
    const mo = new MutationObserver(() => scan());
    mo.observe(document.body, { childList: true, subtree: true });

    let frame = 0;
    const drift = () => {
      frame = 0;
      if (reduce) return;
      for (const img of photos) {
        const box = img.parentElement!.getBoundingClientRect();
        const progress = Math.min(1, Math.max(0, 1 - (box.top + box.height) / (window.innerHeight + box.height)));
        img.style.transform = `scale(${1.12 - progress * 0.1}) translateY(${(progress - 0.5) * -4}%)`;
      }
    };
    function onScroll() {
      if (!frame && photos.length) frame = requestAnimationFrame(drift);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    scan();
    return () => {
      io.disconnect();
      mo.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [path]);

  return null;
}
