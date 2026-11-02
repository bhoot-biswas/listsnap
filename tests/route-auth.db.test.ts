import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestJob, createTestWorkspace, dbEnv, runJob, samplePhoto, sampleVideo } from "./db-helpers";

/**
 * Access control is in each Route Handler (AGENTS.md: apiViewer() in every route), not in
 * a layout or the proxy. This calls every handler under src/app, found on disk so a new
 * route is covered without anyone remembering to add it: signed out it must be turned
 * away, and signed in to another shop it must neither answer with shop A's things nor
 * change them.
 */
const enabled = dbEnv();

const viewer = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/server/auth/session", () => ({ apiViewer: async () => viewer.current }));
// a handler called directly has no request around it: an empty cookie jar and headers
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));

/** Routes that answer without a signed-in seller, and why. Anything else must call apiViewer(). */
const PUBLIC: Record<string, string> = {
  "api/auth/[...all]": "Better Auth's own endpoints: sign-in itself",
  "api/health": "the deploy's health check; no shop data",
  "api/shopify/webhooks": "Shopify calls it; checked by HMAC, not a session",
};

const APP = path.join(process.cwd(), "src/app");
const routes = (readdirSync(APP, { recursive: true }) as string[])
  .filter((f) => f.endsWith(`${path.sep}route.ts`) || f === "route.ts")
  .map((f) => path.dirname(f).split(path.sep).join("/"))
  .sort();
const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;

/** Next's redirect() throws; a redirect to sign-in counts as turned away. */
const outcome = async (call: () => Promise<Response>): Promise<{ status: number; to?: string }> => {
  try {
    const res = await call();
    return { status: res.status };
  } catch (err) {
    const digest = String((err as { digest?: string })?.digest ?? "");
    if (digest.startsWith("NEXT_REDIRECT")) return { status: 307, to: digest.split(";")[2] };
    // a crash is not a refusal: name the route that crashed
    throw new Error(`threw ${err instanceof Error ? err.message : String(err)}`);
  }
};

