#!/usr/bin/env python3
"""Sends a web server's access log to JaagteRaho's log drain, so slow vulnerability scans are noticed
(watcher/src/intake/slowscan.ts). Standard library only; run it next to nginx.

    JR_LOGS_URL=https://<api-host>/logs/<project-id>/<key> python3 ship-access-log.py /var/log/nginx/access.log

It follows the file like `tail -F` (survives log rotation), and every 10 seconds POSTs the new lines
(at most 512 KB per request). It starts at the end of the file: old lines are never sent.
The drain keeps nothing from ordinary requests; see slowscan.ts for what it counts.
Keep JR_LOGS_URL in an env file with mode 600: the key in it lets anyone post to the drain.
"""

import os
import sys
import time
import urllib.request

FLUSH_SECONDS = 10
MAX_BATCH = 512 * 1024


def post(url, data):
    req = urllib.request.Request(url, data=data, method="POST", headers={"Content-Type": "text/plain"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            r.read()
    except Exception as e:  # the watcher being down must never stop or slow the web server
        print(f"ship-access-log: post failed: {type(e).__name__}", file=sys.stderr)


def follow(path):
    f, ino = None, None
    while True:
        try:
            st = os.stat(path)
        except FileNotFoundError:
            time.sleep(1)
            continue
        if f is None or st.st_ino != ino or st.st_size < f.tell():
            if f is not None:
                rest = f.read()
                if rest:
                    yield rest
                f.close()
            first = f is None
            f, ino = open(path, "rb"), st.st_ino
            if first:
                f.seek(0, os.SEEK_END)
        chunk = f.read(MAX_BATCH)
        yield chunk or b""
        if not chunk:
            time.sleep(1)


def main():
    url = os.environ.get("JR_LOGS_URL")
    if not url or len(sys.argv) != 2:
        sys.exit("usage: JR_LOGS_URL=... ship-access-log.py <access.log>")
    buf, last = b"", time.monotonic()
    for chunk in follow(sys.argv[1]):
        buf += chunk
        if buf and (len(buf) >= MAX_BATCH or time.monotonic() - last >= FLUSH_SECONDS):
            cut = buf.rfind(b"\n") + 1  # only whole lines
            if cut:
                post(url, buf[:cut])
                buf = buf[cut:]
            last = time.monotonic()


if __name__ == "__main__":
    main()
