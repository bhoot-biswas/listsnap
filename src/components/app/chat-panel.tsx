"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ImagePlus, Loader2, MessageSquarePlus, SendHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { resizeForUpload } from "@/lib/resize-image";
import { CHAT_MESSAGE_MAX, CHAT_PHOTOS_MAX, type ChatEvent, type ChatItem } from "@/lib/schemas/chat";
import { ChatEntry } from "./chat-items";
import { ChatHistory } from "./chat-history";

/**
 * The conversation and its message box, shared by a listing's chat (a side panel on
 * Review) and the shop chat (its own page). Each request streams events, one JSON
 * object per line; the conversation is stored on the server, so a reload shows it
 * again, and the page refreshes afterwards to show whatever the chat changed. Photos
 * upload as soon as they're picked, so sending only names them.
 */
export function ChatPanel({
  endpoint,
  historyUrl,
  initial,
  intro,
  placeholder,
  suggestions,
  layout,
  visible = true,
  beforeSend,
}: {
  endpoint: string;
  /** Where the list of earlier conversations comes from. */
  historyUrl: string;
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
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(0);
  // undefined: the conversation used last, as the page loaded it; null: a new one not sent yet
  const [chatId, setChatId] = useState<string | null | undefined>(undefined);
  const end = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);

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
          else if (e.type === "done" && e.chatId) setChatId(e.chatId);
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

  async function attach(files: File[]) {
    setError(null);
    for (const file of files.slice(0, CHAT_PHOTOS_MAX - photos.length)) {
      setUploading((n) => n + 1);
      try {
        const form = new FormData();
        form.append("photo", await resizeForUpload(file), file.name);
        const res = await fetch("/api/chat/photos", { method: "POST", body: form });
        const body = (await res.json().catch(() => null)) as {
          id?: string;
          url?: string;
          error?: { message?: string };
        } | null;
        if (!res.ok || !body?.id || !body.url) throw new Error(body?.error?.message ?? "");
        const photo = { id: body.id, url: body.url };
        setPhotos((cur) => (cur.length < CHAT_PHOTOS_MAX ? [...cur, photo] : cur));
      } catch (err) {
        setError((err as Error).message || t("photoFailed"));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function open(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/chats/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems(((await res.json()) as { items: ChatItem[] }).items);
      setChatId(id);
    } catch {
      setError(t("history.failed"));
    } finally {
      setBusy(false);
    }
  }

  // a message or an answer goes to the conversation on screen
  const which = () => (typeof chatId === "string" ? { chatId } : {});

  function send(message: string, newChat = false) {
    const clean = message.trim();
    if ((!clean && !photos.length) || busy || uploading) return;
    setText("");
    setPhotos([]);
    const mine: ChatItem = {
      kind: "user",
      id: `local-${Date.now()}`,
      text: clean,
      ...(photos.length && { photos: photos.map((p) => p.url) }),
    };
    setItems((cur) => (newChat ? [mine] : [...cur, mine]));
    void request({ message: clean, photoIds: photos.map((p) => p.id), newChat, ...(!newChat && which()) });
  }

  const status =
    working === undefined ? "" : working && t.has(`working.${working}`) ? t(`working.${working}`) : t("thinking");

  return (
    <div className={cn("flex flex-col", layout === "panel" ? "min-h-0 flex-1" : "flex-1")}>
      <div className="flex justify-end gap-1 border-b px-3 py-1">
        <ChatHistory url={historyUrl} current={chatId} disabled={busy} onPick={(id) => void open(id)} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-11"
          disabled={busy || items.length === 0}
          onClick={() => {
            setItems([]);
            setChatId(null);
            setError(null);
          }}
        >
          <MessageSquarePlus className="size-4" aria-hidden="true" />
          {t("newChat")}
        </Button>
      </div>

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
              onAnswer={(id, yes) => void request({ approve: { toolCallId: id, yes }, ...which() })}
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
          "space-y-2 border-t bg-background p-3",
          layout === "page" && "sticky bottom-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]",
        )}
        onSubmit={(e) => {
          e.preventDefault();
          send(text, items.length === 0);
        }}
      >
        {(photos.length > 0 || uploading > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {photos.map((p) => (
              <button
                key={p.id}
                type="button"
                className="group relative size-16 overflow-hidden rounded-md border"
                onClick={() => setPhotos((cur) => cur.filter((c) => c.id !== p.id))}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- our own /media URL */}
                <img src={p.url} alt="" className="size-full object-cover" />
                <span className="absolute top-0.5 right-0.5 rounded-full bg-background/90 p-0.5">
                  <X className="size-3.5" aria-hidden="true" />
                </span>
                <span className="sr-only">{t("removePhoto")}</span>
              </button>
            ))}
            {uploading > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                {t("uploading")}
              </p>
            )}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={picker}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              void attach([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 shrink-0"
            disabled={busy || photos.length + uploading >= CHAT_PHOTOS_MAX}
            onClick={() => picker.current?.click()}
          >
            <ImagePlus className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("attach")}</span>
          </Button>
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
          <Button
            type="submit"
            size="icon"
            className="size-11 shrink-0"
            disabled={busy || uploading > 0 || (!text.trim() && !photos.length)}
          >
            <SendHorizontal className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("send")}</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
