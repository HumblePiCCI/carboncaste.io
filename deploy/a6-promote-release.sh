#!/usr/bin/env bash
set -euo pipefail

incoming="${1:-}"
commit="${2:-}"
service_root="/home/humble/services/carboncaste-web"
releases="$service_root/releases"
release="$releases/$commit"
current="$service_root/current"
state_root="$service_root/state"
config_root="$service_root/config"
env_file="$config_root/iceland26.env"
unit="$HOME/.config/systemd/user/carboncaste-web.service"
canary_port=18128
canary_state=""
canary_log=""
canary_pid=""
previous_target=""
unit_backup=""
promoted=0
release_created=0
incoming_owned=1

if ! [[ "$commit" =~ ^[0-9a-f]{40}$ ]]; then
  if [[ "$incoming" == "$service_root"/incoming-* && -d "$incoming" ]]; then
    rm -rf -- "$incoming"
  fi
  echo "Promotion requires a full commit SHA." >&2
  exit 2
fi
if [[ "$incoming" != "$service_root"/incoming-* || ! -d "$incoming" ]]; then
  echo "Incoming release path is outside the release staging boundary." >&2
  exit 2
fi
if [[ -e "$release" ]]; then
  rm -rf -- "$incoming"
  echo "Immutable release already exists: $release" >&2
  exit 2
fi
if [[ ! -s "$env_file" ]]; then
  rm -rf -- "$incoming"
  echo "Required mode-0600 Iceland access environment is missing." >&2
  exit 2
fi

cleanup_canary() {
  if [[ -n "$canary_pid" ]] && kill -0 "$canary_pid" 2>/dev/null; then
    kill "$canary_pid"
    wait "$canary_pid" 2>/dev/null || true
  fi
  [[ -z "$canary_state" ]] || rm -f "$canary_state"
  [[ -z "$canary_log" ]] || rm -f "$canary_log"
}

rollback_promotion() {
  local status="${1:-1}"
  trap - ERR INT TERM
  set +e
  cleanup_canary
  if [[ "$promoted" -eq 1 && -n "$previous_target" ]]; then
    failed_link="$service_root/.failed-rollback-$$"
    rm -f "$failed_link"
    ln -s "$previous_target" "$failed_link"
    mv -Tf "$failed_link" "$current"
    if [[ -n "$unit_backup" && -f "$unit_backup" ]]; then
      install -m 0644 "$unit_backup" "$unit"
    else
      install -m 0644 "$current/deploy/carboncaste-web.service" "$unit"
    fi
    systemctl --user daemon-reload
    systemctl --user restart carboncaste-web.service || true
  fi
  restored_target="$(readlink "$current" 2>/dev/null || true)"
  release_is_detached=0
  if [[ "$promoted" -eq 0 || "$restored_target" == "$previous_target" ]]; then
    release_is_detached=1
  fi
  if [[ "$release_created" -eq 1 && "$release_is_detached" -eq 1 && -d "$release" ]]; then
    rm -rf -- "$release"
  fi
  if [[ "$incoming_owned" -eq 1 && -d "$incoming" ]]; then
    rm -rf -- "$incoming"
  fi
  exit "$status"
}
trap 'rollback_promotion $?' ERR
trap 'rollback_promotion 130' INT
trap 'rollback_promotion 143' TERM

mkdir -p "$releases" "$state_root" "$config_root" "$HOME/.config/systemd/user"
chmod 0700 "$state_root" "$config_root"
chmod 0600 "$env_file"
printf '%s\n' "$commit" > "$incoming/REVISION"
chmod 0644 "$incoming/REVISION"

/home/humble/.hermes/node/bin/node --check "$incoming/server/static-server.mjs"
/home/humble/.hermes/node/bin/node --check "$incoming/server/iceland26-store.mjs"
(
  cd "$incoming"
  /home/humble/.hermes/node/bin/node scripts/check-site.mjs
  ICELAND26_TEST_PORT=18129 \
    /home/humble/.hermes/node/bin/node scripts/iceland26-api-test.mjs
)

