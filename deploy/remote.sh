#!/usr/bin/env bash
# The server side of deploy/update.sh, which pipes this file over ssh and runs it as root:
#   remote.sh deploy <sha> | rollback [sha] | status
# Layout (deploy/README.md):
#   /srv/eacc/repo          git checkout, only fetched from (deploy key of user eacc)
#   /srv/eacc/builds/<sha>  one installed and built version each; the newest KEEP are kept
#   /srv/eacc/app           symlink to the live build; the systemd units run from here
#   /srv/eacc/.env          configuration shared by every build
# A build is switched in only once it is installed and built, and checked with /api/health (which must
# report its sha) and scripts/smoke.ts. A failed check switches the previous build back in.
set -euo pipefail

ROOT=${ROOT:-/srv/eacc}
NODE_BIN=${NODE_BIN:-/opt/node24/bin}
UNIT_DIR=${UNIT_DIR:-/etc/systemd/system}
KEEP=5
APP=$ROOT/app
BUILDS=$ROOT/builds
LOG=$BUILDS/deploys.log

say() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
as_eacc() { sudo -u eacc -H env "PATH=$NODE_BIN:/usr/bin:/bin" bash -c "set -euo pipefail; $1"; }
record() { printf '%s %s %s\n' "$(date -u +%FT%TZ)" "$1" "$2" >>"$LOG"; }
live_sha() { [ -L "$APP" ] && basename "$(readlink "$APP")" || echo none; }

# The first deploy turns the old in-place checkout into this layout. The old checkout, still installed and
# built, becomes the repo and stays runnable, so it is the build that a failed first deploy goes back to.
adopt_old_checkout() {
  [ -L "$APP" ] && return
  [ -d "$APP/.git" ] || die "$APP is neither the live-build symlink nor the old checkout"
  say "moving the old checkout to $ROOT/repo and its .env to $ROOT/.env"
  [ -e "$ROOT/.env" ] || install -m 600 -o eacc -g eacc "$APP/.env" "$ROOT/.env"
  [ -e "$ROOT/repo" ] && die "$ROOT/repo already exists"
  mv "$APP" "$ROOT/repo"
  ln -s "$ROOT/repo" "$APP"
}

build() {
  local sha=$1 dir=$BUILDS/$1
  if [ -f "$dir/.built" ]; then say "build $sha is already there"; return; fi
  say "building $sha"
  rm -rf "$dir.tmp"
  as_eacc "
    git -C '$ROOT/repo' fetch -q origin
    mkdir -p '$dir.tmp'
    git -C '$ROOT/repo' archive '$sha' | tar -x -C '$dir.tmp'
    cd '$dir.tmp'
    ln -s '$ROOT/.env' .env
    echo 'AIHOT_RELEASE=$sha' > .release.env
    npm ci --no-audit --no-fund --loglevel=error
    npm run build -w @aihot/web >/dev/null
    touch .built"
  mv "$dir.tmp" "$dir"
}

# Points the app symlink at a build (atomically) and restarts the services from it, using that build's units.
# Every step returns on failure: set -e does not apply inside a function called as a condition.
activate() {
  local target=$1
  ln -sfn "$target" "$APP.next" && mv -T "$APP.next" "$APP" || return 1
  install -m 644 "$target"/deploy/systemd/*.service "$UNIT_DIR/" || return 1
  if [ -d "$target/deploy/systemd/eacc-.service.d" ]; then
    install -d "$UNIT_DIR/eacc-.service.d" && install -m 644 "$target"/deploy/systemd/eacc-.service.d/*.conf "$UNIT_DIR/eacc-.service.d/" || return 1
  fi
  systemctl daemon-reload || return 1
  # The api runs migrations and the seed before it starts; the web serves through the api.
  systemctl restart eacc-api || { echo "eacc-api did not start"; return 1; }
  wait_healthy http://127.0.0.1:3001/api/health || { echo "the api does not answer /api/health"; return 1; }
  systemctl restart eacc-web || { echo "eacc-web did not start"; return 1; }
  # The worker lets a paid model call in flight finish before it stops (up to 210 s).
  systemctl restart eacc-worker || { echo "eacc-worker did not start"; return 1; }
}

wait_healthy() {
  local _
  for _ in $(seq 1 60); do curl -fsS -o /dev/null "$1" 2>/dev/null && return; sleep 1; done
  return 1
}

verify() {
  local sha=$1 release
  wait_healthy http://127.0.0.1:3000/api/health || { echo "the site does not answer /api/health"; return 1; }
  release=$(curl -fsS http://127.0.0.1:3000/api/health | sed -n 's/.*"release":"\([^"]*\)".*/\1/p')
  [ "$release" = "$sha" ] || { echo "the site reports release '$release', expected $sha"; return 1; }
  local unit
  for unit in eacc-api eacc-web eacc-worker; do
    systemctl is-active --quiet "$unit" || { echo "$unit is not active"; return 1; }
  done
  as_eacc "cd '$APP' && node scripts/smoke.ts --base http://127.0.0.1:3000" || { echo "smoke check failed"; return 1; }
}

