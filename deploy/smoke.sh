#!/usr/bin/env bash
# Checks a deployed JaagteRaho from the outside. Usage: ./smoke.sh https://<api-domain> https://<site-domain>
# Runs one real break-it run (one sandbox diagnosis may be spent).
set -u
API="${1:?watcher URL, e.g. https://api.example.com}"
SITE="${2:?website URL, e.g. https://jaagteraho.vercel.app}"
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  ok   $1"; pass=$((pass+1)); else echo "  FAIL $1 (expected $3, got $2)"; fail=$((fail+1)); fi; }

echo "Watcher: $API"
check "health answers" "$(curl -s -o /dev/null -w '%{http_code}' "$API/health")" 200
check "HTTPS certificate valid" "$(curl -s -o /dev/null -w '%{ssl_verify_result}' "$API/health")" 0
check "evidence is public" "$(curl -s -o /dev/null -w '%{http_code}' "$API/public/evidence")" 200
check "CORS allows the website" "$(curl -s -o /dev/null -D - -X OPTIONS -H "Origin: $SITE" -H 'Access-Control-Request-Method: POST' "$API/public/break" | grep -ci "access-control-allow-origin: $SITE")" 1
check "intake refuses a wrong key" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'X-Sentry-Auth: Sentry sentry_key=wrong' --data-binary '{}' "$API/api/1/envelope/")" 403
check "owner page refuses an unsigned link" "$(curl -s -o /dev/null -w '%{http_code}' "$API/owner/incident/1?e=1&s=x")" 403
check "bad input is refused, not a crash" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d 'null' "$API/public/break")" 400
check "log drain refuses a wrong key" "$(curl -s -o /dev/null -w '%{http_code}' -X POST --data-binary 'x' "$API/logs/1/wrong")" 403
check "GitHub setup refuses an unsigned return" "$(curl -s -o /dev/null -w '%{http_code}' "$API/github/setup?installation_id=1&state=x&code=y")" 400
check "connect without consent is refused" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"session":"smoketest1","name":"x1"}' "$API/public/connect")" 400

SESSION="smoke$(date +%s)$RANDOM"
FEED=$(mktemp)
curl -sN --max-time 90 -H "Origin: $SITE" "$API/public/feed/$SESSION" > "$FEED" &
FEED_PID=$!
sleep 1
BODY=$(printf '{"session":"%s","flow":"submit","exam":true}' "$SESSION")
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "Origin: $SITE" --data "$BODY" "$API/public/break")
check "break-it run starts" "$code" 200
for _ in $(seq 1 60); do grep -q "^event: fix" "$FEED" && break; sleep 1; done
for e in error decision cause fix; do check "live feed sends '$e'" "$(grep -c "^event: $e$" "$FEED" | tr -d ' ')" 1; done
kill "$FEED_PID" 2>/dev/null; rm -f "$FEED"

echo "Website: $SITE"
check "home page" "$(curl -s -o /dev/null -w '%{http_code}' "$SITE/")" 200
check "paste page" "$(curl -s -o /dev/null -w '%{http_code}' "$SITE/paste")" 200
check "evidence page" "$(curl -s -o /dev/null -w '%{http_code}' "$SITE/evidence")" 200
check "share image" "$(curl -s -o /dev/null -w '%{http_code}' "$SITE/opengraph-image")" 200
check "site points at this watcher" "$(curl -s "$SITE/" | grep -c "watcher not reachable")" 0

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
