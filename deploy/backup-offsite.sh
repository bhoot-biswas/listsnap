#!/bin/bash
# Nightly encrypted copy of the backups (database dumps and media snapshots) off this
# server, so losing the disk or the server doesn't lose them too. Installed by DEPLOY.md to
# /etc/cron.daily/listsnap-offsite, which runs after listsnap-db and listsnap-media.
#
# restic encrypts everything here before it leaves, so the bucket only ever holds
# ciphertext, and only sends what changed since the night before. The repository and its
# keys are in /etc/listsnap/offsite.env (DEPLOY.md, "Off-site backups"); until that file
# exists the script says so and stops.
set -euo pipefail
CONF=${OFFSITE_CONF:-/etc/listsnap/offsite.env}
SRC=${BACKUP_DIR:-/var/backups/listsnap}
if [ ! -f "$CONF" ]; then
  echo "listsnap-offsite: $CONF isn't set up, so nothing was copied off the server" >&2
  exit 0
fi
set -a
# shellcheck disable=SC1090
. "$CONF"
set +a
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is missing from $CONF}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD is missing from $CONF}"

# the first night makes the repository; every other night it is already there
restic cat config >/dev/null 2>&1 || restic init
# half-written files are never a backup
restic backup --quiet --tag nightly --exclude '*.partial' "$SRC"
restic forget --quiet --tag nightly --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
# once a week, read back a sample of what is stored, so a damaged repository shows up
# before it is needed
if [ "$(date +%u)" = 7 ]; then restic check --quiet --read-data-subset=10%; fi
echo "listsnap-offsite: $(restic snapshots --quiet --tag nightly --latest 1 --compact | tail -n +3 | head -n 1)"
