import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PlaceholderPage } from "@/components/app/placeholder-page";
import { requireWorkspace } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("help") };
}

export default async function Page() {
  await requireWorkspace();
  return <PlaceholderPage title={(await getTranslations("nav"))("help")} phase="Phase 7" />;
}
