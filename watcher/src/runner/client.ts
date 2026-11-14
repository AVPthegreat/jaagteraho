// How the watcher reaches the isolated runner (runner/server.ts) that executes app and AI-written code.
//   JR_RUNNER_SOCKET=/run/jr/runner.sock   production: a separate container with no network and no secrets
//   JR_RUNNER=inprocess                    tests and local development ONLY: runs in this process's children
// With neither set, nothing is executed: fix proofs are skipped and the playground stays off.

import { request } from "node:http";
import { execJob, type Job, type JobResult } from "./exec.js";

export type RunnerMode = "socket" | "inprocess" | null;

export function runnerMode(env: NodeJS.ProcessEnv = process.env): RunnerMode {
  if (env.JR_RUNNER_SOCKET) return "socket";
  if (env.JR_RUNNER === "inprocess") return "inprocess";
  return null;
}

const JOB_TIMEOUT_MS = 120_000;
const MAX_ANSWER = 2 << 20;

function viaSocket(socketPath: string, job: Job): Promise<JobResult> {
  return new Promise((done, fail) => {
    const body = JSON.stringify(job);
    const req = request(
      { socketPath, path: "/run", method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) }, timeout: JOB_TIMEOUT_MS },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (d: string) => {
          text += d;
          if (text.length > MAX_ANSWER) req.destroy(new Error("runner answer too large"));
        });
        res.on("end", () => {
          if (res.statusCode !== 200) return fail(new Error(`runner answered ${res.statusCode}`));
          try {
            done(JSON.parse(text) as JobResult);
          } catch {
            fail(new Error("runner answer is not JSON"));
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("runner timed out")));
    req.on("error", fail);
    req.end(body);
  });
}

export async function runJob(job: Job): Promise<JobResult> {
  const mode = runnerMode();
  if (mode === "socket") return viaSocket(process.env.JR_RUNNER_SOCKET!, job);
  if (mode === "inprocess") return execJob(job, { allowLocal: true });
  throw new Error("no isolated runner is set up");
}
