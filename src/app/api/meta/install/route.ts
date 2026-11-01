import { cookies } from "next/headers";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { apiViewer } from "@/server/auth/session";
import { env } from "@/server/env";
import { STATE_COOKIE, authorizeUrl, metaLoginOffered, stateCookie } from "@/server/social/meta-connect";

/** "Connect with Facebook": sends the seller to Facebook to choose the Pages ListSnap may post to. */
export async function GET() {
  const viewer = await apiViewer();
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent("/connections/add/meta")}` as Route);
  if (viewer.workspace.isDemo) redirect("/connections/add/meta?meta=demo");
  if (!metaLoginOffered()) redirect("/connections/add/meta?meta=failed");
  const cookie = stateCookie(viewer.workspace.id);
  (await cookies()).set(STATE_COOKIE, cookie.value, {
    httpOnly: true,
    secure: env().prod,
    // Facebook sends the seller back with a top-level GET, which a lax cookie goes along with
    sameSite: "lax",
    path: "/api/meta",
    maxAge: 600,
  });
  redirect(authorizeUrl(cookie.state) as Route);
}
