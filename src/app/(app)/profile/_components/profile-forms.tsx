"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { setUiLanguage } from "@/server/actions/preferences";
import {
  deleteAccount,
  saveProfile,
  saveTheme,
  type DeleteAccountState,
  type ProfileState,
} from "@/server/actions/profile";
import { ConfirmButton } from "@/components/app/form-buttons";
import { submitKeepingValues } from "@/lib/forms";
import { cn } from "@/lib/utils";

/** Name and phone; the email is shown but comes from sign-in. */
export function ProfileForm({ name, email, phone }: { name: string; email: string | null; phone: string }) {
  const t = useTranslations("profile.details");
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile, { status: "idle" });
  useEffect(() => {
    if (state.status === "saved") toast.success(t("saved"));
  }, [state, t]);
  const invalid = (f: "name" | "phone") => state.status === "invalid" && state.field === f;
  return (
    <form onSubmit={submitKeepingValues(action)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">{t("name")}</Label>
        <Input
          id="name"
          name="name"
          required
          maxLength={80}
          defaultValue={name}
          autoComplete="name"
          aria-invalid={invalid("name") || undefined}
          className="h-11"
        />
      </div>
      {email && (
        <div className="space-y-2">
          <Label htmlFor="email">{t("email")}</Label>
          <Input id="email" value={email} readOnly disabled className="h-11" aria-describedby="email-hint" />
          <p id="email-hint" className="text-xs text-muted-foreground">
            {t("emailHint")}
          </p>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="phone">{t("phone")}</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          maxLength={20}
          defaultValue={phone}
          autoComplete="tel"
          placeholder="+880 1XXX-XXXXXX"
          aria-invalid={invalid("phone") || undefined}
          aria-describedby={invalid("phone") ? "phone-error" : undefined}
          className="h-11"
        />
        {invalid("phone") && (
          <p id="phone-error" className="text-sm text-destructive">
            {t("phoneError")}
          </p>
        )}
      </div>
      <Button type="submit" disabled={pending} className="h-11">
        {pending && <Loader2 className="animate-spin" />}
        {t("save")}
      </Button>
    </form>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; lang?: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex rounded-lg border p-0.5", disabled && "opacity-60")}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          lang={o.lang}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-11 min-w-20 rounded-md px-3 text-sm font-medium transition-colors md:h-9",
            value === o.value ? "bg-primary-soft text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Language and theme: the same settings as the top bar's switch and the profile menu. */
export function Preferences() {
  const t = useTranslations("profile.preferences");
  const tNav = useTranslations("nav");
  const locale = useLocale() as "en" | "bn";
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium">{t("language")}</p>
        <Segmented
          label={t("language")}
          value={locale}
          disabled={pending}
          options={[
            { value: "en", label: "English", lang: "en" },
            { value: "bn", label: "বাংলা", lang: "bn" },
          ]}
          onChange={(lang) =>
            start(async () => {
              await setUiLanguage(lang);
              router.refresh();
            })
          }
        />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">{tNav("theme")}</p>
        <Segmented
          label={tNav("theme")}
          value={(theme ?? "system") as "light" | "dark" | "system"}
          options={[
            { value: "light", label: tNav("themeLight") },
            { value: "dark", label: tNav("themeDark") },
            { value: "system", label: tNav("themeSystem") },
          ]}
          onChange={(v) => {
            setTheme(v);
            void saveTheme(v);
          }}
        />
      </div>
    </div>
  );
}

export function SignOutButton() {
  const t = useTranslations("nav");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      className="h-11"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await authClient.signOut();
          router.push("/sign-in");
          router.refresh();
        })
      }
    >
      <LogOut />
      {t("signOut")}
    </Button>
  );
}

export function LinkGoogleButton() {
  const t = useTranslations("profile.signIn");
  return (
    <Button
      variant="outline"
      size="sm"

      onClick={() => void authClient.linkSocial({ provider: "google", callbackURL: "/profile" })}
    >
      {t("linkGoogle")}
    </Button>
  );
}

/**
 * Deletes the account and its shop. The confirm step names what goes; a session signed in
 * more than a day ago is asked to sign in again, which the message links to.
 */
export function DeleteAccount() {
  const t = useTranslations("profile.delete");
  const [state, action] = useActionState<DeleteAccountState>(deleteAccount, null);
  return (
    <form action={action} className="space-y-2">
      <ConfirmButton
        question={t("confirm")}
        confirmLabel={t("yes")}
        cancelLabel={t("keep")}
        className="h-11 text-destructive md:h-9"
      >
        {t("button")}
      </ConfirmButton>
      {state && (
        <p role="alert" className="text-sm text-destructive">
          {state.error === "signInAgain" ? t("signInAgain") : t("failed")}
        </p>
      )}
    </form>
  );
}
