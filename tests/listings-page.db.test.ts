import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestJob, createTestWorkspace, dbEnv, runJob, samplePhoto } from "./db-helpers";

/** The Listings page's query: order, search across titles, categories and tags, and counts that agree. */
const enabled = dbEnv();

describe.skipIf(!enabled)("Listings page (MariaDB)", async () => {
  const { execute, getPool } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");

  const a = await createTestWorkspace();
  const A = forWorkspace(a.workspace.id);
  const ids: Record<"saree" | "kurti" | "bangles", string> = { saree: "", kurti: "", bangles: "" };

  // what the seller and the model would have written, set directly so each case is certain
  const set = (
    id: string,
    f: { title: string; titleBn: string; category: string; tags: string[] },
    price: number | null,
    confidence: number,
    day: number,
  ) =>
    execute(
      `UPDATE listings SET fields_json = JSON_SET(COALESCE(fields_json, '{}'), '$.en', JSON_OBJECT('title', ?, 'category', ?, 'tags', JSON_EXTRACT(?, '$')),
                                           '$.bn', JSON_OBJECT('title', ?)),
              price_bdt = ?, confidence = ?, status = 'ready', created_at = ? WHERE id = ?`,
      [f.title, f.category, JSON.stringify(f.tags), f.titleBn, price, confidence, new Date(Date.UTC(2030, 0, day)), id],
    );

  beforeAll(async () => {
    for (const name of ["saree", "kurti", "bangles"] as const) {
      const jobId = await createTestJob(a.workspace.id, await samplePhoto(`${name}.jpg`));
      ids[name] = (await runJob(a.workspace, jobId)).listings[0]!.id;
    }
    await set(
      ids.saree,
      { title: "Red Silk Saree", titleBn: "লাল সিল্ক শাড়ি", category: "Sarees", tags: ["wedding", "silk"] },
      4500,
      0.9,
      1,
    );
    await set(
      ids.kurti,
      { title: "Cotton Kurti", titleBn: "সুতি কুর্তি", category: "Women's Tops", tags: ["summer"] },
      null,
      0.4,
      2,
    );
    await set(
      ids.bangles,
      { title: "Glass Bangles", titleBn: "কাচের চুড়ি", category: "Jewellery", tags: ["eid", "Wedding gift"] },
      350,
      0.7,
      3,
    );
  });

  afterAll(async () => {
    await a.remove();
    await getPool().end();
  });

  const order = async (sort: Parameters<typeof A.listingPage>[0]["sort"], q = "") =>
    (await A.listingPage({ status: null, q, page: 1, sort })).rows.map((r) => r.id);

  it("orders by date, by price with unpriced ones last, and least sure first", async () => {
    expect(await order(undefined)).toEqual([ids.bangles, ids.kurti, ids.saree]);
    expect(await order("oldest")).toEqual([ids.saree, ids.kurti, ids.bangles]);
    expect(await order("price_low")).toEqual([ids.bangles, ids.saree, ids.kurti]);
    expect(await order("price_high")).toEqual([ids.saree, ids.bangles, ids.kurti]);
    expect(await order("check")).toEqual([ids.kurti, ids.bangles, ids.saree]);
  });

  it("finds a listing by its category, a tag or its Bangla title, and counts only what it finds", async () => {
    expect(await order(undefined, "jewel")).toEqual([ids.bangles]);
    expect(await order("oldest", "wedding")).toEqual([ids.saree, ids.bangles]);
    expect(await order(undefined, "শাড়ি")).toEqual([ids.saree]);
    expect(await order(undefined, "50%")).toEqual([]);
    expect(await A.statusCounts("wedding")).toEqual({ ready: 2 });
    expect(await A.statusCounts()).toEqual({ ready: 3 });
  });

  it("names the stores holding a draft, and finds the ones changed since", async () => {
    await A.markInStore(ids.saree, "woo", "101");
    await A.markInStore(ids.saree, "shopify", "gid://shopify/Product/7");
    await A.markInStore(ids.bangles, "woo", "102");
    await execute("UPDATE listings SET edited_at = sent_at + INTERVAL 1 MINUTE WHERE id = ?", [ids.saree]);
    const rows = (await A.listingPage({ status: null, q: "", page: 1 })).rows;
    const row = (id: string) => rows.find((r) => r.id === id)!;
    expect(row(ids.saree)).toMatchObject({ stores: ["woo", "shopify"], behind: true });
    expect(row(ids.bangles)).toMatchObject({ stores: ["woo"], behind: false });
    expect(row(ids.kurti)).toMatchObject({ stores: [], behind: false });

    const behind = await A.listingPage({ status: null, q: "", page: 1, behind: true });
    expect(behind.rows.map((r) => r.id)).toEqual([ids.saree]);
    expect(behind.total).toBe(1);
    expect(await A.statusCounts()).toEqual({ ready: 1, in_store: 2, behind: 1 });
    expect((await A.statusCounts("bangles")).behind).toBeUndefined();
  });
});
