#!/usr/bin/env bash
set -euo pipefail
umask 077

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

a6_host="${A6_HOST:-humble}"
remote_node="/home/humble/.hermes/node/bin/node"
target_name="${1:-}"
service_root="/home/humble/services/carboncaste-web"

if [[ ! "$target_name" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Usage: scripts/rollback-a6.sh <exact-40-character-release-sha>" >&2
  exit 2
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Rollback requires a clean checkout for trusted verification tooling." >&2
  exit 2
fi
if [[ "$(git rev-parse --verify "$target_name^{commit}" 2>/dev/null)" != "$target_name" ]]; then
  echo "Rollback target is not an exact local Git commit." >&2
  exit 2
fi
branch="$(git branch --show-current)"
head_commit="$(git rev-parse HEAD)"
remote_head="$(git ls-remote --exit-code --heads origin "refs/heads/$branch" | awk 'NR == 1 { print $1 }')"
if [[ -z "$branch" || "$remote_head" != "$head_commit" ]]; then
  echo "Rollback tooling must exactly match the pushed current branch." >&2
  exit 2
fi

expected_current="$(ssh "$a6_host" "sed -n '1p' '$service_root/current/REVISION'")"
if ! [[ "$expected_current" =~ ^[0-9a-f]{40}$ ]] \
    || [[ "$(git rev-parse --verify "$expected_current^{commit}" 2>/dev/null)" != "$expected_current" ]]; then
  echo "A6 current release is not an exact locally available Git commit." >&2
  exit 2
fi
if [[ "$target_name" == "$expected_current" ]]; then
  echo "Rollback target is already the current A6 release." >&2
  exit 2
fi

target_tree="$(git rev-parse "$target_name^{tree}")"
current_tree="$(git rev-parse "$expected_current^{tree}")"
commit_has_iceland() {
  local commit="$1"
  local server_source=""
  if ! git cat-file -e "$commit:server/iceland26-store.mjs" 2>/dev/null; then
    printf '0\n'
    return
  fi
  server_source="$(git show "$commit:server/static-server.mjs")"
  if grep -q "/api/iceland26/health" <<<"$server_source"; then
    printf '1\n'
  else
    printf '0\n'
  fi
}
target_has_iceland="$(commit_has_iceland "$target_name")"
current_has_iceland="$(commit_has_iceland "$expected_current")"
verifier_sha="$(git show "$head_commit:scripts/verify-release-tree.mjs" | shasum -a 256 | awk '{print $1}')"
owner_token="$(openssl rand -hex 16)"
temporary_directory="$(mktemp -d -t carboncaste-a6-rollback.XXXXXX)"
target_manifest="$temporary_directory/target.manifest"
current_manifest="$temporary_directory/current.manifest"
cleanup_helper_b64=""
write_helper_b64=""
lock_helper_b64=""
remote_verification="$service_root/rollback-verify-$owner_token"
remote_verification_identity=""
remote_owner_identity=""
remote_cleanup_needed=0

cleanup() {
  original_status=$?
  trap - EXIT
  cleanup_status=0
  if [[ "$remote_cleanup_needed" -eq 1 ]]; then
    printf '%s' "$cleanup_helper_b64" \
      | base64 -d \
      | ssh "$a6_host" \
        "'$remote_node' --input-type=module - rollback \
          '$remote_verification' '$remote_verification_identity' '$owner_token' '$service_root' \
          '$remote_owner_identity'" \
        > /dev/null || cleanup_status=$?
  fi
  if rm -rf -- "$temporary_directory"; then
    :
  else
    temporary_cleanup_code=$?
    [[ "$cleanup_status" -ne 0 ]] || cleanup_status="$temporary_cleanup_code"
  fi
  if [[ "$cleanup_status" -ne 0 ]]; then
    echo "CRITICAL: rollback cleanup could not prove task-owned resources were removed." >&2
    exit "$cleanup_status"
  fi
  exit "$original_status"
}
trap cleanup EXIT

cleanup_helper_b64="$(git show "$head_commit:scripts/a6-owned-cleanup.mjs" | base64 | tr -d '\n')"
write_helper_b64="$(git show "$head_commit:scripts/a6-owned-write.mjs" | base64 | tr -d '\n')"
write_helper_eval="await import('data:text/javascript;base64,$write_helper_b64').then((module) => module.runCli(process.argv.slice(1)))"
lock_helper_b64="$(git show "$head_commit:scripts/a6-locked-run.mjs" | base64 | tr -d '\n')"
lock_helper_sha="$(
  printf '%s' "$lock_helper_b64" | base64 -d | shasum -a 256 | awk '{print $1}'
)"
lock_helper_eval="await import('data:text/javascript;base64,$lock_helper_b64').then((module) => module.runCli(process.argv.slice(1)))"
git ls-tree -r -z --full-tree "$target_name" > "$target_manifest"
git ls-tree -r -z --full-tree "$expected_current" > "$current_manifest"
target_manifest_sha="$(shasum -a 256 "$target_manifest" | awk '{print $1}')"
current_manifest_sha="$(shasum -a 256 "$current_manifest" | awk '{print $1}')"

remote_cleanup_needed=1
create_status=0
remote_receipt="$(ssh "$a6_host" \
  "'$remote_node' --input-type=module -e \"$write_helper_eval\" -- \
    create rollback '$remote_verification' '$owner_token' '$service_root'"
)" || create_status=$?
if [[ "$create_status" -ne 0
    || ! "$remote_receipt" =~ ^([0-9]+:[0-9]+)\ ([0-9]+:[0-9]+)$ ]]; then
  echo "A6 rollback verification did not return exact directory and owner identities." >&2
  exit 2
