# ListSnap: Codebase Technical Audit

**Date:** 31 October 2026
**Revision audited:** `6b9785a` (Merge pull request #45, `fix/look-labels`)
**Scope:** All of `src/`, `db/migrations/`, `scripts/`, `deploy/`, `docker/`, `tests/`, `evals/`, `messages/`, CI and the root configuration and docs.
**Code changes made:** None. This document is the only file added.

---

## 1. How this audit was done

Every finding comes from reading the source. Where a finding rests on an assumption about the runtime environment, it says so.

| Check                                        | Result                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`             | OK                                                                                                                       |
| `pnpm typecheck` (`next typegen && tsc`)     | Passes                                                                                                                   |
| `pnpm lint`                                  | Passes with no warnings                                                                                                  |
| Unit tests (all except `tests/*.db.test.ts`) | 37 files, 167 tests, all passing                                                                                         |
| Database tests (`tests/*.db.test.ts`)        | **Not run.** There was no Docker daemon or MariaDB in the audit environment. CI runs them against MariaDB 11.4.          |
| `pnpm audit --prod`                          | 38 advisories: 2 critical, 14 high, 17 moderate, 5 low. All are in `next` and `undici` (see DEP-1, DEP-2).               |
| `pnpm outdated`                              | Patch and minor updates are available for `next`, `react`, `better-auth`, `undici`, `nodemailer` and others (see DEP-3). |
| Message catalogues                           | `en.json` and `bn.json` both have 803 keys, with none missing on either side                                             |

The audit environment used Node 22. `package.json` requires Node ≥ 24, so pnpm printed an engine warning. Nothing failed because of it.

**Confidence labels used below:**

- **Confirmed:** verified in the code.
- **Likely:** follows from the code, but the exact runtime behaviour was not reproduced.
- **Worth checking:** depends on server configuration or an outside system that could not be inspected.

---

## 2. Executive summary

ListSnap is a well-engineered codebase for its size and age (127 commits over about a week). The basics are solid:

- **Workspace scoping.** Every route and action checks the viewer first, and every query is bound to a workspace through `forWorkspace()`.
- **Step locking.** Pipeline steps are claimed with an atomic conditional `UPDATE`, using the database clock.
- **Validation.** Request bodies and model outputs are checked with Zod.
- **SSRF.** Outbound calls to sellers' stores are checked for private addresses before connecting and again at connect time.
- **Secrets.** Store credentials are encrypted with AES-256-GCM.
- **Media.** Signed links use HMAC, and storage paths can't escape the media folder.
- **i18n.** The English and Bangla message files have the same keys.
- **CI.** The pipeline is sensible and runs against a real MariaDB.

I found no injection, IDOR or authentication bypass.

The main risks are elsewhere:

1. **Vulnerable framework versions.** The pinned `next@16.3.8` has published unauthenticated RCE and DoS advisories. The pinned `undici@7.18.2`, which is used directly for outbound store calls, has TLS validation bypass and request smuggling advisories.
2. **Cost and resource abuse through demo shops.** Only listings are capped per IP. AI image generation, chat, assists, reels and uploads are capped per workspace, and a new anonymous workspace can be created 10 times every 10 minutes per IP.
3. **Correctness gaps on the main phone path.** HEIC photos that the browser can't decode are sent unchanged, and the server's prebuilt `sharp` can't decode them either.
4. **Leaks of internal error text.** Raw provider error bodies reach the seller through the "Under the hood" panel, against the project's own rule 6. Many API error messages are hard-coded in English, against rule 7.
5. **Performance hot spots that grow with data.** These are an unindexed join on the Media page, an N+1 loop polled every couple of seconds on the Bulk page, and listing sorts on an unindexed column.
6. **Concurrency edge cases.** Step `complete`/`fail` writes don't check that the caller still owns the lock. Several daily caps are check-then-act.

### Findings by priority

| Priority | Count | IDs                                                                                              |
| -------- | ----: | ------------------------------------------------------------------------------------------------ |
| Critical |     1 | DEP-1                                                                                            |
| High     |     8 | DEP-2, SEC-1, COMP-1, ERR-1, ERR-2, DB-1, PERF-1, PERF-2                                         |
| Medium   |    23 | SEC-2 to SEC-5, DB-2 to DB-6, ERR-3 to ERR-7, SCAL-1, SCAL-2, FE-1 to FE-4, TEST-1, DOC-1, ERR-8 |
| Low      |    29 | The remaining items                                                                              |

---

## 3. Findings

Each finding gives a **Description**, **Location**, **Impact**, **Recommendation**, **Priority** and **Confidence**. File references are `path:line` at the audited revision.

### 3.1 Dependencies

#### DEP-1: `next@16.3.8` has critical and high advisories

- **Description:** `pnpm audit` reports these advisories for `next >=16.0.0 <=16.4.0`, patched in `>=16.4.1`:
  - unauthenticated RCE in Image Optimization (critical)
  - unauthenticated RCE in `use cache` functions (critical)
  - DoS in App Router via Server Actions (high)

  The app uses `next/image` (`src/components/app/recent-listings.tsx:1`), so the `/_next/image` optimizer endpoint is live. It also uses Server Actions throughout `src/server/actions/`. `use cache` is not used, because `cacheComponents` is off.

- **Location:** `package.json` (`"next": "16.3.8"`, `"eslint-config-next": "16.3.8"`). It is also pulled in transitively through `better-auth`.
- **Impact:** Possible remote code execution on the production host, and a denial of service that needs no authentication.
- **Recommendation:**
  - Upgrade `next` and `eslint-config-next` to ≥ 16.4.1 (16.4.3 is current), then re-run the full CI.
  - Add a `pnpm audit --prod --audit-level=high` step to CI so this is caught automatically next time.
- **Priority:** **Critical** · **Confidence:** Confirmed (advisory match and usage). Exploitability was not tested.

#### DEP-2: `undici@7.18.2`, used for all store traffic, has many high advisories

- **Description:** `undici` is pinned to 7.18.2, and `hyperframes` pulls in a second copy (7.25.0). The audit lists:
  - TLS certificate validation bypasses (three variants, fixed in 7.28 to 7.30.1)
  - request/response smuggling and CRLF injection
  - cross-user information disclosure through shared caches
  - several WebSocket and decompression DoS issues

  `src/server/providers/woo/http.ts:4` uses undici's `fetch`, and `src/server/net/public-host.ts:5` uses undici's `Agent`. These carry every WooCommerce call, including the seller's encrypted consumer key and secret sent as OAuth or Basic credentials.

- **Location:** `package.json` (`"undici": "7.18.2"`); the `hyperframes>undici` path.
- **Impact:** The TLS bypass advisories directly weaken the confidentiality of store credentials in transit. Several of the DoS advisories apply to a long-running Node process.
- **Recommendation:**
  - Upgrade to `undici@^7.30.1` (or evaluate 8.x).
  - Add a `pnpm.overrides` entry so hyperframes' copy is lifted to the same version.
  - Re-run `public-host.test.ts`.
- **Priority:** High · **Confidence:** Confirmed (advisory match). Which specific advisories are reachable was not analysed.

#### DEP-3: Routine version drift

- **Description:** These packages are behind on patch or minor releases:

  | Package             | Pinned  | Latest  |
  | ------------------- | ------- | ------- |
  | `better-auth`       | 1.7.7   | 1.7.14  |
  | `react`/`react-dom` | 19.2.8  | 19.3.1  |
  | `nodemailer`        | 10.2.1  | 10.3.1  |
  | `lucide-react`      | 1.61.0  | 1.65.0  |
  | `gsap`              | 3.14.2  | 3.15.0  |
  | `hyperframes`       | 0.8.217 | 0.8.221 |

  Dev tooling uses loose majors (`typescript ^5`, `eslint ^9`, `tailwindcss ^4`, `@types/react ^19`), which are protected only by the lockfile.

- **Location:** `package.json`.
- **Impact:** Security fixes in an auth library get missed. Large jumps are harder to make later.
- **Recommendation:**
  - Enable Renovate or Dependabot with grouped weekly PRs.
  - Prioritise `better-auth` patch releases.
- **Priority:** Low · **Confidence:** Confirmed.

#### DEP-4: Two different `cn` class-merge implementations

- **Description:** 15 files in `src/components/ui/*` import `{ cn } from "cn"`, the npm package `cn@0.5.0`. Everything else imports `cn` from `@/lib/utils` (clsx + tailwind-merge), which is also the path declared in `components.json`.
- **Location:** `src/components/ui/*.tsx`, `src/lib/utils.ts`, `package.json`.
- **Impact:**
  - Two engines may resolve conflicting Tailwind classes differently.
  - `shadcn add` will generate the other style.
  - The project depends on an extra third-party package whose provenance was not verified in this audit (it was done offline).
- **Recommendation:** Standardise on `@/lib/utils`, then remove the `cn` dependency.
- **Priority:** Low · **Confidence:** Confirmed for the duplication. The package's provenance is Worth checking.

#### DEP-5: Smaller dependency hygiene items

- **Description:**
  - The HyperFrames version `0.8.217` is hard-coded in three places: `package.json`, `src/server/providers/video/live.ts:15` and `pnpm-workspace.yaml:10` (`minimumReleaseAgeExclude`, with no comment saying why).
  - `@meta-sam/parser` is under the "SAM License", not an OSI licence, while the repository is MIT.
- **Impact:** Version bumps can silently diverge across the three places. The licensing compatibility hasn't been documented.
- **Recommendation:**
  - Read the HyperFrames version from its `package.json` at load time, and comment the release-age exclusion.
  - Record third-party licence notes in the README.
- **Priority:** Low · **Confidence:** Confirmed. The licence question is Worth checking.

---

### 3.2 Security

#### SEC-1: Demo (anonymous) shops allow unbounded AI spend and disk use per visitor

- **Description:** The per-IP demo cap (`demoIpLimit`) is applied only when a listing slot is taken (`src/server/limits.ts:30-45`). Every other cap is per workspace:
  - AI images: default 60/day (`db/migrations/0002_workspaces.sql`)
  - chat: 300/day (`src/server/chat/run-chat.ts`)
  - assists: 100/day (`src/app/api/listings/[id]/assist/route.ts`)
  - reels: 10/day (`src/server/db/limits.ts`)
  - loose chat photos: 40/day; brand photos: 10/day

  Each new demo shop is seeded with 3 listings (`src/server/demo/seed.ts`). Renders, looks, assists, chat and reels can therefore start without using a listing slot.

  The only gate on creating shops is Better Auth's `/sign-in/anonymous` rule of 10 per 10 minutes per IP (`src/server/auth/auth.ts`, `rateLimit.customRules`). The IP is hashed as a whole address, so an IPv6 client can rotate through its /64.

- **Location:** `src/server/limits.ts`, `src/server/auth/auth.ts`, `src/server/demo/seed.ts`. The caps listed above.
- **Impact:**
  - One client can create about 1,400 demo shops a day, each with its own full AI allowance. That is tens of thousands of paid Muse Image and chat calls.
  - Uploads accumulate on disk until `scripts/cleanup-demo.mjs` runs.
- **Recommendation:**
  - Apply the `ip_daily` counter to images, chat calls, assists, reels and uploads for demo shops too.
  - Bucket IPv6 addresses by /64 before hashing.
  - Add a global daily spend ceiling across all demo shops.
  - Consider a CAPTCHA or Turnstile on "Try the demo".
- **Priority:** High · **Confidence:** Confirmed.

#### SEC-2: No pixel limit or real-format check when decoding uploads

- **Description:**
  - `normalisePhoto` calls `sharp(input, { failOn: "error" })` without `limitInputPixels` (`src/server/media/store.ts:44`). sharp's default allows about 268 MP.
  - The MIME allowlist in `src/server/media/upload.ts:11` (`if (f.type && !TYPES.has(f.type))`) trusts the browser-supplied type and skips the check when the type is empty. sharp then decodes whatever it supports, including SVG, TIFF and GIF.
- **Location:** `src/server/media/store.ts:44`, `src/server/media/upload.ts:7-11`.
- **Impact:** A small, highly compressible PNG declaring about 16k×16k pixels decodes to about 1 GB of memory. A few concurrent uploads (up to 5 files per request on `/api/jobs`) can exhaust the single Node process.
- **Recommendation:**
  - Pass `limitInputPixels` (for example `50_000_000`).
  - Check `(await sharp(buf).metadata()).format` against `jpeg | png | webp | heif` before the full decode.
  - Optionally serialise decodes with a small queue, or `sharp.concurrency()`.
- **Priority:** Medium · **Confidence:** Confirmed.

#### SEC-3: No security response headers

- **Description:** Neither `next.config.ts` (it has no `headers()`) nor `deploy/nginx-app.conf` / `deploy/nginx-store.conf` (no `add_header`) sets any of these: `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options` / `frame-ancestors`, `Referrer-Policy` or `Permissions-Policy`. The `/media` route does set `X-Content-Type-Options: nosniff`.
- **Location:** `next.config.ts`, `deploy/nginx-app.conf`, `deploy/nginx-store.conf`.
- **Impact:**
  - The app can be framed, which creates a clickjacking risk on the "Save as draft" and "Post reel" buttons.
  - Without HSTS, a first visit can be downgraded to HTTP.
  - Without a CSP, any future XSS has no second line of defence.
- **Recommendation:**
  - Add HSTS, `frame-ancestors 'none'` (or `X-Frame-Options: DENY`), `Referrer-Policy: strict-origin-when-cross-origin`, and a CSP. A nonce-based CSP is best; at minimum use `default-src 'self'; img-src 'self' data: blob:; object-src 'none'; base-uri 'self'`.
  - Set them either in nginx or in `next.config.ts`.
  - Mirror the basics on the store vhost.
- **Priority:** Medium · **Confidence:** Confirmed.

#### SEC-4: Daily caps are check-then-act and can be exceeded in parallel

- **Description:** Assists, chat calls, loose chat photos and brand photos are limited by reading a `COUNT(*)` and then doing the work:
  - `assistsToday()` and `brandPhotosToday()` in `src/server/db/scope.ts`
  - `chatCallsToday()` and `loosePhotosToday()` in `src/server/db/chats.ts`

  These are used in `assist/route.ts`, `run-chat.ts`, `chat/photos/route.ts` and `brand-kit/setting/route.ts`. Parallel requests all pass the check, and one chat message can run several model turns after its single check.

  Listing, image and reel slots, by contrast, use an atomic conditional `UPDATE` (`src/server/db/limits.ts`, `reserve()`).

- **Location:** As above.
- **Impact:** The spend caps can be exceeded by firing requests in parallel. Combined with SEC-1, this multiplies the abuse potential.
- **Recommendation:** Move these counters into `usage_daily` as columns, and reserve them with the existing `reserve()` pattern before the work starts.
- **Priority:** Medium · **Confidence:** Confirmed.

#### SEC-5: Route Handlers rely only on `SameSite=Lax` against CSRF

- **Description:**
  - The state-changing Route Handlers don't check `Origin` or `Sec-Fetch-Site`.
  - They call `request.json()` without requiring `Content-Type: application/json`, so a cross-origin `text/plain` POST is parsed.
  - The multipart upload routes (`/api/jobs`, `/api/chat/photos`) are CORS "simple" requests.

  Cross-site attackers are blocked by `SameSite=Lax`. Same-site origins are not: the deployment puts WordPress, with its PHP and plugins, on `store.<domain>` (`deploy/nginx-store.conf`). Server Actions are protected by Next's own Origin check.

- **Location:** `src/app/api/**/route.ts`.
- **Impact:** An XSS on the same-site WordPress host could drive uploads, chat (including tool calls) and step calls with a seller's session.
- **Recommendation:**
  - Add an `assertSameOrigin(request)` helper next to `apiViewer()` on every mutating route. It should compare `Origin` with `env().siteUrl`.
  - At minimum, reject JSON routes whose `Content-Type` isn't `application/json`.
- **Priority:** Medium · **Confidence:** Likely (the attack needs a same-site foothold).

#### SEC-6: Small gaps in the SSRF blocklist, and any port is accepted

- **Description:** The guard in `src/server/net/public-host.ts` is good. It pre-checks the address, re-checks at connect time through `lookup` (which defeats DNS rebinding), uses `redirect: "error"`, handles IPv4-mapped IPv6, and refuses HTTP in production. These ranges are missing:
  - IPv4-compatible `::/96` (for example `::127.0.0.1`)
  - SIIT `::ffff:0:0:0/96`
  - local-use NAT64 `64:ff9b:1::/48`
  - the TEST-NET ranges

  Store URLs also keep any port (`src/lib/woo-connection.ts`). The connection test in `connectWoo` has no rate limit. The guard runs only when `NODE_ENV === "production"` (`src/server/providers/woo/http.ts`).

- **Location:** `src/server/net/public-host.ts`, `src/lib/woo-connection.ts`, `src/server/providers/woo/http.ts`.
- **Impact:** These gaps are mostly unroutable on Linux, so the risk is low. The open-port and no-rate-limit combination lets any seller use the server as a scanner of public host:port pairs.
- **Recommendation:**
  - Add the missing ranges.
  - Restrict ports to 443 (and maybe 80 and 8443).
  - Rate-limit the connection test.
- **Priority:** Low · **Confidence:** Confirmed.

#### SEC-7: The shared demo WooCommerce store uses an administrator key

- **Description:**
  - `deploy/store-setup.php` creates the read/write REST key for the first administrator. Every demo shop writes products there (`src/server/stores/woo-store.ts`).
  - Descriptions are HTML-escaped (`toHtml` in `src/server/providers/woo/live.ts`), but product names, attribute names and values, and tag and category names are sent unchanged.
  - Nothing limits product or term creation per visitor.
- **Location:** `deploy/store-setup.php`, `src/server/providers/woo/live.ts`.
- **Impact:** Whether stored markup reaches wp-admin depends on WooCommerce's own sanitising under an `unfiltered_html` user. Anonymous visitors can also fill the store with spam.
- **Recommendation:**
  - Issue the key to a dedicated `shop_manager` user that doesn't have `unfiltered_html`.
  - Strip tags from names and terms before sending.
  - Prune demo products on a schedule.
- **Priority:** Low · **Confidence:** Confirmed for the code. The WooCommerce side is Worth checking.

#### SEC-8: `/api/health` shows configuration to anyone

- **Description:** `src/app/api/health/route.ts` is unauthenticated. It returns:
  - each provider's mock/live mode
  - the migration version
  - whether the credentials key and AI key are set

  It does not leak hosts, paths or error text.

- **Impact:** This is minor reconnaissance help: it tells a visitor which integrations are live.
- **Recommendation:** Return only `ok`, `database` and `media` publicly. Show the details only for loopback requests, which is what `deploy/deploy.sh` uses.
- **Priority:** Low · **Confidence:** Confirmed.

#### SEC-9: Development and hosting configuration hardening

- **Description:**
  - `docker-compose.yml` publishes MariaDB (with the weak passwords `listsnap` / `listsnap-root`) and WordPress on all interfaces. The local mu-plugin also allows WordPress to fetch internal hosts (`docker/store/mu-plugins/listsnap-local.php`).
  - `deploy/nginx-store.conf` doesn't deny PHP execution under `wp-content/uploads`.
  - Neither nginx file uses `limit_req`.
- **Impact:** On a shared network, the local database and store are exposed. A PHP upload in the store would be executable.
- **Recommendation:**
  - Bind the Compose ports to `127.0.0.1:`.
  - Add `location ~* /uploads/.*\.php$ { deny all; }`.
  - Add a modest `limit_req` zone in front of `/api/`.
- **Priority:** Low · **Confidence:** Confirmed.

#### SEC-10: Dead `?next=` parameter, and a reused query key

- **Description:**
  - `src/proxy.ts:13` sets `?next=` on the sign-in redirect, but nothing reads it. That means there is no open redirect, but deep links are lost after sign-in.
  - The signed-link parameter `w` means the workspace in `src/server/media/signed.ts`, while `/media/[id]` reads `w` as the width.
- **Impact:** A UX papercut and a source of confusion. Neither is a security risk.
- **Recommendation:**
  - Either honour `next`, validating it as a same-origin relative path, or stop setting it.
  - Rename one of the two `w` parameters.
- **Priority:** Low · **Confidence:** Confirmed.

---

### 3.3 Error handling

#### ERR-1: Raw provider and internal error text is shown to sellers

- **Description:** On failure, `logged()` stores `err.message` in `api_calls.summary` (`src/server/providers/log.ts:30-32`). `loadJobState` passes it to the client unchanged (`src/server/pipeline/job-state.ts:127`), and the "Under the hood" panel renders it (`src/app/(app)/job/[id]/_components/under-the-hood.tsx:30`). The messages that leak include:
  - `Muse Spark HTTP 400: <response body>`
  - `Muse Image HTTP …: <body>`
  - `SAM refused "<phrase>": <body>`
  - Zod issue dumps for unexpected responses
  - the last lines of HyperFrames' stderr
  - any `TypeError` from a code bug
- **Location:** `src/server/providers/log.ts`, `src/server/pipeline/job-state.ts`, `under-the-hood.tsx`. The throw sites are in `src/server/providers/meta/{spark,image,sam}.ts` and `src/server/providers/video/live.ts`.
- **Impact:**
  - This breaks AGENTS.md rule 6 ("anything else becomes a generic message").
  - It exposes vendor responses and internal details.
  - The text is English-only.
- **Recommendation:**
  - Store a short safe code in `summary` for failures (a StepError key, `http_400`, `timeout`) and send the full message only to `console.error`.
  - Alternatively, redact `summary` for `ok = 0` rows in `loadJobState`.
- **Priority:** High · **Confidence:** Confirmed.

#### ERR-2: API error messages are hard-coded in English

- **Description:**
  - `fail()` in `src/server/http.ts` is called with literal English strings from many routes and helpers: `src/server/media/upload.ts`, `src/server/limits.ts`, `api/jobs`, `api/jobs/[id]/choice`, `api/listings/[id]/assist`, `api/listings/[id]/post`, `api/brand-kit/setting` and `api/chat/photos`.
  - The client puts `body.error.message` straight into toasts and inline errors. This happens in `snap-form.tsx`, `chat-panel.tsx`, `save-to-store.tsx` and `reel-post.tsx`.
  - Only step errors go through the localised `errorText`.
  - One message is also wrong: the assist limit says it "comes back at midnight", but the count resets at `UTC_DATE()`, which is 06:00 in Bangladesh.
- **Location:** As above.
- **Impact:**
  - This breaks rule 7.
  - Bangla sellers see English errors on the most common failure paths: file too large, unsupported file, limit reached.
  - One message gives the wrong reset time.
- **Recommendation:**
  - Make `fail()` take a message key and localise it the way `stepResponse` does, or have the client map `error.code` to `t("errors.<code>")`.
  - Fix the reset-time wording.
- **Priority:** High · **Confidence:** Confirmed.

#### ERR-3: Setting Instagram or Facebook to live makes every post fail after three attempts

- **Description:** No live Instagram or Facebook client exists. `instagram()` and `facebook()` throw `NotBuiltYet`, which extends plain `Error` (`src/server/providers/index.ts:25-29, 50-57`). `failureKind` in `run-step.ts` treats a plain Error as retryable, so the post step uses all 3 attempts and the seller sees the generic message. The error text also refers to "Phase R".
- **Location:** `src/server/providers/index.ts`, `src/server/pipeline/post-step.ts`, `src/server/pipeline/run-step.ts`.
- **Impact:** A misconfigured deploy fails in a confusing way, wastes attempts, and gives no hint about the cause.
- **Recommendation:**
  - Reject `live` for these two providers in `env.ts`, or report it in `/api/health`.
  - At least make `NotBuiltYet` a `PermanentError`.
  - Remove the phase wording.
- **Priority:** Medium · **Confidence:** Confirmed.

#### ERR-4: WooCommerce responses are cast, not validated

- **Description:** `src/server/providers/woo/http.ts` returns `data as T`. `woo/live.ts` and `woo/check.ts` then index into `saved.images[i]`, `p.meta_data`, term lists and so on without checking their shape.
- **Location:** `src/server/providers/woo/http.ts`, `live.ts`, `check.ts`.
- **Impact:**
  - This breaks rule 3 (validate every boundary).
  - A store with an unusual plugin, or an HTML page returned with status 200, produces a `TypeError`.
  - Through ERR-1, that error text is then shown to the seller.
- **Recommendation:** Add small Zod schemas (Product, Term[], attributes) and pass them to `api.get/post/put`, the same way `sparkPost` already does.
- **Priority:** Medium · **Confidence:** Confirmed.

#### ERR-5: The circuit breaker's half-open state lets every caller through

- **Description:** After the cooldown, `guard()` sets `openedAt = null` for the first caller (`src/server/providers/breaker.ts:30-31`). Every call that arrives before the next failure is recorded also passes. The comment says "lets one trial through", which is not what the code does.
- **Location:** `src/server/providers/breaker.ts`.
- **Impact:** A bulk run can send a burst of requests to a service that is still down, which costs attempts and quota.
- **Recommendation:**
  - Add a `trialInFlight` flag: only the caller that sets it gets through, and the rest receive `notAttempted`.
  - Add a test for this race.
- **Priority:** Medium · **Confidence:** Confirmed.

#### ERR-6: Spark cost is lost when a billed call later fails

- **Description:** `sparkJson` adds up `costUsd` across its two requests and then may throw `StepError(UNREADABLE)`. `logged()` always records failures with `costUsd: 0` (`src/server/providers/log.ts:32`). The same is true for a valid completion that fails the schema check.
- **Location:** `src/server/providers/meta/spark.ts`, `src/server/providers/log.ts`.
- **Impact:** The Usage page and the CSV export under-report real spend.
- **Recommendation:** Attach the cost to the thrown error (for example `err.costUsd`) and have `logged()` record it.
- **Priority:** Medium · **Confidence:** Confirmed.

#### ERR-7: Error boundaries use `reset`, which doesn't fetch the page again

- **Description:**
  - `src/app/(app)/error.tsx`, `src/app/(public)/error.tsx`, `src/app/global-error.tsx` and `src/components/app/error-state.tsx` all call `reset`. The bundled Next 16.3 docs (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`) say `retry` is stable from 16.3 and that `reset` only re-renders the client tree. Most failures here come from Server Components, where the DAL or database failed, so "Try again" re-renders the same error.
  - `src/app/onboarding/` has no `error.tsx`, so its errors replace the root layout.
  - `global-error.tsx` contains Bangla text without `lang="bn"`.
