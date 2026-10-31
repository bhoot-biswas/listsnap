import { describe, expect, it } from "vitest";
import { StepError } from "@/server/pipeline/run-step";
import type { ShopifyDraftInput } from "../types";
import { editUrl, mediaMapAfter, productSetInput, type ExistingProduct, type FileSet } from "./draft";

const LOC = "gid://shopify/Location/1";

const base = (over: Partial<ShopifyDraftInput> = {}): ShopifyDraftInput => ({
  listingId: "L1",
  productRef: null,
  title: "Red saree",
  description: "Soft cotton.\n\nHand woven.",
  shortDescription: "A red saree.",
  category: "Sarees",
  regularPrice: 1500,
  stockQty: 3,
  tags: ["saree", " red ", "saree"],
  attributes: [
    { name: "Fabric", value: "Cotton" },
    { name: "Color", value: "Red, Blue" },
  ],
  images: [
    { mediaId: "m1", alt: "Red saree" },
    { mediaId: "m2", alt: "Red saree" },
  ],
  variants: null,
  locationId: LOC,
  ...over,
});

const src = new Map([
  ["m1", { url: "https://app/media/m1.jpg?s=1", ext: "jpg" }],
  ["m2", { url: "https://app/media/m2.png?s=2", ext: "png" }],
  ["m3", { url: "https://app/media/m3.jpg?s=3", ext: "jpg" }],
]);

const colours = [
  { itemId: "item-aaaaaaaa-1", color: "Red", regularPrice: 1500, stockQty: 2, mediaId: "m1" },
  { itemId: "item-bbbbbbbb-2", color: "Blue", regularPrice: 1600, stockQty: null, mediaId: "m3" },
];

describe("productSetInput on create", () => {
  it("makes a draft with one variant, tracked stock and every photo", () => {
    const { input, sentMedia } = productSetInput(base(), null, src);
    expect(input).toMatchObject({
      title: "Red saree",
      productType: "Sarees",
      status: "DRAFT",
      tags: ["saree", "red"],
      productOptions: [{ name: "Title", values: [{ name: "Default Title" }] }],
      metafields: [{ namespace: "listsnap", key: "listing_id", value: "L1" }],
    });
    expect(input.variants).toEqual([
      {
        sku: "listsnap-L1",
        metafields: [{ namespace: "listsnap", key: "item_id", type: "single_line_text_field", value: "listing" }],
        optionValues: [{ optionName: "Title", name: "Default Title" }],
        price: "1500",
        inventoryItem: { tracked: true },
        inventoryQuantities: [{ locationId: LOC, name: "available", quantity: 3 }],
      },
    ]);
    expect(input.files).toEqual([
      { originalSource: src.get("m1")!.url, alt: "Red saree", filename: "listsnap-m1.jpg", contentType: "IMAGE" },
      { originalSource: src.get("m2")!.url, alt: "Red saree", filename: "listsnap-m2.png", contentType: "IMAGE" },
    ]);
    expect(sentMedia).toEqual(["m1", "m2"]);
  });

  it("puts the short description first and the details as a list, keeping Color as a detail", () => {
    const html = productSetInput(base(), null, src).input.descriptionHtml as string;
    expect(html).toBe(
      "<p>A red saree.</p>\n<p>Soft cotton.</p>\n<p>Hand woven.</p>\n<ul>\n<li><strong>Fabric:</strong> Cotton</li>\n<li><strong>Color:</strong> Red, Blue</li>\n</ul>",
    );
  });

  it("leaves stock untracked with no quantity or no location", () => {
    expect((productSetInput(base({ stockQty: null }), null, src).input.variants as object[])[0]).toMatchObject({
      inventoryItem: { tracked: false },
    });
    const noLoc = (productSetInput(base({ locationId: null }), null, src).input.variants as object[])[0];
    expect(noLoc).toMatchObject({ inventoryItem: { tracked: false } });
    expect(noLoc).not.toHaveProperty("inventoryQuantities");
  });

  it("sells colours as a Color option, each variant with its own photo", () => {
    const { input } = productSetInput(base({ variants: colours }), null, src);
    expect(input.productOptions).toEqual([{ name: "Color", values: [{ name: "Red" }, { name: "Blue" }] }]);
    const [red, blue] = input.variants as Record<string, unknown>[];
    expect(red).toMatchObject({
      sku: "listsnap-L1-item-aaa",
      optionValues: [{ optionName: "Color", name: "Red" }],
      price: "1500",
      file: { originalSource: src.get("m1")!.url },
    });
    // a variant photo must be one of the product's files, so one not in the gallery is left off
    expect(
      (input.files as FileSet[]).some((f) => "originalSource" in f && f.originalSource === src.get("m3")!.url),
    ).toBe(false);
    expect(blue).toMatchObject({ inventoryItem: { tracked: false } });
    expect(blue).not.toHaveProperty("file");
    // Color is the option now, not a detail
    expect(input.descriptionHtml).not.toContain("Color:");
  });

  it("skips photos whose file is gone", () => {
    const { input, sentMedia } = productSetInput(base({ images: [{ mediaId: "gone", alt: "x" }] }), null, src);
    expect(input.files).toEqual([]);
    expect(sentMedia).toEqual([]);
  });
});