fi
remote_verification_identity="${BASH_REMATCH[1]}"
remote_owner_identity="${BASH_REMATCH[2]}"

upload_owned_file() {
  local source="$1"
  local target="$2"
  local expected_sha="$3"
  ssh "$a6_host" \
    "'$remote_node' --input-type=module -e \"$write_helper_eval\" -- \
      write rollback '$remote_verification' '$remote_verification_identity' \
      '$remote_owner_identity' '$owner_token' '$target' '$expected_sha' '$service_root'" \
    < "$source"
}

upload_owned_file scripts/verify-release-tree.mjs verify-release-tree.mjs "$verifier_sha"
upload_owned_file "$target_manifest" target.manifest "$target_manifest_sha"
upload_owned_file "$current_manifest" current.manifest "$current_manifest_sha"

remote_head="$(git ls-remote --exit-code --heads origin "refs/heads/$branch" | awk 'NR == 1 { print $1 }')"
if [[ "$remote_head" != "$head_commit" ]]; then
  echo "Remote origin/$branch changed during rollback staging; rollback refused." >&2
  exit 2
fi

ssh "$a6_host" \
  "'$remote_node' --input-type=module -e \"$lock_helper_eval\" -- '$service_root' \
  '$target_name' '$target_tree' '$expected_current' '$current_tree' \
  '$remote_verification' '$remote_verification_identity' '$owner_token' '$verifier_sha' \
  '$remote_owner_identity' '$target_has_iceland' '$current_has_iceland' \
  '$lock_helper_sha'" <<'REMOTE'
set -euo pipefail
umask 077

target_name="$1"
target_tree="$2"
expected_current="$3"
current_tree="$4"
verification="$5"
verification_identity="$6"
owner_token="$7"
expected_verifier_sha="$8"
expected_owner_identity="$9"
target_has_iceland="${10}"
current_has_iceland="${11}"
expected_lock_helper_sha="${12}"
service_root="/home/humble/services/carboncaste-web"
releases="$service_root/releases"
target="$releases/$target_name"
previous_release="$releases/$expected_current"
current="$service_root/current"
next_link="$service_root/.rollback-next-$owner_token"
unit="$HOME/.config/systemd/user/carboncaste-web.service"
node_bin="/home/humble/.hermes/node/bin/node"
verifier_fd=""
verifier_proc=""
verifier_b64=""
verifier_eval=""
switched=0

if ! [[ "$target_name" =~ ^[0-9a-f]{40}$
    && "$target_tree" =~ ^[0-9a-f]{40}$
    && "$expected_current" =~ ^[0-9a-f]{40}$
    && "$current_tree" =~ ^[0-9a-f]{40}$
    && "$target_name" != "$expected_current"
    && "$owner_token" =~ ^[0-9a-f]{32}$
    && "$expected_verifier_sha" =~ ^[0-9a-f]{64}$
    && "$expected_owner_identity" =~ ^[0-9]+:[0-9]+$
    && "$target_has_iceland" =~ ^[01]$
    && "$current_has_iceland" =~ ^[01]$
    && "$expected_lock_helper_sha" =~ ^[0-9a-f]{64}$
    && "${A6_DEPLOY_LOCK_HELPER_SHA:-}" == "$expected_lock_helper_sha"
    && "$verification_identity" =~ ^[0-9]+:[0-9]+$
    && "$verification" == "$service_root/rollback-verify-$owner_token" ]]; then
  echo "Rollback requires exact commit, tree, verifier, and owner identities." >&2
  exit 2
