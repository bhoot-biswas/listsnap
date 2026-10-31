import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/app/button-link";

/** A listing still being made has nothing to review yet; its progress lives on the job page. */
export async function StillMaking({ jobId }: { jobId: string }) {
  const t = await getTranslations("review");
  return (
    <div role="status" className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">{t("stillMakingTitle")}</h1>
      <p className="text-muted-foreground">{t("stillMakingBody")}</p>
      <ButtonLink href={`/job/${jobId}`} className="h-11">
        {t("stillMakingLink")}
      </ButtonLink>
    </div>
  );
}
