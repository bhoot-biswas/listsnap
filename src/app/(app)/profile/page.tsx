import type { Metadata } from "next";
import { headers } from "next/headers";
import { getFormatter, getTranslations } from "next-intl/server";
import { Check, Laptop, Smartphone } from "lucide-react";
import { ButtonLink } from "@/components/app/button-link";
import { TopBar } from "@/components/app/top-bar";
import { Badge } from "@/components/ui/badge";
import { FormSection } from "@/components/app/form-section";
import { Button } from "@/components/ui/button";
import { getAuth } from "@/server/auth/auth";
import { getSession, requireWorkspace } from "@/server/auth/session";
import { signInOptions } from "@/server/env";
import { signOutDevice, signOutOtherDevices } from "@/server/actions/profile";
import { describeUserAgent } from "@/lib/user-agent";
import { LinkGoogleButton, Preferences, ProfileForm, SignOutButton } from "./_components/profile-forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("profile") };
}

/** S16 Profile: who you are, how you sign in and where, and your language and theme. */
export default async function ProfilePage() {
  const viewer = await requireWorkspace();
  const t = await getTranslations("profile");
  const tNav = await getTranslations("nav");
  const format = await getFormatter();
  const { user } = viewer;

  if (user.isDemo) {
    return (
      <>
        <TopBar title={tNav("profile")} />
        <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-6 md:px-6">
          <div className="space-y-3 rounded-xl border bg-card p-5">
            <h2 className="text-base font-semibold">{t("demo.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("demo.body")}</p>
            <ButtonLink href="/sign-in" className="h-11">
              {t("demo.signIn")}
            </ButtonLink>
          </div>
          <FormSection id="preferences" title={t("preferences.title")}>
            <Preferences />
          </FormSection>
        </div>
      </>
    );
  }

  const h = await headers();
  const [session, sessions, accounts] = await Promise.all([
    getSession(),
    getAuth().api.listSessions({ headers: h }),
    getAuth().api.listUserAccounts({ headers: h }),
  ]);
  const phone = (session?.user as { phone?: string | null } | undefined)?.phone ?? "";
  const google = accounts.some((a) => a.providerId === "google");
  const options = signInOptions();
  const devices = [...sessions].sort((a, b) =>
    a.id === session?.session.id ? -1 : b.id === session?.session.id ? 1 : +b.updatedAt - +a.updatedAt,
  );

  return (
    <>
      <TopBar title={tNav("profile")} />
      <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-6 md:px-6">
        <FormSection id="details" title={t("details.title")} intro={t("details.intro")}>
          <ProfileForm name={user.name} email={user.email} phone={phone} />
        </FormSection>

        <FormSection id="preferences" title={t("preferences.title")} intro={t("preferences.intro")}>
          <Preferences />
        </FormSection>

        <FormSection id="sign-in" title={t("signIn.title")} intro={t("signIn.intro")}>
          <ul className="divide-y rounded-xl border bg-card">
            <li className="flex min-h-12 items-center gap-3 px-4 py-2 text-sm">
              <span className="flex-1">{t("signIn.email")}</span>
              <Check className="size-4 text-success" aria-label={t("signIn.on")} />
            </li>
            {options.google && (
              <li className="flex min-h-12 items-center gap-3 px-4 py-2 text-sm">
                <span className="flex-1">Google</span>
                {google ? <Check className="size-4 text-success" aria-label={t("signIn.on")} /> : <LinkGoogleButton />}
              </li>
            )}
          </ul>
        </FormSection>

        <FormSection id="devices" title={t("devices.title")} intro={t("devices.intro")}>
          <ul className="divide-y rounded-xl border bg-card">
            {devices.map((s) => {
              const ua = describeUserAgent(s.userAgent);
              const current = s.id === session?.session.id;
              const Icon = ua.os === "Android" || ua.os === "iOS" ? Smartphone : Laptop;
              return (
                <li key={s.id} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
                  <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {[ua.browser, ua.os].filter(Boolean).join(" · ") || t("devices.unknown")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {current ? t("devices.now") : t("devices.lastActive", { when: format.relativeTime(s.updatedAt) })}
                    </p>
                  </div>
                  {current ? (
                    <Badge variant="secondary">{t("devices.this")}</Badge>
                  ) : (
                    <form action={signOutDevice.bind(null, s.id)}>
                      <Button type="submit" variant="ghost" size="sm" className="h-11 md:h-8">
                        {tNav("signOut")}
                      </Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap gap-2">
            {devices.length > 1 && (
              <form action={signOutOtherDevices}>
                <Button type="submit" variant="outline" className="h-11">
                  {t("devices.signOutOthers")}
                </Button>
              </form>
            )}
            <SignOutButton />
          </div>
        </FormSection>
      </div>
    </>
  );
}
