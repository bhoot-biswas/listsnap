"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, MessageSquarePlus, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CHAT_MESSAGE_MAX, type ChatEvent, type ChatItem } from "@/lib/schemas/chat";
import { ChatEntry } from "./chat-items";

/**
 * The conversation and its message box, shared by a listing's chat (a side panel on
 * Review) and the shop chat (its own page). Each request streams events, one JSON
 * object per line; the conversation is stored on the server, so a reload shows it
 * again, and the page refreshes afterwards to show whatever the chat changed.
 */
export function ChatPanel({
  endpoint,
  initial,
  intro,
  placeholder,
  suggestions,
  layout,
  visible = true,
  beforeSend,
}: {
  endpoint: string;
  initial: ChatItem[];
  intro: string;
  placeholder: string;
  suggestions: string[];
  /** "panel" scrolls inside a fixed-height box; "page" flows with the page, the box stuck to the bottom. */
  layout: "panel" | "page";
  /** Scrolls to the latest message again when a hidden panel opens. */
  visible?: boolean;
  /** Saves the seller's pending edits first, so the chat works on what they see. */
  beforeSend?: () => Promise<unknown>;
}) {
  const t = useTranslations("chat");
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  // undefined: idle; null: the model is thinking; a name: that tool is running
  const [working, setWorking] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  // after a refresh the server's copy is the truth; never swap it in mid-request
  const [server, setServer] = useState(initial);
  if (initial !== server && !busy) {
    setServer(initial);
    setItems(initial);
  }
  useEffect(() => {
    // a panel's content mounts as it opens, so wait a frame for it to exist; braces
    // matter, since newer browsers return a promise from scrollIntoView
    const frame = requestAnimationFrame(() => {
      end.current?.scrollIntoView({ block: "end" });
    });
    return () => cancelAnimationFrame(frame);
  }, [items, working, visible]);

  const upsert = (item: ChatItem) =>
    setItems((cur) =>
      cur.some((i) => i.id === item.id) ? cur.map((i) => (i.id === item.id ? item : i)) : [...cur, item],
    );

  async function request(body: unknown) {
    setBusy(true);
    setError(null);
    setWorking(null);
    try {
      await beforeSend?.();
      const res = await fetch(endpoint, {
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
    working === undefined ? "" : working && t.has(`working.${working}`) ? t(`working.${working}`) : t("thinking");

  return (
    <div className={cn("flex flex-col", layout === "panel" ? "min-h-0 flex-1" : "flex-1")}>
      {items.length > 0 && (
        <div className="flex justify-end border-b px-3 py-1">
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
        </div>
      )}

      <div
        role="log"
        aria-live="polite"
        className={cn("flex-1 space-y-3 p-4", layout === "panel" && "overflow-y-auto")}
      >
        {items.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{intro}</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant="outline"
                  className="h-auto min-h-11 text-left whitespace-normal"
                  disabled={busy}
                  onClick={() => send(s, true)}
                >
                  {s}
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
        className={cn(
          "flex items-end gap-2 border-t bg-background p-3",
          layout === "page" && "sticky bottom-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]",
        )}
        onSubmit={(e) => {
          e.preventDefault();
          send(text, items.length === 0);
        }}
      >
        <Textarea
          aria-label={t("label")}
          placeholder={placeholder}
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
    </div>
  );
}
