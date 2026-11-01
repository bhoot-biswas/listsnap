import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The live Facebook and Instagram clients against a fake Graph API: what they send, in
 * what order, and how Meta's answers (still processing, errors, a dead token) reach the seller.
 */

interface Sent {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, string>;
}
const sent: Sent[] = [];
let answers: (() => Response)[] = [];

vi.mock("undici", () => ({
  fetch: vi.fn(async (url: URL, init: { method: string; headers: Record<string, string>; body?: string }) => {
    sent.push({
      url: String(url),
      method: init.method,
      headers: init.headers,
      body: Object.fromEntries(new URLSearchParams(init.body ?? "")),
    });
    const next = answers.shift();
    if (!next) throw new Error(`no answer queued for ${url}`);
    return next();
  }),
}));
vi.mock("../log", () => ({ logged: (_ctx: unknown, _info: unknown, fn: () => unknown) => fn() }));

process.env.META_APP_ID = "app";
process.env.META_APP_SECRET = "secret";

const { makeLiveFacebook } = await import("./live");
const { makeLiveInstagram } = await import("../ig/live");
const { appSecretProof } = await import("../graph");

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const ctx = { workspaceId: "w", jobId: null, step: "post" };
const noWait = async () => {};
const fb = makeLiveFacebook(noWait);
const ig = makeLiveInstagram(noWait);

beforeEach(() => {
  sent.length = 0;
  answers = [];
});

describe("Facebook login", () => {
  it("trades the code for a long-lived token and keeps only Pages it may post as", async () => {
    answers = [() => json({ access_token: "short" }), () => json({ access_token: "long" })];
    expect(await fb.exchangeCode(ctx, { code: "c", redirectUri: "https://app/api/meta/callback" })).toBe("long");
    expect(sent[0]!.body).toMatchObject({ code: "c", client_secret: "secret" });
    expect(sent[1]!.body).toMatchObject({ grant_type: "fb_exchange_token", fb_exchange_token: "short" });

    answers = [
      () =>
        json({
          data: [
            {
              id: "1",
              name: "Rupkotha",
              access_token: "p1",
              instagram_business_account: { id: "ig1", username: "rup" },
            },
            { id: "2", name: "No token" },
            { id: "3", name: "Outlet", access_token: "p3" },
          ],
        }),
    ];
    expect(await fb.pages(ctx, "long")).toEqual([
      { id: "1", name: "Rupkotha", token: "p1", instagram: { id: "ig1", username: "@rup" } },
      { id: "3", name: "Outlet", token: "p3", instagram: null },
    ]);
    // the token rides in a header with its proof, never in the URL
    expect(sent[2]!.url).not.toContain("long");
    expect(sent[2]!.headers.Authorization).toBe("OAuth long");
    expect(sent[2]!.url).toContain(`appsecret_proof=${appSecretProof("long")}`);
  });
});

describe("Facebook reel", () => {
  const page = { id: "P", name: "Rupkotha", token: "pt" };

  it("reserves, has Facebook fetch the video, publishes, then waits for it", async () => {
    answers = [
      () => json({ video_id: "V", upload_url: "https://rupload.facebook.com/video-upload/v24.0/V" }),
      () => json({ success: true }),
      () => json({ success: true }),
      () => json({ status: { video_status: "processing", publishing_phase: { status: "not_started" } } }),
      () => json({ status: { video_status: "ready", publishing_phase: { status: "complete" } } }),
    ];
    const post = await fb.postReel(ctx, { page, videoUrl: "https://app/media/r.mp4?s=1", caption: "Red saree" });
    expect(post).toEqual({ postId: "V", permalink: "https://www.facebook.com/reel/V" });
    expect(sent[1]!.url).toBe("https://rupload.facebook.com/video-upload/v24.0/V");
    expect(sent[1]!.headers.file_url).toBe("https://app/media/r.mp4?s=1");
    expect(sent[2]!.body).toMatchObject({ upload_phase: "finish", video_state: "PUBLISHED", description: "Red saree" });
  });

  it("fails with Facebook's reason when processing fails", async () => {
    answers = [
      () => json({ video_id: "V", upload_url: "https://rupload.facebook.com/video-upload/v24.0/V" }),
      () => json({ success: true }),
      () => json({ success: true }),
      () => json({ status: { processing_phase: { status: "error", errors: [{ message: "Too short" }] } } }),
    ];
    await expect(fb.postReel(ctx, { page, videoUrl: "https://x", caption: "c" })).rejects.toMatchObject({
      key: "metaSaid",
      params: { message: "Too short" },
    });
  });

  it("asks to reconnect when the token no longer works", async () => {
    answers = [() => json({ error: { message: "Session expired", code: 190 } }, 400)];
    await expect(fb.postReel(ctx, { page, videoUrl: "https://x", caption: "c" })).rejects.toMatchObject({
      key: "metaAuth",
    });
  });

  it("never sends a token to a host that isn't Facebook's", async () => {
    answers = [() => json({ video_id: "V", upload_url: "https://evil.example/upload" })];
    await expect(fb.postReel(ctx, { page, videoUrl: "https://x", caption: "c" })).rejects.toMatchObject({
      key: "metaProblem",
    });
    expect(sent).toHaveLength(1);
  });
});

