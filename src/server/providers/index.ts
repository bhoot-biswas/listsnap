import "server-only";
import { env } from "@/server/env";
import { mockMeta } from "./meta/mock";
import { liveMeta } from "./meta/live";
import { mockWoo } from "./woo/mock";
import { liveWoo } from "./woo/live";
import { mockShopify } from "./shopify/mock";
import { liveShopify } from "./shopify/live";
import { mockInstagram } from "./ig/mock";
import { mockFacebook } from "./fb/mock";
import { mockVideo } from "./video/mock";
import { mockBaseten } from "./baseten/mock";
import { liveBaseten } from "./baseten/live";
import { liveVideo } from "./video/live";
import type {
  BasetenProvider,
  FacebookProvider,
  InstagramProvider,
  MetaProvider,
  ShopifyProvider,
  VideoProvider,
  WooProvider,
} from "./types";

export type {
  CallContext,
  FacebookProvider,
  InstagramProvider,
  MetaProvider,
  SavedDraft,
  ShopifyProvider,
  ShopifyStore,
  SocialAccount,
  VideoProvider,
  WooProvider,
  WooStore,
} from "./types";

/** Thrown when a provider is set to live before its live client exists. */
class NotBuiltYet extends Error {
  constructor(name: string, envVar: string, phase: string) {
    super(`The live ${name} client arrives in ${phase}. Set ${envVar}=mock for now.`);
  }
}

/**
 * Picks mock or live per provider from PROVIDER_MODE_*. Live clients land in later
 * phases (Instagram in Phase 6); until then asking for one
 * fails loudly instead of quietly falling back to fake data. Live Meta is built call by
 * call; see meta/live.ts for which calls are still mocked.
 */
export function meta(): MetaProvider {
  return env().providers.meta === "live" ? liveMeta : mockMeta;
}

export function baseten(): BasetenProvider {
  return env().providers.baseten === "live" ? liveBaseten : mockBaseten;
}

export function woo(): WooProvider {
  return env().providers.woo === "live" ? liveWoo : mockWoo;
}

export function shopify(): ShopifyProvider {
  return env().providers.shopify === "live" ? liveShopify : mockShopify;
}

/** Reels: live renders with the HyperFrames CLI on this server; mock returns a placeholder clip. */
export function video(): VideoProvider {
  return env().providers.video === "live" ? liveVideo : mockVideo;
}

export function instagram(): InstagramProvider {
  if (env().providers.instagram === "live") throw new NotBuiltYet("Instagram", "PROVIDER_MODE_INSTAGRAM", "Phase R");
  return mockInstagram;
}

export function facebook(): FacebookProvider {
  if (env().providers.facebook === "live") throw new NotBuiltYet("Facebook", "PROVIDER_MODE_FACEBOOK", "Phase R");
  return mockFacebook;
}
