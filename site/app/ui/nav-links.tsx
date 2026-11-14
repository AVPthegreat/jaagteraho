"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: Array<[string, string]> = [
  ["/#demo", "Live demo"],
  ["/how", "How it works"],
  ["/evidence", "Evidence"],
  ["/paste", "Paste your error"],
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="nav-links" aria-label="Main">
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={href === path ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
