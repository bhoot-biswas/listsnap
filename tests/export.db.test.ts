import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestJob, createTestWorkspace, dbEnv, runJob, samplePhoto } from "./db-helpers";

/**
 * Export on the real database: the route only hands out a shop's own finished listings,
 * refuses more than it takes, needs a website for Meta's catalog, and the zips it streams
 * hold what the seller expects.
 */
const enabled = dbEnv();

const viewer = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/server/auth/session", () => ({ apiViewer: async () => viewer.current }));

describe.skipIf(!enabled)("export (MariaDB)", async () => {
  const { getPool } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");
  const { GET } = await import("@/app/api/export/route");

  const a = await createTestWorkspace({ website: "https://facebook.com/test-shop" });
  const b = await createTestWorkspace();
  let listingId = "";
  let unfinishedId = "";
  const as = (ws: typeof a) => (viewer.current = { workspace: ws.workspace });
  const get = (q: string) => GET(new Request(`http://test/api/export?${q}`));

  /** Lists a zip's entries with unzip, which also checks every CRC. */
  const zipNames = async (res: Response) => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "export-")), "t.zip");
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    expect(execFileSync("unzip", ["-t", file]).toString()).toContain("No errors detected");
    return execFileSync("unzip", ["-Z1", file]).toString().trim().split("\n");
  };

  beforeAll(async () => {
    const jobId = await createTestJob(a.workspace.id, await samplePhoto("saree.jpg"));
    listingId = (await runJob(a.workspace, jobId)).listings[0]!.id;
    const other = await createTestJob(a.workspace.id, await samplePhoto("saree.jpg"));
    // made but never run, so its listing is still processing
    unfinishedId = (await forWorkspace(a.workspace.id).createListings(other, [{ itemIds: [] }]))[0]!;
  });

  afterAll(async () => {
    await a.remove();
    await b.remove();
    await getPool().end();
  });

  it("needs a session, and checks what it's asked for", async () => {
    viewer.current = null;
    expect((await get(`format=kit&ids=${listingId}`)).status).toBe(401);
    as(a);
    expect((await get(`format=pdf&ids=${listingId}`)).status).toBe(400);
    expect((await get("format=kit&ids=nope")).status).toBe(400);
    const many = Array.from({ length: 51 }, () => randomUUID()).join(",");
    const res = await get(`format=kit&ids=${many}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "too_many" } });
  });

  it("finds nothing in another shop, and refuses an unfinished listing", async () => {
    as(b);
    expect((await get(`format=kit&ids=${listingId}`)).status).toBe(404);
    as(a);
    expect((await get(`format=kit&ids=${unfinishedId}`)).status).toBe(409);
  });

  it("asks for the shop's website before a Facebook catalog", async () => {
    as(b);
    const res = await get(`format=facebook&ids=${listingId}`);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: "no_website" } });
  });

  it("streams one listing's kit: the text in both languages and its photos as JPEGs", async () => {
    as(a);
    const res = await get(`format=kit&ids=${listingId}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="listsnap-.+-[0-9a-f]{8}\.zip"$/);
    const names = await zipNames(res);
    expect(names).toContain("listing-en.txt");
    expect(names).toContain("listing-bn.txt");
    expect(names).toContain("photos/01-main.jpg");
  });

  it("puts several listings in one zip with the three CSVs and a READ ME, leaving out unfinished ones", async () => {
    as(a);
    const names = await zipNames(await get(`format=kit&ids=${listingId},${unfinishedId}`));
    expect(names.slice(0, 4)).toEqual([
      "READ ME.txt",
      "catalog-facebook.csv",
      "products-woocommerce.csv",
      "products-shopify.csv",
    ]);
    expect(names.filter((n) => n.endsWith("/listing-en.txt"))).toHaveLength(1);
  });

  it("gives each CSV on its own, with month-long signed photo links", async () => {
    as(a);
    const res = await get(`format=facebook&ids=${listingId}`);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    const body = await res.text();
    expect(body).toContain(`\nlistsnap-${listingId},`);
    expect(body).toContain(",https://facebook.com/test-shop,");
    const expires = Number(/[?&]e=(\d+)/.exec(body)![1]);
    expect(expires * 1000 - Date.now()).toBeGreaterThan(29 * 24 * 3600 * 1000);
    expect((await get(`format=shopify&ids=${listingId}`)).status).toBe(200);
    expect((await get(`format=woocommerce&ids=${listingId}`)).status).toBe(200);
  });

  it("hands a phone the photo links and the text to share", async () => {
    as(a);
    const body = (await (await get(`format=photos&ids=${listingId}`)).json()) as { urls: string[]; text: string };
    expect(body.urls[0]).toMatch(/^\/media\/[0-9a-f-]{36}$/);
    expect(body.text.startsWith("TITLE\r\n")).toBe(true);
  });
});
