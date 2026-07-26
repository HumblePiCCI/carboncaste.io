#!/usr/bin/env bash
set -euo pipefail
umask 077

incoming="${1:-}"
commit="${2:-}"
expected_previous="${3:-}"
owner_token="${4:-}"
expected_tree="${5:-}"
expected_previous_tree="${6:-}"
expected_verifier_sha="${7:-}"
expected_incoming_identity="${8:-}"
service_root="/home/humble/services/carboncaste-web"
releases="$service_root/releases"
release="$releases/$commit"
previous_release="$releases/$expected_previous"
current="$service_root/current"
state_root="$service_root/state"
config_root="$service_root/config"
env_file="$config_root/iceland26.env"
lock_file="$service_root/deploy.lock"
unit="$HOME/.config/systemd/user/carboncaste-web.service"
node_bin="/home/humble/.hermes/node/bin/node"
canary_port=18128
canary_state=""
canary_log=""
canary_pid=""
previous_target="releases/$expected_previous"
current_mode=""
unit_backup=""
incoming_identity=""
current_directory_identity=""
release_identity=""
previous_candidate_identity=""
previous_release_identity=""
legacy_current_identity=""
verifier_path="$incoming/scripts/verify-release-tree.mjs"
previous_candidate="$releases/.previous-${expected_previous}-${owner_token}"
legacy_current="$service_root/.legacy-current-${expected_previous}-${owner_token}"
next_link="$service_root/.current-next-${owner_token}"
release_created=0
previous_candidate_created=0
previous_release_created=0
legacy_created=0
promoted=0
service_touched=0

exact_line_file() {
  local file="$1"
  local value="$2"
  [[ -f "$file"
    && ! -L "$file"
    && "$(stat -Lc '%h' "$file")" == 1 ]] || return 1
  printf '%s\n' "$value" | cmp -s - "$file"
}

path_is_owned_staging() {
  [[ "$(dirname -- "$incoming")" == "$service_root"
    && "$(basename -- "$incoming")" =~ ^incoming-[0-9a-f]{40}-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{32}$
    && -d "$incoming"
    && ! -L "$incoming"
    && -f "$incoming/.staging-owner"
    && ! -L "$incoming/.staging-owner" ]] \
    && exact_line_file "$incoming/.staging-owner" "$owner_token"
}

assert_incoming_owned() {
  path_is_owned_staging || return 1
  [[ -n "$incoming_identity"
    && "$(stat -Lc '%d:%i' "$incoming")" == "$incoming_identity" ]]
}

cleanup_owned_incoming() {
  if assert_incoming_owned; then
    rm -rf -- "$incoming"
  elif [[ -e "$incoming" || -L "$incoming" ]]; then
    return 1
  fi
}

if ! [[ "$commit" =~ ^[0-9a-f]{40}$
    && "$expected_previous" =~ ^[0-9a-f]{40}$
    && "$commit" != "$expected_previous"
    && "$owner_token" =~ ^[0-9a-f]{32}$
    && "$expected_tree" =~ ^[0-9a-f]{40}$
    && "$expected_previous_tree" =~ ^[0-9a-f]{40}$
    && "$expected_verifier_sha" =~ ^[0-9a-f]{64}$
    && "$expected_incoming_identity" =~ ^[0-9]+:[0-9]+$ ]]; then
  echo "Promotion requires exact commit, tree, verifier, and staging-owner identities." >&2
  exit 2
fi

expected_incoming_pattern="^incoming-${commit}-[0-9]{8}T[0-9]{6}Z-${owner_token}$"
if ! path_is_owned_staging \
    || ! [[ "$(basename -- "$incoming")" =~ $expected_incoming_pattern ]]; then
  echo "Incoming release path is outside the owned release staging boundary." >&2
  exit 2
fi
incoming_identity="$(stat -Lc '%d:%i' "$incoming")"
if [[ "$incoming_identity" != "$expected_incoming_identity" ]]; then
  echo "Incoming staging device/inode does not match the creating deployment." >&2
  exit 2
fi

