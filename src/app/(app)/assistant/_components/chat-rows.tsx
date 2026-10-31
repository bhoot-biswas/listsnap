import type { Route } from "next";
import Link from "next/link";
import { getFormatter, getNow, getTimeZone } from "next-intl/server";
import { daysBetween } from "@/lib/chat-groups";
import { relativeTime } from "@/lib/relative-time";

const isBangla = (text: string) => /[ঀ-৿]/.test(text);

export type ChatRow = { id: string; title: string; updated_at: Date };

/**
 * Conversations as links, the title on the left and when on the right: "5 minutes ago"
 * today, then the time, the weekday, and the date for older ones.
 */
export async function ChatRows({ rows }: { rows: ChatRow[] }) {
  const format = await getFormatter();
  const [now, timeZone] = await Promise.all([getNow(), getTimeZone()]);
  const when = (date: Date) => {
    const days = daysBetween(date, now, timeZone);
    if (days <= 0) return relativeTime(format, date, now);
    if (days === 1) return format.dateTime(date, { hour: "numeric", minute: "2-digit" });
    if (days < 7) return format.dateTime(date, { weekday: "short" });
    return format.dateTime(date, {
      day: "numeric",
      month: "short",
      ...(date.getFullYear() !== now.getFullYear() && { year: "numeric" }),
    });
  };

  return (
    <ul>
      {rows.map((r) => {
        const date = new Date(r.updated_at);
        return (
          <li key={r.id}>
            <Link
              href={`/assistant/${r.id}` as Route}
              className="-mx-2 flex min-h-11 items-center justify-between gap-4 rounded-md px-2 py-2 text-sm hover:bg-muted/60"
            >
              <span lang={isBangla(r.title) ? "bn" : undefined} className="min-w-0 truncate">
                {r.title}
              </span>
              <time
                dateTime={date.toISOString()}
                title={format.dateTime(date, { dateStyle: "medium", timeStyle: "short" })}
                className="shrink-0 text-xs text-muted-foreground"
              >
                {when(date)}
              </time>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
