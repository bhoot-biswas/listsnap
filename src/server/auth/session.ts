import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";
import { workspaceForUser, type Workspace } from "@/server/db/workspaces";

/**
 * The Data Access Layer's front door. src/proxy.ts only checks that a
 * session cookie exists; the real check is here, and every page, Route Handler and
 * Server Action calls it itself, because layouts don't re-render on navigation.
 */

export interface Viewer {
  user: {
    id: string;
    name: string;
    email: string | null;
    image: string | null;
    isDemo: boolean;
    uiLang: string | null;
  };
  workspace: Workspace;
}

export const getSession = cache(async () => getAuth().api.getSession({ headers: await headers() }));

type ViewerResult = { viewer: Viewer } | { viewer: null; reason: "signed_out" | "no_workspace" };

const loadViewer = cache(async (): Promise<ViewerResult> => {
  const session = await getSession();
  if (!session) return { viewer: null, reason: "signed_out" };
  const workspace = await workspaceForUser(session.user.id);
  if (!workspace) return { viewer: null, reason: "no_workspace" };
  const u = session.user as typeof session.user & { isAnonymous?: boolean | null; uiLang?: string | null };
  return {
    viewer: {
      user: {
        id: u.id,
        // magic-link accounts start without a name; the part before the @ reads better than nothing
        name: u.name || (u.isAnonymous ? "" : u.email.split("@")[0]!),
        // anonymous users get a placeholder address; never show it
        email: u.isAnonymous ? null : u.email,
        image: u.image ?? null,
        isDemo: !!u.isAnonymous,
        uiLang: u.uiLang ?? null,
      },
      workspace,
    },
  };
});

/** For pages and Server Actions: redirects when there is no usable workspace. */
export async function requireWorkspace(opts: { allowOnboarding?: boolean } = {}): Promise<Viewer> {
  const r = await loadViewer();
  if (!r.viewer) redirect(r.reason === "no_workspace" ? "/sign-in?demo=expired" : "/sign-in");
  if (!opts.allowOnboarding && !r.viewer.workspace.onboarded) redirect("/onboarding");
  return r.viewer;
}

/** For Route Handlers: null instead of a redirect, so the route can answer 401 as JSON. */
export async function apiViewer(): Promise<Viewer | null> {
  return (await loadViewer()).viewer;
}

/** For pages that only adapt to a session (sign-in, landing) without requiring one. */
export async function optionalViewer(): Promise<Viewer | null> {
  return (await loadViewer()).viewer;
}
