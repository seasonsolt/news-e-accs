#!/usr/bin/env bash
# Verify an exact committed snapshot, never the caller's uncommitted files or .env.
# Usage: deploy/verify.sh <commit> <previous-release-commit>
set -euo pipefail
[ "$#" = 2 ] || { echo 'usage: deploy/verify.sh <commit> <previous-release-commit>' >&2; exit 1; }
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(git -C "$HERE" rev-parse --show-toplevel)
sha=$(git -C "$REPO" rev-parse --verify "$1^{commit}")
base=$(git -C "$REPO" rev-parse --verify "$2^{commit}")
git -C "$REPO" merge-base --is-ancestor "$base" "$sha" || { echo 'error: previous release is not an ancestor of the target' >&2; exit 1; }
docker info >/dev/null
scratch=$(mktemp -d "${TMPDIR:-/tmp}/eacc-verify.XXXXXX")
project="eacc-verify-$(basename "$scratch" | tr '[:upper:].' '[:lower:]-')"
export VERIFY_BASE=$base
compose=(docker compose -p "$project" -f "$scratch/source/deploy/verify.compose.yml")
cleanup() {
  "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$scratch"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# An independent clone keeps migration history accessible inside Docker; no host .git path or secrets.
git clone --quiet --no-hardlinks --no-checkout "$REPO" "$scratch/source"
git -C "$scratch/source" checkout --quiet --detach "$sha"
printf 'Verifying %s against %s in an isolated local container\n' "$sha" "$base"
"${compose[@]}" build check
"${compose[@]}" run --rm check
