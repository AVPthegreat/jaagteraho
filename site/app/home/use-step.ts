"use client";

import { useEffect } from "react";

/*
  Lets the home page's scroll motion (home-motion.tsx) drive a component's active step: GSAP
  dispatches a "jr:step" event with the index on the element marked data-pin-steps.
*/
export function useScrollStep(ref: React.RefObject<HTMLElement | null>, set: (i: number) => void) {
  useEffect(() => {
    const el = ref.current?.closest<HTMLElement>("[data-pin-steps]");
    if (!el) return;
    const on = (e: Event) => set((e as CustomEvent<number>).detail);
    el.addEventListener("jr:step", on);
    return () => el.removeEventListener("jr:step", on);
  }, [ref, set]);
}
