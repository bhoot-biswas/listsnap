import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarTrigger } from "@/components/ui/sidebar";

type Shape = "page" | "dashboard" | "list" | "review";

const Rows = ({ n }: { n: number }) => (
  <div className="divide-y rounded-xl border bg-card">
    {Array.from({ length: n }, (_, i) => (
      <div key={i} className="flex items-center gap-3 px-4 py-3">
        <Skeleton className="size-12 shrink-0 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-3 w-1/4" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
    ))}
  </div>
);

/**
 * What a page shows while its server work runs, shaped like the page that is coming. On
 * slow 4G a tap with no change on screen reads as a broken button. The top bar keeps the
 * menu button, so a phone can still open the sidebar while waiting.
 */
export async function PageSkeleton({ shape = "page" }: { shape?: Shape }) {
  const t = await getTranslations("common");
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{t("loading")}</span>
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur md:px-6">
        <SidebarTrigger className="-ml-1 size-11 md:size-8" />
        <Skeleton className="h-5 w-32" />
      </header>
      <div aria-hidden="true" className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-6">
        {shape === "dashboard" && (
          <>
            <Skeleton className="h-8 w-56" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <Rows n={4} />
              <Skeleton className="h-40 rounded-xl" />
            </div>
          </>
        )}
        {shape === "list" && (
          <>
            <div className="flex gap-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-9 w-24 rounded-full" />
              ))}
            </div>
            <Rows n={6} />
          </>
        )}
        {shape === "review" && (
          <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Skeleton className="aspect-square rounded-xl" />
            <div className="space-y-4">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-11 rounded-lg" />
              ))}
              <Skeleton className="h-32 rounded-lg" />
            </div>
          </div>
        )}
        {shape === "page" && (
          <>
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </>
        )}
      </div>
    </div>
  );
}