fi

exact_line_file() {
  local file="$1"
  local value="$2"
  [[ -f "$file"
    && ! -L "$file"
    && "$(stat -Lc '%h' "$file")" == 1 ]] || return 1
  printf '%s\n' "$value" | cmp -s - "$file"
}

verification_is_owned() {
  [[ -d "$verification"
    && ! -L "$verification"
    && "$(stat -Lc '%d:%i' "$verification")" == "$verification_identity"
    && -f "$verification/.rollback-owner"
    && ! -L "$verification/.rollback-owner"
    && "$(stat -Lc '%h' "$verification/.rollback-owner")" == 1
    && "$(stat -Lc '%a' "$verification/.rollback-owner")" == 600
    && "$(stat -Lc '%d:%i' "$verification/.rollback-owner")" == "$expected_owner_identity" ]] \
    && exact_line_file "$verification/.rollback-owner" "$owner_token"
}

deploy_lock_is_exact() {
  local lock_file="$service_root/deploy.lock"
  local lock_ref lock_identity
  lock_ref="/proc/${BASHPID}/fd/3"
  lock_identity="$(stat -Lc '%d:%i' "$lock_ref")" || return 1
  [[ -f "$lock_ref"
    && "$(stat -Lc '%h' "$lock_ref")" == 1
    && "$(stat -Lc '%a' "$lock_ref")" == 600
    && "$lock_identity" == "${A6_DEPLOY_LOCK_IDENTITY:-}"
    && -f "$lock_file"
    && ! -L "$lock_file"
    && "$(stat -Lc '%d:%i' "$lock_file")" == "$lock_identity" ]]
}

deployment_roots_are_exact() {
  local releases_ref="/proc/${BASHPID}/fd/4"
  local root_ref="/proc/${BASHPID}/fd/5"
  local root_identity releases_identity
  root_identity="$(stat -Lc '%d:%i' "$root_ref")" || return 1
  releases_identity="$(stat -Lc '%d:%i' "$releases_ref")" || return 1
  [[ -d "$root_ref"
    && -d "$releases_ref"
    && "$root_identity" == "${A6_DEPLOY_ROOT_IDENTITY:-}"
    && "$releases_identity" == "${A6_DEPLOY_RELEASES_IDENTITY:-}"
    && "$(stat -Lc '%d' "$root_ref")" == "$(stat -Lc '%d' "$releases_ref")"
    && "$(stat -Lc '%a' "$releases_ref")" == 700
    && -d "$service_root"
    && ! -L "$service_root"
    && "$(stat -Lc '%d:%i' "$service_root")" == "$root_identity"
    && -d "$releases"
    && ! -L "$releases"
    && "$(stat -Lc '%d:%i' "$releases")" == "$releases_identity" ]]
}

systemctl_bounded() {
  timeout --signal=TERM --kill-after=1s 4s systemctl --user "$@"
}

runtime_is_active() {
  timeout --signal=TERM --kill-after=1s 1s \
    systemctl --user is-active --quiet carboncaste-web.service
}

wait_for_runtime() {
  local has_iceland="$1"
  local health=""
  local deadline=$((SECONDS + 10))
  while (( SECONDS < deadline )); do
    if runtime_is_active \
        && curl -fsS --connect-timeout 0.3 --max-time 0.5 \
          http://127.0.0.1:8126/ >/dev/null 2>&1; then
      if [[ "$has_iceland" -eq 0 ]]; then
        return 0
      fi
      health="$(curl -fsS --connect-timeout 0.3 --max-time 0.5 \
        http://127.0.0.1:8126/api/iceland26/health 2>/dev/null || true)"
      if grep -q '"ready":true' <<<"$health"; then
        return 0
      fi
    fi
    sleep 0.1
  done
  return 1
}

if ! verification_is_owned; then
  echo "Rollback verification custody is invalid." >&2
  exit 2
fi

if ! deploy_lock_is_exact || ! deployment_roots_are_exact; then
  echo "Rollback did not receive exact no-follow lock and root descriptors." >&2
  exit 2
fi
if ! flock -n 3; then
  echo "Another carboncaste-web deployment or rollback holds the host lock." >&2
  exit 75
