import "server-only";
import { env } from "@/server/env";
import { readMedia } from "@/server/media/store";
import { signedMediaUrl } from "@/server/media/signed";
import { StepError } from "@/server/pipeline/run-step";
import type { ShopifyCheck, ShopifyCheckReason, ShopifyCheckResult } from "@/lib/shopify-connection";
import type { CallContext, ShopifyDraftInput, ShopifyProvider, ShopifyStore } from "../types";
import { ShopifyHttpError, shopifyApi, userErrorsToStepError, type ShopifyApi } from "./http";
import { hasScopes, tokenRequest } from "./oauth";
import { NS, editUrl, listingSku, mediaMapAfter, productSetInput, type ExistingProduct, type FileSet } from "./draft";
import {
  CHECK,
  FIND_PRODUCTS,
  MEDIA_STATUS,
  METAFIELDS_SET,
  PRODUCT,
  PRODUCT_SET,
  type RawProduct,
  type UserErrors,
} from "./queries";

/**
 * The real Shopify client. A product is created as a draft and never published; an
 * update leaves its status alone. One productSet call saves the product, its colours,
 * prices, stock and photos. Shopify downloads the photos from signed links after it
 * answers, and a photo it can't download only shows as FAILED on the product, so the
 * save waits a few seconds for the new photos and reports one that failed.
 */

// Shopify had a dev store's photos ready in about five seconds (measured 2026-11-01)
const PHOTO_CHECKS = 6;
const PHOTO_WAIT_MS = 2_000;

export const liveShopify: ShopifyProvider = {
  mode: "live",

  async saveDraft(ctx, store, input) {
    if (!store) throw new StepError("connectStore");
    const api = shopifyApi(ctx, store);
    const existing = await findProduct(api, input);
    const plan = productSetInput(input, existing, await mediaLinks(ctx.workspaceId, input));
    const { productSet } = await api.gql<{
      productSet: UserErrors & { product: { id: string; media: { nodes: { id: string }[] } } | null };
    }>(
      "productSet",
      PRODUCT_SET,
      { input: plan.input, identifier: existing ? { id: existing.id } : null },
      { timeoutMs: 60_000 },
    );
    if (productSet.userErrors.length || !productSet.product) throw userErrorsToStepError(productSet.userErrors);
    const product = productSet.product;

    const map = mediaMapAfter(
      plan,
      plan.input.files as FileSet[],
      product.media.nodes.map((m) => m.id),
    );
    // the draft is saved either way; a lost map only means photos are matched again next time
    try {
      const { metafieldsSet } = await api.gql<{ metafieldsSet: UserErrors }>("metafieldsSet", METAFIELDS_SET, {
        metafields: [{ ownerId: product.id, namespace: NS, key: "media", type: "json", value: JSON.stringify(map) }],
      });
      if (metafieldsSet.userErrors.length)
        console.warn("[shopify] media map not saved:", metafieldsSet.userErrors.map((e) => e.message).join("; "));
    } catch (err) {
      console.warn("[shopify] media map not saved:", err instanceof Error ? err.message : err);
    }
    const sent = plan.input.files as FileSet[];
    const fresh = plan.sentMedia.flatMap((mediaId, i) =>
      mediaId && "originalSource" in sent[i]! && map[mediaId] ? [map[mediaId]!] : [],
    );
    await photosArrived(api, product.id, fresh);
    return { productRef: product.id, editUrl: editUrl(store.shop, product.id) };
  },

  check: checkShopifyStore,

  exchangeCode: (ctx, shop, code) => tokenRequest(ctx, shop, "authorization_code", { ...app(), code, expiring: "1" }),

  refresh: (ctx, shop, refreshToken) =>
    tokenRequest(ctx, shop, "refresh_token", { ...app(), grant_type: "refresh_token", refresh_token: refreshToken }),

  appToken: (ctx, shop, keys) =>
    tokenRequest(ctx, shop, "client_credentials", {
      grant_type: "client_credentials",
      client_id: keys.clientId,
      client_secret: keys.clientSecret,
    }),
};

function app() {
  const { clientId, clientSecret } = env().shopify;
  if (!clientId || !clientSecret) throw new Error("SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET must be set.");
  return { client_id: clientId, client_secret: clientSecret };
}

/**
 * Waits for the photos just sent until Shopify has them or gives up on one. The draft is
 * saved either way; a failed photo fails the step, so the seller sees it and saving again
 * sends that photo again (a FAILED photo counts as missing, see toExisting).
 */
