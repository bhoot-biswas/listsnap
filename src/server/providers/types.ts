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
import type { ShopifyCheckResult } from "@/lib/shopify-connection";
import type { AssistRequest } from "@/lib/schemas/assist";
import type { ReelTemplate, ReelVariables } from "@/lib/schemas/reels";
import type { ChatMessage } from "@/lib/schemas/chat";

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
  /** One turn of the shop assistant: a reply, tool calls, or both. */
  chat(ctx: CallContext, input: ChatInput): Promise<ChatTurn>;
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

/** A tool the chat model may call; `parameters` is its input's JSON Schema. */
export interface ChatTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatInput {
  system: string;
  messages: ChatMessage[];
  tools: ChatTool[];
  /** Photos the model looks at, as data URLs by media id: only the latest message's, to keep each turn small. */
  images?: Record<string, string>;
}

/** The model's turn. Tool arguments arrive as the model wrote them and are checked by the caller. */
export interface ChatTurn {
  content: string | null;
  toolCalls: { name: string; argsJson: string }[];
}

/** The shop's tone of voice and its standing note to the writer, from Settings. */
export interface BrandVoice {
  tone: string;
  note: string | null;
}

/** What every store gets for a draft, whichever store it is. */
export interface StoreDraftInput {
  listingId: string;
  /** The store's id for the product saved before (WooCommerce's number, Shopify's GID); null for none. */
  productRef: string | null;
  title: string;
  /** Plain text from the model; each store client turns it into its own HTML. */
  description: string;
  shortDescription: string;
  category: string;
  regularPrice: number | null;
  /** Null leaves stock unmanaged in the store. */
  stockQty: number | null;
  tags: string[];
  attributes: { name: string; value: string }[];
  /** Workspace media, main image first. Stores fetch them from signed links, since /media is private. */
  images: { mediaId: string; alt: string }[];
  /** Colours sold as variants of one product; null makes a product with no options. */
  variants: StoreVariantInput[] | null;
}

export interface StoreVariantInput {
  /** Matches a variant to its item on later saves. */
  itemId: string;
  color: string;
  regularPrice: number | null;
  stockQty: number | null;
  /** This colour's main image, also sent in `images` so the gallery shows every colour. */
  mediaId: string | null;
}

/** A draft as the store saved it: its id there, and where the seller edits it. */
export interface SavedDraft {
  productRef: string;
  editUrl: string;
}

export interface WooDraftInput extends StoreDraftInput {
  /** Used when the store has no category by that name; null lets the client create one. */
  fallbackCategoryId: number | null;
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
  saveDraft(ctx: CallContext, store: WooStore | null, input: WooDraftInput): Promise<SavedDraft>;
  /** Tests an address and keys before they're saved (onboarding, Connections). */
  check(ctx: CallContext, store: WooStore): Promise<WooCheckResult>;
}

export interface ShopifyDraftInput extends StoreDraftInput {
  /** Where stock is counted; null leaves every variant untracked. */
  locationId: string | null;
}

/** A Shopify store and an access token for it, already fresh (stores/shopify-token.ts). */
export interface ShopifyStore {
  /** "name.myshopify.com" */
  shop: string;
  accessToken: string;
}

/** What Shopify's token endpoint answered. Expiry times are absolute (ms since epoch). */
export interface ShopifyToken {
  accessToken: string;
  scope: string;
  expiresAt: number | null;
  refreshToken: string | null;
  refreshExpiresAt: number | null;
}

export interface ShopifyProvider {
  readonly mode: "mock" | "live";
  /** Creates or updates a draft product; never publishes. */
  saveDraft(ctx: CallContext, store: ShopifyStore | null, input: ShopifyDraftInput): Promise<SavedDraft>;
  /** Tests a fresh connection: scopes, a location for stock, the shop's currency. */
  check(ctx: CallContext, store: ShopifyStore): Promise<ShopifyCheckResult>;
  /** OAuth: the code from the callback for an expiring offline token. */
  exchangeCode(ctx: CallContext, shop: string, code: string): Promise<ShopifyToken>;
  /** Spends a refresh token for a new pair; the old refresh token is used up. */
  refresh(ctx: CallContext, shop: string, refreshToken: string): Promise<ShopifyToken>;
  /** A 24-hour token for a store in our own organisation (the demo store), with the app's own keys. */
  appToken(ctx: CallContext, shop: string, app: { clientId: string; clientSecret: string }): Promise<ShopifyToken>;
}

/** A Page or Instagram account the seller connected, with its decrypted token. Never logged. */
export interface SocialAccount {
  id: string;
  name: string;
  token: string;
}

/** What a post returns: the platform's id and the public link to it. */
export interface SocialPost {
  postId: string;
  permalink: string;
}

export interface InstagramProvider {
  readonly mode: "mock" | "live";
  postCarousel(
    ctx: CallContext,
    input: { imageUrls: string[]; caption: string },
  ): Promise<{ mediaId: string; permalink: string }>;
  /** Posts a reel from a public video URL: a container, then waiting for it, then publishing. */
  postReel(ctx: CallContext, input: { account: SocialAccount; videoUrl: string; caption: string }): Promise<SocialPost>;
}

export interface FacebookProvider {
  readonly mode: "mock" | "live";
  /** Posts a reel to the seller's Page from a public video URL. */
  postReel(ctx: CallContext, input: { page: SocialAccount; videoUrl: string; caption: string }): Promise<SocialPost>;
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
