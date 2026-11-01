"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/server/auth/session";
import { saveWorkspaceSettings } from "@/server/db/workspaces";
import { settingsFromForm } from "@/lib/schemas/settings";
import { brandKitFromForm } from "@/lib/schemas/brand-kit";
import { ops } from "@/server/ops";

export type SettingsState = { status: "idle" | "saved" | "invalid"; field?: string };

/** Saves the Settings form. New listings use it straight away; ones already written keep their text. */
export async function saveSettings(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const viewer = await requireWorkspace();
  const parsed = settingsFromForm(form);
  if (!parsed.success) return { status: "invalid", field: String(parsed.error.issues[0]?.path[0] ?? "") };
  const f = parsed.data;
  await saveWorkspaceSettings(viewer.workspace.id, f.name, {
    ...viewer.workspace.settings,
    mainCategory: f.mainCategory,
    brandVoice: f.brandVoice,
    brandNote: f.brandNote,
    scenes: f.scenes,
    priceRounding: f.priceRounding,
    listingLanguages: f.bangla ? ["en", "bn"] : ["en"],
    website: f.website,
  });
  // the shop name shows in the sidebar on every page
  revalidatePath("/", "layout");
  return { status: "saved" };
}

export type BrandKitState = { status: "idle" | "saved" | "invalid" | "photo_missing" };

/** Saves the brand kit. The shop photo was uploaded first; the op checks it belongs to this shop. */
export async function saveBrandKit(_prev: BrandKitState, form: FormData): Promise<BrandKitState> {
  const viewer = await requireWorkspace();
  const parsed = brandKitFromForm(form);
  if (!parsed.success) return { status: "invalid" };
  const r = await ops.setBrandKit.call(viewer.workspace, parsed.data, { via: "ui" });
  if (!r.ok) return { status: r.error === "not_found" ? "photo_missing" : "invalid" };
  revalidatePath("/settings");
  return { status: "saved" };
}
