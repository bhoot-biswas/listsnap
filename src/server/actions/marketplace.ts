"use server";

import { z } from "zod";
import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { setMarketplaceLang } from "@/server/db/workspaces";
import { MarketplaceLink } from "@/lib/marketplace";

const Posted = z.object({ listingId: z.uuid(), posted: z.boolean(), url: MarketplaceLink.optional() });

export type MarketplacePostedResult = { ok: true } | { ok: false; error: "invalid" | "link" | "not_found" };

/** "I posted it" on the Marketplace card, or undoing it. The link is optional. */
export async function setMarketplacePosted(input: unknown): Promise<MarketplacePostedResult> {
  const viewer = await requireWorkspace();
  const parsed = Posted.safeParse(input);
  if (!parsed.success) {
    const badLink = parsed.error.issues.some((i) => i.path[0] === "url");
    return { ok: false, error: badLink ? "link" : "invalid" };
  }
  const { listingId, posted, url } = parsed.data;
  const done = await forWorkspace(viewer.workspace.id).setMarketplacePosted(
    listingId,
    posted ? { url: url ?? null } : null,
  );
  return done ? { ok: true } : { ok: false, error: "not_found" };
}

/** The card opens in the language the seller picked last. */
export async function rememberMarketplaceLang(lang: unknown): Promise<void> {
  const viewer = await requireWorkspace();
  const parsed = z.enum(["en", "bn"]).safeParse(lang);
  if (parsed.success) await setMarketplaceLang(viewer.workspace.id, parsed.data);
}