fi
if ! deploy_lock_is_exact || ! deployment_roots_are_exact; then
  echo "The carboncaste-web deployment lock or pinned roots changed while held." >&2
  exit 2
fi
if ! verification_is_owned; then
  echo "Rollback verification custody changed before the host lock." >&2
  exit 2
fi
if [[ -e "$next_link" || -L "$next_link" ]]; then
  echo "Rollback transition path already exists." >&2
  exit 2
fi

verifier="$verification/verify-release-tree.mjs"
target_manifest="$verification/target.manifest"
current_manifest="$verification/current.manifest"
if [[ ! -f "$verifier" || -L "$verifier"
    || "$(stat -Lc '%h' "$verifier")" != 1
    || "$(sha256sum "$verifier" | awk '{print $1}')" != "$expected_verifier_sha"
    || ! -f "$target_manifest" || -L "$target_manifest"
    || "$(stat -Lc '%h' "$target_manifest")" != 1
    || ! -f "$current_manifest" || -L "$current_manifest"
    || "$(stat -Lc '%h' "$current_manifest")" != 1 ]]; then
  echo "Rollback verifier or manifests failed custody checks." >&2
  exit 2
fi
verifier_source_identity="$(stat -Lc '%d:%i' "$verifier")"
exec {verifier_fd}<"$verifier"
verifier_proc="/proc/${BASHPID}/fd/$verifier_fd"
if [[ ! -f "$verifier_proc"
    || "$(stat -Lc '%d:%i' "$verifier_proc")" != "$verifier_source_identity"
    || "$(sha256sum "$verifier_proc" | awk '{print $1}')" != "$expected_verifier_sha" ]]; then
  echo "Rollback verifier changed while it was being pinned." >&2
  exit 2
fi
verifier_b64="$(base64 -w 0 "$verifier_proc")"
if [[ -z "$verifier_b64"
    || "$(printf '%s' "$verifier_b64" | base64 -d | sha256sum | awk '{print $1}')" != "$expected_verifier_sha" ]]; then
  echo "Pinned rollback verifier could not be captured exactly." >&2
  exit 2
fi
verifier_eval="process.argv.splice(1,0,'verify-release-tree.mjs'); await import('data:text/javascript;base64,$verifier_b64')"

assert_release_read_only() {
  local writable=""
  writable="$(timeout --signal=TERM --kill-after=1s 4s \
    find "$1" \( -type f -o -type d \) -perm /222 -print -quit)" || return 1
  [[ -z "$writable" ]]
}

verify_release() {
  local root="$1"
  local revision="$2"
  local tree="$3"
  local manifest="$4"
  [[ -d "$root"
    && ! -L "$root"
    && -f "$root/RELEASE_TREE_MANIFEST"
    && ! -L "$root/RELEASE_TREE_MANIFEST"
    && "$(stat -Lc '%h' "$root/RELEASE_TREE_MANIFEST")" == 1 ]]
  for optional_receipt in \
    "$root/.staging-owner" \
    "$root/EXPECTED_NEW_TREE_MANIFEST" \
    "$root/EXPECTED_PREVIOUS_TREE_MANIFEST"; do
    if [[ -e "$optional_receipt" || -L "$optional_receipt" ]]; then
      [[ -f "$optional_receipt"
        && ! -L "$optional_receipt"
        && "$(stat -Lc '%h' "$optional_receipt")" == 1 ]] || return 1
    fi
  done
  if [[ -f "$root/.staging-owner" ]]; then
    [[ "$(stat -Lc '%s' "$root/.staging-owner")" == 33 ]] || return 1
    LC_ALL=C grep -Eq '^[0-9a-f]{32}$' "$root/.staging-owner" || return 1
  fi
  if [[ -f "$root/EXPECTED_NEW_TREE_MANIFEST" ]]; then
    cmp -s -- "$root/EXPECTED_NEW_TREE_MANIFEST" "$root/RELEASE_TREE_MANIFEST"
  fi
  exact_line_file "$root/REVISION" "$revision"
  exact_line_file "$root/RELEASE_TREE" "$tree"
  cmp -s -- "$root/RELEASE_TREE_MANIFEST" "$manifest"
  timeout --signal=TERM --kill-after=1s 6s \
    "$node_bin" --input-type=module -e "$verifier_eval" -- \
    "$root" "$revision" "$tree" "$manifest"
  assert_release_read_only "$root"
}

