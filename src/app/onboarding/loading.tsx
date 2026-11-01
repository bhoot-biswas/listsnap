import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/app/logo";
import { Skeleton } from "@/components/ui/skeleton";

/** Shaped like the onboarding page, so a slow first load doesn't look like a blank screen. */
export default async function OnboardingLoading() {
  const t = await getTranslations("common");
  return (
    <main role="status" aria-live="polite" className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-8 px-4 py-10">
      <span className="sr-only">{t("loading")}</span>
      <Logo className="size-8" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-full" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-11 w-32 rounded-lg" />
      </div>
    </main>
  );
}
