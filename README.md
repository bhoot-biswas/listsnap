# ListSnap

**Snap a product photo. Get a store listing in English and Bangla.**

ListSnap is for small social-commerce sellers in Bangladesh. One phone photo becomes a WooCommerce draft with a written listing, a clean cutout, studio photos and an Instagram post, in English and Bangla. Built for the Meta Global AI Developer Hackathon (Indie track, "Build for Your World").

> Work in progress. The app shell, sign-in, workspaces and the step-by-step pipeline run end to end on mock models today; the live Meta models and the WooCommerce connection land next.

## How it works

| Step      | Model       | What happens                                                                                                                  |
| --------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Plan      | Muse Spark  | Looks at the photo and picks what to cut out ("jamdani saree"), how many items there are, and the camera angle                |
| Segment   | SAM 3.1     | Finds every matching item, then cuts each one out onto white; also checks fill, sharpness and light                           |
| Group     | Muse Spark  | When there are several items: separate products, a set, or colour variants                                                    |
| Write     | Muse Spark  | The English listing: title, descriptions, attributes, tags, category, a BDT price range and a confidence score                |
| Translate | Muse Spark  | A natural Bangla version, not word-for-word                                                                                   |
| Render    | Muse Image  | Studio and banner photos keep the product's real pixels on a generated background; the lifestyle scene is labelled "AI scene" |
| Save      | WooCommerce | Creates or updates a **draft** product, never a published one                                                                 |

Each step is one short request driven by the browser, with its state and lock in MySQL. A refresh, a second tab or a server restart repeats nothing that already finished.

## Run it locally

Requirements: Node 24, pnpm, Docker.

```bash
pnpm install
cp .env.example .env.local          # then set BETTER_AUTH_SECRET and CREDENTIALS_KEY (openssl rand -base64 32)
pnpm db:up                          # MariaDB 11.4 in Docker on port 3307
pnpm db:migrate
pnpm dev                            # http://localhost:3000
```

Every outside service is mocked by default (`PROVIDER_MODE_*=mock`), so the whole flow works with no keys. Use **Try the demo shop** on the sign-in page, or an email link (in development the link is printed in the server console). Google sign-in appears once `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set.

In mock mode a photo at least twice as wide as it is tall is treated as three different products, which shows the Choose items step.

To save drafts to a real WooCommerce store without a hosted shop, start the local test store. It runs WordPress and WooCommerce in Docker on http://localhost:8080 and writes its REST keys into `.env.local` as the demo store:

```bash
pnpm store:setup
```

Then set `PROVIDER_MODE_WOO=live` in `.env.local`. Demo shops now save their drafts to the local store, which downloads product images from the app through short-lived signed links.

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · MariaDB/MySQL via `mysql2` · Better Auth (Google, magic link, demo) · shadcn/ui (Base UI) · Tailwind CSS v4 · next-intl (English and Bangla) · sharp · Vitest. Hosted on Hostinger.

## Pre-existing code

Parts of the setup are adapted from the author's earlier project, SOHOZ TOOLS: the MySQL pool, the migration runner (`scripts/db-migrate.mjs`), and the Better Auth and email configuration. Everything else was written during the hackathon.

## License

[MIT](LICENSE)
