import "server-only";
import { logged } from "../log";
import type { WooCheckResult } from "@/lib/woo-connection";
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
      (r) => ({
        summary: `draft #${r.productId} "${input.title}"${input.variants ? ` · ${input.variants.length} colours` : ""}`,
        costUsd: 0,
      }),
    ),

  // keys ending in "_readonly" show the failed write check without a real store
  check: (ctx, store) =>
    logged(
      ctx,
      { provider: "woo", model: "woocommerce (mock)", endpoint: "GET products/categories", mode: "mock" },
      async (): Promise<WooCheckResult> => {
        const readOnly = store.key.endsWith("_readonly");
        return {
          ok: !readOnly,
          checks: [
            { id: "https", status: store.url.startsWith("https://") ? "pass" : "warn", reason: "http" },
            { id: "reach", status: "pass" },
            { id: "read", status: "pass" },
            readOnly ? { id: "write", status: "fail", reason: "read_only" } : { id: "write", status: "pass" },
            { id: "color", status: "warn" },
          ],
          categories: [
            { id: 15, name: "Uncategorized" },
            { id: 21, name: "Sarees" },
            { id: 22, name: "Jewellery" },
          ],
        };
      },
      (r) => ({ summary: r.ok ? "connection ok" : "connection failed", costUsd: 0 }),
    ),
};