if ! exec 9>"$lock_file"; then
  cleanup_owned_incoming
  echo "Could not open the carboncaste-web deployment lock." >&2
  exit 1
fi
if ! flock -n 9; then
  cleanup_owned_incoming
  echo "Another carboncaste-web deployment or rollback holds the host lock." >&2
  exit 75
fi
if ! assert_incoming_owned; then
  echo "Incoming staging ownership changed before the deployment lock was acquired." >&2
  exit 2
fi
if [[ -e "$release" || -L "$release"
    || -e "$previous_candidate" || -L "$previous_candidate"
    || -e "$legacy_current" || -L "$legacy_current"
    || -e "$next_link" || -L "$next_link" ]]; then
  cleanup_owned_incoming
  echo "A release or task-owned transition path already exists." >&2
  exit 2
fi
if [[ ! -s "$env_file" ]]; then
  cleanup_owned_incoming
  echo "Required mode-0600 Iceland access environment is missing." >&2
  exit 2
fi
if [[ ! -f "$incoming/EXPECTED_NEW_TREE_MANIFEST"
    || -L "$incoming/EXPECTED_NEW_TREE_MANIFEST"
    || ! -f "$incoming/EXPECTED_PREVIOUS_TREE_MANIFEST"
    || -L "$incoming/EXPECTED_PREVIOUS_TREE_MANIFEST" ]]; then
  cleanup_owned_incoming
  echo "Exact Git-tree manifests are missing from the owned staging directory." >&2
  exit 2
fi

assert_verifier() {
  [[ -f "$verifier_path"
    && ! -L "$verifier_path"
    && "$(sha256sum "$verifier_path" | awk '{print $1}')" == "$expected_verifier_sha" ]]
}

verify_release_tree() {
  local root="$1"
  local revision="$2"
  local tree="$3"
  local manifest="$4"
  assert_verifier
  "$node_bin" "$verifier_path" "$root" "$revision" "$tree" "$manifest"
}

assert_release_read_only() {
  [[ -z "$(find "$1" \( -type f -o -type d \) -perm /222 -print -quit)" ]]
}

make_release_read_only() {
  find "$1" -type f -perm /111 -exec chmod 0555 {} +
  find "$1" -type f ! -perm /111 -exec chmod 0444 {} +
  find "$1" -type d -exec chmod 0555 {} +
}

verify_release_receipts() {
  local root="$1"
  local revision="$2"
  local tree="$3"
  local external_manifest="$4"
  local phase="${5:-published}"
  exact_line_file "$root/REVISION" "$revision"
  exact_line_file "$root/RELEASE_TREE" "$tree"
  [[ -f "$root/RELEASE_TREE_MANIFEST"
    && ! -L "$root/RELEASE_TREE_MANIFEST"
    && "$(stat -Lc '%h' "$root/RELEASE_TREE_MANIFEST")" == 1 ]]
  if [[ "$phase" == "published" ]]; then
    [[ ! -e "$root/.staging-owner" && ! -L "$root/.staging-owner"
      && ! -e "$root/EXPECTED_NEW_TREE_MANIFEST"
      && ! -L "$root/EXPECTED_NEW_TREE_MANIFEST"
      && ! -e "$root/EXPECTED_PREVIOUS_TREE_MANIFEST"
      && ! -L "$root/EXPECTED_PREVIOUS_TREE_MANIFEST" ]]
  elif [[ "$phase" == "staging" ]]; then
    exact_line_file "$root/.staging-owner" "$owner_token"
    [[ ! -e "$root/EXPECTED_NEW_TREE_MANIFEST"
      && ! -L "$root/EXPECTED_NEW_TREE_MANIFEST"
      && ! -e "$root/EXPECTED_PREVIOUS_TREE_MANIFEST"
      && ! -L "$root/EXPECTED_PREVIOUS_TREE_MANIFEST" ]]
  else
    return 1
  fi
  cmp -s -- "$root/RELEASE_TREE_MANIFEST" "$external_manifest"
  verify_release_tree "$root" "$revision" "$tree" "$external_manifest"
}

