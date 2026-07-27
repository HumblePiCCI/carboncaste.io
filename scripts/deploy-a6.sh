#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

a6_host="${A6_HOST:-humble}"
remote_node="/home/humble/.hermes/node/bin/node"
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
previous_server="$(git show "$expected_previous:server/static-server.mjs")"
previous_has_iceland=0
if git cat-file -e "$expected_previous:server/iceland26-store.mjs" 2>/dev/null \
    && grep -q "/api/iceland26/health" <<<"$previous_server"; then
  previous_has_iceland=1
fi
verifier_sha="$(git show "$commit:scripts/verify-release-tree.mjs" | shasum -a 256 | awk '{print $1}')"
owner_token="$(openssl rand -hex 16)"
temporary_directory="$(mktemp -d -t carboncaste-a6-deploy.XXXXXX)"
archive_path="$temporary_directory/release.tar"
new_manifest_path="$temporary_directory/new-tree.manifest"
previous_manifest_path="$temporary_directory/previous-tree.manifest"
cleanup_helper_b64=""
write_helper_b64=""
lock_helper_b64=""
incoming_name="incoming-${commit}-$(date -u +%Y%m%dT%H%M%SZ)-${owner_token}"
remote_incoming="$remote_root/$incoming_name"
remote_cleanup_needed=0
remote_incoming_identity=""
remote_owner_identity=""

cleanup() {
  original_status=$?
  trap - EXIT
  cleanup_status=0
  if [[ "$remote_cleanup_needed" -eq 1 ]]; then
    printf '%s' "$cleanup_helper_b64" \
      | base64 -d \
      | ssh "$a6_host" \
        "'$remote_node' --input-type=module - staging \
          '$remote_incoming' '$remote_incoming_identity' '$owner_token' '$remote_root' \
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
    echo "CRITICAL: deployment cleanup could not prove task-owned resources were removed." >&2
    exit "$cleanup_status"
  fi
  exit "$original_status"
}
trap cleanup EXIT

cleanup_helper_b64="$(git show "$commit:scripts/a6-owned-cleanup.mjs" | base64 | tr -d '\n')"
cleanup_helper_sha="$(
  printf '%s' "$cleanup_helper_b64" | base64 -d | shasum -a 256 | awk '{print $1}'
)"
write_helper_b64="$(git show "$commit:scripts/a6-owned-write.mjs" | base64 | tr -d '\n')"
write_helper_sha="$(
  printf '%s' "$write_helper_b64" | base64 -d | shasum -a 256 | awk '{print $1}'
)"
write_helper_eval="await import('data:text/javascript;base64,$write_helper_b64').then((module) => module.runCli(process.argv.slice(1)))"
lock_helper_b64="$(git show "$commit:scripts/a6-locked-run.mjs" | base64 | tr -d '\n')"
lock_helper_sha="$(
  printf '%s' "$lock_helper_b64" | base64 -d | shasum -a 256 | awk '{print $1}'
)"
lock_helper_eval="await import('data:text/javascript;base64,$lock_helper_b64').then((module) => module.runCli(process.argv.slice(1)))"
git archive --format=tar "$commit" > "$archive_path"
git ls-tree -r -z --full-tree "$commit" > "$new_manifest_path"
git ls-tree -r -z --full-tree "$expected_previous" > "$previous_manifest_path"
new_manifest_sha="$(shasum -a 256 "$new_manifest_path" | awk '{print $1}')"
previous_manifest_sha="$(shasum -a 256 "$previous_manifest_path" | awk '{print $1}')"
remote_cleanup_needed=1
create_status=0
remote_receipt="$(ssh "$a6_host" \
  "'$remote_node' --input-type=module -e \"$write_helper_eval\" -- \
    create staging '$remote_incoming' '$owner_token' '$remote_root'"
)" || create_status=$?
if [[ "$create_status" -ne 0
    || ! "$remote_receipt" =~ ^([0-9]+:[0-9]+)\ ([0-9]+:[0-9]+)$ ]]; then
  echo "A6 staging directory did not return exact directory and owner identities." >&2
  exit 2
fi
remote_incoming_identity="${BASH_REMATCH[1]}"
remote_owner_identity="${BASH_REMATCH[2]}"
ssh "$a6_host" \
  "cd -P '$remote_incoming' \
    && test \"\$(stat -Lc '%d:%i' .)\" = '$remote_incoming_identity' \
    && test -f .staging-owner \
    && test ! -L .staging-owner \
    && test \"\$(stat -Lc '%h' .staging-owner)\" = 1 \
    && test \"\$(stat -Lc '%d:%i' .staging-owner)\" = '$remote_owner_identity' \
    && printf '%s\n' '$owner_token' | cmp -s - .staging-owner \
    && test \"\$(find . -mindepth 1 -maxdepth 1 -printf x | wc -c)\" -eq 1 \
    && tar --extract --file=- --keep-old-files --no-same-owner" \
  < "$archive_path"
ssh "$a6_host" \
  "'$remote_node' --input-type=module -e \"$write_helper_eval\" -- \
    write staging '$remote_incoming' '$remote_incoming_identity' \
    '$remote_owner_identity' '$owner_token' EXPECTED_NEW_TREE_MANIFEST \
    '$new_manifest_sha' '$remote_root'" \
  < "$new_manifest_path"
ssh "$a6_host" \
  "'$remote_node' --input-type=module -e \"$write_helper_eval\" -- \
    write staging '$remote_incoming' '$remote_incoming_identity' \
    '$remote_owner_identity' '$owner_token' EXPECTED_PREVIOUS_TREE_MANIFEST \
    '$previous_manifest_sha' '$remote_root'" \
  < "$previous_manifest_path"
remote_commit="$(git ls-remote --exit-code --heads origin "refs/heads/$branch" | awk 'NR == 1 { print $1 }')"
if [[ "$remote_commit" != "$commit" ]]; then
  echo "Remote origin/$branch changed during deployment staging; promotion refused." >&2
  exit 2
fi
git show "$commit:deploy/a6-promote-release.sh" \
  | ssh "$a6_host" \
  "'$remote_node' --input-type=module -e \"$lock_helper_eval\" -- '$remote_root' \
    '$remote_incoming' '$commit' '$expected_previous' '$owner_token' \
    '$new_tree' '$previous_tree' '$verifier_sha' '$remote_incoming_identity' \
    '$remote_owner_identity' '$cleanup_helper_sha' '$previous_has_iceland' \
    '$write_helper_sha' '$lock_helper_sha'"
cleanup_status=0
printf '%s' "$cleanup_helper_b64" \
  | base64 -d \
  | ssh "$a6_host" \
    "'$remote_node' --input-type=module - staging \
      '$remote_incoming' '$remote_incoming_identity' '$owner_token' '$remote_root' \
      '$remote_owner_identity'" \
    > /dev/null || cleanup_status=$?
remote_cleanup_needed=0
if [[ "$cleanup_status" -ne 0 ]]; then
  echo "CRITICAL: deployment succeeded, but its exact staging directory was preserved after cleanup interference." >&2
  exit "$cleanup_status"
fi

echo "A6 deployment completed: branch=$branch previous=$expected_previous commit=$commit tree=$new_tree"
