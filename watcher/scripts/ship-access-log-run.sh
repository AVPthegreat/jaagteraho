#!/bin/sh
# Runs ship-access-log.py against a Docker nginx container's stdout, low priority, one copy only, restarting
# after a short pause if `docker logs` ends (container recreated). For the host's crontab:
#   @reboot /home/ubuntu/jr-ship/ship-access-log-run.sh oj-nginx >/dev/null 2>&1
# Needs: the user in the docker group, python3, flock; the drain address in ~/.jr-drain (mode 600).
# Stop: pkill -f ship-access-log-run.sh; pkill -f ship-access-log.py; remove the crontab line.
set -u
NAME=${1:-oj-nginx}
DIR=$(cd "$(dirname "$0")" && pwd)
export JR_LOGS_URL_FILE=${JR_LOGS_URL_FILE:-$HOME/.jr-drain}
exec 9>"$HOME/.jr-ship.lock"
flock -n 9 || exit 0 # another copy runs
while :; do
  # Only stdout (the access log); stderr (nginx's error log) is discarded. --tail 0: never resend old lines.
  docker logs -f --tail 0 "$NAME" 2>/dev/null | nice -n 19 ionice -c3 python3 "$DIR/ship-access-log.py" - 2>>"$HOME/.jr-ship.err"
  tail -n 200 "$HOME/.jr-ship.err" >"$HOME/.jr-ship.err.tmp" 2>/dev/null && mv "$HOME/.jr-ship.err.tmp" "$HOME/.jr-ship.err"
  sleep 15
done
