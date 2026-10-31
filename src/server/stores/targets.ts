import "server-only";
import { forWorkspace } from "@/server/db/scope";
import type { Workspace } from "@/server/db/workspaces";
import { woo } from "@/server/providers";
import { ShopifySettings } from "@/lib/shopify-connection";
import { WooSettings } from "@/lib/woo-connection";
import type { StoreKind } from "@/lib/stores";

/**
 * The stores a shop has, and which of them new drafts go to. A shop can connect
 * WooCommerce and Shopify at once; each can be switched off for new drafts without
 * disconnecting it.
 */

export interface ConnectedStore {
  kind: StoreKind;
  /** The store's address, or null for our demo store. */
  address: string | null;
  demo: boolean;
  broken: boolean;
  saveDrafts: boolean;
}

export async function connectedStores(workspace: Workspace): Promise<ConnectedStore[]> {
  // demo shops always save to our WooCommerce test store
  if (workspace.isDemo) return [{ kind: "woo", address: null, demo: true, broken: false, saveDrafts: true }];
  const rows = await forWorkspace(workspace.id).liveStoreConnections();
  return rows.map((r) => {
    const settings = (r.kind === "woo" ? WooSettings : ShopifySettings).parse(r.settings_json ?? {});
    return {
      kind: r.kind,
      address: settings.demo ? null : (r.base_url?.replace(/^https?:\/\//, "") ?? null),
      demo: settings.demo,
      broken: r.status === "broken",
      saveDrafts: settings.saveDrafts,
    };
  });
}

/** Where "Save as draft" sends a listing. */
export async function storeTargets(workspace: Workspace): Promise<StoreKind[]> {
  const stores = await connectedStores(workspace);
  // in mock mode a shop with no store at all can still try the flow
  if (!stores.length && woo().mode === "mock") return ["woo"];
  return stores.filter((s) => s.saveDrafts).map((s) => s.kind);
}
