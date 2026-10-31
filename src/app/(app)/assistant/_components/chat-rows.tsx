import { getFormatter, getNow, getTimeZone } from "next-intl/server";
import { daysBetween } from "@/lib/chat-groups";
import { relativeTime } from "@/lib/relative-time";
import { ChatRow } from "./chat-manage";

export type ChatListRow = { id: string; title: string; updated_at: Date };

/**
 * Conversations as links, the title on the left and when on the right: "5 minutes ago"
 * today, then the time, the weekday, and the date for older ones. Each has a menu to
 * rename or delete it.
 */
export async function ChatRows({ rows }: { rows: ChatListRow[] }) {
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
          <ChatRow
            key={r.id}
            id={r.id}
            title={r.title}
            when={when(date)}
            iso={date.toISOString()}
            full={format.dateTime(date, { dateStyle: "medium", timeStyle: "short" })}
          />
        );
      })}
    </ul>
  );
}
