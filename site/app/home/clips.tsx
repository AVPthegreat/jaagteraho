"use client";

import { useEffect, useRef, useState } from "react";
import type { Clip } from "../site";

/*
  "See it work": one player and a list of chapters. A chapter with a recorded clip plays it muted and
  looped, loaded only when the player scrolls into view (preload none, a poster first) and paused
  when it leaves. A chapter without a clip yet plays a small animated scene of the same moment.
  With reduced motion nothing plays on its own: the clip shows its poster and controls.
*/
function Player({ clip }: { clip: Clip }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [still, setStill] = useState(false);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setNarrow(window.matchMedia("(max-width: 640px)").matches);
  }, []);
  const tall = narrow && clip.phone;

  useEffect(() => {
    const v = ref.current;
    if (!v || still || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) v.play().catch(() => undefined);
        else v.pause();
      },
      { threshold: 0.35 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [still, clip.id]);

  return (
    <video
      key={`${clip.id}${tall ? "-tall" : ""}`}
      ref={ref}
      className={`clip-video${tall ? " tall" : ""}`}
      muted
      loop
      playsInline
      preload="none"
      controls={still}
      poster={`/clips/${clip.id}${tall ? "-9x16" : ""}.jpg`}
      width={tall ? 720 : 1280}
      height={tall ? 1280 : 720}
      aria-label={`${clip.title}: ${clip.caption}`}
    >
      {clip.phone && <source src={`/clips/${clip.id}-9x16.webm`} type="video/webm" media="(max-width: 640px)" />}
      {clip.phone && <source src={`/clips/${clip.id}-9x16.mp4`} type="video/mp4" media="(max-width: 640px)" />}
      <source src={`/clips/${clip.id}.webm`} type="video/webm" />
      <source src={`/clips/${clip.id}.mp4`} type="video/mp4" />
    </video>
  );
}

export function Clips({ clips }: { clips: Clip[] }) {
  const [on, setOn] = useState(0);
  const clip = clips[on];
  return (
    <div className="clips">
      <div className="clip-stage" data-rv>
        <div className="clip-frame">
          <span className="clip-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="clip-tag">Demo data · no sound</span>
          <div className="clip-screen">
            <Player clip={clip} />
          </div>
        </div>
        <p className="clip-cap" aria-live="polite">
          <b>{clip.title}.</b> {clip.caption}
        </p>
      </div>
      <ol className="clip-list" aria-label="Chapters">
        {clips.map((c, i) => (
          <li key={c.id} data-rv style={{ "--d": i } as React.CSSProperties}>
            <button type="button" aria-pressed={i === on} onClick={() => setOn(i)}>
              <span className="cl-n">{String(i + 1).padStart(2, "0")}</span>
              <span className="cl-t">{c.title}</span>
              <span className="cl-c">{c.caption}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
