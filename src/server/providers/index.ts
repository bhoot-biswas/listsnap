import "server-only";
import { env } from "@/server/env";
import { mockMeta } from "./meta/mock";
import { liveMeta } from "./meta/live";
import { mockWoo } from "./woo/mock";
import { liveWoo } from "./woo/live";
import { mockInstagram } from "./ig/mock";
import { mockVideo } from "./video/mock";
import { liveVideo } from "./video/live";
import type { InstagramProvider, MetaProvider, VideoProvider, WooProvider } from "./types";

export type { CallContext, MetaProvider, WooProvider, WooStore, InstagramProvider, VideoProvider } from "./types";

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

export function woo(): WooProvider {
  return env().providers.woo === "live" ? liveWoo : mockWoo;
}

/** Reels: live renders with the HyperFrames CLI on this server; mock returns a placeholder clip. */
export function video(): VideoProvider {
  return env().providers.video === "live" ? liveVideo : mockVideo;
}

export function instagram(): InstagramProvider {
  if (env().providers.instagram === "live") throw new NotBuiltYet("Instagram", "PROVIDER_MODE_INSTAGRAM", "Phase 6");
  return mockInstagram;
}
