"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/* The four places on the home page and the playground; "Connect your app" is the button beside them. */
const LINKS: Array<[string, string]> = [
  ["/#night", "One night"],
  ["/#watches", "What it watches"],
  ["/#safety", "Safety"],
  ["/playground", "Live playground"],
];

/* The main navigation: a row on wide screens, a menu button on a phone. */
export function SiteNav() {
  const path = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  // The menu belongs to the page it was opened on, so navigating closes it.
  const isOpen = open === path;

  const nav = useRef<HTMLDivElement>(null);
  // On the home page, the link of the section in view gets the quiet active dot.
  const [inView, setInView] = useState<string | null>(null);
  useEffect(() => {
    if (path !== "/" || !("IntersectionObserver" in window)) return;
    const ids = LINKS.filter(([h]) => h.startsWith("/#")).map(([h]) => h.slice(2));
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setInView(e.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [path]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    // A tap anywhere outside the menu closes it, as a native sheet does.
    const onDown = (e: PointerEvent) => {
      if (!nav.current?.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [isOpen]);

  return (
    <div className="nav" data-open={isOpen} ref={nav}>
      <button type="button" className="nav-toggle" aria-expanded={isOpen} aria-controls="site-menu" onClick={() => setOpen(isOpen ? null : path)}>
        <span className="sr-only">Menu</span>
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
          <path d={isOpen ? "M5 5l12 12M17 5L5 17" : "M3 7h16M3 15h16"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      <div className="nav-menu" id="site-menu">
        <nav aria-label="Main" className="nav-links">
          {LINKS.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={href === path ? "page" : path === "/" && inView && href === `/#${inView}` ? "location" : undefined}
              onClick={(e) => {
                (e.currentTarget as HTMLElement).blur();
                setOpen(null);
              }}
            >
              {label}
            </Link>
          ))}
        </nav>
        <Link className="btn btn-sm" href="/connect" onClick={() => setOpen(null)}>
          Connect your app
        </Link>
      </div>
    </div>
  );
}
