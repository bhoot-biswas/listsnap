"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/server/auth/session";
import { env } from "@/server/env";
import { forWorkspace } from "@/server/db/scope";
import { markOnboarded } from "@/server/db/workspaces";
import { woo } from "@/server/providers";
import { encryptWooKeys, resolveWooStore, wooSettings } from "@/server/stores/woo-store";
import { normaliseStoreUrl, type WooCheckResult, type WooSettings } from "@/lib/woo-connection";

/**
 * Connecting a WooCommerce store, from onboarding and from Connections. "Test" only
 * checks; "Save" checks again on the server before anything is stored, so a saved
 * connection always passed its checks. Keys are encrypted before they reach the
 * database and are never sent back to the browser.
 */

export type ConnectState = {
  result: WooCheckResult | null;
  error: "url" | "keys" | "demo" | "failed" | null;
};

const Form = z.object({
  intent: z.enum(["test", "save"]),
  next: z.enum(["onboarding", "connections"]),
  url: z.string().trim().min(3).max(255),
  key: z.string().trim().min(8).max(200),
  secret: z.string().trim().min(8).max(200),
  defaultCategory: z.string().optional(),
});

const ctx = (workspaceId: string) => ({ workspaceId, jobId: null, step: "connect" });

async function finish(workspaceId: string, next: "onboarding" | "connections"): Promise<never> {
  if (next === "onboarding") {
    await markOnboarded(workspaceId);
    redirect("/snap");
  }
  redirect("/connections");
}

export async function connectWoo(_prev: ConnectState, form: FormData): Promise<ConnectState> {
  const viewer = await requireWorkspace({ allowOnboarding: true });
  if (viewer.workspace.isDemo) return { result: null, error: "demo" };
  const parsed = Form.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { result: null, error: field === "url" ? "url" : "keys" };
  }
  const f = parsed.data;
  let url: string;
  try {
    url = normaliseStoreUrl(f.url);
  } catch {
    return { result: null, error: "url" };
  }

  const store = { url, key: f.key, secret: f.secret };
  let result: WooCheckResult;
  try {
    result = await woo().check(ctx(viewer.workspace.id), store);
  } catch (err) {
    console.error("[connect] store check failed:", err);
    return { result: null, error: "failed" };
  }
  if (f.intent === "test" || !result.ok) return { result, error: null };

  const [id, ...rest] = (f.defaultCategory ?? "").split(":");
  const category = result.categories.find((c) => String(c.id) === id && c.name === rest.join(":"));
  const settings: WooSettings = {
    defaultCategoryId: category?.id ?? null,
    defaultCategoryName: category?.name ?? null,
    demo: false,
  };
  await forWorkspace(viewer.workspace.id).saveConnection("woo", {
    baseUrl: url,
    credentialsEnc: encryptWooKeys({ key: f.key, secret: f.secret }),
    checks: result.checks,
    settings,
  });
  return finish(viewer.workspace.id, f.next);
}

/** "No store yet? Use the demo store for now." */
export async function connectDemoStore(form: FormData): Promise<void> {
  const viewer = await requireWorkspace({ allowOnboarding: true });
  const next = form.get("next") === "onboarding" ? "onboarding" : "connections";
  if (!viewer.workspace.isDemo && (woo().mode === "mock" || env().demoWoo)) {
    await forWorkspace(viewer.workspace.id).saveConnection("woo", {
      baseUrl: null,
      credentialsEnc: null,
      checks: [],
      settings: { defaultCategoryId: null, defaultCategoryName: null, demo: true } satisfies WooSettings,
    });
  }
  return finish(viewer.workspace.id, next);
}

/** "Test now" on Connections: checks the saved connection and records the result. */
export async function recheckWoo(): Promise<void> {
  const viewer = await requireWorkspace();
  const ws = forWorkspace(viewer.workspace.id);
  try {
    const { store } = await resolveWooStore(viewer.workspace);
    const result = await woo().check(ctx(viewer.workspace.id), store);
    await ws.setConnectionChecks("woo", result.ok ? "connected" : "broken", result.checks);
  } catch (err) {
    console.error("[connect] re-check failed:", err);
    await ws.setConnectionChecks("woo", "broken", [{ id: "reach", status: "fail", reason: "server" }]);
  }
  refresh();
}

/** Forgets the keys; drafts already in the store stay there. */
export async function disconnectWoo(): Promise<void> {
  const viewer = await requireWorkspace();
  if (viewer.workspace.isDemo) return;
  const settings = await wooSettings(viewer.workspace);
  const ws = forWorkspace(viewer.workspace.id);
  await ws.disconnect("woo");
  await ws.setConnectionSettings("woo", { ...settings, demo: false });
  refresh();
}
