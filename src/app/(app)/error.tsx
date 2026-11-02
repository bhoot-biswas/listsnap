"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/app/error-state";
import { TopBar } from "@/components/app/top-bar";

/**
 * A page of the app that failed. The top bar stays, so a phone still has its menu; and
 * when the Dashboard itself is what failed, the way out goes to Listings instead of back.
 */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("errors");
  const pathname = usePathname();
  return (
    <>
      <TopBar title={t("title")} />
      <ErrorState
        error={error}
        retry={retry}
        titled
        back={pathname === "/dashboard" ? { href: "/listings", label: "goListings" } : undefined}
      />
    </>
  );
}
