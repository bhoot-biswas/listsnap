import { afterAll, describe, expect, it } from "vitest";
import { createTestWorkspace, dbEnv, runJob, samplePhoto } from "./db-helpers";

/** "Same product, different angles": the photos after the first go with the listing. */
const enabled = dbEnv();

describe.skipIf(!enabled)("other angles of one product (MariaDB)", async () => {
  const { getPool } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");
  const { normalisePhoto, saveMedia } = await import("@/server/media/store");
  const { listingProduct } = await import("@/server/stores/listing-product");
  const { attachAngles } = await import("@/server/pipeline/job-steps");

  const a = await createTestWorkspace({ scenes: ["studio"] });
  const ws = forWorkspace(a.workspace.id);
  afterAll(async () => {
    await a.remove();
    await getPool().end();
  });

  const photo = async (name: string) => {
    const p = await normalisePhoto(await samplePhoto(name));
    const media = await saveMedia(a.workspace.id, "original", p.data, {
      mime: "image/jpeg",
      width: p.width,
      height: p.height,
    });
    return { mediaId: media.id, width: p.width, height: p.height };
  };

  it("shows the other photos in Review and sends them to the store, after the made ones", async () => {
    const jobId = await ws.createJob([await photo("saree.jpg"), await photo("kurti.jpg"), await photo("saree.jpg")]);
    const done = await runJob(a.workspace, jobId);
    expect(done.listings).toHaveLength(1);
    const listing = done.listings[0]!;
    expect(listing.images.map((i) => i.kind)).toEqual(["main", "studio", "angle", "angle"]);

    const product = await listingProduct(ws, a.workspace, (await ws.getListing(listing.id))!);
    expect(product.images).toHaveLength(4);
    expect(product.images.slice(2).map((i) => i.mediaId)).toEqual(listing.images.slice(2).map((i) => i.id));

    // a retried group step doesn't add them again
    await attachAngles(ws, jobId, listing.id);
    expect((await ws.listingMedia([listing.id])).filter((m) => m.kind === "angle")).toHaveLength(2);
  });

  it("adds nothing for one photo", async () => {
    const jobId = await ws.createJob([await photo("saree.jpg")]);
    const done = await runJob(a.workspace, jobId);
    expect(done.listings[0]!.images.map((i) => i.kind)).toEqual(["main", "studio"]);
  });
});
