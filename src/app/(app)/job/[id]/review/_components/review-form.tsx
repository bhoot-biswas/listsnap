"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, CloudOff, Loader2 } from "lucide-react";
import { StatusBadge, type ListingStatus } from "@/components/app/status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveListingEdit } from "@/server/actions/review";
import type { ListingEdit } from "@/lib/schemas/review";
import { parseAmount } from "@/lib/amount";
import { cn } from "@/lib/utils";
import { SaveToStore } from "@/components/app/save-to-store";
import { Autosaver, type SaveState } from "./autosave";
import { ConfidencePanel, ReviewPhotos, type ReviewPhoto } from "./review-side";
import { LooksPanel } from "./looks-panel";
import { ReelPanel, type ReelsState } from "./reel-panel";
import type { Look } from "@/lib/schemas/looks";
import { TextFields, type TextValue } from "./text-fields";
import { VariantFields } from "./variant-fields";
import { ListingChat } from "./listing-chat";
import type { ChatItem } from "@/lib/schemas/chat";

export type { ReviewPhoto } from "./review-side";

/**
 * Review (S7): every edit autosaves about a second after the last keystroke (autosave.ts).
 * "Save draft to store" flushes the autosave first, so the store gets what's on screen.
 */
export function ReviewForm({
  jobId,
  listingId,
  initial,
  photos,
  colorPhotos,
  hint,
  confidence,
  checkNotes,
  inStore,
  others,
  looks,
  reels,
  chat,
}: {
  jobId: string;
  listingId: string;
  initial: ListingEdit;
  photos: ReviewPhoto[];
  looks: { made: Look[]; imagesLeft: number };
  reels: ReelsState;
  /** The stored conversation, and how many changes the chat has made to this listing. */
  chat: { items: ChatItem[]; revision: number };
  colorPhotos: Record<string, string>;
  hint: { low: number; high: number };
  confidence: number | null;
  checkNotes: string[];
  inStore: boolean;
  others: { id: string; n: number; status: ListingStatus; current: boolean }[];
}) {
  const t = useTranslations("review");
  const [edit, setEdit] = useState(initial);
  const [lang, setLang] = useState<"en" | "bn">("en");
  const [state, setState] = useState<SaveState>("saved");
  const [saver] = useState(
    () =>
      new Autosaver<ListingEdit>(
        initial,
        async (value) => {
          const r = await saveListingEdit(listingId, value);
          return r.ok ? true : r.error === "invalid" ? "invalid" : false;
        },
        setState,
      ),
  );

  useEffect(() => {
    const online = () => void saver.flush();
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("online", online);
      saver.dispose();
    };
  }, [saver]);

  // the latest edit, for AI answers that arrive after the seller kept typing
  const latest = useRef(edit);
  const change = (next: ListingEdit) => {
    latest.current = next;
    setEdit(next);
    saver.change(next);
  };

  // the chat changed the listing on the server: take the server's copy, which already holds
  // the seller's own edits, since the chat saves them before it runs
  const seenRevision = useRef(chat.revision);
  useEffect(() => {
    if (chat.revision === seenRevision.current) return;
    seenRevision.current = chat.revision;
    latest.current = initial;
    setEdit(initial);
  }, [chat.revision, initial]);

  // a look made after the page loaded arrives in `photos`; the seller just asked for it, so
  // it starts ticked, and the next autosave must not save it as unticked
  const known = useRef(new Set(photos.map((p) => p.id)));
  useEffect(() => {
    const fresh = photos.filter((p) => !p.locked && !known.current.has(p.id)).map((p) => p.id);
    if (!fresh.length) return;
    for (const id of fresh) known.current.add(id);
    const cur = latest.current;
    change({ ...cur, selectedMediaIds: [...new Set([...cur.selectedMediaIds, ...fresh])] });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the photo list changes, not on every edit
  }, [photos]);
  const setField = (l: "en" | "bn", field: "title" | "short_description" | "description", text: string) => {
    const cur = latest.current;
    if (l === "en") change({ ...cur, en: { ...cur.en, [field]: text } });
    else if (cur.bn) change({ ...cur, bn: { ...cur.bn, [field]: text } });
  };

  const selected = new Set(edit.selectedMediaIds);
  const outside = edit.priceBdt !== null && (edit.priceBdt < hint.low || edit.priceBdt > hint.high);
  const text: TextValue | null = lang === "en" ? edit.en : edit.bn;

  const saveButton = (className?: string) => (
    <SaveToStore
      jobId={jobId}
      listingIds={[listingId]}
      label={inStore ? t("updateStore") : t("saveToStore")}
      update={inStore}
      beforeSave={saver.flush}
      className={className}
    />
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {others.length > 1 ? (
          <nav aria-label={t("title")} className="flex flex-wrap gap-2">
            {others.map((o) => (
              <Link
                key={o.id}
                href={`/job/${jobId}/review?l=${o.id}`}
                aria-current={o.current ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm",
                  o.current ? "border-primary bg-primary-soft font-medium" : "hover:bg-muted/60",
                )}
              >
                {t("listingN", { n: o.n })}
                <StatusBadge status={o.status} />
              </Link>
            ))}
          </nav>
        ) : (
          <Link href={`/job/${jobId}`} className="flex min-h-11 items-center text-sm text-muted-foreground">
            ← {t("back")}
          </Link>
        )}
        <div className="flex items-center gap-4">
          <p role="status" aria-live="polite" className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {state === "saving" && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {state === "saved" && <Check className="size-4 text-success" aria-hidden="true" />}
            {state === "offline" && <CloudOff className="size-4" aria-hidden="true" />}
            {state === "saved"
              ? t("saved")
              : state === "saving"
                ? t("saving")
                : state === "offline"
                  ? t("offline")
                  : t("saveError")}
          </p>
          <ListingChat listingId={listingId} initial={chat.items} beforeSend={saver.flush} />
          {saveButton("max-lg:hidden")}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="space-y-6">
          <ReviewPhotos
            photos={photos}
            selected={selected}
            onToggle={(id) =>
              change({
                ...edit,
                selectedMediaIds: selected.has(id)
                  ? edit.selectedMediaIds.filter((x) => x !== id)
                  : [...edit.selectedMediaIds, id],
              })
            }
          />
          <LooksPanel listingId={listingId} made={looks.made} imagesLeft={looks.imagesLeft} />
          <ReelPanel listingId={listingId} reels={reels} priceSet={edit.priceBdt !== null} beforeMake={saver.flush} />
          <ConfidencePanel confidence={confidence} notes={checkNotes} />
        </div>

        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="price">{t("priceField")}</Label>
              <Input
                id="price"
                inputMode="numeric"
                value={edit.priceBdt ?? ""}
                onChange={(e) => change({ ...edit, priceBdt: parseAmount(e.target.value) })}
                aria-describedby="price-hint"
                className={cn("h-11", outside && "border-warning")}
              />
              <p
                id="price-hint"
                className={cn("text-xs", outside ? "font-medium text-warning" : "text-muted-foreground")}
              >
                {outside ? t("priceOutside", hint) : t("priceHint", hint)}
              </p>
            </div>
            {edit.variants ? (
              <p className="self-center text-sm text-muted-foreground">{t("stockPerColor")}</p>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="stock">{t("stockField")}</Label>
                <Input
                  id="stock"
                  inputMode="numeric"
                  value={edit.stockQty ?? ""}
                  onChange={(e) => change({ ...edit, stockQty: parseAmount(e.target.value) })}
                  aria-describedby="stock-hint"
                  className="h-11"
                />
                <p id="stock-hint" className="text-xs text-muted-foreground">
                  {t("stockHint")}
                </p>
              </div>
            )}
          </div>

          {edit.variants && (
            <VariantFields
              variants={edit.variants}
              photos={colorPhotos}
              basePrice={edit.priceBdt}
              onChange={(variants) => change({ ...edit, variants })}
            />
          )}

          <div role="tablist" aria-label={t("title")} className="inline-flex rounded-lg border p-1">
            {(["en", "bn"] as const).map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={lang === l}
                onClick={() => setLang(l)}
                className={cn(
                  "min-h-10 rounded-md px-4 text-sm font-medium",
                  lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {l === "en" ? t("english") : t("bangla")}
              </button>
            ))}
          </div>

          {text ? (
            <TextFields
              key={lang}
              listingId={listingId}
              lang={lang}
              value={text}
              english={edit.en}
              onField={(field, text) => setField(lang, field, text)}
              onChange={(v) =>
                change(lang === "en" ? { ...edit, en: { ...edit.en, ...v } } : { ...edit, bn: { ...edit.bn!, ...v } })
              }
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t("banglaMissing")}</p>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 -mx-4 border-t bg-background/95 p-4 backdrop-blur lg:hidden">
        {saveButton("w-full")}
      </div>
    </div>
  );
}
