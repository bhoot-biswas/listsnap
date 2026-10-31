import "server-only";
import { execute, json, select, selectOne, transaction } from "./pool";
import { storeStep, type StoreKind } from "@/lib/stores";

/**
 * Store and social connections, bound to one workspace. Spread into forWorkspace().
 * Credentials arrive here already encrypted and leave still encrypted.
 */

// "meta" is the seller's Facebook Page together with its linked Instagram account
export type ConnectionKind = StoreKind | "instagram" | "meta";
export type ConnectionStatus = "connected" | "broken" | "disconnected";

export interface ConnectionRow {
  base_url: string | null;
  credentials_enc: string | null;
  status: ConnectionStatus;
  checks_json: unknown;
  settings_json: unknown;
  last_checked_at: Date | null;
}

export interface StoreSaveRow {
  listing_id: string;
  product_ref: string;
  saved_at: Date;
  job_id: string;
  status: string;
  title: string | null;
  title_bn: string | null;
}

export interface StoreFailureRow {
  job_id: string;
  listing_id: string;
  last_error: string | null;
  finished_at: Date | null;
  status: string;
  title: string | null;
  title_bn: string | null;
}

export function connectionQueries(ws: string) {
  return {
    storeConnection: (kind: ConnectionKind) =>
      selectOne<ConnectionRow>(
        "SELECT base_url, credentials_enc, status, checks_json, settings_json, last_checked_at FROM store_connections WHERE workspace_id = ? AND kind = ?",
        [ws, kind],
      ),

    /** One row per kind: connecting again replaces the address, keys, checks and settings. */
    async saveConnection(
      kind: ConnectionKind,
      c: { baseUrl: string | null; credentialsEnc: string | null; checks: unknown; settings: unknown },
    ) {
      await execute(
        `INSERT INTO store_connections (id, workspace_id, kind, base_url, credentials_enc, status, checks_json, settings_json, last_checked_at)
         VALUES (UUID(), ?, ?, ?, ?, 'connected', ?, ?, UTC_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE base_url = VALUES(base_url), credentials_enc = VALUES(credentials_enc), status = 'connected',
           checks_json = VALUES(checks_json), settings_json = VALUES(settings_json), last_checked_at = UTC_TIMESTAMP(3)`,
        [ws, kind, c.baseUrl, c.credentialsEnc, json(c.checks), json(c.settings)],
      );
      await execute("INSERT INTO events (workspace_id, type, ref_id) VALUES (?, 'connection_saved', ?)", [ws, kind]);
    },

    async setConnectionChecks(kind: ConnectionKind, status: "connected" | "broken", checks: unknown) {
      await execute(
        "UPDATE store_connections SET status = ?, checks_json = ?, last_checked_at = UTC_TIMESTAMP(3) WHERE workspace_id = ? AND kind = ? AND status <> 'disconnected'",
        [status, json(checks), ws, kind],
      );
    },

    async setConnectionSettings(kind: ConnectionKind, settings: unknown) {
      await execute("UPDATE store_connections SET settings_json = ? WHERE workspace_id = ? AND kind = ?", [
        json(settings),
        ws,
        kind,
      ]);
    },

    /** The shop's store connections that aren't disconnected, WooCommerce first. */
    liveStoreConnections: () =>
      select<ConnectionRow & { kind: StoreKind }>(
        "SELECT kind, base_url, credentials_enc, status, checks_json, settings_json, last_checked_at FROM store_connections WHERE workspace_id = ? AND kind IN ('woo', 'shopify') AND status <> 'disconnected' ORDER BY kind = 'shopify'",
        [ws],
      ),

    /** The drafts most recently saved to one store, newest first, for its Connections page. */
    recentStoreSaves: (kind: StoreKind, limit = 5) =>
      select<StoreSaveRow>(
        `SELECT p.listing_id, p.product_ref, p.saved_at, l.job_id, l.status,
                JSON_UNQUOTE(JSON_EXTRACT(l.fields_json, '$.en.title')) AS title,
                JSON_UNQUOTE(JSON_EXTRACT(l.fields_json, '$.bn.title')) AS title_bn
           FROM listing_store_products p
           JOIN listings l ON l.id = p.listing_id AND l.workspace_id = p.workspace_id
          WHERE p.workspace_id = ? AND p.kind = ?
          ORDER BY p.saved_at DESC LIMIT ?`,
        [ws, kind, limit],
      ),

    /** The last save to one store that failed, with the listing it was for. */
    lastStoreFailure: (kind: StoreKind) =>
      selectOne<StoreFailureRow>(
        `SELECT s.job_id, s.target AS listing_id, s.last_error, s.finished_at, l.status,
                JSON_UNQUOTE(JSON_EXTRACT(l.fields_json, '$.en.title')) AS title,
                JSON_UNQUOTE(JSON_EXTRACT(l.fields_json, '$.bn.title')) AS title_bn
           FROM job_steps s
           JOIN listings l ON l.id = s.target AND l.workspace_id = s.workspace_id
          WHERE s.workspace_id = ? AND s.step = ? AND s.status = 'failed'
          ORDER BY s.finished_at DESC LIMIT 1`,
        [ws, storeStep(kind)],
      ),

    /**
     * Swaps a connection's credentials while holding its row, for tokens that rotate:
     * `fn` gets what is saved now and returns what to save (null keeps it). Two saves
     * refreshing at once would otherwise both spend the same refresh token.
     */
    async rotateCredentials<T>(
      kind: ConnectionKind,
      fn: (credentialsEnc: string | null) => Promise<{ save: string | null; value: T }>,
    ): Promise<T> {
      return transaction(async (conn) => {
        const [rows] = await conn.query(
          "SELECT credentials_enc FROM store_connections WHERE workspace_id = ? AND kind = ? FOR UPDATE",
          [ws, kind],
        );
        const current = (rows as { credentials_enc: string | null }[])[0]?.credentials_enc ?? null;
        const { save, value } = await fn(current);
        if (save !== null)
          await conn.query("UPDATE store_connections SET credentials_enc = ? WHERE workspace_id = ? AND kind = ?", [
            save,
            ws,
            kind,
          ]);
        return value;
      });
    },

    /** Another shop already connected to this store address, if any. */
    otherShopWithStore: (kind: StoreKind, baseUrl: string) =>
      selectOne<{ workspace_id: string }>(
        "SELECT workspace_id FROM store_connections WHERE kind = ? AND base_url = ? AND workspace_id <> ? AND status <> 'disconnected' LIMIT 1",
        [kind, baseUrl, ws],
      ),

    /** Forgets the keys. Drafts already in the store stay there. */
    async disconnect(kind: ConnectionKind) {
      await execute(
        "UPDATE store_connections SET status = 'disconnected', credentials_enc = NULL, checks_json = NULL WHERE workspace_id = ? AND kind = ?",
        [ws, kind],
      );
      await execute("INSERT INTO events (workspace_id, type, ref_id) VALUES (?, 'connection_removed', ?)", [ws, kind]);
    },
  };
}

