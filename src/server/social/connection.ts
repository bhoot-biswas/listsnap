import "server-only";
import { z } from "zod";
import { decryptSecret, encryptSecret } from "@/server/crypto";
import type { WorkspaceScope } from "@/server/db/scope";
import type { SocialAccount } from "@/server/providers";
import { MetaSettings, type Destination } from "@/lib/schemas/social";

/**
 * The seller's Facebook Page and linked Instagram account, read from the "meta"
 * connection. Page tokens are decrypted only here, on the server, for one call.
 */
export interface MetaConnection {
  settings: MetaSettings;
  /** The account each destination posts as; null when that destination isn't linked. */
  account: (destination: Destination) => SocialAccount | null;
  /**
   * The seller's own token, which catalogs need (a Page token can't reach them). It lasts
   * about 60 days; after that Meta refuses it and the seller connects again.
   */
  userToken: () => string | null;
}

// a login keeps every Page's token, so switching Page needs no new login; "user" is the seller's own
const PageTokens = z.record(z.string(), z.string());
const USER_KEY = "user";

export const encryptPageTokens = (tokens: Record<string, string>) => encryptSecret(JSON.stringify(tokens));

/** A token from the map: a Page's by its id, or the seller's own. A test connection stores a single made-up token instead. */
function pageToken(enc: string, pageId: string): string | null {
  const plain = decryptSecret(enc);
  if (!plain.startsWith("{")) return plain;
  const tokens = PageTokens.safeParse(JSON.parse(plain));
  return tokens.success ? (tokens.data[pageId] ?? null) : null;
}

export async function metaConnection(ws: WorkspaceScope): Promise<MetaConnection | null> {
  const row = await ws.storeConnection("meta");
  const settings = MetaSettings.safeParse(row?.settings_json);
  if (!row || row.status !== "connected" || !row.credentials_enc || !settings.success) return null;
  const s = settings.data;
  const enc = row.credentials_enc;
  const token = () => pageToken(enc, s.pageId);
  return {
    settings: s,
    userToken: () => (s.test ? null : pageToken(enc, USER_KEY)),
    account: (destination) => {
      const t = token();
      if (!t) return null;
      if (destination === "facebook") return { id: s.pageId, name: s.pageName, token: t };
      return s.igUserId && s.igUsername ? { id: s.igUserId, name: s.igUsername, token: t } : null;
    },
  };
}

/**
 * The catalog listings can be saved to right now, or null: it needs the seller's token
 * with catalog access, a chosen catalog, and the shop's website (Meta links items to it).
 */
export function readyCatalog(c: MetaConnection | null, website: string | null): { id: string; name: string } | null {
  if (!c?.userToken() || !c.settings.catalogAccess || !website) return null;
  return c.settings.catalogs.find((x) => x.id === c.settings.catalogId) ?? null;
}

/** What the browser may know about the connection: names only, never the token. */
export function publicMeta(c: MetaConnection | null) {
  return c ? { pageName: c.settings.pageName, igUsername: c.settings.igUsername, test: c.settings.test } : null;
}
