import "server-only";
import type { ListingProduct } from "@/server/stores/listing-product";
import { descriptionHtml, listingSku, variantSku } from "@/server/providers/shopify/draft";
import { toHtml } from "@/server/providers/html";
import { isColorAttribute } from "@/lib/variants";
import { csv } from "./csv";
import { fileSlug } from "./text";

/**
 * The three bulk files: a Facebook/Instagram catalog feed, and WooCommerce's and Shopify's
 * product importers. Pure functions over the same products a direct save sends, with the
 * same SKUs, so importing after a direct save updates that product instead of copying it.
 * Every product goes in as a draft, like the direct saves.
 */

export interface CsvShop {
  name: string;
  /** The shop's website or Facebook Page, which Meta needs as each row's link. */
  website: string;
  /** A link the importer can download a photo from, or null when the file is gone. */
  imageUrl: (mediaId: string) => string | null;
}

// Meta's own limits for a catalog row
const META_DESCRIPTION_MAX = 9999;
const META_EXTRA_IMAGES = 20;

const links = (shop: CsvShop, ids: (string | null)[]) =>
  ids.flatMap((id) => {
    const url = id ? shop.imageUrl(id) : null;
    return url ? [url] : [];
  });

const plainDescription = (p: ListingProduct) =>
  [p.shortDescription.trim(), p.description.trim(), ...p.attributes.map((a) => `${a.name}: ${a.value}`)]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, META_DESCRIPTION_MAX);

const availability = (qty: number | null) => (qty === 0 ? ("out of stock" as const) : ("in stock" as const));

/** One Meta catalog item, as the CSV feed writes it and the catalog API sends it. */
export interface CatalogItem {
  id: string;
  itemGroupId: string | null;
  title: string;
  description: string;
  availability: "in stock" | "out of stock";
  condition: "new";
  /** "4650 BDT": Meta wants the amount, a space and the currency code. */
  price: string;
  link: string;
  /** The main photo first; Meta takes up to 21. */
  images: string[];
  brand: string;
  color: string | null;
}

/**
 * Meta's catalog items: one per product, or one per colour grouped by item_group_id.
 * A product without a price or a photo is left out, because Meta refuses it.
 */
export function catalogItems(products: ListingProduct[], shop: CsvShop): CatalogItem[] {
  const items: CatalogItem[] = [];
  for (const p of products) {
    const photos = links(
      shop,
      p.images.map((i) => i.mediaId),
    );
    const description = plainDescription(p);
    const item = (
      id: string,
      group: string | null,
      price: number | null,
      qty: number | null,
      main: string[],
      color: string | null,
    ) => {
      if (price === null || !main.length) return;
      items.push({
        id,
        itemGroupId: group,
        title: p.title,
        description,
        availability: availability(qty),
        condition: "new",
        price: `${price} BDT`,
        link: shop.website,
        images: main.slice(0, META_EXTRA_IMAGES + 1),
        brand: shop.name,
        color,
      });
    };
    if (!p.variants) item(listingSku(p.listingId), null, p.regularPrice, p.stockQty, photos, null);
    else
      for (const v of p.variants) {
        // the colour's own photo leads its item; the rest of the gallery follows
        const own = links(shop, [v.mediaId]);
        item(
          variantSku(p.listingId, v.itemId),
          listingSku(p.listingId),
          v.regularPrice,
          v.stockQty,
          [...own, ...photos.filter((u) => !own.includes(u))],
          v.color,
        );
      }
  }
  return items;
}

/** Meta's catalog feed as a CSV file, from the same items the catalog API sends. */
export function catalogCsv(products: ListingProduct[], shop: CsvShop): string {
  const header = [
    "id",
    "item_group_id",
    "title",
    "description",
    "availability",
    "condition",
    "price",
    "link",
    "image_link",
    "additional_image_link",
    "brand",
    "color",
  ];
  const rows = catalogItems(products, shop).map((i) => [
    i.id,
    i.itemGroupId,
    i.title,
    i.description,
    i.availability,
    i.condition,
    i.price,
    i.link,
    i.images[0]!,
    i.images.slice(1).join(","),
    i.brand,
    i.color,
  ]);
  return csv(header, rows);
}

// WooCommerce splits list cells on commas; a comma inside a value is written as "\,"
const wooList = (values: string[]) => values.map((v) => v.trim().replace(/,/g, "\\,")).join(", ");

