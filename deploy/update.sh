#!/usr/bin/env bash
# Deploy news.e-accs.com from your machine (deploy/README.md). The server side is deploy/remote.sh, sent over ssh.
#   deploy/update.sh               deploy origin/main after isolated local release checks
#   deploy/update.sh <commit>      deploy that pushed commit instead
#   deploy/update.sh --rollback [<commit>]   switch back to the previous build (or that one)
#   deploy/update.sh --status      the live build, the services, the last deploys
#   deploy/update.sh --stats [7|30|90]   the site's own page views and interactions (default 30 days)
# HOST is the ssh host alias (default "dmit"). Release checks cannot be skipped.
# When the server's worker is WORKER_ROLE=core, MODELS_UPDATE must name a command that switches the separate
# models worker to a commit (called with its sha); deploys and rollbacks call it once the server is live.
set -euo pipefail
HOST=${HOST:-dmit}
HERE=$(cd "$(dirname "$0")" && pwd)

remote() { ssh -x "$HOST" "bash -s -- $*" <"$HERE/remote.sh"; }
# The two workers share one database and must run the same build (docs/deploy.md).
models_needed() {
  [ "$(remote status | sed -n 's/^==> worker role: //p')" = core ] || return 1
  [ -n "${MODELS_UPDATE:-}" ] || { echo "error: $HOST runs WORKER_ROLE=core; set MODELS_UPDATE to the command that switches the models worker" >&2; exit 1; }
}
models_follow() {
  local live; live=$(remote status | sed -n 's/^==> live: //p')
  echo "switching the models worker to $live"
  "$MODELS_UPDATE" "$live" || { echo "error: the server is live on $live but the models worker did not switch; rerun: $MODELS_UPDATE $live" >&2; exit 1; }
}

case "${1:-}" in
  --status) remote status; exit ;;
  --stats) remote stats "${2:-30}"; exit ;;
  --rollback) if models_needed; then remote rollback "${2:-}"; models_follow; else remote rollback "${2:-}"; fi; exit ;;
  -*) sed -n '2,10p' "$0"; exit 1 ;;
esac

git -C "$HERE" fetch -q origin
sha=$(git -C "$HERE" rev-parse --verify "${1:-origin/main}^{commit}")
git -C "$HERE" merge-base --is-ancestor "$sha" origin/main || { echo "error: $sha is not on origin/main; push it first" >&2; exit 1; }
[ "$(git -C "$HERE" rev-parse HEAD)" = "$sha" ] || echo "note: deploying $(git -C "$HERE" log --oneline -1 "$sha"), not your HEAD"

split=false; models_needed && split=true
base=$(remote status | sed -n 's/^==> live: //p')
[[ "$base" =~ ^[0-9a-f]{40}$ ]] || { echo "error: cannot identify the previous release for migration validation" >&2; exit 1; }
# VERIFY_RUNNER swaps in another command with verify.sh's arguments, such as a faster machine's wrapper.
"${VERIFY_RUNNER:-$HERE/verify.sh}" "$sha" "$base"

echo "deploying $(git -C "$HERE" log --oneline -1 "$sha") to $HOST"
remote deploy "$sha"
if $split; then models_follow; fi
