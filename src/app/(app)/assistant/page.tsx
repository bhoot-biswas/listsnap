import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app/top-bar";
import { ChatPanel } from "@/components/app/chat-panel";
import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { chatItems } from "@/server/chat/view";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("chat"))("pageTitle") };
}

const SUGGESTIONS = ["review", "ready", "eid", "left"] as const;

/** The shop chat: one conversation about the whole shop, on its own page. */
export default async function AssistantPage() {
  const viewer = await requireWorkspace();
  const ws = forWorkspace(viewer.workspace.id);
  const chatId = await ws.listingChat(null);
  const history = chatId ? await ws.chatMessages(chatId) : [];
  const t = await getTranslations("chat");

  return (
    <>
      <TopBar title={t("pageTitle")} />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        <ChatPanel
          endpoint="/api/chat"
          initial={chatItems(history)}
          intro={t("shopIntro")}
          placeholder={t("shopPlaceholder")}
          suggestions={SUGGESTIONS.map((s) => t(`shopSuggestions.${s}`))}
          layout="page"
        />
      </div>
    </>
  );
}
