import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireWorkspace } from "@/server/auth/session";
import { loadBatchState } from "@/server/pipeline/batch-state";
import { BatchView } from "./_components/batch-view";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("bulk"))("title") };
}

/** S11 one bulk upload. `?start=1` (straight after the upload) starts it; otherwise it waits for Resume. */
export default async function BatchPage({ params, searchParams }: PageProps<"/bulk/[id]">) {
  const viewer = await requireWorkspace();
  const { id } = await params;
  const state = await loadBatchState(viewer.workspace, id);
  if (!state) notFound();
  return <BatchView initial={state} autoStart={(await searchParams).start === "1"} />;
}
