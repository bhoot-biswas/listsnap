import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { ServiceLogo } from "@/components/app/logos/service-logo";
import type { ServiceOverview } from "@/server/connections/overview";
import { StatusPill } from "./status-pill";

/** Back to the list, then the service with its status and its one main action. */
export async function DetailHeader({
  s,
  action,
  back = "connected",
}: {
  s: ServiceOverview;
  action?: React.ReactNode;
  /** Which tab the back link returns to. */
  back?: "connected" | "add";
}) {
  const t = await getTranslations("connections");
  const address = s.address;
  return (
    <div className="space-y-4">
      <Link
        href={back === "add" ? "/connections/add" : "/connections"}
        className="-ml-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground md:min-h-9"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {back === "add" ? t("tabs.add") : t("back")}
      </Link>
      <div className="flex flex-wrap items-center gap-4">
        <ServiceLogo service={s.service} className="size-12" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{t(`names.${s.service}`)}</h2>
            <StatusPill status={s.status} />
          </div>
          {address && <p className="text-sm break-all text-muted-foreground">{address}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}

/** One titled part of a detail page. */
export function DetailSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-4 rounded-xl border bg-card p-5">
      <h3 id={id} className="font-semibold">
        {title}
      </h3>
      {children}
    </section>
  );
}
