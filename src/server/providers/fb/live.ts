import "server-only";
import { env } from "@/server/env";
import { GraphError, graph, wait as realWait } from "../graph";
import type { FacebookProvider, MetaPage } from "../types";

/**
 * Facebook Login and Page reels through the Graph API. A reel is three calls: reserve
 * an upload, let Facebook fetch the video from our signed link, then publish it. We then
 * watch the video's status for a while, so a reel Facebook rejects fails here instead of
 * looking posted.
 */

// the whole post must answer the browser within Nginx's two minutes
const STATUS_TRIES = 20;
const STATUS_WAIT_MS = 3_000;

interface ReelStatus {
  status?: {
    video_status?: string;
    processing_phase?: { status?: string; errors?: { message?: string }[] };
    publishing_phase?: { status?: string; errors?: { message?: string }[] };
  };
}

export function makeLiveFacebook(wait = realWait): FacebookProvider {
  return {
    mode: "live",

    async exchangeCode(ctx, { code, redirectUri }) {
      const { appId, appSecret } = env().metaApp;
      const short = await graph<{ access_token: string }>(ctx, {
        provider: "facebook",
        endpoint: "oauth/access_token",
        method: "POST",
        path: "/oauth/access_token",
        params: { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code },
      });
      // the short token lasts an hour; a long-lived one makes Page tokens that never expire
      const long = await graph<{ access_token: string }>(ctx, {
        provider: "facebook",
        endpoint: "oauth/fb_exchange_token",
        method: "POST",
        path: "/oauth/access_token",
        params: {
          grant_type: "fb_exchange_token",
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: short.access_token,
        },
      });
      return long.access_token;
    },

    async pages(ctx, userToken) {
      const res = await graph<{
        data?: {
          id: string;
          name: string;
          access_token?: string;
          instagram_business_account?: { id: string; username?: string };
        }[];
      }>(ctx, {
        provider: "facebook",
        endpoint: "me/accounts",
        method: "GET",
        path: "/me/accounts",
        params: { fields: "id,name,access_token,instagram_business_account{id,username}", limit: 100 },
        token: userToken,
      });
      return (res.data ?? []).flatMap((p): MetaPage[] =>
        p.access_token
          ? [
              {
                id: p.id,
                name: p.name,
                token: p.access_token,
                instagram: p.instagram_business_account?.username
                  ? { id: p.instagram_business_account.id, username: `@${p.instagram_business_account.username}` }
                  : null,
              },
            ]
          : [],
      );
    },

    async postReel(ctx, { page, videoUrl, caption }) {
      const start = await graph<{ video_id: string; upload_url: string }>(ctx, {
        provider: "facebook",
        endpoint: "video_reels start",
        method: "POST",
        path: `/${page.id}/video_reels`,
        params: { upload_phase: "start" },
        token: page.token,
      });
      await graph(ctx, {
        provider: "facebook",
        endpoint: "rupload file_url",
        method: "POST",
        path: start.upload_url,
        token: page.token,
        headers: { file_url: videoUrl },
        timeoutMs: 60_000,
      });
      await graph(ctx, {
        provider: "facebook",
        endpoint: "video_reels finish",
        method: "POST",
        path: `/${page.id}/video_reels`,
        params: { upload_phase: "finish", video_id: start.video_id, video_state: "PUBLISHED", description: caption },
        token: page.token,
      });
      await watchReel(ctx, page.token, start.video_id, wait);
      return { postId: start.video_id, permalink: `https://www.facebook.com/reel/${start.video_id}` };
    },
  };
}

/** Waits until Facebook has published the reel or said why not. Still busy at the end counts as posted. */
async function watchReel(
  ctx: Parameters<FacebookProvider["postReel"]>[0],
  token: string,
  videoId: string,
  wait: (ms: number) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < STATUS_TRIES; i++) {
    const { status } = await graph<ReelStatus>(ctx, {
      provider: "facebook",
      endpoint: "video status",
      method: "GET",
      path: `/${videoId}`,
      params: { fields: "status" },
      token,
    });
    const failed = [status?.processing_phase, status?.publishing_phase].find((p) => p?.status === "error");
    if (failed || status?.video_status === "error") {
      const message = failed?.errors?.[0]?.message?.slice(0, 200);
      throw message ? new GraphError(200, 0, "metaSaid", { message }) : new GraphError(200, 0, "metaVideo");
    }
    if (status?.publishing_phase?.status === "complete") return;
    await wait(STATUS_WAIT_MS);
  }
}

export const liveFacebook = makeLiveFacebook();
