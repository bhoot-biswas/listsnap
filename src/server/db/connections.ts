import "server-only";
import { execute, json, selectOne } from "./pool";

/**
 * Store and Instagram connections, bound to one workspace. Spread into forWorkspace().
 * Credentials arrive here already encrypted and leave still encrypted.
 */

export type ConnectionKind = "woo" | "instagram";
export type ConnectionStatus = "connected" | "broken" | "disconnected";

export interface ConnectionRow {
  base_url: string | null;
  credentials_enc: string | null;
  status: ConnectionStatus;
  checks_json: unknown;
  settings_json: unknown;
  last_checked_at: Date | null;
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