prune() {
  local live keep dir
  live=$(live_sha)
  # Newest first; the live build is always kept.
  keep=$(ls -1t "$BUILDS" | grep -E '^[0-9a-f]{40}$' | head -n "$KEEP" || true)
  for dir in "$BUILDS"/*; do
    local name; name=$(basename "$dir")
    [[ $name =~ ^[0-9a-f]{40}(\.tmp)?$ ]] || continue
    [ "$name" = "$live" ] && continue
    grep -qx "$name" <<<"$keep" && continue
    say "removing old build $name"
    rm -rf "$dir"
  done
}

lock() {
  install -d -o eacc -g eacc "$BUILDS"
  exec 9>"$BUILDS/.lock"
  flock -n 9 || die "another deploy is running"
}

deploy() {
  local sha=${1:?usage: deploy <sha>} previous
  [[ $sha =~ ^[0-9a-f]{40}$ ]] || die "expected a full commit sha, got '$sha'"
  lock
  adopt_old_checkout
  previous=$(readlink "$APP")
  if [ "$previous" = "$BUILDS/$sha" ] && verify "$sha"; then say "$sha is already live"; return; fi
  build "$sha"
  say "switching to $sha (was $(basename "$previous"))"
  if activate "$BUILDS/$sha" && verify "$sha"; then
    record deploy "$sha"
    say "live: $sha"
    prune
    return
  fi
  say "checks failed; switching back to $(basename "$previous")"
  activate "$previous" || say "switching back did not finish cleanly"
  record failed "$sha"
  if wait_healthy http://127.0.0.1:3000/api/health; then say "back on $(basename "$previous")"; else say "the previous build does not answer either"; fi
  exit 1
}

rollback() {
  lock
  [ -L "$APP" ] || die "nothing to roll back to: no deploy has run with this layout yet"
  local current target
  current=$(live_sha)
  if [ -n "${1:-}" ]; then
    target=$BUILDS/$1
  else
    # The build that was live before the current one: the last successful deploy or rollback of another sha.
    local prev; prev=$(awk -v cur="$current" '($2=="deploy" || $2=="rollback") && $3!=cur {s=$3} END {print s}' "$LOG" 2>/dev/null || true)
    [ -n "$prev" ] && target=$BUILDS/$prev || target=$ROOT/repo
  fi
  [ -f "$target/.built" ] || [ "$target" = "$ROOT/repo" ] || die "no complete build at $target"
  say "rolling back from $current to $(basename "$target")"
  activate "$target" || die "the rollback did not finish; see journalctl -u 'eacc-*'"
  wait_healthy http://127.0.0.1:3000/api/health || die "the site does not answer /api/health after the rollback"
  record rollback "$(basename "$target")"
  say "live: $(basename "$target")"
}

status() {
  say "live: $(live_sha)"
  systemctl is-active eacc-api eacc-worker eacc-web cloudflared-news | paste -sd ' ' - | sed 's/^/    api worker web tunnel: /' || true
  say "builds (newest first)"
  ls -1t "$BUILDS" 2>/dev/null | grep -E '^[0-9a-f]{40}$' | sed 's/^/    /' || true
  say "recent deploys"
  tail -n 5 "$LOG" 2>/dev/null | sed 's/^/    /' || true
}

case "${1:-}" in
  deploy) deploy "${2:-}" ;;
  rollback) rollback "${2:-}" ;;
  status) status ;;
  *) die "usage: remote.sh deploy <sha> | rollback [sha] | status" ;;
esac
