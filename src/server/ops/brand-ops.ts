import "server-only";
import { saveWorkspaceSettings } from "@/server/db/workspaces";
import { BrandKit } from "@/lib/schemas/brand-kit";
import { defineOp } from "./define-op";

/**
 * The shop's brand kit. The setting photo must be a brand photo already uploaded to this
 * shop: an id from another shop, or a listing photo, is refused rather than borrowed.
 */
export const setBrandKit = defineOp({
  name: "setBrandKit",
  description:
    "Set the shop's brand kit for AI photos: up to three brand colours as hex codes, and the id of an uploaded photo of the shop to set lifestyle photos in (or null for none). Replaces the whole kit.",
  input: BrandKit,
  effect: "edits_draft",
  async run({ workspace, ws }, kit) {
    if (kit.settingMediaId && (await ws.mediaKind(kit.settingMediaId)) !== "brand")
      return { ok: false, error: "not_found", message: "That shop photo isn't in your shop." };
    await saveWorkspaceSettings(workspace.id, workspace.name, { ...workspace.settings, brandKit: kit });
    const parts = [
      kit.colors.length ? `${kit.colors.length} colour(s)` : "no colours",
      kit.settingMediaId ? "setting photo" : "no photo",
    ];
    return { ok: true, value: { brandKit: kit }, summary: parts.join(", ") };
  },
});
