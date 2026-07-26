#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

a6_host="${A6_HOST:-humble}"
target_name="${1:-}"

if [[ ! "$target_name" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ || "$target_name" == *..* ]]; then
  echo "Usage: scripts/rollback-a6.sh <exact-release-directory-name>" >&2
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

test -d "$target"
test -f "$target/server/static-server.mjs"
test -f "$target/deploy/carboncaste-web.service"
previous_target="$(readlink "$current")"

rollback_failed() {
  status="${1:-1}"
  trap - ERR INT TERM
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

ln -s "releases/$target_name" "$next_link"
mv -Tf "$next_link" "$current"
install -m 0644 "$current/deploy/carboncaste-web.service" "$unit"
systemctl --user daemon-reload
systemctl --user restart carboncaste-web.service
curl -fsS --max-time 10 http://127.0.0.1:8126/ >/dev/null
systemctl --user is-active --quiet carboncaste-web.service

trap - ERR INT TERM
echo "Rolled back carboncaste-web: previous=$previous_target current=releases/$target_name"
REMOTE
