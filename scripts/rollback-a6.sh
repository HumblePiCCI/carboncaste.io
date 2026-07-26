#!/usr/bin/env bash
set -euo pipefail
umask 077

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

a6_host="${A6_HOST:-humble}"
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
verifier_sha="$(shasum -a 256 scripts/verify-release-tree.mjs | awk '{print $1}')"
owner_token="$(openssl rand -hex 16)"
temporary_directory="$(mktemp -d -t carboncaste-a6-rollback.XXXXXX)"
target_manifest="$temporary_directory/target.manifest"
current_manifest="$temporary_directory/current.manifest"
remote_verification="$service_root/rollback-verify-$owner_token"
remote_verification_identity=""
remote_cleanup_needed=0

cleanup() {
  cleanup_status=0
  rm -rf -- "$temporary_directory" || cleanup_status=$?
  if [[ "$remote_cleanup_needed" -eq 1 ]]; then
    ssh "$a6_host" \
      "if test -n '$remote_verification_identity' \
        && test -d '$remote_verification' \
        && test ! -L '$remote_verification' \
        && test \"\$(stat -Lc '%d:%i' '$remote_verification')\" = '$remote_verification_identity' \
        && test -f '$remote_verification/.rollback-owner' \
        && test ! -L '$remote_verification/.rollback-owner' \
        && printf '%s\n' '$owner_token' | cmp -s - '$remote_verification/.rollback-owner'; then \
        rm -rf -- '$remote_verification'; \
      fi" >/dev/null 2>&1 || cleanup_status=$?
  fi
  return "$cleanup_status"
}
trap cleanup EXIT

git ls-tree -r -z --full-tree "$target_name" > "$target_manifest"
git ls-tree -r -z --full-tree "$expected_current" > "$current_manifest"

remote_cleanup_needed=1
ssh "$a6_host" "bash -s -- '$remote_verification' '$owner_token'" <<'REMOTE_CREATE'
set -euo pipefail
verification="$1"
owner_token="$2"
created=0
cleanup_created() {
  if [[ "$created" -eq 1 ]]; then rm -rf -- "$verification"; fi
}
trap cleanup_created ERR INT TERM HUP
mkdir -m 0700 -- "$verification"
created=1
printf '%s\n' "$owner_token" > "$verification/.rollback-owner"
chmod 0600 "$verification/.rollback-owner"
trap - ERR INT TERM HUP
REMOTE_CREATE
remote_verification_identity="$(ssh "$a6_host" \
  "test -d '$remote_verification' \
    && test ! -L '$remote_verification' \
    && test -f '$remote_verification/.rollback-owner' \
    && test ! -L '$remote_verification/.rollback-owner' \
    && printf '%s\n' '$owner_token' | cmp -s - '$remote_verification/.rollback-owner' \
    && stat -Lc '%d:%i' '$remote_verification'")"

ssh "$a6_host" \
  "set -eu; umask 077; cd -P '$remote_verification'; \
  test \"\$(stat -Lc '%d:%i' .)\" = '$remote_verification_identity'; \
  test -f .rollback-owner; test ! -L .rollback-owner; \
  printf '%s\n' '$owner_token' | cmp -s - .rollback-owner; \
  set -C; cat > verify-release-tree.mjs; chmod 0500 verify-release-tree.mjs" \
  < scripts/verify-release-tree.mjs
ssh "$a6_host" \
  "set -eu; umask 077; cd -P '$remote_verification'; \
  test \"\$(stat -Lc '%d:%i' .)\" = '$remote_verification_identity'; \
  test -f .rollback-owner; test ! -L .rollback-owner; \
  printf '%s\n' '$owner_token' | cmp -s - .rollback-owner; \
  set -C; cat > target.manifest; chmod 0400 target.manifest" \
  < "$target_manifest"
ssh "$a6_host" \
  "set -eu; umask 077; cd -P '$remote_verification'; \
  test \"\$(stat -Lc '%d:%i' .)\" = '$remote_verification_identity'; \
  test -f .rollback-owner; test ! -L .rollback-owner; \
  printf '%s\n' '$owner_token' | cmp -s - .rollback-owner; \
  set -C; cat > current.manifest; chmod 0400 current.manifest" \
  < "$current_manifest"

remote_head="$(git ls-remote --exit-code --heads origin "refs/heads/$branch" | awk 'NR == 1 { print $1 }')"
if [[ "$remote_head" != "$head_commit" ]]; then
  echo "Remote origin/$branch changed during rollback staging; rollback refused." >&2
  exit 2