async function photosArrived(api: ShopifyApi, productId: string, ids: string[], sleep = wait) {
  if (!ids.length) return;
  for (let i = 0; i < PHOTO_CHECKS; i++) {
    const { product } = await api.gql<{ product: { media: { nodes: { id: string; status: string }[] } } | null }>(
      "media status",
      MEDIA_STATUS,
      { id: productId },
    );
    const ours = product?.media.nodes.filter((m) => ids.includes(m.id)) ?? [];
    if (ours.some((m) => m.status === "FAILED")) throw new ShopifyHttpError(200, "media_failed", "storePhotos");
    if (ours.every((m) => m.status === "READY")) return;
    if (i + 1 < PHOTO_CHECKS) await sleep(PHOTO_WAIT_MS);
  }
  // still processing: Shopify finishes in the background, and the draft is already saved
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toExisting(p: RawProduct): ExistingProduct {
  let mediaMap: Record<string, string> = {};
  try {
    const parsed: unknown = p.mediaMap ? JSON.parse(p.mediaMap.value) : {};
    if (parsed && typeof parsed === "object") mediaMap = parsed as Record<string, string>;
  } catch {}
  return {
    id: p.id,
    options: p.options,
    variants: p.variants.nodes.map((v) => ({
      id: v.id,
      price: v.price,
      selectedOptions: v.selectedOptions,
      itemId: v.itemId?.value ?? null,
    })),
    // a photo Shopify couldn't download is left off, so the next save sends it again
    media: p.media.nodes.filter((m) => m.status !== "FAILED").map((m) => m.id),
    mediaMap,
  };
}

/**
 * The product to update: the one saved before, unless the seller deleted it. With none
 * saved, a product carrying this listing's id is looked for, in case an earlier save
 * reached Shopify but its answer was lost: by SKU, then by title.
 */
async function findProduct(api: ShopifyApi, input: ShopifyDraftInput): Promise<ExistingProduct | null> {
  if (input.productRef) {
    const { product } = await api.gql<{ product: RawProduct | null }>("product", PRODUCT, { id: input.productRef });
    return product ? toExisting(product) : null;
  }
  const quote = (s: string) => `"${s.replace(/["\\]/g, " ")}"`;
  for (const q of [`sku:${quote(listingSku(input.listingId))}`, `title:${quote(input.title)}`]) {
    const { products } = await api.gql<{ products: { nodes: RawProduct[] } }>("products", FIND_PRODUCTS, { q });
    const match = products.nodes.find((p) => p.listingId?.value === input.listingId);
    if (match) return toExisting(match);
  }
  return null;
}

async function mediaLinks(workspaceId: string, input: ShopifyDraftInput) {
  const links = new Map<string, { url: string; ext: string }>();
  for (const img of input.images) {
    const file = await readMedia(workspaceId, img.mediaId);
    if (!file) continue;
    links.set(img.mediaId, {
      url: signedMediaUrl(workspaceId, img.mediaId, file.mime),
      ext: file.mime === "image/png" ? "png" : "jpg",
    });
  }
  return links;
}

const reasonFor = (err: unknown): ShopifyCheckReason => {
  if (!(err instanceof ShopifyHttpError)) return "server";
  if (err.status === 0) return "unreachable";
  if (err.status === 401 || err.status === 403) return "auth";
  return "server";
};

export async function checkShopifyStore(ctx: CallContext, store: ShopifyStore): Promise<ShopifyCheckResult> {
  const checks: ShopifyCheck[] = [];
  const result = (extra: Partial<ShopifyCheckResult> = {}): ShopifyCheckResult => ({
    ok: checks.every((c) => c.status !== "fail"),
    checks,
    shopName: null,
    currency: null,
    locations: [],
    ...extra,
  });
  let data: {
    shop: { name: string; currencyCode: string };
    locations: { nodes: { id: string; name: string; isActive: boolean }[] };
    currentAppInstallation: { accessScopes: { handle: string }[] };
  };
  try {
    data = await shopifyApi(ctx, store).gql("check", CHECK);
  } catch (err) {
    checks.push({ id: "reach", status: "fail", reason: reasonFor(err) });
    return result();
  }
  checks.push({ id: "reach", status: "pass" });
  const scopes = data.currentAppInstallation.accessScopes.map((s) => s.handle).join(",");
  checks.push(
    hasScopes(scopes) ? { id: "scopes", status: "pass" } : { id: "scopes", status: "fail", reason: "scopes" },
  );
  const locations = data.locations.nodes.filter((l) => l.isActive).map((l) => ({ id: l.id, name: l.name }));
  checks.push(
    locations.length ? { id: "location", status: "pass" } : { id: "location", status: "fail", reason: "no_location" },
  );
  // prices are sent as the shop's own currency; a shop selling in dollars would get taka numbers
  checks.push(
    data.shop.currencyCode === "BDT"
      ? { id: "currency", status: "pass" }
      : { id: "currency", status: "warn", reason: "currency" },
  );
  return result({ shopName: data.shop.name, currency: data.shop.currencyCode, locations });
}
