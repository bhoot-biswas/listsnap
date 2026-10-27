import "server-only";
import { randomUUID } from "node:crypto";
import { logged } from "../log";
import type { InstagramProvider } from "../types";

/** Pretends to post a carousel; returns a fake media id and permalink. */
export const mockInstagram: InstagramProvider = {
  mode: "mock",
  postCarousel: (ctx, input) =>
    logged(
      ctx,
      { provider: "instagram", model: "graph-api (mock)", endpoint: "media_publish", mode: "mock" },
      async () => {
        const mediaId = randomUUID().replace(/-/g, "").slice(0, 17);
        return { mediaId, permalink: `https://www.instagram.com/p/${mediaId}/` };
      },
      (r) => ({ summary: `carousel of ${input.imageUrls.length} · ${r.mediaId}`, costUsd: 0 }),
    ),
};
