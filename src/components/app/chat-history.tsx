"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Check, History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ChatSummary } from "@/lib/schemas/chat";
import { relativeTime } from "@/lib/relative-time";

const isBangla = (text: string) => /[ঀ-৿]/.test(text);

/**
 * The earlier conversations of this chat box, read each time the list opens, so one
 * the seller just had is already there. Picking one shows it, and the next message
 * carries it on.
 */
export function ChatHistory({
  url,
  current,
  disabled,
  onPick,
}: {
  url: string;
  /**
   * The conversation on screen, marked in the list: undefined for the one used last (the
   * first listed), null while it's a new one.
   */
  current: string | null | undefined;
  disabled: boolean;
  onPick: (id: string) => void;
}) {
  const t = useTranslations("chat.history");
  const format = useFormatter();
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  // "an hour ago" counts from when the list was read, not from each render
  const [loadedAt, setLoadedAt] = useState(() => new Date());
  const [failed, setFailed] = useState(false);

  async function load() {
    setFailed(false);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setChats(((await res.json()) as { chats: ChatSummary[] }).chats);
      setLoadedAt(new Date());
    } catch {
      setFailed(true);
    }
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && void load()}>
      <DropdownMenuTrigger
        render={<Button type="button" variant="ghost" size="sm" className="h-11" disabled={disabled} />}
      >
        <History className="size-4" aria-hidden="true" />
        {t("open")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-y-auto">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("title")}</DropdownMenuLabel>
          {failed ? (
            <p className="px-2 py-1.5 text-sm text-destructive">{t("failed")}</p>
          ) : chats === null ? (
            <p className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              {t("loading")}
            </p>
          ) : chats.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            chats.map((c) => (
              <DropdownMenuItem key={c.id} className="min-h-11 items-start gap-2" onClick={() => onPick(c.id)}>
                <span className="min-w-0 flex-1">
                  <span lang={isBangla(c.title) ? "bn" : undefined} className="block truncate">
                    {c.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {relativeTime(format, new Date(c.updatedAt), loadedAt)}
                  </span>
                </span>
                {(current === undefined ? c.id === chats[0]!.id : c.id === current) && (
                  <Check className="mt-0.5 size-4 shrink-0" aria-label={t("current")} />
                )}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
