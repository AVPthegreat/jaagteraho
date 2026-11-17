#!/usr/bin/env python3
"""Sends a web server's access log to JaagteRaho's log drain, so slow vulnerability scans are noticed
(watcher/src/intake/slowscan.ts). Standard library only; run it next to nginx.

    JR_LOGS_URL_FILE=~/.jr-drain python3 ship-access-log.py /var/log/nginx/access.log
    docker logs -f --tail 0 oj-nginx 2>/dev/null | JR_LOGS_URL_FILE=~/.jr-drain python3 ship-access-log.py -

The drain address (https://<api-host>/logs/<project-id>/<key>) comes from JR_LOGS_URL_FILE (a file with mode
600; the key in it lets anyone post to the drain) or JR_LOGS_URL. It is never printed.

A file is followed like `tail -F` (survives rotation) from its end: old lines are never sent. "-" reads stdin.
Only lines shaped like an access-log entry ("<ip> - <user> [<time>] ...") are sent; error-log lines and anything
else are dropped here. Batches go every 10 seconds, at most 512 KB per request and 6 requests a minute; past
that, lines are dropped (counted on stderr), never queued without bound. The watcher being down never blocks.
"""

import os
import re
import sys
import threading
import time
import urllib.request

FLUSH_SECONDS = 10
MAX_BATCH = 512 * 1024
MAX_POSTS_PER_MIN = 6
MAX_LINE = 2000
ACCESS = re.compile(rb"^[0-9a-fA-F:.]{3,45} \S+ \S+ \[[^\]]{20,40}\] \"")


def drain_url():
    f = os.environ.get("JR_LOGS_URL_FILE")
    if f:
        with open(os.path.expanduser(f)) as fh:
            return fh.read().strip()
    return os.environ.get("JR_LOGS_URL", "").strip()


def post(url, data):
    req = urllib.request.Request(url, data=data, method="POST", headers={"Content-Type": "text/plain"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            r.read()
        return True
    except Exception as e:  # never print the URL: it holds the key
        print(f"ship-access-log: post failed: {type(e).__name__}", file=sys.stderr)
        return False


def follow_file(path):
    f, ino = None, None
    while True:
        try:
            st = os.stat(path)
        except FileNotFoundError:
            time.sleep(1)
            continue
        if f is None or st.st_ino != ino or st.st_size < f.tell():
            first = f is None
            if f is not None:
                yield from f.readlines()
                f.close()
            f, ino = open(path, "rb"), st.st_ino
            if first:
                f.seek(0, os.SEEK_END)
        line = f.readline()
        if line:
            yield line
        else:
            time.sleep(0.5)


class Shipper:
    def __init__(self, url):
        self.url = url
        self.lock = threading.Lock()
        self.buf = []
        self.size = 0
        self.dropped = 0
        self.posts = []

    def add(self, line):
        if not ACCESS.match(line):
            return
        line = line.rstrip(b"\r\n")[:MAX_LINE] + b"\n"
        with self.lock:
            if self.size + len(line) > MAX_BATCH:
                self.dropped += 1
                return
            self.buf.append(line)
            self.size += len(line)

    def flush(self):
        now = time.monotonic()
        self.posts = [t for t in self.posts if now - t < 60]
        with self.lock:
            if not self.buf or len(self.posts) >= MAX_POSTS_PER_MIN:
                return
            data, self.buf, self.size = b"".join(self.buf), [], 0
            dropped, self.dropped = self.dropped, 0
        self.posts.append(now)
        post(self.url, data)
        if dropped:
            print(f"ship-access-log: dropped {dropped} lines over the rate limit", file=sys.stderr)

    def loop(self):
        while True:
            time.sleep(FLUSH_SECONDS)
            self.flush()


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: JR_LOGS_URL_FILE=... ship-access-log.py <access.log | ->")
    url = drain_url()
    if not url.startswith(("https://", "http://")):
        sys.exit("ship-access-log: no drain address (JR_LOGS_URL_FILE or JR_LOGS_URL)")
    s = Shipper(url)
    threading.Thread(target=s.loop, daemon=True).start()
    src = sys.stdin.buffer if sys.argv[1] == "-" else follow_file(sys.argv[1])
    for line in src:
        s.add(line)
    s.flush()  # stdin closed (docker logs ended): send what is left, then exit so the wrapper restarts


if __name__ == "__main__":
    main()
