"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { FormSection } from "@/components/app/form-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveSettings, type SettingsState } from "@/server/actions/settings";
import { submitKeepingValues } from "@/lib/forms";
import { BRAND_NOTE_MAX, BRAND_VOICES, PRICE_ROUNDINGS, SCENES } from "@/lib/schemas/settings";

export interface SettingsValues {
  name: string;
  mainCategory: string;
  brandVoice: (typeof BRAND_VOICES)[number];
  brandNote: string;
  scenes: string[];
  priceRounding: number;
  bangla: boolean;
  website: string;
}

/** A native radio or checkbox in a bordered row, so the whole row is the 44 px tap target. */
function Choice({
  type,
  name,
  value,
  defaultChecked,
  label,
  hint,
}: {
  type: "radio" | "checkbox";
  name: string;
  value: string;
  defaultChecked: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border bg-card px-3 py-2.5 has-checked:border-primary has-checked:bg-primary/5">
      <input
        type={type}
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

/**
 * Shop settings in one form: the shop, how listings are written, which photos are made
 * and which languages. New listings use them straight away.
 */
export function SettingsForm({ initial, isDemo }: { initial: SettingsValues; isDemo: boolean }) {
  const t = useTranslations("settings");
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettings, { status: "idle" });

  useEffect(() => {
    if (state.status === "saved") toast.success(t("saved"));
  }, [state, t]);

  const invalid = (field: string) => state.status === "invalid" && state.field === field;

  return (
    <form onSubmit={submitKeepingValues(action)} className="space-y-8">
      <FormSection id="shop" title={t("shop.title")} intro={t("shop.intro")}>
        <div className="space-y-2">
          <Label htmlFor="name">{t("shop.name")}</Label>
          <Input
            id="name"
            name="name"
            required
            minLength={2}
            maxLength={80}
            defaultValue={initial.name}
            aria-invalid={invalid("name") || undefined}
            aria-describedby={invalid("name") ? "name-error" : undefined}
            className="h-11"
          />
          {invalid("name") && (
            <p id="name-error" className="text-sm text-destructive">
              {t("shop.nameError")}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="mainCategory">{t("shop.category")}</Label>
          <Input
            id="mainCategory"
            name="mainCategory"
            maxLength={60}
            defaultValue={initial.mainCategory}
            placeholder={t("shop.categoryPlaceholder")}
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="website">{t("shop.website")}</Label>
          <Input
            id="website"
            name="website"
            type="text"
            inputMode="url"
            autoComplete="url"
            maxLength={200}
            defaultValue={initial.website}
            placeholder="facebook.com/yourshop"
            aria-invalid={invalid("website") || undefined}
            aria-describedby={invalid("website") ? "website-error website-hint" : "website-hint"}
            className="h-11"
          />
          <p id="website-hint" className="text-xs text-muted-foreground">
            {t("shop.websiteHint")}
          </p>
          {invalid("website") && (
            <p id="website-error" className="text-sm text-destructive">
              {t("shop.websiteError")}
            </p>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{t("shop.fixed")}</p>
      </FormSection>

      <FormSection id="writing" title={t("writing.title")} intro={t("writing.intro")}>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">{t("writing.voice")}</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {BRAND_VOICES.map((v) => (
              <Choice
                key={v}
                type="radio"
                name="brandVoice"
                value={v}
                defaultChecked={initial.brandVoice === v}
                label={t(`writing.voices.${v}`)}
                hint={t(`writing.voiceHints.${v}`)}
              />
            ))}
          </div>
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor="brandNote">{t("writing.note")}</Label>
          <Textarea
            id="brandNote"
            name="brandNote"
            rows={2}
            maxLength={BRAND_NOTE_MAX}
            defaultValue={initial.brandNote}
            placeholder={t("writing.notePlaceholder")}
            aria-describedby="brandNote-hint"
          />
          <p id="brandNote-hint" className="text-xs text-muted-foreground">
            {t("writing.noteHint", { max: BRAND_NOTE_MAX })}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="priceRounding">{t("writing.rounding")}</Label>
          <select
            id="priceRounding"
            name="priceRounding"
            defaultValue={String(initial.priceRounding)}
            className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm sm:w-60"
          >
            {PRICE_ROUNDINGS.map((n) => (
              <option key={n} value={n}>
                {n === 1 ? t("writing.roundingNone") : t("writing.roundingTo", { n })}
              </option>
            ))}
          </select>
        </div>
      </FormSection>

      <FormSection id="photos" title={t("photos.title")} intro={t("photos.intro")}>
        <fieldset className="space-y-2">
          <legend className="sr-only">{t("photos.title")}</legend>
          {SCENES.map((s) => (
            <Choice
              key={s}
              type="checkbox"
              name="scenes"
              value={s}
              defaultChecked={initial.scenes.includes(s)}
              label={t(`photos.scenes.${s}`)}
              hint={t(`photos.hints.${s}`)}
            />
          ))}
        </fieldset>
        <p className="text-xs text-muted-foreground">{t("photos.note")}</p>
      </FormSection>

      <FormSection id="languages" title={t("languages.title")} intro={t("languages.intro")}>
        <div className="space-y-2">
          <label className="flex min-h-11 items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
            <input type="checkbox" checked disabled className="size-4 accent-primary" />
            <span>
              English <span className="text-muted-foreground">· {t("languages.always")}</span>
            </span>
          </label>
          <Choice
            type="checkbox"
            name="bangla"
            value="on"
            defaultChecked={initial.bangla}
            label="বাংলা"
            hint={t("languages.banglaHint")}
          />
        </div>
      </FormSection>

      <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button type="submit" size="lg" disabled={pending} className="max-md:flex-1">
          {pending && <Loader2 className="animate-spin" />}
          {t("save")}
        </Button>
        {isDemo && <p className="text-xs text-muted-foreground">{t("demoNote")}</p>}
        <p aria-live="polite" className="sr-only">
          {state.status === "saved" ? t("saved") : state.status === "invalid" ? t("invalid") : ""}
        </p>
      </div>
    </form>
  );
}