/** WooCommerce's product importer (Products → Import): simple products, or variable ones by colour. */
export function wooCsv(products: ListingProduct[], shop: CsvShop): string {
  const details = (p: ListingProduct) => p.attributes.filter((a) => !(p.variants && isColorAttribute(a.name)));
  // every row needs the same columns, so there are as many attribute columns as the longest list needs
  const attrCount = Math.max(0, ...products.map((p) => details(p).length + (p.variants ? 1 : 0)));
  const attrHeader = Array.from({ length: attrCount }, (_, i) => [
    `Attribute ${i + 1} name`,
    `Attribute ${i + 1} value(s)`,
    `Attribute ${i + 1} visible`,
    `Attribute ${i + 1} global`,
  ]).flat();
  const header = [
    "Type",
    "SKU",
    "Parent",
    "Name",
    "Published",
    "Short description",
    "Description",
    "In stock?",
    "Stock",
    "Regular price",
    "Categories",
    "Tags",
    "Images",
    ...attrHeader,
  ];
  const stock = (qty: number | null) => (qty === null ? ["1", null] : [qty > 0 ? "1" : "0", String(qty)]);
  const attrs = (list: { name: string; values: string[]; visible: boolean }[]) => {
    const cells = list.flatMap((a) => [a.name, wooList(a.values), a.visible ? "1" : "0", "0"]);
    return [...cells, ...Array<null>(attrHeader.length - cells.length).fill(null)];
  };

  const rows: (string | null)[][] = [];
  for (const p of products) {
    const sku = listingSku(p.listingId);
    const own = details(p).map((a) => ({ name: a.name, values: [a.value], visible: true }));
    const colours = p.variants ? [{ name: "Color", values: p.variants.map((v) => v.color), visible: true }] : [];
    rows.push([
      p.variants ? "variable" : "simple",
      sku,
      null,
      p.title,
      // -1 is a draft
      "-1",
      toHtml(p.shortDescription),
      toHtml(p.description),
      ...(p.variants ? ["1", null] : stock(p.stockQty)),
      p.variants || p.regularPrice === null ? null : String(p.regularPrice),
      wooList([p.category]),
      wooList(p.tags),
      links(
        shop,
        p.images.map((i) => i.mediaId),
      ).join(", "),
      ...attrs([...colours, ...own]),
    ]);
    for (const v of p.variants ?? [])
      rows.push([
        "variation",
        variantSku(p.listingId, v.itemId),
        sku,
        `${p.title} - ${v.color}`,
        // a variation is switched on; the product it belongs to stays a draft
        "1",
        null,
        null,
        ...stock(v.stockQty),
        v.regularPrice === null ? null : String(v.regularPrice),
        null,
        null,
        links(shop, [v.mediaId]).join(", "),
        ...attrs([{ name: "Color", values: [v.color], visible: true }]),
      ]);
  }
  return csv(header, rows);
}

/** Shopify's product importer (Products → Import): rows sharing a URL handle make one product. */
export function shopifyCsv(products: ListingProduct[], shop: CsvShop): string {
  const header = [
    "URL handle",
    "Title",
    "Description",
    "Vendor",
    "Type",
    "Tags",
    "Published on online store",
    "Status",
    "Option1 name",
    "Option1 value",
    "SKU",
    "Price",
    "Inventory tracker",
    "Inventory quantity",
    "Product image URL",
    "Image position",
    "Image alt text",
    "Variant image URL",
  ];
  const rows: (string | null)[][] = [];
  for (const p of products) {
    const handle = `ls-${fileSlug(p.title, p.listingId)}`;
    const variants = p.variants
      ? p.variants.map((v) => ({
          option: v.color,
          sku: variantSku(p.listingId, v.itemId),
          price: v.regularPrice,
          qty: v.stockQty,
          image: links(shop, [v.mediaId])[0] ?? null,
        }))
      : [{ option: null, sku: listingSku(p.listingId), price: p.regularPrice, qty: p.stockQty, image: null }];
    const images = p.images.flatMap((img) => {
      const url = shop.imageUrl(img.mediaId);
      return url ? [{ url, alt: img.alt }] : [];
    });
    for (let i = 0; i < Math.max(variants.length, images.length); i++) {
      const v = variants[i];
      const img = images[i];
      rows.push([
        handle,
        ...(i === 0
          ? [
              p.title,
              descriptionHtml({ ...p, productRef: null, locationId: null }, !!p.variants),
              shop.name,
              p.category.trim(),
              [...new Set(p.tags.map((t) => t.trim()).filter(Boolean))].join(", "),
              "FALSE",
              "draft",
            ]
          : Array<null>(7).fill(null)),
        // the option's name goes on the product's first row only
        i === 0 && p.variants ? "Color" : null,
        v?.option ?? null,
        v?.sku ?? null,
        v && v.price !== null ? String(v.price) : null,
        v && v.qty !== null ? "shopify" : null,
        v && v.qty !== null ? String(v.qty) : null,
        img?.url ?? null,
        img ? String(i + 1) : null,
        img?.alt ?? null,
        v?.image ?? null,
      ]);
    }
  }
  return csv(header, rows);
}
