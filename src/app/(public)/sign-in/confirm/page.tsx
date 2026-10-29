import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { Logo } from "@/components/app/logo";
import { LanguageSwitch } from "@/components/app/language-switch";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  // the token is in this page's URL: keep it out of search results and Referer headers
  return { title: (await getTranslations("signIn"))("confirmTitle"), robots: "noindex", referrer: "no-referrer" };
}

const Query = z.object({
  token: z.string().min(1),
  // same-site paths only; Better Auth checks them again
  callbackURL: z
    .string()
    .regex(/^\/(?!\/)/)
    .catch("/dashboard"),
  errorCallbackURL: z
    .string()
    .regex(/^\/(?!\/)/)
    .catch("/sign-in?error=expired"),
});

/**
 * The sign-in email links here instead of straight to Better Auth's verify endpoint.
 * Mail scanners (Gmail, Outlook Safe Links) open every link in a message, and the
 * token works once, so a direct link was spent by the scanner before the seller
 * clicked. Scanners follow links but don't submit forms, so the token survives
 * until the seller presses the button.
 */
export default async function ConfirmSignInPage({ searchParams }: PageProps<"/sign-in/confirm">) {
  const query = Query.safeParse(await searchParams);
  if (!query.success) redirect("/sign-in?error=expired");
  const t = await getTranslations("signIn");

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-8 px-4 py-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo className="size-8" />
          <span className="font-heading text-xl font-semibold">ListSnap</span>
        </div>
        <LanguageSwitch />
      </div>
      <h1 className="text-2xl font-semibold">{t("confirmTitle")}</h1>
      <p className="text-muted-foreground">{t("confirmBody")}</p>
      <form method="get" action="/api/auth/magic-link/verify">
        <input type="hidden" name="token" value={query.data.token} />
        <input type="hidden" name="callbackURL" value={query.data.callbackURL} />
        <input type="hidden" name="errorCallbackURL" value={query.data.errorCallbackURL} />
        <Button type="submit" size="lg" className="w-full">
          {t("confirmButton")}
        </Button>
      </form>
    </main>
  );
}