verify_current_release() {
  local marker target
  marker="$(sed -n '1p' "$current/REVISION" 2>/dev/null)" || return 1
  if [[ -L "$current" ]]; then
    target="$(readlink "$current")" || return 1
    [[ "$marker" == "$expected_previous"
      && "$target" == "$previous_target"
      && -d "$previous_release" ]] || return 1
    verify_release_receipts \
      "$previous_release" \
      "$expected_previous" \
      "$expected_previous_tree" \
      "$incoming/EXPECTED_PREVIOUS_TREE_MANIFEST" || return 1
    assert_release_read_only "$previous_release" || return 1
    current_mode="symlink"
  elif [[ -d "$current" ]]; then
    [[ "$marker" =~ ^[0-9a-f]{7,40}$
      && "${expected_previous:0:${#marker}}" == "$marker"
      && ! -e "$previous_release"
      && ! -L "$previous_release" ]] || return 1
    verify_release_tree \
      "$current" \
      "$expected_previous" \
      "$expected_previous_tree" \
      "$incoming/EXPECTED_PREVIOUS_TREE_MANIFEST" || return 1
    current_directory_identity="$(stat -Lc '%d:%i' "$current")"
    current_mode="directory"
  else
    return 1
  fi
}

cleanup_canary() {
  local cleanup_status=0
  if [[ -n "$canary_pid" ]]; then
    if kill -0 "$canary_pid" 2>/dev/null; then
      kill "$canary_pid" 2>/dev/null || cleanup_status=1
      for _ in $(seq 1 30); do
        kill -0 "$canary_pid" 2>/dev/null || break
        sleep 0.1
      done
      if kill -0 "$canary_pid" 2>/dev/null; then
        kill -KILL "$canary_pid" 2>/dev/null || cleanup_status=1
      fi
    fi
    wait "$canary_pid" 2>/dev/null || true
    kill -0 "$canary_pid" 2>/dev/null && cleanup_status=1
  fi
  canary_pid=""
  [[ -z "$canary_state" ]] || rm -f -- "$canary_state" || cleanup_status=1
  [[ -z "$canary_log" ]] || rm -f -- "$canary_log" || cleanup_status=1
  canary_state=""
  canary_log=""
  return "$cleanup_status"
}

