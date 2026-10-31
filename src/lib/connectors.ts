import { z } from "zod";
import type { StoreKind } from "./stores";

/**
 * The services a shop can connect, in the order Connections lists them. The list, the
 * detail pages and the dashboard all read from here, so a third store is one entry.
 */
export const SERVICES = ["woo", "shopify", "meta"] as const;
export const Service = z.enum(SERVICES);
export type Service = z.infer<typeof Service>;

export type ServiceGroup = "store" | "social";

export const SERVICE_GROUP: Record<Service, ServiceGroup> = { woo: "store", shopify: "store", meta: "social" };

export const isStore = (s: Service): s is StoreKind => SERVICE_GROUP[s] === "store";

/** How a connection is doing, as its pill shows it. */
export type ServiceStatus = "connected" | "broken" | "demo" | "test" | "none";

export const serviceHref = (s: Service) => `/connections/${s}` as const;