if ss -ltn | grep -q ":$canary_port "; then
  echo "Canary port $canary_port is already occupied." >&2
  exit 1
fi
canary_state="$(mktemp "$state_root/.canary-state.XXXXXX")"
rm -f "$canary_state"
canary_log="$(mktemp /tmp/carboncaste-canary.XXXXXX.log)"
test_code="canary-only-code"
test_hash="$(printf '%s' "$test_code" | sha256sum | awk '{print $1}')"
CARBONCASTE_WEB_ROOT="$incoming" \
CARBONCASTE_WEB_HOST=127.0.0.1 \
CARBONCASTE_WEB_PORT="$canary_port" \
ICELAND26_DATA_PATH="$canary_state" \
ICELAND26_ACCESS_HASH="$test_hash" \
ICELAND26_SESSION_SECRET="canary-session-secret-that-is-longer-than-thirty-two-characters" \
ICELAND26_COOKIE_SECURE=false \
  /home/humble/.hermes/node/bin/node "$incoming/server/static-server.mjs" \
  >"$canary_log" 2>&1 &
canary_pid=$!

for _ in $(seq 1 80); do
  if curl -fsS --max-time 1 "http://127.0.0.1:$canary_port/" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$canary_pid" 2>/dev/null; then
    cat "$canary_log" >&2
    exit 1
  fi
  sleep 0.1
done
curl -fsS --max-time 5 "http://127.0.0.1:$canary_port/" >/dev/null
curl -fsS --max-time 5 "http://127.0.0.1:$canary_port/iceland26/access.html" \
  | grep -q 'The road is'
curl -fsS --max-time 5 "http://127.0.0.1:$canary_port/api/iceland26/health" \
  | grep -q '"ready":true'
api_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 \
  "http://127.0.0.1:$canary_port/api/iceland26")"
test "$api_status" = 401
cleanup_canary
canary_pid=""

if [[ -L "$current" ]]; then
  previous_target="$(readlink "$current")"
elif [[ -d "$current" ]]; then
  previous_revision="$(sed -n '1p' "$current/REVISION" 2>/dev/null || printf unknown)"
  legacy_name="legacy-$(date -u +%Y%m%dT%H%M%SZ)-$previous_revision"
  previous_target="releases/$legacy_name"
else
  echo "Current deployment path is missing." >&2
  exit 1
fi

if [[ -f "$unit" ]]; then
  unit_backup="$config_root/carboncaste-web.service.$(date -u +%Y%m%dT%H%M%SZ).bak"
  cp "$unit" "$unit_backup"
  chmod 0600 "$unit_backup"
fi

mv "$incoming" "$release"
incoming_owned=0
release_created=1

if [[ -d "$current" && ! -L "$current" ]]; then
  mv "$current" "$service_root/$previous_target"
  promoted=1
fi

next_link="$service_root/.current-next-$$"
ln -s "releases/$commit" "$next_link"
mv -Tf "$next_link" "$current"
promoted=1

install -m 0644 "$release/deploy/carboncaste-web.service" "$unit"
systemctl --user daemon-reload
systemctl --user restart carboncaste-web.service
curl -fsS --max-time 10 http://127.0.0.1:8126/ >/dev/null
curl -fsS --max-time 10 http://127.0.0.1:8126/iceland26/access.html \
  | grep -q 'The road is'
curl -fsS --max-time 10 http://127.0.0.1:8126/api/iceland26/health \
  | grep -q '"ready":true'
login_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
  -H 'Content-Type: application/json' \
  --data '{"code":"deployment-readiness-invalid-code"}' \
  http://127.0.0.1:8126/api/iceland26/login)"
test "$login_status" = 401
api_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
  http://127.0.0.1:8126/api/iceland26)"
test "$api_status" = 401
systemctl --user is-active --quiet carboncaste-web.service
test "$(cat "$current/REVISION")" = "$commit"

trap - ERR INT TERM
release_created=0
echo "Promoted carboncaste-web: previous=$previous_target current=releases/$commit"