- **Location:** As above.
- **Impact:** The retry button doesn't help with transient errors, and the user experience is poor when they happen.
- **Recommendation:**
  - Use the `retry` prop.
  - Log `error.digest`.
  - Add `onboarding/error.tsx`.
  - Wrap the Bangla text in `lang="bn"`.
- **Priority:** Medium · **Confidence:** Confirmed.

#### ERR-8: Gaps in Meta provider error paths

- **Description:**
  - `src/server/providers/meta/image.ts`: the follow-up `fetch(item.url)` has no `res.ok` check and no size limit, so an error page could be saved as image bytes.
  - `src/server/providers/meta/sam.ts`: a timeout while reading the response stream raises a raw `DOMException`. It isn't mapped to `BUSY`, and the breaker has already recorded the call as a success.
- **Location:** As above.
- **Impact:** A corrupt image can be stored. Errors are misclassified.
- **Recommendation:**
  - Check `res.ok` and `content-type`, and cap the number of bytes read.
  - Wrap the stream read so the timeout maps to the right StepError.
- **Priority:** Medium · **Confidence:** Confirmed.

---

### 3.4 Database

#### DB-1: Media library joins on two unindexed columns, across all shops

- **Description:** `mediaPage` (`src/server/db/media-library.ts:50-70`) does `LEFT JOIN items im ON im.cutout_media_id = m.id` and `LEFT JOIN items ic ON ic.cutout_png_media_id = m.id`. No migration indexes either column; `items` has only the primary key and `(photo_id, instance_idx)`. The joined `items` rows aren't limited to the workspace, and the same base query runs twice per page: once for the rows and once for `COUNT(*)`.
- **Location:** `src/server/db/media-library.ts`, `db/migrations/0003_pipeline.sql:75-88`, `0006_item_cutout_png.sql`.
- **Impact:** The cost grows with one shop's media multiplied by every item on the platform. The Media page gets slower for everyone as the platform grows.
- **Recommendation:**
  - Add `KEY items_cutout_idx (cutout_media_id)` and `KEY items_cutout_png_idx (cutout_png_media_id)` in a new migration.
  - Better: record `job_id` on `media` when it is saved, so the four-way join can go.
