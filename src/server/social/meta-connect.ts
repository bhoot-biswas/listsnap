import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "@/server/env";
import { forWorkspace } from "@/server/db/scope";
import { facebook, type MetaPage } from "@/server/providers";
import type { MetaPageChoice, MetaSettings } from "@/lib/schemas/social";
import { encryptPageTokens } from "./connection";

/**
 * Connecting a Facebook Page with Facebook Login. The login link carries a random state;
 * the same state and the workspace go into a short-lived signed cookie, so the callback
 * only finishes a login this browser started for this shop.
 */

export const STATE_COOKIE = "listsnap_meta_oauth";
const STATE_TTL_MS = 10 * 60_000;

// what the login asks for when no saved configuration is set (classic Facebook Login)
const SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
];

const State = z.object({ state: z.string().min(16), workspaceId: z.string(), exp: z.number() });
type State = z.infer<typeof State>;

const sign = (body: string) => createHmac("sha256", `${env().authSecret}:meta-oauth`).update(body).digest("base64url");

export function stateCookie(workspaceId: string): { value: string; state: string } {
  const state = randomBytes(24).toString("base64url");
  const body = Buffer.from(JSON.stringify({ workspaceId, state, exp: Date.now() + STATE_TTL_MS })).toString(
    "base64url",
  );
  return { value: `${body}.${sign(body)}`, state };
}

export function readStateCookie(value: string | undefined): State | null {
  if (!value) return null;
  const [body, mac] = value.split(".");
  if (!body || !mac) return null;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const s = State.parse(JSON.parse(Buffer.from(body, "base64url").toString()));
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

/**
 * Real Facebook Login is offered when both posting providers are live and the app is
 * set, or outside production, where the mocks let the whole flow be tried. A production
 * site on the mocks offers only the test Page.
 */
export function metaLoginOffered(): boolean {
  const { providers, metaApp, prod } = env();
  const live = providers.facebook === "live" && providers.instagram === "live";
  if (live) return !!metaApp.appId && !!metaApp.appSecret;
  return !prod && providers.facebook === "mock" && providers.instagram === "mock";
}

export const redirectUri = () => `${env().siteUrl}/api/meta/callback`;

/** Facebook's login dialog. With the mocks there is no Facebook to ask, so the link comes straight back. */
export function authorizeUrl(state: string): string {
  if (facebook().mode === "mock") return `${redirectUri()}?${new URLSearchParams({ code: "mock-code", state })}`;
  const { appId, loginConfigId, graphVersion } = env().metaApp;
  const q = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri(), state, response_type: "code" });
  if (loginConfigId) {
    q.set("config_id", loginConfigId);
    // Login for Business answers with a token unless asked for a code
    q.set("override_default_response_type", "true");
  } else q.set("scope", SCOPES.join(","));
  return `https://www.facebook.com/${graphVersion}/dialog/oauth?${q}`;
}

export type MetaConnectError = "noPages" | "failed";

/**
 * Spends the code, lists the Pages and saves them. The Page reels post to is the one
 * chosen before if it's still there, else the first with Instagram, else the first.
 */
export async function finishLogin(workspaceId: string, code: string): Promise<MetaConnectError | null> {
  const ws = forWorkspace(workspaceId);
  const ctx = { workspaceId, jobId: null, step: "connect" };
  const userToken = await facebook().exchangeCode(ctx, { code, redirectUri: redirectUri() });
  const [pages, catalogs] = await Promise.all([facebook().pages(ctx, userToken), facebook().catalogs(ctx, userToken)]);
  if (!pages.length) return "noPages";

  const previous = (await ws.storeConnection("meta"))?.settings_json as {
    pageId?: string;
    catalogId?: string | null;
  } | null;
  // the catalog chosen before, while it's still there; a seller with just one gets it chosen
  const found = catalogs ?? [];
  const catalogId = found.find((c) => c.id === previous?.catalogId)?.id ?? (found.length === 1 ? found[0]!.id : null);
  const chosen = pages.find((p) => p.id === previous?.pageId) ?? pages.find((p) => p.instagram) ?? pages[0]!;
  await ws.saveConnection("meta", {
    baseUrl: null,
    credentialsEnc: encryptPageTokens({ ...Object.fromEntries(pages.map((p) => [p.id, p.token])), user: userToken }),
    checks: null,
    settings: {
      ...settingsFor(choiceOf(chosen), pages.map(choiceOf)),
      catalogs: found,
      catalogId,
      catalogAccess: catalogs !== null,
    },
  });
  return null;
}

export const choiceOf = (p: MetaPage): MetaPageChoice => ({
  id: p.id,
  name: p.name,
  igUserId: p.instagram?.id ?? null,
  igUsername: p.instagram?.username ?? null,
});

export function settingsFor(
  c: MetaPageChoice,
  pages: MetaPageChoice[],
  catalogs: Pick<MetaSettings, "catalogs" | "catalogId" | "catalogAccess"> = {
    catalogs: [],
    catalogId: null,
    catalogAccess: false,
  },
): MetaSettings {
  return {
    pageId: c.id,
    pageName: c.name,
    igUserId: c.igUserId,
    igUsername: c.igUsername,
    test: false,
    pages,
    ...catalogs,
  };
}
