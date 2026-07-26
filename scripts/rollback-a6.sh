#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

a6_host="${A6_HOST:-humble}"
target_name="${1:-}"

if [[ ! "$target_name" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Usage: scripts/rollback-a6.sh <exact-40-character-release-sha>" >&2
  exit 2
fi

ssh "$a6_host" "bash -s -- '$target_name'" <<'REMOTE'
set -euo pipefail

target_name="$1"
service_root="/home/humble/services/carboncaste-web"
target="$service_root/releases/$target_name"
current="$service_root/current"
next_link="$service_root/.rollback-next-$$"
unit="$HOME/.config/systemd/user/carboncaste-web.service"
previous_target=""

exec 9>"$service_root/deploy.lock"
if ! flock -n 9; then
  echo "Another carboncaste-web deployment or rollback holds the host lock." >&2
  exit 75
fi
test -d "$target"
test -f "$target/server/static-server.mjs"
test -f "$target/deploy/carboncaste-web.service"
test "$(cat "$target/REVISION")" = "$target_name"
previous_target="$(readlink "$current")"
previous_revision="$(cat "$current/REVISION")"
[[ "$previous_revision" =~ ^[0-9a-f]{40}$ ]]
test "$previous_revision" != "$target_name"
test "$previous_target" = "releases/$previous_revision"
test "$previous_revision" = "$(basename "$previous_target")"

rollback_failed() {
  status="${1:-1}"
  trap - ERR INT TERM HUP
  set +e
  rm -f "$next_link"
  if [[ -n "$previous_target" ]]; then
    ln -s "$previous_target" "$next_link"
    mv -Tf "$next_link" "$current"
    install -m 0644 "$current/deploy/carboncaste-web.service" "$unit"
    systemctl --user daemon-reload
    systemctl --user restart carboncaste-web.service
  fi
  exit "$status"
}
trap 'rollback_failed $?' ERR
trap 'rollback_failed 130' INT
trap 'rollback_failed 143' TERM
trap 'rollback_failed 129' HUP

ln -s "releases/$target_name" "$next_link"
mv -Tf "$next_link" "$current"
install -m 0644 "$current/deploy/carboncaste-web.service" "$unit"
systemctl --user daemon-reload
systemctl --user restart carboncaste-web.service
curl -fsS --max-time 10 http://127.0.0.1:8126/ >/dev/null
curl -fsS --max-time 10 http://127.0.0.1:8126/api/iceland26/health \
  | grep -q '"ready":true'
login_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
  -H 'Content-Type: application/json' \
  --data '{"code":"rollback-readiness-invalid-code"}' \
  http://127.0.0.1:8126/api/iceland26/login)"
test "$login_status" = 401
api_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
  http://127.0.0.1:8126/api/iceland26)"
test "$api_status" = 401
systemctl --user is-active --quiet carboncaste-web.service
test "$(readlink "$current")" = "releases/$target_name"
test "$(cat "$current/REVISION")" = "$target_name"

trap - ERR INT TERM HUP
echo "Rolled back carboncaste-web: previous=$previous_target current=releases/$target_name"
REMOTE
