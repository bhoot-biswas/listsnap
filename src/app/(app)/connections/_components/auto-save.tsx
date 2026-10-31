"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { saveStoreSetting } from "@/server/actions/store-settings";
import type { StoreKind } from "@/lib/stores";
import { cn } from "@/lib/utils";

/*
 * Store settings that save the moment they change, with a toast to say so. The control
 * shows the new value at once and goes back to the old one if the save is refused.
 */

function useAutoSave<T>(initial: T) {
  const t = useTranslations("connections");
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const save = (next: T, input: Record<string, unknown>) => {
    const before = value;
    setValue(next);
    start(async () => {
      const r = await saveStoreSetting(input).catch(() => ({ ok: false }));
      if (r.ok) toast.success(t("saved"));
      else {
        setValue(before);
        toast.error(t("notSaved"));
      }
    });
  };
  return { value, pending, save };
}

/** A choice from a list: the default WooCommerce category, or where Shopify counts stock. */
export function AutoSaveSelect({
  id,
  label,
  kind,
  field,
  value,
  options,
  noneLabel,
}: {
  id: string;
  label: string;
  kind: StoreKind;
  field: "category" | "location";
  value: string;
  options: { value: string; label: string }[];
  /** Offers "none" as a choice, saved as null. */
  noneLabel?: string;
}) {
  const s = useAutoSave(value);
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <select
          id={id}
          value={s.value}
          disabled={s.pending}
          onChange={(e) => {
            const v = e.target.value;
            s.save(v, { kind, field, value: field === "category" ? (v ? Number(v) : null) : v });
          }}
          className="h-11 w-full min-w-0 rounded-md border bg-background px-3 text-sm disabled:opacity-70"
        >
          {noneLabel !== undefined && <option value="">{noneLabel}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Loader2
          className={cn("size-4 shrink-0 animate-spin text-muted-foreground", !s.pending && "invisible")}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

/** "Save new drafts here", for a shop with two stores. */
export function SaveDraftsSwitch({ kind, on }: { kind: StoreKind; on: boolean }) {
  const t = useTranslations("connections");
  const s = useAutoSave(on);
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p id={`${kind}-save-drafts`} className="text-sm font-medium">
          {t("saveDraftsHere")}
        </p>
        <p className="text-xs text-muted-foreground">{s.value ? t("savingHere") : t("notSavingHere")}</p>
      </div>
      {/* the switch's own box is small; the label around it makes the 44 px target */}
      <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
        <button
          type="button"
          role="switch"
          aria-checked={s.value}
          aria-labelledby={`${kind}-save-drafts`}
          disabled={s.pending}
          onClick={() => s.save(!s.value, { kind, field: "saveDrafts", value: !s.value })}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-70",
            s.value ? "bg-primary" : "bg-input",
          )}
        >
          <span
            className={cn(
              "inline-block size-5 rounded-full bg-background shadow transition-transform",
              s.value ? "translate-x-5.5" : "translate-x-0.5",
            )}
          />
        </button>
      </label>
    </div>
  );
}
