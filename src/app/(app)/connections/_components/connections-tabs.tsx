import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "connected", href: "/connections" },
  { key: "add", href: "/connections/add" },
] as const;

/** Connected and Add are two pages, so each tab is a real link that works without JavaScript. */
export async function ConnectionsTabs({ current }: { current: (typeof TABS)[number]["key"] }) {
  const t = await getTranslations("connections.tabs");
  return (
    <nav aria-label={t("label")} className="flex gap-1 border-b">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === current ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium",
            tab.key === current
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t(tab.key)}
        </Link>
      ))}
    </nav>
  );
}
