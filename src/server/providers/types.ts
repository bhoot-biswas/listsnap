import type { Box } from "@/server/image-ops/types";
import type { BanglaText, GroupMode, ListingText, PlanResult, Scene } from "@/lib/schemas/pipeline";

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
  write(ctx: CallContext, photo: Buffer, plan: PlanResult, brandVoice: string): Promise<ListingText>;
  translate(ctx: CallContext, listing: ListingText): Promise<BanglaText>;
  /** An empty background for a composite (studio and banner). */
  background(ctx: CallContext, scene: Scene, angle: PlanResult["camera_angle"]): Promise<Buffer>;
  /** A whole scene made by editing the white cutout image (lifestyle). */
  editScene(ctx: CallContext, main: Buffer, scene: Scene, phrase: string): Promise<Buffer>;
}

export interface WooDraftInput {
  listingId: string;
  productId: number | null;
  title: string;
  description: string;
  shortDescription: string;
  category: string;
  regularPrice: number | null;
  tags: string[];
  attributes: { name: string; value: string }[];
  /** Workspace media, main image first. The live client uploads the files, since /media is private. */
  images: { mediaId: string; alt: string }[];
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
}

export interface InstagramProvider {
  readonly mode: "mock" | "live";
  postCarousel(
    ctx: CallContext,
    input: { imageUrls: string[]; caption: string },
  ): Promise<{ mediaId: string; permalink: string }>;
}
