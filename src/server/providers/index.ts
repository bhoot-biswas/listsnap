import "server-only";
import { env } from "@/server/env";
import { mockMeta } from "./meta/mock";
import { mockWoo } from "./woo/mock";
import { mockInstagram } from "./ig/mock";
import type { InstagramProvider, MetaProvider, WooProvider } from "./types";

export type { CallContext, MetaProvider, WooProvider, InstagramProvider } from "./types";

/** Thrown when a provider is set to live before its live client exists. */
class NotBuiltYet extends Error {
  constructor(name: string, envVar: string, phase: string) {
    super(`The live ${name} client arrives in ${phase}. Set ${envVar}=mock for now.`);
  }
}

/**
 * Picks mock or live per provider from PROVIDER_MODE_*. Live clients land in later
 * phases (Meta in Phase 2/3, WooCommerce in Phase 2, Instagram in Phase 6); until then
 * asking for one fails loudly instead of quietly falling back to fake data.
 */
export function meta(): MetaProvider {
  if (env().providers.meta === "live") throw new NotBuiltYet("Meta Model API", "PROVIDER_MODE_META", "Phase 2");
  return mockMeta;
}

export function woo(): WooProvider {
  if (env().providers.woo === "live") throw new NotBuiltYet("WooCommerce", "PROVIDER_MODE_WOO", "Phase 2");
  return mockWoo;
}

export function instagram(): InstagramProvider {
  if (env().providers.instagram === "live") throw new NotBuiltYet("Instagram", "PROVIDER_MODE_INSTAGRAM", "Phase 6");
  return mockInstagram;
}
