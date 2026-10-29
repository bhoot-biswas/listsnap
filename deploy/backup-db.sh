#!/bin/sh
# Nightly dump of the app and store databases, kept for 7 days. Installed by DEPLOY.md to
# /etc/cron.daily/listsnap-db; runs as root, which MariaDB lets in through its socket.
set -e
DIR=/var/backups/listsnap
mkdir -p "$DIR"
chmod 700 "$DIR"
mariadb-dump --single-transaction --databases listsnap store | gzip >"$DIR/db-$(date +%F).sql.gz"
find "$DIR" -name 'db-*.sql.gz' -mtime +7 -delete
