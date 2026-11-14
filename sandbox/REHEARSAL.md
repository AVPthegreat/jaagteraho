# Rehearsal: can JaagteRaho slow down the app it watches?

Run on 13 Nov 2026, 03:15 IST, on a MacBook, with `python rehearse.py "<DSN>"`. The twin (Django 5.1, sentry-sdk 2.71.0, the same SDK version as Faurus) ran under gunicorn with 2 workers. Each run sent 60 requests that fail (and so send an error report) and 60 that succeed.

| JaagteRaho state | Failing requests, median | p95 | Normal requests, median | p95 |
|---|---|---|---|---|
| Not connected (baseline) | 0.4 ms | 1.3 ms | 0.3 ms | 0.6 ms |
| Up | 1.3 ms | 2.3 ms | 0.5 ms | 0.6 ms |
| Down (connection refused) | 1.2 ms | 1.8 ms | 0.5 ms | 0.7 ms |
| Hanging for 30 seconds | 1.1 ms | 1.6 ms | 0.4 ms | 0.5 ms |

**Result:** reporting adds about one millisecond, and only to requests that already fail, because the SDK builds the event in the request and sends it from a background thread. Whether JaagteRaho is up, down or hanging makes no measurable difference to the app. Requests that succeed are not touched.

**What this does not cover:** a production server under heavy load, or the SDK's in-memory queue filling during a long outage (the SDK drops events when its queue is full rather than blocking). Faurus is connected backend-only, in learn mode first, with a rehearsed rollback: unset `SENTRY_DSN` and restart the same services.
