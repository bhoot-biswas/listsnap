"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { finishOnboarding, type OnboardingState } from "@/server/actions/onboarding";

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const t = useTranslations("onboarding");
  const [state, action, pending] = useActionState<OnboardingState, FormData>(finishOnboarding, { error: null });
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">{t("shopName")}</Label>
        <Input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={80}
          defaultValue={defaultName}
          placeholder={t("shopNamePlaceholder")}
          aria-invalid={state.error === "name" || undefined}
          aria-describedby={state.error ? "name-error" : undefined}
          className="h-11"
        />
        {state.error === "name" && (
          <p id="name-error" className="text-sm text-destructive">
            {t("errorName")}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {t("continue")}
      </Button>
    </form>
  );
}
