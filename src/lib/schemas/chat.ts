import { z } from "zod";
import { StoreKind } from "@/lib/stores";

/** The longest message a seller can send; a chat turn is a request, not a document. */
export const CHAT_MESSAGE_MAX = 1000;
/** Photos one message can carry: enough for a product from a few sides. */
export const CHAT_PHOTOS_MAX = 4;

/** Which conversation a message belongs to; without it, the one used last. */
const ChatId = z.string().min(1).max(36);
const PhotoIds = z.array(z.string().min(1).max(36)).max(CHAT_PHOTOS_MAX);

/** A tool call as we store it. The id is ours, so it can serve as the op's idempotency key. */
export const ToolCall = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(64),
  args: z.record(z.string(), z.unknown()),
  /**
   * What an approval card shows besides the args: the listings it acts on, by title and
   * price, and for a store save the stores the draft goes to, so a shop with WooCommerce
   * and Shopify both connected sees where.
   */
  preview: z
    .object({
      titles: z.array(z.string()).max(20),
      /** The price each draft gets; `suggested` when it is the AI's guess, not one the seller set. */
      prices: z
        .array(z.object({ bdt: z.number(), suggested: z.boolean() }).nullable())
        .max(20)
        .optional(),
      stores: z.array(StoreKind).max(2).optional(),
    })
    .optional(),
});
export type ToolCall = z.infer<typeof ToolCall>;

/** One stored message of a listing's chat, in the order the model saw them. */
export const ChatMessage = z.discriminatedUnion("role", [
  // photos the seller attached, as media ids; the model sees the latest message's photos
  z.object({ role: z.literal("user"), content: z.string(), photoIds: PhotoIds.optional() }),
  z.object({
    role: z.literal("assistant"),
    content: z.string().nullable(),
    toolCalls: z.array(ToolCall).default([]),
    /** Not the model's: marks where the seller pressed Stop, so a reload still shows it. */
    stopped: z.literal(true).optional(),
  }),
  z.object({ role: z.literal("tool"), toolCallId: z.string(), name: z.string(), result: z.unknown() }),
]);
export type ChatMessage = z.infer<typeof ChatMessage>;

/**
 * What the chat box sends: a message with any photos already uploaded (in a new chat
 * when `newChat` is set), or the seller's answer to an approval card. A photo alone is
 * a message too. `chatId` names an earlier conversation the seller opened.
 */
export const ChatRequest = z.union([
  z
    .object({
      message: z.string().trim().max(CHAT_MESSAGE_MAX),
      photoIds: PhotoIds.default([]),
      newChat: z.boolean().default(false),
      chatId: ChatId.optional(),
    })
    .refine((m) => m.message.length > 0 || m.photoIds.length > 0),
  z.object({
    approve: z.object({ toolCallId: z.string().min(1).max(100), yes: z.boolean() }),
    chatId: ChatId.optional(),
  }),
]);
export type ChatRequest = z.infer<typeof ChatRequest>;

/** What a finished tool made, shown as a card: the photo or reel, or the post's link. */
export interface ToolExtras {
  media?: { url: string; video: boolean };
  link?: string;
  /** A page of ours to open, such as the listing a photo just started. */
  open?: string;
  /** Listings a search found, each linking to its Review page. */
  listings?: { id: string; title: string; status: string; href: string }[];
}

/** What the chat box draws. Tool and approval items share their tool call's id. */
export type ChatItem =
  | { kind: "user"; id: string; text: string; photos?: string[] }
  | { kind: "assistant"; id: string; text: string }
  /** Where the seller pressed Stop. */
  | { kind: "stopped"; id: string }
  | ({ kind: "tool"; id: string; name: string; ok: boolean } & ToolExtras)
  | ({
      kind: "approval";
      id: string;
      name: string;
      args: Record<string, unknown>;
      state: "pending" | "approved" | "declined" | "failed";
      preview?: ToolCall["preview"];
    } & ToolExtras);

/**
 * The response is a stream of these, one JSON object per line. `working` names the tool
 * running (null while the model thinks); `chat` names a conversation the message just started,
 * before anything else; `done` says whether anything on the page changed, and which
 * conversation the request went to.
 */
export type ChatEvent =
  | { type: "chat"; chatId: string }
  /**
   * The seller's message or answer is stored, so a later failure mustn't hand it back to
   * the box, and the turn can be stopped from now on; it names the conversation for Stop.
   */
  | { type: "received"; chatId: string }
  | { type: "item"; item: ChatItem }
  | { type: "working"; name: string | null }
  | { type: "error"; code: "busy" | "running" | "limit" | "steps" | "answered" | "generic"; message?: string }
  | { type: "done"; changed: boolean; chatId?: string };

/** A conversation in the list of earlier ones. */
export interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string;
}
