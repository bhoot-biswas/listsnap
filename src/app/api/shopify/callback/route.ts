import { cookies } from "next/headers";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { apiViewer } from "@/server/auth/session";
import { markOnboarded } from "@/server/db/workspaces";
import { verifyCallbackHmac } from "@/server/providers/shopify/oauth";
import { STATE_COOKIE, appSecret, finishInstall, readStateCookie } from "@/server/stores/shopify-connect";
import { SHOP_DOMAIN } from "@/lib/shopify-connection";

// Shopify's own timestamp on the callback; an old link is refused even with a valid hmac
const MAX_AGE_S = 10 * 60;

/**
 * Where Shopify sends the seller after they approve ListSnap. Every check comes before
 * the code is spent: the state from this browser's cookie, Shopify's hmac, the shop
 * address, the link's age, and that the signed-in shop is the one that started it.
 */
export async function GET(request: Request) {
  const jar = await cookies();
  const saved = readStateCookie(jar.get(STATE_COOKIE)?.value);
  jar.delete({ name: STATE_COOKIE, path: "/api/shopify" });
  const back = (code: string) =>
    saved?.next === "onboarding" ? `/onboarding?step=store&shopify=${code}` : `/connections?shopify=${code}`;

  const query = new URL(request.url).searchParams;
  const shop = query.get("shop") ?? "";
  const code = query.get("code") ?? "";
  const timestamp = Number(query.get("timestamp"));
  const viewer = await apiViewer();
  if (!viewer) redirect("/sign-in");
  // "denied" covers the seller pressing Cancel in Shopify, which comes back without a code
  if (query.get("error") || !code) redirect(back("denied") as Route);
  if (
    !saved ||
    saved.state !== query.get("state") ||
    saved.workspaceId !== viewer.workspace.id ||
    saved.shop !== shop ||
    !SHOP_DOMAIN.test(shop) ||
    !verifyCallbackHmac(query, appSecret()) ||
    !Number.isFinite(timestamp) ||
    Math.abs(Date.now() / 1000 - timestamp) > MAX_AGE_S
  )
    redirect(back("expired") as Route);

  let error: string | null;
  try {
    error = await finishInstall(viewer.workspace.id, shop, code);
  } catch (err) {
    console.error("[shopify] connecting failed:", err instanceof Error ? err.message : err);
    error = "failed";
  }
  if (error) redirect(back(error) as Route);
  if (saved.next === "onboarding") {
    await markOnboarded(viewer.workspace.id);
    redirect("/snap");
  }
  redirect("/connections?shopify=connected");
}
