#!/bin/bash
# Proves a database dump can be restored: loads it into two scratch databases
# (listsnap_drill, store_drill), compares row counts with the live ones, and drops them.
# The live databases are never written. Run as root; DEPLOY.md, "Restoring", says when.
#
#   restore-drill.sh                      the newest nightly dump in /var/backups/listsnap
#   restore-drill.sh path/to/db-….sql.gz  a dump of your choice (one restored from R2, say)
set -euo pipefail
DUMP=${1:-$(ls -1t /var/backups/listsnap/db-20??-??-??.sql.gz | head -n 1)}
[ -f "$DUMP" ] || { echo "restore-drill: no dump at $DUMP" >&2; exit 1; }
gzip -dc "$DUMP" | tail -n 1 | grep -q '^-- Dump completed' || {
  echo "restore-drill: $DUMP is incomplete" >&2
  exit 1
}

SQL=$(mktemp)
drop() {
  rm -f "$SQL"
  mariadb -e 'DROP DATABASE IF EXISTS listsnap_drill; DROP DATABASE IF EXISTS store_drill'
}
trap drop EXIT
drop
# a --databases dump names its databases only in these lines: point them at the scratch ones
gzip -dc "$DUMP" |
  sed -E 's/^(CREATE DATABASE [^`]*`)(listsnap|store)`/\1\2_drill`/; s/^USE `(listsnap|store)`;/USE `\1_drill`;/' >"$SQL"
# nothing may still point at a live database: loading it would write over production
if grep -qE '^(USE|CREATE DATABASE)\b' "$SQL" && grep -E '^(USE|CREATE DATABASE)\b' "$SQL" | grep -qvE '`(listsnap|store)_drill`'; then
  echo "restore-drill: the dump names a database other than the scratch ones; nothing was loaded" >&2
  exit 1
fi
mariadb <"$SQL"

echo "restore-drill: $DUMP"
printf '  %-22s %10s %10s\n' table restored live
fail=0
for t in workspaces user jobs listings media job_steps store_connections api_calls; do
  restored=$(mariadb -N -e "SELECT COUNT(*) FROM listsnap_drill.\`$t\`")
  live=$(mariadb -N -e "SELECT COUNT(*) FROM listsnap.\`$t\`")
  printf '  %-22s %10s %10s\n' "$t" "$restored" "$live"
  # a dump is older than the live data, never bigger, and an empty one is no backup
  if [ "$restored" -gt "$live" ] || { [ "$live" -gt 0 ] && [ "$restored" -eq 0 ]; }; then fail=1; fi
done
products=$(mariadb -N -e "SELECT COUNT(*) FROM store_drill.wp_posts WHERE post_type = 'product'" 2>/dev/null || echo "?")
printf '  %-22s %10s\n' "store products" "$products"
[ $fail -eq 0 ] && echo "restore-drill: ok" || { echo "restore-drill: counts look wrong" >&2; exit 1; }
