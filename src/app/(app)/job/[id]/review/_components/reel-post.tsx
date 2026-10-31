"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ExternalLink, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CAPTION_MAX, DESTINATIONS, type Destination } from "@/lib/schemas/social";
import type { ReelLang } from "@/lib/schemas/reels";

export interface SocialState {
  /** The connected Page and Instagram account, names only; null when nothing is connected. */
  account: { pageName: string; igUsername: string | null; test: boolean } | null;
  posted: Partial<Record<ReelLang, Partial<Record<Destination, { permalink: string; test: boolean }>>>>;
  captions: Partial<Record<ReelLang, string>>;
}

type Sending = { kind: "idle" } | { kind: "posting"; where: Destination } | { kind: "failed"; message: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Posting one reel. The seller sees the caption and where it goes, then presses "Post reel":
 * that press is the confirmation. Each destination is its own post, so one failing never
 * blocks the other, and one already made is shown with its link instead of a tick box.
 */
export function ReelPost({ listingId, lang, social }: { listingId: string; lang: ReelLang; social: SocialState }) {
  const t = useTranslations("review.reels.post");
  const tReels = useTranslations("review.reels");
  const router = useRouter();
  const posted = social.posted[lang] ?? {};
  const [open, setOpen] = useState(false);
  const [caption, setCaption] = useState(social.captions[lang] ?? "");
  const available = (d: Destination) => !posted[d] && (d === "facebook" || !!social.account?.igUsername);
  const [chosen, setChosen] = useState<Destination[]>(() => DESTINATIONS.filter(available));
  const [sending, setSending] = useState<Sending>({ kind: "idle" });
  const account = (d: Destination) => (d === "facebook" ? social.account?.pageName : social.account?.igUsername);

  async function postTo(destination: Destination): Promise<string | null> {
    for (let i = 0; i < 60; i++) {
      const res = await fetch(`/api/listings/${listingId}/post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, destination, caption }),
      }).catch(() => null);
      if (res?.status === 202) {
        await sleep(3000);
        continue;
      }
      const body = (await res?.json().catch(() => null)) as {
        state?: string;
        error?: string | { message?: string };
      } | null;
      if (res?.ok && body?.state === "done") return null;
      const error = typeof body?.error === "string" ? body.error : body?.error?.message;
      return error ?? t("failed");
    }
    return t("failed");
  }

  async function post() {
    for (const where of chosen.filter(available)) {
      setSending({ kind: "posting", where });
      const error = await postTo(where);
      if (error) {
        setSending({ kind: "failed", message: error });
        router.refresh();
        return;
      }
    }
    setSending({ kind: "idle" });
    setOpen(false);
    router.refresh();
  }

  const done = DESTINATIONS.filter((d) => posted[d]);
  const busy = sending.kind === "posting";

  return (
    <div className="space-y-2">
      {done.map((d) => (
        <p key={d} className="flex flex-wrap items-center gap-x-2 text-xs">
          <span className="font-medium text-success">{t(posted[d]!.test ? "testPosted" : "posted", { where: t(d) })}</span>
          <a
            href={posted[d]!.permalink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-1 text-primary underline-offset-4 hover:underline"
          >
            {t("view")}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </p>
      ))}

      {!social.account ? (
        done.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t("connect")}{" "}
            <Link href="/connections/meta" className="font-medium text-primary underline-offset-4 hover:underline">
              {t("connectLink")}
            </Link>
          </p>
        )
      ) : !open ? (
        DESTINATIONS.some(available) && (
          <Button type="button" variant="outline" className="h-11 w-full" onClick={() => setOpen(true)}>
            <Send className="size-4" aria-hidden="true" />
            {t("open")}
          </Button>
        )
      ) : (
        <div className="space-y-3 rounded-lg border p-3">
          <p className="text-sm font-medium">{t("title", { lang: tReels(`lang.${lang}`) })}</p>
          <div className="space-y-1">
            <Label htmlFor={`caption-${lang}`}>{t("caption")}</Label>
            <Textarea
              id={`caption-${lang}`}
              lang={lang}
              value={caption}
              maxLength={CAPTION_MAX}
              rows={8}
              onChange={(e) => setCaption(e.target.value)}
              className="text-sm"
            />
            <p className="text-right text-xs text-muted-foreground">
              {t("captionCount", { n: caption.length, max: CAPTION_MAX })}
            </p>
          </div>
          <fieldset className="space-y-1">
            <legend className="text-xs font-medium">{t("where")}</legend>
            {DESTINATIONS.filter((d) => !posted[d]).map((d) => (
              <label key={d} className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  disabled={!available(d) || busy}
                  checked={chosen.includes(d)}
                  onChange={(e) => setChosen((c) => (e.target.checked ? [...c, d] : c.filter((x) => x !== d)))}
                />
                <span>
                  {t(d)}
                  <span className="text-muted-foreground"> · {account(d) ?? t("noInstagram")}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-muted-foreground">{social.account.test ? t("test") : t("confirmHint")}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              className="h-11 flex-1"
              disabled={busy || !caption.trim() || !chosen.some(available)}
              onClick={() => void post()}
            >
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {t("confirm")}
            </Button>
            <Button type="button" variant="ghost" className="h-11" disabled={busy} onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
          </div>
          {sending.kind === "failed" && <p className="text-xs text-destructive">{sending.message}</p>}
          <p aria-live="polite" className="sr-only">
            {sending.kind === "posting" ? t("posting", { where: t(sending.where) }) : ""}
          </p>
        </div>
      )}
    </div>
  );
}
