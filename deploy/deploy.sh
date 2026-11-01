#!/usr/bin/env bash
# Puts the latest main live without touching the running site until the new build is
# ready. Each deploy unpacks, installs and builds in a release folder of its own; only
# then does the `current` link switch and the app restart. A failed health check switches
# straight back. The last few releases stay, so going back is one command.
#
# Runs as root from a root-owned copy, installed by DEPLOY.md step 5:
#   /usr/local/sbin/listsnap-deploy              deploy origin/main
#   /usr/local/sbin/listsnap-deploy --rebuild    build the live commit again (after changing
#                                                NEXT_PUBLIC_SITE_URL, which is built in)
#   /usr/local/sbin/listsnap-deploy --rollback   go back to the release before this one
set -euo pipefail

APP=/srv/listsnap # the checkout: the source releases are made from, never run itself
# Outside the checkout: a build below another project's lockfile, packages and .git took
# more than twice the memory (over 5 GB). The link sits in root's /srv, so the app user
# can't repoint it.
RELEASES=/srv/listsnap-releases
CURRENT=/srv/listsnap-current
ENV=/etc/listsnap/env
SELF=/usr/local/sbin/listsnap-deploy
KEEP=3

# The app user owns $APP, so anything that runs as it (the app, a package's install
# script, the build) can change this file there. Root only runs a copy that the app user
# can't write.
if [ "$(realpath "$0")" != "$SELF" ] || [ -z "$(find "$SELF" -user root ! -perm /022)" ]; then
  echo "✗ Run $SELF, a root-owned copy of this script; see DEPLOY.md step 5." >&2
  exit 1
fi

# Files root runs or loads, and where they are installed. The copies in $APP are never
# installed from there, for the same reason as above.
ROOT_FILES=(
  "deploy.sh:$SELF"
  "listsnap.service:/etc/systemd/system/listsnap.service"
  "backup-db.sh:/etc/cron.daily/listsnap-db"
  "backup-media.sh:/etc/cron.daily/listsnap-media"
  "listsnap-demo.cron:/etc/cron.d/listsnap-demo"
)

# everything but switching and restarting runs as the app's own user
as_app() { sudo -u listsnap -H env COREPACK_ENABLE_DOWNLOAD_PROMPT=0 bash -c "$*"; }

# The build shares the server with the live app. Uncaged, a build grew past 6 GB with its
# workers and the kernel killed what it could; in a cage it needs about 2 GB, a runaway one
# is the only thing killed, and one CPU stays free for the site.
caged() {
  systemd-run --scope --quiet -p MemoryMax=3G -p MemorySwapMax=0 -p CPUQuota=100% \
    sudo -u listsnap -H env COREPACK_ENABLE_DOWNLOAD_PROMPT=0 bash -c "$*"
}

