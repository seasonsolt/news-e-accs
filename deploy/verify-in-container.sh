#!/usr/bin/env bash
set -euo pipefail
[ "$(node -p 'process.versions.node.split(".")[0]')" = 24 ]
npm ci --no-audit --no-fund
node scripts/check-migrations.ts --base "$VERIFY_BASE"
npm run typecheck
npm run build -w @aihot/web
# Run suites sequentially; browser timing assertions must not compete with the database suite.
npm test
node --test --test-concurrency=1 apps/web/tests/*.test.ts

# A separate, seeded database for the actual API + worker + web smoke check.
export DATABASE_URL=postgres://verify:local-verification-only@db:5432/smoke_ci
PGPASSWORD=local-verification-only createdb -h db -U verify smoke_ci
export COLLECT_ENABLED=false MODEL_CALLS_ENABLED=false NODE_ENV=production
node scripts/migrate.ts
node scripts/seed.ts
pids=()
cleanup() { for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done; }
trap cleanup EXIT
node apps/api/src/main.ts > /tmp/api.log 2>&1 & pids+=("$!")
node apps/worker/src/main.ts > /tmp/worker.log 2>&1 & pids+=("$!")
node apps/web/server.ts > /tmp/web.log 2>&1 & pids+=("$!")
ready=false
for ((i=0; i<60; i++)); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then ready=true; break; fi
  sleep 1
done
if ! $ready || ! node scripts/smoke.ts --base http://127.0.0.1:3000 || ! node scripts/mcp-check.ts http://127.0.0.1:3000/api/mcp; then
  tail -n 80 /tmp/api.log /tmp/worker.log /tmp/web.log
  exit 1
fi
printf 'All local release checks passed for %s (migration base %s)\n' "$(git rev-parse HEAD)" "$VERIFY_BASE"
