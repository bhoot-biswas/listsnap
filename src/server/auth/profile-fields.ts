import "server-only";
import { z } from "zod";

/**
 * What a person may store on their own user row. Better Auth's /update-user endpoint
 * accepts these from the browser directly, so the auth hooks check every write against
 * this too, not only the profile form.
 */
export const ProfileFields = z.object({
  name: z.string().trim().min(1).max(80),
  // optional; digits, spaces, dashes and a leading + are enough for a Bangladeshi number
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 -]{0,20}$/),
  theme: z.enum(["light", "dark", "system"]),
  uiLang: z.enum(["en", "bn"]),
});

const EXTRA = ["phone", "theme", "uiLang"] as const;
const Extra = ProfileFields.pick({ phone: true, theme: true, uiLang: true }).partial();

/**
 * The extra fields in a user write, checked; null when one isn't allowed. The name is left
 * to Better Auth: Google sets it on sign-in, and a long one there mustn't block signing in.
 */
export function checkUserWrite(data: Record<string, unknown>) {
  const picked = Object.fromEntries(EXTRA.filter((k) => data[k] != null).map((k) => [k, data[k]]));
  const parsed = Extra.safeParse(picked);
  return parsed.success ? parsed.data : null;
}