fi

ssh "$a6_host" "bash -s -- \
  '$target_name' '$target_tree' '$expected_current' '$current_tree' \
  '$remote_verification' '$remote_verification_identity' '$owner_token' '$verifier_sha'" <<'REMOTE'
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
service_root="/home/humble/services/carboncaste-web"
releases="$service_root/releases"
target="$releases/$target_name"
previous_release="$releases/$expected_current"
current="$service_root/current"
next_link="$service_root/.rollback-next-$owner_token"
unit="$HOME/.config/systemd/user/carboncaste-web.service"
node_bin="/home/humble/.hermes/node/bin/node"
switched=0

if ! [[ "$target_name" =~ ^[0-9a-f]{40}$
    && "$target_tree" =~ ^[0-9a-f]{40}$
    && "$expected_current" =~ ^[0-9a-f]{40}$
    && "$current_tree" =~ ^[0-9a-f]{40}$
    && "$target_name" != "$expected_current"
    && "$owner_token" =~ ^[0-9a-f]{32}$
    && "$expected_verifier_sha" =~ ^[0-9a-f]{64}$
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
    && "$(stat -Lc '%h' "$verification/.rollback-owner")" == 1 ]] \
    && exact_line_file "$verification/.rollback-owner" "$owner_token"
}

cleanup_verification() {
  verification_is_owned || return 1
  rm -rf -- "$verification"
}

if ! verification_is_owned; then
  echo "Rollback verification custody is invalid." >&2
  exit 2
fi

exec 9>"$service_root/deploy.lock"
if ! flock -n 9; then
  cleanup_verification
  echo "Another carboncaste-web deployment or rollback holds the host lock." >&2
  exit 75
fi
if ! verification_is_owned; then
  echo "Rollback verification custody changed before the host lock." >&2
  exit 2
fi
if [[ -e "$next_link" || -L "$next_link" ]]; then
  echo "Rollback transition path already exists." >&2
  cleanup_verification
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
  cleanup_verification
  exit 2
fi

assert_release_read_only() {
  [[ -z "$(find "$1" \( -type f -o -type d \) -perm /222 -print -quit)" ]]
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
    && "$(stat -Lc '%h' "$root/RELEASE_TREE_MANIFEST")" == 1
    && ! -e "$root/.staging-owner" && ! -L "$root/.staging-owner"
    && ! -e "$root/EXPECTED_NEW_TREE_MANIFEST"
    && ! -L "$root/EXPECTED_NEW_TREE_MANIFEST"
    && ! -e "$root/EXPECTED_PREVIOUS_TREE_MANIFEST"
    && ! -L "$root/EXPECTED_PREVIOUS_TREE_MANIFEST" ]]
  exact_line_file "$root/REVISION" "$revision"
  exact_line_file "$root/RELEASE_TREE" "$tree"
  cmp -s -- "$root/RELEASE_TREE_MANIFEST" "$manifest"
  "$node_bin" "$verifier" "$root" "$revision" "$tree" "$manifest"
  assert_release_read_only "$root"
}

if [[ ! -L "$current"
    || "$(readlink "$current")" != "releases/$expected_current" ]] \
    || ! exact_line_file "$current/REVISION" "$expected_current"; then
  echo "Active A6 release changed before rollback acquired the host lock." >&2
  cleanup_verification
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
  install -m 0644 "$previous_release/deploy/carboncaste-web.service" "$unit" || failed=1
  systemctl --user daemon-reload || failed=1
  systemctl --user restart carboncaste-web.service || failed=1
  if [[ ! -L "$current"
      || "$(readlink "$current")" != "releases/$expected_current" ]] \
      || ! exact_line_file "$current/REVISION" "$expected_current"; then
    failed=1
  fi
  systemctl --user is-active --quiet carboncaste-web.service || failed=1
  curl -fsS --max-time 10 http://127.0.0.1:8126/api/iceland26/health \
    | grep -q '"ready":true' || failed=1
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
    rm -f -- "$next_link"
  fi
  cleanup_verification
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
install -m 0644 "$target/deploy/carboncaste-web.service" "$unit"
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
exact_line_file "$current/REVISION" "$target_name"
verify_release "$target" "$target_name" "$target_tree" "$target_manifest"

cleanup_verification
trap - ERR INT TERM HUP
echo "Rolled back carboncaste-web: previous=releases/$expected_current current=releases/$target_name"
REMOTE

remote_cleanup_needed=0
echo "A6 rollback completed: previous=$expected_current current=$target_name tree=$target_tree"
