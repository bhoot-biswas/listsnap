"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/server/auth/session";
import { saveWorkspaceSettings } from "@/server/db/workspaces";
import { settingsFromForm } from "@/lib/schemas/settings";

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
  });
  // the shop name shows in the sidebar on every page
  revalidatePath("/", "layout");
  return { status: "saved" };
}
