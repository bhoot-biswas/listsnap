"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, Loader2, SendHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CHAT_MESSAGE_MAX, CHAT_PHOTOS_MAX } from "@/lib/schemas/chat";
import type { Chat } from "@/hooks/use-chat";
import { ChatMic } from "./chat-mic";

/**
 * The message box: one rounded card with the text on top and the photo, microphone and
 * send buttons below. Enter sends, Shift+Enter starts a new line. Spoken words join the
 * text, so the seller sees them before they're sent.
 */
export function ChatComposer({
  chat,
  placeholder,
  newChat,
  autoFocus,
  className,
}: {
  chat: Chat;
  placeholder: string;
  /** The next message starts a new conversation. */
  newChat: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const t = useTranslations("chat");
  const picker = useRef<HTMLInputElement>(null);
  const [dictating, setDictating] = useState(false);
  const { busy, uploading, photos } = chat;

  const submit = () => !dictating && chat.send(chat.draft, newChat);

  return (
    <form
      className={cn(
        "space-y-2 rounded-2xl border bg-card p-2 shadow-xs focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        className,
      )}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {(photos.length > 0 || uploading > 0) && (
        <div className="flex flex-wrap items-center gap-2 px-1 pt-1">
          {photos.map((p) => (
            <button
              key={p.id}
              type="button"
              className="group relative size-16 overflow-hidden rounded-md border"
              onClick={() => chat.removePhoto(p.id)}
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
      <textarea
        aria-label={t("label")}
        placeholder={placeholder}
        value={chat.draft}
        maxLength={CHAT_MESSAGE_MAX}
        rows={2}
        autoFocus={autoFocus}
        onChange={(e) => chat.setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        className="field-sizing-content max-h-48 min-h-11 w-full resize-none bg-transparent px-2 pt-1 text-base outline-none placeholder:text-muted-foreground md:text-sm"
      />
      <div className="flex items-center gap-1">
        <input
          ref={picker}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            chat.attach([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 md:size-9"
          disabled={busy || photos.length + uploading >= CHAT_PHOTOS_MAX}
          onClick={() => picker.current?.click()}
        >
          <ImagePlus className="size-4" aria-hidden="true" />
          <span className="sr-only">{t("attach")}</span>
        </Button>
        <ChatMic
          disabled={busy}
          onWorking={setDictating}
          onText={(text) => chat.setDraft((cur) => (cur.trim() ? `${cur.trimEnd()} ${text}` : text))}
        />
        <Button
          type="submit"
          size="icon"
          className="size-11 shrink-0 rounded-full md:size-9"
          disabled={busy || dictating || uploading > 0 || (!chat.draft.trim() && !photos.length)}
        >
          <SendHorizontal className="size-4" aria-hidden="true" />
          <span className="sr-only">{t("send")}</span>
        </Button>
      </div>
    </form>
  );
}