- **Priority:** High · **Confidence:** Confirmed.

#### DB-2: Step `complete`, `fail` and `renew` don't check who holds the lock

- **Description:** In `src/server/db/steps.ts`:
  - `complete()` and `fail()` match only `(job_id, step, target)`. They don't require `status = 'running'` or a matching lock owner.
  - `renew()` requires `status='running'` but doesn't check ownership.
  - Heartbeats stop after `LOCK_RENEWALS` (`src/server/pipeline/run-step.ts`), so slow work, such as a queued reel render, can outlive its lock.
- **Location:** `src/server/db/steps.ts:55-81`, `src/server/pipeline/run-step.ts`.
- **Impact:** A second caller can claim the expired step and repeat the paid work. The first worker's late `fail()` can then overwrite the second worker's `done` result, or a late `complete()` can replace it. The result is duplicate renders, reels or posts, and lost results.
- **Recommendation:**
  - Write a random `lock_token` on claim.
  - Add `AND status='running' AND lock_token = ?` to `renew`, `complete` and `fail`.
  - When 0 rows are affected, re-read the row and return its current state.
- **Priority:** Medium · **Confidence:** Confirmed for the code. The race itself is Likely in production, but it needs slow work.

#### DB-3: An op run stuck in `running` blocks its idempotency key forever

