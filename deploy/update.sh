#!/usr/bin/env bash
# Deploy news.e-accs.com from your machine (deploy/README.md). The server side is deploy/remote.sh, sent over ssh.
#   deploy/update.sh               deploy origin/main after isolated local release checks
#   deploy/update.sh <commit>      deploy that pushed commit instead
#   deploy/update.sh --rollback [<commit>]   switch back to the previous build (or that one)
#   deploy/update.sh --status      the live build, the services, the last deploys
#   deploy/update.sh --stats [7|30|90]   the site's own page views and interactions (default 30 days)
# HOST is the ssh host alias (default "dmit"). Release checks cannot be skipped.
set -euo pipefail
HOST=${HOST:-dmit}
HERE=$(cd "$(dirname "$0")" && pwd)

remote() { ssh -x "$HOST" "bash -s -- $*" <"$HERE/remote.sh"; }

case "${1:-}" in
  --status) remote status; exit ;;
  --stats) remote stats "${2:-30}"; exit ;;
  --rollback) remote rollback "${2:-}"; exit ;;
  -*) sed -n '2,8p' "$0"; exit 1 ;;
esac

git -C "$HERE" fetch -q origin
sha=$(git -C "$HERE" rev-parse --verify "${1:-origin/main}^{commit}")
git -C "$HERE" merge-base --is-ancestor "$sha" origin/main || { echo "error: $sha is not on origin/main; push it first" >&2; exit 1; }
[ "$(git -C "$HERE" rev-parse HEAD)" = "$sha" ] || echo "note: deploying $(git -C "$HERE" log --oneline -1 "$sha"), not your HEAD"

base=$(remote status | sed -n 's/^==> live: //p')
[[ "$base" =~ ^[0-9a-f]{40}$ ]] || { echo "error: cannot identify the previous release for migration validation" >&2; exit 1; }
"$HERE/verify.sh" "$sha" "$base"

echo "deploying $(git -C "$HERE" log --oneline -1 "$sha") to $HOST"
remote deploy "$sha"
