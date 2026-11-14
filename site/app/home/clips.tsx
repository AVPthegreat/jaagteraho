"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Clip } from "../site";

/*
  "See it work": one playlist. The clips play 1 → 6 and start over, each step's card lights up while
  its clip plays, and one seek bar covers the whole sequence (one segment per clip). Autoplay starts
  muted (browser rule) and only while the section is on screen; one tap turns sound on for the whole
  sequence. With reduced motion nothing plays on its own and the video shows its own controls.
*/

/*
  The files for each clip, in one place. `base` is the silent 16:9 file, `tall` a 9:16 version used on
  phones, `sound` a 16:9 version with an audio track (preferred everywhere when present, so sound
  works on phones too). Each name means <name>.webm and <name>.mp4 in public/clips; posters are
  <base>.jpg and <tall>.jpg.
*/
const FILES: Record<string, { base: string; tall?: string; sound?: string; secs: number }> = {
  "night-scene": { base: "night-scene", tall: "night-scene-9x16", sound: "night-scene-sound", secs: 6.4 },
  "error-to-cause": { base: "error-to-cause", sound: "error-to-cause-sound", secs: 6 },
  "fix-checked": { base: "fix-checked", tall: "fix-checked-9x16", sound: "fix-checked-sound", secs: 5.7 },
  "heal-undo": { base: "heal-undo", sound: "heal-undo-sound", secs: 6 },
  scenarios: { base: "scenarios", sound: "scenarios-sound", secs: 6.2 },
  connect: { base: "connect", sound: "connect-sound", secs: 6.1 },
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

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

export function Clips({ clips }: { clips: Clip[] }) {
  const n = clips.length;
  const root = useRef<HTMLDivElement | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const strip = useRef<HTMLOListElement | null>(null);
  const seekTo = useRef<number | null>(null);
  const [idx, setIdx] = useState(0);
  const fails = useRef(0);
  const [cur, setCur] = useState(0);
  const [durs, setDurs] = useState<number[]>(() => clips.map((c) => FILES[c.id]?.secs ?? 10));
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false); // the viewer pressed pause
  const [visible, setVisible] = useState(false);
  const [still, setStill] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [rolling, setRolling] = useState(false); // the video is really playing (autoplay can be refused, e.g. Low Power Mode)

  useEffect(() => {
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const mq = window.matchMedia("(max-width: 640px)");
    setNarrow(mq.matches);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Play only while the section is on screen.
  useEffect(() => {
    const el = root.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const clip = clips[idx];
  const f = FILES[clip.id] ?? { base: clip.id, secs: 10 };
  const hasSound = Boolean(f.sound);
  const anySound = clips.some((c) => FILES[c.id]?.sound);
  // Phones play the 9:16 cut while muted (its text is readable at phone width); sound switches to the 16:9 file with audio.
  const tall = narrow && (muted || !f.sound) && Boolean(f.tall);
  const src = tall ? f.tall! : (f.sound ?? f.base);
  const poster = `/clips/${tall ? f.tall : f.base}.jpg`;
  const shouldPlay = visible && !paused && !still;

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.muted = muted;
    if (shouldPlay) v.play().catch(() => undefined);
    else v.pause();
  }, [shouldPlay, idx, muted, src]);

  // Smooth progress while playing: the two active bars are written directly each frame (a React render
  // per frame cost ~0.5 s of main thread per second on a phone); the text and state follow timeupdate.
  useEffect(() => {
    // Only while the video really rolls: autoplay can be refused, and then there is nothing to follow.
    if (!shouldPlay || !rolling) return;
    let raf = 0;
    const bars = root.current?.querySelectorAll<HTMLElement>('[aria-current="step"] .ps-fill i, .pl-seg.on i');
    const loop = () => {
      const v = video.current;
      if (v && bars) {
        const t = `scaleX(${Math.min(1, v.currentTime / durs[idx])})`;
        bars.forEach((b) => (b.style.transform = t));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [shouldPlay, rolling, idx, durs]);

  // Keep the active step in view inside the phone strip (scrolls the strip only, never the page).
  useEffect(() => {
    const s = strip.current;
    const li = s?.children[idx] as HTMLElement | undefined;
    if (s && li && s.scrollWidth > s.clientWidth) s.scrollTo({ left: li.offsetLeft - 16, behavior: still ? "auto" : "smooth" });
  }, [idx, still]);

  const go = useCallback(
    (i: number, at = 0) => {
      seekTo.current = at;
      setCur(at);
      setIdx(((i % n) + n) % n);
      setPaused(false);
    },
    [n],
  );

  const onMeta = () => {
    const v = video.current;
    if (!v) return;
    if (Number.isFinite(v.duration) && v.duration > 0) {
      setDurs((d) => (Math.abs(d[idx] - v.duration) < 0.05 ? d : d.map((x, k) => (k === idx ? v.duration : x))));
    }
    if (seekTo.current) v.currentTime = Math.min(seekTo.current, Math.max(0, v.duration - 0.1));
    seekTo.current = null;
  };

  const total = durs.reduce((a, b) => a + b, 0);
  const before = durs.slice(0, idx).reduce((a, b) => a + b, 0);
  const elapsed = before + Math.min(cur, durs[idx]);

  // Seek to a point on the whole sequence (seconds from the start).
  const seekAll = (s: number) => {
    s = Math.max(0, Math.min(total - 0.05, s));
    let acc = 0;
    for (let k = 0; k < n; k++) {
      if (s < acc + durs[k]) {
        if (k === idx && video.current) {
          video.current.currentTime = s - acc;
          setCur(s - acc);
        } else go(k, s - acc);
        return;
      }
      acc += durs[k];
    }
  };
  const onBar = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    seekAll(((e.clientX - r.left) / r.width) * total);
  };
  const onBarKey = (e: React.KeyboardEvent) => {
    const step = ({ ArrowRight: 5, ArrowLeft: -5, PageUp: 15, PageDown: -15 } as Record<string, number>)[e.key];
    if (step !== undefined) {
      e.preventDefault();
      seekAll(elapsed + step);
    } else if (e.key === "Home") {
      e.preventDefault();
      go(0);
    }
  };

  // Turning sound on or off can swap the file on phones: carry the position over.
  const setSound = (on: boolean) => {
    if (narrow && f.tall && f.sound && video.current) seekTo.current = video.current.currentTime;
    setMuted(!on);
  };

  const playing = rolling;
  const togglePlay = () => {
    const v = video.current;
    if (still && v) {
      // Reduced motion: the viewer starts and stops it by hand.
      if (v.paused) v.play().catch(() => undefined);
      else v.pause();
      return;
    }
    if (playing) setPaused(true);
    else {
      setPaused(false);
      // Inside the tap, so a browser that refused autoplay lets this one through.
      v?.play().catch(() => undefined);
    }
  };

  return (
    <div className="pl" ref={root}>
      <ol className="pl-steps" ref={strip} aria-label="Steps">
        {clips.map((c, i) => (
          <li key={c.id}>
            <button type="button" aria-current={i === idx ? "step" : undefined} onClick={() => go(i)}>
              <span className="ps-n">{i + 1}</span>
              <span className="ps-t">{c.title}</span>
              <span className="ps-c">{c.caption}</span>
              <span className="ps-fill" aria-hidden="true">
                <i style={{ transform: `scaleX(${i < idx ? 1 : i === idx ? Math.min(1, cur / durs[i]) : 0})` }} />
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="pl-main">
        <div className="clip-frame">
          <span className="clip-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="clip-tag">Demo data</span>
          <div className={`clip-screen${tall ? " is-tall" : ""}`}>
            <video
              key={src}
              ref={video}
              className="clip-video"
              muted
              playsInline
              preload={visible ? "auto" : "none"}
              controls={still}
              poster={poster}
              width={tall ? 720 : 1280}
              height={tall ? 1280 : 720}
              aria-label={`Step ${idx + 1} of ${n}: ${clip.title}. ${clip.caption}`}
              onLoadedMetadata={() => {
                fails.current = 0;
                onMeta();
              }}
              onEnded={() => go(idx + 1)}
              onPlay={() => setRolling(true)}
              onPause={() => setRolling(false)}
              onTimeUpdate={(e) => {
                setCur(e.currentTarget.currentTime);
              }}
            >
              <source src={`/clips/${src}.webm`} type="video/webm" />
              <source
                src={`/clips/${src}.mp4`}
                type="video/mp4"
                onError={() => {
                  // Both files failed (offline, or a deploy in progress): keep the poster, try the next clip
                  // after a pause, and stop advancing after a full round of failures.
                  fails.current += 1;
                  if (fails.current < n) setTimeout(() => go(idx + 1), 4000);
                }}
              />
            </video>
            {anySound && muted && (
              <button type="button" className="pl-sound-cta" onClick={() => setSound(true)} aria-label="Turn sound on">
                <SpeakerIcon on />
                <span className="pl-sound-label t-touch">Tap for sound</span>
                <span className="pl-sound-label t-mouse">Click for sound</span>
              </button>
            )}
          </div>
        </div>

        <div className="pl-bar">
          <button type="button" className="pl-btn" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              {playing ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" /> : <path d="M8 5v14l11-7L8 5Z" fill="currentColor" />}
            </svg>
          </button>
          <div
            className="pl-seek"
            role="slider"
            tabIndex={0}
            aria-label="Position in the whole sequence"
            aria-valuemin={0}
            aria-valuemax={Math.round(total)}
            aria-valuenow={Math.round(elapsed)}
            aria-valuetext={`Step ${idx + 1} of ${n}, ${mmss(elapsed)} of ${mmss(total)}`}
            onPointerUp={onBar}
            onKeyDown={onBarKey}
          >
            {durs.map((d, k) => (
              <span key={k} className={`pl-seg${k === idx ? " on" : ""}`} style={{ flexGrow: d }}>
                <i style={{ transform: `scaleX(${k < idx ? 1 : k === idx ? Math.min(1, cur / d) : 0})` }} />
              </span>
            ))}
          </div>
          {anySound && (
            <button type="button" className="pl-btn" onClick={() => setSound(muted)} aria-pressed={!muted} aria-label="Sound">
              <SpeakerIcon on={!muted} />
            </button>
          )}
        </div>
        <p className="pl-meta">
          <span aria-live="polite">
            <b>
              Step {idx + 1} of {n}
            </b>{" "}
            · {clip.title}
            {anySound && !hasSound && <span className="soft"> · this step has no sound</span>}
          </span>
          <span className="pl-time" aria-hidden="true">
            {mmss(elapsed)} / {mmss(total)}
          </span>
        </p>
        <p className="pl-cap">{clip.caption}</p>
      </div>
    </div>
  );
}
