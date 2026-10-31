import type { Metadata } from "next";
import { getNow, getTimeZone, getTranslations } from "next-intl/server";
import { ArrowLeft, SquarePen } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/app/button-link";
import { TopBar } from "@/components/app/top-bar";
import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { chatGroup, type ChatGroup } from "@/lib/chat-groups";
import { ChatRows, type ChatRow } from "../_components/chat-rows";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("chat"))("conversations") };
}

const GROUPS: ChatGroup[] = ["today", "yesterday", "week", "older"];

/** Every shop conversation, newest first, grouped by day. */
export default async function ConversationsPage() {
  const viewer = await requireWorkspace();
  const ws = forWorkspace(viewer.workspace.id);
  const t = await getTranslations("chat");
  const [rows, now, timeZone] = await Promise.all([ws.chatList(null), getNow(), getTimeZone()]);
  const grouped = new Map<ChatGroup, ChatRow[]>();
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
        {rows.length === 0 ? (
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
      </div>
    </>
  );
}
