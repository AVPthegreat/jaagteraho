"""Rehearses the Faurus connection on the twin: does a slow or dead JaagteRaho slow down the app it watches?

Runs the twin under gunicorn three times, with SENTRY_DSN pointing at:
  1. no watcher at all (baseline: reporting switched off),
  2. the real watcher,
  3. an address where nothing listens (watcher down),
  4. a server that accepts and then hangs for 30 seconds (watcher slow).
For each, it times requests that fail (and so send an error report) and requests that succeed.

Usage: python rehearse.py "<real SENTRY_DSN>"   (needs gunicorn in the same environment)
"""

import http.server
import os
import signal
import statistics
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = 8010
N = 60


class Hang(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        time.sleep(30)
        self.send_response(200)
        self.end_headers()

    def log_message(self, *a):
        pass


def start_hanging_server(port):
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), Hang)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def timed(path, method="POST"):
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}{path}", data=b"{}" if method == "POST" else None, method=method)
    t0 = time.perf_counter()
    try:
        urllib.request.urlopen(req, timeout=10).read()
    except urllib.error.HTTPError as e:
        e.read()
    return (time.perf_counter() - t0) * 1000


def run(label, dsn):
    env = {**os.environ, "JR_RELEASE": "rehearsal"}
    env.pop("SENTRY_DSN", None)
    if dsn:
        env["SENTRY_DSN"] = dsn
    proc = subprocess.Popen(
        [sys.executable, "-m", "gunicorn", "twin.wsgi:application", "--bind", f"127.0.0.1:{PORT}", "--workers", "2", "--timeout", "20"],
        cwd=HERE, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=1).read()
                break
            except Exception:
                time.sleep(0.2)
        timed("/health", "GET")  # warm up
        failing = [timed("/api/submit") for _ in range(N)]
        ok = [timed("/health", "GET") for _ in range(N)]
    finally:
        proc.send_signal(signal.SIGTERM)
        proc.wait(timeout=30)
    p = lambda xs, q: statistics.quantiles(xs, n=100)[q - 1]
    print(f"{label:<28} failing requests p50 {statistics.median(failing):6.1f} ms  p95 {p(failing, 95):6.1f} ms | "
          f"normal requests p50 {statistics.median(ok):5.1f} ms  p95 {p(ok, 95):5.1f} ms")
    return failing


def main():
    real = sys.argv[1] if len(sys.argv) > 1 else None
    key_and_project = real.split("//", 1)[1] if real else "abc@127.0.0.1:1/1"
    key, rest = key_and_project.split("@", 1)
    project = rest.rsplit("/", 1)[1]
    start_hanging_server(8799)
    print(f"{N} failing and {N} normal requests per run, twin under gunicorn with 2 workers\n")
    run("no reporting (baseline)", None)
    if real:
        run("watcher up", real)
    run("watcher down (refused)", f"http://{key}@127.0.0.1:8798/{project}")
    run("watcher hanging 30 s", f"http://{key}@127.0.0.1:8799/{project}")


if __name__ == "__main__":
    main()
