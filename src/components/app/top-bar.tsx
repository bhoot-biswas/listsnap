import { SidebarTrigger } from "@/components/ui/sidebar";
import { LanguageSwitch } from "./language-switch";

/**
 * The bar at the top of the content area: menu on phone, page title,
 * language switch and the page's own actions on the right.
 */
export function TopBar({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur md:px-6">
      <SidebarTrigger className="-ml-1 size-10 md:size-8" />
      <h1 className="truncate text-lg font-semibold">{title}</h1>
      <div className="ml-auto flex items-center gap-2">
        {actions}
        <LanguageSwitch />
      </div>
    </header>
  );
}
