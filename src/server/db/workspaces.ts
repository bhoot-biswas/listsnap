import "server-only";
import { randomUUID } from "node:crypto";
import { execute, json, selectOne, transaction } from "./pool";

export interface WorkspaceSettings {
  mainCategory: string | null;
  listingLanguages: ("en" | "bn")[];
  brandVoice: "Friendly" | "Professional" | "Playful";
  scenes: ("studio" | "lifestyle" | "banner")[];
  priceRounding: number;
  timeZone: string;
  currency: "BDT";
}

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  mainCategory: null,
  listingLanguages: ["en", "bn"],
  brandVoice: "Friendly",
  scenes: ["studio"],
  priceRounding: 10,
  timeZone: "Asia/Dhaka",
  currency: "BDT",
};

/** What pages and routes get about the current workspace. No secrets, no raw rows. */
export interface Workspace {
  id: string;
  name: string;
  isDemo: boolean;
  expiresAt: Date | null;
  onboarded: boolean;
  settings: WorkspaceSettings;
  limits: { listings: number; images: number };
}

interface WorkspaceRow {
  id: string;
  name: string;
  is_demo: 0 | 1;
  expires_at: Date | null;
  onboarded_at: Date | null;
  settings_json: Partial<WorkspaceSettings> | null;
  daily_listing_limit: number;
  daily_image_limit: number;
}

const toWorkspace = (r: WorkspaceRow): Workspace => ({
  id: r.id,
  name: r.name,
  isDemo: !!r.is_demo,
  expiresAt: r.expires_at,
  // demo shops skip onboarding
  onboarded: !!r.onboarded_at || !!r.is_demo,
  settings: { ...DEFAULT_SETTINGS, ...(r.settings_json ?? {}) },
  limits: { listings: r.daily_listing_limit, images: r.daily_image_limit },
});

const DEMO_HOURS = 24;

/**
 * Called once from Better Auth's user.create hook. Anonymous ("Try the demo") users
 * get a demo shop that expires after 24 hours; everyone else gets an empty shop and
 * goes through onboarding. One workspace per user for now.
 */
export async function createWorkspaceForUser(userId: string, opts: { demo: boolean; name?: string }): Promise<string> {
  const id = randomUUID();
  await transaction(async (conn) => {
    await conn.query(
      "INSERT INTO workspaces (id, name, is_demo, expires_at, settings_json) VALUES (?, ?, ?, " +
        (opts.demo ? `UTC_TIMESTAMP(3) + INTERVAL ${DEMO_HOURS} HOUR` : "NULL") +
        ", ?)",
      [id, opts.name ?? (opts.demo ? "Demo shop" : "My shop"), opts.demo, json(DEFAULT_SETTINGS)],
    );
    await conn.query("INSERT INTO memberships (user_id, workspace_id, role) VALUES (?, ?, 'owner')", [userId, id]);
  });
  return id;
}

export async function workspaceForUser(userId: string): Promise<Workspace | null> {
  const row = await selectOne<WorkspaceRow>(
    `SELECT w.id, w.name, w.is_demo, w.expires_at, w.onboarded_at, w.settings_json, w.daily_listing_limit, w.daily_image_limit
       FROM memberships m JOIN workspaces w ON w.id = m.workspace_id
      WHERE m.user_id = ? AND (w.expires_at IS NULL OR w.expires_at > UTC_TIMESTAMP(3))
      ORDER BY m.created_at LIMIT 1`,
    [userId],
  );
  return row ? toWorkspace(row) : null;
}

export async function markOnboarded(workspaceId: string, name?: string): Promise<void> {
  await execute(
    "UPDATE workspaces SET onboarded_at = COALESCE(onboarded_at, UTC_TIMESTAMP(3)), name = COALESCE(?, name) WHERE id = ?",
    [name ?? null, workspaceId],
  );
}

export async function renameWorkspace(workspaceId: string, name: string): Promise<void> {
  await execute("UPDATE workspaces SET name = ? WHERE id = ?", [name, workspaceId]);
}
