import { z } from "zod";

/**
 * What each model step returns. The same shapes the Phase 0a spike proved against Muse
 * Spark's strict structured output: every field required, optional values as empty
 * strings or arrays, no length limits in the schema itself (they go in descriptions,
 * since the strict subset has no maxItems). Parsing with these is how a model answer
 * is checked before anything is saved.
 */

export const MultiKind = z.enum([
  "single",
  "pair",
  "identical_copies",
  "different_designs",
  "same_design_different_colors",
  "set",
  "shop_display",
]);
export const CameraAngle = z.enum(["top_down", "side", "angled"]);

/**
 * How this product's AI photos should look, decided while Spark already has the photo
 * open. Plans saved before it existed have none, so renders read it with SceneBrief.safeParse
 * and fall back to the fixed prompts.
 */
export const SceneBrief = z.object({
  setting: z
    .string()
    .describe(
      "One sentence: a real, tasteful place in a Bangladeshi home or shop where a buyer would see this product shown at its best, suited to its category, e.g. 'draped over the arm of a carved wooden chair by a sunlit window', 'on dark green velvet on a dressing table', 'on a swept courtyard step in morning light'. No people.",
    ),
  palette: z
    .array(z.string())
    .describe(
      "Two or three plain colour names for the background and props that flatter the product without matching it",
    ),
  avoid: z
    .array(z.string())
    .describe(
      "Up to three things the scene must not show because a buyer could think they come with the product, e.g. 'a matching blouse', 'jewellery', 'other sarees'. Empty if nothing in particular.",
    ),
});
export type SceneBrief = z.infer<typeof SceneBrief>;

/** Step 1 `plan`: what SAM should look for, before any segmentation. */
export const PlanResult = z.object({
  sam_phrase: z
    .string()
    .min(1)
    .describe(
      "Short noun phrase naming the product to segment, 1-4 words, e.g. 'jamdani saree', 'gold bangle'. Not a command or a question.",
    ),
  alt_phrases: z.array(z.string()).describe("Two or three alternative noun phrases to try if the first finds nothing"),
  category_guess: z.string().describe("Store category, e.g. 'Sarees', 'Bangles', 'Kurtis', 'Home decor'"),
  likely_multi: z.boolean().describe("True if the photo shows more than one sellable item"),
  item_count_guess: z.number().int().describe("How many sellable items are visible"),
  multi_kind: MultiKind.describe(
    "How the visible items relate: 'pair' = one product sold as a pair (earrings, shoes); 'identical_copies' = several of the same item (one listing, quantity N); 'shop_display' = a crowded stall or shelf with many products",
  ),
  camera_angle: CameraAngle.describe(
    "How the photo was taken: from directly above (flat lay), from the side at product level, or at an angle in between",
  ),
  photo_notes: z.string().describe("One short sentence on photo quality: clutter, light, framing"),
  scene_brief: SceneBrief.describe("How the AI lifestyle and banner photos of this product should look"),
});
export type PlanResult = z.infer<typeof PlanResult>;

/** The plan's brief, or null for plans saved before briefs existed (or a malformed one). */
export const sceneBrief = (plan: { scene_brief?: unknown }): SceneBrief | null =>
  SceneBrief.safeParse(plan.scene_brief).data ?? null;

export const Box = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });

/** Step 2 `segment`: one row per instance SAM found (masks and cutouts are stored as media). */
export const SegmentResult = z.object({
  phrase: z.string(),
  tried: z.array(z.string()),
  instances: z.array(
    z.object({ itemId: z.string(), box: Box, score: z.number().nullable(), cutoutMediaId: z.string().nullable() }),
  ),
  check: z.object({
    fillPercent: z.number(),
    sharp: z.boolean(),
    exposure: z.enum(["dark", "ok", "bright"]),
    hints: z.array(z.string()),
  }),
});
export type SegmentResult = z.infer<typeof SegmentResult>;

export const GroupMode = z.enum(["single", "pair", "identical", "separate", "set", "variants", "angles"]);
export type GroupMode = z.infer<typeof GroupMode>;

/** Step 3 `group`: Spark's suggestion when SAM finds several items. */
export const GroupResult = z.object({
  mode: GroupMode,
  auto: z.boolean().describe("True when no seller choice is needed (single, pair, identical copies)"),
  colors: z.array(z.string()).describe("A color name per item, in item order"),
  reason: z.string(),
});
export type GroupResult = z.infer<typeof GroupResult>;

const Attribute = z.object({
  name: z.string().describe("Attribute name, e.g. Fabric, Color, Size, Length, Material"),
  value: z.string().describe("Attribute value"),
});

/** Step 4 `write`: the English listing. */
export const ListingText = z.object({
  title: z.string().min(1).describe("Product title, at most 70 characters, no ALL CAPS, no emoji"),
  short_description: z.string().describe("One or two sentences, at most 160 characters"),
  description: z
    .string()
    .describe(
      "For buyers: 3-6 short paragraphs or bullet lines in plain text: what it is, material, size or fit, care, who it suits. No invented facts and no notes to the seller; say 'see photos for detail' when unsure",
    ),
  category: z.string().describe("Store category"),
  attributes: z.array(Attribute).describe("Only attributes visible in the photo or very likely"),
  tags: z.array(z.string()).describe("5-10 lowercase search tags"),
  price_hint_bdt: z
    .object({
      low: z.number().int().describe("Low end of a typical retail price in Bangladesh, in BDT"),
      high: z.number().int().describe("High end, in BDT"),
      basis: z.string().describe("One short sentence on why"),
    })
    .describe("Typical Bangladesh social-commerce retail price range"),
  confidence: z.number().min(0).max(1).describe("0 to 1: how sure you are the listing is correct without edits"),
  check_notes: z
    .array(z.string())
    .describe("What the seller should check, e.g. 'Check the fabric: could be cotton or silk blend'. At most 4"),
});
export type ListingText = z.infer<typeof ListingText>;

/** Step 5 `translate`: the Bangla text fields. */
export const BanglaText = z.object({
  title: z.string().min(1),
  short_description: z.string(),
  description: z.string(),
  attributes: z.array(Attribute),
  tags: z.array(z.string()),
});
export type BanglaText = z.infer<typeof BanglaText>;

export const Scene = z.enum(["studio", "lifestyle", "banner"]);
export type Scene = z.infer<typeof Scene>;

/** Step 6 `render`: one scene of one listing. */
export const RenderResult = z.object({
  scene: Scene,
  mediaId: z.string(),
  aiLabel: z.enum(["ai_background", "ai_scene"]),
  /** Present for scenes that redraw the product: it was checked and kept as the same product. */
  check: z.object({ same: z.literal(true), colorSimilarity: z.number().nullable() }).optional(),
});
export type RenderResult = z.infer<typeof RenderResult>;

/** Muse Spark's answer when it compares an AI photo with the product it is meant to show. */
export const ProductMatch = z.object({
  same: z.boolean().describe("True only if image 2 shows the very same item a buyer would receive"),
  differences: z
    .string()
    .describe("If not the same, the visible difference in one short sentence for the seller; empty if the same"),
});
export type ProductMatch = z.infer<typeof ProductMatch>;

/** Below this, a written listing lands in Needs review instead of Ready. */
export const REVIEW_THRESHOLD = 0.7;
