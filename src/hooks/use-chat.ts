"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { resizeForUpload } from "@/lib/resize-image";
import { CHAT_PHOTOS_MAX, type ChatEvent, type ChatItem } from "@/lib/schemas/chat";

/**
 * A conversation's state and its requests, shared by every chat box. Each request
 * streams events, one JSON object per line; the conversation is stored on the server, so
 * a reload shows it again, and the page refreshes afterwards to show whatever the chat
 * changed. Photos upload as soon as they're picked, so sending only names them.
 */
export function useChat({
  endpoint,
  initial,
  chatId: initialChatId,
  beforeSend,
  onStarted,
}: {
  endpoint: string;
  initial: ChatItem[];
  /** undefined: the conversation used last, as the page loaded it; a string: that one. */
  chatId?: string;
  /** Saves the seller's pending edits first, so the chat works on what they see. */
  beforeSend?: () => Promise<unknown>;
  /** A message just started a new conversation. */
  onStarted?: (chatId: string) => void;
}) {
  const t = useTranslations("chat");
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  // undefined: idle; null: the model is thinking; a name: that tool is running
  const [working, setWorking] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(0);
  // undefined: the conversation used last; null: a new one not sent yet
  const [chatId, setChatId] = useState<string | null | undefined>(initialChatId);

  // after a refresh the server's copy is the truth; never swap it in mid-request
  const [server, setServer] = useState(initial);
  if (initial !== server && !busy) {
    setServer(initial);
    setItems(initial);
  }

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
          if (e.type === "chat") {
            setChatId(e.chatId);
            onStarted?.(e.chatId);
          } else if (e.type === "item") upsert(e.item);
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

  /** Sends a message; returns false when there's nothing to send or a request is running. */
  function send(message: string, newChat = false): boolean {
    const clean = message.trim();
    if ((!clean && !photos.length) || busy || uploading) return false;
    setPhotos([]);
    const mine: ChatItem = {
      kind: "user",
      id: `local-${Date.now()}`,
      text: clean,
      ...(photos.length && { photos: photos.map((p) => p.url) }),
    };
    setItems((cur) => (newChat ? [mine] : [...cur, mine]));
    void request({ message: clean, photoIds: photos.map((p) => p.id), newChat, ...(!newChat && which()) });
    return true;
  }

  return {
    items,
    busy,
    error,
    photos,
    uploading,
    chatId,
    status:
      working === undefined ? "" : working && t.has(`working.${working}`) ? t(`working.${working}`) : t("thinking"),
    send,
    answer: (id: string, yes: boolean) => void request({ approve: { toolCallId: id, yes }, ...which() }),
    attach: (files: File[]) => void attach(files),
    removePhoto: (id: string) => setPhotos((cur) => cur.filter((c) => c.id !== id)),
    open: (id: string) => void open(id),
    /** An empty, unsent conversation; the next message starts a new one. */
    reset: () => {
      setItems([]);
      setChatId(null);
      setError(null);
    },
  };
}

export type Chat = ReturnType<typeof useChat>;
