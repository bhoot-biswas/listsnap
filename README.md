# ListSnap

**Snap a product photo. Get a store listing in English and Bangla.**

ListSnap is for small social-commerce sellers in Bangladesh. One phone photo, a voice note or a short video of the products becomes a Shopify or WooCommerce draft with a written listing, clean cutouts, studio photos and a reel for Facebook and Instagram, in English and Bangla. Built for the Meta Global AI Developer Hackathon (Indie track, "Build for Your World").

## What it does

- **Snap:** one photo becomes a listing. A voice note adds what the seller said (price, sizes, stock, fabric), which the listing uses over guesses from the photo.
- **Bulk and video uploads:** many photos at once, one listing each. Or film the rack while saying each price, the way sellers do on Facebook Live, and every product becomes its own listing.
- **Review:** checks first, every field editable, AI help buttons on the text, suggested prices, and a shop assistant chat for the listing.
- **Photos:** a clean cutout, studio and banner photos that keep the product's real pixels, labelled AI scenes, and campaign looks for an occasion, all in the shop's brand kit.
- **Save:** drafts in Shopify and WooCommerce (colour variants as variable products), never published ones; also the seller's Facebook catalog, a Facebook Marketplace helper and CSV exports.
- **Reels:** a 12-second video of a listing, posted to the seller's Facebook Page and Instagram after they approve the caption.
- **Assistant:** a shop-wide chat that takes photos and voice, and can start a listing.

## Meta models

Every model ListSnap calls at runtime is a Meta model.

| Model                 | Where it runs                 | What it does in ListSnap                                                                                                                                                     |
| --------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Muse Spark            | Meta Model API (dev.meta.ai)  | Plans each photo, groups items into products, sets or colour variants, writes the English listing and its natural Bangla version, the Review help buttons and the chat       |
| SAM 3.1               | Meta Model API (dev.meta.ai)  | Finds every matching item and cuts it out; checks fill, sharpness, light, overlap and colour on its mask                                                                     |
| Muse Image            | Meta Model API (dev.meta.ai)  | Studio, banner and lifestyle photos, and campaign looks, around the real cutout                                                                                              |
| Muse Voice Transcribe | Meta Model API (dev.meta.ai)  | Writes down voice notes, a video's speech turn by turn with times, and messages spoken into a chat box                                                                       |
| Muse Spark Open       | Baseten (Meta's open weights) | Reads the price, sizes and stock out of what the seller said; watches a product video with its transcript and lists each product; hears the audio itself if Transcribe fails |

## How a listing is made

| Step      | Model                                  | What happens                                                                                                                  |
| --------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Listen    | Muse Voice Transcribe, Muse Spark Open | Optional: the voice note becomes words, then the facts the seller said                                                        |
| Plan      | Muse Spark                             | Picks what to cut out ("jamdani saree"), how many items there are, and the camera angle                                       |
| Segment   | SAM 3.1                                | Cuts each item out onto white and checks the photo                                                                            |
| Group     | Muse Spark                             | When there are several items: separate products, a set, or colour variants                                                    |
| Write     | Muse Spark                             | Title, descriptions, attributes, tags, category, a BDT price range and a confidence score                                     |
| Translate | Muse Spark                             | A natural Bangla version, not word-for-word                                                                                   |
| Render    | Muse Image                             | Studio and banner photos keep the product's real pixels on a generated background; the lifestyle scene is labelled "AI scene" |
| Save      | Shopify, WooCommerce                   | Creates or updates a **draft** product in each connected store                                                                |

Each step is one short request driven by the browser, with its state and lock in MySQL. A refresh, a second tab or a server restart repeats nothing that already finished.

## Run it locally

Requirements: Node 24, pnpm, Docker, and ffmpeg on the PATH for voice notes and videos.

```bash
pnpm install
cp .env.example .env.local          # then set BETTER_AUTH_SECRET and CREDENTIALS_KEY (openssl rand -base64 32)
pnpm db:up                          # MariaDB 11.4 in Docker on port 3307
pnpm db:migrate
pnpm dev                            # http://localhost:3000
```

Every outside service is mocked by default (`PROVIDER_MODE_*=mock`), so the whole flow works with no keys and no account. Use **Try the demo shop** on the sign-in page, or an email link (in development the link is printed in the server console). Google sign-in appears once `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set.

In mock mode a photo at least twice as wide as it is tall is treated as three different products, which shows the Choose items step.

### Live models

Set these in `.env.local` and restart `pnpm dev`:

| Setting                                                                     | Turns on                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `PROVIDER_MODE_META=live`, `MODEL_API_KEY`                                  | Muse Spark, SAM 3.1, Muse Image and Muse Voice Transcribe     |
| `PROVIDER_MODE_BASETEN=live`, `BASETEN_API_KEY`                             | Muse Spark Open                                               |
| `PROVIDER_MODE_VIDEO=live`                                                  | Real reel renders (HyperFrames downloads Chrome on first use) |
| `PROVIDER_MODE_SHOPIFY=live`, `SHOPIFY_CLIENT_*`                            | Connecting a Shopify store                                    |
| `PROVIDER_MODE_FACEBOOK=live`, `PROVIDER_MODE_INSTAGRAM=live`, `META_APP_*` | Facebook Login, the Facebook catalog and posting reels        |

`.env.example` explains each one.

### A local WooCommerce store

To save drafts to a real WooCommerce store without a hosted shop, start the local test store. It runs WordPress and WooCommerce in Docker on http://localhost:8080 and writes its REST keys into `.env.local` as the demo store:

```bash
pnpm store:setup
```

Then set `PROVIDER_MODE_WOO=live` in `.env.local`. Demo shops now save their drafts to the local store, which downloads product images from the app through short-lived signed links.

### Checks

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm eval:chat                      # the chat against live Muse Spark; needs MODEL_API_KEY
```

To run it on a server, follow [DEPLOY.md](DEPLOY.md). `GET /api/health` reports whether a deploy can reach its database and media folder.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · MariaDB/MySQL via `mysql2` · Better Auth (Google, magic link, demo) · shadcn/ui (Base UI) · Tailwind CSS v4 · next-intl (English and Bangla) · sharp · HyperFrames and GSAP for reels · Vitest.

## Pre-existing code

A few setup files are adapted from my earlier project, SOHOZ TOOLS, which lives in its own private repository; none of its code history is in this one:

- the migration runner (`scripts/db-migrate.mjs`), mostly as it was
- parts of the Better Auth setup (`src/server/auth/auth.ts`): the session and token cleanup, and some of the options
- the SMTP sender and parts of the email layout (`src/server/auth/mail.ts`)

Everything else, including the database pool, the pipeline, the providers and every Meta model integration, was written during the hackathon, from October 27, 2026.

## License

[MIT](LICENSE)
