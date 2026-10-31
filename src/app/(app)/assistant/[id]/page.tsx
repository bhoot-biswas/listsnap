import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app/top-bar";
import { requireWorkspace } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { chatItems } from "@/server/chat/view";
import { AssistantActions } from "../_components/assistant-actions";
import { AssistantChat } from "../_components/assistant-chat";

/** Read once per request, for both the page and its title. */
const shopChat = cache(async (id: string) => {
  const viewer = await requireWorkspace();
  const ws = forWorkspace(viewer.workspace.id);
  // a listing's chat lives on its Review page, and another shop's isn't found either
  return (await ws.chatInScope(id, null)) ? { ws, title: await ws.chatTitle(id) } : null;
});

export async function generateMetadata({ params }: PageProps<"/assistant/[id]">): Promise<Metadata> {
  const chat = await shopChat((await params).id);
  return { title: chat?.title ?? (await getTranslations("chat"))("pageTitle") };
}

/** One conversation of the shop chat, at its own address. */
export default async function AssistantChatPage({ params }: PageProps<"/assistant/[id]">) {
  const { id } = await params;
  const chat = await shopChat(id);
  if (!chat) notFound();
  const t = await getTranslations("chat");
  return (
    <>
      <TopBar title={chat.title || t("pageTitle")} actions={<AssistantActions newChat />} />
      <AssistantChat key={id} chatId={id} initial={chatItems(await chat.ws.chatMessages(id))} />
    </>
  );
}
