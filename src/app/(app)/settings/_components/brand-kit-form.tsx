"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ImagePlus, Loader2, X } from "lucide-react";
import { FormSection } from "@/components/app/form-section";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { saveBrandKit, type BrandKitState } from "@/server/actions/settings";
import { BRAND_COLORS_MAX, BRAND_PHOTO_MAX_BYTES } from "@/lib/schemas/brand-kit";
import { MediaImg } from "@/components/app/media-img";
import { cn } from "@/lib/utils";

export interface BrandKitValues {
  colors: string[];
  settingMediaId: string | null;
  settingUrl: string | null;
}

// a warm starting point for a shop that hasn't picked colours yet
const STARTER = ["#7A1F2B", "#D9A441", "#F3E9D2"];

/**
 * The brand kit: up to three colours and a photo of the seller's own shop. Choosing or
 * removing the photo saves the kit at once, as the connection settings save on change:
 * a seller who leaves after picking a photo expects it kept. Save is for the colours.
 */
export function BrandKitForm({ initial }: { initial: BrandKitValues }) {
  const t = useTranslations("settings.brandKit");
  const [state, action, pending] = useActionState<BrandKitState, FormData>(saveBrandKit, { status: "idle" });
  const [setting, setSetting] = useState({ id: initial.settingMediaId, url: initial.settingUrl });
  const [uploading, setUploading] = useState(false);
  // the server's own reason (too large, not a photo, today's limit), in the seller's language
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [useColors, setUseColors] = useState(initial.colors.length > 0);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // the photo changed since the page loaded: save once React has put its id in the form
  const [photoChanged, setPhotoChanged] = useState(false);
  useEffect(() => {
    if (photoChanged) formRef.current?.requestSubmit();
  }, [photoChanged, setting]);
  const colors = Array.from({ length: BRAND_COLORS_MAX }, (_, i) => initial.colors[i] ?? STARTER[i]!);

  useEffect(() => {
    if (state.status === "saved") toast.success(t("saved"));
  }, [state, t]);

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    if (fileRef.current) fileRef.current.value = "";
    // checked here too, so a big photo isn't sent over phone data only to be refused
    if (file.size > BRAND_PHOTO_MAX_BYTES)
      return setUploadError(t("tooLarge", { mb: BRAND_PHOTO_MAX_BYTES / 1024 / 1024 }));
    setUploading(true);
    const body = new FormData();
    body.set("photo", file);
    const res = await fetch("/api/brand-kit/setting", { method: "POST", body }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as {
      id?: string;
      url?: string;
      error?: { message?: string };
    } | null;
    setUploading(false);
    if (res?.ok && json?.id && json.url) {
      setSetting({ id: json.id, url: json.url });
      setPhotoChanged(true);
    } else setUploadError(json?.error?.message ?? t("uploadFailed"));
  }

  return (
    <form ref={formRef} action={action} className="space-y-8">
      <FormSection id="brand-kit" title={t("title")} intro={t("intro")}>
        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-medium">{t("colors")}</legend>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-card px-3 py-2.5 has-checked:border-primary has-checked:bg-primary/5">
            <input
              type="checkbox"
              name="useColors"
              checked={useColors}
              onChange={(e) => setUseColors(e.target.checked)}
              className="size-4 accent-primary"
            />
            <span className="text-sm">{t("useColors")}</span>
          </label>
          {/* off, the colours aren't used, so they can't be picked; they come back as they were */}
          <div className={cn("flex gap-3", !useColors && "opacity-40")}>
            {colors.map((c, i) => (
              <label key={i} className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                <input
                  type="color"
                  name="colors"
                  defaultValue={c}
                  disabled={!useColors}
                  aria-label={t("colorLabel", { n: i + 1 })}
                  className="size-11 cursor-pointer rounded-lg border bg-transparent p-1 disabled:cursor-not-allowed"
                />
                {i + 1}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <Label htmlFor="brand-setting">{t("setting")}</Label>
          <p id="brand-setting-hint" className="text-xs text-muted-foreground">
            {t("settingHint")}
          </p>
          <input type="hidden" name="settingMediaId" value={setting.id ?? ""} />
          {setting.url && (
            <MediaImg
              src={setting.url}
              sizes="384px"
              alt={t("settingAlt")}
              className="aspect-video w-full max-w-sm rounded-lg border object-cover"
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
              {uploading ? t("uploading") : setting.id ? t("replace") : t("upload")}
            </Button>
            {setting.id && (
              <Button
                type="button"
                variant="ghost"
                className="h-11"
                disabled={pending}
                onClick={() => {
                  setSetting({ id: null, url: null });
                  setPhotoChanged(true);
                }}
              >
                <X />
                {t("remove")}
              </Button>
            )}
          </div>
          <input
            ref={fileRef}
            id="brand-setting"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            aria-describedby="brand-setting-hint"
            className="sr-only"
            onChange={(e) => void upload(e.target.files?.[0])}
          />
          {uploadError && (
            <p role="alert" className="text-sm text-destructive">
              {uploadError}
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t("note")}</p>
        <div className="flex items-center gap-3">
          <Button type="submit" size="lg" disabled={pending || uploading}>
            {pending && <Loader2 className="animate-spin" />}
            {t("save")}
          </Button>
          <p aria-live="polite" className="text-sm text-destructive">
            {state.status === "photo_missing" ? t("photoMissing") : state.status === "invalid" ? t("invalid") : ""}
          </p>
          <p aria-live="polite" className="sr-only">
            {state.status === "saved" ? t("saved") : ""}
          </p>
        </div>
      </FormSection>
    </form>
  );
}
