import type { Metadata, Route } from "next";
import { getNow, getTimeZone, getTranslations } from "next-intl/server";
import { ArrowLeft, SquarePen } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/app/button-link";
import { TopBar } from "@/components/app/top-bar";
import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { chatGroup, type ChatGroup } from "@/lib/chat-groups";
import { ChatRows, type ChatListRow } from "../_components/chat-rows";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("chat"))("conversations") };
}

const GROUPS: ChatGroup[] = ["today", "yesterday", "week", "older"];

/**
 * The shop's conversations, newest first, grouped by day, a page at a time: "Show older"
 * continues after the last one shown.
 */
export default async function ConversationsPage({ searchParams }: PageProps<"/assistant/chats">) {
  const viewer = await requireWorkspace();
  const ws = forWorkspace(viewer.workspace.id);
  const t = await getTranslations("chat");
  const { before: raw } = await searchParams;
  const before = typeof raw === "string" && !Number.isNaN(Date.parse(raw)) ? new Date(raw) : undefined;
  const [{ rows, more }, now, timeZone] = await Promise.all([ws.shopChatPage(before), getNow(), getTimeZone()]);
  const grouped = new Map<ChatGroup, ChatListRow[]>();
  for (const r of rows) {
    const g = chatGroup(new Date(r.updated_at), now, timeZone);
    grouped.set(g, [...(grouped.get(g) ?? []), r]);
  }

  return (
    <>
      <TopBar
        title={t("conversations")}
        actions={
          <ButtonLink href="/assistant" variant="ghost" className="size-11 px-0 md:size-auto md:h-9 md:px-3">
            <SquarePen aria-hidden="true" />
            <span className="max-md:sr-only">{t("newChat")}</span>
          </ButtonLink>
        }
      />
      <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
        <Link
          href="/assistant"
          className="-ml-1 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground md:min-h-0"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("pageTitle")}
        </Link>
        {before && (
          <Link
            href="/assistant/chats"
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline md:min-h-0"
          >
            {t("list.newest")}
          </Link>
        )}
        {rows.length === 0 && !before ? (
          <div className="space-y-3 py-10 text-center">
            <p className="text-muted-foreground">{t("list.empty")}</p>
            <ButtonLink href="/assistant">{t("list.startOne")}</ButtonLink>
          </div>
        ) : (
          GROUPS.filter((g) => grouped.has(g)).map((g) => (
            <section key={g} aria-labelledby={`group-${g}`} className="space-y-1">
              <h2 id={`group-${g}`} className="text-xs font-medium text-muted-foreground">
                {t(`list.${g}`)}
              </h2>
              <ChatRows rows={grouped.get(g)!} />
            </section>
          ))
        )}
        {more && (
          <div className="flex justify-center">
            <ButtonLink
              href={
                `/assistant/chats?before=${encodeURIComponent(new Date(rows.at(-1)!.updated_at).toISOString())}` as Route
              }
              variant="outline"
              className="h-11 md:h-9"
            >
              {t("list.showOlder")}
            </ButtonLink>
          </div>
        )}
      </div>
    </>
  );
}
