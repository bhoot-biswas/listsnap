import { cookies } from "next/headers";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { apiViewer } from "@/server/auth/session";
import { STATE_COOKIE, finishLogin, metaLoginOffered, readStateCookie } from "@/server/social/meta-connect";

/**
 * Where Facebook sends the seller after the login. The state from this browser's cookie
 * and the signed-in shop are checked before the code is spent.
 */
export async function GET(request: Request) {
  const jar = await cookies();
  const saved = readStateCookie(jar.get(STATE_COOKIE)?.value);
  jar.delete({ name: STATE_COOKIE, path: "/api/meta" });
  const back = (code: string) => `/connections/add/meta?meta=${code}` as Route;

  const query = new URL(request.url).searchParams;
  const code = query.get("code") ?? "";
  const viewer = await apiViewer();
  if (!viewer) redirect("/sign-in");
  // Cancel in Facebook's dialog comes back with error=access_denied and no code
  if (query.get("error") || !code) redirect(back("denied"));
  if (!metaLoginOffered()) redirect(back("failed"));
  if (!saved || saved.state !== query.get("state") || saved.workspaceId !== viewer.workspace.id)
    redirect(back("expired"));

  let error: string | null;
  try {
    error = await finishLogin(viewer.workspace.id, code);
  } catch (err) {
    console.error("[meta] connecting failed:", err instanceof Error ? err.message : err);
    error = "failed";
  }
  if (error) redirect(back(error));
  redirect("/connections/meta?meta=connected");
}
