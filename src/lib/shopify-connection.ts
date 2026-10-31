import { z } from "zod";

/**
 * The Shopify connection as the browser sees it: checks carry ids and reasons, not
 * sentences, so each language writes its own words for them. Tokens never come here.
 */

export type ShopifyCheckId = "reach" | "scopes" | "location" | "currency";
export type ShopifyCheckStatus = "pass" | "warn" | "fail";
export type ShopifyCheckReason = "unreachable" | "auth" | "scopes" | "no_location" | "currency" | "server";

export interface ShopifyCheck {
  id: ShopifyCheckId;
  status: ShopifyCheckStatus;
  reason?: ShopifyCheckReason;
}

export interface ShopifyCheckResult {
  ok: boolean;
  checks: ShopifyCheck[];
  shopName: string | null;
  currency: string | null;
  /** Active locations, where stock can be counted. */
  locations: { id: string; name: string }[];
}

/** Choices saved with a connection. */
export const ShopifySettings = z.object({
  shopName: z.string().nullable().default(null),
  locationId: z.string().nullable().default(null),
  locationName: z.string().nullable().default(null),
  /** The store's active locations at the last check, for the location picker. */
  locations: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
  /** Connected to our demo store instead of the shop's own. */
  demo: z.boolean().default(false),
  /** New drafts go here; off keeps the store connected without saving to it. */
  saveDrafts: z.boolean().default(true),
});
export type ShopifySettings = z.infer<typeof ShopifySettings>;

/** Shopify's own pattern, anchored at both ends, so "x.myshopify.com.evil.example" fails. */
export const SHOP_DOMAIN = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

/**
 * What a seller types to "name.myshopify.com": the bare name, the myshopify address with
 * or without https:// and a path, or the admin link (admin.shopify.com/store/name).
 * Throws when it isn't a Shopify store address. A shop's own domain (myshop.com) can't
 * be used: OAuth needs the myshopify one, which every store has.
 */
export function normaliseShopDomain(input: string): string {
  const raw = input.trim().toLowerCase();
  const admin = raw.match(/^(?:https?:\/\/)?admin\.shopify\.com\/store\/([a-z0-9][a-z0-9-]*)/);
  const host = admin ? `${admin[1]}.myshopify.com` : raw.replace(/^https?:\/\//, "").split(/[/?#]/)[0]!;
  const shop = host.includes(".") ? host : `${host}.myshopify.com`;
  if (!SHOP_DOMAIN.test(shop)) throw new Error("not a myshopify.com address");
  return shop;
}
