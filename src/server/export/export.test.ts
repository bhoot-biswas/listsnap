import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ListingProduct } from "@/server/stores/listing-product";
import { csv } from "./csv";
import { catalogCsv, shopifyCsv, wooCsv, type CsvShop } from "./formats";
import { fileSlug, marketplaceCategory, marketplaceText, type KitLabels } from "./text";
import { zipStream, type ZipEntry } from "./zip";

const ID = "a1b2c3d4-0000-4000-8000-000000000001";
const RED = "11111111-aaaa-4000-8000-000000000000";
const BLUE = "22222222-bbbb-4000-8000-000000000000";

const product = (over: Partial<ListingProduct> = {}): ListingProduct => ({
  listingId: ID,
  title: "Red Jamdani Saree",
  description: "Soft cotton.\n\nHand woven.",
  shortDescription: "A light saree, with a gold border.",
  category: "Sarees",
  regularPrice: 1200,
  stockQty: 3,
  tags: ["saree", "jamdani"],
  attributes: [
    { name: "Fabric", value: "cotton" },
    { name: "Color", value: "red" },
  ],
  images: [
    { mediaId: "m-main", alt: "Red Jamdani Saree" },
    { mediaId: "m-studio", alt: "Red Jamdani Saree" },
  ],
  variants: null,
  ...over,
});

const colours = product({
  variants: [
    { itemId: RED, color: "Red", regularPrice: 1200, stockQty: 2, mediaId: "m-main" },
    { itemId: BLUE, color: "Blue", regularPrice: 1300, stockQty: null, mediaId: "m-blue" },
  ],
  images: [
    { mediaId: "m-main", alt: "Red Jamdani Saree" },
    { mediaId: "m-blue", alt: "Red Jamdani Saree, Blue" },
  ],
});

const shop: CsvShop = {
  name: "Rupa's Shop",
  website: "https://facebook.com/rupa",
  imageUrl: (id) => (id === "m-gone" ? null : `https://x.test/media/${id}.jpg?s=1`),
};

/** Parses our own CSV back: BOM off, quoted fields, CRLF rows. */
function parse(text: string): Record<string, string>[] {
  expect(text.startsWith("\uFEFF")).toBe(true);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.slice(1);
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted && c === '"' && s[i + 1] === '"') {
      field += '"';
      i++;
    } else if (quoted && c === '"') quoted = false;
    else if (quoted) field += c;
    else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r" && s[i + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else field += c;
  }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header!.map((h, i) => [h, r[i]!])));
}

describe("csv writer", () => {
  it("quotes only fields that need it, doubles quotes, keeps line breaks and Bangla, and ends rows in CRLF", () => {
    const out = csv(
      ["a", "b", "c"],
      [
        ['say "hi", ok', "দুই\nলাইন", " padded"],
        [null, 5, "plain words"],
      ],
    );
    expect(out).toBe('\uFEFFa,b,c\r\n"say ""hi"", ok","দুই\nলাইন"," padded"\r\n,5,plain words\r\n');
  });

  it("leaves the header unquoted, so WooCommerce finds the Type column after the BOM", () => {
    expect(wooCsv([colours], shop).startsWith("\uFEFFType,SKU,")).toBe(true);
  });

  it("stops a spreadsheet running a cell as a formula, but leaves plain numbers", () => {
    const out = csv(["x"], [["=HYPERLINK(1)"], ["+1"], ["-2+3"], ["@sum"], ["-1"], [-1], ["fine"]]);
    expect(parse(out).map((r) => r.x)).toEqual([" =HYPERLINK(1)", " +1", " -2+3", " @sum", "-1", "-1", "fine"]);
  });
});

