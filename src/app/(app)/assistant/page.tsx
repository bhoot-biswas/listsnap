import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app/top-bar";
import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { AssistantActions } from "./_components/assistant-actions";
import { AssistantChat } from "./_components/assistant-chat";
import { ChatRows } from "./_components/chat-rows";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("chat"))("pageTitle") };
}

const SUGGESTIONS = ["review", "ready", "eid", "left"] as const;
/** Recent conversations under the start screen; the rest are a link away. */
const RECENT = 3;

/** The shop chat's start screen: always a new conversation, with the last few below it. */
export default async function AssistantPage({ searchParams }: PageProps<"/assistant">) {
  const viewer = await requireWorkspace();
  const ws = forWorkspace(viewer.workspace.id);
  const t = await getTranslations("chat");
  const [chats, counts, { ask }] = await Promise.all([ws.chatList(null), ws.counts(), searchParams]);
  // the first suggestion names what's waiting, when something is
  const suggestions = SUGGESTIONS.map((s) =>
    s === "review" && counts.needsReview > 0
      ? t("shopSuggestions.reviewCount", { n: counts.needsReview })
      : t(`shopSuggestions.${s}`),
  );

  return (
    <>
      <TopBar title={t("pageTitle")} actions={<AssistantActions />} />
      <AssistantChat
        initial={[]}
        heading={t("start.heading", { shop: viewer.workspace.name })}
        suggestions={suggestions}
        ask={typeof ask === "string" && ask.trim() ? ask : undefined}
      >
        {chats.length > 0 && (
          <section aria-labelledby="recent" className="space-y-1 px-2">
            <div className="flex items-center justify-between">
              <h3 id="recent" className="text-sm font-medium text-muted-foreground">
                {t("start.recent")}
              </h3>
              <Link
                href="/assistant/chats"
                className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline md:min-h-0"
              >
                {t("start.seeAll")}
              </Link>
            </div>
            <ChatRows rows={chats.slice(0, RECENT)} />
          </section>
        )}
      </AssistantChat>
    </>
  );
}
