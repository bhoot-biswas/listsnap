import "server-only";
import { randomUUID } from "node:crypto";
import { BrandKit, EMPTY_BRAND_KIT } from "@/lib/schemas/brand-kit";
import { execute, json, selectOne, transaction } from "./pool";

export interface WorkspaceSettings {
  mainCategory: string | null;
  listingLanguages: ("en" | "bn")[];
  brandVoice: "Friendly" | "Professional" | "Playful";
  /** A short standing instruction for the writer, such as "always mention handmade". */
  brandNote: string | null;
  scenes: ("studio" | "lifestyle" | "banner")[];
  priceRounding: number;
  timeZone: string;
  currency: "BDT";
  brandKit: BrandKit;
  /** The shop's website or Facebook Page; exported catalog files link each product to it. */
  website: string | null;
  /** The language last picked on Review's Marketplace card, so it opens in it next time. */
  marketplaceLang: "en" | "bn" | null;
}

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  mainCategory: null,
  listingLanguages: ["en", "bn"],
  brandVoice: "Friendly",
  brandNote: null,
  scenes: ["studio"],
  priceRounding: 10,
  timeZone: "Asia/Dhaka",
  currency: "BDT",
  brandKit: EMPTY_BRAND_KIT,
  website: null,
  marketplaceLang: null,
};

/** The tone and note the writer gets with every listing and AI help call. */
export const brandVoice = (s: WorkspaceSettings) => ({ tone: s.brandVoice, note: s.brandNote });

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
  settings: {
    ...DEFAULT_SETTINGS,
    ...(r.settings_json ?? {}),
    // stored JSON from before the kit existed, or edited by hand, must not break renders
    brandKit: BrandKit.safeParse(r.settings_json?.brandKit).data ?? EMPTY_BRAND_KIT,
  },
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

/** Settings replace the stored ones whole: the form always sends every field. */
export async function saveWorkspaceSettings(workspaceId: string, name: string, settings: WorkspaceSettings) {
  await execute("UPDATE workspaces SET name = ?, settings_json = ? WHERE id = ?", [name, json(settings), workspaceId]);
}

/**
 * Deletes the shops this user is the only member of, for account deletion. Every row of
 * a shop goes with it (the foreign keys cascade); the ids come back so the media folders
 * can be removed too. A shop someone else also belongs to is left alone.
 */
/** Remembers one small choice without rewriting the rest of the settings the Settings page owns. */
export async function setMarketplaceLang(workspaceId: string, lang: "en" | "bn"): Promise<void> {
  await execute(
    "UPDATE workspaces SET settings_json = JSON_SET(COALESCE(settings_json, '{}'), '$.marketplaceLang', ?) WHERE id = ?",
    [lang, workspaceId],
  );
}

export async function deleteSoleWorkspaces(userId: string): Promise<string[]> {
  return transaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT m.workspace_id AS id FROM memberships m
        WHERE m.user_id = ?
          AND NOT EXISTS (SELECT 1 FROM memberships o WHERE o.workspace_id = m.workspace_id AND o.user_id <> m.user_id)
        FOR UPDATE`,
      [userId],
    );
    const ids = (rows as { id: string }[]).map((r) => r.id);
    if (ids.length) await conn.query(`DELETE FROM workspaces WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
    return ids;
  });
}
