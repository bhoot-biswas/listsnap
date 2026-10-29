"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Languages, Loader2, Minus, Plus, RefreshCw, Undo2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { assistActions, type AssistAction, type AssistField } from "@/lib/schemas/assist";

const ICONS: Record<AssistAction, LucideIcon> = {
  rewrite: RefreshCw,
  shorter: Minus,
  longer: Plus,
  translate: Languages,
};
const ERRORS = new Set(["limit_reached", "busy"]);

/**
 * Small AI buttons under one field. The answer replaces the text right away (autosave
 * stores it like typing would), and Undo puts the old text back until the seller edits
 * the field again.
 */
export function FieldAssist({
  listingId,
  field,
  label,
  lang,
  value,
  source,
  onApply,
}: {
  listingId: string;
  field: AssistField;
  /** The field's name, for the buttons' accessible group label. */
  label: string;
  lang: "en" | "bn";
  value: string;
  /** The English field, which Translate writes from. */
  source: string;
  onApply: (text: string) => void;
}) {
  const t = useTranslations("review.assist");
  const router = useRouter();
  const [busy, setBusy] = useState<AssistAction | null>(null);
  const [last, setLast] = useState<{ action: AssistAction; before: string; after: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // an edit after the AI's answer makes Undo stale
  const undo = last && last.after === value ? last : null;

  const run = async (action: AssistAction) => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/listings/${listingId}/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, action, lang, text: value, source }),
      });
      if (res.status === 401) return router.push("/sign-in");
      const body = (await res.json().catch(() => null)) as { text?: string; error?: { code: string } } | null;
      if (!res.ok || !body?.text) {
        const code = body?.error?.code ?? "";
        setError(t(`errors.${ERRORS.has(code) ? code : "other"}`));
        return;
      }
      setLast({ action, before: value, after: body.text });
      onApply(body.text);
    } catch {
      setError(t(navigator.onLine === false ? "errors.offline" : "errors.other"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-1">
      <div role="group" aria-label={t("group", { field: label })} className="flex flex-wrap items-center gap-1">
        {assistActions(field, lang).map((action) => {
          const Icon = ICONS[action];
          const empty = action === "translate" ? !source.trim() : !value.trim();
          return (
            <Button
              key={action}
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy !== null || empty}
              onClick={() => void run(action)}
              className="h-11 px-2.5 text-muted-foreground hover:text-foreground md:h-8"
            >
              {busy === action ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Icon aria-hidden="true" />}
              {t(action)}
            </Button>
          );
        })}
        {undo && !busy && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onApply(undo.before);
              setLast(null);
            }}
            className="h-11 px-2.5 md:h-8"
          >
            <Undo2 aria-hidden="true" />
            {t("undo")}
          </Button>
        )}
      </div>
      <p aria-live="polite" className="text-xs text-muted-foreground">
        {busy ? t("working") : undo ? t(`done.${undo.action}`) : ""}
      </p>
      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
