import "server-only";
import { decryptSecret } from "@/server/crypto";
import type { WorkspaceScope } from "@/server/db/scope";
import type { SocialAccount } from "@/server/providers";
import { MetaSettings, type Destination } from "@/lib/schemas/social";

/**
 * The seller's Facebook Page and linked Instagram account, read from the "meta"
 * connection. The Page token is decrypted only here, on the server, for one call.
 */
export interface MetaConnection {
  settings: MetaSettings;
  /** The account each destination posts as; null when that destination isn't linked. */
  account: (destination: Destination) => SocialAccount | null;
}

export async function metaConnection(ws: WorkspaceScope): Promise<MetaConnection | null> {
  const row = await ws.storeConnection("meta");
  const settings = MetaSettings.safeParse(row?.settings_json);
  if (!row || row.status !== "connected" || !row.credentials_enc || !settings.success) return null;
  const s = settings.data;
  const enc = row.credentials_enc;
  return {
    settings: s,
    account: (destination) =>
      destination === "facebook"
        ? { id: s.pageId, name: s.pageName, token: decryptSecret(enc) }
        : s.igUserId && s.igUsername
          ? { id: s.igUserId, name: s.igUsername, token: decryptSecret(enc) }
          : null,
  };
}

/** What the browser may know about the connection: names only, never the token. */
export function publicMeta(c: MetaConnection | null) {
  return c ? { pageName: c.settings.pageName, igUsername: c.settings.igUsername, test: c.settings.test } : null;
}
