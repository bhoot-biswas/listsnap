"use client";

import { useTranslations } from "next-intl";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatItem } from "@/lib/schemas/chat";
import { useChat } from "@/hooks/use-chat";
import { ChatComposer } from "./chat-composer";
import { ChatHistory } from "./chat-history";
import { ChatThread } from "./chat-thread";

/**
 * A listing's chat in Review's side panel: the conversation used last, a list of earlier
 * ones and a new-chat button above it, the message box below. It scrolls inside the panel.
 */
export function ChatPanel({
  endpoint,
  historyUrl,
  initial,
  intro,
  placeholder,
  suggestions,
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
  /** Scrolls to the latest message again when a hidden panel opens. */
  visible?: boolean;
  /** Saves the seller's pending edits first, so the chat works on what they see. */
  beforeSend?: () => Promise<unknown>;
}) {
  const t = useTranslations("chat");
  const chat = useChat({ endpoint, initial, beforeSend });
  const empty = chat.items.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex justify-end gap-1 border-b px-3 py-1">
        <ChatHistory url={historyUrl} current={chat.chatId} disabled={chat.busy} onPick={chat.open} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-11"
          disabled={chat.busy || empty}
          onClick={chat.reset}
        >
          <MessageSquarePlus className="size-4" aria-hidden="true" />
          {t("newChat")}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {empty && (
          <div className="mb-3 space-y-3">
            <p className="text-sm text-muted-foreground">{intro}</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant="outline"
                  className="h-auto min-h-11 text-left whitespace-normal"
                  disabled={chat.busy}
                  onClick={() => chat.send(s, true)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}
        <ChatThread chat={chat} visible={visible} />
      </div>

      <div className="border-t bg-background p-3">
        <ChatComposer chat={chat} placeholder={placeholder} newChat={empty} />
      </div>
    </div>
  );
}
