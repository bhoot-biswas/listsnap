import "server-only";
import { forWorkspace } from "@/server/db/scope";
import type { Workspace } from "@/server/db/workspaces";
import { metaConnection } from "@/server/social/connection";
import { shopifyOffered } from "@/server/stores/shopify-connect";
import { SERVICES, SERVICE_GROUP, type Service, type ServiceGroup, type ServiceStatus } from "@/lib/connectors";
import { ShopifySettings } from "@/lib/shopify-connection";
import { WooSettings } from "@/lib/woo-connection";

/**
 * One line per service for Connections and the dashboard: whether it's connected, how
 * it's doing, and its address. Nothing secret; it's safe to render as it is.
 */
export interface ServiceOverview {
  service: Service;
  group: ServiceGroup;
  status: ServiceStatus;
  /** The store's address or the Page's name; null for a demo store or when not connected. */
  address: string | null;
  /** For a connected store: whether new drafts go there. */
  saveDrafts: boolean | null;
  checkedAt: Date | null;
}

export interface ConnectionsOverview {
  services: ServiceOverview[];
  /** Two stores are connected, so each can be left out of new drafts. */
  severalStores: boolean;
}

const bare = (url: string | null) => url?.replace(/^https?:\/\//, "") ?? null;

export async function connectionsOverview(workspace: Workspace): Promise<ConnectionsOverview> {
  const ws = forWorkspace(workspace.id);
  // demo shops always save to our WooCommerce test store and can't connect another
  const [stores, meta] = await Promise.all([workspace.isDemo ? [] : ws.liveStoreConnections(), metaConnection(ws)]);

  const services = SERVICES.flatMap((service): ServiceOverview[] => {
    const group = SERVICE_GROUP[service];
    if (service === "meta") {
      const s = meta?.settings;
      return [
        {
          service,
          group,
          status: !s ? "none" : s.test ? "test" : "connected",
          address: s?.pageName ?? null,
          saveDrafts: null,
          checkedAt: null,
        },
      ];
    }
    if (workspace.isDemo) {
      if (service !== "woo") return [];
      return [{ service, group, status: "demo", address: null, saveDrafts: true, checkedAt: null }];
    }
    const row = stores.find((r) => r.kind === service);
    if (!row && service === "shopify" && !shopifyOffered()) return [];
    if (!row) return [{ service, group, status: "none", address: null, saveDrafts: null, checkedAt: null }];
    const settings = (service === "woo" ? WooSettings : ShopifySettings).parse(row.settings_json ?? {});
    return [
      {
        service,
        group,
        status: row.status === "broken" ? "broken" : settings.demo ? "demo" : "connected",
        address: settings.demo ? null : bare(row.base_url),
        saveDrafts: settings.saveDrafts,
        checkedAt: row.last_checked_at,
      },
    ];
  });

  return { services, severalStores: stores.length > 1 };
}
