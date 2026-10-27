import { cookies } from "next/headers";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/app-sidebar";
import { DemoBanner } from "@/components/app/demo-banner";
import { KeyboardShortcuts } from "@/components/app/keyboard-shortcuts";
import { SnapFab } from "@/components/app/snap-fab";
import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";

/**
 * The signed-in shell: left sidebar, demo banner, phone Snap button. It reads the
 * viewer only to draw the shell; each page still calls requireWorkspace() itself,
 * because layouts don't re-run on client navigation.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireWorkspace();
  const counts = await forWorkspace(viewer.workspace.id).counts();
  const sidebarCookie = (await cookies()).get("sidebar_state")?.value;

  return (
    <SidebarProvider defaultOpen={sidebarCookie !== "false"}>
      <AppSidebar
        data={{
          workspaceName: viewer.workspace.name,
          isDemo: viewer.workspace.isDemo,
          user: { name: viewer.user.name, email: viewer.user.email, image: viewer.user.image },
          needsReview: counts.needsReview,
          usageToday: counts.listingsToday,
          usageLimit: viewer.workspace.limits.listings,
        }}
      />
      <SidebarInset className="min-w-0">
        {viewer.workspace.isDemo && <DemoBanner />}
        {children}
      </SidebarInset>
      <SnapFab />
      <KeyboardShortcuts />
    </SidebarProvider>
  );
}
