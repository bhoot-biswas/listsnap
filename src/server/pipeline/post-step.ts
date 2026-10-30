import "server-only";
import { StepError } from "./run-step";
import type { ListingStepContext } from "./listing-steps";
import { env } from "@/server/env";
import { signedMediaUrl } from "@/server/media/signed";
import { facebook, instagram } from "@/server/providers";
import { metaConnection } from "@/server/social/connection";
import { ReelResult } from "@/lib/schemas/reels";
import type { PostRequest, PostResult } from "@/lib/schemas/social";

// Meta fetches the video itself, and a large reel can wait in its queue for a while
const VIDEO_LINK_TTL_S = 60 * 60;

/**
 * Step `post` (on request, always confirmed): the listing's latest reel in one language
 * to one destination. Its saved result is the post, so asking again, from another tab or
 * after a timeout, returns that post instead of posting twice.
 */
export async function postStep(ctx: ListingStepContext, req: PostRequest): Promise<PostResult> {
  const { ws, listing } = ctx;
  const reel = ReelResult.safeParse(await ws.stepResult(listing.job_id, "reel", `${listing.id}:showcase:${req.lang}`));
  if (!reel.success) throw new StepError("Make the reel first; then it can be posted.");

  const conn = await metaConnection(ws);
  if (!conn) throw new StepError("Connect your Facebook Page first, on the Connections page.");
  const live = env().providers[req.destination] === "live";
  if (conn.settings.test && live)
    throw new StepError("This shop has a test connection. Connect your real Facebook Page to post.");
  const account = conn.account(req.destination);
  if (!account)
    throw new StepError(
      "Your Facebook Page has no Instagram business account linked, so there's nowhere on Instagram to post.",
    );

  const call = { workspaceId: ws.id, jobId: listing.job_id, step: "post" };
  const videoUrl = signedMediaUrl(ws.id, reel.data.mediaId, "video/mp4", VIDEO_LINK_TTL_S);
  const post =
    req.destination === "facebook"
      ? await facebook().postReel(call, { page: account, videoUrl, caption: req.caption })
      : await instagram().postReel(call, { account, videoUrl, caption: req.caption });

  await ws.markPosted(listing.id, req.destination === "instagram" ? post.postId : null);
  return {
    destination: req.destination,
    lang: req.lang,
    reelMediaId: reel.data.mediaId,
    postId: post.postId,
    permalink: post.permalink,
    test: conn.settings.test,
  };
}
