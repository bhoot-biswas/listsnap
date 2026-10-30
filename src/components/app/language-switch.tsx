"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { setUiLanguage } from "@/server/actions/preferences";
import { cn } from "@/lib/utils";

/** EN | বাং toggle. Each label is in its own language, so it's findable whichever one is showing. */
export function LanguageSwitch({ className }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const choose = (lang: "en" | "bn") =>
    start(async () => {
      await setUiLanguage(lang);
      router.refresh();
    });

  return (
    <div
      role="group"
      aria-label="Language · ভাষা"
      className={cn("flex rounded-lg border p-0.5 text-sm", pending && "opacity-60", className)}
    >
      {(["en", "bn"] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          lang={lang}
          aria-pressed={locale === lang}
          onClick={() => choose(lang)}
          className={cn(
            "h-11 min-w-11 rounded-md px-2 font-medium transition-colors md:h-8",
            locale === lang ? "bg-primary-soft text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {lang === "en" ? "EN" : "বাং"}
        </button>
      ))}
    </div>
  );
}