health() {
  for _ in $(seq 1 30); do
    if body=$(curl -fsS http://127.0.0.1:3000/api/health 2>/dev/null); then
      echo "$body"
      return 0
    fi
    sleep 1
  done
  return 1
}

# a new link renamed over the old one, so `current` is never missing or half-written
switch_to() {
  ln -sfn "$1" "$CURRENT.new"
  mv -Tf "$CURRENT.new" "$CURRENT"
  systemctl restart listsnap
}

# the newest finished release that isn't live; a build that failed has no BUILD_ID
previous() {
  local live d
  live=$(readlink -f "$CURRENT" 2>/dev/null || true)
  for d in $(ls -1dt "$RELEASES"/*/ 2>/dev/null); do
    d=${d%/}
    if [ "$d" != "$live" ] && [ -f "$d/.next/BUILD_ID" ]; then
      echo "$d"
      return
    fi
  done
}

if [ "${1:-}" = "--rollback" ]; then
  prev=$(previous)
  [ -n "$prev" ] || { echo "✗ There is no earlier release to go back to." >&2; exit 1; }
  echo "→ Switching back to $(basename "$prev")"
  switch_to "$prev"
  if body=$(health); then echo "✓ Live: $body"; exit 0; fi
  echo "✗ The app didn't answer. See: journalctl -u listsnap -n 50" >&2
  exit 1
fi

echo "→ Pulling main"
as_app "cd $APP && git fetch --quiet origin main && git reset --hard --quiet origin/main"

# A changed root file stops the deploy before anything is built: it is copied where only
# root can write, so what is shown is exactly what gets installed, and a person reads the
# diff before installing it.
STAGE=$(mktemp -d)
changed=()
for entry in "${ROOT_FILES[@]}"; do
  name=${entry%%:*} dest=${entry#*:}
  cp "$APP/deploy/$name" "$STAGE/$name"
  cmp -s "$STAGE/$name" "$dest" || changed+=("$entry")
done
if [ ${#changed[@]} -gt 0 ]; then
  echo "✗ main changes files that run as root. Read the diff, check it matches what was merged:" >&2
  for entry in "${changed[@]}"; do diff -uN --label "${entry#*:}" "${entry#*:}" "$STAGE/${entry%%:*}" >&2 || true; done
  echo "  Then install them and deploy again:" >&2
  for entry in "${changed[@]}"; do
    name=${entry%%:*}
    case $name in *.service | *.cron) mode=644 ;; *) mode=755 ;; esac
    echo "    install -m $mode $STAGE/$name ${entry#*:}" >&2
  done
  echo "    systemctl daemon-reload && $SELF" >&2
  exit 1
fi
rm -r "$STAGE"

SHA=$(as_app "cd $APP && git rev-parse --short=12 HEAD")
if [ "${1:-}" != "--rebuild" ] && [[ "$(readlink -f "$CURRENT" 2>/dev/null || true)" == *-"$SHA" ]]; then
  echo "✓ $SHA is already live. To build it again, add --rebuild."
  exit 0
fi
# a new folder even for the same commit, so the live one is never rebuilt in place
REL=$RELEASES/$(date +%Y%m%d-%H%M%S)-$SHA
live=$(readlink -f "$CURRENT" 2>/dev/null || true)

echo "→ Unpacking $SHA"
install -d -o listsnap -g listsnap "$RELEASES"
# the settings link is what next build and next start read
as_app "mkdir -p $REL && cd $APP && git archive HEAD | tar -x -C $REL && ln -s $ENV $REL/.env.production.local"
echo "→ Installing packages"
as_app "cd $REL && pnpm install --frozen-lockfile"
# reels need the Chrome build that matches this HyperFrames version; a no-op when it's there
echo "→ Checking the reel browser"
as_app "cd $REL && node node_modules/hyperframes/bin/hyperframes.mjs browser ensure"
# Migrations run before the switch, while the old release still serves, so each one must
# leave the database usable by the release before it (add, don't rename or drop).
echo "→ Migrating the database"
as_app "cd $REL && node --env-file=$ENV scripts/db-migrate.mjs"
# The live release's build cache makes the build take seconds instead of a minute. It is
# copied, not linked: the build rewrites it, and the live release may be needed again.
if [ -n "$live" ] && [ -d "$live/.next/cache/turbopack" ]; then
  echo "→ Reusing the build cache"
  as_app "mkdir -p $REL/.next/cache && cp -a $live/.next/cache/turbopack $REL/.next/cache/"
fi
echo "→ Building"
caged "cd $REL && pnpm exec next build"
# the app's unit mounts its cache folder here, so the folder must exist
as_app "mkdir -p $REL/.next/cache"

echo "→ Switching to $SHA"
switch_to "$REL"
if body=$(health); then
  echo "✓ Live: $body"
  # keep the newest few, and always the live one
  for d in $(ls -1dt "$RELEASES"/*/ | tail -n +$((KEEP + 1))); do
    if [ "${d%/}" != "$REL" ]; then rm -rf "${d%/}"; fi
  done
  exit 0
fi

echo "✗ $SHA didn't pass the health check." >&2
if [ -n "$live" ] && [ -d "$live" ]; then
  echo "→ Switching back to $(basename "$live")" >&2
  switch_to "$live"
  if health >/dev/null; then echo "✓ The previous release is live again." >&2; fi
fi
echo "  See: journalctl -u listsnap -n 50" >&2
exit 1
