// Claude calls with a spend ledger and hard caps enforced in code.

import { AsyncLocalStorage } from "node:async_hooks";
import Anthropic from "@anthropic-ai/sdk";
import type { DB } from "../db/db.js";

const PRICES: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
};
const HIGHEST_PRICE: [number, number] = [Math.max(...Object.values(PRICES).map((p) => p[0])), Math.max(...Object.values(PRICES).map((p) => p[1]))];

/**
 * Who a model call is for. Each lane has its own daily budget, so public use (paste, outside apps, the
 * demo) can never use up what Faurus needs. Calls made outside any context count as "faurus" (our own).
 */
export type Lane = "faurus" | "demo" | "outside" | "paste";
export const LANES: Lane[] = ["faurus", "demo", "outside", "paste"];

/** The app a model call is made for, so spend can be charged to its owner's free credit and its lane. */
export const spendContext = new AsyncLocalStorage<{ projectId: number; lane?: Lane }>();
export const currentLane = (): Lane => spendContext.getStore()?.lane ?? "faurus";

const money = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 ? n : d;
};

/** Daily dollar caps (rolling 24 hours). JR_SPEND_DAILY_STOP_AT caps all lanes together. */
export type DailyCaps = { total: number } & Record<Lane, number>;
export function dailyCaps(env: NodeJS.ProcessEnv = process.env): DailyCaps {
  return {
    total: money(env.JR_SPEND_DAILY_STOP_AT, 10),
    faurus: money(env.JR_SPEND_DAILY_FAURUS, 6),
    demo: money(env.JR_SPEND_DAILY_DEMO, 3),
    outside: money(env.JR_SPEND_DAILY_OUTSIDE, 1.5),
    paste: money(env.JR_SPEND_DAILY_PASTE, 0.5),
  };
}

export type Usage = { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };


export class SpendGuard {
  constructor(
    private db: DB,
    private haikuOnlyAt: number,
    private stopAt: number,
    private daily: DailyCaps = dailyCaps(),
  ) {}

  total(): number {
    return (this.db.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS t FROM spend").get() as { t: number }).t;
  }

  /** Dollars spent in the last 24 hours, by one lane or by all. */
  spentToday(lane?: Lane): number {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    return lane
      ? (this.db.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS t FROM spend WHERE at > ? AND COALESCE(lane, 'faurus') = ?").get(since, lane) as { t: number }).t
      : (this.db.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS t FROM spend WHERE at > ?").get(since) as { t: number }).t;
  }

  /** Calls for one purpose in the last 24 hours, by one lane or by all. */
  countToday(purpose: string, lane?: Lane): number {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    return lane
      ? (this.db.prepare("SELECT COUNT(*) AS n FROM spend WHERE purpose = ? AND at > ? AND COALESCE(lane, 'faurus') = ?").get(purpose, since, lane) as { n: number }).n
      : (this.db.prepare("SELECT COUNT(*) AS n FROM spend WHERE purpose = ? AND at > ?").get(purpose, since) as { n: number }).n;
  }

  /**
   * Returns the model to use, a cheaper one, or null when spending must stop: at the all-time stop,
   * at the daily cap for all lanes, or at the daily cap of the lane this call is for.
   */
  pick(model: string, cheaper: string): string | null {
    const t = this.total();
    if (t >= this.stopAt) return null;
    if (this.spentToday() >= this.daily.total) return null;
    const lane = currentLane();
    if (this.spentToday(lane) >= this.daily[lane]) return null;
    if (t >= this.haikuOnlyAt) return cheaper;
    return model;
  }

  record(model: string, purpose: string, usage: Usage): number {
    // A model missing from the table (a new or misspelled id) is charged at the highest known price,
    // never as free, so the spend cap keeps working.
    const [inp, out] = PRICES[model] ?? HIGHEST_PRICE;
    // Cached input: writes are charged at 1.25 times the input price, reads at 0.1 times (never below the real price).
    const write = usage.cache_creation_input_tokens ?? 0;
    const read = usage.cache_read_input_tokens ?? 0;
    const cost = (usage.input_tokens * inp + write * inp * 1.25 + read * inp * 0.1 + usage.output_tokens * out) / 1_000_000;
    this.db
      .prepare("INSERT INTO spend (at, model, purpose, input_tokens, output_tokens, cost_usd, project_id, lane) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(new Date().toISOString(), model, purpose, usage.input_tokens + write + read, usage.output_tokens, cost, spendContext.getStore()?.projectId || null, currentLane());
    return cost;
  }
}

export type AI = {
  client: Anthropic;
  guard: SpendGuard;
  decisionModel: string;
  diagnosisModel: string;
};

export function makeAI(db: DB): AI | null {
  const apiKey = process.env.JR_ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return {
    client: new Anthropic({ apiKey, maxRetries: 1 }),
    guard: new SpendGuard(db, Number(process.env.JR_SPEND_HAIKU_ONLY_AT ?? 40), Number(process.env.JR_SPEND_STOP_AT ?? 45)),
    decisionModel: process.env.JR_DECISION_MODEL ?? "claude-haiku-5-5",
    diagnosisModel: process.env.JR_DIAGNOSIS_MODEL ?? "claude-sonnet-5-5",
  };
}

/** Wraps untrusted text so the model reads it as data. */
export function fence(tag: string, text: string): string {
  const safe = text.replaceAll(`</${tag}`, `<\\/${tag}`);
  return `<${tag}>\n${safe}\n</${tag}>`;
}
