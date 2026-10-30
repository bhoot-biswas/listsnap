"use server";

import { randomInt } from "node:crypto";
import { refresh } from "next/cache";
import { requireWorkspace } from "@/server/auth/session";
import { encryptSecret } from "@/server/crypto";
import { forWorkspace } from "@/server/db/scope";
import { env } from "@/server/env";
import type { MetaSettings } from "@/lib/schemas/social";

/**
 * Connecting Facebook and Instagram from Connections. Until the Facebook login is built,
 * a shop can connect a test Page and account: posts then go to the mock providers, so the
 * whole flow can be tried without a Meta app. It is refused while posting is set to live.
 */
export async function connectTestMeta(): Promise<void> {
  const viewer = await requireWorkspace();
  const p = env().providers;
  if (p.facebook === "live" || p.instagram === "live") return;
  const handle = viewer.workspace.name.toLowerCase().replace(/[^a-z0-9]+/g, "") || "shop";
  const settings: MetaSettings = {
    pageId: String(1e14 + randomInt(1e9)),
    pageName: `${viewer.workspace.name} (test Page)`,
    igUserId: String(1.7e16 + randomInt(1e9)),
    igUsername: `@${handle.slice(0, 20)}.test`,
    test: true,
  };
  await forWorkspace(viewer.workspace.id).saveConnection("meta", {
    baseUrl: null,
    credentialsEnc: encryptSecret("test-page-token"),
    checks: null,
    settings,
  });
  refresh();
}

/** Forgets the Page token. Posts already made stay on Facebook and Instagram. */
export async function disconnectMeta(): Promise<void> {
  const viewer = await requireWorkspace();
  await forWorkspace(viewer.workspace.id).disconnect("meta");
  refresh();
}
