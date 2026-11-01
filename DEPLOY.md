# Deploying ListSnap

ListSnap runs on one Ubuntu 24.04 VPS with:

- the app at **getlistsnap.com**;
- the demo WooCommerce store at **store.getlistsnap.com**;
- MariaDB for both.

The config files are in [`deploy/`](deploy). Run every command below on the server as root (`ssh root@YOUR_SERVER_IP`), in order. Steps 3–7 share shell variables, so keep one SSH session open from step 3 to step 7.

**Before you start:** the DNS `A` records for `@` and `store` (and the `www` CNAME) must point at the server, and `dig +short getlistsnap.com` must show its IP. If the hPanel VPS firewall is on, allow ports 22, 80 and 443 there.

## 1. Base system

```bash
apt update && apt -y upgrade
apt -y install nginx mariadb-server git curl unzip ufw fail2ban \
  php8.3-fpm php8.3-mysql php8.3-curl php8.3-gd php8.3-intl php8.3-mbstring php8.3-xml php8.3-zip
# reels and voice notes: ffmpeg encodes them, and headless Chrome (fetched by deploy.sh) needs these libraries
apt -y install ffmpeg libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64 libpango-1.0-0 libcairo2
# 2 GB of swap: a safety net for the build
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
# only SSH and the web from outside
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
```

## 2. Node.js 24 and pnpm

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt -y install nodejs
corepack enable
node -v   # v24.x
```

## 3. App user, folders and code

```bash
useradd --system --create-home --home-dir /var/lib/listsnap --shell /usr/sbin/nologin listsnap
mkdir -p /var/lib/listsnap/media /srv/listsnap /etc/listsnap
chown -R listsnap:listsnap /var/lib/listsnap /srv/listsnap
sudo -u listsnap git clone https://github.com/bhoot-biswas/listsnap.git /srv/listsnap
```

## 4. Databases and settings

This creates two databases with random passwords, and the app's settings file with fresh secrets. AI, store and Instagram start in **mock** mode, so the first deploy is free and safe; step 8 turns them on.

```bash
DBPW=$(openssl rand -hex 24)
STOREPW=$(openssl rand -hex 24)
mariadb <<SQL
CREATE DATABASE listsnap CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE store CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'listsnap'@'localhost' IDENTIFIED BY '$DBPW';
CREATE USER 'listsnap'@'127.0.0.1' IDENTIFIED BY '$DBPW';
GRANT ALL ON listsnap.* TO 'listsnap'@'localhost';
GRANT ALL ON listsnap.* TO 'listsnap'@'127.0.0.1';
CREATE USER 'store'@'localhost' IDENTIFIED BY '$STOREPW';
GRANT ALL ON store.* TO 'store'@'localhost';
SQL

cat > /etc/listsnap/env <<EOF
NEXT_PUBLIC_SITE_URL=https://getlistsnap.com
DATABASE_URL=mysql://listsnap:$DBPW@127.0.0.1:3306/listsnap
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
CREDENTIALS_KEY=$(openssl rand -base64 32)
MEDIA_DIR=/var/lib/listsnap/media
AUTH_IP_HEADER=x-real-ip
PROVIDER_MODE_META=mock
PROVIDER_MODE_WOO=mock
PROVIDER_MODE_SHOPIFY=mock
PROVIDER_MODE_INSTAGRAM=mock
EOF
chown root:listsnap /etc/listsnap /etc/listsnap/env
chmod 750 /etc/listsnap && chmod 640 /etc/listsnap/env
# next build and next start read this link
sudo -u listsnap ln -s /etc/listsnap/env /srv/listsnap/.env.production.local
```

The secrets live only in `/etc/listsnap/env` on the server. Don't copy them anywhere else, and never commit them.

## 5. First deploy

```bash
cp /srv/listsnap/deploy/listsnap.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable listsnap
bash /srv/listsnap/deploy/deploy.sh
```

The deploy script pulls `main`, installs packages, migrates the database, builds (about a minute) and restarts the app. It ends with `✓ Live:` and the health report: `"database":"ok"`, `"media":"ok"`, and all secrets `true`.

## 6. Nginx and HTTPS

```bash
cp /srv/listsnap/deploy/nginx-app.conf /etc/nginx/sites-available/listsnap
cp /srv/listsnap/deploy/nginx-store.conf /etc/nginx/sites-available/store
ln -s /etc/nginx/sites-available/listsnap /etc/nginx/sites-enabled/listsnap
ln -s /etc/nginx/sites-available/store /etc/nginx/sites-enabled/store
rm -f /etc/nginx/sites-enabled/default
mkdir -p /var/www/store && chown www-data:www-data /var/www/store
nginx -t && systemctl reload nginx

apt -y install certbot python3-certbot-nginx
certbot --nginx --redirect --agree-tos --no-eff-email -m YOUR_EMAIL \
  -d getlistsnap.com -d www.getlistsnap.com -d store.getlistsnap.com
