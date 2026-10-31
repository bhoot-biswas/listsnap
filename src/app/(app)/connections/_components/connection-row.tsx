import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { ServiceLogo } from "@/components/app/logos/service-logo";
import { serviceHref } from "@/lib/connectors";
import type { ServiceOverview } from "@/server/connections/overview";
import { StatusPill } from "./status-pill";

/** One service on Connections; the whole row opens its detail page. */
export function ConnectionRow({ s, severalStores }: { s: ServiceOverview; severalStores: boolean }) {
  const t = useTranslations("connections");
  // a demo store's pill already says so; a service not yet connected says what it's for
  const address = s.status === "none" ? t(`desc.${s.service}`) : s.address;
  return (
    <li>
      <Link
        href={serviceHref(s.service)}
        className="flex min-h-16 items-center gap-3 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <ServiceLogo service={s.service} />
        <div className="min-w-0 flex-1 md:grid md:grid-cols-[minmax(0,1fr)_8rem_9rem] md:items-center md:gap-4">
          <div className="min-w-0">
            <p className="font-medium">{t(`names.${s.service}`)}</p>
            {address && <p className="truncate text-sm text-muted-foreground">{address}</p>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 md:mt-0 md:contents">
            <StatusPill status={s.status} className="md:justify-self-start" />
            <span className="text-xs text-muted-foreground md:text-sm">
              {severalStores && s.saveDrafts !== null ? t(s.saveDrafts ? "drafts.on" : "drafts.off") : null}
            </span>
          </div>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}
