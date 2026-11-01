"use server";

import { randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/server/auth/session";
import { encryptSecret } from "@/server/crypto";
import { forWorkspace } from "@/server/db/scope";
import { env } from "@/server/env";
import { settingsFor } from "@/server/social/meta-connect";
import { MetaSettings } from "@/lib/schemas/social";

/**
 * A test Page and account, for trying posting without a Meta app: posts then go to the
 * mock providers. It is refused while posting is set to live. The real Page connects with
 * Facebook Login, through /api/meta/install.
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
    pages: [],
  };
  await forWorkspace(viewer.workspace.id).saveConnection("meta", {
    baseUrl: null,
    credentialsEnc: encryptSecret("test-page-token"),
    checks: null,
    settings,
  });
  redirect("/connections/meta");
}

/** Which of the Pages from the last login reels post to. Only those Pages can be chosen. */
export async function chooseMetaPage(formData: FormData): Promise<void> {
  const viewer = await requireWorkspace();
  const ws = forWorkspace(viewer.workspace.id);
  const current = MetaSettings.safeParse((await ws.storeConnection("meta"))?.settings_json);
  const page = current.success ? current.data.pages.find((p) => p.id === formData.get("pageId")) : undefined;
  if (current.success && page) await ws.setConnectionSettings("meta", settingsFor(page, current.data.pages));
  redirect("/connections/meta");
}

/** Forgets the Page tokens. Posts already made stay on Facebook and Instagram. */
export async function disconnectMeta(): Promise<void> {
  const viewer = await requireWorkspace();
  await forWorkspace(viewer.workspace.id).disconnect("meta");
  // its page is gone once it is disconnected
  redirect("/connections");
}