describe.skipIf(!enabled)("every Route Handler checks who is asking (MariaDB)", async () => {
  const { getPool, selectOne } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");
  const { saveMedia } = await import("@/server/media/store");

  const a = await createTestWorkspace();
  const b = await createTestWorkspace();
  const ids = { listing: "", job: "", batch: "", chat: "", media: "" };
  const user = (id: string) => ({ id, name: "Seller", email: null, phone: null, isAnonymous: false, uiLang: "en" });

  beforeAll(async () => {
    const A = forWorkspace(a.workspace.id);
    ids.job = await createTestJob(a.workspace.id, await samplePhoto("saree.jpg"));
    const state = await runJob(a.workspace, ids.job);
    ids.listing = state.listings[0]!.id;
    const video = await saveMedia(a.workspace.id, "video", await sampleVideo(1), {
      mime: "video/mp4",
      width: 0,
      height: 0,
      selected: false,
    });
    ids.batch = await A.createVideoBatch(video.id);
    ids.media = video.id;
    ids.chat = await A.startChat(ids.listing, "about the saree");
  });

  afterAll(async () => {
    await a.remove();
    await b.remove();
    await getPool().end();
  });

  /** Shop A's things the other shop must not reach: what the route params point at. */
  const params = (route: string): Record<string, string> => {
    const id = route.startsWith("api/listings/")
      ? ids.listing
      : route.startsWith("api/jobs/")
        ? ids.job
        : route.startsWith("api/batches/")
          ? ids.batch
          : route.startsWith("api/chats/")
            ? ids.chat
            : route.startsWith("media/")
              ? ids.media
              : "00000000-0000-4000-8000-000000000000";
    return { id, step: route.startsWith("api/jobs/") ? "plan" : "write", look: "eid", language: "en", all: "x" };
  };

  /** A body that passes validation where it can, so the route gets as far as looking the id up. */
  const BODY: Record<string, unknown> = {
    "api/listings/[id]/assist": { field: "title", action: "rewrite", lang: "en", text: "Red saree" },
    "api/listings/[id]/post": { destination: "facebook", lang: "en", caption: "New in" },
    "api/listings/[id]/chat": { message: "make it shorter", photoIds: [] },
    "api/chat": { message: "hello", photoIds: [] },
    "api/jobs/[id]/choice": { mode: "single" },
  };
  const request = (route: string, method: string) =>
    new Request(`http://test/${route.replace(/\[\.\.\.\w+\]|\[(\w+)\]/g, (_, k) => (k ? params(route)[k]! : "x"))}`, {
      method,
      headers: { "content-type": "application/json", "x-real-ip": "203.0.113.5" },
      body: method === "GET" ? undefined : JSON.stringify(BODY[route] ?? {}),
    });

  const handlers = async () => {
    const out: { route: string; method: string; fn: (r: Request, c: unknown) => Promise<Response> }[] = [];
    for (const route of routes) {
      const mod = (await import(`@/app/${route}/route`)) as Record<string, unknown>;
      for (const m of METHODS) if (typeof mod[m] === "function") out.push({ route, method: m, fn: mod[m] as never });
    }
    return out;
  };

  it("finds the routes on disk, and each one either checks the seller or is listed as public", () => {
    expect(routes.length).toBeGreaterThan(30);
    for (const route of routes) {
      if (PUBLIC[route]) continue;
      const src = readFileSync(path.join(APP, route, "route.ts"), "utf8");
      expect(src, `${route} must call apiViewer() or be listed in PUBLIC with a reason`).toMatch(/apiViewer\(/);
    }
    for (const listed of Object.keys(PUBLIC)) expect(routes, `${listed} is listed but gone`).toContain(listed);
  });

  it("turns away every request that isn't signed in", async () => {
    viewer.current = null;
    const allowed: string[] = [];
    for (const h of await handlers()) {
      if (PUBLIC[h.route]) continue;
      const r = await outcome(() =>
        h.fn(request(h.route, h.method), { params: Promise.resolve(params(h.route)) }),
      ).catch((err: Error) => ({ status: 0, to: `${h.method} /${h.route} ${err.message}` }));
      // 404 is /media's answer: it also opens by signed link, so it doesn't say the file exists
      const away = r.status === 401 || r.status === 404 || (r.status === 307 && r.to?.startsWith("/sign-in"));
      if (!away) allowed.push(`${h.method} /${h.route} → ${r.status}${r.to ? ` ${r.to}` : ""}`);
    }
    expect(allowed).toEqual([]);
  });

  it("never answers with another shop's things, or changes them", async () => {
    const snapshot = async () => ({
      listing: await selectOne("SELECT status, fields_json, updated_at FROM listings WHERE id = ?", [ids.listing]),
      steps: await selectOne("SELECT COUNT(*) AS n, MAX(finished_at) AS last FROM job_steps WHERE job_id = ?", [
        ids.job,
      ]),
      calls: await selectOne("SELECT COUNT(*) AS n FROM api_calls WHERE workspace_id = ?", [a.workspace.id]),
      chat: await selectOne("SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id = ?", [ids.chat]),
      batch: await selectOne("SELECT status FROM batch_steps WHERE batch_id = ?", [ids.batch]),
    });
    const before = await snapshot();
    viewer.current = { user: user("other-seller"), workspace: b.workspace };
    const answered: string[] = [];
    for (const h of await handlers()) {
      if (PUBLIC[h.route] || !/\[id\]/.test(h.route)) continue;
      const r = await outcome(() =>
        h.fn(request(h.route, h.method), { params: Promise.resolve(params(h.route)) }),
      ).catch((err: Error) => ({ status: 0, to: `${h.method} /${h.route} ${err.message}` }));
      if (r.status === 0) answered.push(r.to!);
      // a refusal of any kind is fine; answering (2xx) or handing over a stream is not
      if (r.status >= 200 && r.status < 300) answered.push(`${h.method} /${h.route} → ${r.status}`);
    }
    expect(answered).toEqual([]);
    expect(await snapshot()).toEqual(before);
  });
});
