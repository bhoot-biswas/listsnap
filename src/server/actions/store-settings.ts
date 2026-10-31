"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { ShopifySettings } from "@/lib/shopify-connection";
import { StoreKind } from "@/lib/stores";
import { WooSettings } from "@/lib/woo-connection";

/**
 * A store's settings on its Connections page, each saved the moment it changes. Only a
 * value from the store's own last check is accepted: a category or location that came
 * from anywhere else is refused.
 */

const Change = z.discriminatedUnion("field", [
  z.object({ field: z.literal("saveDrafts"), kind: StoreKind, value: z.boolean() }),
  z.object({ field: z.literal("category"), kind: z.literal("woo"), value: z.number().int().positive().nullable() }),
  z.object({ field: z.literal("location"), kind: z.literal("shopify"), value: z.string().min(1) }),
]);

export type SaveSettingResult = { ok: boolean };

export async function saveStoreSetting(input: unknown): Promise<SaveSettingResult> {
  const viewer = await requireWorkspace();
  const change = Change.safeParse(input);
  if (!change.success) return { ok: false };
  const c = change.data;
  const ws = forWorkspace(viewer.workspace.id);
  const row = await ws.storeConnection(c.kind);
  if (!row || row.status === "disconnected") return { ok: false };

  if (c.kind === "woo") {
    const settings = WooSettings.parse(row.settings_json ?? {});
    if (c.field === "saveDrafts") {
      await ws.setConnectionSettings("woo", { ...settings, saveDrafts: c.value });
    } else if (c.field === "category") {
      const chosen = c.value === null ? null : settings.categories.find((x) => x.id === c.value);
      if (chosen === undefined) return { ok: false };
      await ws.setConnectionSettings("woo", {
        ...settings,
        defaultCategoryId: chosen?.id ?? null,
        defaultCategoryName: chosen?.name ?? null,
      });
    }
  } else {
    const settings = ShopifySettings.parse(row.settings_json ?? {});
    if (c.field === "saveDrafts") {
      await ws.setConnectionSettings("shopify", { ...settings, saveDrafts: c.value });
    } else if (c.field === "location") {
      const chosen = settings.locations.find((l) => l.id === c.value);
      if (!chosen) return { ok: false };
      await ws.setConnectionSettings("shopify", { ...settings, locationId: chosen.id, locationName: chosen.name });
    }
  }
  refresh();
  return { ok: true };
}
