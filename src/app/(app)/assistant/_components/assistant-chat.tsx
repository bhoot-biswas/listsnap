"use client";

import { useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { CHAT_MESSAGE_MAX, type ChatItem } from "@/lib/schemas/chat";
import { useChat } from "@/hooks/use-chat";
import { ChatComposer } from "@/components/app/chat-composer";
import { ChatThread } from "@/components/app/chat-thread";

/**
 * The shop chat. With no conversation yet it's the start screen: a heading, the message
 * box, suggestions and the recent conversations (`children`). The first message turns it
 * into the conversation and gives it its own address, without a reload, so the reply
 * keeps streaming in; the page refresh afterwards loads that conversation's page.
 */
export function AssistantChat({
  initial,
  chatId,
  heading,
  suggestions = [],
  ask,
  children,
}: {
  initial: ChatItem[];
  /** The conversation on screen; none on the start screen. */
  chatId?: string;
  heading?: string;
  suggestions?: string[];
  /** A message the Dashboard's ask box sent here, to send at once. */
  ask?: string;
  children?: React.ReactNode;
}) {
  const t = useTranslations("chat");
  const chat = useChat({
    endpoint: "/api/chat",
    initial,
    chatId,
    onStarted: (id) => window.history.pushState(null, "", `/assistant/${id}`),
  });

  // once only, even when React runs effects twice; dropped from the address first, so
  // going back to the start screen doesn't send it again
  const asked = useRef(false);
  useEffect(() => {
    if (!ask || asked.current) return;
    asked.current = true;
    window.history.replaceState(null, "", "/assistant");
    chat.send(ask.slice(0, CHAT_MESSAGE_MAX), true);
  }, [ask, chat]);

  if (chat.items.length === 0 && !chatId)
    return (
      <div className="mx-auto w-full max-w-2xl space-y-6 px-4 pt-8 pb-10 md:pt-20">
        <h2 className="text-center text-2xl font-semibold text-balance md:text-3xl">{heading}</h2>
        <div className="space-y-2">
          <ChatComposer chat={chat} placeholder={t("shopPlaceholder")} newChat autoFocus />
          {chat.error && <p className="px-1 text-sm text-destructive">{chat.error}</p>}
        </div>
        <ul>
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                disabled={chat.busy}
                onClick={() => chat.send(s, true)}
                className="flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left text-sm hover:bg-muted/60 disabled:opacity-50"
              >
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {s}
              </button>
            </li>
          ))}
        </ul>
        {children}
      </div>
    );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
      <ChatThread chat={chat} className="flex-1 px-4 py-6" />
      <div className="sticky bottom-0 bg-background px-4 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <ChatComposer chat={chat} placeholder={t("replyPlaceholder")} newChat={false} />
      </div>
    </div>
  );
}
