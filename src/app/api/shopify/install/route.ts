import { cookies } from "next/headers";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { apiViewer } from "@/server/auth/session";
import { env } from "@/server/env";
import { STATE_COOKIE, authorizeUrl, shopifyOffered, stateCookie } from "@/server/stores/shopify-connect";
import { normaliseShopDomain } from "@/lib/shopify-connection";

/**
 * "Connect Shopify": sends the seller to their store to approve ListSnap. Also the app's
 * URL in Shopify, which an install from the Shopify admin opens with ?shop=; a seller
 * who isn't signed in signs in first and comes back here, shop and all.
 */
export async function GET(request: Request) {
  const viewer = await apiViewer();
  const url = new URL(request.url);
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(url.pathname + url.search)}` as Route);
  const query = url.searchParams;
  const next = query.get("next") === "onboarding" ? "onboarding" : "connections";
  const back = next === "onboarding" ? "/onboarding?step=store&" : "/connections/add/shopify?";
  if (viewer.workspace.isDemo) redirect(`${back}shopify=demo` as Route);
  if (!shopifyOffered()) redirect(`${back}shopify=failed` as Route);
  let shop: string;
  try {
    shop = normaliseShopDomain(query.get("shop") ?? "");
  } catch {
    redirect(`${back}shopify=shop` as Route);
  }
  const cookie = stateCookie({ workspaceId: viewer.workspace.id, shop, next });
  (await cookies()).set(STATE_COOKIE, cookie.value, {
    httpOnly: true,
    secure: env().prod,
    // Shopify sends the seller back with a top-level GET, which a lax cookie goes along with
    sameSite: "lax",
    path: "/api/shopify",
    maxAge: 600,
  });
  redirect(authorizeUrl(shop, cookie.state) as Route);
}
