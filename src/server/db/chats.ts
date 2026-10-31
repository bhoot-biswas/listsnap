import "server-only";
import { randomUUID } from "node:crypto";
import { ChatMessage } from "@/lib/schemas/chat";
import { execute, json, select, selectOne } from "./pool";

/** How much of a conversation the model sees again; older turns rarely matter to a listing. */
const HISTORY = 60;
const TITLE_MAX = 120;
/** Conversations a list shows; older ones are kept, just not offered. */
const CHAT_LIST = 30;

export function chatQueries(ws: string) {
  return {
    /**
     * The current chat of a listing, or of the whole shop with null: the one used last, so
     * carrying on an older conversation makes it the one a reload shows.
     */
    async listingChat(listingId: string | null): Promise<string | null> {
      const row = await selectOne<{ id: string }>(
        // <=> also matches NULL, the shop chat
        "SELECT id FROM chats WHERE workspace_id = ? AND listing_id <=> ? ORDER BY updated_at DESC, created_at DESC, id DESC LIMIT 1",
        [ws, listingId],
      );
      return row?.id ?? null;
    },

    /** This listing's or the shop's conversations, the one used last first. */
    chatList(listingId: string | null): Promise<{ id: string; title: string; updated_at: Date }[]> {
      return select(
        "SELECT id, title, updated_at FROM chats WHERE workspace_id = ? AND listing_id <=> ? ORDER BY updated_at DESC, created_at DESC, id DESC LIMIT ?",
        [ws, listingId, CHAT_LIST],
      );
    },

    /**
     * One page of the shop's conversations, the one used last first; `before` continues
     * from the last one of the previous page.
     */
    async shopChatPage(
      before?: Date,
    ): Promise<{ rows: { id: string; title: string; updated_at: Date }[]; more: boolean }> {
      const rows = await select<{ id: string; title: string; updated_at: Date }>(
        `SELECT id, title, updated_at FROM chats WHERE workspace_id = ? AND listing_id IS NULL${before ? " AND updated_at < ?" : ""}
          ORDER BY updated_at DESC, created_at DESC, id DESC LIMIT ?`,
        before ? [ws, before, CHAT_LIST + 1] : [ws, CHAT_LIST + 1],
      );
      return { rows: rows.slice(0, CHAT_LIST), more: rows.length > CHAT_LIST };
    },

    /** Renames one of the shop's conversations, keeping its place in the list; false when it isn't one. */
    async renameChat(chatId: string, title: string): Promise<boolean> {
      // updated_at = updated_at stops ON UPDATE from moving it to the top
      const r = await execute(
        "UPDATE chats SET title = ?, updated_at = updated_at WHERE id = ? AND workspace_id = ? AND listing_id IS NULL",
        [title.slice(0, TITLE_MAX), chatId, ws],
      );
      return r.affectedRows > 0;
    },

    /** Deletes one of the shop's conversations; its messages go with it. False when it isn't one. */
    async deleteChat(chatId: string): Promise<boolean> {
      const r = await execute("DELETE FROM chats WHERE id = ? AND workspace_id = ? AND listing_id IS NULL", [
        chatId,
        ws,
      ]);
      return r.affectedRows > 0;
    },

    /** The chat when it is this shop's and about this listing (or the shop, with null). */
    async chatInScope(chatId: string, listingId: string | null): Promise<string | null> {
      const row = await selectOne<{ id: string }>(
        "SELECT id FROM chats WHERE id = ? AND workspace_id = ? AND listing_id <=> ?",
        [chatId, ws, listingId],
      );
      return row?.id ?? null;
    },

    /** A chat's title: the seller's first message, cut short. */
    async chatTitle(chatId: string): Promise<string | null> {
      const row = await selectOne<{ title: string | null }>(
        "SELECT title FROM chats WHERE id = ? AND workspace_id = ?",
        [chatId, ws],
      );
      return row?.title ?? null;
    },

    /** Which listing a chat is about (null for the shop chat), or undefined when it isn't this shop's. */
    async chatListing(chatId: string): Promise<string | null | undefined> {
      const row = await selectOne<{ listing_id: string | null }>(
        "SELECT listing_id FROM chats WHERE id = ? AND workspace_id = ?",
        [chatId, ws],
      );
      return row ? row.listing_id : undefined;
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

    /**
     * Photos the seller attached, found among this shop's originals; `used` once one is
     * already a job's photo. Ids from another shop simply aren't returned.
     */
    async chatPhotos(ids: string[]): Promise<{ id: string; width: number; height: number; used: boolean }[]> {
      if (!ids.length) return [];
      const rows = await select<{ id: string; width: number; height: number; used: number }>(
        `SELECT m.id, m.width, m.height, EXISTS (SELECT 1 FROM photos p WHERE p.media_id = m.id) AS used
           FROM media m WHERE m.workspace_id = ? AND m.kind = 'original' AND m.id IN (${ids.map(() => "?").join(",")})`,
        [ws, ...ids],
      );
      return rows.map((r) => ({ ...r, used: Boolean(Number(r.used)) }));
    },

    /** Originals uploaded today that aren't a job's photo yet: what the chat's uploads add up to. */
    async loosePhotosToday(): Promise<number> {
      const row = await selectOne<{ n: number }>(
        `SELECT COUNT(*) AS n FROM media m WHERE m.workspace_id = ? AND m.kind = 'original'
            AND m.created_at >= UTC_DATE() AND NOT EXISTS (SELECT 1 FROM photos p WHERE p.media_id = m.id)`,
        [ws],
      );
      return Number(row?.n ?? 0);
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