- **Description:** If the process dies, or `finishOpRun` throws, after `startOpRun` (`src/server/db/op-runs.ts`, `src/server/ops/define-op.ts`), the row stays `running`. Nothing expires it, so every retry with that key gets `busy`. Separately, pipeline ops record a non-final `{ state: "running" }` outcome as `done`, so replaying that key always returns "running".
- **Location:** `src/server/db/op-runs.ts`, `src/server/ops/define-op.ts`.
- **Impact:** Chat tool calls and other ops can get stuck permanently after a crash.
- **Recommendation:**
  - Treat `running` rows older than N minutes as reclaimable.
  - Don't store non-final outcomes as `done`.
- **Priority:** Medium · **Confidence:** Confirmed.

#### DB-4: Session time zone not pinned while SQL mixes `UTC_*()` with `CURRENT_TIMESTAMP` defaults

- **Description:** The pool sets `timezone: "Z"` (`src/server/db/pool.ts`). That only affects how mysql2 converts values in JavaScript; it doesn't change the server session's `time_zone`. Columns default to `CURRENT_TIMESTAMP(3)`, which uses the session zone, and are compared with `UTC_DATE()` / `UTC_TIMESTAMP()`. This happens in `scope.ts`, `chats.ts`, `overview.ts` (which also uses `NOW(3)`), `usage.ts` and `limits.ts`. Neither `scripts/db-migrate.mjs` nor `scripts/cleanup-demo.mjs` sets the zone.
- **Location:** As above.
- **Impact:** If MariaDB or the VPS runs in any zone other than UTC (for example Asia/Dhaka), these break:
  - the daily caps
  - the dashboard's "today"
  - the attention lists
  - every `Date` read into JavaScript, which shifts by the offset
