import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestJob, createTestWorkspace, dbEnv, runJob, samplePhoto } from "./db-helpers";

/**
 * The rules every op must keep, checked on the real database: bad input is refused, another
 * shop's ids are "not found", store changes need confirmation, a repeated key runs once,
 * and undo puts a listing back exactly.
 */
const enabled = dbEnv();

describe.skipIf(!enabled)("ops (MariaDB)", async () => {
  const { getPool, select } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");
  const { opList, ops } = await import("@/server/ops");

  const a = await createTestWorkspace();
  const b = await createTestWorkspace();
  const A = forWorkspace(a.workspace.id);
  let listingId = "";

  /** A valid input for each op, aimed at shop A's listing. A new op must add one here. */
  const fixtures = (): Record<string, unknown> => ({
    getListingSummary: { listingId },
    saveListingEdit: { listingId, edit: validEdit() },
    editListingFields: { listingId, title: "Fixture title" },
    undoLast: { listingId },
    renderScene: { listingId, scene: "studio" },
    saveDraftToStore: { listingId },
    estimateCost: { op: "renderScene", input: { listingId, scene: "lifestyle" } },
  });
  const validEdit = () => ({
    en: { title: "Edited", short_description: "", description: "", attributes: [], tags: [], category: "Sarees" },
    bn: null,
    priceBdt: 1500,
    stockQty: 2,
    selectedMediaIds: [],
    variants: null,
  });
  const title = async () => ((await A.getListing(listingId))!.fields_json?.en as { title: string }).title;

  beforeAll(async () => {
    const jobId = await createTestJob(a.workspace.id, await samplePhoto("saree.jpg"));
    listingId = (await runJob(a.workspace, jobId)).listings[0]!.id;
  });

  afterAll(async () => {
    await a.remove();
    await b.remove();
    await getPool().end();
  });

  it("has a fixture for every op, so none skips these checks", () => {
    expect(Object.keys(fixtures()).sort()).toEqual(
      opList()
        .map((o) => o.name)
        .sort(),
    );
  });

  it("refuses input that doesn't match the op's schema", async () => {
    for (const op of opList()) {
      expect(await op.call(a.workspace, {}, { via: "ui", confirmed: true }), op.name).toEqual({
        ok: false,
        error: "invalid",
      });
      expect(await op.call(a.workspace, "nonsense", { via: "chat", confirmed: true }), op.name).toMatchObject({
        ok: false,
        error: "invalid",
      });
    }
  });

  it("treats another shop's listing as not found and changes nothing", async () => {
    const before = JSON.stringify(await A.getListing(listingId));
    for (const op of opList()) {
      if (op.name === "estimateCost") continue; // reads no listing; its input is only parsed
      const r = await op.call(b.workspace, fixtures()[op.name], { via: "chat", confirmed: true });
      expect(r, op.name).toMatchObject({ ok: false, error: "not_found" });
    }
    expect(JSON.stringify(await A.getListing(listingId))).toBe(before);
    // and B's audit trail names no listing of A's
    expect(
      await select("SELECT id FROM op_runs WHERE workspace_id = ? AND listing_id = ?", [b.workspace.id, listingId]),
    ).toEqual([]);
  });

  it("won't change the store without the seller's confirmation", async () => {
    const r = await ops.saveDraftToStore.call(a.workspace, { listingId }, { via: "chat" });
    expect(r).toEqual({ ok: false, error: "needs_confirmation" });
    expect((await A.getListing(listingId))!.status).not.toBe("in_store");
  });

  it("runs a repeated key once and returns the first result", async () => {
    const key = "tool-call-1";
    const first = await ops.editListingFields.call(
      a.workspace,
      { listingId, title: "First" },
      { via: "chat", idempotencyKey: key },
    );
    const again = await ops.editListingFields.call(
      a.workspace,
      { listingId, title: "Second" },
      { via: "chat", idempotencyKey: key },
    );
    expect(first).toMatchObject({ ok: true, replayed: false });
    expect(again).toMatchObject({ ok: true, replayed: true });
    expect(await title()).toBe("First");

    // five at once with one key: exactly one does the work
    const burst = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        ops.editListingFields.call(
          a.workspace,
          { listingId, title: `Burst ${i}` },
          { via: "chat", idempotencyKey: "burst" },
        ),
      ),
    );
    expect(burst.filter((r) => r.ok && !r.replayed)).toHaveLength(1);
    expect(burst.every((r) => r.ok || r.error === "busy")).toBe(true);
    const rows = await select<{ n: number }>(
      "SELECT COUNT(*) AS n FROM op_runs WHERE workspace_id = ? AND idem_key = 'burst'",
      [a.workspace.id],
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it("undoes changes one at a time, back to where the listing started", async () => {
    // start from a clean history for this listing
    while ((await ops.undoLast.call(a.workspace, { listingId }, { via: "ui" })).ok);
    const original = await A.listingSnapshot(listingId);

    await ops.editListingFields.call(a.workspace, { listingId, title: "One", priceBdt: 900 }, { via: "ui" });
    await ops.saveListingEdit.call(a.workspace, { listingId, edit: validEdit() }, { via: "ui" });
    expect(await title()).toBe("Edited");

    expect(await ops.undoLast.call(a.workspace, { listingId }, { via: "chat" })).toMatchObject({
      ok: true,
      value: { undone: "saveListingEdit" },
    });
    expect(await title()).toBe("One");
    expect((await A.getListing(listingId))!.price_bdt).toBe(900);

    await ops.undoLast.call(a.workspace, { listingId }, { via: "chat" });
    expect(await A.listingSnapshot(listingId)).toEqual(original);

    expect(await ops.undoLast.call(a.workspace, { listingId }, { via: "chat" })).toMatchObject({
      ok: false,
      error: "not_ready",
    });
  });

  it("records who ran what without the seller's text", async () => {
    await ops.editListingFields.call(a.workspace, { listingId, title: "Secret wording" }, { via: "chat" });
    const runs = await A.opRuns(listingId);
    const last = runs.at(-1)!;
    expect(last).toMatchObject({ op: "editListingFields", via: "chat", status: "done", summary: "title" });
    expect(JSON.stringify(runs.map((r) => r.summary))).not.toContain("Secret wording");
  });

  it("makes a scene and records which image it came from", async () => {
    const cost = await ops.estimateCost.call(a.workspace, fixtures().estimateCost, { via: "chat" });
    expect(cost).toMatchObject({ ok: true, value: { images: 1 } });

    const r = await ops.renderScene.call(a.workspace, { listingId, scene: "lifestyle" }, { via: "chat" });
    expect(r).toMatchObject({ ok: true, value: { outcome: { state: "done" } } });
    const rows = await select<{ from_media_id: string | null }>(
      "SELECT from_media_id FROM media WHERE workspace_id = ? AND listing_id = ? AND kind = 'lifestyle'",
      [a.workspace.id, listingId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.from_media_id).toBeTruthy();
  });

  it("saves a confirmed store draft once, even when asked twice", async () => {
    const meta = { via: "chat" as const, confirmed: true, idempotencyKey: "save-1" };
    const first = await ops.saveDraftToStore.call(a.workspace, { listingId }, meta);
    const again = await ops.saveDraftToStore.call(a.workspace, { listingId }, meta);
    expect(first).toMatchObject({ ok: true, replayed: false, value: { outcome: { state: "done" } } });
    expect(again).toMatchObject({ ok: true, replayed: true });
    expect((await A.getListing(listingId))!.status).toBe("in_store");
  });
});
