import "server-only";
import { randomInt } from "node:crypto";
import { logged } from "../log";
import type { FacebookProvider } from "../types";

/**
 * Pretends to log in and post a Page reel. Login returns two made-up Pages, one with an
 * Instagram account and one without, so the Page picker can be tried.
 */
export const mockFacebook: FacebookProvider = {
  mode: "mock",
  exchangeCode: (ctx) =>
    logged(
      ctx,
      { provider: "facebook", model: "graph-api (mock)", endpoint: "oauth/access_token", mode: "mock" },
      async () => "mock-user-token",
      () => ({ summary: "login", costUsd: 0 }),
    ),
  pages: (ctx) =>
    logged(
      ctx,
      { provider: "facebook", model: "graph-api (mock)", endpoint: "me/accounts", mode: "mock" },
      async () => [
        {
          id: "100000000000001",
          name: "Rupkotha Fashion",
          token: "mock-page-token-1",
          instagram: { id: "17800000000000001", username: "@rupkotha.fashion" },
        },
        { id: "100000000000002", name: "Rupkotha Outlet", token: "mock-page-token-2", instagram: null },
      ],
      (r) => ({ summary: `${r.length} pages`, costUsd: 0 }),
    ),
  catalogs: (ctx) =>
    logged(
      ctx,
      { provider: "facebook", model: "graph-api (mock)", endpoint: "me/businesses", mode: "mock" },
      async () => [{ id: "900000000000001", name: "Rupkotha products", business: "Rupkotha Crafts" }],
      (r) => ({ summary: `${r.length} catalogs`, costUsd: 0 }),
    ),
  saveCatalogItems: (ctx, input) =>
    logged(
      ctx,
      { provider: "facebook", model: "graph-api (mock)", endpoint: "catalog items_batch", mode: "mock" },
      async () => `mock-handle-${input.items.length}`,
      () => ({ summary: `${input.items.length} items`, costUsd: 0 }),
    ),
  catalogBatch: (ctx) =>
    logged(
      ctx,
      { provider: "facebook", model: "graph-api (mock)", endpoint: "catalog batch status", mode: "mock" },
      async () => ({ done: true as const, errors: [] }),
      () => ({ summary: "finished", costUsd: 0 }),
    ),
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