- **Recommendation:**
  - Run `SET time_zone = '+00:00'` on every new pool connection and in both scripts.
  - And/or pin `default-time-zone = '+00:00'` in the MariaDB setup in DEPLOY.md.
- **Priority:** Medium · **Confidence:** Worth checking (it depends on the server's time zone).

#### DB-5: Listing lists sort on an unindexed column, with `OFFSET` pagination

- **Description:** `recentListings` (`src/server/db/listings.ts`) and `listingPage` (`src/server/db/overview.ts`) filter by `workspace_id` and `ORDER BY created_at DESC, sort`. The only composite index is `(workspace_id, status, updated_at)` (`0003_pipeline.sql:108`). `listingPage` also uses `OFFSET`, and its search runs a `LIKE` over JSON fields in a separate `COUNT(*)`.
- **Location:** As above.
- **Impact:** Every page load sorts the whole shop's listings, and search scans them all. This is fine at tens of listings and slow at thousands.
- **Recommendation:**
  - Add `KEY listings_workspace_created_idx (workspace_id, created_at, sort)`.
  - Consider keyset pagination.
  - Consider indexed generated columns for `title_en` and `title_bn`.
- **Priority:** Medium · **Confidence:** Confirmed.

#### DB-6: Logs are sorted by `id` against `created_at` indexes, and nothing prunes them

- **Description:**
  - `recentCalls` (`src/server/db/usage.ts`) and the events feed (`src/server/db/overview.ts`) use `ORDER BY id DESC` under `WHERE workspace_id = ?`, but the indexes are `(workspace_id, created_at)`.
  - Nothing ever deletes old rows from `api_calls`, `events`, `op_runs` (Review autosave writes them often; `trimUndo` only nulls `undo_json`), `usage_daily` or `ip_daily`.
- **Location:** As above.
- **Impact:** Unbounded table growth, and each query sorts the shop's whole history.
- **Recommendation:**
  - Order by `created_at DESC, id DESC`.
  - Add a scheduled retention job, for example 90 days for calls and events, and 2 days for `ip_daily`.
- **Priority:** Medium · **Confidence:** Confirmed.

#### DB-7: Concurrent `startListing` calls can reuse the same photo

- **Description:** `src/server/ops/shop-ops.ts` checks whether a media item is already used and then creates a job. `photos.media_id` has no unique key.
- **Impact:** Two concurrent chat calls can create two jobs, using two listing slots, from the same photo.
- **Recommendation:** Add `UNIQUE (media_id)` on `photos` and handle error 1062, or lock the media rows `FOR UPDATE` inside `createJob`.
- **Priority:** Low · **Confidence:** Confirmed.

#### DB-8: Orphan media from failed segment attempts

- **Description:** In `src/server/pipeline/job-steps.ts`, the cutout and main media are saved, as both files and rows, before `replaceItems`. A failure after that point leaves media that no item references. These files appear under "Cutouts" in the Media library and count toward the storage totals.
- **Recommendation:** Delete media that no item references any more as part of `replaceItems`, or run a periodic orphan sweep.
- **Priority:** Low · **Confidence:** Confirmed.

#### DB-9: Limit slots released after UTC midnight go back to the wrong day

- **Description:** The `release*` functions in `src/server/db/limits.ts` decrement the row for `date = UTC_DATE()`, not the date the slot was reserved on.
- **Impact:** A slot reserved at 23:59 UTC and released after midnight frees a slot on the new day, so that day's allowance grows by one.
- **Recommendation:** Return the reservation's date from `reserve` and use it when releasing.
- **Priority:** Low · **Confidence:** Confirmed.

#### DB-10: Schema and migration gaps

- **Description:**
  - The denormalised `workspace_id` on child tables (`photos`, `items`, `job_steps`, `listings`, `chat_messages`) has no foreign key and no check that it matches the parent. Only the code keeps it consistent.
  - Several reference columns have no foreign key: `media.listing_id`, `media.from_media_id`, `items.mask_media_id`, `items.cutout_*`, `api_calls.job_id`.
  - `0011_reels.sql:12` uses `ADD COLUMN` without `IF NOT EXISTS`, unlike the other migrations, so re-running it by hand fails.
  - `scripts/db-migrate.mjs` takes no lock, so two concurrent builds (the `build` script runs migrations) can race.
  - The JSON-extracted id joins (`JSON_UNQUOTE(JSON_EXTRACT(l.item_ids_json,'$[0]'))` in `listings.ts` and `overview.ts`) may not use the primary key because of a collation difference. This is Worth checking with `EXPLAIN`.
- **Impact:** Integrity rests on code paths alone. Migrations are fragile when run concurrently.
- **Recommendation:**
  - Add foreign keys where feasible (`ON DELETE SET NULL` for the optional references).
  - Make 0011 idempotent in a follow-up migration.
  - Wrap the migration run in `GET_LOCK('listsnap_migrate', 30)`.
  - Store `main_item_id` as a real column.
- **Priority:** Low · **Confidence:** Confirmed, except the collation point, which is Worth checking.

#### DB-11: Some SQL lives outside `src/server/db/`

- **Description:** Raw SQL appears in `src/server/media/store.ts`, `src/server/providers/log.ts` and `src/server/auth/auth.ts` (the session and verification prune). It is all parameterised and scoped by workspace.
- **Impact:** This breaks the letter of rule 2 and makes "all SQL lives in one place" untrue for reviewers.
- **Recommendation:** Move these queries into `src/server/db/` modules, or document the exceptions in AGENTS.md.
- **Priority:** Low · **Confidence:** Confirmed.

---

### 3.5 Performance

#### PERF-1: The Bulk page status is an N+1 loop, polled continuously

- **Description:** `loadBatchState` (`src/server/pipeline/batch-state.ts:25-26`) awaits `loadJobState` for each job one after another. That is `getJob`, five parallel queries and `listingMedia`, plus a second `ws.listings(id)` that repeats one inside `loadJobState`. `useBatchRunner` reloads after every round of step calls.
- **Location:** `src/server/pipeline/batch-state.ts`, `src/server/pipeline/job-state.ts`, `src/hooks/use-batch-runner.ts`.
- **Impact:** A 20-job batch issues about 160 queries per poll. With the default pool of 5 connections (`DATABASE_POOL_SIZE`), a few bulk tabs open at once starve every other request.
- **Recommendation:**
  - Load the batch with a few `WHERE job_id IN (...)` queries (steps, listings, photos, items, media) and build the rows in memory.
  - Drop the duplicate listings query.
  - Back off the poll interval.
- **Priority:** High · **Confidence:** Confirmed.

#### PERF-2: Browser runners loop without a pause on 5xx, 404 and 409

- **Description:**
  - `useJobRunner` pauses only on 202, 422 or a network error (`src/hooks/use-job-runner.ts:66-71`). Any other status gives a pause of 0, so a persistent 500 from an uncaught error, or a 409 `not_ready`, makes the client reload and re-POST immediately and repeatedly.
  - `useBatchRunner` behaves the same.
  - Neither runner uses the server's `retryAfterMs`, backs off exponentially, or caps the number of rounds.
  - No fetch has a timeout or `AbortController`.
- **Location:** `src/hooks/use-job-runner.ts`, `src/hooks/use-batch-runner.ts`.
- **Impact:** One broken step in one tab becomes a tight request loop against the server and database. It amplifies outages, and a hung request leaves the spinner running forever.
- **Recommendation:**
  - Treat every status other than 2xx or 422 as a pause, with exponential backoff and jitter.
  - Honour `retryAfterMs`.
  - Mark the job "stalled" after N rounds.
  - Add `AbortSignal.timeout()`.
- **Priority:** High · **Confidence:** Confirmed.

#### PERF-3: Image decode work isn't bounded

- **Description:** See SEC-2. Beyond the security angle, sharp decodes run with no concurrency control on the same event-loop process that serves pages.
- **Recommendation:** Use a small decode semaphore, and optionally `sharp.concurrency()`.
- **Priority:** Low (covered by SEC-2) · **Confidence:** Confirmed.

---

### 3.6 Scalability

#### SCAL-1: The reel render queue is per process and unbounded

- **Description:** `oneAtATime` in `src/server/providers/video/live.ts` is a promise chain inside the module with no length limit. The 240 s `TIMEOUT_MS` starts only when a render begins. Each waiting request holds its photo buffers and an open HTTP connection. nginx gives up after 300 s (`deploy/nginx-app.conf:21`). The step lock can expire while a request is still queued (see DB-2), which can queue a duplicate render. `execFile`'s timeout sends SIGTERM to the CLI only; whether HyperFrames' Chrome workers die with it is Worth checking.
- **Impact:**
  - Memory and latency grow without limit under load.
  - With more than one Node process, each one renders at the same time with `REEL_WORKERS` Chrome workers (about 256 MB each), which can run the box out of memory.
- **Recommendation:**
  - Cap the queue length and reject with a `busy` StepError marked `notAttempted`.
  - Time the whole wait.
  - Spawn the render in its own process group and kill the group on timeout.
  - For more than one instance, take a database-backed slot (for example `GET_LOCK`) before rendering.
- **Priority:** Medium · **Confidence:** Confirmed. The duplicate render is Likely.

#### SCAL-2: Long-running work runs inside HTTP requests, and nothing drives it on the server

- **Description:**
  - The render lock is 150 s and the post lock 180 s, but nginx's `location /` read timeout is 120 s (`deploy/nginx-app.conf:34`).
  - `saveDraftsToStore` (`src/server/ops/shop-ops.ts`) runs up to 20 Woo saves one after another inside one chat request.
  - No background worker or sweeper exists. A step left `running` by a crash, or a job whose tab was closed, only moves when a browser polls again.
- **Impact:** Browsers see 504s even though the work succeeds (it recovers through the 202 path, but adds latency). Bulk store saves can exceed the request timeout. Abandoned jobs never finish.
- **Recommendation:**
  - Raise the nginx timeout for the step, post and store routes.
  - Run bulk saves in parallel with a limit, or in chunks.
  - Plan a small server-side worker that drives `nextCalls`.
- **Priority:** Medium · **Confidence:** Confirmed.

#### SCAL-3: In-process state assumes a single instance

- **Description:**
  - The circuit breaker is a Map per process (`src/server/providers/breaker.ts`), so N processes mean N×3 failures before it trips.
  - The database pool is per process, so total connections are 5 × instances against `max_connections`.
  - Media is stored on the local filesystem (`MEDIA_DIR`).
  - The auth prune timer is per process (harmless).

  DEPLOY.md assumes one VPS running one process, which is consistent with all of this.

- **Impact:** Scaling out (PM2 cluster, a second server, containers) needs shared storage and a rethink of the breaker, queue and pool.
- **Recommendation:** Document the single-instance assumption in DEPLOY.md now. Plan object storage (S3 or R2) and DB- or Redis-backed coordination before scaling out.
- **Priority:** Low · **Confidence:** Confirmed.

---

### 3.7 Compatibility

#### COMP-1: HEIC photos fail end to end on most browsers

- **Description:**
  - When `createImageBitmap` can't decode a file, `resizeForUpload` returns the original (`src/lib/resize-image.ts:9-13`). Chrome, Edge, Firefox and Android can't decode HEIC, and neither can Safari before 17.
  - Both upload paths then name the blob `.jpg` while it still holds HEIC bytes (`src/lib/bulk-upload.ts`, `src/app/(app)/snap/_components/snap-form.tsx`).
  - On the server, the prebuilt `sharp@0.35` has no HEVC decoder: `sharp.format.heif.input.fileSuffix` is `[".avif"]` only (checked in this audit). `normalisePhoto` therefore fails.
  - The seller then sees "Use JPG, PNG or HEIC", which recommends the very format that just failed.
  - The picker's `accept="image/*,.heic,.heif"` may also stop iOS from converting to JPEG on its own.
- **Location:** As above, plus `src/server/media/store.ts:44` and `src/server/media/upload.ts:7`.
- **Impact:** A core flow for the target users, phone photos, fails, and the message is misleading.
- **Recommendation:**
  - Decode HEIC on the client (for example with a WASM libheif) before resizing, or ship a libvips build with libheif and libde265. Otherwise, drop HEIC from `accept` and from the message.
  - Rename the file to `.jpg` only when it was actually re-encoded.
- **Priority:** High · **Confidence:** Confirmed for the server limitation and the client code path. Whether iOS Safari 17+ decodes HEIC client-side was not tested on a device.

#### COMP-2: Node version mismatch between local tooling and the engine requirement

- **Description:** `package.json` requires `node >= 24`, and CI uses 24. Nothing enforces this beyond a pnpm warning: there's no `.nvmrc`, no `engine-strict`, and no Volta pin.
- **Recommendation:** Add an `.nvmrc` or `.node-version` file and `engine-strict=true` in `.npmrc`.
- **Priority:** Low · **Confidence:** Confirmed.

---

### 3.8 Frontend code quality and accessibility

#### FE-1: Autosave drops the last edit when the seller leaves Review

- **Description:**
  - `Autosaver.dispose()` clears the 800 ms debounce timer without saving (`src/app/(app)/job/[id]/review/_components/autosave.ts:39-41`). Leaving within about 0.8 s of the last keystroke (a sidebar link, Back) silently loses the change.
  - Nothing saves on `pagehide` or `visibilitychange`.
  - A value that keeps failing is retried every 3 s forever.
- **Recommendation:**
  - `flush()` on dispose and when the page becomes hidden.
  - Use `fetch(..., { keepalive: true })` or `sendBeacon` on unload.
  - Back off persistent failures.
- **Priority:** Medium · **Confidence:** Confirmed.

#### FE-2: "Try again" can stay disabled for good

- **Description:** `retry()` in `src/hooks/use-job-runner.ts` calls `fetch` without a `.catch` and ignores `res.ok`. The caller in `step-list.tsx` resets `retrying` only on success. Offline, the promise rejects, the button stays disabled until reload, and the rejection is unhandled.
- **Recommendation:** Wrap the call in `try/finally`, and handle 401 and 429 explicitly.
- **Priority:** Medium · **Confidence:** Confirmed.

#### FE-3: Batch runner has no offline, stalled or error state

- **Description:** In `src/hooks/use-batch-runner.ts`, a failed `load()` ends the loop silently and the page just shows "Paused". There are no `online` or `visibilitychange` listeners. Pause flips a ref but the button doesn't change until the current round ends. Jobs stuck with `next: []` are counted as "left", so Resume shows but does nothing (Likely).
- **Recommendation:**
  - Copy the job runner's offline, visibility and stalled handling.
  - Leave stuck jobs out of the count and say why.
  - Show a "pausing…" state.
- **Priority:** Medium · **Confidence:** Confirmed, and Likely for the Resume case.

#### FE-4: Chat stream parsing is not validated and can't be cancelled

- **Description:** In `src/components/app/chat-panel.tsx`:
  - Each NDJSON line goes through `JSON.parse(line) as ChatEvent` without Zod (rule 3), and one bad line ends the stream.
  - Whatever is left in the buffer at the end is ignored. That is safe today only because the server ends every line with a newline.
  - There is no `AbortController`, so unmounting mid-stream keeps reading and then calls `router.refresh()` on whatever page the seller moved to.
  - A 401 shows a generic error.
  - The whole log is `aria-live`, so streamed updates to the same item may be announced repeatedly.
  - The error `<p>` has no `role="alert"`.
- **Recommendation:**
  - Parse each line with a Zod schema and flush the buffer at the end.
  - Abort on unmount.
  - Send a 401 to sign-in.
  - Announce only finished items.
- **Priority:** Medium · **Confidence:** Confirmed.

#### FE-5: Snap form leaks object URLs and runs side effects inside updaters

- **Description:** In `src/app/(app)/snap/_components/snap-form.tsx`:
  - Preview blob URLs are revoked only by `remove()`, not on unmount or after a successful upload.
  - `toast.error` and `URL.revokeObjectURL` run inside `setFiles` updaters, so they fire twice under StrictMode.
  - The paste-listener effect has no dependency array, so it re-subscribes on every render.
  - Split uploads pass a no-op `onProgress`, so no progress is shown.
- **Recommendation:**
  - Revoke the URLs in an unmount cleanup that reads a ref.
  - Move the side effects out of the updaters.
  - Use a stable listener.
  - Wire up progress.
- **Priority:** Low · **Confidence:** Confirmed.

#### FE-6: Accessibility deviations from the project's own rules

- **Description:**
  - In `bulk/[id]/_components/batch-table.tsx`:
    - The inline inputs are `h-10` and the links `min-h-10` (40 px, below the 44 px rule).
    - `aria-label` sits on an `<svg>` and a plain `<span>` with no `role="img"`.
    - A failed quick edit resets silently, so the seller thinks it was saved.
  - In `review-form.tsx`:
    - The language "tabs" use `role="tab"` without `aria-controls`, a `tabpanel` or arrow-key support.
    - Their label is the same as the nav label.
  - `step-list.tsx`: `aria-live` on the whole `<ol>` can re-announce every step on each poll.
  - `language-switch.tsx`: a hard-coded `aria-label="Language · ভাষা"` (deliberate, but not in the message files).
- **Recommendation:**
  - Use `h-11 md:h-8`, as the rest of the app does.
  - Use `role="img"` or `sr-only` text.
  - Show an error when a quick edit fails.
  - Use a pressed-button group or a real Tabs component.
  - Narrow the live region to the status line.
- **Priority:** Low · **Confidence:** Confirmed.

#### FE-7: Large client components mix state logic with markup

- **Description:**
  - These components are at or above the ~300-line guideline: `review-form.tsx` (339), `chat-panel.tsx` (329), `batch-table.tsx` (270) and `snap-form.tsx` (247).
  - `review-form` contains the edit state, the autosaver, the revision sync, the look auto-select and the layout. It builds patches sometimes from `edit` and sometimes from `latest.current`, which risks lost updates when AI answers arrive at the same time (Likely).
- **Recommendation:**
  - Extract hooks (`useListingEdit`, `useChatStream`) and subcomponents.
  - Build patches from one source of truth.
- **Priority:** Low · **Confidence:** Confirmed for the size. The lost-update risk is Likely.

#### FE-8: `as Route` casts weaken `typedRoutes`

- **Description:** `src/components/app/chat-items.tsx` casts server-built hrefs with `as Route`. They are safe today, because `src/server/chat/view.ts` builds them, but the type check no longer protects them.
- **Recommendation:** Build them with a typed helper.
- **Priority:** Low · **Confidence:** Confirmed.

---

### 3.9 Architecture

The overall structure is clean:

- Routes only in `src/app`.
- A DAL in `src/server/db`, with providers behind interfaces and a mock for each.
- An op registry shared by the UI and the chat tools.
- Server-decided step order through `next-calls.ts`.

These points are worth raising:

#### ARCH-1: The pipeline is driven only by the browser

- **Description:** By design, each step is one short request that the browser starts (README, `next-calls.ts`). It makes refreshes, restarts and second tabs safe. It also means work only advances while a tab is open, every slow step is bound by the proxy timeouts, and the logic for driving it (runners, backoff, offline handling) is duplicated in two hooks. See SCAL-2, PERF-2 and FE-3.
- **Recommendation:**
  - Keep the step contract, but add an optional server-side driver: a cron-triggered route or a small worker process that calls the same `runStep`.
  - Move the shared runner logic into one client module.
- **Priority:** Low (strategic) · **Confidence:** Confirmed.

#### ARCH-2: Some `src/server` modules don't import `server-only`

- **Description:** These files lack `import "server-only"`:
  - `src/server/providers/types.ts`
  - `src/server/image-ops/types.ts`
  - `src/server/pipeline/run-step.ts`
  - `src/server/pipeline/next-calls.ts`
  - the seven `src/server/actions/*.ts` files (which use `"use server"`)

  Most are type-only or pure, and the actions are already server-only through `"use server"`.

- **Impact:** This breaks the literal wording of rule 1. The practical risk is small, but `run-step.ts` could be pulled into a client bundle by mistake.
- **Recommendation:** Add the import, or write the exceptions into AGENTS.md.
- **Priority:** Low · **Confidence:** Confirmed.

---

### 3.10 Testing

#### TEST-1: No tests for the HTTP boundary or the UI

- **Description:** There are 42 test files: unit tests plus `tests/*.db.test.ts` integration tests and `evals/` for the chat. Coverage is good for pipeline logic, image ops, schemas, crypto, signed media and SSRF. Nothing tests:
  - any Route Handler under `src/app/api/**` or `src/app/media/[id]`: auth, 401/404, Zod 4xx paths
  - any Server Action in `src/server/actions/*`
  - `src/server/providers/woo/http.ts`: error mapping, public-host path and timeouts (only `oauthQuery` is tested)
  - `woo/check.ts`, `woo/variations.ts`, `video/live.ts`, `providers/log.ts` and `env.ts`
  - React components, beyond the pure `autosave.test.ts`
  - end-to-end behaviour (there is no Playwright, although Chromium and Playwright are available)
- **Impact:** Regressions in authorisation, error mapping and the critical user flows (snap, review, save to store) would not be caught. These are the places where audit findings cluster (ERR-1, ERR-2, FE-1, FE-2).
- **Recommendation:**
  - Add route-handler tests that call the exported handlers directly with a mocked `apiViewer`.
  - Add tests for `httpError` mapping and the breaker half-open race.
  - Add one Playwright smoke test of the mock flow (demo sign-in → snap → review → save) in CI.
- **Priority:** Medium · **Confidence:** Confirmed.

#### TEST-2: CI hardening

- **Description:** `.github/workflows/ci.yml`:
  - has no `permissions:` block, so the token gets the default scopes
  - doesn't pin actions by SHA
  - doesn't collect coverage
  - doesn't run `pnpm audit`, which would have flagged DEP-1 and DEP-2
- **Recommendation:**
  - Add `permissions: contents: read`.
  - Add `pnpm audit --prod --audit-level=high`.
  - Optionally add `vitest --coverage` with a threshold and pin actions by SHA.
- **Priority:** Low · **Confidence:** Confirmed.

#### TEST-3: Database tests skip silently without `DATABASE_URL`

- **Description:** `tests/db-helpers.ts` `dbEnv()` returns false when `DATABASE_URL` is missing, and the `*.db.test.ts` suites then skip. Locally this can look like a green run without the integration tests having run. CI sets the variable, so CI is fine.
- **Recommendation:** Print a clear "DB tests skipped" notice, or fail when `CI=true` and there is no database.
- **Priority:** Low · **Confidence:** Confirmed.

---

### 3.11 Maintainability

#### MAINT-1: Duplicated helpers

- **Description:**
  - `decodeEntities` is copied in `src/server/providers/woo/live.ts` and `woo/check.ts`.
  - The two chat routes (`api/chat/route.ts` and `api/listings/[id]/chat/route.ts`) share about 30 lines of identical NDJSON streaming code.
  - A `sleep` helper is defined about 7 times.
  - The HyperFrames version is set in three places (DEP-5).
- **Recommendation:** Move each into one shared helper (`src/lib/sleep.ts`, `src/server/http-stream.ts` and so on).
- **Priority:** Low · **Confidence:** Confirmed.

#### MAINT-2: Comments refer to context a new developer can't see

- **Description:**
  - "Phase 1/5/6/7/R" appears in `src/server/providers/index.ts`, `src/server/pipeline/job-steps.ts`, `src/server/image-ops/index.ts`, `src/app/(public)/page.tsx` and `src/components/app/keyboard-shortcuts.tsx`.
  - "spike" and "cookbook" are mentioned about 15 times in `src/server/providers/meta/*`.
  - `job-steps.ts` says only the first photo is segmented "until Phase 5", while `/api/jobs` accepts 5 photos.
  - "SOHOZ TOOLS" is explained in the README, so it's fine.
- **Impact:** This conflicts with the "no phase numbers" guidance in AGENTS.md and hides intent from contributors.
- **Recommendation:** Rewrite these comments to state the actual constraint, and fix the stale one.
- **Priority:** Low · **Confidence:** Confirmed.

#### MAINT-3: Files over the ~300-line guideline, and dead exports

- **Description:**
  - Files over ~300 lines: `src/components/ui/sidebar.tsx` (734, generated by shadcn, acceptable), `review-form.tsx` (339), `chat-panel.tsx` (329) and `tests/ops.db.test.ts` (380).
  - Several constants are exported but used only in their own file: `describeError`, `LOCK_RENEWALS`, `JOB_ORDER`, `MAX_ITEMS`, `COOKIE_PREFIX`.
- **Recommendation:** Split the two app components (FE-7), and un-export the unused symbols, or add `knip` to CI.
- **Priority:** Low · **Confidence:** Confirmed.

---

### 3.12 Documentation

#### DOC-1: README is out of date

- **Description:** `README.md`:
  - Line 5 says "the live Meta models and the WooCommerce connection land next". Both exist (`src/server/providers/meta/live.ts`, `src/server/providers/woo/live.ts`).
  - It promises an "Instagram post", but Instagram and Facebook are mock only (ERR-3).
  - It doesn't mention reels (HyperFrames, which needs ffmpeg and Chrome), Facebook posting, the shop assistant chat, or `pnpm eval:chat`.
  - The Stack line says "Hosted on Hostinger", while DEPLOY.md's main path is a VPS with `/etc/listsnap/env`.
- **Impact:** New contributors and judges get the wrong picture of what works.
- **Recommendation:** Update the status note, the "How it works" table (add Reel, Post and Chat), the requirements (ffmpeg and Chrome for live video) and the hosting description.
- **Priority:** Medium · **Confidence:** Confirmed.

#### DOC-2: Environment documentation gaps

- **Description:**
  - DEPLOY.md's env template leaves out `PROVIDER_MODE_FACEBOOK` and `PROVIDER_MODE_VIDEO` (it relies on the defaults).
  - `.env.example` leaves out `STORE_PORT`, which `scripts/store-setup.mjs` and `docker-compose.yml` use.
  - Apart from that, `.env.example` matches `src/server/env.ts` exactly.
- **Recommendation:** Add the missing variables with one-line explanations.
- **Priority:** Low · **Confidence:** Confirmed.

#### DOC-3: Missing operational and architecture documentation

- **Description:** Nothing documents:
  - the step and lock lifecycle (claim → renew → complete/fail, attempts, refund/exhaust), beyond the comments in `run-step.ts`
  - the single-instance assumption (SCAL-3)
  - data retention and cleanup schedules, including `pnpm demo:cleanup`
  - that the database must run in UTC (DB-4)
  - a security model summary (auth layers, signed media, SSRF guard, credential encryption)
- **Recommendation:** Add a short `ARCHITECTURE.md` and an "Operations" section in DEPLOY.md that cover the above.
- **Priority:** Low · **Confidence:** Confirmed.

---

## 4. Strengths worth keeping

These were checked and found to be done well. They should be protected as the code evolves.

- **Authorisation:**
  - Every Route Handler calls `apiViewer()` first, and every page and Server Action calls `requireWorkspace()`.
  - `src/proxy.ts` is cookie-only, as designed.
  - Every query found includes `workspace_id = ?`, and a foreign id simply finds nothing.
- **Chat tool safety:**
  - In a listing chat, the server fixes `listingId`.
  - Store-changing ops need a `confirmed` flag that comes only from a stored approval card.
  - Idempotency keys are generated on the server.
  - Media-making calls are capped per message.
- **Step engine:**
  - The claim is an atomic conditional `UPDATE` with locks on the database clock.
  - Expired locks are recovered.
  - Attempts are refunded when a call was never sent and used up when it was refused.
  - A finished step runs again only on an explicit redo.
  - Compare-and-set job transitions are used throughout.
- **Atomic limits:** `reserve()` uses a conditional increment, and slots are returned on failure.
- **Media:**
  - Storage ids are UUIDs, and the `/media/[id]` id is checked with a strict regex.
  - `path.resolve` plus a prefix check prevents path traversal.
  - Uploads are re-encoded, which strips EXIF and GPS data.
  - Responses send `nosniff` and private caching.
- **Signed links:**
  - The HMAC covers workspace, media and expiry, with a separate key context.
  - Signatures are compared with `timingSafeEqual`.
  - Links expire after 15 minutes (1 hour for reels).
- **SSRF:**
  - Addresses are checked both before the request and at connect time, which defeats DNS rebinding.
  - Redirects are refused.
  - IPv4-mapped IPv6 is handled.
  - Plain HTTP is refused in production.
- **Secrets:**
  - Credentials use AES-256-GCM with a random IV and a versioned format, and are decrypted only at the point of use.
  - The UI shows only the last 4 characters.
  - Logs keep summaries, never payloads or photos.
  - The workspace id is hashed before it is sent to Meta.
- **Providers:**
  - Every outbound fetch has an `AbortSignal.timeout`.
  - Model outputs are checked against Zod schemas that also generate the strict JSON schema.
  - Errors are classified clearly as StepError, PermanentError or retryable.
- **Better Auth:**
  - Rate limits are stored in the database, so they survive restarts.
  - The client IP comes from a header nginx overwrites.
  - The magic-link landing page is guarded against mail scanners opening the link.
  - Profile field writes are validated.
- **i18n:** The English and Bangla catalogues have the same keys, with a CI test for it. The time zone is set to `Asia/Dhaka`, and `lang` is set on Bangla text.
- **Tooling:**
  - Strict TypeScript, `typedRoutes`, lint with no warnings.
  - CI runs typecheck, lint, migrations, tests and build against real MariaDB.
  - `pnpm` build scripts are restricted to an explicit allowlist.
  - A systemd unit with sandboxing is provided.

---

## 5. Suggested remediation order

| Order | Items                                           | Why first                                                                               |
| ----: | ----------------------------------------------- | --------------------------------------------------------------------------------------- |
|     1 | DEP-1, DEP-2, TEST-2 (`pnpm audit` in CI)       | Known exploitable framework and HTTP client advisories. The fix is a version bump.      |
|     2 | SEC-1, SEC-4, SEC-2                             | Direct cost exposure and process-level DoS from anonymous users.                        |
|     3 | ERR-1, ERR-2, COMP-1                            | Seller-facing correctness: leaked internals, English-only errors, failing HEIC uploads. |
|     4 | DB-1, PERF-1, PERF-2, DB-5                      | Load hot spots that get worse as shops and data grow.                                   |
|     5 | DB-2, DB-3, DB-4, ERR-5, SCAL-1                 | Concurrency and recovery correctness under slow providers.                              |
|     6 | SEC-3, SEC-5, FE-1 to FE-4, ERR-3, ERR-4, ERR-7 | Hardening and reliability of the UI.                                                    |
|     7 | TEST-1, DOC-1 to DOC-3                          | Lock in the fixes with tests, and bring the docs up to date.                            |
|     8 | The remaining Low items                         | Opportunistic cleanup.                                                                  |

---

## 6. Limits of this audit

- The database integration tests were not run here. They need MariaDB, and there was no Docker daemon. CI runs them.
- No live provider calls (Meta, WooCommerce, HyperFrames) were made. Live-path behaviour was judged from the code.
- No `EXPLAIN` plans were captured. The index findings are based on matching each query against the migration DDL.
- Dependency advisories come from `pnpm audit` on the audit date. Reachability was not analysed for each advisory.
- The browser findings (COMP-1, FE-*) were checked against the code and the documented browser API behaviour, not on physical devices.
