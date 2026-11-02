#!/bin/bash
# Nightly dump of the app and store databases, kept for 7 days. Installed by DEPLOY.md to
# /etc/cron.daily/listsnap-db; runs as root, which MariaDB lets in through its socket.
# A dump that failed must never look like a backup: without pipefail a failed mariadb-dump
# still left a valid, empty gzip, and the prune below then deleted the last good ones.
set -euo pipefail
DIR=${BACKUP_DIR:-/var/backups/listsnap}
mkdir -p "$DIR"
chmod 700 "$DIR"
OUT="$DIR/db-$(date +%F).sql.gz"
TMP="$OUT.partial"
trap 'rm -f "$TMP"' EXIT
mariadb-dump --single-transaction --databases listsnap store | gzip >"$TMP"
# mariadb-dump writes this line last, so a dump cut short anywhere is caught here too
if ! gzip -dc "$TMP" | tail -n 1 | grep -q '^-- Dump completed'; then
  echo "listsnap-db: dump is incomplete, kept the earlier backups" >&2
  exit 1
fi
mv "$TMP" "$OUT"
find "$DIR" -name 'db-*.sql.gz' -mtime +7 -delete
