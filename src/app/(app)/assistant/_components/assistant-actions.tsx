import { getTranslations } from "next-intl/server";
import { History, SquarePen } from "lucide-react";
import { ButtonLink } from "@/components/app/button-link";

/** The top bar's links: the list of conversations and, inside one, a new chat. Icons only on phone. */
export async function AssistantActions({ newChat = false }: { newChat?: boolean }) {
  const t = await getTranslations("chat");
  return (
    <>
      <ButtonLink href="/assistant/chats" variant="ghost" className="size-11 px-0 md:size-auto md:h-9 md:px-3">
        <History aria-hidden="true" />
        <span className="max-md:sr-only">{t("conversations")}</span>
      </ButtonLink>
      {newChat && (
        <ButtonLink href="/assistant" variant="ghost" className="size-11 px-0 md:size-auto md:h-9 md:px-3">
          <SquarePen aria-hidden="true" />
          <span className="max-md:sr-only">{t("newChat")}</span>
        </ButtonLink>
      )}
    </>
  );
}