rollback_promotion() {
  local status="${1:-1}"
  local current_target=""
  local next_target=""
  local restore_needed=0
  local restore_status=0
  local cleanup_status=0
  trap - ERR INT TERM HUP
  set +e
  cleanup_canary || cleanup_status=1

  if [[ -e "$next_link" || -L "$next_link" ]]; then
    next_target="$(readlink "$next_link" 2>/dev/null || true)"
    if [[ -L "$next_link"
        && ( "$next_target" == "releases/$commit"
          || "$next_target" == "$previous_target" ) ]]; then
      rm -f -- "$next_link" || restore_status=1
    else
      restore_status=1
    fi
  fi

  current_target="$(readlink "$current" 2>/dev/null || true)"
  if [[ "$current_target" != "$previous_target"
      && ( ( -d "$previous_release" && ! -L "$previous_release" )
        || ( -d "$legacy_current" && ! -L "$legacy_current" ) ) ]]; then
    if [[ -d "$previous_release" && ! -L "$previous_release" ]]; then
      if [[ -L "$current" || ! -e "$current" ]]; then
        if [[ "$restore_status" -eq 0 ]] \
            && ln -s "$previous_target" "$next_link" \
            && [[ "$(readlink "$next_link" 2>/dev/null || true)" == "$previous_target" ]] \
            && mv -Tf "$next_link" "$current"; then
          restore_needed=1
        else
          restore_status=1
        fi
      elif [[ -d "$current"
          && ! -L "$current"
          && "$current_mode" == "directory" ]]; then
        :
      else
        restore_status=1
      fi
    elif [[ ! -e "$current"
        && -n "$legacy_current_identity"
        && -d "$legacy_current"
        && ! -L "$legacy_current"
        && "$(stat -Lc '%d:%i' "$legacy_current")" == "$legacy_current_identity" ]]; then
      if [[ "$restore_status" -eq 0 ]] \
          && mv -T "$legacy_current" "$current"; then
        legacy_created=0
        restore_needed=1
      else
        restore_status=1
      fi
    else
      restore_status=1
    fi
  fi

  current_target="$(readlink "$current" 2>/dev/null || true)"
  if [[ -L "$current" ]]; then
    [[ "$current_target" == "$previous_target" ]] || restore_status=1
  elif [[ "$current_mode" == "directory"
      && -n "$current_directory_identity"
      && -d "$current"
      && ! -L "$current"
      && "$(stat -Lc '%d:%i' "$current")" == "$current_directory_identity" ]]; then
    :
  else
    restore_status=1
  fi

  if [[ "$restore_status" -eq 0
      && ( "$restore_needed" -eq 1 || "$service_touched" -eq 1 ) ]]; then
    if [[ -n "$unit_backup" && -f "$unit_backup" ]]; then
      install -m 0644 "$unit_backup" "$unit" || restore_status=1
    elif [[ -f "$current/deploy/carboncaste-web.service" ]]; then
      install -m 0644 "$current/deploy/carboncaste-web.service" "$unit" || restore_status=1
    else
      restore_status=1
    fi
    systemctl --user daemon-reload || restore_status=1
    systemctl --user restart carboncaste-web.service || restore_status=1
    if [[ ! -L "$current"
        || "$(readlink "$current")" != "$previous_target" ]] \
        || ! exact_line_file "$current/REVISION" "$expected_previous"; then
      restore_status=1
    fi
    systemctl --user is-active --quiet carboncaste-web.service || restore_status=1
    curl -fsS --max-time 10 http://127.0.0.1:8126/api/iceland26/health \
      | grep -q '"ready":true' || restore_status=1
    if [[ -d "$previous_release" && ! -L "$previous_release" ]]; then
      verify_release_receipts \
        "$previous_release" \
        "$expected_previous" \
        "$expected_previous_tree" \
        "$previous_release/RELEASE_TREE_MANIFEST" || restore_status=1
      assert_release_read_only "$previous_release" || restore_status=1
    else
      restore_status=1
    fi
  fi

  if [[ "$restore_status" -ne 0 ]]; then
    echo "CRITICAL: failed promotion could not prove the prior A6 release restored; transition artifacts were preserved." >&2
    echo "Preserved paths: $release $previous_release $legacy_current $incoming" >&2
    exit 70
  fi

  current_target="$(readlink "$current" 2>/dev/null || true)"
  if [[ -e "$release" || -L "$release" ]]; then
    if [[ "$current_target" != "releases/$commit"
        && -n "$release_identity"
        && -d "$release"
        && ! -L "$release"
        && "$(stat -Lc '%d:%i' "$release")" == "$release_identity" ]] \
        && { [[ "$release_created" -eq 1 ]]
          || exact_line_file "$release/.staging-owner" "$owner_token"; }; then
      chmod -R u+w -- "$release" 2>/dev/null || cleanup_status=1
      rm -rf -- "$release" || cleanup_status=1
    elif [[ "$release_created" -eq 1 ]]; then
      cleanup_status=1
    fi
  fi
  cleanup_owned_incoming || cleanup_status=1

  if [[ "$previous_candidate_created" -eq 1
      && ( -e "$previous_candidate" || -L "$previous_candidate" ) ]]; then
    if [[ -n "$previous_candidate_identity"
        && -d "$previous_candidate"
        && ! -L "$previous_candidate"
        && "$(stat -Lc '%d:%i' "$previous_candidate")" == "$previous_candidate_identity" ]]; then
      chmod -R u+w -- "$previous_candidate" 2>/dev/null || cleanup_status=1
      rm -rf -- "$previous_candidate" || cleanup_status=1
    else
      cleanup_status=1
    fi
  fi
  if [[ "$previous_release_created" -eq 1
      && ! -L "$current"
      && ( -e "$previous_release" || -L "$previous_release" ) ]]; then
    if [[ -n "$previous_release_identity"
        && -d "$previous_release"
        && ! -L "$previous_release"
        && "$(stat -Lc '%d:%i' "$previous_release")" == "$previous_release_identity" ]]; then
      chmod -R u+w -- "$previous_release" 2>/dev/null || cleanup_status=1
      rm -rf -- "$previous_release" || cleanup_status=1
    else
      cleanup_status=1
    fi
  fi
  if [[ "$legacy_created" -eq 1
      && ( -e "$legacy_current" || -L "$legacy_current" ) ]]; then
    if [[ -n "$legacy_current_identity"
        && -d "$legacy_current"
        && ! -L "$legacy_current"
        && "$(stat -Lc '%d:%i' "$legacy_current")" == "$legacy_current_identity" ]]; then
      chmod -R u+w -- "$legacy_current" 2>/dev/null || cleanup_status=1
      rm -rf -- "$legacy_current" || cleanup_status=1
    else
      cleanup_status=1
    fi
  fi
  if [[ -n "$unit_backup" && ( -e "$unit_backup" || -L "$unit_backup" ) ]]; then
    rm -f -- "$unit_backup" || cleanup_status=1
  fi
  if [[ "$cleanup_status" -ne 0 ]]; then
    echo "CRITICAL: prior A6 release is restored, but task-owned promotion artifacts could not be fully cleaned." >&2
    exit 71
  fi
  exit "$status"
}
trap 'rollback_promotion $?' ERR
trap 'rollback_promotion 130' INT
trap 'rollback_promotion 143' TERM
trap 'rollback_promotion 129' HUP

