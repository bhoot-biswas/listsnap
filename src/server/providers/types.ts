import type { Box } from "@/server/image-ops/types";
import type {
  BanglaText,
  GroupMode,
  ListingText,
  PlanResult,
  ProductMatch,
  Scene,
  SceneBrief,
} from "@/lib/schemas/pipeline";
import type { WooCheckResult } from "@/lib/woo-connection";
import type { AssistRequest } from "@/lib/schemas/assist";
import type { ReelTemplate, ReelVariables } from "@/lib/schemas/reels";

/**
 * Every outside service sits behind one of these interfaces, each with a mock and a
 * live version picked by PROVIDER_MODE_*. Pipeline steps only see the
 * interface, so tests and CI run the whole pipeline with no keys.
 */

/** Who a call is for, so it can be logged against the right workspace, job and step. */
export interface CallContext {
  workspaceId: string;
  jobId: string | null;
  step: string;
}

export interface SegmentInstance {
  box: Box;
  score: number | null;
  /** SAM's mask covering `box`; the raster may be scaled down (long side up to 1024). Absent in mock mode. */
  mask?: { raster: Uint8Array; width: number; height: number };
}

export interface MetaProvider {
  readonly mode: "mock" | "live";
  plan(ctx: CallContext, photo: Buffer): Promise<PlanResult>;
  segment(ctx: CallContext, photo: Buffer, phrase: string): Promise<SegmentInstance[]>;
  group(
    ctx: CallContext,
    crops: Buffer[],
    plan: PlanResult,
  ): Promise<{
    mode: Exclude<GroupMode, "single" | "pair" | "identical" | "angles">;
    colors: string[];
    reason: string;
  }>;
  write(ctx: CallContext, photo: Buffer, plan: PlanResult, voice: BrandVoice): Promise<ListingText>;
  translate(ctx: CallContext, listing: ListingText): Promise<BanglaText>;
  /** Review's per-field help: the new text for one field. */
  assist(ctx: CallContext, input: AssistInput): Promise<string>;
  /**
   * Whether an AI photo still shows the product in the cutout: same colours, pattern and
   * details, whatever the setting or pose. Guards every image that redraws the product.
   */
  compareProduct(ctx: CallContext, reference: Buffer, candidate: Buffer, phrase: string): Promise<ProductMatch>;
  /** An empty background for a composite (studio and banner). The brief only colours the banner. */
  background(
    ctx: CallContext,
    scene: Scene,
    angle: PlanResult["camera_angle"],
    brief: SceneBrief | null,
  ): Promise<Buffer>;
  /**
   * A whole scene made by editing the white cutout image (lifestyle), set as the brief
   * describes, or in the seller's own shop when the brand kit has a setting photo.
   */
  editScene(
    ctx: CallContext,
    main: Buffer,
    scene: Scene,
    phrase: string,
    brief: SceneBrief | null,
    kit: SceneKit | null,
  ): Promise<Buffer>;
}

/** What a lifestyle scene in the seller's own shop needs from the brand kit. */
export interface SceneKit {
  /** The seller's original photo, so the model sees the product in real light. */
  original: Buffer;
  /** The shop setting photo. */
  setting: Buffer;
  /** Checked hex codes; empty for none. */
  colors: string[];
}

export interface AssistInput extends AssistRequest {
  /** What the listing is about, so a rewrite keeps the facts. */
  product: { title: string; category: string; attributes: { name: string; value: string }[] };
  voice: BrandVoice;
}

/** The shop's tone of voice and its standing note to the writer, from Settings. */
export interface BrandVoice {
  tone: string;
  note: string | null;
}

export interface WooDraftInput {
  listingId: string;
  productId: number | null;
  title: string;
  description: string;
  shortDescription: string;
  category: string;
  /** Used when the store has no category by that name; null lets the client create one. */
  fallbackCategoryId: number | null;
  regularPrice: number | null;
  /** Null leaves stock unmanaged in the store. */
  stockQty: number | null;
  tags: string[];
  attributes: { name: string; value: string }[];
  /** Workspace media, main image first. The live client uploads the files, since /media is private. */
  images: { mediaId: string; alt: string }[];
  /** Colours sold as variations of one variable product; null makes a simple product. */
  variants: WooVariantInput[] | null;
}

export interface WooVariantInput {
  /** Matches a variation to its item on later saves. */
  itemId: string;
  color: string;
  regularPrice: number | null;
  stockQty: number | null;
  /** This colour's main image, also sent in `images` so the gallery shows every colour. */
  mediaId: string | null;
}

/** A shop's WooCommerce store: its address and REST keys (decrypted only for the call). */
export interface WooStore {
  url: string;
  key: string;
  secret: string;
}

export interface WooProvider {
  readonly mode: "mock" | "live";
  /** Creates or updates a draft product; never publishes. */
  saveDraft(
    ctx: CallContext,
    store: WooStore | null,
    input: WooDraftInput,
  ): Promise<{ productId: number; editUrl: string }>;
  /** Tests an address and keys before they're saved (onboarding, Connections). */
  check(ctx: CallContext, store: WooStore): Promise<WooCheckResult>;
}

export interface InstagramProvider {
  readonly mode: "mock" | "live";
  postCarousel(
    ctx: CallContext,
    input: { imageUrls: string[]; caption: string },
  ): Promise<{ mediaId: string; permalink: string }>;
}

export interface ReelPhotoFiles {
  hero: Buffer;
  look1: Buffer;
  look2: Buffer;
  product: Buffer;
}

export interface VideoProvider {
  readonly mode: "mock" | "live";
  /** Renders one reel from one of our templates. Variables are validated before this is called. */
  renderReel(
    ctx: CallContext,
    input: { template: ReelTemplate; photos: ReelPhotoFiles; variables: ReelVariables },
  ): Promise<{ data: Buffer; width: number; height: number; seconds: number }>;
}