/*
 * Shopify's webhooks name a store, not a shop, so these few queries find shops by
 * store address. They run only after the webhook's signature has been checked.
 */

/** False when this delivery was handled before (Shopify retries ones it thinks failed). */
export async function firstWebhookDelivery(webhookId: string, topic: string, shop: string): Promise<boolean> {
  const r = await execute("INSERT IGNORE INTO shopify_webhooks (webhook_id, topic, shop) VALUES (?, ?, ?)", [
    webhookId,
    topic,
    shop,
  ]);
  return r.affectedRows === 1;
}

/** The seller removed our app in Shopify: every shop on that store loses its token. */
export async function disconnectShopifyStore(baseUrl: string): Promise<void> {
  const rows = await select<{ workspace_id: string }>(
    "SELECT workspace_id FROM store_connections WHERE kind = 'shopify' AND base_url = ? AND status <> 'disconnected'",
    [baseUrl],
  );
  for (const { workspace_id } of rows) await connectionQueries(workspace_id).disconnect("shopify");
}

/** shop/redact: forget the store entirely, including which listings went to it. */
export async function forgetShopifyStore(baseUrl: string): Promise<void> {
  await execute(
    `DELETE p FROM listing_store_products p
       JOIN store_connections c ON c.workspace_id = p.workspace_id AND c.kind = 'shopify' AND c.base_url = ?
      WHERE p.kind = 'shopify'`,
    [baseUrl],
  );
  await execute("DELETE FROM store_connections WHERE kind = 'shopify' AND base_url = ?", [baseUrl]);
}
