// The isolated runner: the only process that executes app code and AI-written code (planted-bug triggers,
// our hidden tests, fix proofs). It runs in its own container (deploy/docker-compose.yml "runner"): no
// network at all, no env_file and no secrets, a read-only root, a tmpfs /tmp, a non-root user and pid,
// memory and CPU limits; the bench apps and the exam portal's source are mounted read-only. The watcher
// talks to it over a unix socket on a small shared volume. It accepts only well-formed jobs on bench apps
// and the mounted exam portal source, never arbitrary folders.

import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { execJob, type Job } from "./exec.js";

const Edit = z.object({ file: z.string().max(300), find: z.string().max(20_000), replace: z.string().max(20_000) });
const Base = z.union([z.object({ kind: z.literal("bench"), app: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/), edits: z.array(Edit).max(10).optional() }), z.object({ kind: z.literal("sandbox") })]);
const Files = z.record(z.string().max(300), z.string().max(400_000)).refine((m) => Object.keys(m).length <= 5, "too many files");
const JobSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("trigger"), base: Base, code: z.string().max(20_000) }),
  z.object({ kind: z.literal("hidden"), base: Base, patched: Files, test: z.string().max(100_000) }),
  z.object({ kind: z.literal("prove"), base: Base, patched: Files, test: z.string().max(100_000) }),
]);

const MAX_BODY = 2 << 20;
const MAX_RUNNING = 3;
const MAX_WAITING = 20;

/** Leftover copies from a crash: the runner owns every jr* folder in its temp space. */
export function cleanTemp(dir = tmpdir()) {
  for (const name of existsSync(dir) ? readdirSync(dir) : []) if (/^jr(run|play)-/.test(name)) rmSync(join(dir, name), { recursive: true, force: true });
}

export function runnerServer() {
  let running = 0;
  const waiting: Array<() => void> = [];
  const slot = async () => {
    if (running >= MAX_RUNNING) await new Promise<void>((r) => waiting.push(r));
    running++;
  };
  const free = () => {
    running--;
    waiting.shift()?.();
  };
  return createServer((req, res) => {
    const answer = (code: number, body: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method === "GET" && req.url === "/health") return answer(200, { ok: true, running, waiting: waiting.length });
    if (req.method !== "POST" || req.url !== "/run") return answer(404, { error: "not found" });
    let text = "";
    let tooBig = false;
    req.setEncoding("utf8");
    req.on("data", (d: string) => {
      text += d;
      if (text.length > MAX_BODY) {
        tooBig = true;
        req.destroy();
      }
    });
    req.on("end", async () => {
      if (tooBig) return;
      let job: Job;
      try {
        job = JobSchema.parse(JSON.parse(text)) as Job;
      } catch {
        return answer(400, { error: "bad job" });
      }
      if (waiting.length >= MAX_WAITING) return answer(503, { error: "busy" });
      await slot();
      try {
        answer(200, await execJob(job, { allowLocal: false }));
      } catch (e) {
        console.error("runner job:", String(e));
        answer(422, { error: "job failed" });
      } finally {
        free();
      }
    });
  });
}

const isMain = process.argv[1] && new URL(import.meta.url).pathname === process.argv[1];
if (isMain) {
  const socket = process.env.JR_RUNNER_LISTEN ?? "/run/jr/runner.sock";
  cleanTemp();
  mkdirSync(dirname(socket), { recursive: true });
  if (existsSync(socket)) unlinkSync(socket);
  const server = runnerServer();
  server.listen(socket, () => {
    chmodSync(socket, Number.parseInt(process.env.JR_RUNNER_SOCKET_MODE ?? "600", 8));
    console.log(`JaagteRaho runner on ${socket}`);
  });
  const stop = () => server.close(() => process.exit(0));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
