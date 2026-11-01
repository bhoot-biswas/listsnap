import "server-only";

/**
 * The listing kit's text files: plain UTF-8 laid out in the order of Facebook Marketplace's
 * "Create listing" form, so the seller copies one block at a time into the matching field.
 * Pure functions; the labels come from the message files, in the file's language.
 */

export interface KitLabels {
  title: string;
  price: string;
  category: string;
  condition: string;
  conditionNew: string;
  description: string;
  colours: string;
  tags: string;
  /** Meta's rule that Marketplace is for personal items, at the end of the file. */
  note: string;
}

export interface KitText {
  title: string;
  shortDescription: string;
  description: string;
  attributes: { name: string; value: string }[];
  tags: string[];
}

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

const SLUG_MAX = 40;

/**
 * A short ASCII name for files and handles. A long title is cut after its last whole word
 * that fits, so a seller never sees "with-b". A title with no Latin letters (a Bangla-only
 * one) falls back to "listing", and every name ends in the listing's short id so two
 * listings with the same title never clash.
 */
export function fileSlug(title: string, listingId: string): string {
  let slug = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length > SLUG_MAX) {
    // one character more, so a word that ends exactly at the limit is kept
    const head = slug.slice(0, SLUG_MAX + 1);
    const cut = head.lastIndexOf("-");
    slug = cut > 0 ? head.slice(0, cut) : slug.slice(0, SLUG_MAX);
  }
  return `${slug || "listing"}-${listingId.slice(0, 8)}`;
}

export function marketplaceText(
  text: KitText,
  extra: { price: number | null; category: string; colours: string[] },
  l: KitLabels,
): string {
  const description = [
    text.shortDescription.trim(),
    text.description.trim(),
    text.attributes.map((a) => `${a.name}: ${a.value}`).join("\n"),
    extra.colours.length ? `${l.colours}: ${extra.colours.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const blocks: [string, string][] = [
    [l.title, text.title.trim()],
    // Marketplace's price field takes digits only
    [l.price, extra.price === null ? "" : String(extra.price)],
    [l.category, marketplaceCategory(extra.category)],
    [l.condition, l.conditionNew],
    [l.description, description],
    [
      l.tags,
      text.tags
        .map((t) => t.trim())
        .filter(Boolean)
        .join(", "),
    ],
  ];
  const body = blocks
    .filter(([, value]) => value)
    .map(([label, value]) => `${label.toUpperCase()}\n${value}`)
    .join("\n\n");
  // a BOM and CRLF so Notepad and phone viewers show Bangla and the line breaks
  return `\uFEFF${body}\n\n---\n${l.note}\n`.replace(/\r?\n/g, "\r\n");
}