```

Replace `YOUR_EMAIL` with your address; Let's Encrypt only uses it for expiry warnings. Certificates renew automatically. `https://getlistsnap.com` now shows ListSnap.

## 7. The demo store

```bash
curl -fsSL -o /usr/local/bin/wp https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar
chmod +x /usr/local/bin/wp
wp_store() { sudo -u www-data WP_CLI_CACHE_DIR=/tmp/wp-cli wp --path=/var/www/store "$@"; }

wp_store core download
wp_store config create --dbname=store --dbuser=store --dbpass="$STOREPW" --dbhost=localhost
wp_store core install --url=https://store.getlistsnap.com --title="ListSnap demo store" \
  --admin_user=admin --admin_email=YOUR_EMAIL --skip-email
wp_store option update blog_public 0
wp_store rewrite structure '/%postname%/' --hard
wp_store plugin install woocommerce --activate
wp_store eval-file /srv/listsnap/deploy/store-setup.php
```

- **Admin password:** `core install` prints `Admin password: …`. Save it in your password manager; it's how you, and later the judges, log in to `https://store.getlistsnap.com/wp-admin`.
- **Store keys:** the last command prints three lines, `DEMO_WOO_URL`, `DEMO_WOO_KEY` and `DEMO_WOO_SECRET`. Add them to the settings file in step 8.

## 8. Turn on the real services

Open the settings file:

```bash
nano /etc/listsnap/env
```

Then:

- **The demo store:** paste the three `DEMO_WOO_…` lines from step 7, and set `PROVIDER_MODE_WOO=live`.
- **Shopify:** see "Shopify" below. Until the app is registered, leave `PROVIDER_MODE_SHOPIFY=mock`.
- **Meta AI:** add `MODEL_API_KEY=…` and set `PROVIDER_MODE_META=live`. Set a spend alert on the Meta side too.
- **Reels:** set `PROVIDER_MODE_VIDEO=live`. On a 2-vCPU server also add `REEL_WORKERS=1`: a 12 s reel takes about 46 s and under 900 MB either way, and one worker leaves a core for the app.
- **Email sign-in:** create a mailbox in hPanel (for example `hello@getlistsnap.com`), then add:

  ```
  SMTP_HOST=smtp.hostinger.com
  SMTP_PORT=465
  SMTP_USER=hello@getlistsnap.com
  SMTP_PASS=…
  MAIL_FROM=ListSnap <hello@getlistsnap.com>
  ```

  Without SMTP, email sign-in is hidden; the demo shop still works.

- **Google sign-in (optional):** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, with `https://getlistsnap.com/api/auth/callback/google` as the redirect URI in Google Cloud.

Save with Ctrl+O, then Enter, and exit with Ctrl+X. Then restart:

```bash
systemctl restart listsnap
```

Only `NEXT_PUBLIC_SITE_URL` needs a rebuild (`deploy.sh`) when changed; everything else needs just the restart.

In production the health check also checks these settings: the site URL must be `https`, `BETTER_AUTH_SECRET` at least 32 characters, `CREDENTIALS_KEY` 32 bytes in base64, and each live service needs its key. If one is missing, the health check answers `503` with `"config":"incomplete"`, and on the server it names the setting (never its value).

## 9. Backups

```bash
install -m 755 /srv/listsnap/deploy/backup-db.sh /etc/cron.daily/listsnap-db
install -m 755 /srv/listsnap/deploy/backup-media.sh /etc/cron.daily/listsnap-media
/etc/cron.daily/listsnap-db && /etc/cron.daily/listsnap-media && ls -lh /var/backups/listsnap /var/backups/listsnap/media
```

Both databases are dumped every night and kept for 7 days. Seller media (`/var/lib/listsnap/media`) gets a snapshot every night, also kept for 7; files that didn't change are hard links to the night before, so each night costs only what's new. Both are on the same disk: they cover mistakes and bad deploys, and Hostinger's VPS snapshots cover losing the disk.

Demo shops expire after a day. Delete them, with their photos and their drafts in the demo store, every night after the backup. The same run deletes cutouts no listing uses any more (left behind when a photo is cut out again):

```bash
cat > /etc/cron.d/listsnap-demo <<'EOF'
30 4 * * * listsnap cd /srv/listsnap && /usr/bin/node --env-file=/etc/listsnap/env scripts/cleanup-demo.mjs >>/var/log/listsnap-demo.log 2>&1
EOF
touch /var/log/listsnap-demo.log && chown listsnap /var/log/listsnap-demo.log
sudo -u listsnap sh -c 'cd /srv/listsnap && node --env-file=/etc/listsnap/env scripts/cleanup-demo.mjs --dry-run'
```

## 10. Lock down SSH

Do this once you can log in with an SSH key. If you used a password so far, run this first **from your Mac**:

```bash
ssh-copy-id root@YOUR_SERVER_IP
```

Then, on the server:

