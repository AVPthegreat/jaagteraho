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
export const HACKATHON_TRACK = "Track 1";

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
