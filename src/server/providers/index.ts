import "server-only";
import { env } from "@/server/env";
import { mockMeta } from "./meta/mock";
import { liveMeta } from "./meta/live";
import { mockWoo } from "./woo/mock";
import { liveWoo } from "./woo/live";
import { mockShopify } from "./shopify/mock";
import { liveShopify } from "./shopify/live";
import { mockInstagram } from "./ig/mock";
import { liveInstagram } from "./ig/live";
import { mockFacebook } from "./fb/mock";
import { liveFacebook } from "./fb/live";
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
  MetaPage,
  MetaProvider,
  SavedDraft,
  ShopifyProvider,
  ShopifyStore,
  SocialAccount,
  VideoProvider,
  WooProvider,
  WooStore,
} from "./types";

/**
 * Picks mock or live per provider from PROVIDER_MODE_*. Live Meta is built call by call;
 * see meta/live.ts for which calls are still mocked.
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
  return env().providers.instagram === "live" ? liveInstagram : mockInstagram;
}

export function facebook(): FacebookProvider {
  return env().providers.facebook === "live" ? liveFacebook : mockFacebook;
}
