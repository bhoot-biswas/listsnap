import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CircleAlert } from "lucide-react";
import { TopBar } from "@/components/app/top-bar";
import { ButtonLink } from "@/components/app/button-link";
import { requireWorkspace } from "@/server/auth/session";
import { connectionsOverview } from "@/server/connections/overview";
import { serviceHref, type ServiceGroup } from "@/lib/connectors";
import { ConnectionRow } from "./_components/connection-row";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("connections") };
}

const GROUPS: ServiceGroup[] = ["store", "social"];

/**
 * S13 Connections: every service on one list, stores then social, each row opening its
 * own page. What needs the seller comes first, above the list.
 */
export default async function ConnectionsPage() {
  const viewer = await requireWorkspace();
  const t = await getTranslations("connections");
  const tNav = await getTranslations("nav");
  const { services, severalStores } = await connectionsOverview(viewer.workspace);
  const broken = services.filter((s) => s.status === "broken");

  return (
    <>
      <TopBar title={tNav("connections")} />
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 md:px-6">
        <p className="text-muted-foreground">{t("intro")}</p>

        {broken.map((s) => (
          <div
            key={s.service}
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
          >
            <CircleAlert className="size-5 shrink-0 text-destructive" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm">{t("attention", { name: t(`names.${s.service}`) })}</p>
            <ButtonLink href={serviceHref(s.service)} variant="outline" className="h-11 md:h-9">
              {t("fix")}
            </ButtonLink>
          </div>
        ))}

        {GROUPS.map((group) => {
          const rows = services.filter((s) => s.group === group);
          if (!rows.length) return null;
          return (
            <section key={group} aria-labelledby={`group-${group}`} className="space-y-2">
              <h2 id={`group-${group}`} className="text-sm font-semibold text-muted-foreground">
                {t(`groups.${group}`)}
              </h2>
              <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                {rows.map((s) => (
                  <ConnectionRow key={s.service} s={s} severalStores={severalStores} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
