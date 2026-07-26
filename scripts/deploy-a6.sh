#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

a6_host="${A6_HOST:-humble}"
commit="${1:-$(git rev-parse HEAD)}"
branch="$(git branch --show-current)"

if ! [[ "$commit" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Deploy requires a full 40-character commit SHA." >&2
  exit 2
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Deploy requires a clean checkout." >&2
  exit 2
fi
if [[ "$(git rev-parse HEAD)" != "$commit" ]]; then
  echo "Deploy SHA must be the checked-out HEAD." >&2
  exit 2
fi
for reserved_name in \
  .staging-owner \
  EXPECTED_NEW_TREE_MANIFEST \
  EXPECTED_PREVIOUS_TREE_MANIFEST \
  RELEASE_TREE \
  RELEASE_TREE_MANIFEST \
  REVISION; do
  if git cat-file -e "$commit:$reserved_name" 2>/dev/null; then
    echo "Deploy payload tracks reserved release metadata path: $reserved_name" >&2
    exit 2
  fi
done
remote_commit="$(git ls-remote --exit-code --heads origin "refs/heads/$branch" | awk 'NR == 1 { print $1 }')"
if [[ "$remote_commit" != "$commit" ]]; then
  echo "Deploy SHA must exactly match the current remote origin/$branch." >&2
  exit 2
fi

remote_root="/home/humble/services/carboncaste-web"
remote_revision="$(ssh "$a6_host" "sed -n '1p' '$remote_root/current/REVISION'")"
if ! [[ "$remote_revision" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "A6 current/REVISION is not a resolvable Git commit marker." >&2
  exit 2
fi
if ! expected_previous="$(git rev-parse --verify "$remote_revision^{commit}" 2>/dev/null)"; then
  echo "A6 current revision is not available in the local repository." >&2
  exit 2
fi
if [[ "${expected_previous:0:${#remote_revision}}" != "$remote_revision" ]]; then
  echo "A6 current revision does not resolve to an exact matching commit." >&2
  exit 2
fi
new_tree="$(git rev-parse "$commit^{tree}")"
previous_tree="$(git rev-parse "$expected_previous^{tree}")"
verifier_sha="$(shasum -a 256 scripts/verify-release-tree.mjs | awk '{print $1}')"
owner_token="$(openssl rand -hex 16)"
temporary_directory="$(mktemp -d -t carboncaste-a6-deploy.XXXXXX)"
archive_path="$temporary_directory/release.tar"
new_manifest_path="$temporary_directory/new-tree.manifest"
previous_manifest_path="$temporary_directory/previous-tree.manifest"
incoming_name="incoming-${commit}-$(date -u +%Y%m%dT%H%M%SZ)-${owner_token}"
remote_incoming="$remote_root/$incoming_name"
remote_cleanup_needed=0
remote_incoming_identity=""

cleanup() {
  cleanup_status=0
  rm -rf -- "$temporary_directory" || cleanup_status=$?
  if [[ "$remote_cleanup_needed" -eq 1 ]]; then
    ssh "$a6_host" \
      "if test -n '$remote_incoming_identity' \
        && test -d '$remote_incoming' \
        && test ! -L '$remote_incoming' \
        && test \"\$(stat -Lc '%d:%i' '$remote_incoming')\" = '$remote_incoming_identity' \
        && test -f '$remote_incoming/.staging-owner' \
        && test ! -L '$remote_incoming/.staging-owner' \
        && printf '%s\n' '$owner_token' | cmp -s - '$remote_incoming/.staging-owner'; then \
        rm -rf -- '$remote_incoming'; \
      elif test -z '$remote_incoming_identity' \
        && test -d '$remote_incoming' \
        && test ! -L '$remote_incoming' \
        && test -f '$remote_incoming/.staging-owner' \
        && test ! -L '$remote_incoming/.staging-owner' \
        && printf '%s\n' '$owner_token' | cmp -s - '$remote_incoming/.staging-owner'; then \
        rm -rf -- '$remote_incoming'; \
      fi" >/dev/null 2>&1 || cleanup_status=$?
  fi
  return "$cleanup_status"
}
trap cleanup EXIT

git archive --format=tar "$commit" > "$archive_path"
git ls-tree -r -z --full-tree "$commit" > "$new_manifest_path"
git ls-tree -r -z --full-tree "$expected_previous" > "$previous_manifest_path"
remote_cleanup_needed=1
remote_incoming_identity="$(ssh "$a6_host" \
  "bash -s -- '$remote_incoming' '$owner_token'" <<'REMOTE_CREATE'
set -euo pipefail
incoming="$1"
owner_token="$2"
created=0
cleanup_created() {
  if [[ "$created" -eq 1 ]]; then rm -rf -- "$incoming"; fi
}
trap cleanup_created ERR INT TERM HUP
mkdir -m 0700 -- "$incoming"
created=1
printf '%s\n' "$owner_token" > "$incoming/.staging-owner"
chmod 0600 "$incoming/.staging-owner"
stat -Lc '%d:%i' "$incoming"
trap - ERR INT TERM HUP
REMOTE_CREATE
)"
if ! [[ "$remote_incoming_identity" =~ ^[0-9]+:[0-9]+$ ]]; then
  echo "A6 staging directory did not return a valid device/inode identity." >&2
  exit 2
fi
ssh "$a6_host" \
  "cd -P '$remote_incoming' \
    && test \"\$(stat -Lc '%d:%i' .)\" = '$remote_incoming_identity' \
    && test -f .staging-owner \
    && test ! -L .staging-owner \
    && printf '%s\n' '$owner_token' | cmp -s - .staging-owner \
    && tar -xf -" \
  < "$archive_path"
ssh "$a6_host" \
  "set -eu; umask 077; cd -P '$remote_incoming'; upload='.new-tree-${owner_token}'; \
  test \"\$(stat -Lc '%d:%i' .)\" = '$remote_incoming_identity'; \
  test -f .staging-owner; test ! -L .staging-owner; \
  printf '%s\n' '$owner_token' | cmp -s - .staging-owner; \
  test ! -e \"\$upload\"; test ! -L \"\$upload\"; set -C; cat > \"\$upload\"; \
  chmod 0600 \"\$upload\"; \
  ln \"\$upload\" EXPECTED_NEW_TREE_MANIFEST; rm -f \"\$upload\"" \
  < "$new_manifest_path"
ssh "$a6_host" \
  "set -eu; umask 077; cd -P '$remote_incoming'; upload='.previous-tree-${owner_token}'; \
  test \"\$(stat -Lc '%d:%i' .)\" = '$remote_incoming_identity'; \
  test -f .staging-owner; test ! -L .staging-owner; \
  printf '%s\n' '$owner_token' | cmp -s - .staging-owner; \
  test ! -e \"\$upload\"; test ! -L \"\$upload\"; set -C; cat > \"\$upload\"; \
  chmod 0600 \"\$upload\"; \
  ln \"\$upload\" EXPECTED_PREVIOUS_TREE_MANIFEST; rm -f \"\$upload\"" \
  < "$previous_manifest_path"
remote_commit="$(git ls-remote --exit-code --heads origin "refs/heads/$branch" | awk 'NR == 1 { print $1 }')"
if [[ "$remote_commit" != "$commit" ]]; then
  echo "Remote origin/$branch changed during deployment staging; promotion refused." >&2
  exit 2
fi
ssh "$a6_host" \
  "bash -s -- '$remote_incoming' '$commit' '$expected_previous' '$owner_token' \
    '$new_tree' '$previous_tree' '$verifier_sha' '$remote_incoming_identity'" \
  < deploy/a6-promote-release.sh
remote_cleanup_needed=0

echo "A6 deployment completed: branch=$branch previous=$expected_previous commit=$commit tree=$new_tree"
