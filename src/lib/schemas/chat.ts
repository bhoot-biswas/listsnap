import { z } from "zod";

/** The longest message a seller can send; a chat turn is a request, not a document. */
export const CHAT_MESSAGE_MAX = 1000;

/** A tool call as we store it. The id is ours, so it can serve as the op's idempotency key. */
export const ToolCall = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(64),
  args: z.record(z.string(), z.unknown()),
});
export type ToolCall = z.infer<typeof ToolCall>;

/** One stored message of a listing's chat, in the order the model saw them. */
export const ChatMessage = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: z.string() }),
  z.object({
    role: z.literal("assistant"),
    content: z.string().nullable(),
    toolCalls: z.array(ToolCall).default([]),
  }),
  z.object({ role: z.literal("tool"), toolCallId: z.string(), name: z.string(), result: z.unknown() }),
]);
export type ChatMessage = z.infer<typeof ChatMessage>;

/**
 * What the chat box sends: a message (in a new chat when `newChat` is set), or the
 * seller's answer to an approval card.
 */
export const ChatRequest = z.union([
  z.object({ message: z.string().trim().min(1).max(CHAT_MESSAGE_MAX), newChat: z.boolean().default(false) }),
  z.object({ approve: z.object({ toolCallId: z.string().min(1).max(100), yes: z.boolean() }) }),
]);
export type ChatRequest = z.infer<typeof ChatRequest>;

/** What a finished tool made, shown as a card: the photo or reel, or the post's link. */
export interface ToolExtras {
  media?: { url: string; video: boolean };
  link?: string;
}

/** What the chat box draws. Tool and approval items share their tool call's id. */
export type ChatItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string }
  | ({ kind: "tool"; id: string; name: string; ok: boolean } & ToolExtras)
  | ({
      kind: "approval";
      id: string;
      name: string;
      args: Record<string, unknown>;
      state: "pending" | "approved" | "declined" | "failed";
    } & ToolExtras);

/**
 * The response is a stream of these, one JSON object per line. `working` names the tool
 * running (null while the model thinks); `done` says whether anything on the page changed.
 */
export type ChatEvent =
  | { type: "item"; item: ChatItem }
  | { type: "working"; name: string | null }
  | { type: "error"; code: "busy" | "limit" | "steps" | "answered" | "generic"; message?: string }
  | { type: "done"; changed: boolean };
