"use client";

import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type ListingStatus } from "@/components/app/status-badge";
import { cn } from "@/lib/utils";
import type { ChatItem } from "@/lib/schemas/chat";

const isBangla = (text: string) => /[ঀ-৿]/.test(text);

/** One entry of the conversation: a message, a finished tool with what it made, or an approval card. */
export function ChatEntry({
  item,
  busy,
  onAnswer,
}: {
  item: ChatItem;
  busy: boolean;
  onAnswer: (id: string, yes: boolean) => void;
}) {
  const t = useTranslations("chat");
  if (item.kind === "user" || item.kind === "assistant") {
    const mine = item.kind === "user";
    const photos = item.kind === "user" ? (item.photos ?? []) : [];
    return (
      <div className={cn("flex flex-col gap-1.5", mine ? "items-end" : "items-start")}>
        {photos.length > 0 && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
            {photos.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element -- our own /media URL
              <img key={url} src={url} alt={t("photoAlt")} className="size-24 rounded-lg border object-cover" />
            ))}
          </div>
        )}
        {item.text && (
          <p
            lang={isBangla(item.text) ? "bn" : undefined}
            className={cn(
              "max-w-[85%] rounded-2xl px-3 py-2 text-sm [overflow-wrap:anywhere] whitespace-pre-wrap",
              mine ? "bg-primary text-primary-foreground" : "bg-muted",
            )}
          >
            <span className="sr-only">{mine ? t("you") : t("assistant")}: </span>
            {item.text}
          </p>
        )}
      </div>
    );
  }

  if (item.kind === "tool") {
    const what = t.has(`tool.${item.name}`) ? t(`tool.${item.name}`) : item.name;
    return (
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {item.ok ? (
            <Check className="size-3.5 text-success" aria-hidden="true" />
          ) : (
            <X className="size-3.5 text-destructive" aria-hidden="true" />
          )}
          {item.ok ? what : t("tool.failed", { what })}
        </p>
        <Made item={item} />
      </div>
    );
  }

  return <Approval item={item} busy={busy} onAnswer={onAnswer} />;
}

function Made({ item }: { item: Extract<ChatItem, { kind: "tool" | "approval" }> }) {
  const t = useTranslations("chat.approval");
  const tChat = useTranslations("chat");
  return (
    <>
      {item.open && (
        <Link
          href={item.open as Route}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {tChat("openListing")}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      )}
      {item.listings && (
        <ul className="divide-y rounded-lg border">
          {item.listings.map((l) => (
            <li key={l.id}>
              <Link
                href={l.href as Route}
                className="flex min-h-11 items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/60"
              >
                <span className="truncate">{l.title}</span>
                <StatusBadge status={l.status as ListingStatus} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {item.media &&
        (item.media.video ? (
          <video src={item.media.url} controls playsInline className="max-h-72 rounded-lg border bg-black" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- our own /media URL, already sized
          <img src={item.media.url} alt="" className="max-h-56 rounded-lg border object-contain" />
        ))}
      {item.link && (
        <a
          href={item.link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
        >
          {t("view")}
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      )}
    </>
  );
}

/** Shows exactly what will be sent; the seller's "yes" runs these stored args and nothing else. */
function Approval({
  item,
  busy,
  onAnswer,
}: {
  item: Extract<ChatItem, { kind: "approval" }>;
  busy: boolean;
  onAnswer: (id: string, yes: boolean) => void;
}) {
  const t = useTranslations("chat.approval");
  const tReels = useTranslations("review.reels");
  const args = item.args as {
    lang?: "en" | "bn";
    destination?: "facebook" | "instagram";
    caption?: string;
    update?: boolean;
  };
  const titles = item.preview?.titles ?? [];
  const question =
    item.name === "postReel"
      ? t("postReel", {
          lang: tReels(`lang.${args.lang ?? "en"}`),
          where: tReels(`post.${args.destination ?? "facebook"}`),
        })
      : item.name === "saveDraftsToStore"
        ? t("saveDraftsToStore", { n: titles.length })
        : args.update
          ? t("updateDraft")
          : t("saveDraftToStore");
  const yes = t.has(`yes.${item.name}`) ? t(`yes.${item.name}`) : t("yes.saveDraftToStore");

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">{question}</p>
      {titles.length > 0 && (
        <ul className="max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">
          {titles.map((title, i) => (
            <li key={i}>{title}</li>
          ))}
        </ul>
      )}
      {args.caption && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t("caption")}</p>
          <p lang={args.lang} className="max-h-40 overflow-y-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">
            {args.caption}
          </p>
        </div>
      )}
      {item.state === "pending" ? (
        <div className="flex gap-2">
          <Button type="button" className="h-11 flex-1" disabled={busy} onClick={() => onAnswer(item.id, true)}>
            {yes}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={busy}
            onClick={() => onAnswer(item.id, false)}
          >
            {t("no")}
          </Button>
        </div>
      ) : (
        <p
          className={cn(
            "text-xs font-medium",
            item.state === "approved"
              ? "text-success"
              : item.state === "failed"
                ? "text-destructive"
                : "text-muted-foreground",
          )}
        >
          {t(item.state)}
        </p>
      )}
      <Made item={item} />
    </div>
  );
}
