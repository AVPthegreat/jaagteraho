"use client";

import { useEffect, useRef, useState } from "react";
import film from "./film.json";

/*
  "See it work": one continuous 30-second film. It starts when the section comes into view (with sound
  if the browser allows it, otherwise muted with a "Tap for sound" button), pauses exactly where it is
  when the section leaves the view and resumes from there when it comes back. The step list beside it
  follows the film; clicking a step jumps there. With reduced motion nothing plays on its own.
*/

/* The film and its steps live in film.json, so swapping the film is a file copy plus that small file. */
type Step = { at: number; title: string; line: string };
const FILM = { src: String(film.src), poster: String(film.poster), label: String(film.label ?? "JaagteRaho") };
const STEPS: Step[] = (film.steps as Step[]).filter((s) => typeof s.at === "number" && typeof s.title === "string").sort((x, y) => x.at - y.at);

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4v-5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      {on ? (
        <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      ) : (
        <path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function Clips() {
  const box = useRef<HTMLDivElement | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(46);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [still, setStill] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const interacted = useRef(false);
  const userMuted = useRef(false);
  const visible = useRef(false);

  useEffect(() => {
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    // Any real interaction on the page lets the browser play sound: remember it.
    const mark = (e: Event) => {
      interacted.current = true;
      // The film's own sound buttons handle themselves.
      if (e.target instanceof Element && e.target.closest(".film-sound, .film-btn")) return;
      // The first touch or key anywhere lets the browser play sound: turn it on if the film is playing muted.
      const v = video.current;
      if (v && !v.paused && v.muted && !userMuted.current) {
        v.muted = false;
        setMuted(false);
      }
    };
    window.addEventListener("pointerdown", mark, { once: true, passive: true });
    window.addEventListener("keydown", mark, { once: true });
    return () => {
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("keydown", mark);
    };
  }, []);

  /** Plays with sound when allowed; if the browser refuses, plays muted and shows "Tap for sound". */
  const start = async () => {
    const v = video.current;
    if (!v) return;
    // Sound unless the visitor muted it themselves.
    v.muted = userMuted.current;
    try {
      await v.play();
      setMuted(v.muted);
    } catch {
      v.muted = true;
      setMuted(true);
      await v.play().catch(() => undefined);
    }
  };

  // Play while in view, pause exactly where it is when it leaves; resume from there.
  useEffect(() => {
    const el = box.current;
    if (!el || still || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      ([e]) => {
        visible.current = e.isIntersecting;
        const v = video.current;
        if (!v) return;
        if (e.isIntersecting && !userPaused) {
          if (v.paused) void start();
        } else if (!e.isIntersecting && !v.paused) v.pause();
      },
      { threshold: 0.45 },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still, userPaused]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      setUserPaused(false);
      void start();
    } else {
      setUserPaused(true);
      v.pause();
    }
  };
  const toggleSound = () => {
    const v = video.current;
    if (!v) return;
    v.muted = !v.muted;
    userMuted.current = v.muted;
    setMuted(v.muted);
    if (v.paused) {
      setUserPaused(false);
      void v.play().catch(() => undefined);
    }
  };
  const seek = (i: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = STEPS[i].at + 0.05;
    setT(v.currentTime);
    if (v.paused) {
      setUserPaused(false);
      void start();
    }
  };

  let idx = 0;
  STEPS.forEach((s, i) => {
    if (t >= s.at) idx = i;
  });
  const fill = (i: number) => {
    const end = STEPS[i + 1]?.at ?? dur;
    return i < idx ? 1 : i > idx ? 0 : Math.min(1, Math.max(0, (t - STEPS[i].at) / (end - STEPS[i].at)));
  };

  return (
    <div className="film" ref={box}>
      <div className="film-main">
        <div className="film-screen">
          <video
            ref={video}
            className="film-video"
            playsInline
            muted
            preload="metadata"
            poster={FILM.poster}
            width={1920}
            height={1080}
            controls={still}
            aria-label={FILM.label}
            onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDur(e.currentTarget.duration)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={(e) => {
              // Loop while the section is in view.
              e.currentTarget.currentTime = 0;
              if (visible.current) void e.currentTarget.play().catch(() => undefined);
            }}
          >
            <source src={`${FILM.src}.webm`} type="video/webm" />
            <source src={`${FILM.src}.mp4`} type="video/mp4" />
          </video>
          {muted && playing ? (
            <button type="button" className="film-sound" onClick={toggleSound}>
              <SpeakerIcon on /> Tap for sound
            </button>
          ) : null}
        </div>
        <div className="film-bar">
          <button type="button" className="film-btn" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              {playing ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" /> : <path d="M8 5v14l11-7L8 5Z" fill="currentColor" />}
            </svg>
          </button>
          <button type="button" className="film-btn" onClick={toggleSound} aria-label={muted ? "Turn sound on" : "Mute"} aria-pressed={!muted}>
            <SpeakerIcon on={!muted} />
          </button>
          <span className="film-time" aria-hidden="true">
            {Math.floor(t)} s / {Math.round(dur)} s
          </span>
        </div>
      </div>
      <ol className="film-steps" aria-label="Chapters">
        {STEPS.map((s, i) => (
          <li key={s.at}>
            <button type="button" aria-current={i === idx ? "step" : undefined} onClick={() => seek(i)}>
              <span className="fs-n">{i + 1}</span>
              <span className="fs-t">{s.title}</span>
              <span className="fs-c">{s.line}</span>
              <span className="fs-fill" aria-hidden="true">
                <i style={{ transform: `scaleX(${fill(i)})` }} />
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
