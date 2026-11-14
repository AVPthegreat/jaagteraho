"use client";

import { usePathname } from "next/navigation";

/* Credits for the found photographs, shown on the page that uses them. */
export function PhotoCredits() {
  if (usePathname() !== "/") return null;
  return (
    <p>
      Photographs: &ldquo;Navi Mumbai Night&rdquo; by Navi guy, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via{" "}
      <a href="https://commons.wikimedia.org/w/index.php?curid=77736704">Wikimedia Commons</a> · &ldquo;West Bengal Joint Entrance Examination - Howrah
      2011-05-22 00315&rdquo; by Biswarup Ganguly, <a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a>, via{" "}
      <a href="https://commons.wikimedia.org/w/index.php?curid=15275138">Wikimedia Commons</a>.
    </p>
  );
}
