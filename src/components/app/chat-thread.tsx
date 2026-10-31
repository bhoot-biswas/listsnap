"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatItem } from "@/lib/schemas/chat";
import type { Chat } from "@/hooks/use-chat";
import { ChatEntry, Made, ToolLine } from "./chat-items";

type ToolItem = Extract<ChatItem, { kind: "tool" }>;

/**
 * The messages of a conversation, then what's running and any error. Tool steps in a row
 * fold into one line, so a long turn doesn't push the answer down; what they made stays
 * visible under it. A run with a failed step stays open, so the failure isn't hidden.
 */
export function ChatThread({
  chat,
  visible = true,
  className,
}: {
  chat: Chat;
  /** Scrolls to the latest message again when a hidden panel opens. */
  visible?: boolean;
  className?: string;
}) {
  const end = useRef<HTMLDivElement>(null);
  const { items, busy, status, error } = chat;

  useEffect(() => {
    // a panel's content mounts as it opens, so wait a frame for it to exist; braces
    // matter, since newer browsers return a promise from scrollIntoView
    const frame = requestAnimationFrame(() => {
      end.current?.scrollIntoView({ block: "end" });
    });
    return () => cancelAnimationFrame(frame);
  }, [items, status, visible]);

  const groups: (ChatItem | ToolItem[])[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (item.kind === "tool" && Array.isArray(last)) last.push(item);
    else groups.push(item.kind === "tool" ? [item] : item);
  }

  return (
    <div role="log" aria-live="polite" className={cn("space-y-4", className)}>
      {groups.map((g) =>
        Array.isArray(g) ? (
          g.length > 1 && g.every((i) => i.ok) ? (
            <Steps key={g[0]!.id} run={g} />
          ) : (
            g.map((item) => <ChatEntry key={item.id} item={item} busy={busy} onAnswer={chat.answer} />)
          )
        ) : (
          <ChatEntry key={g.id} item={g} busy={busy} onAnswer={chat.answer} />
        ),
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
  );
}

function Steps({ run }: { run: ToolItem[] }) {
  const t = useTranslations("chat");
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="-mx-1 flex min-h-11 items-center gap-1.5 rounded-md px-1 text-xs text-muted-foreground hover:text-foreground md:min-h-8"
      >
        <Check className="size-3.5 text-success" aria-hidden="true" />
        {t("stepsDone", { n: run.length })}
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} aria-hidden="true" />
      </button>
      {open && (
        <div className="space-y-1 border-l pl-3">
          {run.map((item) => (
            <ToolLine key={item.id} item={item} />
          ))}
        </div>
      )}
      {run.map((item) => (
        <Made key={item.id} item={item} />
      ))}
    </div>
  );
}