if ! verify_release_tree \
    "$incoming" \
    "$commit" \
    "$expected_tree" \
    "$incoming/EXPECTED_NEW_TREE_MANIFEST"; then
  echo "Incoming A6 release does not match the exact expected Git tree." >&2
  rollback_promotion 2
fi
if ! verify_current_release; then
  echo "Current A6 release does not match exact expected commit $expected_previous." >&2
  rollback_promotion 2
fi

mkdir -p "$releases" "$state_root" "$config_root" "$HOME/.config/systemd/user"
chmod 0700 "$state_root" "$config_root"
chmod 0600 "$env_file"

"$node_bin" --check "$incoming/server/static-server.mjs"
"$node_bin" --check "$incoming/server/iceland26-store.mjs"
(
  cd "$incoming"
  "$node_bin" scripts/check-site.mjs
  ICELAND26_TEST_PORT=18129 "$node_bin" scripts/iceland26-api-test.mjs
)

if ss -ltn | grep -q ":$canary_port "; then
  echo "Canary port $canary_port is already occupied." >&2
  rollback_promotion 1
fi
canary_state="$(mktemp "$state_root/.canary-state.XXXXXX")"
rm -f -- "$canary_state"
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
  "$node_bin" "$incoming/server/static-server.mjs" >"$canary_log" 2>&1 &
canary_pid=$!

for _ in $(seq 1 80); do
  if curl -fsS --max-time 1 "http://127.0.0.1:$canary_port/" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$canary_pid" 2>/dev/null; then
    cat "$canary_log" >&2
    rollback_promotion 1
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

assert_incoming_owned
verify_release_tree \
  "$incoming" \
  "$commit" \
  "$expected_tree" \
  "$incoming/EXPECTED_NEW_TREE_MANIFEST"
verify_current_release

if [[ "$current_mode" == "directory" ]]; then
  mkdir -m 0700 -- "$previous_candidate"
  previous_candidate_identity="$(stat -Lc '%d:%i' "$previous_candidate")"
  previous_candidate_created=1
  cp -a -- "$current"/. "$previous_candidate"/
  rm -f -- \
    "$previous_candidate/.staging-owner" \
    "$previous_candidate/EXPECTED_NEW_TREE_MANIFEST" \
    "$previous_candidate/EXPECTED_PREVIOUS_TREE_MANIFEST" \
    "$previous_candidate/RELEASE_TREE" \
    "$previous_candidate/RELEASE_TREE_MANIFEST"
  cp -- "$incoming/EXPECTED_PREVIOUS_TREE_MANIFEST" \
    "$previous_candidate/RELEASE_TREE_MANIFEST"
  printf '%s\n' "$expected_previous_tree" > "$previous_candidate/RELEASE_TREE"
  printf '%s\n' "$expected_previous" > "$previous_candidate/REVISION"
  chmod 0600 \
    "$previous_candidate/RELEASE_TREE_MANIFEST" \
    "$previous_candidate/RELEASE_TREE" \
    "$previous_candidate/REVISION"
  verify_release_receipts \
    "$previous_candidate" \
    "$expected_previous" \
    "$expected_previous_tree" \
    "$incoming/EXPECTED_PREVIOUS_TREE_MANIFEST"
  make_release_read_only "$previous_candidate"
  assert_release_read_only "$previous_candidate"
  verify_release_receipts \
    "$previous_candidate" \
    "$expected_previous" \
    "$expected_previous_tree" \
    "$incoming/EXPECTED_PREVIOUS_TREE_MANIFEST"
