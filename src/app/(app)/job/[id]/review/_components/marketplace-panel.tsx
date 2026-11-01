"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Package, Share2, Store } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePhotoShare } from "@/components/app/use-photo-share";
import { rememberMarketplaceLang, setMarketplacePosted } from "@/server/actions/marketplace";
import { COMMERCE_POLICIES_URL, MARKETPLACE_CREATE_URL, marketplaceFields } from "@/lib/marketplace";
import type { ListingEdit } from "@/lib/schemas/review";
import { cn } from "@/lib/utils";

export interface MarketplaceState {
  /** The language the card opens in: the one picked last, or the page's. */
  lang: "en" | "bn";
  /** "Colours" in each language, for the end of the description. */
  coloursLabel: { en: string; bn: string };
  posted: { at: string; url: string | null } | null;
}

/**
 * Getting the listing onto Facebook Marketplace by hand: Meta has no API that lets
 * ListSnap post there, so the card lays out each field of Marketplace's form to copy,
 * gets the photos to the phone, opens Marketplace, and lets the seller note that it's up.
 * The text follows the seller's edits as they type.
 */
export function MarketplacePanel({
  listingId,
  edit,
  state,
  beforeExport,
}: {
  listingId: string;
  edit: ListingEdit;
  state: MarketplaceState;
  beforeExport: () => Promise<unknown>;
}) {
  const t = useTranslations("review.marketplace");
  const router = useRouter();
  const photos = usePhotoShare(listingId, beforeExport);
  const langs = edit.bn ? (["en", "bn"] as const) : (["en"] as const);
  const [lang, setLang] = useState<"en" | "bn">(edit.bn ? state.lang : "en");
  const [url, setUrl] = useState(state.posted?.url ?? "");
  const [pending, start] = useTransition();
  const [linkError, setLinkError] = useState(false);

  const text = lang === "bn" && edit.bn ? { ...edit.bn, category: edit.en.category } : edit.en;
  const f = marketplaceFields(
    {
      title: text.title,
      shortDescription: text.short_description,
      description: text.description,
      attributes: text.attributes,
      tags: text.tags,
    },
    {
      price: edit.priceBdt,
      category: edit.en.category,
      colours: edit.variants?.filter((v) => v.on).map((v) => v.color) ?? [],
      coloursLabel: state.coloursLabel[lang],
    },
  );

  const pick = (l: "en" | "bn") => {
    setLang(l);
    void rememberMarketplaceLang(l).catch(() => undefined);
  };

  const copy = async (value: string) => {
    const done = await navigator.clipboard?.writeText(value).then(
      () => true,
      () => false,
    );
    if (done) toast.success(t("copied"));
    else toast.error(t("copyFailed"));
  };

  const mark = (posted: boolean) =>
    start(async () => {
      setLinkError(false);
      const r = await setMarketplacePosted({ listingId, posted, url: posted ? url : undefined }).catch(() => null);
      if (r?.ok) {
        if (posted) toast.success(t("markedPosted"));
        router.refresh();
      } else if (r?.error === "link") setLinkError(true);
      else toast.error(t("notSaved"));
    });

  const copyRows: { key: string; label: string; value: string; empty?: string }[] = [
    { key: "title", label: t("fields.title"), value: f.title },
    { key: "price", label: t("fields.price"), value: f.price, empty: t("noPrice") },
    { key: "description", label: t("fields.description"), value: f.description },
    { key: "tags", label: t("fields.tags"), value: f.tags },
  ];

  return (
    <section
      aria-labelledby="marketplace-title"
      className="space-y-4 rounded-xl border bg-card p-4"
      onFocus={photos.prepare}
      onPointerEnter={photos.prepare}
    >
      <div className="space-y-1">
        <h2 id="marketplace-title" className="flex items-center gap-2 text-sm font-semibold">
          <Store className="size-4 text-primary" aria-hidden="true" />
          {t("title")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("intro")}</p>
      </div>

      {langs.length > 1 && (
        <div role="tablist" aria-label={t("language")} className="inline-flex rounded-lg border p-1">
          {langs.map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={lang === l}
              onClick={() => pick(l)}
              className={cn(
                "min-h-11 rounded-md px-4 text-sm font-medium md:min-h-9",
                lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {l === "en" ? t("english") : t("bangla")}
            </button>
          ))}
        </div>
      )}

      <ul className="space-y-2">
        {copyRows.slice(0, 2).map((r) => (
          <CopyRow
            key={r.key}
            label={r.label}
            value={r.value}
            empty={r.empty}
            lang={lang}
            onCopy={copy}
            copyLabel={t("copyField", { field: r.label })}
          />
        ))}
        {/* lists in Marketplace's form, so they are picked there, not pasted */}
        <li className="space-y-2 rounded-lg border p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{t("fields.category")}</p>
              <p className="text-sm">{f.category}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{t("fields.condition")}</p>
              <p className="text-sm">{t("conditionNew")}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("pickHint")}</p>
        </li>
        {copyRows.slice(2).map((r) => (
          <CopyRow
            key={r.key}
            label={r.label}
            value={r.value}
            empty={r.empty}
            lang={lang}
            onCopy={copy}
            copyLabel={t("copyField", { field: r.label })}
          />
        ))}
      </ul>

      {/* stacked, because on desktop the card sits in Review's narrow left column */}
      <div className="grid gap-2">
        {photos.canShare ? (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => void photos.share({ copyText: false })}
          >
            <Share2 aria-hidden="true" />
            {t("sharePhotos")}
          </Button>
        ) : (
          <a
            href={`/api/export?format=kit&ids=${listingId}`}
            download
            onClick={(e) => {
              // the kit has the saved text, so the last keystrokes are saved before it downloads
              e.preventDefault();
              const href = e.currentTarget.href;
              void beforeExport()
                .catch(() => undefined)
                .then(() => window.location.assign(href));
            }}
            className={cn(buttonVariants({ variant: "outline" }), "h-11")}
          >
            <Package aria-hidden="true" />
            {t("downloadPhotos")}
          </a>
        )}
        <a
          href={MARKETPLACE_CREATE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants(), "h-11")}
        >
          <ExternalLink aria-hidden="true" />
          {t("open")}
        </a>
      </div>

      <div className="space-y-2 border-t pt-4">
        {state.posted ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="flex items-center gap-1.5 font-medium text-success">
              <Check className="size-4" aria-hidden="true" />
              {t("posted")}
            </span>
            {state.posted.url && (
              <a
                href={state.posted.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline md:min-h-0"
              >
                {t("view")}
              </a>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 md:h-8"
              disabled={pending}
              onClick={() => mark(false)}
            >
              {t("undo")}
            </Button>
          </div>
        ) : (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              mark(true);
            }}
          >
            <label htmlFor="marketplace-link" className="text-xs font-medium">
              {t("linkLabel")}
            </label>
            <div className="flex gap-2 max-sm:flex-col">
              <Input
                id="marketplace-link"
                type="text"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t("linkPlaceholder")}
                aria-invalid={linkError}
                aria-describedby={linkError ? "marketplace-link-error" : undefined}
                className="h-11"
              />
              <Button type="submit" variant="outline" className="h-11 shrink-0" disabled={pending}>
                <Check aria-hidden="true" />
                {t("markPosted")}
              </Button>
            </div>
            {linkError && (
              <p id="marketplace-link-error" role="alert" className="text-xs text-destructive">
                {t("badLink")}
              </p>
            )}
          </form>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {t("note")}{" "}
        <a
          href={COMMERCE_POLICIES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-4 hover:underline"
        >
          {t("policies")}
        </a>
      </p>
    </section>
  );
}

/** One box of Marketplace's form: its label and text, with a copy button beside it. */
function CopyRow({
  label,
  value,
  empty,
  lang,
  onCopy,
  copyLabel,
}: {
  label: string;
  value: string;
  empty?: string;
  lang: "en" | "bn";
  onCopy: (value: string) => Promise<void>;
  copyLabel: string;
}) {
  return (
    <li className="flex items-start gap-2 rounded-lg border p-3">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p
          lang={value && lang === "bn" ? "bn" : undefined}
          className={cn(
            "max-h-32 overflow-y-auto text-sm break-words whitespace-pre-wrap",
            !value && "text-muted-foreground",
          )}
        >
          {value || empty || "—"}
        </p>
      </div>
      {value && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11 shrink-0 md:size-9"
          onClick={() => void onCopy(value)}
          aria-label={copyLabel}
          title={copyLabel}
        >
          <Copy aria-hidden="true" />
        </Button>
      )}
    </li>
  );
}
