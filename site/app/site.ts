/* One place for the facts the site repeats. Change them here, not in page text. */

export const REPO = "https://github.com/AVPthegreat/jaagteraho";
export const DECIDE_SRC = `${REPO}/blob/main/watcher/src/pipeline/decide.ts`;
export const GATE_SRC = `${REPO}/blob/main/watcher/src/pipeline/gate.ts`;
export const HEAL_SRC = `${REPO}/blob/main/watcher/src/pipeline/heal.ts`;

/* Where the watcher runs. Change this one line when it moves (for example to Vultr). */
export const HOSTED_ON = "a Vultr Cloud Compute server in Bangalore, India";

/* The demo video, once it is published. Nothing is shown while it is null. */
export const VIDEO_URL: string | null = null;

export const HACKATHON = "HackGlobal 2026";
export const HACKATHON_TRACK = "Build with AI track";
export const HACKATHON_ABOUT = "14–15 Nov 2026 · organised by Polaris School of Technology, powered by Vultr";
export const HACKATHON_LOGO = "/logos/hackglobal-wordmark.png";

/* Who built it. The founder built JaagteRaho solo, working with two AI teammates. */
export const TEAM: Array<{ name: string; role: string; href?: string }> = [
  { name: "Anant Vardhan Pandey", role: "founder, built it" },
  { name: "Ted", role: "AI engineer" },
  { name: "Ido", role: "AI code reviewer" },
];
/* The founder's LinkedIn. Empty hides the link. */
export const LINKEDIN_URL = "https://www.linkedin.com/in/avpthegreat";

/* The services JaagteRaho runs on, shown as a logo row in the footer. Logos: public/logos (see CREDITS.md). */
export const BUILT_WITH: Array<{ name: string; label: string; logo: string; href: string; h?: number }> = [
  { name: "Vultr", label: "Runs on Vultr Cloud", logo: "/logos/vultr.svg", href: "https://www.vultr.com" },
  { name: "Claude by Anthropic", label: "Diagnosis by Claude", logo: "/logos/claude-white.svg", href: "https://www.anthropic.com/claude" },
  { name: "Gnani.ai", label: "Voice by Gnani.ai", logo: "/logos/gnani-white.svg", href: "https://gnani.ai", h: 30 },
  { name: "Twilio", label: "Calls by Twilio", logo: "/logos/twilio-white.svg", href: "https://www.twilio.com" },
];

/*
  Short looping product clips for the "See it work" section (demo data only). Files live in
  site/public/clips/ as <id>.webm, <id>.mp4 and <id>.jpg (the poster); `phone` means a 9:16
  <id>-9x16 version exists and is used on narrow screens. Sources: jr-video/site-clips/README.md.
*/
export type Clip = { id: string; title: string; caption: string; phone?: boolean };
export const CLIPS: Clip[] = [
  { id: "night-scene", title: "It wakes you", caption: "The demo exam portal fails during an exam. A written rule says wake the owner, and the phone rings.", phone: true },
  { id: "error-to-cause", title: "It finds the cause", caption: "The traceback is read, framework frames fold away, and one card names the file and the line." },
  { id: "fix-checked", title: "It checks the fix", caption: "Code rules, the AI reviewer, its own test and your rules. Each one has to pass.", phone: true },
  { id: "heal-undo", title: "It heals, with Undo", caption: "Merged when your required checks pass, watched, confirmed. At most 2 heals a night, and Undo stays one tap away." },
  { id: "scenarios", title: "It judges", caption: "Four apps, four errors, four different decisions: wake, message, message, ignore." },
  { id: "connect", title: "You connect in one command", caption: "npx jaagteraho init finds your framework, shows every change first and sends a test error." },
];

/*
  The full benchmark, both sets together: bench/RESULTS.md (24 cases, 4 of them noise) plus
  bench/RESULTS-extra.md (50 playground bugs). Totals worked out from bench/results.json and
  bench/results-extra.json. Rupees at about 84 to the dollar.
*/
export const BENCH_ALL = {
  bugs: 70,
  cases: 74,
  reached: 70,
  fix_works: 62,
  right_file: 59, // bench/RESULTS-extra.md: 59 of 70 (15 + 44), corrected in fee7285
  shown: 64,
  shown_wrong: 5,
  median_decision_s: 1.7,
  cost_usd: 1.19,
  inr_per_usd: 84,
  extra_md: `${REPO}/blob/main/bench/RESULTS-extra.md`,
  base_md: `${REPO}/blob/main/bench/RESULTS.md`,
};
export const benchInr = () => Math.round(BENCH_ALL.cost_usd * BENCH_ALL.inr_per_usd);
export const benchInrPerBug = () => (Math.round(((BENCH_ALL.cost_usd * BENCH_ALL.inr_per_usd) / BENCH_ALL.bugs) * 10) / 10).toFixed(1);
/* What one bug costs in AI, and how many bugs the free $5 credit covers, from the same totals. */
export const benchCentsPerBug = () => ((BENCH_ALL.cost_usd / BENCH_ALL.bugs) * 100).toFixed(1);
export const benchBugsFor = (usd: number) => Math.floor((usd * BENCH_ALL.bugs) / BENCH_ALL.cost_usd / 10) * 10;
export const benchFixPct = () => Math.round((BENCH_ALL.fix_works / BENCH_ALL.bugs) * 100);
