"use server";

import { refresh } from "next/cache";
import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { ShopifySettings } from "@/lib/shopify-connection";
import { StoreKind } from "@/lib/stores";
import { WooSettings } from "@/lib/woo-connection";

/** "Save new drafts here", per store, for a shop with more than one. */
export async function setSaveDrafts(form: FormData): Promise<void> {
  const viewer = await requireWorkspace();
  const kind = StoreKind.safeParse(form.get("kind"));
  if (!kind.success) return;
  const ws = forWorkspace(viewer.workspace.id);
  const row = await ws.storeConnection(kind.data);
  if (!row) return;
  const settings = (kind.data === "woo" ? WooSettings : ShopifySettings).parse(row.settings_json ?? {});
  await ws.setConnectionSettings(kind.data, { ...settings, saveDrafts: form.get("on") === "1" });
  refresh();
}
