"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Ellipsis, History, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { deleteChat, renameChat } from "@/server/actions/chats";

const isBangla = (text: string) => /[ঀ-৿]/.test(text);

type Mode = "view" | "rename" | "delete";

/**
 * One conversation in a list: a link with its time, and a "…" menu to rename or delete
 * it. The menu shows on hover or focus on desktop and always on phone, where there's no
 * hover. Renaming and the delete question replace the row in place.
 */
export function ChatRow({
  id,
  title,
  when,
  iso,
  full,
}: {
  id: string;
  title: string;
  /** "5 minutes ago", "Mon", "Sep 19". */
  when: string;
  iso: string;
  /** The full date and time, on hover. */
  full: string;
}) {
  const [mode, setMode] = useState<Mode>("view");
  if (mode !== "view")
    return (
      <li className="py-1">
        <ManageForm id={id} title={title} mode={mode} onDone={() => setMode("view")} />
      </li>
    );
  return (
    <li className="group -mx-2 flex items-center rounded-md hover:bg-muted/60">
      <Link
        href={`/assistant/${id}` as Route}
        className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-4 py-2 pl-2 text-sm"
      >
        <span lang={isBangla(title) ? "bn" : undefined} className="min-w-0 truncate">
          {title}
        </span>
        <time dateTime={iso} title={full} className="shrink-0 text-xs text-muted-foreground">
          {when}
        </time>
      </Link>
      <ChatMenu
        onPick={setMode}
        className="md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100 md:data-[popup-open]:opacity-100"
      />
    </li>
  );
}

/**
 * The "…" menu on a conversation's own page. Its forms open under the top bar, at its
 * right edge (the sticky bar is what they're placed against). On phone the menu also
 * holds Conversations, which has no room of its own there.
 */
export function ChatPageMenu({ id, title }: { id: string; title: string }) {
  const [mode, setMode] = useState<Mode>("view");
  return (
    <>
      <ChatMenu onPick={setMode} conversations />
      {mode !== "view" && (
        <div className="absolute top-full right-4 z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-lg border bg-popover p-3 shadow-md md:right-6">
          <ManageForm id={id} title={title} mode={mode} onDone={() => setMode("view")} leaveOnDelete />
        </div>
      )}
    </>
  );
}

function ChatMenu({
  onPick,
  conversations = false,
  className,
}: {
  onPick: (mode: Mode) => void;
  /** Adds a link to the list of conversations, on phone only. */
  conversations?: boolean;
  className?: string;
}) {
  const t = useTranslations("chat.manage");
  const tChat = useTranslations("chat");
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="ghost" size="icon" className={cn("size-11 md:size-8", className)} />}
      >
        <Ellipsis className="size-4" aria-hidden="true" />
        <span className="sr-only">{t("menu")}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {conversations && (
          <DropdownMenuItem className="min-h-11 md:hidden" onClick={() => router.push("/assistant/chats")}>
            <History aria-hidden="true" />
            {tChat("conversations")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="min-h-11 md:min-h-8" onClick={() => onPick("rename")}>
          <Pencil aria-hidden="true" />
          {t("rename")}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" className="min-h-11 md:min-h-8" onClick={() => onPick("delete")}>
          <Trash2 aria-hidden="true" />
          {t("delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The rename field or the delete question; the page refreshes once it's done. */
function ManageForm({
  id,
  title,
  mode,
  onDone,
  leaveOnDelete = false,
}: {
  id: string;
  title: string;
  mode: "rename" | "delete";
  onDone: () => void;
  /** On the conversation's own page, a deleted chat sends the seller to the list. */
  leaveOnDelete?: boolean;
}) {
  const t = useTranslations("chat.manage");
  const router = useRouter();
  const [name, setName] = useState(title);
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      const r = mode === "rename" ? await renameChat(id, name) : await deleteChat(id);
      if (!r.ok) {
        toast.error(t(mode === "rename" ? "renameFailed" : "deleteFailed"));
        return;
      }
      if (mode === "delete") toast.success(t("deleted"));
      onDone();
      if (mode === "delete" && leaveOnDelete) router.push("/assistant/chats");
      else router.refresh();
    });

  const buttons = (yes: string, destructive: boolean) => (
    <div className="flex flex-wrap gap-2">
      <Button
        type="submit"
        variant={destructive ? "destructive" : "default"}
        className="h-11 md:h-8"
        disabled={pending || (mode === "rename" && !name.trim())}
      >
        {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
        {yes}
      </Button>
      {/* autoFocus on the delete question: it replaced the menu that had focus */}
      <Button
        type="button"
        variant="outline"
        className="h-11 md:h-8"
        onClick={onDone}
        disabled={pending}
        autoFocus={destructive}
      >
        {t("cancel")}
      </Button>
    </div>
  );

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        run();
      }}
      onKeyDown={(e) => e.key === "Escape" && onDone()}
    >
      {mode === "rename" ? (
        <>
          <Input
            aria-label={t("title")}
            value={name}
            maxLength={120}
            // autoFocus: the field replaced the menu that had focus
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setName(e.target.value)}
            className="h-11 md:h-9"
          />
          {buttons(t("save"), false)}
        </>
      ) : (
        <div role="group" aria-label={t("deleteQuestion")} className="space-y-2">
          <p className="text-sm font-medium">{t("deleteQuestion")}</p>
          <p className="text-xs text-muted-foreground">{t("deleteHint")}</p>
          {buttons(t("delete"), true)}
        </div>
      )}
    </form>
  );
}
