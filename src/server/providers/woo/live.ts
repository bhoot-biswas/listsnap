import "server-only";
import { readMedia } from "@/server/media/store";
import { signedMediaUrl } from "@/server/media/signed";
import { StepError } from "@/server/pipeline/run-step";
import type { WooDraftInput, WooProvider, WooStore } from "../types";
import { WooHttpError, wooApi, type WooApi } from "./http";
import { checkWooStore } from "./check";

/**
 * The real WooCommerce client. Products are created as drafts and never published;
 * an update leaves the status alone, so a draft the seller published by hand stays
 * published. Images are sideloaded by the store from signed links, and only once:
 * resending them on every update would pile up copies in the media library.
 */

export const LISTING_META_KEY = "_listsnap_listing_id";

interface Term {
  id: number;
  name: string;
}

interface Product {
  id: number;
  status: string;
  images: { id: number }[];
  meta_data: { key: string; value: unknown }[];
}

const IMAGE_TIMEOUT_MS = 60_000;

export const liveWoo: WooProvider = {
  mode: "live",

  async saveDraft(ctx, store, input) {
    if (!store) throw new StepError("Connect your WooCommerce store first, in Connections.");
    const api = wooApi(ctx, store);
    const categoryId = input.category
      ? await findOrCreateTerm(api, "products/categories", input.category, input.fallbackCategoryId)
      : input.fallbackCategoryId;
    const tagIds: number[] = [];
    for (const tag of input.tags.slice(0, 10)) tagIds.push(await findOrCreateTerm(api, "products/tags", tag));

    const existing = await findProduct(api, input);
    const body: Record<string, unknown> = {
      name: input.title,
      type: "simple",
      description: toHtml(input.description),
      short_description: toHtml(input.shortDescription),
      regular_price: input.regularPrice === null ? "" : String(input.regularPrice),
      categories: categoryId ? [{ id: categoryId }] : [],
      tags: tagIds.map((id) => ({ id })),
      attributes: input.attributes.map((a, i) => ({ name: a.name, options: [a.value], visible: true, position: i })),
      meta_data: [{ key: LISTING_META_KEY, value: input.listingId }],
    };
    if (!existing?.images.length) body.images = await imageRefs(ctx.workspaceId, input);

    const saved = existing
      ? await api.put<Product>(`products/${existing.id}`, body, { timeoutMs: IMAGE_TIMEOUT_MS })
      : await api.post<Product>("products", { ...body, status: "draft" }, { timeoutMs: IMAGE_TIMEOUT_MS });
    return { productId: saved.id, editUrl: editUrl(store, saved.id) };
  },

  check: checkWooStore,
};

export const editUrl = (store: WooStore, productId: number) =>
  `${store.url}/wp-admin/post.php?post=${productId}&action=edit`;

/**
 * The product to update: the one saved before, unless it has since been deleted or
 * trashed. With no saved id, a draft that carries this listing's id is looked for
 * too, in case an earlier save reached the store but its answer was lost.
 */
async function findProduct(api: WooApi, input: WooDraftInput): Promise<Product | null> {
  if (input.productId) {
    try {
      const p = await api.get<Product>(`products/${input.productId}`);
      if (p.status !== "trash") return p;
    } catch (err) {
      if (!(err instanceof WooHttpError && err.status === 404)) throw err;
    }
    return null;
  }
  const found = await api.get<Product[]>("products", { search: input.title, status: "draft", per_page: 20 });
  return found.find((p) => p.meta_data.some((m) => m.key === LISTING_META_KEY && m.value === input.listingId)) ?? null;
}

/**
 * Categories and tags are matched by name (case-insensitive). A missing one is created,
 * unless the shop chose a default category, which keeps the store's categories tidy.
 */
async function findOrCreateTerm(
  api: WooApi,
  path: string,
  name: string,
  fallbackId: number | null = null,
): Promise<number> {
  const wanted = name.trim().toLowerCase();
  const found = await api.get<Term[]>(path, { search: name.trim(), per_page: 100 });
  const match = found.find((t) => decodeEntities(t.name).trim().toLowerCase() === wanted);
  if (match) return match.id;
  if (fallbackId) return fallbackId;
  try {
    return (await api.post<Term>(path, { name: name.trim() })).id;
  } catch (err) {
    // created by another request in the meantime
    if (err instanceof WooHttpError && err.code === "term_exists" && typeof err.data.resource_id === "number")
      return err.data.resource_id;
    throw err;
  }
}

async function imageRefs(workspaceId: string, input: WooDraftInput) {
  const refs = [];
  for (const [i, img] of input.images.entries()) {
    const file = await readMedia(workspaceId, img.mediaId);
    if (!file) continue;
    refs.push({ src: signedMediaUrl(workspaceId, img.mediaId, file.mime), alt: img.alt, position: i });
  }
  return refs;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Plain model text to store HTML: blank lines make paragraphs, single line breaks stay. */
export function toHtml(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br>\n")}</p>`)
    .join("\n");
}
