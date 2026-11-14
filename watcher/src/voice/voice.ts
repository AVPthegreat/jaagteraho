// Spoken wake-up call. The text is written by code from flow names and counts, never from
// error text, so no personal data reaches the voice provider.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type Clip = { id: string; ogg: Buffer };
export type WakeInfo = { project: string; flow: string; hits: number; exam: boolean };

export interface Voice {
  wakeCall(info: WakeInfo): Promise<Clip | null>;
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
  constructor(protected dir: string) {}
  protected abstract synthesize(text: string): Promise<Buffer>;
  async wakeCall(info: WakeInfo): Promise<Clip | null> {
    const audio = await this.synthesize(wakeText(info, (process.env.JR_VOICE_LANG as "en" | "hi") ?? "hi"));
    const [ogg, mp3] = await Promise.all([toOggOpus(audio), toMp3(audio).catch(() => null)]);
    const id = randomBytes(8).toString("hex");
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${id}.ogg`), ogg);
    if (mp3) await writeFile(join(this.dir, `${id}.mp3`), mp3);
    return { id, ogg };
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
