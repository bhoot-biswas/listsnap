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
}

// a login keeps every Page's token, so switching Page needs no new login
const PageTokens = z.record(z.string(), z.string());

export const encryptPageTokens = (tokens: Record<string, string>) => encryptSecret(JSON.stringify(tokens));

/** The token for one Page. A test connection stores a single made-up token instead of a map. */
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
    account: (destination) => {
      const t = token();
      if (!t) return null;
      if (destination === "facebook") return { id: s.pageId, name: s.pageName, token: t };
      return s.igUserId && s.igUsername ? { id: s.igUserId, name: s.igUsername, token: t } : null;
    },
  };
}

/** What the browser may know about the connection: names only, never the token. */
export function publicMeta(c: MetaConnection | null) {
  return c ? { pageName: c.settings.pageName, igUsername: c.settings.igUsername, test: c.settings.test } : null;
}
