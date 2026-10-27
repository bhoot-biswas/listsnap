import "server-only";
import { logged } from "../log";
import type { WooProvider } from "../types";

/** Pretends to be a WooCommerce store: stable product ids, nothing leaves the server. */
let nextId = 1000;

export const mockWoo: WooProvider = {
  mode: "mock",
  saveDraft: (ctx, _store, input) =>
    logged(
      ctx,
      {
        provider: "woo",
        model: "woocommerce (mock)",
        endpoint: input.productId ? "PUT products" : "POST products",
        mode: "mock",
      },
      async () => {
        const productId = input.productId ?? nextId++;
        return { productId, editUrl: `https://store.example/wp-admin/post.php?post=${productId}&action=edit` };
      },
      (r) => ({ summary: `draft #${r.productId} "${input.title}"`, costUsd: 0 }),
    ),
};
