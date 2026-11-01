#!/bin/sh
# Nightly snapshot of seller media (photos, cutouts, reels, voice notes), kept for 7 nights.
# Files that didn't change are hard links to the night before, so a night costs only what
# is new. Installed by DEPLOY.md to /etc/cron.daily/listsnap-media; runs as root.
# On the same disk: it covers mistakes and bad deploys; VPS snapshots cover losing the disk.
set -e
SRC=$(sed -n 's/^MEDIA_DIR=//p' /etc/listsnap/env)
[ -d "$SRC" ] || { echo "listsnap-media: MEDIA_DIR not found" >&2; exit 1; }
DIR=/var/backups/listsnap/media
mkdir -p "$DIR"
chmod 700 /var/backups/listsnap
TODAY="$DIR/$(date +%F)"
LAST=$(ls -1d "$DIR"/20??-??-?? 2>/dev/null | grep -vx "$TODAY" | tail -n 1 || true)
# into a .partial folder first, so a snapshot that is there is always a whole one
rsync -a --delete ${LAST:+--link-dest="$LAST"} "$SRC/" "$TODAY.partial/"
rm -rf "$TODAY"
mv "$TODAY.partial" "$TODAY"
# by name, not mtime: rsync gives the folder the media folder's own time
ls -1d "$DIR"/20??-??-?? | head -n -7 | xargs -r rm -rf
