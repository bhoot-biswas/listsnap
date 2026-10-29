import { afterAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { createTestJob, createTestWorkspace, dbEnv, runJob, samplePhoto, widePhoto } from "./db-helpers";

// A whole job through the mock providers and the real database, the way the browser drives it.
const enabled = dbEnv();

describe.skipIf(!enabled)("pipeline end to end (mock providers, MariaDB)", async () => {
  const { getPool } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");
  const { readMedia } = await import("@/server/media/store");
  const { applyChoice, executeJobStep } = await import("@/server/pipeline/execute");
  const { loadJobState } = await import("@/server/pipeline/job-state");

  const shop = await createTestWorkspace({ scenes: ["studio"], listingLanguages: ["en", "bn"] });
  const ws = forWorkspace(shop.workspace.id);

  afterAll(async () => {
    await shop.remove(); // cascades to jobs, listings, media rows and api_calls
    await getPool().end();
  });

  it("turns one product photo into a ready listing with text, Bangla and a studio photo", async () => {
    const jobId = await createTestJob(shop.workspace.id, await samplePhoto("saree.jpg"));
    const state = await runJob(shop.workspace, jobId);

    expect(state.status).toBe("ready");
    expect(state.steps.every((s) => s.status === "done")).toBe(true);
    expect(state.steps.map((s) => s.step).sort()).toEqual(
      ["group", "plan", "render", "segment", "translate", "write"].sort(),
    );
    expect(state.items).toHaveLength(1);
    expect(state.listings).toHaveLength(1);

    const [listing] = state.listings;
    expect(["ready", "needs_review"]).toContain(listing!.status);
    expect(listing!.title).toBeTruthy();
    expect(listing!.titleBn).toBeTruthy();
    expect(listing!.images.map((i) => i.kind)).toEqual(["main", "studio"]);

    // every image the listing shows is a real, readable JPEG in this workspace
    for (const img of listing!.images) {
      const file = await readMedia(shop.workspace.id, img.id);
      expect(file?.mime).toBe("image/jpeg");
      expect((await sharp(file!.data).metadata()).format).toBe("jpeg");
    }

    // each outside call was logged, in mock mode
    expect(state.calls.length).toBeGreaterThanOrEqual(5);
    expect(state.calls.every((c) => c.mode === "mock" && c.ok)).toBe(true);
  });

  it("never redoes a finished step", async () => {
    const jobId = await createTestJob(shop.workspace.id, await samplePhoto("saree.jpg"));
    await runJob(shop.workspace, jobId);
    const callsBefore = (await ws.apiCalls(jobId)).length;
    const again = await executeJobStep(shop.workspace, jobId, "plan");
    expect(again).toMatchObject({ found: true, outcome: { state: "done", fresh: false } });
    expect((await ws.apiCalls(jobId)).length).toBe(callsBefore);
  });

  it("waits for the seller on a multi-item photo, then makes one listing per kept item", async () => {
    const jobId = await createTestJob(shop.workspace.id, await widePhoto());
    const waiting = await runJob(shop.workspace, jobId);

    expect(waiting.status).toBe("awaiting_choice");
    expect(waiting.items).toHaveLength(3);
    expect(waiting.suggestion).not.toBeNull();
    expect(waiting.listings).toHaveLength(0);

    const keep = waiting.items.slice(0, 2).map((i) => i.id);
    expect(await applyChoice(shop.workspace, jobId, { mode: "separate", keepItemIds: keep })).toBe("ok");
    // a second click must not make duplicates
    expect(await applyChoice(shop.workspace, jobId, { mode: "separate", keepItemIds: keep })).toBe("not_waiting");

    const done = await runJob(shop.workspace, jobId);
    expect(done.status).toBe("ready");
    expect(done.listings).toHaveLength(2);
    // separate listings get the studio photo only, to keep image costs down
    expect(done.scenes).toEqual(["studio"]);
    for (const l of done.listings) expect(l.images.map((i) => i.kind)).toEqual(["main", "studio"]);
  });

  it("skips Bangla when the shop writes English only", async () => {
    const english = await createTestWorkspace({ scenes: ["studio"], listingLanguages: ["en"] });
    try {
      const jobId = await createTestJob(english.workspace.id, await samplePhoto("saree.jpg"));
      const state = await runJob(english.workspace, jobId);
      expect(state.status).toBe("ready");
      expect(state.steps.some((s) => s.step === "translate")).toBe(false);
      expect(state.listings[0]!.titleBn).toBeNull();
    } finally {
      await english.remove();
    }
  });

  it("sets the lifestyle scene in the shop's own photo when the brand kit has one", async () => {
    const kitShop = await createTestWorkspace({ scenes: ["lifestyle", "banner"], listingLanguages: ["en"] });
    try {
      const { saveMedia } = await import("@/server/media/store");
      const room = await samplePhoto("kurti.jpg");
      const brand = await saveMedia(kitShop.workspace.id, "brand", room, {
        mime: "image/jpeg",
        width: 1280,
        height: 1280,
      });
      // the runner is handed the workspace, as a page would load it after the kit was saved
      const workspace = {
        ...kitShop.workspace,
        settings: { ...kitShop.workspace.settings, brandKit: { colors: ["#7A1F2B"], settingMediaId: brand.id } },
      };
      const jobId = await createTestJob(workspace.id, await samplePhoto("saree.jpg"));
      const state = await runJob(workspace, jobId);

      expect(state.status).toBe("ready");
      expect(state.listings[0]!.images.map((i) => i.kind)).toEqual(["main", "lifestyle", "banner"]);
      const lifestyle = state.calls.find((c) => c.step === "render" && c.summary?.startsWith("lifestyle"));
      expect(lifestyle?.summary).toContain("in the shop setting");
    } finally {
      await kitShop.remove();
    }
  });

  it("falls back to the brief's scene when the shop photo has gone", async () => {
    const kitShop = await createTestWorkspace({ scenes: ["lifestyle"], listingLanguages: ["en"] });
    try {
      const workspace = {
        ...kitShop.workspace,
        settings: {
          ...kitShop.workspace.settings,
          brandKit: { colors: [], settingMediaId: "00000000-0000-4000-8000-000000000000" },
        },
      };
      const jobId = await createTestJob(workspace.id, await samplePhoto("saree.jpg"));
      const state = await runJob(workspace, jobId);
      expect(state.status).toBe("ready");
      const lifestyle = state.calls.find((c) => c.step === "render");
      expect(lifestyle?.summary).toContain("from the cutout");
    } finally {
      await kitShop.remove();
    }
  });

  it("reports an unknown job as missing rather than failing", async () => {
    expect(await loadJobState(shop.workspace, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
