import { z } from "zod";
import { ReelLang } from "./reels";

/** Where a reel can be posted. Each is its own confirmed action, so one failing never blocks the other. */
export const DESTINATIONS = ["facebook", "instagram"] as const;
export const Destination = z.enum(DESTINATIONS);
export type Destination = z.infer<typeof Destination>;

/** A Page the seller let ListSnap use, as the Page picker shows it. Its token is kept apart, encrypted. */
export const MetaPageChoice = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  igUserId: z.string().min(1).nullable(),
  igUsername: z.string().min(1).nullable(),
});
export type MetaPageChoice = z.infer<typeof MetaPageChoice>;

/** A product catalog the seller can save listings to. */
export const MetaCatalogChoice = z.object({ id: z.string().min(1), name: z.string(), business: z.string() });
export type MetaCatalogChoice = z.infer<typeof MetaCatalogChoice>;

/** The "meta" connection's settings: the Page reels post to and its linked Instagram account, if any. */
export const MetaSettings = z.object({
  pageId: z.string().min(1),
  pageName: z.string().min(1),
  igUserId: z.string().min(1).nullable(),
  igUsername: z.string().min(1).nullable(),
  /** A made-up Page and account for trying posting without a Meta app. */
  test: z.boolean(),
  /** Every Page from the last Facebook login, so the seller can switch without logging in again. */
  pages: z.array(MetaPageChoice).default([]),
  /** The catalogs in the seller's business portfolios at the last login, and the one listings go to. */
  catalogs: z.array(MetaCatalogChoice).default([]),
  catalogId: z.string().nullable().default(null),
  /** The seller gave catalog access at the last login, whether or not they have a catalog. */
  catalogAccess: z.boolean().default(false),
});
export type MetaSettings = z.infer<typeof MetaSettings>;

/** Instagram's caption limit; Facebook allows more, so one cap fits both. */
export const CAPTION_MAX = 2200;

export const PostRequest = z.object({
  lang: ReelLang,
  destination: Destination,
  caption: z.string().trim().min(1).max(CAPTION_MAX),
});
export type PostRequest = z.infer<typeof PostRequest>;

/** Step `post`: one reel posted to one destination. */
export const PostResult = z.object({
  destination: Destination,
  lang: ReelLang,
  reelMediaId: z.string(),
  postId: z.string(),
  permalink: z.string().url(),
  test: z.boolean(),
});
export type PostResult = z.infer<typeof PostResult>;
