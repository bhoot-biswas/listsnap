import { z } from "zod";

/**
 * The store connection check, as the browser sees it. Checks carry ids and reasons,
 * not sentences, so each language writes its own words for them.
 */

export type WooCheckId = "https" | "reach" | "read" | "write" | "color";
export type WooCheckStatus = "pass" | "warn" | "fail";
export type WooCheckReason = "http" | "private" | "unreachable" | "not_woo" | "server" | "keys" | "read_only";

export interface WooCheck {
  id: WooCheckId;
  status: WooCheckStatus;
  reason?: WooCheckReason;
}

export interface WooCheckResult {
  ok: boolean;
  checks: WooCheck[];
  categories: { id: number; name: string }[];
}

/** Choices saved with a connection. */
export const WooSettings = z.object({
  defaultCategoryId: z.number().int().positive().nullable().default(null),
  defaultCategoryName: z.string().nullable().default(null),
  /** Connected to the shared demo store instead of the shop's own. */
  demo: z.boolean().default(false),
});
export type WooSettings = z.infer<typeof WooSettings>;

/** What the Connections page shows. Never includes the keys, only their last 4 characters. */
export interface WooConnectionView {
  status: "connected" | "broken" | "disconnected";
  host: string | null;
  keyHint: string | null;
  demo: boolean;
  checks: WooCheck[];
  checkedAt: string | null;
  defaultCategory: string | null;
}

/** "myshop.com/" → "https://myshop.com". Keeps http:// only when typed, so the HTTPS check can flag it. */
export function normaliseStoreUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const u = new URL(withScheme);
  return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`;
}
