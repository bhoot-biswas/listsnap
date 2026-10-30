import { z } from "zod";
import { ReelLang } from "./reels";

/** Where a reel can be posted. Each is its own confirmed action, so one failing never blocks the other. */
export const DESTINATIONS = ["facebook", "instagram"] as const;
export const Destination = z.enum(DESTINATIONS);
export type Destination = z.infer<typeof Destination>;

/** The "meta" connection's settings: the Page and its linked Instagram account, if any. */
export const MetaSettings = z.object({
  pageId: z.string().min(1),
  pageName: z.string().min(1),
  igUserId: z.string().min(1).nullable(),
  igUsername: z.string().min(1).nullable(),
  /** A made-up Page and account for trying posting without a Meta app. */
  test: z.boolean(),
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
