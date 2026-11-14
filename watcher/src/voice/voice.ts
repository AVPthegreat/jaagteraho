// Spoken wake-up call. The text is written by code from flow names and counts, never from
// error text, so no personal data reaches the voice provider.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type Clip = { id: string; ogg: Buffer };
export type WakeInfo = { project: string; flow: string; hits: number; exam: boolean };
/** key: one clip per key (an incident) is made at most every reuseMs; calls in between get the same clip. */
export type WakeOpts = { key?: string; reuseMs?: number };

/** Clips kept on disk: the newest KEEP_CLIPS, and none older than KEEP_DAYS. */
export const KEEP_CLIPS = 200;
export const KEEP_DAYS = 3;

export interface Voice {
  wakeCall(info: WakeInfo, opts?: WakeOpts): Promise<Clip | null>;
  get(id: string, format?: "ogg" | "mp3"): Promise<Buffer | null>;
}

const HINDI_NUMBERS = ["शून्य", "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ", "दस", "ग्यारह", "बारह", "तेरह", "चौदह", "पंद्रह", "सोलह", "सत्रह", "अठारह", "उन्नीस", "बीस"];
const FLOW_HI: Record<string, string> = {
  "code submission": "कोड सबमिशन",
  "exam start": "एग्ज़ाम शुरू करना",
  "fee payment": "फ़ीस पेमेंट",
  exam: "एग्ज़ाम",
  contest: "कॉन्टेस्ट",
  payment: "पेमेंट",
  login: "लॉगिन",
};

export function wakeText(info: WakeInfo, lang: "en" | "hi"): string {
  const n = info.hits;
  if (lang === "hi") {
    // Gnani reads numbers best as words, and Hindi best in Devanagari.
    const count = n <= 20 ? HINDI_NUMBERS[n] : "बीस से ज़्यादा";
    const flow = FLOW_HI[info.flow] ?? info.flow;
    return `जागते रहो अलर्ट। ${info.project} पर ${flow} फ़ेल हो रहा है। ${count} बार${info.exam ? ", एग्ज़ाम के दौरान" : ""}। कृपया अभी देखिए।`;
  }
  return `JaagteRaho alert. ${info.flow} is failing on ${info.project}. ${n} ${n === 1 ? "failure" : "failures"}${info.exam ? ", during an exam" : ""}. Please take a look now.`;
}

/** Converts any audio the provider returns into OGG/Opus (Telegram voice notes) or MP3 (every browser). */
export function toOggOpus(input: Buffer): Promise<Buffer> {
  return transcode(input, ["-c:a", "libopus", "-b:a", "32k", "-f", "ogg"]);
}
export function toMp3(input: Buffer): Promise<Buffer> {
  return transcode(input, ["-c:a", "libmp3lame", "-b:a", "64k", "-f", "mp3"]);
}

function transcode(input: Buffer, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", ...args, "pipe:1"]);
    const out: Buffer[] = [];
    ff.stdout.on("data", (d: Buffer) => out.push(d));
    ff.on("error", reject);
    // If ffmpeg exits before reading all its input, writing fails with EPIPE; without this the
    // stream error would be unhandled and stop the whole server.
    ff.stdin.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg exited ${code}`))));
    ff.stdin.end(input);
  });
}

/** Stores clips on disk so the public page can play the same wake-up call. */
export abstract class StoredVoice implements Voice {
  // Recent clips by key, so a fault pressed again and again (the public demo) is synthesized once per window.
  private recent = new Map<string, { until: number; clip: Promise<Clip> }>();
  constructor(protected dir: string) {}
  protected abstract synthesize(text: string): Promise<Buffer>;
  protected encode(audio: Buffer): Promise<[Buffer, Buffer | null]> {
    return Promise.all([toOggOpus(audio), toMp3(audio).catch(() => null)]);
  }

  async wakeCall(info: WakeInfo, opts: WakeOpts = {}): Promise<Clip | null> {
    const now = Date.now();
    const reuseMs = opts.reuseMs ?? 0;
    for (const [k, v] of this.recent) if (now >= v.until) this.recent.delete(k);
    const hit = opts.key && reuseMs > 0 ? this.recent.get(opts.key) : undefined;
    if (hit) return hit.clip;
    const clip = this.make(info);
    if (opts.key && reuseMs > 0) {
      this.recent.set(opts.key, { until: now + reuseMs, clip });
      // A failed synthesis is not reused: the next run tries again.
      clip.catch(() => this.recent.get(opts.key!)?.clip === clip && this.recent.delete(opts.key!));
    }
    return clip;
  }

  private async make(info: WakeInfo): Promise<Clip> {
    const audio = await this.synthesize(wakeText(info, (process.env.JR_VOICE_LANG as "en" | "hi") ?? "hi"));
    const [ogg, mp3] = await this.encode(audio);
    const id = randomBytes(8).toString("hex");
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${id}.ogg`), ogg);
    if (mp3) await writeFile(join(this.dir, `${id}.mp3`), mp3);
    await this.prune().catch((e) => console.error("voice prune:", e));
    return { id, ogg };
  }

  /** Deletes clips older than KEEP_DAYS and all but the newest KEEP_CLIPS. Returns how many clips went. */
  async prune(now = Date.now(), keep = KEEP_CLIPS, days = KEEP_DAYS): Promise<number> {
    const names = await readdir(this.dir).catch(() => [] as string[]);
    const clips = new Map<string, number>();
    for (const n of names) {
      const m = n.match(/^([0-9a-f]{16})\.(ogg|mp3)$/);
      if (!m) continue;
      const t = (await stat(join(this.dir, n)).catch(() => null))?.mtimeMs ?? 0;
      clips.set(m[1], Math.max(clips.get(m[1]) ?? 0, t));
    }
    const newestFirst = [...clips].sort((a, b) => b[1] - a[1]);
    const gone = newestFirst.filter(([, t], i) => i >= keep || now - t > days * 86_400_000).map(([id]) => id);
    for (const id of gone) for (const ext of ["ogg", "mp3"]) await unlink(join(this.dir, `${id}.${ext}`)).catch(() => undefined);
    return gone.length;
  }
  async get(id: string, format: "ogg" | "mp3" = "ogg"): Promise<Buffer | null> {
    if (!/^[0-9a-f]{16}$/.test(id)) return null;
    return readFile(join(this.dir, `${id}.${format}`)).catch(() => null);
  }
}

/** Gnani Timbre text-to-speech, per docs.gnani.ai (REST inference, 13 Nov 2026). */
export class GnaniVoice extends StoredVoice {
  constructor(dir: string, private apiKey: string, private voice = process.env.JR_GNANI_VOICE ?? "Nalini", private lang = process.env.JR_VOICE_LANG === "en" ? "en-IN" : "hi-IN") {
    super(dir);
  }
  protected async synthesize(text: string): Promise<Buffer> {
    const res = await fetch("https://api.vachana.ai/api/v1/tts/inference", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key-id": this.apiKey },
      body: JSON.stringify({
        text,
        voice: this.voice,
        model: "timbre-v2.5",
        language: this.lang,
        speed: 1.0,
        audio_config: { sample_rate: 24000, num_channels: 1, sample_width: 2, encoding: "linear_pcm", container: "wav" },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`gnani tts ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

export function makeVoice(dataDir: string): Voice | null {
  const provider = process.env.JR_VOICE_PROVIDER;
  if (provider === "gnani" && process.env.JR_GNANI_API_KEY) return new GnaniVoice(dataDir, process.env.JR_GNANI_API_KEY);
  if (provider) console.warn(`voice provider "${provider}" is not set up; wake-up calls are text only`);
  return null;
}
