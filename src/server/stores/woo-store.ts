import "server-only";
import { z } from "zod";
import { decryptSecret, encryptSecret } from "@/server/crypto";
import { env } from "@/server/env";
import { forWorkspace } from "@/server/db/scope";
import type { Workspace } from "@/server/db/workspaces";
import type { WooStore } from "@/server/providers";
import { StepError } from "@/server/pipeline/run-step";
import { WooSettings } from "@/lib/woo-connection";

/**
 * Which WooCommerce store a shop saves to. Demo shops, and shops that chose "use the
 * demo store for now", share the demo store; everyone else uses their own encrypted
 * connection. The keys are decrypted only here, just before a call.
 */

const Keys = z.object({ key: z.string().min(1), secret: z.string().min(1) });

export const encryptWooKeys = (keys: { key: string; secret: string }) => encryptSecret(JSON.stringify(keys));

export function demoWooStore(): WooStore {
  const demo = env().demoWoo;
  if (!demo) throw new StepError("demoStoreMissing");
  return demo;
}

export async function wooSettings(workspace: Workspace): Promise<WooSettings> {
  const c = await forWorkspace(workspace.id).storeConnection("woo");
  return WooSettings.parse(c?.settings_json ?? {});
}

/** The store to call. Throws a seller-facing error when the shop has none. */
export async function resolveWooStore(workspace: Workspace): Promise<{ store: WooStore; settings: WooSettings }> {
  if (workspace.isDemo) return { store: demoWooStore(), settings: WooSettings.parse({ demo: true }) };
  const c = await forWorkspace(workspace.id).storeConnection("woo");
  if (!c || c.status === "disconnected") throw new StepError("connectStore");
  const settings = WooSettings.parse(c.settings_json ?? {});
  if (settings.demo) return { store: demoWooStore(), settings };
  if (!c.base_url || !c.credentials_enc) throw new StepError("connectStore");
  return { store: { url: c.base_url, ...Keys.parse(JSON.parse(decryptSecret(c.credentials_enc))) }, settings };
}

/** For the Connections page: the last 4 characters of the saved key, nothing more. */
export function keyHint(credentialsEnc: string | null): string | null {
  if (!credentialsEnc) return null;
  try {
    const { key } = Keys.parse(JSON.parse(decryptSecret(credentialsEnc)));
    return key.slice(-4);
  } catch {
    return null;
  }
}
