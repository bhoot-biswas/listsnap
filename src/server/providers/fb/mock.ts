import "server-only";
import { randomInt } from "node:crypto";
import { logged } from "../log";
import type { FacebookProvider } from "../types";

/** Pretends to post a Page reel; returns a fake video id and link. */
export const mockFacebook: FacebookProvider = {
  mode: "mock",
  postReel: (ctx, input) =>
    logged(
      ctx,
      { provider: "facebook", model: "graph-api (mock)", endpoint: "video_reels", mode: "mock" },
      async () => {
        const postId = String(1e15 + randomInt(1e12));
        return { postId, permalink: `https://www.facebook.com/reel/${postId}` };
      },
      (r) => ({ summary: `reel to ${input.page.name} · ${input.caption.length} chars · ${r.postId}`, costUsd: 0 }),
    ),
};
