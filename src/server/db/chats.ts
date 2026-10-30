import "server-only";
import { randomUUID } from "node:crypto";
import { ChatMessage } from "@/lib/schemas/chat";
import { execute, json, select, selectOne } from "./pool";

/** How much of a conversation the model sees again; older turns rarely matter to a listing. */
const HISTORY = 60;
const TITLE_MAX = 120;

export function chatQueries(ws: string) {
  return {
    /** The current chat of a listing, or of the whole shop with null: the one started last. */
    async listingChat(listingId: string | null): Promise<string | null> {
      const row = await selectOne<{ id: string }>(
        // <=> also matches NULL, the shop chat
        "SELECT id FROM chats WHERE workspace_id = ? AND listing_id <=> ? ORDER BY created_at DESC, id DESC LIMIT 1",
        [ws, listingId],
      );
      return row?.id ?? null;
    },

    /** A new chat about one listing, or about the whole shop with null. */
    async startChat(listingId: string | null, firstMessage: string): Promise<string> {
      const id = randomUUID();
      await execute("INSERT INTO chats (id, workspace_id, listing_id, title) VALUES (?, ?, ?, ?)", [
        id,
        ws,
        listingId,
        firstMessage.slice(0, TITLE_MAX),
      ]);
      return id;
    },

    /**
     * The latest messages of a chat, oldest first. The window starts at a seller's
     * message, so the model never sees a tool result without the call it answers.
     */
    async chatMessages(chatId: string): Promise<ChatMessage[]> {
      const rows = await select<{ body_json: unknown }>(
        "SELECT body_json FROM chat_messages WHERE workspace_id = ? AND chat_id = ? ORDER BY id DESC LIMIT ?",
        [ws, chatId, HISTORY],
      );
      const messages = rows
        .reverse()
        .map((r) => ChatMessage.safeParse(typeof r.body_json === "string" ? JSON.parse(r.body_json) : r.body_json))
        .flatMap((p) => (p.success ? [p.data] : []));
      const start = messages.findIndex((m) => m.role === "user");
      return start < 0 ? [] : messages.slice(start);
    },

    /** Adds a message to one of this shop's chats; a chat id from another shop adds nothing. */
    async addChatMessage(chatId: string, message: ChatMessage): Promise<void> {
      await execute(
        "INSERT INTO chat_messages (chat_id, workspace_id, role, body_json) SELECT id, workspace_id, ?, ? FROM chats WHERE id = ? AND workspace_id = ?",
        [message.role, json(message), chatId, ws],
      );
      await execute("UPDATE chats SET updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND workspace_id = ?", [
        chatId,
        ws,
      ]);
    },

    /** Chat model calls today; each one is a logged Spark request. */
    async chatCallsToday(): Promise<number> {
      const row = await selectOne<{ n: number }>(
        "SELECT COUNT(*) AS n FROM api_calls WHERE workspace_id = ? AND step = 'chat' AND created_at >= UTC_DATE()",
        [ws],
      );
      return Number(row?.n ?? 0);
    },
  };
}
