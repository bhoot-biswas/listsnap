import { z } from "zod";

/** The online stores a shop can save drafts to. A shop may connect more than one. */
export const STORE_KINDS = ["woo", "shopify"] as const;
export const StoreKind = z.enum(STORE_KINDS);
export type StoreKind = z.infer<typeof StoreKind>;

/** Each store saves under its own step, so one store failing never hides another's draft. */
export const storeStep = (kind: StoreKind) => `store:${kind}` as const;

export const STORE_NAMES: Record<StoreKind, string> = { woo: "WooCommerce", shopify: "Shopify" };
