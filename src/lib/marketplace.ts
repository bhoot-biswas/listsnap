import { z } from "zod";

/**
 * Facebook Marketplace's "Create listing" form, field by field, built from a listing. Pure
 * and browser-safe: Review's Marketplace card shows it live as the seller edits, and the
 * export kit writes the same fields to its text files. ListSnap never posts to
 * Marketplace itself; Meta has no API for it, so the seller pastes these in.
 */

/** Where the seller starts a new item; on a phone it opens the Facebook app when installed. */
export const MARKETPLACE_CREATE_URL = "https://www.facebook.com/marketplace/create/item";

/** Meta's Commerce Policies, for the note that Marketplace is meant for personal selling. */
export const COMMERCE_POLICIES_URL = "https://www.facebook.com/policies_center/commerce";

/** Marketplace's own item categories, matched from our free-text category by keyword. */
const CATEGORIES: [RegExp, string][] = [
  [/\b(phone|mobile|smartphone)s?\b/i, "Mobile Phones"],
  [/\b(laptop|computer|electronic|camera|headphone|earbud|speaker|charger|gadget)s?\b/i, "Electronics & Computers"],
  [/\b(jewel|necklace|earring|bangle|bracelet|ring|watch|sunglass|accessor)/i, "Jewelry & Accessories"],
  [/\b(bag|backpack|purse|wallet|luggage|tote)s?\b/i, "Bags & Luggage"],
  [/\b(saree|sari|kurti|kameez|salwar|dress|blouse|abaya|hijab|women|ladies)/i, "Women's Clothing & Shoes"],
  [/\b(panjabi|punjabi|lungi|shirt|t-shirt|tee|trouser|pant|jean|men)/i, "Men's Clothing & Shoes"],
  [/\b(shoe|sandal|sneaker|slipper|footwear|cloth|apparel|fashion|scarf|shawl)/i, "Women's Clothing & Shoes"],
  [/\b(baby|kid|child|infant)/i, "Baby & Kids"],
  [/\b(toy|game|puzzle|doll)s?\b/i, "Toys & Games"],
  [/\b(beauty|cosmetic|skin|hair|makeup|perfume|soap|health)/i, "Health & Beauty"],
  [/\b(sofa|chair|table|bed|shelf|furniture|cabinet)s?\b/i, "Furniture"],
  [/\b(kitchen|cook|pot|pan|plate|cup|mug|home|decor|lamp|cushion|curtain|rug|candle|vase|household)/i, "Household"],
  [/\b(plant|garden|seed|flower)s?\b/i, "Garden"],
  [/\b(book|novel|stationery)s?\b/i, "Books, Movies & Music"],
  [/\b(craft|handmade|handicraft|art|painting|nakshi|pottery|clay|jute|bamboo)/i, "Arts & Crafts"],
  [/\b(sport|fitness|gym|cricket|football|outdoor)/i, "Sports & Outdoors"],
  [/\b(pet|dog|cat|bird)s?\b/i, "Pet Supplies"],
  [/\b(bicycle|bike|cycle)s?\b/i, "Bicycles"],
  [/\b(tool|drill|hardware)s?\b/i, "Tools"],
];

export function marketplaceCategory(category: string): string {
  return CATEGORIES.find(([re]) => re.test(category))?.[1] ?? "Miscellaneous";
}

/**
 * The link the seller pastes after posting. Only a Facebook address is kept: the card
 * shows it as a link, and anything else would be a link ListSnap seems to vouch for.
 */
export const MarketplaceLink = z
  .string()
  .trim()
  .max(500)
  // "facebook.com/marketplace/item/1" as copied from the app's address bar
  .transform((v) => (!v ? null : /^[a-z]+:/i.test(v) ? v : `https://${v}`))
  .refine((v) => {
    if (v === null) return true;
    try {
      const u = new URL(v);
      return u.protocol === "https:" && /(^|\.)(facebook\.com|fb\.com|fb\.me)$/i.test(u.hostname);
    } catch {
      return false;
    }
  });

export interface MarketplaceSource {
  title: string;
  shortDescription: string;
  description: string;
  attributes: { name: string; value: string }[];
  tags: string[];
}

export interface MarketplaceFields {
  title: string;
  /** Digits only: Marketplace's price box takes no currency sign or commas. */
  price: string;
  category: string;
  description: string;
  tags: string;
}

export function marketplaceFields(
  text: MarketplaceSource,
  extra: { price: number | null; category: string; colours: string[]; coloursLabel: string },
): MarketplaceFields {
  return {
    title: text.title.trim(),
    price: extra.price === null ? "" : String(extra.price),
    category: marketplaceCategory(extra.category),
    description: [
      text.shortDescription.trim(),
      text.description.trim(),
      text.attributes
        .filter((a) => a.name.trim() && a.value.trim())
        .map((a) => `${a.name}: ${a.value}`)
        .join("\n"),
      extra.colours.length ? `${extra.coloursLabel}: ${extra.colours.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    tags: text.tags
      .map((t) => t.trim())
      .filter(Boolean)
      .join(", "),
  };
}
