#!/usr/bin/env bash
# Pull main and restart news.e-accs.com on the server. Run from your machine:
#   deploy/update.sh            (ssh host alias "dmit", override with HOST=...)
# The api unit runs migrations and the seed before it starts, so a restart applies them.
set -euo pipefail
HOST=${HOST:-dmit}
ssh -x "$HOST" 'set -e
sudo -u eacc -H bash -c "set -e; export PATH=/opt/node24/bin:\$PATH; cd ~/app
  git pull --ff-only -q
  npm ci --no-audit --no-fund --loglevel=error
  npm run build -w @aihot/web >/dev/null"
install -m 644 /srv/eacc/app/deploy/systemd/*.service /etc/systemd/system/
systemctl daemon-reload
systemctl restart eacc-api eacc-web
# The worker lets a paid model call in flight finish before it stops (up to 210 s).
systemctl restart eacc-worker
systemctl is-active eacc-api eacc-worker eacc-web cloudflared-news
sudo -u eacc git -C /srv/eacc/app log --oneline -1'
