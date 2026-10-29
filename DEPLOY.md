# Deploying ListSnap on Hostinger

ListSnap runs as a Hostinger **Node.js web app** (Business or Cloud hosting) with a Hostinger MySQL database. Hostinger builds the repo with pnpm, runs Next.js as a server in standalone mode, and restarts it if it crashes. Follow the steps in order; the last one checks that everything works.

## 1. Database

1. hPanel → **Databases → MySQL databases**: create a database and a user, and note the host hPanel shows (often `localhost`).
2. Build the connection string. URL-encode special characters in the password (`@` → `%40`, `#` → `%23`):

   ```
   DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DATABASE
   ```

3. Tables are created by the build: `pnpm build` runs `scripts/db-migrate.mjs`, which applies anything new in `db/migrations` and records it in `listsnap_migrations`. If the build can't reach the database, it stops there, rather than deploying code against old tables.
   - **Without database access from the build:** open phpMyAdmin and run each file in `db/migrations` in number order. Then add each file's name to `listsnap_migrations`, so later builds skip them.

## 2. Media folder

Uploaded and generated photos live outside the app, because each deploy replaces the app folder.

1. hPanel → **File Manager**: create a folder in your home directory, for example `/home/u123456789/listsnap-media`. Use your own user number, shown in the File Manager's path.
2. Set `MEDIA_DIR` to that **absolute** path. A relative path would point inside the build and be wiped on the next deploy.

## 3. Environment variables

`.env.example` lists every variable with comments. For production:

| Variable                                                        | Value                                                                                                                                     |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                                          | `https://your-domain`. It's built into the page code, so set it before the first build.                                                   |
| `DATABASE_URL`                                                  | From step 1.                                                                                                                              |
| `DATABASE_POOL_SIZE`                                            | Leave at 5 unless Hostinger allows more connections per user.                                                                             |
| `BETTER_AUTH_SECRET`                                            | `openssl rand -base64 32`. Changing it later signs everyone out.                                                                          |
| `CREDENTIALS_KEY`                                               | `openssl rand -base64 32`. Encrypts store keys; changing it means reconnecting every store.                                               |
| `MEDIA_DIR`                                                     | From step 2.                                                                                                                              |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | A Hostinger mailbox: `smtp.hostinger.com`, `465`, the full address and its password. Without SMTP, email sign-in is hidden in production. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                      | Optional. Add `https://your-domain/api/auth/callback/google` as a redirect URI in Google Cloud.                                           |
| `PROVIDER_MODE_META`                                            | `live`                                                                                                                                    |
| `MODEL_API_KEY`                                                 | The Meta Model API key. Set a spend alert on the Meta side too.                                                                           |
| `PROVIDER_MODE_WOO`                                             | `live`                                                                                                                                    |
| `DEMO_WOO_URL`, `DEMO_WOO_KEY`, `DEMO_WOO_SECRET`               | The demo store every demo shop saves to: a WooCommerce site with a Read/Write REST API key.                                               |
| `PROVIDER_MODE_INSTAGRAM`                                       | `mock` until Instagram posting is connected.                                                                                              |
| `AUTH_IP_HEADER`                                                | Leave unset (`x-forwarded-for`). It feeds sign-in rate limits and the per-visitor demo limit.                                             |

Never commit these values. Enter them in hPanel, or import them from a local `.env` file that stays on your computer.

## 4. Create the app

hPanel → **Websites → Add website → Node.js web app**, then:

1. **Source:** connect GitHub and pick `bhoot-biswas/listsnap`, branch `main`. Turn on deploy on push if you want every merge to go live.
2. **Settings:**
   - **Application type:** `next`.
   - **Build script:** `build`.
   - **Output directory:** `.next`.
   - **Node.js version:** 24. `package.json` asks for `>=24`.
   - **Package manager:** pnpm, which is detected from `pnpm-lock.yaml`.
3. **Environment variables:** add those from step 3 before the first build.
4. **Deploy.** Hostinger turns on standalone output itself; `next.config.ts` stays as it is. Builds have a 15-minute limit, and a full build takes about a minute.
5. **Domain:** point your domain or subdomain at the app in hPanel and turn on SSL.

## 5. Check it works

1. Open `https://your-domain/api/health`. It should answer `200` with:
   - `"database": "ok"` and the newest file in `db/migrations` as `migration`;
   - `"media": "ok"`;
   - every entry under `secrets` set to `true`.

   A `503` names the part that failed. The build log is under **Deployments** in hPanel.

2. Sign in with an email link. The email should arrive from `MAIL_FROM`.
3. Shop setup: connect a store, or choose the demo store.
4. Snap one real product. It should cost about $0.06 on the Meta key.
5. Save it to the store and find the draft in WooCommerce.
6. Open **Usage**: the AI calls and their cost should be listed.
7. In a private window, choose **Try the demo shop** and make one listing.
8. Open a page that doesn't exist, such as `/nope`. The 404 page should show.

## Later deploys

- **Merging to `main`** redeploys if deploy on push is on. Otherwise press **Redeploy** in hPanel.
- **Changing a variable** redeploys when saved.
- **Migrations** in new files run on the next build.
- **Photos** in `MEDIA_DIR` are kept across deploys.

## Good to know

- **Idle apps:** Hostinger stops an app that has had no traffic for a while. The first request after that is slow while it starts. The pipeline is driven by the browser, so no work is lost.
- **Daily limits:** 20 listings and 60 AI photos per shop per day, reset at midnight UTC (6:00 AM in Bangladesh). Demo shops are also capped at 20 listings per visitor per day. A shop's limits are columns on `workspaces` and can be changed in phpMyAdmin.
- **Trying the production build locally:** after `pnpm build` with `output: "standalone"` added to `next.config.ts`, the `listsnap-standalone` entry in `.claude/launch.json` runs `.next/standalone/server.js` on port 3001. Copy `public` and `.next/static` into `.next/standalone` first, as Hostinger does. Remove the `output` line again afterwards.
