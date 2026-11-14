"use client";

import { useState } from "react";
import { Lantern } from "./lantern";

/* The real fix for the demo portal's Submit bug (sandbox/fixed.patch). */
export const SUBMIT_DIFF = `--- a/portal/submissions.py
+++ b/portal/submissions.py
@@ -11,6 +11,8 @@
     code = data.get("code", "")
     if not code.strip():
         return {"ok": False, "error": "Write some code before submitting"}
-    language = data["language"]
-    runner = RUNNERS[language]
+    language = data.get("language")
+    runner = RUNNERS.get(language)
+    if runner is None:
+        return {"ok": False, "error": "Choose a supported language (python, cpp or java) before submitting"}
     return {"ok": True, "runner": runner, "queued": True, "bytes": len(code)}`;

export function Diff({ text }: { text: string }) {
  return (
    <pre className="diff">
      {text.split("\n").map((l, i) => (
        <span key={i} className={l.startsWith("---") || l.startsWith("+++") || l.startsWith("@@") ? "h" : l.startsWith("-") ? "d" : l.startsWith("+") ? "a" : ""}>
          {l}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

type Key = "why" | "fix" | "approve" | "ack";

const REPLIES: Record<Key, { ask: string; answer: React.ReactNode }> = {
  why: {
    ask: "Why?",
    answer: (
      <>
        <p>
          <b>Rule 2</b>: a critical flow failing during an exam. You marked Submit code as critical, and <code>/exam 2h</code> told me an exam is
          running.
        </p>
        <p>No AI answer can lower this rule, so it woke you.</p>
      </>
    ),
  },
  fix: {
    ask: "Show fix",
    answer: (
      <>
        <p>
          <b>Fix</b> · 4 lines in <code>portal/submissions.py</code> · all checks passed · proved by a test
        </p>
        <Diff text={SUBMIT_DIFF} />
      </>
    ),
  },
  approve: {
    ask: "Approve fix",
    answer: <p>Approved. It goes in as a pull request that merges only after your required checks pass.</p>,
  },
  ack: {
    ask: "Acknowledge",
    answer: <p>Acknowledged at 02:15. The wake-up calls stop, and because you are awake, the fix waits for your Approve.</p>,
  },
};

/* What reaches the owner's phone: a Telegram alert whose buttons answer, as the bot's do. */
export function AlertCard() {
  const [asked, setAsked] = useState<Key[]>([]);
  const press = (k: Key) => setAsked((list) => (list.includes(k) ? list : [...list, k]));

  return (
    <div className="tg" data-ui>
      <div className="tg-top">
        <span className="tg-avatar">
          <Lantern size={24} />
        </span>
        <span>
          <b>JaagteRaho</b>
          <span>bot</span>
        </span>
      </div>
      <div className="tg-chat">
        <div className="tg-msg">
          <p>
            <span className="wake-word">WAKE</span> · exam-portal · Submit code failing
          </p>
          <p>Rule 2: a critical flow failing during an exam</p>
          <p className="gap">
            <b>Cause:</b> The Submit button never says which language the code is in, and the server insists on knowing it.
          </p>
          <p>
            <code>portal/submissions.py:14</code> · likely
          </p>
          <p className="gap">
            <b>Fix:</b> ready · all checks passed · proved by a test · AI-written
          </p>
          <p>
            <b>Your rule:</b> heal on its own if nobody acknowledges in 10 min
          </p>
          <span className="tg-time">02:14</span>
        </div>
        <div className="tg-keys">
          {(Object.keys(REPLIES) as Key[]).map((k, i) => (
            <button key={k} type="button" className={i === 3 ? "wide" : undefined} aria-pressed={asked.includes(k)} onClick={() => press(k)}>
              {REPLIES[k].ask}
            </button>
          ))}
        </div>
        <div aria-live="polite" style={{ display: "contents" }}>
          {asked.map((k) => (
            <div key={k} style={{ display: "contents" }}>
              <span className="tg-reply tg-in">{REPLIES[k].ask}</span>
              <div className="tg-msg tg-in">{REPLIES[k].answer}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
