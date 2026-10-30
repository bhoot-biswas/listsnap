import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireWorkspace } from "@/server/auth/session";
import { loadJobState } from "@/server/pipeline/job-state";
import { JobView } from "./_components/job-view";
import { requestLocale } from "@/server/step-text";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("job"))("title") };
}

/**
 * S5 Processing. The first render comes straight from saved state, so a refresh shows
 * finished steps at once; the client runner then continues from the first unfinished one.
 */
export default async function JobPage({ params }: PageProps<"/job/[id]">) {
  const viewer = await requireWorkspace();
  const { id } = await params;
  const state = await loadJobState(viewer.workspace, id, await requestLocale());
  if (!state) notFound();
  return <JobView initial={state} />;
}
