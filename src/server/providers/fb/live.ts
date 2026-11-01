import "server-only";
import { env } from "@/server/env";
import { GraphError, graph, wait as realWait } from "../graph";
import type { FacebookProvider, MetaCatalog, MetaPage } from "../types";

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

    async catalogs(ctx, userToken) {
      try {
        const res = await graph<{
          data?: { id: string; name: string; owned_product_catalogs?: { data?: { id: string; name: string }[] } }[];
        }>(ctx, {
          provider: "facebook",
          endpoint: "me/businesses",
          method: "GET",
          path: "/me/businesses",
          params: { fields: "name,owned_product_catalogs.limit(50){id,name}", limit: 50 },
          token: userToken,
        });
        return (res.data ?? []).flatMap((b): MetaCatalog[] =>
          (b.owned_product_catalogs?.data ?? []).map((c) => ({ id: c.id, name: c.name, business: b.name })),
        );
      } catch (err) {
        // a seller who didn't give catalog access still connects their Page
        if (err instanceof GraphError && err.key === "metaPermission") return null;
        throw err;
      }
    },

    async saveCatalogItems(ctx, { catalogId, userToken, items }) {
      const requests = items.map((i) => ({
        method: "UPDATE",
        data: {
          id: i.id,
          title: i.title.slice(0, 100),
          description: i.description.slice(0, 5000),
          availability: i.availability,
          condition: i.condition,
          price: i.price,
          link: i.link,
          image: i.images.map((url) => ({ url })),
          brand: i.brand,
          ...(i.itemGroupId && { item_group_id: i.itemGroupId }),
          ...(i.color && { color: i.color }),
        },
      }));
      const res = await graph<{ handles?: string[] }>(ctx, {
        provider: "facebook",
        endpoint: "catalog items_batch",
        method: "POST",
        path: `/${catalogId}/items_batch`,
        // UPDATE with upsert: a new item is created, one sent before is changed, never copied
        params: { item_type: "PRODUCT_ITEM", allow_upsert: true, requests: JSON.stringify(requests) },
        token: userToken,
      });
      const handle = res.handles?.[0];
      if (!handle) throw new GraphError(200, 0, "metaProblem", { status: 200 });
      return handle;
    },

    async catalogBatch(ctx, { catalogId, userToken, handle }) {
      const res = await graph<{
        data?: { status?: string; errors?: { id?: string; retailer_id?: string; message?: string }[] }[];
      }>(ctx, {
        provider: "facebook",
        endpoint: "catalog batch status",
        method: "GET",
        path: `/${catalogId}/check_batch_request_status`,
        params: { handle },
        token: userToken,
      });
      const batch = res.data?.[0];
      if (!batch || batch.status === "in_progress" || batch.status === "dispatched") return { done: false };
      return {
        done: true,
        errors: (batch.errors ?? []).map((e) => ({
          id: e.id ?? e.retailer_id ?? "",
          message: (e.message ?? "").slice(0, 200),
        })),
      };
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
