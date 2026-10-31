import { describe, expect, it, vi } from "vitest";
import { findProduct, LISTING_META_KEY, listingSku, toHtml } from "./live";
import { oauthQuery, type WooApi } from "./http";
import type { WooDraftInput } from "../types";

describe("toHtml", () => {
  it("turns blank lines into paragraphs and keeps single line breaks", () => {
    expect(toHtml("First line\nsecond line\n\nNext <para> & more")).toBe(
      "<p>First line<br>\nsecond line</p>\n<p>Next &lt;para&gt; &amp; more</p>",
    );
  });
});

describe("oauthQuery", () => {
  const store = { url: "http://localhost:8080", key: "ck_test", secret: "cs_test" };

  it("signs every query parameter with HMAC-SHA256", () => {
    const q = new URLSearchParams(
      oauthQuery("GET", `${store.url}/wp-json/wc/v3/products`, { search: "red saree" }, store),
    );
    expect(q.get("search")).toBe("red saree");
    expect(q.get("oauth_consumer_key")).toBe("ck_test");
    expect(q.get("oauth_signature_method")).toBe("HMAC-SHA256");
    expect(q.get("oauth_signature")).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("uses a fresh nonce each time", () => {
    const a = new URLSearchParams(oauthQuery("GET", store.url, {}, store)).get("oauth_nonce");
    const b = new URLSearchParams(oauthQuery("GET", store.url, {}, store)).get("oauth_nonce");
    expect(a).not.toBe(b);
  });
});

describe("findProduct after a lost answer", () => {
  const input = { listingId: "L1", productRef: null, title: "Edited title" } as WooDraftInput;
  const draft = (id: number, listingId: string, status = "draft") => ({
    id,
    status,
    images: [],
    meta_data: [{ key: LISTING_META_KEY, value: listingId }],
  });
  /** A store holding these products, answering the two lookups findProduct makes. */
  const store = (bySku: unknown[], byTitle: unknown[]) => {
    const get = vi.fn(async (_path: string, query: Record<string, unknown> = {}) => (query.sku ? bySku : byTitle));
    return { api: { get } as unknown as WooApi, get };
  };

  it("finds the draft by SKU, even when the seller changed the title", async () => {
    const { api, get } = store([draft(7, "L1")], []);
    expect(await findProduct(api, input)).toMatchObject({ id: 7 });
    expect(get).toHaveBeenCalledWith("products", { sku: listingSku("L1") });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("falls back to the title for drafts made before SKUs", async () => {
    const { api } = store([], [draft(3, "other"), draft(5, "L1")]);
    expect(await findProduct(api, input)).toMatchObject({ id: 5 });
  });

  it("skips a trashed product holding the SKU", async () => {
    const { api } = store([draft(7, "L1", "trash")], []);
    expect(await findProduct(api, input)).toBeNull();
  });
});
