import { getTranslations } from "next-intl/server";
import { ImagePlus, SendHorizontal, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CHAT_MESSAGE_MAX } from "@/lib/schemas/chat";

/**
 * A one-line way into the Assistant. A plain form, so Enter goes to the start screen with
 * the question, which sends it there; photos need the full box, so the photo button
 * opens the start screen. Phones leave it out, to fit the question.
 */
export async function AskBox({ needsReview }: { needsReview: number }) {
  const t = await getTranslations("dashboard.ask");
  return (
    <form
      action="/assistant"
      className="flex items-center gap-1 rounded-2xl border bg-card py-1 pr-1 pl-3 shadow-xs focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
    >
      <Sparkles className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <input
        name="ask"
        required
        maxLength={CHAT_MESSAGE_MAX}
        aria-label={t("label")}
        placeholder={needsReview > 0 ? t("placeholderReview", { n: needsReview }) : t("placeholder")}
        className="h-11 min-w-0 flex-1 bg-transparent px-2 text-base outline-none placeholder:text-muted-foreground md:h-9 md:text-sm"
      />
      <Link
        href="/assistant"
        className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground max-md:hidden"
      >
        <ImagePlus className="size-4" aria-hidden="true" />
        <span className="sr-only">{t("photo")}</span>
      </Link>
      <Button type="submit" size="icon" className="size-11 shrink-0 rounded-full md:size-9">
        <SendHorizontal className="size-4" aria-hidden="true" />
        <span className="sr-only">{t("send")}</span>
      </Button>
    </form>
  );
}