describe("listing kit text", () => {
  const labels: KitLabels = {
    title: "Title",
    price: "Price",
    category: "Category",
    condition: "Condition",
    conditionNew: "New",
    description: "Description",
    colours: "Colours",
    tags: "Tags",
    note: "Marketplace is for personal items.",
  };

  it("follows Marketplace's form, one block per field, with digits-only price and the note last", () => {
    const text = marketplaceText(product(), { price: 1200, category: "Sarees", colours: ["Red", "Blue"] }, labels);
    expect(text.startsWith("\uFEFFTITLE\r\nRed Jamdani Saree\r\n\r\nPRICE\r\n1200\r\n\r\nCATEGORY\r\n")).toBe(true);
    expect(text).toContain("CATEGORY\r\nWomen's Clothing & Shoes\r\n\r\nCONDITION\r\nNew");
    expect(text).toContain("Fabric: cotton\r\nColor: red\r\n\r\nColours: Red, Blue");
    expect(text).toContain("TAGS\r\nsaree, jamdani");
    expect(text.endsWith("---\r\nMarketplace is for personal items.\r\n")).toBe(true);
    expect(text).not.toMatch(/[^\r]\n/);
  });

  it("leaves out the price block when there's no price", () => {
    const text = marketplaceText(product(), { price: null, category: "", colours: [] }, labels);
    expect(text).not.toContain("PRICE");
    expect(text).toContain("CATEGORY\r\nMiscellaneous");
  });

  it("maps free-text categories to Marketplace's list", () => {
    expect(marketplaceCategory("Silver jewellery")).toBe("Jewelry & Accessories");
    expect(marketplaceCategory("Men's panjabi")).toBe("Men's Clothing & Shoes");
    expect(marketplaceCategory("Home decor")).toBe("Household");
    expect(marketplaceCategory("Something odd")).toBe("Miscellaneous");
  });

  it("makes ASCII file names that never clash, even for a Bangla-only title", () => {
    expect(fileSlug("Red Jamdani Saree!", ID)).toBe("red-jamdani-saree-a1b2c3d4");
    expect(fileSlug("লাল জামদানি শাড়ি", ID)).toBe("listing-a1b2c3d4");
    expect(fileSlug("x".repeat(80), ID).length).toBe(40 + 9);
    // a long title ends on a whole word, never mid-word
    expect(fileSlug("Floral Embroidered Straight Kurti with Buttons", ID)).toBe(
      "floral-embroidered-straight-kurti-with-a1b2c3d4",
    );
    // a word that ends exactly at the limit stays
    expect(fileSlug("Chunky Colorful Resin Bangle for Women x yy", ID)).toBe(
      "chunky-colorful-resin-bangle-for-women-x-a1b2c3d4",
    );
  });
});

describe("Facebook catalog", () => {
  it("has one row per product with Meta's required columns and the shop's website as link", () => {
    const [row, ...rest] = parse(catalogCsv([product()], shop));
    expect(rest).toEqual([]);
    expect(row).toMatchObject({
      id: `listsnap-${ID}`,
      item_group_id: "",
      title: "Red Jamdani Saree",
      availability: "in stock",
      condition: "new",
      price: "1200 BDT",
      link: "https://facebook.com/rupa",
      image_link: "https://x.test/media/m-main.jpg?s=1",
      additional_image_link: "https://x.test/media/m-studio.jpg?s=1",
      brand: "Rupa's Shop",
    });
    expect(row!.description).toBe(
      "A light saree, with a gold border.\n\nSoft cotton.\n\nHand woven.\n\nFabric: cotton\n\nColor: red",
    );
  });

  it("groups colours, leads each with its own photo, and skips rows with no price", () => {
    const rows = parse(catalogCsv([colours, product({ listingId: "b".repeat(36), regularPrice: null })], shop));
    expect(rows.map((r) => [r.id, r.item_group_id, r.color, r.price, r.image_link])).toEqual([
      [`listsnap-${ID}-11111111`, `listsnap-${ID}`, "Red", "1200 BDT", "https://x.test/media/m-main.jpg?s=1"],
      [`listsnap-${ID}-22222222`, `listsnap-${ID}`, "Blue", "1300 BDT", "https://x.test/media/m-blue.jpg?s=1"],
    ]);
  });

  it("says out of stock at zero", () => {
    expect(parse(catalogCsv([product({ stockQty: 0 })], shop))[0]!.availability).toBe("out of stock");
  });
});

