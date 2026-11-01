"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, ChevronDown, CloudOff, Loader2 } from "lucide-react";
import { StatusBadge, type ListingStatus } from "@/components/app/status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveListingEdit } from "@/server/actions/review";
import type { ListingEdit } from "@/lib/schemas/review";
import { parseAmount } from "@/lib/amount";
import { cn } from "@/lib/utils";
import { SaveToStore } from "@/components/app/save-to-store";
import { ExportMenu } from "@/components/app/export-menu";
import { MediaImg } from "@/components/app/media-img";
import { nextListing } from "@/lib/review-next";
import { Autosaver, type SaveState } from "./autosave";
import { CheckPanel, ReviewPhotos, type ReviewPhoto } from "./review-side";
import { LooksPanel } from "./looks-panel";
import { ReelPanel, type ReelsState } from "./reel-panel";
import { CatalogPanel, type CatalogState } from "./catalog-panel";
import { MarketplacePanel, type MarketplaceState } from "./marketplace-panel";
import type { Look } from "@/lib/schemas/looks";
import { TextFields, type TextValue } from "./text-fields";
import { VariantFields } from "./variant-fields";
import { ListingChat } from "./listing-chat";
import { ArchiveButton } from "@/components/app/archive-button";
import type { ChatItem } from "@/lib/schemas/chat";
import { VoiceNoteCard, type VoiceNoteView } from "./voice-note-card";

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
  voiceNote,
  status,
  inStore,
  hasWebsite,
  storeBehind,
  archived,
  others,
  looks,
  reels,
  catalog,
  marketplace,
  chat,
}: {
  jobId: string;
  listingId: string;
  initial: ListingEdit;
  photos: ReviewPhoto[];
  looks: { made: Look[]; imagesLeft: number };
  reels: ReelsState;
  catalog: CatalogState;
  marketplace: MarketplaceState;
  /** The stored conversation, and how many changes the chat has made to this listing. */
  chat: { items: ChatItem[]; revision: number };
  colorPhotos: Record<string, string>;
  hint: { low: number; high: number };
  confidence: number | null;
  checkNotes: string[];
  /** The seller's voice note for this job, when there was one. */
  voiceNote: VoiceNoteView | null;
  status: ListingStatus;
  inStore: boolean;
  /** The shop has a website set, which an exported Facebook catalog needs. */
  hasWebsite: boolean;
  /** Edited since the store draft was saved. */
  storeBehind: boolean;
  archived: boolean;
  /** Every listing from this photo, for the tabs and "Next". */
  others: {
    id: string;
    n: number;
    status: ListingStatus;
    current: boolean;
    title: string | null;
    lang: "en" | "bn";
    thumb: string | null;
  }[];
}) {
  const t = useTranslations("review");
  const tArchive = useTranslations("archive");
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
    const flush = () => void saver.flush();
    // a phone switching apps may never come back to this tab, so save before it hides
    const hidden = () => document.visibilityState === "hidden" && flush();
    // closing the tab cuts a request short, so ask the browser to hold the page while one is due
    const leaving = (e: BeforeUnloadEvent) => {
      if (!saver.pending) return;
      flush();
      e.preventDefault();
    };
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("beforeunload", leaving);
    return () => {
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("beforeunload", leaving);
      // Back, or another listing's tab: the app stays loaded, so the last edit can still go
      flush();
    };
  }, [saver]);

  // the latest edit, for AI answers that arrive after the seller kept typing
  const latest = useRef(edit);
  const [behind, setBehind] = useState(storeBehind);
  const change = (next: ListingEdit) => {
    latest.current = next;
    setEdit(next);
    saver.change(next);
    setBehind(true);
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

  // extras start folded, unless something was made there or a link (Done's "Make a reel") points at them
  const [extrasOpen, setExtrasOpen] = useState(
    looks.made.length > 0 || Object.values(reels.made).some(Boolean) || !!catalog.saved || !!marketplace.posted,
  );
  const extras = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    // opening the element fires onToggle, which keeps the state in step
    if (window.location.hash === "#extras" && extras.current) {
      extras.current.open = true;
      extras.current.scrollIntoView();
    }
  }, []);

  const next = nextListing(others, listingId);
  const selected = new Set(edit.selectedMediaIds);
  const outside = edit.priceBdt !== null && (edit.priceBdt < hint.low || edit.priceBdt > hint.high);
  const text: TextValue | null = lang === "en" ? edit.en : edit.bn;

  const priceAndColors = (
    <div className="space-y-5">
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
          <p id="price-hint" className={cn("text-xs", outside ? "font-medium text-warning" : "text-muted-foreground")}>
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
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pt-6 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {others.length > 1 ? (
          // one row that scrolls on a phone, so three products don't push the form down
          <nav
            aria-label={t("title")}
            className="flex gap-2 max-sm:-mx-4 max-sm:w-[calc(100%+2rem)] max-sm:overflow-x-auto max-sm:px-4 sm:flex-wrap"
          >
            {others.map((o) => (
              <Link
                key={o.id}
                href={`/job/${jobId}/review?l=${o.id}`}
                aria-current={o.current ? "page" : undefined}
                className={cn(
                  "flex min-h-11 shrink-0 items-center gap-2 rounded-lg border py-1 pr-3 pl-1 text-sm",
                  o.current ? "border-primary bg-primary-soft font-medium" : "hover:bg-muted/60",
                )}
              >
                {o.thumb ? (
                  <MediaImg
                    src={o.thumb}
                    sizes="36px"
                    alt=""
                    className="size-9 rounded-md border bg-white object-cover"
                  />
                ) : (
                  <span className="pl-2" />
                )}
                <span lang={o.title ? o.lang : undefined} className="max-w-36 truncate">
                  {o.title ?? t("listingN", { n: o.n })}
                </span>
                <StatusBadge status={o.status} />
              </Link>
            ))}
          </nav>
        ) : (
          <Link href={`/job/${jobId}`} className="flex min-h-11 items-center text-sm text-muted-foreground">
            ← {t("back")}
          </Link>
        )}
        <div className="flex items-center gap-2">
          <ArchiveButton kind="listing" id={listingId} archived={archived} />
          <ListingChat listingId={listingId} initial={chat.items} beforeSend={saver.flush} />
        </div>
      </div>

      {archived && (
        <p role="status" className="rounded-xl border bg-muted px-4 py-3 text-sm">
          {tArchive("listingNotice")}
        </p>
      )}

      {/*
        Phone: photo, the checks, then the fields, with the extras last. Desktop: photo,
        checks and extras on the left, the fields beside them.
      */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:grid-rows-[auto_auto_1fr] lg:gap-x-8">
        <div className="lg:col-start-1 lg:row-start-1">
          <ReviewPhotos
            photos={photos}
            title={edit.en.title}
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
        </div>

        <div className="space-y-6 lg:col-start-1 lg:row-start-2">
          <CheckPanel listingId={listingId} confidence={confidence} notes={checkNotes} status={status} />
          {voiceNote && <VoiceNoteCard note={voiceNote} />}
        </div>

        <div className="space-y-6 lg:col-start-2 lg:row-span-3 lg:row-start-1">
          <div role="tablist" aria-label={t("title")} className="inline-flex rounded-lg border p-1">
            {(["en", "bn"] as const).map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={lang === l}
                onClick={() => setLang(l)}
                className={cn(
                  "min-h-11 rounded-md px-4 text-sm font-medium",
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
              afterTitle={priceAndColors}
            />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{t("banglaMissing")}</p>
              {priceAndColors}
            </>
          )}
        </div>

        <details
          ref={extras}
          id="extras"
          open={extrasOpen}
          onToggle={(e) => setExtrasOpen(e.currentTarget.open)}
          className="group space-y-4 lg:col-start-1 lg:row-start-3 lg:self-start"
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl border bg-card p-4 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
            <span className="space-y-0.5">
              <span className="block text-base font-semibold">{t("extras")}</span>
              <span className="block text-xs text-muted-foreground">{t("extrasHint")}</span>
            </span>
            <ChevronDown className="size-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="mt-4 space-y-6">
            <LooksPanel listingId={listingId} made={looks.made} imagesLeft={looks.imagesLeft} />
            <ReelPanel listingId={listingId} reels={reels} priceSet={edit.priceBdt !== null} beforeMake={saver.flush} />
            <MarketplacePanel listingId={listingId} edit={edit} state={marketplace} beforeExport={saver.flush} />
            <CatalogPanel listingId={listingId} catalog={catalog} beforeSave={saver.flush} />
          </div>
        </details>
      </div>

      {/* on every width, so saving never means scrolling back up a long listing */}
      <div className="sticky bottom-0 z-10 -mx-4 space-y-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        {next && (
          <Link
            href={`/job/${jobId}/review?l=${next.id}`}
            className="flex min-h-11 items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            <span className="shrink-0">{t("next")}</span>
            <span lang={next.title ? next.lang : undefined} className="min-w-0 truncate">
              {next.title ?? t("listingN", { n: next.n })}
            </span>
            <StatusBadge status={next.status} />
            <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
          </Link>
        )}
        {/* the autosave keeps ListSnap's copy; the store's draft changes only on Update */}
        {inStore && behind && (
          <p role="status" className="text-sm font-medium text-warning">
            {t("storeBehind")}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
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
                  : state === "invalid"
                    ? t("saveInvalid")
                    : t("saveError")}
          </p>
          <div className="flex items-center gap-2 max-sm:flex-1">
            <ExportMenu
              listingIds={[listingId]}
              hasWebsite={hasWebsite}
              unchecked={status === "needs_review"}
              beforeExport={saver.flush}
            />
            <SaveToStore
              jobId={jobId}
              listingIds={[listingId]}
              label={inStore ? t("updateStore") : t("saveToStore")}
              update={inStore}
              beforeSave={saver.flush}
              className="w-auto max-sm:flex-1"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