if [[ ! -L "$current"
    || "$(readlink "$current")" != "releases/$expected_current" ]] \
    || ! exact_line_file "$current/REVISION" "$expected_current"; then
  echo "Active A6 release changed before rollback acquired the host lock." >&2
  exit 2
fi
verify_release "$previous_release" "$expected_current" "$current_tree" "$current_manifest"
verify_release "$target" "$target_name" "$target_tree" "$target_manifest"

restore_previous() {
  local failed=0
  local next_target=""
  if [[ -e "$next_link" || -L "$next_link" ]]; then
    next_target="$(readlink "$next_link" 2>/dev/null || true)"
    if [[ -L "$next_link" && "$next_target" == "releases/$target_name" ]]; then
      rm -f -- "$next_link" || failed=1
    else
      failed=1
    fi
  fi
  if [[ "$failed" -eq 0 ]]; then
    ln -s "releases/$expected_current" "$next_link" || failed=1
  fi
  if [[ "$failed" -eq 0
      && "$(readlink "$next_link" 2>/dev/null || true)" == "releases/$expected_current" ]]; then
    mv -Tf "$next_link" "$current" || failed=1
  else
    failed=1
  fi
  if [[ "$failed" -ne 0 ]]; then
    return 1
  fi
  timeout --signal=TERM --kill-after=1s 4s \
    install -m 0644 "$previous_release/deploy/carboncaste-web.service" "$unit" \
    || failed=1
  systemctl_bounded daemon-reload || failed=1
  systemctl_bounded restart carboncaste-web.service || failed=1
  wait_for_runtime "$current_has_iceland" || failed=1
  if [[ ! -L "$current"
      || "$(readlink "$current")" != "releases/$expected_current" ]] \
      || ! exact_line_file "$current/REVISION" "$expected_current"; then
    failed=1
  fi
  runtime_is_active || failed=1
  verify_release \
    "$previous_release" \
    "$expected_current" \
    "$current_tree" \
    "$current_manifest" || failed=1
  return "$failed"
}

rollback_failed() {
  local status="${1:-1}"
  local restore_status=0
  trap - ERR INT TERM HUP
  set +e
  if [[ "$switched" -eq 1 ]]; then
    restore_previous
    restore_status=$?
  elif [[ -L "$next_link"
      && "$(readlink "$next_link" 2>/dev/null || true)" == "releases/$target_name" ]]; then
    rm -f -- "$next_link" || true
  fi
  if [[ "$restore_status" -ne 0 ]]; then
    echo "CRITICAL: rollback target failed and the prior A6 release could not be proven restored." >&2
    exit 70
  fi
  exit "$status"
}
trap 'rollback_failed $?' ERR
trap 'rollback_failed 130' INT
trap 'rollback_failed 143' TERM
trap 'rollback_failed 129' HUP

ln -s "releases/$target_name" "$next_link"
switched=1
mv -Tf "$next_link" "$current"
timeout --signal=TERM --kill-after=1s 4s \
  install -m 0644 "$target/deploy/carboncaste-web.service" "$unit"
systemctl_bounded daemon-reload
systemctl_bounded restart carboncaste-web.service
wait_for_runtime "$target_has_iceland"
curl -fsS --max-time 10 http://127.0.0.1:8126/ >/dev/null
if [[ "$target_has_iceland" -eq 1 ]]; then
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
fi
runtime_is_active
test "$(readlink "$current")" = "releases/$target_name"
exact_line_file "$current/REVISION" "$target_name"
verify_release "$target" "$target_name" "$target_tree" "$target_manifest"

trap - ERR INT TERM HUP
exec {verifier_fd}<&-
echo "Rolled back carboncaste-web: previous=releases/$expected_current current=releases/$target_name"
REMOTE

cleanup_status=0
printf '%s' "$cleanup_helper_b64" \
  | base64 -d \
  | ssh "$a6_host" \
    "'$remote_node' --input-type=module - rollback \
      '$remote_verification' '$remote_verification_identity' '$owner_token' '$service_root' \
      '$remote_owner_identity'" \
    > /dev/null || cleanup_status=$?
remote_cleanup_needed=0
if [[ "$cleanup_status" -ne 0 ]]; then
  echo "CRITICAL: rollback succeeded, but its exact verification directory was preserved after cleanup interference." >&2
  exit "$cleanup_status"
fi
echo "A6 rollback completed: previous=$expected_current current=$target_name tree=$target_tree"
