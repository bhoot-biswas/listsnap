import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ChatEvent, ChatItem, ChatRequest } from "@/lib/schemas/chat";
import { createTestJob, createTestWorkspace, dbEnv, runJob, samplePhoto } from "./db-helpers";

/**
 * The listing chat on the real database with the mock model: tools run as ops, posting
 * waits for the seller's answer and then runs exactly what the card showed, once.
 */
const enabled = dbEnv();

describe.skipIf(!enabled)("listing chat (MariaDB)", async () => {
  const { execute, getPool, select } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");
  const { runChat } = await import("@/server/chat/run-chat");
  const { encryptSecret } = await import("@/server/crypto");

  const a = await createTestWorkspace();
  const b = await createTestWorkspace();
  const A = forWorkspace(a.workspace.id);
  let listingId = "";

  const chat = async (req: Partial<ChatRequest>, workspace = a.workspace) => {
    const events: ChatEvent[] = [];
    await runChat(workspace, { listingId }, { newChat: false, ...req } as ChatRequest, (e) => events.push(e));
    return events;
  };
  const items = (events: ChatEvent[]) => events.flatMap((e) => (e.type === "item" ? [e.item] : []));
  const posts = () =>
    select<{ n: number }>("SELECT COUNT(*) AS n FROM api_calls WHERE workspace_id = ? AND step = 'post'", [
      a.workspace.id,
    ]).then((r) => Number(r[0]!.n));

  beforeAll(async () => {
    const jobId = await createTestJob(a.workspace.id, await samplePhoto("saree.jpg"));
    listingId = (await runJob(a.workspace, jobId)).listings[0]!.id;
    await A.saveConnection("meta", {
      baseUrl: null,
      credentialsEnc: encryptSecret("test-page-token"),
      checks: null,
      settings: { pageId: "1", pageName: "Test Page", igUserId: "2", igUsername: "@test", test: true },
    });
  });

  afterAll(async () => {
    await a.remove();
    await b.remove();
    await getPool().end();
  });

  it("runs a tool as an op and answers", async () => {
    const priced = await chat({ message: "Set the price to 1,250" });
    // the listing's first message starts a conversation, named before anything else
    expect(priced[0]).toEqual({ type: "chat", chatId: await A.listingChat(listingId) });
    expect(items(priced)[0]).toMatchObject({ kind: "tool", name: "editListingFields", ok: true });
    expect((await A.getListing(listingId))!.price_bdt).toBe(1250);

    const events = await chat({ message: "Make an English reel" });
    expect(items(events)).toMatchObject([
      { kind: "tool", name: "makeReel", ok: true, media: { video: true } },
      { kind: "assistant", text: "Done." },
    ]);
    expect(events.at(-1)).toEqual({ type: "done", changed: true, chatId: await A.listingChat(listingId) });
    expect(events.some((e) => e.type === "chat")).toBe(false);
    const runs = await select<{ op: string; via: string }>(
      "SELECT op, via FROM op_runs WHERE workspace_id = ? AND op = 'makeReel'",
      [a.workspace.id],
    );
    expect(runs).toEqual([{ op: "makeReel", via: "chat" }]);
  });

  it("posts only after the seller says yes, with the caption the card showed, once", async () => {
    const asked = await chat({ message: "Post the reel to Instagram" });
    const card = items(asked).find((i) => i.kind === "approval")!;
    expect(card).toMatchObject({ name: "postReel", state: "pending", args: { destination: "instagram" } });
    // the model left the caption out, so the listing's own was filled in before the card
    expect(String((card as { args: Record<string, unknown> }).args.caption).length).toBeGreaterThan(10);
    expect(await posts()).toBe(0);

    // another shop can't answer it
    expect(await chat({ approve: { toolCallId: card.id, yes: true } }, b.workspace)).toContainEqual({
      type: "error",
      code: "generic",
    });

    const yes = await chat({ approve: { toolCallId: card.id, yes: true } });
    expect(items(yes)[0]).toMatchObject({ kind: "approval", id: card.id, state: "approved" });
    expect(items(yes)[0]).toHaveProperty("link");
    expect(await posts()).toBe(1);
    // the mock post is a test post, so the listing isn't marked Posted
    expect((await A.getListing(listingId))!.status).toBe("needs_review");

    expect(await chat({ approve: { toolCallId: card.id, yes: true } })).toContainEqual({
      type: "error",
      code: "answered",
    });
    expect(await posts()).toBe(1);
  });

  it("refuses to post a reel that isn't made, before any card is shown", async () => {
    // only the English reel exists; the mock asks to post the Bangla one
    const events = await chat({ message: "Post the Bangla reel to Facebook" });
    expect(items(events)[0]).toMatchObject({ kind: "tool", name: "postReel", ok: false });
    expect(items(events).some((i) => i.kind === "approval")).toBe(false);
  });

  it("sends nothing when the seller says no or moves on", async () => {
    const asked = await chat({ message: "Post the reel to Facebook" });
    const card = items(asked).find((i) => i.kind === "approval")!;
    const no = await chat({ approve: { toolCallId: card.id, yes: false } });
    expect(items(no)[0]).toMatchObject({ state: "declined" });

    const again = await chat({ message: "Save it to my store" });
    const store = items(again).find((i) => i.kind === "approval")!;
    const moved = await chat({ message: "Undo the last change" });
    expect(items(moved)[0]).toMatchObject({ id: store.id, state: "declined" });
    expect(await posts()).toBe(1);
  });

  it("starts a new chat on request, keeping the old one stored", async () => {
    const before = await A.listingChat(listingId);
    await chat({ message: "Why does this need review?", newChat: true });
    const after = await A.listingChat(listingId);
    expect(after).not.toBe(before);
    expect((await A.chatMessages(after!))[0]).toEqual({ role: "user", content: "Why does this need review?" });
    // the log names the tools, never the seller's words
    const logged = await select<{ summary: string }>(
      "SELECT summary FROM api_calls WHERE workspace_id = ? AND step = 'chat'",
      [a.workspace.id],
    );
    expect(logged.length).toBeGreaterThan(0);
    expect(logged.some((l) => /review|instagram|store/i.test(l.summary) && !l.summary.startsWith("tools"))).toBe(false);
  });
  it("carries on an earlier conversation the seller opens, and only one of this listing's", async () => {
    const [latest, earlier] = await A.chatList(listingId);
    expect(earlier).toBeDefined();
    const events = await chat({ message: "What's the price?", chatId: earlier!.id });
    expect(events.at(-1)).toMatchObject({ type: "done", chatId: earlier!.id });
    // only a conversation the message starts is announced
    expect(events.some((e) => e.type === "chat")).toBe(false);
    expect(
      (await A.chatMessages(earlier!.id)).some((m) => m.role === "user" && m.content === "What's the price?"),
    ).toBe(true);
    // the conversation used last is the one a reload shows, and comes first in the list
    expect(await A.listingChat(listingId)).toBe(earlier!.id);
    expect((await A.chatList(listingId))[0]!.id).toBe(earlier!.id);
    expect((await A.chatMessages(latest!.id)).some((m) => m.role === "user" && m.content === "What's the price?")).toBe(
      false,
    );

    // another shop's conversation, or the shop chat's, can't be carried on from here
    const shopChat = await A.startChat(null, "Shop question");
    for (const chatId of [shopChat, "not-a-chat"])
      expect(await chat({ message: "Hello", chatId })).toEqual([{ type: "error", code: "generic" }]);
    expect(await chat({ message: "Hello", chatId: earlier!.id }, b.workspace)).toEqual([
      { type: "error", code: "generic" },
    ]);
  });

  it("starts a listing from a photo sent in the shop chat, and refuses another shop's photo", async () => {
    const { saveMedia } = await import("@/server/media/store");
    const { chatItems } = await import("@/server/chat/view");
    const photo = await samplePhoto("kurti.jpg");
    const sent = await saveMedia(a.workspace.id, "original", photo, { mime: "image/jpeg", width: 1280, height: 1280 });
    const shop = async (req: Partial<ChatRequest>, workspace = a.workspace) => {
      const events: ChatEvent[] = [];
      await runChat(
        workspace,
        { listingId: null },
        { newChat: true, message: "", photoIds: [], ...req } as ChatRequest,
        (e) => events.push(e),
      );
      return events;
    };

    expect(await shop({ photoIds: [sent.id] }, b.workspace)).toContainEqual({ type: "error", code: "generic" });

    const events = await shop({ photoIds: [sent.id] });
    const started = items(events).find((i) => i.kind === "tool")!;
    expect(started).toMatchObject({ name: "startListing", ok: true, open: expect.stringMatching(/^\/job\//) });
    const jobId = (started as { open: string }).open.split("/").at(-1)!;
    expect(await A.getJob(jobId)).toMatchObject({ id: jobId });

    // a reload shows the photo in the seller's message
    const history = await A.chatMessages((await A.listingChat(null))!);
    expect(chatItems(history)[0]).toMatchObject({ kind: "user", photos: [`/media/${sent.id}`] });
  });

  it("saves every Ready listing from the shop chat under one approval that names them", async () => {
    const { execute } = await import("@/server/db/pool");
    const c = await createTestWorkspace();
    try {
      const ids: string[] = [];
      for (const photo of ["saree.jpg", "kurti.jpg"]) {
        const job = await createTestJob(c.workspace.id, await samplePhoto(photo));
        ids.push((await runJob(c.workspace, job)).listings[0]!.id);
      }
      await execute("UPDATE listings SET status = 'ready' WHERE workspace_id = ?", [c.workspace.id]);
      const shop = (req: Partial<ChatRequest>) => {
        const events: ChatEvent[] = [];
        return runChat(c.workspace, { listingId: null }, { newChat: false, ...req } as ChatRequest, (e) =>
          events.push(e),
        ).then(() => events);
      };

      const asked = await shop({ message: "Save everything that's Ready to my store" });
      expect(items(asked).map((i) => i.kind)).toEqual(["tool", "approval"]);
      const card = items(asked)[1] as Extract<ChatItem, { kind: "approval" }>;
      expect(card).toMatchObject({ name: "saveDraftsToStore", state: "pending" });
      expect(card.preview?.titles).toHaveLength(2);
      expect((card.args.listingIds as string[]).sort()).toEqual([...ids].sort());

      const yes = await shop({ approve: { toolCallId: card.id, yes: true } });
      expect(items(yes)[0]).toMatchObject({ state: "approved" });
      const C = forWorkspace(c.workspace.id);
      for (const id of ids) expect((await C.getListing(id))!.status).toBe("in_store");
      // the shop chat is its own conversation, apart from any listing's
      expect(await C.listingChat(null)).not.toBe(await C.listingChat(ids[0]!));
    } finally {
      await c.remove();
    }
  });

  it("stops between steps at the seller's Stop, and a dropped stream alone stops nothing", async () => {
    const reels = () =>
      select<{ n: number }>("SELECT COUNT(*) AS n FROM op_runs WHERE workspace_id = ? AND op = 'makeReel'", [
        a.workspace.id,
      ]).then((r) => Number(r[0]!.n));
    const before = await reels();
    const events: ChatEvent[] = [];
    let chatId = "";
    let stopped: Promise<boolean> | undefined;
    await runChat(a.workspace, { listingId }, { message: "Make an English reel", newChat: true, photoIds: [] }, (e) => {
      events.push(e);
      if (e.type === "received") chatId = e.chatId;
      // Stop pressed while the model thinks: the reel it then asks for never starts
      if (e.type === "working" && e.name === null) stopped ??= A.requestChatStop(chatId);
    });
    expect(await stopped).toBe(true);
    expect(events.find((e) => e.type === "received")).toEqual({ type: "received", chatId });
    expect(items(events)).toMatchObject([{ kind: "stopped" }]);
    expect(events.at(-1)).toMatchObject({ type: "done", changed: false });
    expect(await reels()).toBe(before);
    // a reload shows the Stop, and no line for the step that never ran
    const stored = await A.chatMessages(chatId);
    const { chatItems } = await import("@/server/chat/view");
    expect(chatItems(stored).map((i) => i.kind)).toEqual(["user", "stopped"]);

    // the next message starts unstopped and runs, without the model seeing the Stop mark
    const next = await chat({ message: "Make an English reel", chatId });
    expect(items(next)[0]).toMatchObject({ kind: "tool", name: "makeReel", ok: true });
    expect(await reels()).toBe(before + 1);
    expect(await A.chatStopRequested(chatId)).toBe(false);
    expect(await A.requestChatStop("not-a-chat")).toBe(false);
    expect(await forWorkspace(b.workspace.id).requestChatStop(chatId)).toBe(false);
  });

  it("renames, deletes and pages the shop's conversations, never a listing's", async () => {
    const shopChats: string[] = [];
    for (let i = 0; i < 32; i++) shopChats.push(await A.startChat(null, `Shop question ${i}`));
    // spread the times out, newest last and after any other test's, so the order is certain
    for (const [i, id] of shopChats.entries())
      await execute("UPDATE chats SET updated_at = ? WHERE id = ?", [new Date(Date.UTC(2030, 0, 1, 0, i)), id]);
    await A.addChatMessage(shopChats[0]!, { role: "user", content: "Hello" });
    await execute("UPDATE chats SET updated_at = ? WHERE id = ?", [
      new Date(Date.UTC(2030, 0, 1, 0, 0)),
      shopChats[0]!,
    ]);

    const first = await A.shopChatPage();
    expect(first.rows).toHaveLength(30);
    expect(first.more).toBe(true);
    expect(first.rows[0]!.id).toBe(shopChats[31]);
    const rest = await A.shopChatPage(new Date(first.rows.at(-1)!.updated_at));
    expect(rest.rows.slice(0, 2).map((r) => r.id)).toEqual([shopChats[1], shopChats[0]]);

    // a new name keeps the conversation where it was in the list
    expect(await A.renameChat(shopChats[0]!, "Greetings")).toBe(true);
    expect(await A.chatTitle(shopChats[0]!)).toBe("Greetings");
    expect((await A.shopChatPage(new Date(first.rows.at(-1)!.updated_at))).rows[1]!.id).toBe(shopChats[0]);

    expect(await A.deleteChat(shopChats[0]!)).toBe(true);
    expect(await A.chatInScope(shopChats[0]!, null)).toBeNull();
    const left = await select<{ n: number }>("SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id = ?", [
      shopChats[0]!,
    ]);
    expect(Number(left[0]!.n)).toBe(0);

    // a listing's conversation is managed on its Review page, not here
    const listingChat = (await A.listingChat(listingId))!;
    expect(await A.renameChat(listingChat, "Nope")).toBe(false);
    expect(await A.deleteChat(listingChat)).toBe(false);
    expect(await A.chatInScope(listingChat, listingId)).toBe(listingChat);
  });
});
