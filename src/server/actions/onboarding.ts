"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/server/auth/session";
import { markOnboarded } from "@/server/db/workspaces";

const Form = z.object({ name: z.string().trim().min(2).max(80) });

export type OnboardingState = { error: "name" | null };

/**
 * Phase 1 onboarding: the shop name only. The WooCommerce and Instagram steps join
 * this wizard in Phase 2. Re-checks the session; layouts don't.
 */
export async function finishOnboarding(_prev: OnboardingState, form: FormData): Promise<OnboardingState> {
  const viewer = await requireWorkspace({ allowOnboarding: true });
  const parsed = Form.safeParse({ name: form.get("name") });
  if (!parsed.success) return { error: "name" };
  await markOnboarded(viewer.workspace.id, parsed.data.name);
  redirect("/dashboard");
}
