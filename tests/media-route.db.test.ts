import { rm } from "node:fs/promises";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createTestWorkspace, dbEnv, samplePhoto } from "./db-helpers";

/**
 * /media on the real database: another shop's file is never served, a cached copy is
 * confirmed before any file is read, sized copies are made once, and a video is sent
 * in the ranges the player asks for.
 */
const enabled = dbEnv();

const viewer = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/server/auth/session", () => ({ apiViewer: async () => viewer.current }));

describe.skipIf(!enabled)("/media (MariaDB)", async () => {
  const { getPool } = await import("@/server/db/pool");
  const { saveMedia, locateMedia } = await import("@/server/media/store");
  const { GET } = await import("@/app/media/[id]/route");

  const a = await createTestWorkspace();
  const b = await createTestWorkspace();
  const photo = await saveMedia(a.workspace.id, "original", await samplePhoto("saree.jpg"), {
    mime: "image/jpeg",
    width: 1200,
    height: 1200,
  });
  const reel = await saveMedia(a.workspace.id, "reel", Buffer.from("0123456789abcdefghij"), {
    mime: "video/mp4",
    width: 1080,
    height: 1920,
  });
  const as = (ws: typeof a | null) => (viewer.current = ws && { workspace: ws.workspace });
  const get = (id: string, query = "", headers: Record<string, string> = {}) =>
    GET(new Request(`http://test/media/${id}${query}`, { headers }), { params: Promise.resolve({ id }) });

  afterAll(async () => {
    await a.remove();
    await b.remove();
    await getPool().end();
  });

  it("serves only the shop's own files", async () => {
    as(null);
    expect((await get(photo.id)).status).toBe(404);
    as(b);
    expect((await get(photo.id)).status).toBe(404);
    // even a browser that holds the copy gets nothing from another shop
    expect((await get(photo.id, "", { "if-none-match": `"${photo.id}"` })).status).toBe(404);
    as(a);
    const res = await get(photo.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(Number(res.headers.get("content-length"))).toBe((await res.arrayBuffer()).byteLength);
  });

  it("makes a smaller copy once, as WebP, and keeps videos whole", async () => {
    as(a);
    const small = await get(photo.id, "?w=96");
    expect(small.headers.get("content-type")).toBe("image/webp");
    expect(small.headers.get("etag")).toBe(`"${photo.id}-w96"`);
    const bytes = (await small.arrayBuffer()).byteLength;
    expect(bytes).toBeLessThan(10_000);
    expect((await (await get(photo.id, "?w=96")).arrayBuffer()).byteLength).toBe(bytes);
    // a width outside the list, or asked of a video, gets the original
    expect((await get(photo.id, "?w=500")).headers.get("etag")).toBe(`"${photo.id}"`);
    expect((await get(reel.id, "?w=96")).headers.get("content-type")).toBe("video/mp4");
  });

  it("confirms a cached copy without reading the file", async () => {
    as(a);
    const file = (await locateMedia(a.workspace.id, photo.id))!;
    await rm(`${file.abs}.w320.webp`, { force: true });
    await rm(file.abs);
    // the file is gone, so only an answer that never reads it can be a 304
    const cached = await get(photo.id, "?w=320", { "if-none-match": `"${photo.id}-w320"` });
    expect(cached.status).toBe(304);
    expect((await get(photo.id)).status).toBe(404);
  });

  it("sends a video in the ranges the player asks for", async () => {
    as(a);
    const part = await get(reel.id, "", { range: "bytes=2-5" });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 2-5/20");
    expect(part.headers.get("content-length")).toBe("4");
    expect(await part.text()).toBe("2345");
    expect(await (await get(reel.id, "", { range: "bytes=-3" })).text()).toBe("hij");
    expect(await (await get(reel.id, "", { range: "bytes=15-" })).text()).toBe("fghij");
    expect((await get(reel.id, "", { range: "bytes=30-" })).status).toBe(416);
    expect(await (await get(reel.id)).text()).toBe("0123456789abcdefghij");
  });
});
