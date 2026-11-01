import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/app/logo";
import { LanguageSwitch } from "@/components/app/language-switch";
import { optionalViewer } from "@/server/auth/session";
import { env, signInOptions } from "@/server/env";
import { safeNext } from "@/lib/safe-next";
import type { Route } from "next";
import { SignInForm } from "./_components/sign-in-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("signIn"))("title") };
}

/**
 * S1 Sign in: Google, an email link, or the demo shop. A signed-in seller goes
 * straight on; someone in the demo stays, since the demo banner sends them here to
 * switch to their own account. `next` is the page the seller was opening, so signing
 * in lands there instead of on the dashboard.
 */
export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const viewer = await optionalViewer();
  if (viewer && !viewer.user.isDemo) redirect((next ?? "/dashboard") as Route);
  const t = await getTranslations("signIn");
  const options = signInOptions();
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-8 px-4 py-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo className="size-8" />
          <span className="font-heading text-xl font-semibold">ListSnap</span>
        </div>
        <LanguageSwitch />
      </div>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <SignInForm
        google={options.google}
        email={options.email}
        devMail={options.email && !env().smtp}
        demoExpired={params.demo === "expired"}
        error={error}
        next={next}
      />
      <p className="text-xs text-muted-foreground">{t("terms")}</p>
    </main>
  );
}
