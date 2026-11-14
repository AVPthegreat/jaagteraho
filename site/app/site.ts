/* One place for the facts the site repeats. Change them here, not in page text. */

export const REPO = "https://github.com/AVPthegreat/jaagteraho";
export const DECIDE_SRC = `${REPO}/blob/main/watcher/src/pipeline/decide.ts`;
export const GATE_SRC = `${REPO}/blob/main/watcher/src/pipeline/gate.ts`;
export const HEAL_SRC = `${REPO}/blob/main/watcher/src/pipeline/heal.ts`;

/* Where the watcher runs. Change this one line when it moves (for example to Vultr). */
export const HOSTED_ON = "an AWS server in Mumbai, India";

/* The demo video, once it is published. Nothing is shown while it is null. */
export const VIDEO_URL: string | null = null;

export const HACKATHON = "HackGlobal 2026 · Track 01, Agentic and GenAI apps";

/* The team. Add the other two members here (name and role) and the footer shows them. */
export const TEAM: Array<{ name: string; role: string; href?: string }> = [
  { name: "Anant Vardhan Pandey", role: "Founder of Faurus · built JaagteRaho", href: "https://faurus.app" },
];
