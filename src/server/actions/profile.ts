"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuth } from "@/server/auth/auth";
import { requireWorkspace } from "@/server/auth/session";

const Profile = z.object({
  name: z.string().trim().min(1).max(80),
  // optional; digits, spaces, dashes and a leading + are enough for a Bangladeshi number
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 -]{0,20}$/),
});

export type ProfileState = { status: "idle" | "saved" | "invalid"; field?: "name" | "phone" };

/** Name and phone. The email comes from sign-in and can't be changed here. */
export async function saveProfile(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const viewer = await requireWorkspace();
  if (viewer.user.isDemo) return { status: "invalid" };
  const parsed = Profile.safeParse({ name: form.get("name") ?? "", phone: form.get("phone") ?? "" });
  if (!parsed.success) return { status: "invalid", field: parsed.error.issues[0]?.path[0] as "name" | "phone" };
  await getAuth().api.updateUser({ headers: await headers(), body: parsed.data });
  revalidatePath("/", "layout");
  return { status: "saved" };
}

/** Signs out one other device. The page only knows session ids; the token never leaves the server. */
export async function signOutDevice(sessionId: string): Promise<void> {
  await requireWorkspace();
  const h = await headers();
  const sessions = await getAuth().api.listSessions({ headers: h });
  const target = sessions.find((s) => s.id === sessionId);
  if (target) await getAuth().api.revokeSession({ headers: h, body: { token: target.token } });
  revalidatePath("/profile");
}

export async function signOutOtherDevices(): Promise<void> {
  await requireWorkspace();
  await getAuth().api.revokeOtherSessions({ headers: await headers() });
  revalidatePath("/profile");
}

/** The theme follows the person to other devices, like the UI language. */
export async function saveTheme(theme: string): Promise<void> {
  const parsed = z.enum(["light", "dark", "system"]).safeParse(theme);
  const viewer = await requireWorkspace();
  if (!parsed.success || viewer.user.isDemo) return;
  await getAuth().api.updateUser({ headers: await headers(), body: { theme: parsed.data } });
}
