"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, MessageSquarePlus, SendHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CHAT_MESSAGE_MAX, type ChatEvent, type ChatItem } from "@/lib/schemas/chat";
import { ChatEntry } from "./chat-items";

const SUGGESTIONS = ["status", "reel", "eid", "store"] as const;

/**
 * The listing chat. Each request streams events (one JSON object per line) and the
 * conversation is stored on the server, so a reload shows it again. When the chat
 * changed something, the page refreshes so the form, photos and reels show it.
 */
export function ListingChat({
  listingId,
  initial,
  beforeSend,
}: {
  listingId: string;
  initial: ChatItem[];
  /** Saves the seller's pending edits first, so the chat works on what they see. */
  beforeSend: () => Promise<boolean>;
}) {
  const t = useTranslations("review.chat");
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  // undefined: idle; null: the model is thinking; a name: that tool is running
  const [working, setWorking] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  // after a refresh the server's copy is the truth; never swap it in mid-request
  const [server, setServer] = useState(initial);
  if (initial !== server && !busy) {
    setServer(initial);
    setItems(initial);
  }
  // braces matter: newer browsers return a promise from scrollIntoView, and an effect may return only a cleanup
  useEffect(() => {
    // the panel's content mounts as it opens, so wait a frame for it to exist
    const frame = requestAnimationFrame(() => {
      end.current?.scrollIntoView({ block: "end" });
    });
    return () => cancelAnimationFrame(frame);
  }, [items, working, open]);

  const upsert = (item: ChatItem) =>
    setItems((cur) =>
      cur.some((i) => i.id === item.id) ? cur.map((i) => (i.id === item.id ? item : i)) : [...cur, item],
    );

  async function request(body: unknown) {
    setBusy(true);
    setError(null);
    setWorking(null);
    try {
      await beforeSend();
      const res = await fetch(`/api/listings/${listingId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const e = JSON.parse(line) as ChatEvent;
          if (e.type === "item") upsert(e.item);
          else if (e.type === "working") setWorking(e.name);
          else if (e.type === "error") setError(e.message ?? t(`error.${e.code === "busy" ? "generic" : e.code}`));
        }
      }
    } catch {
      setError(t("error.generic"));
    } finally {
      setBusy(false);
      setWorking(undefined);
      // the stored conversation replaces the local one, and the form, photos and reels
      // show whatever the chat changed
      router.refresh();
    }
  }

  function send(message: string, newChat = false) {
    const clean = message.trim();
    if (!clean || busy) return;
    setText("");
    const mine: ChatItem = { kind: "user", id: `local-${Date.now()}`, text: clean };
    setItems((cur) => (newChat ? [mine] : [...cur, mine]));
    void request({ message: clean, newChat });
  }

  const status =
    working === undefined
      ? ""
      : working === null
        ? t("thinking")
        : t.has(`working.${working}`)
          ? t(`working.${working}`)
          : t("thinking");

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button type="button" variant="outline" className="h-11" />}>
        <Sparkles className="size-4" aria-hidden="true" />
        {t("open")}
      </SheetTrigger>
      <SheetContent className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader className="border-b pr-14">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle>{t("title")}</SheetTitle>
            {items.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-11"
                disabled={busy}
                onClick={() => {
                  setItems([]);
                  setError(null);
                }}
              >
                <MessageSquarePlus className="size-4" aria-hidden="true" />
                {t("newChat")}
              </Button>
            )}
          </div>
          <SheetDescription className="sr-only">{t("intro")}</SheetDescription>
        </SheetHeader>

        <div role="log" aria-live="polite" className="flex-1 space-y-3 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("intro")}</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <Button
                    key={s}
                    type="button"
                    variant="outline"
                    className="h-auto min-h-11 text-left whitespace-normal"
                    disabled={busy}
                    onClick={() => send(t(`suggestions.${s}`), true)}
                  >
                    {t(`suggestions.${s}`)}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            items.map((item) => (
              <ChatEntry
                key={item.id}
                item={item}
                busy={busy}
                onAnswer={(id, yes) => void request({ approve: { toolCallId: id, yes } })}
              />
            ))
          )}
          {status && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              {status}
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div ref={end} />
        </div>

        <form
          className="flex items-end gap-2 border-t p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(text, items.length === 0);
          }}
        >
          <Textarea
            aria-label={t("label")}
            placeholder={t("placeholder")}
            value={text}
            maxLength={CHAT_MESSAGE_MAX}
            rows={2}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(text, items.length === 0);
              }
            }}
            className="min-h-11 resize-none text-sm"
          />
          <Button type="submit" size="icon" className="size-11 shrink-0" disabled={busy || !text.trim()}>
            <SendHorizontal className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("send")}</span>
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
