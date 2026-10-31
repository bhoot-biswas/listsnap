"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SHORT_MAX, TITLE_MAX } from "@/lib/schemas/review";
import { cn } from "@/lib/utils";
import { FieldAssist } from "./field-assist";

export interface TextValue {
  title: string;
  short_description: string;
  description: string;
  category?: string;
  attributes: { name: string; value: string }[];
  tags: string[];
}

/** A counter that turns marigold past the limit; the store takes longer text, but it reads badly. */
function Counter({ length, max }: { length: number; max: number }) {
  const t = useTranslations("review");
  const over = length - max;
  return (
    <span className={cn("text-xs tabular-nums text-muted-foreground", over > 0 && "font-medium text-warning")}>
      {over > 0 ? t("over", { count: over }) : `${length}/${max}`}
    </span>
  );
}

/**
 * One language's text: title, descriptions, category (English only), attributes and
 * tags. The three text fields get AI buttons; Bangla ones can be written from `english`.
 */
export function TextFields({
  listingId,
  lang,
  value,
  english,
  onChange,
  onField,
  afterTitle,
}: {
  listingId: string;
  lang: "en" | "bn";
  value: TextValue;
  english: TextValue;
  onChange: (next: TextValue) => void;
  /** Sets one field on the latest edit: an AI answer can arrive after more typing. */
  onField: (field: "title" | "short_description" | "description", text: string) => void;
  /** Price and colours: what the seller must check comes before the descriptions. */
  afterTitle?: React.ReactNode;
}) {
  const t = useTranslations("review");
  const locale = useLocale();
  const [tag, setTag] = useState("");
  const set = <K extends keyof TextValue>(key: K, v: TextValue[K]) => onChange({ ...value, [key]: v });
  const id = (name: string) => `${lang}-${name}`;
  const langProps = lang === "bn" ? { lang: "bn" } : {};
  const assist = (field: "title" | "short_description" | "description", label: string) => (
    <FieldAssist
      listingId={listingId}
      field={field}
      label={label}
      lang={lang}
      value={value[field]}
      source={english[field]}
      onApply={(text) => onField(field, text)}
    />
  );

  const addTag = (raw = tag) => {
    const clean = raw.trim().replace(/,$/, "").trim();
    if (clean && !value.tags.includes(clean)) set("tags", [...value.tags, clean]);
    setTag("");
  };

  return (
    <div className="space-y-5" {...langProps}>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={id("title")}>{t("titleField")}</Label>
          <Counter length={value.title.length} max={TITLE_MAX} />
        </div>
        <Input
          id={id("title")}
          value={value.title}
          onChange={(e) => set("title", e.target.value)}
          maxLength={200}
          className="h-11"
        />
        {assist("title", t("titleField"))}
      </div>

      {/* the fields' language is the app's, not the text tab's */}
      {afterTitle && <div lang={locale}>{afterTitle}</div>}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={id("short")}>{t("shortField")}</Label>
          <Counter length={value.short_description.length} max={SHORT_MAX} />
        </div>
        <Textarea
          id={id("short")}
          value={value.short_description}
          onChange={(e) => set("short_description", e.target.value)}
          maxLength={600}
          rows={2}
        />
        {assist("short_description", t("shortField"))}
      </div>

      <div className="space-y-2">
        <Label htmlFor={id("description")}>{t("descriptionField")}</Label>
        <Textarea
          id={id("description")}
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
          maxLength={8000}
          rows={8}
        />
        {assist("description", t("descriptionField"))}
      </div>

      {value.category !== undefined && (
        <div className="space-y-2">
          <Label htmlFor={id("category")}>{t("categoryField")}</Label>
          <Input
            id={id("category")}
            value={value.category}
            onChange={(e) => set("category", e.target.value)}
            maxLength={120}
            className="h-11"
          />
        </div>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("attributes")}</legend>
        {value.attributes.map((a, i) => (
          <div key={i} className="flex gap-2">
            <Input
              aria-label={t("attributeName")}
              placeholder={t("attributeName")}
              value={a.name}
              onChange={(e) =>
                set(
                  "attributes",
                  value.attributes.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                )
              }
              maxLength={60}
              className="h-11 w-2/5"
            />
            <Input
              aria-label={t("attributeValue")}
              placeholder={t("attributeValue")}
              value={a.value}
              onChange={(e) =>
                set(
                  "attributes",
                  value.attributes.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                )
              }
              maxLength={200}
              className="h-11 flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 shrink-0"
              aria-label={t("removeAttribute", { name: a.name || t("attributeName") })}
              onClick={() =>
                set(
                  "attributes",
                  value.attributes.filter((_, j) => j !== i),
                )
              }
            >
              <X />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="h-11 md:h-10"
          onClick={() => set("attributes", [...value.attributes, { name: "", value: "" }])}
        >
          <Plus />
          {t("addAttribute")}
        </Button>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor={id("tags")}>{t("tags")}</Label>
        {value.tags.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {value.tags.map((tg) => (
              <li key={tg} className="flex items-center gap-1 rounded-full border bg-muted/50 py-1 pr-1 pl-3 text-sm">
                {tg}
                <button
                  type="button"
                  aria-label={t("removeTag", { tag: tg })}
                  onClick={() =>
                    set(
                      "tags",
                      value.tags.filter((x) => x !== tg),
                    )
                  }
                  className="relative flex size-7 items-center justify-center rounded-full after:absolute after:-inset-2 hover:bg-muted"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Input
          id={id("tags")}
          value={tag}
          placeholder={t("tagsPlaceholder")}
          onChange={(e) => (e.target.value.endsWith(",") ? addTag(e.target.value) : setTag(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          onBlur={() => addTag()}
          maxLength={60}
          className="h-11"
        />
      </div>
    </div>
  );
}
