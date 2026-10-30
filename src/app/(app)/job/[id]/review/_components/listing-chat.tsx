"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ChatPanel } from "@/components/app/chat-panel";
import type { ChatItem } from "@/lib/schemas/chat";

const SUGGESTIONS = ["status", "reel", "eid", "store"] as const;

/** A listing's chat, in a side panel so the form stays in view while the chat changes it. */
export function ListingChat({
  listingId,
  initial,
  beforeSend,
}: {
  listingId: string;
  initial: ChatItem[];
  beforeSend: () => Promise<boolean>;
}) {
  const t = useTranslations("chat");
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button type="button" variant="outline" className="h-11" />}>
        <Sparkles className="size-4" aria-hidden="true" />
        {t("open")}
      </SheetTrigger>
      <SheetContent className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader className="border-b pr-14">
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription className="sr-only">{t("intro")}</SheetDescription>
        </SheetHeader>
        <ChatPanel
          endpoint={`/api/listings/${listingId}/chat`}
          historyUrl={`/api/chats?listing=${listingId}`}
          initial={initial}
          intro={t("intro")}
          placeholder={t("placeholder")}
          suggestions={SUGGESTIONS.map((s) => t(`suggestions.${s}`))}
          layout="panel"
          visible={open}
          beforeSend={beforeSend}
        />
      </SheetContent>
    </Sheet>
  );
}