fi

mv -- "$incoming/EXPECTED_NEW_TREE_MANIFEST" "$incoming/RELEASE_TREE_MANIFEST"
rm -f -- "$incoming/EXPECTED_PREVIOUS_TREE_MANIFEST"
printf '%s\n' "$expected_tree" > "$incoming/RELEASE_TREE"
printf '%s\n' "$commit" > "$incoming/REVISION"
chmod 0600 \
  "$incoming/RELEASE_TREE_MANIFEST" \
  "$incoming/RELEASE_TREE" \
  "$incoming/REVISION"
verify_release_receipts \
  "$incoming" \
  "$commit" \
  "$expected_tree" \
  "$incoming/RELEASE_TREE_MANIFEST" \
  staging

if [[ -f "$unit" ]]; then
  unit_backup="$config_root/carboncaste-web.service.${owner_token}.bak"
  cp "$unit" "$unit_backup"
  chmod 0600 "$unit_backup"
fi

assert_incoming_owned
release_identity="$incoming_identity"
release_created=1
mv -T -- "$incoming" "$release"
verifier_path="$release/scripts/verify-release-tree.mjs"
rm -f -- "$release/.staging-owner"
make_release_read_only "$release"
assert_release_read_only "$release"
verify_release_receipts \
  "$release" \
  "$commit" \
  "$expected_tree" \
  "$release/RELEASE_TREE_MANIFEST"

if [[ "$current_mode" == "directory" ]]; then
  previous_release_identity="$previous_candidate_identity"
  previous_release_created=1
  mv -T -- "$previous_candidate" "$previous_release"
  previous_candidate_created=0
  legacy_current_identity="$(stat -Lc '%d:%i' "$current")"
  legacy_created=1
  mv -T -- "$current" "$legacy_current"
fi

ln -s "releases/$commit" "$next_link"
promoted=1
mv -Tf "$next_link" "$current"

install -m 0644 "$release/deploy/carboncaste-web.service" "$unit"
systemctl --user daemon-reload
service_touched=1
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
exact_line_file "$current/REVISION" "$commit"
exact_line_file "$current/RELEASE_TREE" "$expected_tree"
test "$(readlink "$current")" = "releases/$commit"
assert_release_read_only "$release"
verify_release_receipts \
  "$release" \
  "$commit" \
  "$expected_tree" \
  "$release/RELEASE_TREE_MANIFEST"
verify_release_receipts \
  "$previous_release" \
  "$expected_previous" \
  "$expected_previous_tree" \
  "$previous_release/RELEASE_TREE_MANIFEST"
assert_release_read_only "$previous_release"

if [[ "$legacy_created" -eq 1
    && -n "$legacy_current_identity"
    && -d "$legacy_current"
    && ! -L "$legacy_current"
    && "$(stat -Lc '%d:%i' "$legacy_current")" == "$legacy_current_identity" ]]; then
  chmod -R u+w -- "$legacy_current"
  rm -rf -- "$legacy_current"
  legacy_created=0
fi
[[ -z "$unit_backup" ]] || rm -f -- "$unit_backup"

trap - ERR INT TERM HUP
release_created=0
previous_release_created=0
promoted=0
echo "Promoted carboncaste-web: previous=$previous_target current=releases/$commit"
