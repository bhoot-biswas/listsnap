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
  // when the running request began, for the time shown beside what's running
  const [since, setSince] = useState<number | null>(null);
  // the conversation of the running turn, once the server has stored it: Stop needs it
  const [stoppable, setStoppable] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  // the last message never reached the server and is back in the box, ready to send again
  const [unsent, setUnsent] = useState(false);
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(0);
  // the message box's text, here so a message that never started a chat can come back to it
  const [draft, setDraft] = useState("");
  // undefined: the conversation used last; null: a new one not sent yet
  const [chatId, setChatId] = useState<string | null | undefined>(initialChatId);

  // the page's copy is of the conversation used last; after the seller opens an earlier one
  // or starts a new one, a refresh of the page (a reel, a save) mustn't swap it back
  const [elsewhere, setElsewhere] = useState(false);

  // after a refresh the server's copy is the truth; never swap it in mid-request
  const [server, setServer] = useState(initial);
  if (initial !== server && !busy) {
    setServer(initial);
    if (!elsewhere) setItems(initial);
  }

  const upsert = (item: ChatItem) =>
    setItems((cur) =>
      cur.some((i) => i.id === item.id) ? cur.map((i) => (i.id === item.id ? item : i)) : [...cur, item],
    );

  /**
   * Sends one request and streams its events. `giveBack` runs when the request failed
   * before the server stored the message: nothing was kept, so the message goes back to
   * the box to try again, instead of vanishing on flaky phone data.
   */
  async function request(body: unknown, giveBack?: () => void) {
    let started = false;
    let failed = false;
    setBusy(true);
    setError(null);
    setUnsent(false);
    setWorking(null);
    setSince(Date.now());
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
          if (e.type === "received") {
            started = true;
            setChatId(e.chatId);
            setStoppable(e.chatId);
          } else if (e.type === "chat") {
            started = true;
            setChatId(e.chatId);
            onStarted?.(e.chatId);
          } else if (e.type === "item") upsert(e.item);
          else if (e.type === "working") setWorking(e.name);
          else if (e.type === "done" && e.chatId) setChatId(e.chatId);
          else if (e.type === "error") {
            failed = true;
            setError(e.message ?? t(`error.${e.code === "busy" ? "generic" : e.code}`));
          }
        }
      }
    } catch {
      failed = true;
      setError(t("error.generic"));
    } finally {
      if (failed && !started && giveBack) {
        giveBack();
        setUnsent(true);
      }
      // a stored message makes this the conversation used last, so the page's copy is this one again
      if (started) setElsewhere(false);
      setBusy(false);
      setWorking(undefined);
      setSince(null);
      setStoppable(null);
      setStopping(false);
      router.refresh();
    }
  }

  /**
   * Asks the server to end the running turn. The turn ends at its next step, so the
   * stream stays open until then and shows what was done before the Stop.
   */
  async function stop() {
    if (!stoppable || stopping) return;
    setStopping(true);
    try {
      const res = await fetch(`/api/chats/${stoppable}/stop`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setStopping(false);
      setError(t("stopFailed"));
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
      setElsewhere(true);
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
    const before = items;
    const sent = photos;
    // a suggestion tapped while typing leaves the typed text alone
    if (message === draft) setDraft("");
    setPhotos([]);
    const mine: ChatItem = {
      kind: "user",
      id: `local-${Date.now()}`,
      text: clean,
      ...(photos.length && { photos: photos.map((p) => p.url) }),
    };
    setItems((cur) => (newChat ? [mine] : [...cur, mine]));
    void request({ message: clean, photoIds: photos.map((p) => p.id), newChat, ...(!newChat && which()) }, () => {
      setItems(before);
      setDraft(clean);
      setPhotos(sent);
    });
    return true;
  }

  return {
    items,
    draft,
    setDraft,
    busy,
    error,
    unsent,
    photos,
    uploading,
    chatId,
    status:
      working === undefined
        ? ""
        : stopping
          ? t("stopping")
          : working && t.has(`working.${working}`)
            ? t(`working.${working}`)
            : t("thinking"),
    since,
    /** The running turn can be stopped: the server has the message, and no Stop is on its way. */
    canStop: !!stoppable && !stopping,
    stop: () => void stop(),
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
      setElsewhere(true);
    },
  };
}

export type Chat = ReturnType<typeof useChat>;