describe("Instagram", () => {
  const account = { id: "IG", name: "@rup", token: "pt" };

  it("posts a reel once its container is ready, and returns its link", async () => {
    answers = [
      () => json({ id: "C" }),
      () => json({ status_code: "IN_PROGRESS" }),
      () => json({ status_code: "FINISHED" }),
      () => json({ id: "M" }),
      () => json({ permalink: "https://www.instagram.com/reel/abc/" }),
    ];
    const post = await ig.postReel(ctx, { account, videoUrl: "https://app/r.mp4", caption: "Hi" });
    expect(post).toEqual({ postId: "M", permalink: "https://www.instagram.com/reel/abc/" });
    expect(sent[0]!.body).toMatchObject({ media_type: "REELS", video_url: "https://app/r.mp4", caption: "Hi" });
    expect(sent[3]!.body).toMatchObject({ creation_id: "C" });
  });

  it("doesn't publish a container Instagram rejected", async () => {
    answers = [() => json({ id: "C" }), () => json({ status_code: "ERROR", status: "Video too long" })];
    await expect(ig.postReel(ctx, { account, videoUrl: "https://x", caption: "c" })).rejects.toMatchObject({
      key: "metaSaid",
      params: { message: "Video too long" },
    });
    expect(sent.some((s) => s.url.includes("media_publish"))).toBe(false);
  });

  it("keeps a made post even when its link can't be read", async () => {
    answers = [
      () => json({ id: "C" }),
      () => json({ status_code: "FINISHED" }),
      () => json({ id: "M" }),
      () => json({ error: { message: "oops", code: 1 } }, 500),
    ];
    const post = await ig.postReel(ctx, { account, videoUrl: "https://x", caption: "c" });
    expect(post).toEqual({ postId: "M", permalink: "https://www.instagram.com/rup/" });
  });

  it("builds a carousel from its photos", async () => {
    answers = [
      () => json({ id: "c1" }),
      () => json({ id: "c2" }),
      () => json({ id: "C" }),
      () => json({ status_code: "FINISHED" }),
      () => json({ id: "M" }),
      () => json({ permalink: "https://www.instagram.com/p/x/" }),
    ];
    const r = await ig.postCarousel(ctx, { account, imageUrls: ["https://a.jpg", "https://b.jpg"], caption: "c" });
    expect(r).toEqual({ mediaId: "M", permalink: "https://www.instagram.com/p/x/" });
    expect(sent[2]!.body).toMatchObject({ media_type: "CAROUSEL", children: "c1,c2" });
  });
});

describe("Facebook catalog", () => {
  const item = {
    id: "ls-1",
    itemGroupId: null,
    title: "Red saree",
    description: "Soft.",
    availability: "in stock" as const,
    condition: "new" as const,
    price: "4650 BDT",
    link: "https://rupkotha.example",
    images: ["https://app/media/1.jpg", "https://app/media/2.jpg"],
    brand: "Rupkotha",
    color: null,
  };

  it("lists catalogs across business portfolios, and none when access wasn't given", async () => {
    answers = [
      () =>
        json({
          data: [
            { id: "b1", name: "Rupkotha Crafts", owned_product_catalogs: { data: [{ id: "c1", name: "Products" }] } },
            { id: "b2", name: "Other" },
          ],
        }),
    ];
    expect(await fb.catalogs(ctx, "ut")).toEqual([{ id: "c1", name: "Products", business: "Rupkotha Crafts" }]);
    answers = [() => json({ error: { message: "Missing permission", code: 200 } }, 403)];
    expect(await fb.catalogs(ctx, "ut")).toBeNull();
  });

  it("sends items as upserts with Meta's field names, and reads the batch", async () => {
    answers = [() => json({ handles: ["h1"] })];
    expect(await fb.saveCatalogItems(ctx, { catalogId: "c1", userToken: "ut", items: [item] })).toBe("h1");
    expect(sent[0]!.url).toContain("/c1/items_batch");
    expect(sent[0]!.body).toMatchObject({ item_type: "PRODUCT_ITEM", allow_upsert: "true" });
    const [req] = JSON.parse(sent[0]!.body.requests!);
    expect(req).toEqual({
      method: "UPDATE",
      data: {
        id: "ls-1",
        title: "Red saree",
        description: "Soft.",
        availability: "in stock",
        condition: "new",
        price: "4650 BDT",
        link: "https://rupkotha.example",
        image: [{ url: "https://app/media/1.jpg" }, { url: "https://app/media/2.jpg" }],
        brand: "Rupkotha",
      },
    });

    answers = [
      () => json({ data: [{ status: "in_progress" }] }),
      () => json({ data: [{ status: "finished", errors: [{ id: "ls-1", message: "Image too small" }] }] }),
    ];
    expect(await fb.catalogBatch(ctx, { catalogId: "c1", userToken: "ut", handle: "h1" })).toEqual({ done: false });
    expect(await fb.catalogBatch(ctx, { catalogId: "c1", userToken: "ut", handle: "h1" })).toEqual({
      done: true,
      errors: [{ id: "ls-1", message: "Image too small" }],
    });
  });

  it("fails when Meta takes the batch but returns no handle", async () => {
    answers = [() => json({ handles: [] })];
    await expect(fb.saveCatalogItems(ctx, { catalogId: "c1", userToken: "ut", items: [item] })).rejects.toMatchObject({
      key: "metaProblem",
    });
  });
});
