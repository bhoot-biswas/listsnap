"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { parseAmount } from "@/lib/amount";
import { sized } from "@/lib/media-size";
import { COLOR_MAX, type Variant } from "@/lib/variants";
import { cn } from "@/lib/utils";

/** What's wrong with the colours as typed, if anything; autosave refuses these, so say why. */
export function variantProblem(variants: Variant[]): "colorEmpty" | "colorDuplicate" | "colorNoneOn" | null {
  const on = variants.filter((v) => v.on);
  if (!on.length) return "colorNoneOn";
  if (variants.some((v) => !v.color.trim())) return "colorEmpty";
  const names = on.map((v) => v.color.trim().toLowerCase());
  return new Set(names).size < names.length ? "colorDuplicate" : null;
}

/**
 * One row per colour: whether it's sold, its name, and its own price and stock. Each
 * becomes a variation of one store product; the photo shows which item it was.
 */
export function VariantFields({
  variants,
  photos,
  basePrice,
  onChange,
}: {
  variants: Variant[];
  /** Item id → its white main image. */
  photos: Record<string, string>;
  basePrice: number | null;
  onChange: (next: Variant[]) => void;
}) {
  const t = useTranslations("review");
  const problem = variantProblem(variants);
  const set = (i: number, patch: Partial<Variant>) =>
    onChange(variants.map((v, n) => (n === i ? { ...v, ...patch } : v)));
  const duplicate = (v: Variant) =>
    v.on && variants.filter((x) => x.on && x.color.trim().toLowerCase() === v.color.trim().toLowerCase()).length > 1;

  return (
    <section aria-labelledby="colors-title" className="space-y-3">
      <div className="space-y-1">
        <h2 id="colors-title" className="text-base font-semibold">
          {t("colors")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("colorsHint")}</p>
      </div>
      <ul className="divide-y rounded-xl border bg-card">
        {variants.map((v, i) => {
          const name = v.color.trim() || t("colorName");
          return (
            <li key={v.itemId} className={cn("flex flex-wrap items-center gap-3 p-3", !v.on && "opacity-60")}>
              {/* a 44 px tap area on phone that takes no more room than the box */}
              <label className="-m-3 flex size-11 shrink-0 cursor-pointer items-center justify-center md:m-0 md:size-auto">
                <input
                  type="checkbox"
                  className="size-5 accent-primary"
                  checked={v.on}
                  onChange={(e) => set(i, { on: e.target.checked })}
                  aria-label={t("sellColor", { color: name })}
                />
              </label>
              {photos[v.itemId] && (
                <Image
                  src={sized(photos[v.itemId]!, 96)}
                  alt=""
                  width={48}
                  height={48}
                  className="size-12 rounded-md border bg-white object-contain"
                  unoptimized
                />
              )}
              <Input
                value={v.color}
                maxLength={COLOR_MAX}
                onChange={(e) => set(i, { color: e.target.value })}
                aria-label={t("colorName")}
                aria-invalid={!v.color.trim() || duplicate(v) || undefined}
                className="h-11 min-w-32 flex-1"
              />
              <div className="flex gap-2">
                <Input
                  inputMode="numeric"
                  value={v.priceBdt ?? ""}
                  placeholder={basePrice === null ? "৳" : `৳${basePrice}`}
                  onChange={(e) => set(i, { priceBdt: parseAmount(e.target.value) })}
                  aria-label={t("colorPrice", { color: name })}
                  className="h-11 w-28 tabular-nums"
                />
                <Input
                  inputMode="numeric"
                  value={v.stockQty ?? ""}
                  placeholder={t("colorStockPlaceholder")}
                  onChange={(e) => set(i, { stockQty: parseAmount(e.target.value) })}
                  aria-label={t("colorStock", { color: name })}
                  className="h-11 w-24 tabular-nums"
                />
              </div>
            </li>
          );
        })}
      </ul>
      {problem && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {t(problem)}
        </p>
      )}
    </section>
  );
}