describe("WooCommerce import", () => {
  it("makes a draft simple product with the direct save's SKU, HTML text and attributes", () => {
    const [row] = parse(wooCsv([product({ category: "Sarees, cotton" })], shop));
    expect(row).toMatchObject({
      Type: "simple",
      SKU: `listsnap-${ID}`,
      Published: "-1",
      "Short description": "<p>A light saree, with a gold border.</p>",
      Description: "<p>Soft cotton.</p>\n<p>Hand woven.</p>",
      "In stock?": "1",
      Stock: "3",
      "Regular price": "1200",
      Categories: "Sarees\\, cotton",
      Tags: "saree, jamdani",
      Images: "https://x.test/media/m-main.jpg?s=1, https://x.test/media/m-studio.jpg?s=1",
      "Attribute 1 name": "Fabric",
      "Attribute 1 value(s)": "cotton",
      "Attribute 2 name": "Color",
    });
  });

  it("makes a variable product with a variation per colour pointing at its parent", () => {
    const rows = parse(wooCsv([colours], shop));
    expect(rows.map((r) => [r.Type, r.SKU, r.Parent, r["Regular price"], r.Stock, r["Attribute 1 value(s)"]])).toEqual([
      ["variable", `listsnap-${ID}`, "", "", "", "Red, Blue"],
      ["variation", `listsnap-${ID}-11111111`, `listsnap-${ID}`, "1200", "2", "Red"],
      ["variation", `listsnap-${ID}-22222222`, `listsnap-${ID}`, "1300", "", "Blue"],
    ]);
    // the colour is an option now, so the listing's own Color attribute isn't repeated
    expect(rows[0]!["Attribute 2 name"]).toBe("Fabric");
    expect(rows[0]!["Attribute 3 name"]).toBeUndefined();
    expect(rows[2]!.Images).toBe("https://x.test/media/m-blue.jpg?s=1");
  });
});

describe("Shopify import", () => {
  it("makes one draft product per handle, with product fields on the first row only", () => {
    const rows = parse(shopifyCsv([product()], shop));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      "URL handle": "ls-red-jamdani-saree-a1b2c3d4",
      Title: "Red Jamdani Saree",
      Vendor: "Rupa's Shop",
      Status: "draft",
      "Published on online store": "FALSE",
      "Option1 name": "",
      SKU: `listsnap-${ID}`,
      Price: "1200",
      "Inventory tracker": "shopify",
      "Inventory quantity": "3",
      "Product image URL": "https://x.test/media/m-main.jpg?s=1",
      "Image position": "1",
    });
    expect(rows[0]!.Description).toContain("<li><strong>Fabric:</strong> cotton</li>");
    expect(rows[1]).toMatchObject({
      "URL handle": "ls-red-jamdani-saree-a1b2c3d4",
      Title: "",
      SKU: "",
      "Image position": "2",
    });
  });

  it("puts a colour on each variant row, with its own image", () => {
    const rows = parse(shopifyCsv([colours], shop));
    expect(rows.map((r) => [r["Option1 name"], r["Option1 value"], r.SKU, r["Variant image URL"]])).toEqual([
      ["Color", "Red", `listsnap-${ID}-11111111`, "https://x.test/media/m-main.jpg?s=1"],
      ["", "Blue", `listsnap-${ID}-22222222`, "https://x.test/media/m-blue.jpg?s=1"],
    ]);
    expect(rows[1]!["Inventory tracker"]).toBe("");
    expect(rows[0]!.Description).not.toContain("Color:");
  });

  it("leaves out a photo whose file is gone", () => {
    const rows = parse(shopifyCsv([product({ images: [{ mediaId: "m-gone", alt: "" }] })], shop));
    expect(rows).toHaveLength(1);
    expect(rows[0]!["Product image URL"]).toBe("");
  });
});

describe("zip", () => {
  it("writes a zip that unzip reads back, with names marked as UTF-8", async () => {
    async function* entries(): AsyncGenerator<ZipEntry> {
      yield { name: "READ ME.txt", data: Buffer.from("hello") };
      yield { name: "a/listing-bn.txt", data: Buffer.from("লাল") };
      yield { name: "a/photos/01-main.jpg", data: Buffer.alloc(70_000, 7) };
    }
    const chunks: Buffer[] = [];
    for await (const c of zipStream(entries())) chunks.push(c);
    const dir = mkdtempSync(path.join(tmpdir(), "zip-"));
    const file = path.join(dir, "t.zip");
    writeFileSync(file, Buffer.concat(chunks));
    expect(execFileSync("unzip", ["-t", file]).toString()).toContain("No errors detected");
    execFileSync("unzip", ["-q", file, "-d", dir]);
    expect(readFileSync(path.join(dir, "a/listing-bn.txt"), "utf8")).toBe("লাল");
    // general purpose flag bit 11, which Windows and macOS read to show non-Latin names
    expect(Buffer.concat(chunks).readUInt16LE(6)).toBe(0x0800);
    expect(readFileSync(path.join(dir, "a/photos/01-main.jpg")).length).toBe(70_000);
  });
});
