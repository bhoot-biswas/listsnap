import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Check, ChevronDown, X } from "lucide-react";
import { FormSection } from "@/components/app/form-section";
import { TopBar } from "@/components/app/top-bar";
import { requireWorkspace } from "@/server/auth/session";
import { REELS_PER_DAY } from "@/server/db/limits";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("help") };
}

const TIPS = ["clutter", "distance", "light"] as const;
const EXPORT_STEPS = ["kit", "post", "many", "shopify", "website"] as const;
const FAQ = ["keys", "draft", "edit", "labels", "limits", "missed", "data"] as const;
const REPO = "https://github.com/bhoot-biswas/listsnap";

/** S17 Help: photo tips, selling on Marketplace with an export, answers to the usual questions, shortcuts, and where to get in touch. */
export default async function HelpPage() {
  const { workspace } = await requireWorkspace();
  const t = await getTranslations("help");
  const tNav = await getTranslations("nav");
  return (
    <>
      <TopBar title={tNav("help")} />
      <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-6 md:px-6">
        <FormSection id="tips" title={t("tips.title")} intro={t("tips.intro")}>
          <ul className="space-y-3">
            {TIPS.map((k) => (
              <li key={k} className="grid gap-2 rounded-xl border bg-card p-4 sm:grid-cols-2">
                <p className="flex gap-2 text-sm">
                  <X className="mt-0.5 size-4 shrink-0 text-destructive" aria-label={t("tips.avoid")} />
                  {t(`tips.items.${k}.bad`)}
                </p>
                <p className="flex gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-label={t("tips.do")} />
                  {t(`tips.items.${k}.good`)}
                </p>
              </li>
            ))}
          </ul>
        </FormSection>

        <FormSection id="export" title={t("export.title")} intro={t("export.intro")}>
          <ol className="list-decimal space-y-2 rounded-xl border bg-card py-4 pr-4 pl-9 text-sm">
            {EXPORT_STEPS.map((k) => (
              <li key={k}>{t(`export.steps.${k}`)}</li>
            ))}
          </ol>
          <p className="text-sm text-muted-foreground">{t("export.note")}</p>
        </FormSection>

        <FormSection id="faq" title={t("faq.title")}>
          <div className="divide-y rounded-xl border bg-card">
            {FAQ.map((k) => (
              <details key={k} className="group">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  {t(`faq.items.${k}.q`)}
                  <ChevronDown
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <p className="px-4 pb-4 text-sm text-muted-foreground">
                  {t(`faq.items.${k}.a`, {
                    listings: workspace.limits.listings,
                    photos: workspace.limits.images,
                    reels: REELS_PER_DAY,
                  })}
                </p>
              </details>
            ))}
          </div>
        </FormSection>

        <FormSection id="shortcuts" title={t("shortcuts.title")} intro={t("shortcuts.intro")}>
          <dl className="divide-y rounded-xl border bg-card text-sm">
            <div className="flex min-h-12 items-center justify-between gap-3 px-4">
              <dt>{t("shortcuts.newListing")}</dt>
              <dd>
                <kbd className="rounded border bg-muted px-2 py-0.5 font-mono text-xs">N</kbd>
              </dd>
            </div>
          </dl>
        </FormSection>

        <FormSection id="about" title={t("about.title")}>
          <p className="text-sm">{t("about.body")}</p>
          <p className="text-sm text-muted-foreground">
            {t.rich("about.contact", {
              link: (chunks) => (
                <a
                  href={`${REPO}/issues`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary hover:underline"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        </FormSection>
      </div>
    </>
  );
}