describe("productSetInput on update", () => {
  const existing = (over: Partial<ExistingProduct> = {}): ExistingProduct => ({
    id: "gid://shopify/Product/7",
    options: [{ name: "Color", optionValues: [{ name: "Red" }, { name: "Green" }] }],
    variants: [
      { id: "V-red", price: "1400", selectedOptions: [{ name: "Color", value: "Red" }], itemId: "item-aaaaaaaa-1" },
      // the seller added Green in Shopify
      { id: "V-green", price: "999", selectedOptions: [{ name: "Color", value: "Green" }], itemId: null },
    ],
    media: ["M-1", "M-theirs"],
    mediaMap: { m1: "M-1" },
    ...over,
  });

  it("keeps the seller's variants and photos, and never touches status or metafields", () => {
    const { input, sentMedia } = productSetInput(base({ variants: colours }), existing(), src);
    expect(input).not.toHaveProperty("status");
    expect(input).not.toHaveProperty("metafields");
    expect(input.productOptions).toEqual([
      { name: "Color", values: [{ name: "Red" }, { name: "Blue" }, { name: "Green" }] },
    ]);
    expect(input.variants).toEqual([
      expect.objectContaining({ id: "V-red", price: "1500", file: { id: "M-1" } }),
      expect.not.objectContaining({ id: expect.anything() }),
      { id: "V-green", price: "999", optionValues: [{ optionName: "Color", name: "Green" }] },
    ]);
    // ours by id, the new one by link, theirs last
    expect(input.files).toEqual([
      { id: "M-1" },
      expect.objectContaining({ filename: "listsnap-m2.png" }),
      { id: "M-theirs" },
    ]);
    expect(sentMedia).toEqual(["m1", "m2", null]);
  });

  it("refuses a product the seller gave another option", () => {
    const sized = existing({
      options: [
        { name: "Color", optionValues: [] },
        { name: "Size", optionValues: [] },
      ],
    });
    expect(() => productSetInput(base({ variants: colours }), sized, src)).toThrow(StepError);
  });

  it("refuses to drop the seller's colours when the listing has none any more", () => {
    expect(() => productSetInput(base(), existing(), src)).toThrow(StepError);
  });

  it("updates the one variant of a product with no colours", () => {
    const simple = existing({
      options: [{ name: "Title", optionValues: [{ name: "Default Title" }] }],
      variants: [
        {
          id: "V-only",
          price: "1",
          selectedOptions: [{ name: "Title", value: "Default Title" }],
          itemId: "listing",
        },
      ],
    });
    const v = (productSetInput(base(), simple, src).input.variants as object[])[0];
    expect(v).toMatchObject({ id: "V-only", price: "1500" });
    expect(v).not.toHaveProperty("sku");
  });
});

describe("mediaMapAfter", () => {
  it("matches new photos by position, and keeps only known ones when Shopify dropped a file", () => {
    const plan = { input: {}, sentMedia: ["m1", "m2", null] };
    const files: FileSet[] = [
      { id: "M-1" },
      { originalSource: "u", alt: "", filename: "f", contentType: "IMAGE" },
      { id: "M-theirs" },
    ];
    expect(mediaMapAfter(plan, files, ["M-1", "M-2", "M-theirs"])).toEqual({ m1: "M-1", m2: "M-2" });
    expect(mediaMapAfter(plan, files, ["M-1", "M-theirs"])).toEqual({ m1: "M-1" });
  });
});

describe("editUrl", () => {
  it("links to the product in the Shopify admin", () => {
    expect(editUrl("rupkotha.myshopify.com", "gid://shopify/Product/123")).toBe(
      "https://admin.shopify.com/store/rupkotha/products/123",
    );
  });
});
