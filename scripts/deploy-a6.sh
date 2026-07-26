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
remote_commit="$(git ls-remote --exit-code --heads origin "refs/heads/$branch" | awk 'NR == 1 { print $1 }')"
if [[ "$remote_commit" != "$commit" ]]; then
  echo "Deploy SHA must exactly match the current remote origin/$branch." >&2
  exit 2
fi

archive_path="$(mktemp -t carboncaste-a6-release.XXXXXX.tar)"
incoming_name="incoming-${commit}-$(date -u +%Y%m%dT%H%M%SZ)"
remote_root="/home/humble/services/carboncaste-web"
remote_incoming="$remote_root/$incoming_name"
remote_cleanup_needed=0

cleanup() {
  rm -f "$archive_path"
  if [[ "$remote_cleanup_needed" -eq 1 ]]; then
    ssh "$a6_host" "rm -rf -- '$remote_incoming'" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

git archive --format=tar "$commit" > "$archive_path"
ssh "$a6_host" "set -eu; test ! -e '$remote_incoming'; mkdir -p '$remote_incoming'"
remote_cleanup_needed=1
ssh "$a6_host" "tar -xf - -C '$remote_incoming'" < "$archive_path"
ssh "$a6_host" \
  "bash '$remote_incoming/deploy/a6-promote-release.sh' '$remote_incoming' '$commit'"
remote_cleanup_needed=0

echo "A6 deployment completed: branch=$branch commit=$commit"
