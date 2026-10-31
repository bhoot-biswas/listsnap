import "server-only";
import { readMedia } from "@/server/media/store";
import { signedMediaUrl } from "@/server/media/signed";
import { StepError } from "@/server/pipeline/run-step";
import { isColorAttribute } from "@/lib/variants";
import type { WooDraftInput, WooProvider, WooStore } from "../types";
import { WooHttpError, wooApi, type WooApi } from "./http";
import { checkWooStore } from "./check";
import { colorAttribute, syncVariations } from "./variations";
import { imageName, imagePlan, type StoreImage } from "./images";
import { toHtml } from "../html";

/**
 * The real WooCommerce client. Products are created as drafts and never published;
 * an update leaves the status alone, so a draft the seller published by hand stays
 * published. Images are sideloaded by the store from signed links, and only once:
 * resending them on every update would pile up copies in the media library, so an update
 * adds and removes only the photos that changed (images.ts). A listing
 * with colours becomes a variable product, one variation per colour.
 */

export const LISTING_META_KEY = "_listsnap_listing_id";

/** Set when the draft is created. The store keeps SKUs unique and finds them exactly, unlike a title. */
export const listingSku = (listingId: string) => `listsnap-${listingId}`;

interface Term {
  id: number;
  name: string;
}

interface Product {
  id: number;
  status: string;
  images: StoreImage[];
  meta_data: { key: string; value: unknown }[];
}

const IMAGE_TIMEOUT_MS = 60_000;

export const liveWoo: WooProvider = {
  mode: "live",

  async saveDraft(ctx, store, input) {
    if (!store) throw new StepError("connectStore");
    const api = wooApi(ctx, store);
    const categoryId = input.category
      ? await findOrCreateTerm(api, "products/categories", input.category, input.fallbackCategoryId)
      : input.fallbackCategoryId;
    const tagIds: number[] = [];
    for (const tag of input.tags.slice(0, 10)) tagIds.push(await findOrCreateTerm(api, "products/tags", tag));

    const variants = input.variants?.length ? input.variants : null;
    const color = variants
      ? await colorAttribute(
          api,
          variants.map((v) => v.color),
        )
      : null;
    // the variation attribute replaces Spark's "Color: Maroon, Navy, …" detail
    const details = input.attributes.filter((a) => !(color && isColorAttribute(a.name)));
    const existing = await findProduct(api, input);
    const body: Record<string, unknown> = {
      name: input.title,
      type: variants ? "variable" : "simple",
      description: toHtml(input.description),
      short_description: toHtml(input.shortDescription),
      ...(variants
        ? {}
        : {
            regular_price: input.regularPrice === null ? "" : String(input.regularPrice),
            ...(input.stockQty === null ? {} : { manage_stock: true, stock_quantity: input.stockQty }),
          }),
      categories: categoryId ? [{ id: categoryId }] : [],
      tags: tagIds.map((id) => ({ id })),
      attributes: [
        ...details.map((a, i) => ({ name: a.name, options: [a.value], visible: true, position: i })),
        ...(color ? [{ ...color.product, position: details.length }] : []),
      ],
      meta_data: [{ key: LISTING_META_KEY, value: input.listingId }],
    };
    const plan = imagePlan(
      existing?.images ?? [],
      input.images.map((i) => i.mediaId),
    );
    // the media id behind each image sent, in order; null for the seller's own
    const sent: (string | null)[] = [];
    if (plan) {
      const refs = new Map((await imageRefs(ctx.workspaceId, input)).map((r) => [r.mediaId, r]));
      const images: Record<string, unknown>[] = [];
      for (const step of plan) {
        if (step.kind === "upload") {
          const ref = refs.get(step.mediaId);
          if (!ref) continue;
          images.push({ src: ref.src, alt: ref.alt, name: imageName(step.mediaId) });
        } else images.push({ id: step.id });
        sent.push(step.kind === "theirs" ? null : step.mediaId);
      }
      body.images = images.map((img, position) => ({ ...img, position }));
    }

    const saved = existing
      ? await api.put<Product>(`products/${existing.id}`, body, { timeoutMs: IMAGE_TIMEOUT_MS })
      : // the SKU only on create: a seller who sets their own later keeps it
        await api.post<Product>(
          "products",
          { ...body, status: "draft", sku: listingSku(input.listingId) },
          { timeoutMs: IMAGE_TIMEOUT_MS },
        );
    if (variants && color) {
      // the store answers with the images in the order they were sent
      const ids = new Map(
        sent.flatMap((mediaId, i) => (mediaId && saved.images[i] ? [[mediaId, saved.images[i].id]] : [])),
      );
      // a draft from before image names: its main image is still first
      if (!plan && existing?.images[0] && input.images[0]) ids.set(input.images[0].mediaId, existing.images[0].id);
      await syncVariations(api, saved.id, variants, color, {
        ids,
        src: async (mediaId) => {
          const file = await readMedia(ctx.workspaceId, mediaId);
          return file ? signedMediaUrl(ctx.workspaceId, mediaId, file.mime) : null;
        },
      });
    }
    return { productRef: String(saved.id), editUrl: editUrl(store, saved.id) };
  },

  check: checkWooStore,
};

export const editUrl = (store: WooStore, productId: number) =>
  `${store.url}/wp-admin/post.php?post=${productId}&action=edit`;

/**
 * The product to update: the one saved before, unless it has since been deleted or
 * trashed. With no saved id, a draft that carries this listing's id is looked for
 * too, in case an earlier save reached the store but its answer was lost: by SKU, which
 * still matches after the seller edits the title, then by title for drafts made before SKUs.
 */
export async function findProduct(api: WooApi, input: WooDraftInput): Promise<Product | null> {
  if (input.productRef) {
    try {
      const p = await api.get<Product>(`products/${Number(input.productRef)}`);
      if (p.status !== "trash") return p;
    } catch (err) {
      if (!(err instanceof WooHttpError && err.status === 404)) throw err;
    }
    return null;
  }
  const ours = (p: Product) => p.meta_data.some((m) => m.key === LISTING_META_KEY && m.value === input.listingId);
  const bySku = await api.get<Product[]>("products", { sku: listingSku(input.listingId) });
  const match = bySku.find((p) => p.status !== "trash" && ours(p));
  if (match) return match;
  const found = await api.get<Product[]>("products", { search: input.title, status: "draft", per_page: 20 });
  return found.find(ours) ?? null;
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
  for (const img of input.images) {
    const file = await readMedia(workspaceId, img.mediaId);
    if (!file) continue;
    refs.push({ mediaId: img.mediaId, src: signedMediaUrl(workspaceId, img.mediaId, file.mime), alt: img.alt });
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

export { toHtml } from "../html";