```bash
printf 'PasswordAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/00-listsnap.conf
sshd -t && systemctl reload ssh
```

**Before you close this session**, open a second terminal and check that `ssh root@YOUR_SERVER_IP` still logs you in. If it doesn't, delete the file and reload SSH from the first session.

## 11. Check it works

1. **Health:** `https://getlistsnap.com/api/health` should answer `200` with `"database":"ok"`, `"media":"ok"` and `"config":"ok"`. On the server, `curl -s localhost:3000/api/health` also shows the providers, which should read `live` for the ones you turned on, and the secrets; visitors see only the first four fields.
2. **Email sign-in:** the email should arrive from `MAIL_FROM`.
3. **Store:** in shop setup, choose the demo store.
4. **A real product:** snap one. It should cost about $0.06 on the Meta key.
5. **The draft:** save it to the store, and find it under **Products → Drafts** in `store.getlistsnap.com/wp-admin`.
6. **Usage:** the page should list the AI calls with their cost.
7. **Demo shop:** in a private window, choose **Try the demo shop** and make one listing.
8. **404:** `https://getlistsnap.com/nope` should show the "not found" page.

## Later deploys

After merging to `main`:

```bash
ssh root@YOUR_SERVER_IP bash /srv/listsnap/deploy/deploy.sh
```

New migrations run as part of it. The site is unavailable for about a minute while it builds, so deploy when no one is mid-listing.

## When something's wrong

| What      | Where to look                                               |
| --------- | ----------------------------------------------------------- |
| The app   | `journalctl -u listsnap -n 100` (add `-f` to follow)        |
| Nginx     | `tail -n 50 /var/log/nginx/error.log`                       |
| A deploy  | The output of `deploy.sh`; it stops at the step that failed |
| Is it up? | `curl -s localhost:3000/api/health`                         |

**Daily limits:** 20 listings and 60 AI photos per shop per day, reset at midnight UTC (6:00 AM in Bangladesh). Demo shops are also capped at 20 listings per visitor per day. A shop's limits are the `daily_listing_limit` and `daily_image_limit` columns on `workspaces`.

## Alternative: Hostinger shared hosting

ListSnap also runs as a Hostinger **Node.js web app** on the Business or Cloud plans. Hostinger builds the repo itself and forces standalone output.

- **App settings:** application type `next`, build script `build`, output `.next`, Node 24.
- **Variables:** the same as above, set in hPanel, with `MEDIA_DIR` an absolute path in your home folder.
- **Migrations:** they run in the build when the database is reachable from it. If not, run the `db/migrations` files in order in phpMyAdmin and add their names to `listsnap_migrations`.

Hostinger doesn't publish request-time or memory limits for these apps, so test a full listing early. Studio photos take about 30 seconds.

To try a standalone build locally:

1. Add `output: "standalone"` to `next.config.ts` and run `pnpm build`.
2. Copy `public` and `.next/static` into `.next/standalone`.
3. Start the `listsnap-standalone` entry in `.claude/launch.json` (port 3001).
4. Remove the `output` line afterwards.

## Shopify

Sellers connect Shopify with OAuth, so ListSnap is a public Shopify app. Until Shopify approves its App Store listing, it installs only on development stores.

1. In the [Shopify Dev Dashboard](https://dev.shopify.com/dashboard), create the app with **public distribution** (this can't be changed later).
2. Copy `shopify.app.toml.example` to `shopify.app.toml`, fill in `client_id`, and deploy the config with `shopify app deploy`. It sets the scopes, the redirect URL `https://getlistsnap.com/api/shopify/callback` and the webhooks (`app/uninstalled` and the three privacy topics) at `https://getlistsnap.com/api/shopify/webhooks`.
3. In `/etc/listsnap/env` add `SHOPIFY_CLIENT_ID=…` and `SHOPIFY_CLIENT_SECRET=…` from the app's Settings, set `PROVIDER_MODE_SHOPIFY=live`, and `systemctl restart listsnap`.
4. Check: on Connections, connect a dev store. Shopify asks to approve ListSnap, then the card shows "Connected" with every check passing. Save a listing; it appears in the store's admin as a draft with its photos.

**The Shopify demo store** (optional): create a dev store from the Dev Dashboard's **Dev stores** page (so it's in our organisation) and set its currency to BDT. Create a second app there with the same three scopes, install it on that store, and add `DEMO_SHOPIFY_SHOP=…myshopify.com`, `DEMO_SHOPIFY_CLIENT_ID=…` and `DEMO_SHOPIFY_CLIENT_SECRET=…`. Sellers can then pick "Use the demo store" on the Shopify card. Demo shops (the "Try the demo" button) still save to the WooCommerce demo store.

Shopify's offline tokens last about an hour and are refreshed on the next save; a refresh token lasts 90 days, so a shop that saves nothing for 90 days is asked to connect again. Bump `SHOPIFY_API_VERSION` once a year; each version is supported for at least 12 months.
