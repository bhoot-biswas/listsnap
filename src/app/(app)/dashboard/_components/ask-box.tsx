"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ImagePlus, SendHorizontal, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChatMic } from "@/components/app/chat-mic";
import { CHAT_MESSAGE_MAX } from "@/lib/schemas/chat";
import { handAsk } from "@/lib/ask-handoff";

/**
 * A one-line way into the Assistant: typed or spoken, and the start screen sends it. The
 * question goes there in this tab's session storage, not the address, so it stays out of
 * the browser's history and the server's logs. Photos need the full box, so the photo
 * button opens the start screen.
 */
export function AskBox({ needsReview }: { needsReview: number }) {
  const t = useTranslations("dashboard.ask");
  const router = useRouter();
  const [text, setText] = useState("");
  const [dictating, setDictating] = useState(false);
  const typed = useRef("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const ask = text.trim();
        if (!ask || dictating) return;
        handAsk(ask);
        router.push("/assistant");
      }}
      className="flex items-center gap-1 rounded-2xl border bg-card py-1 pr-1 pl-3 shadow-xs focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
    >
      <Sparkles className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={dictating}
        maxLength={CHAT_MESSAGE_MAX}
        aria-label={t("label")}
        placeholder={needsReview > 0 ? t("placeholderReview", { n: needsReview }) : t("placeholder")}
        className="h-11 min-w-0 flex-1 bg-transparent px-2 text-base outline-none placeholder:text-muted-foreground md:h-9 md:text-sm"
      />
      <Link
        href="/assistant"
        className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:size-9"
      >
        <ImagePlus className="size-4" aria-hidden="true" />
        <span className="sr-only">{t("photo")}</span>
      </Link>
      {/* the mic's status line stays short here, so the question keeps its room */}
      <div className="flex max-w-36 min-w-0 shrink-0 items-center">
        <ChatMic
          onWorking={(working) => {
            if (working) typed.current = text.trimEnd();
            setDictating(working);
          }}
          onWords={(words) => setText(typed.current ? `${typed.current} ${words}` : words)}
        />
      </div>
      <Button
        type="submit"
        size="icon"
        className="size-11 shrink-0 rounded-full md:size-9"
        disabled={dictating || !text.trim()}
      >
        <SendHorizontal className="size-4" aria-hidden="true" />
        <span className="sr-only">{t("send")}</span>
      </Button>
    </form>
  );
}
