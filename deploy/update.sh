#!/usr/bin/env bash
# Deploy news.e-accs.com from your machine (deploy/README.md). The server side is deploy/remote.sh, sent over ssh.
#   deploy/update.sh               deploy origin/main once its GitHub check has passed
#   deploy/update.sh <commit>      deploy that pushed commit instead
#   deploy/update.sh --rollback [<commit>]   switch back to the previous build (or that one)
#   deploy/update.sh --status      the live build, the services, the last deploys
# HOST is the ssh host alias (default "dmit"); SKIP_CI=1 deploys without a passed check (emergencies only).
set -euo pipefail
HOST=${HOST:-dmit}
REPO=seasonsolt/news-e-accs
HERE=$(cd "$(dirname "$0")" && pwd)

remote() { ssh -x "$HOST" "bash -s -- $*" <"$HERE/remote.sh"; }

case "${1:-}" in
  --status) remote status; exit ;;
  --rollback) remote rollback "${2:-}"; exit ;;
  -*) sed -n '2,7p' "$0"; exit 1 ;;
esac

git -C "$HERE" fetch -q origin
sha=$(git -C "$HERE" rev-parse --verify "${1:-origin/main}^{commit}")
git -C "$HERE" merge-base --is-ancestor "$sha" origin/main || { echo "error: $sha is not on origin/main; push it first" >&2; exit 1; }
[ "$(git -C "$HERE" rev-parse HEAD)" = "$sha" ] || echo "note: deploying $(git -C "$HERE" log --oneline -1 "$sha"), not your HEAD"

if [ "${SKIP_CI:-}" = 1 ]; then
  echo "warning: SKIP_CI=1, deploying without a passed check"
else
  ci=$(gh run list -R "$REPO" --workflow check.yml --commit "$sha" -L 1 --json status,conclusion -q '.[0] | "\(.status) \(.conclusion)"')
  [ "$ci" = "completed success" ] || { echo "error: the check for $sha is '${ci:-not found}', not 'completed success'; see gh run list -R $REPO" >&2; exit 1; }
fi

echo "deploying $(git -C "$HERE" log --oneline -1 "$sha") to $HOST"
remote deploy "$sha"
