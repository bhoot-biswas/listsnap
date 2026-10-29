#!/usr/bin/env bash
# Puts the latest main live: pull, install, migrate, build, restart, then checks health.
# Run on the server as root:  bash /srv/listsnap/deploy/deploy.sh
set -euo pipefail

APP=/srv/listsnap
ENV=/etc/listsnap/env

# everything but the restart runs as the app's own user
as_app() { sudo -u listsnap -H env COREPACK_ENABLE_DOWNLOAD_PROMPT=0 bash -c "cd $APP && $*"; }

echo "→ Pulling main"
as_app "git fetch --quiet origin main && git reset --hard --quiet origin/main"
echo "→ Installing packages"
as_app "pnpm install --frozen-lockfile"
# the migrator reads process.env, not .env files, so it gets the file directly
echo "→ Migrating the database"
as_app "node --env-file=$ENV scripts/db-migrate.mjs"
echo "→ Building"
as_app "pnpm exec next build"
echo "→ Restarting"
systemctl restart listsnap

for _ in $(seq 1 20); do
  if body=$(curl -fsS http://127.0.0.1:3000/api/health 2>/dev/null); then
    echo "✓ Live: $body"
    exit 0
  fi
  sleep 1
done
echo "✗ The app didn't answer. See: journalctl -u listsnap -n 50" >&2
exit 1
