/**
 * A small made-up shop the eval runs against. The model sees it in the system prompt and
 * gets these back from the read tools, so every expected answer is known in advance.
 */

export const SAREE = "l-saree";
export const KURTI = "l-kurti";
export const PANJABI = "l-panjabi";
export const BANGLES = "l-bangles";

export const SHOP_LISTINGS = [
  {
    id: SAREE,
    jobId: "j1",
    title: "Red Jamdani Saree with Gold Zari Border",
    titleBn: "সোনালি জরি পাড়ের লাল জামদানি শাড়ি",
    status: "needs_review",
    category: "Sarees",
    priceBdt: 1500,
  },
  {
    id: KURTI,
    jobId: "j2",
    title: "Red Embroidered Cotton Kurti",
    titleBn: "লাল সুতির এমব্রয়ডারি কুর্তি",
    status: "ready",
    category: "Kurtis",
    priceBdt: 950,
  },
  {
    id: PANJABI,
    jobId: "j3",
    title: "White Cotton Panjabi for Eid",
    titleBn: "ঈদের সাদা সুতির পাঞ্জাবি",
    status: "ready",
    category: "Panjabi",
    priceBdt: 1800,
  },
  {
    id: BANGLES,
    jobId: "j4",
    title: "Glass Bangles Set of 12",
    titleBn: "১২টি কাচের চুড়ির সেট",
    status: "in_store",
    category: "Jewellery",
    priceBdt: 350,
  },
];

/** What getListingSummary returns for the saree, and what its chat's prompt shows. */
export const SAREE_SUMMARY = {
  id: SAREE,
  status: "needs_review",
  title: SHOP_LISTINGS[0]!.title,
  titleBn: SHOP_LISTINGS[0]!.titleBn,
  category: "Sarees",
  priceBdt: 1500,
  suggestedPriceBdt: null,
  stockQty: null,
  confidence: 0.66,
  checkNotes: ["Check the fabric: handloom or powerloom, cotton or silk blend."],
  inStore: false,
  photos: [
    { id: "m-main", kind: "main", selected: true },
    { id: "m-studio", kind: "studio", selected: true },
    { id: "m-eid", kind: "look_eid", selected: true },
  ],
};

export const listingFacts = (over: Partial<{ reelsMade: string[]; inStore: boolean }> = {}) => ({
  listing: { ...SAREE_SUMMARY, inStore: over.inStore ?? false },
  reelsMade: over.reelsMade ?? ["en", "bn"],
  facebookPage: "Nakshi Loom",
  instagram: "@nakshiloom",
  aiPhotosLeftToday: 12,
});

export const SHOP_FACTS = {
  shop: "Nakshi Loom",
  listingsByStatus: { needs_review: 1, ready: 2, in_store: 1 },
  aiPhotosLeftToday: 12,
  reelsLeftToday: 8,
  facebookPage: "Nakshi Loom",
  instagram: "@nakshiloom",
};

/** findListings over the made-up shop: by status, and by any word of the query in either title. */
export function findListings(args: { status?: string; query?: string }) {
  const words = (args.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const listings = SHOP_LISTINGS.filter(
    (l) =>
      (!args.status || l.status === args.status) &&
      (!words.length || words.some((w) => `${l.title} ${l.titleBn}`.toLowerCase().includes(w))),
  );
  return { ok: true, total: listings.length, page: 1, listings };
}
