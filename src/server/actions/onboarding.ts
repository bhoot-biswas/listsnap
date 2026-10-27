"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/server/auth/session";
import { renameWorkspace } from "@/server/db/workspaces";

const Form = z.object({ name: z.string().trim().min(2).max(80) });

export type OnboardingState = { error: "name" | null };

/**
 * Onboarding step 1, the shop name. Onboarding is marked done only once a store is
 * connected (or the demo store chosen), in actions/woo-connection.ts. Re-checks the
 * session; layouts don't.
 */
export async function saveShopName(_prev: OnboardingState, form: FormData): Promise<OnboardingState> {
  const viewer = await requireWorkspace({ allowOnboarding: true });
  const parsed = Form.safeParse({ name: form.get("name") });
  if (!parsed.success) return { error: "name" };
  await renameWorkspace(viewer.workspace.id, parsed.data.name);
  redirect("/onboarding?step=store");
}
