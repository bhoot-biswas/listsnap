"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/server/auth/session";
import { env } from "@/server/env";
import { forWorkspace } from "@/server/db/scope";
import { markOnboarded } from "@/server/db/workspaces";
import { shopify } from "@/server/providers";
import { resolveShopifyStore, shopifySettings } from "@/server/stores/shopify-store";
import { settingsAfterCheck } from "@/server/stores/shopify-connect";
import { ShopifySettings } from "@/lib/shopify-connection";

/**
 * The Shopify card's actions. Connecting itself happens over OAuth (/api/shopify/install
 * and /callback); these use the demo store, re-check and disconnect. Settings save on change
 * through store-settings.ts.
 */

/** "No Shopify store yet? Use our demo store for now." */
export async function connectShopifyDemo(form: FormData): Promise<void> {
  const viewer = await requireWorkspace({ allowOnboarding: true });
  const next = form.get("next") === "onboarding" ? "onboarding" : "connections";
  if (!viewer.workspace.isDemo && (shopify().mode === "mock" || env().demoShopify)) {
    await forWorkspace(viewer.workspace.id).saveConnection("shopify", {
      baseUrl: null,
      credentialsEnc: null,
      checks: [],
      settings: ShopifySettings.parse({ demo: true }),
    });
  }
  if (next === "onboarding") {
    await markOnboarded(viewer.workspace.id);
    redirect("/snap");
  }
  redirect("/connections/shopify");
}

/** "Test now": checks the saved connection, refreshing its token if it's due, and records the result. */
export async function recheckShopify(): Promise<void> {
  const viewer = await requireWorkspace();
  const ws = forWorkspace(viewer.workspace.id);
  const ctx = { workspaceId: viewer.workspace.id, jobId: null, step: "connect" };
  try {
    const { store, settings } = await resolveShopifyStore(viewer.workspace, ctx);
    const result = await shopify().check(ctx, store);
    await ws.setConnectionChecks("shopify", result.ok ? "connected" : "broken", result.checks);
    await ws.setConnectionSettings("shopify", settingsAfterCheck(result, settings));
  } catch (err) {
    console.error("[connect] Shopify re-check failed:", err instanceof Error ? err.message : err);
    await ws.setConnectionChecks("shopify", "broken", [{ id: "reach", status: "fail", reason: "auth" }]);
  }
  refresh();
}

/** Forgets the token; drafts already in Shopify stay there. Removing the app is done in Shopify. */
export async function disconnectShopify(): Promise<void> {
  const viewer = await requireWorkspace();
  if (viewer.workspace.isDemo) return;
  const settings = await shopifySettings(viewer.workspace);
  const ws = forWorkspace(viewer.workspace.id);
  await ws.disconnect("shopify");
  await ws.setConnectionSettings("shopify", { ...settings, demo: false });
  // its page is gone once it is disconnected
  redirect("/connections");
}
