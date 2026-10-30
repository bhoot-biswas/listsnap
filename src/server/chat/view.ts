import "server-only";
import type { ChatItem, ChatMessage, ToolCall, ToolExtras } from "@/lib/schemas/chat";
import { mediaUrl } from "@/server/media/store";
import { changesListing, needsApproval } from "./tools";

/** The photo or reel a tool made, or the link of a post, from its stored result. */
/** Found listings shown under a reply; the model reads all of them, the seller sees the first few. */
const LISTING_CARDS = 8;

type FoundListing = { id: string; jobId: string; title: string | null; status: string };

export function toolExtras(name: string, result: unknown): ToolExtras {
  const found = (result as { listings?: FoundListing[] } | null)?.listings;
  if (name === "findListings" && found?.length)
    return {
      listings: found.slice(0, LISTING_CARDS).map((l) => ({
        id: l.id,
        title: l.title ?? "—",
        status: l.status,
        href: `/job/${l.jobId}/review?l=${l.id}`,
      })),
    };
  const r = (result as { result?: { mediaId?: unknown; permalink?: unknown } } | null)?.result;
  if (!r) return {};
  return {
    ...(typeof r.mediaId === "string" && { media: { url: mediaUrl(r.mediaId), video: name === "makeReel" } }),
    ...(typeof r.permalink === "string" && { link: r.permalink }),
  };
}

type ApprovalState = Extract<ChatItem, { kind: "approval" }>["state"];

/** An approval card for a stored call, with what it made once it ran. */
export function approvalItem(call: ToolCall, state: ApprovalState, result?: unknown): ChatItem {
  return {
    kind: "approval",
    id: call.id,
    name: call.name,
    args: call.args,
    state,
    ...(call.preview && { preview: call.preview }),
    ...toolExtras(call.name, result),
  };
}

/** Calls from the model's last turn that still wait for the seller's approval. */
export function pendingCalls(history: ChatMessage[]): ToolCall[] {
  const answered = new Set<string>();
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]!;
    if (m.role === "tool") answered.add(m.toolCallId);
    else if (m.role === "assistant") return m.toolCalls.filter((c) => needsApproval(c.name) && !answered.has(c.id));
    else return [];
  }
  return [];
}

/** The stored conversation as the chat box draws it. */
export function chatItems(history: ChatMessage[]): ChatItem[] {
  const results = new Map<string, { ok?: boolean; declined?: boolean }>();
  for (const m of history)
    if (m.role === "tool") results.set(m.toolCallId, (m.result ?? {}) as { ok?: boolean; declined?: boolean });
  const items: ChatItem[] = [];
  history.forEach((m, i) => {
    if (m.role === "user") items.push({ kind: "user", id: `m${i}`, text: m.content });
    if (m.role !== "assistant") return;
    if (m.content) items.push({ kind: "assistant", id: `m${i}`, text: m.content });
    for (const c of m.toolCalls) {
      const r = results.get(c.id);
      if (needsApproval(c.name)) {
        const state = !r ? "pending" : r.declined ? "declined" : r.ok ? "approved" : "failed";
        items.push(approvalItem(c, state, r));
      } else if (r) items.push({ kind: "tool", id: c.id, name: c.name, ok: r.ok === true, ...toolExtras(c.name, r) });
    }
  });
  return items;
}

/** How many changes the chat has made to the listing; the form takes the server's copy when it grows. */
export function chatRevision(history: ChatMessage[]): number {
  return history.filter(
    (m) => m.role === "tool" && changesListing(m.name) && (m.result as { ok?: boolean } | null)?.ok === true,
  ).length;
}
