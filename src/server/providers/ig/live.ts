import "server-only";
import { GraphError, graph, wait as realWait } from "../graph";
import type { CallContext, InstagramProvider, SocialAccount } from "../types";

/**
 * Instagram posting through the Graph API, as the Instagram account linked to the
 * seller's Page and with that Page's token. Every post is a container Instagram builds
 * from our signed links, then a publish once it's ready.
 */

// a short reel is usually ready in well under a minute; the post must answer within two
const READY_TRIES = 25;
const READY_WAIT_MS = 3_000;

export function makeLiveInstagram(wait = realWait): InstagramProvider {
  return {
    mode: "live",

    async postReel(ctx, { account, videoUrl, caption }) {
      const container = await create(ctx, account, {
        media_type: "REELS",
        video_url: videoUrl,
        caption,
        share_to_feed: true,
      });
      await whenReady(ctx, account, container, wait);
      return publish(ctx, account, container);
    },

    async postCarousel(ctx, { account, imageUrls, caption }) {
      const children: string[] = [];
      for (const url of imageUrls)
        children.push(await create(ctx, account, { image_url: url, is_carousel_item: true }));
      const container = await create(ctx, account, {
        media_type: "CAROUSEL",
        children: children.join(","),
        caption,
      });
      await whenReady(ctx, account, container, wait);
      const post = await publish(ctx, account, container);
      return { mediaId: post.postId, permalink: post.permalink };
    },
  };
}

async function create(ctx: CallContext, account: SocialAccount, params: Record<string, string | boolean>) {
  const res = await graph<{ id: string }>(ctx, {
    provider: "instagram",
    endpoint: "media",
    method: "POST",
    path: `/${account.id}/media`,
    params,
    token: account.token,
  });
  return res.id;
}

/** Instagram downloads and checks the file in the background; publishing before FINISHED fails. */
async function whenReady(
  ctx: CallContext,
  account: SocialAccount,
  container: string,
  wait: (ms: number) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < READY_TRIES; i++) {
    const res = await graph<{ status_code?: string; status?: string }>(ctx, {
      provider: "instagram",
      endpoint: "media status",
      method: "GET",
      path: `/${container}`,
      params: { fields: "status_code,status" },
      token: account.token,
    });
    if (res.status_code === "FINISHED" || res.status_code === "PUBLISHED") return;
    if (res.status_code === "ERROR" || res.status_code === "EXPIRED") {
      // `status` holds Instagram's reason, e.g. a video that is too long or the wrong shape
      const message = res.status?.slice(0, 200);
      throw message ? new GraphError(200, 0, "metaSaid", { message }) : new GraphError(200, 0, "metaVideo");
    }
    await wait(READY_WAIT_MS);
  }
  throw new GraphError(200, 0, "metaSlow");
}

async function publish(ctx: CallContext, account: SocialAccount, container: string) {
  const { id } = await graph<{ id: string }>(ctx, {
    provider: "instagram",
    endpoint: "media_publish",
    method: "POST",
    path: `/${account.id}/media_publish`,
    params: { creation_id: container },
    token: account.token,
  });
  // the post is made; a missing link must not make the seller post it again
  const permalink = await graph<{ permalink?: string }>(ctx, {
    provider: "instagram",
    endpoint: "media permalink",
    method: "GET",
    path: `/${id}`,
    params: { fields: "permalink" },
    token: account.token,
  })
    .then((r) => r.permalink)
    .catch(() => undefined);
  return { postId: id, permalink: permalink ?? `https://www.instagram.com/${account.name.replace(/^@/, "")}/` };
}

export const liveInstagram = makeLiveInstagram();
