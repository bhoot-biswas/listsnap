<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ListSnap: rules for coding agents

ListSnap turns a seller's product photo into a WooCommerce draft, studio photos and an Instagram post, in English and Bangla, using Meta's Muse Spark, SAM 3.1 and Muse Image. Next.js 16 (App Router, `src/`), React 19, TypeScript strict, MariaDB/MySQL, Better Auth, shadcn/ui (base-nova) with Tailwind v4, next-intl.

## Commands

```bash
pnpm db:up && pnpm db:migrate   # local MariaDB in Docker (port 3307), then the tables
pnpm dev                        # http://localhost:3000, all providers mocked by default
pnpm typecheck && pnpm lint && pnpm test && pnpm build   # what CI runs
```

## Next.js conventions

1. `src/app` holds routes only. `(public)` and `(app)` route groups give the public pages and the sidebar shell their own layouts. Route-only components live in a private `_components` folder next to the route.
2. Server Components by default. `"use client"` only on small interactive leaves.
3. `src/proxy.ts` (Next 16's renamed middleware) only does an optimistic cookie check. It never touches the database.
4. Real auth is in the Data Access Layer: every page, Route Handler and Server Action calls `requireWorkspace()` (pages, actions) or `apiViewer()` (routes) itself. Never rely on a layout for auth.
5. Route Handlers for what the browser calls as an API (pipeline steps, uploads, `/media/[id]`). Server Actions for form saves. Server Components read through the DAL, never via our own Route Handlers.
6. `cacheComponents` stays off; pages are per-user and dynamic.
7. Expected errors are returned as values; unexpected ones reach the `error.tsx` boundaries.

## ListSnap rules

1. **Only `src/server/env.ts` reads `process.env`.** Every module in `src/server/` starts with `import "server-only"`.
2. **No SQL outside `src/server/db/`.** Every app query is workspace-scoped through `forWorkspace(id)`, parameterized only.
3. **Validate every boundary with Zod:** request bodies, form data, model outputs.
4. **Pipeline steps follow the rules in `src/server/pipeline/run-step.ts`:** a saved result is returned first, work starts only after an atomic claim, at most 3 attempts, no HTTP inside step code. The browser asks the server what to call next (`next-calls.ts`); never decide step order on the client.
5. **Outside services only through `src/server/providers/*`**, each with a mock (`PROVIDER_MODE_*=mock|live`). Every call goes through `logged()` into `api_calls`; never log secrets or photos.
6. **Errors shown to sellers are `StepError`s** with words written for them. Anything else becomes a generic message, and the details go to the server log.
7. **No UI text in components.** All strings live in `messages/en.json` and `messages/bn.json`. Status words: Processing, Needs review, Ready, In store, Posted, Failed. Never "Submit" or "Publish"; store products are always drafts.
8. **Secrets:** env only. Store credentials are encrypted with `encryptSecret()` (AES-256-GCM) and never sent to the client.
9. **Comments explain why**, not what. Small modules (under ~300 lines).
10. **Naming:** `kebab-case` files, `PascalCase` components, `camelCase` functions, `snake_case` columns, `SCREAMING_SNAKE` env vars.
11. **Accessibility:** 44 px tap targets on phone, keyboard reachable, `aria-live` for progress, `lang="bn"` on Bangla text.

## Git

- New work goes on its own branch off an up-to-date `main` (`feat/<short-name>`, `fix/<short-name>`, `chore/<short-name>`), never directly on `main`.
- Small commits on that branch. The maintainer reviews and merges into `main`; agents never merge or push to `main` themselves.
- Commit messages: a short summary line (≤ 72 characters), a blank line, then a body shaped to the change. A one-line fix may need no body. Otherwise open with a sentence or two on what the change does and why, then bullets only where there is a real list (new files, routes, settings). Prose, bullets or both, whichever reads best; keep it brief. No phase or milestone numbers, no testing narrative, no attribution lines.
- Internal planning lives in `docs/`, which is gitignored; don't reference it from committed files.
