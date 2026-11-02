import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ChatEvent, ChatRequest } from "@/lib/schemas/chat";
import { createTestJob, createTestWorkspace, dbEnv, runJob, samplePhoto } from "./db-helpers";

/**
 * What the seller can trust in a listing's chat: a card from a conversation they left
 * can't send anything, a reply that didn't finish says so (also after a reload) and can be
 * tried again, and a reply still being worked on can be seen as such.
 */
const enabled = dbEnv();

describe.skipIf(!enabled)("chat that can be trusted (MariaDB)", async () => {
  const { getPool, select } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");
  const { runChat } = await import("@/server/chat/run-chat");
  const { chatItems } = await import("@/server/chat/view");
  const { mockMeta } = await import("@/server/providers/meta/mock");
  const { StepError } = await import("@/server/pipeline/run-step");

  const a = await createTestWorkspace();
  const A = forWorkspace(a.workspace.id);
  let listingId = "";

  const chat = async (req: Partial<ChatRequest>) => {
    const events: ChatEvent[] = [];
    await runChat(a.workspace, { listingId }, { newChat: false, ...req } as ChatRequest, (e) => events.push(e));
    return events;
  };
  const items = (events: ChatEvent[]) => events.flatMap((e) => (e.type === "item" ? [e.item] : []));
  const storeSaves = () =>
    select<{ n: number }>("SELECT COUNT(*) AS n FROM op_runs WHERE workspace_id = ? AND op = 'saveDraftToStore'", [
      a.workspace.id,
    ]).then((r) => Number(r[0]!.n));

  beforeAll(async () => {
    const jobId = await createTestJob(a.workspace.id, await samplePhoto("saree.jpg"));
    listingId = (await runJob(a.workspace, jobId)).listings[0]!.id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await a.remove();
    await getPool().end();
  });

  it("closes a card left open when a new chat starts", async () => {
    const asked = await chat({ message: "Save it to my store" });
    const card = items(asked).find((i) => i.kind === "approval")!;
    expect(card).toMatchObject({ state: "pending" });
    const old = (await A.listingChat(listingId))!;

    await chat({ message: "Why does this need review?", newChat: true });
    expect(chatItems(await A.chatMessages(old)).find((i) => i.id === card.id)).toMatchObject({ state: "declined" });
    expect(await chat({ approve: { toolCallId: card.id, yes: true }, chatId: old })).toContainEqual({
      type: "error",
      code: "answered",
    });
    expect(await storeSaves()).toBe(0);
  });

  it("won't run a card from a conversation the seller has since left", async () => {
    const asked = await chat({ message: "Save it to my store" });
    const card = items(asked).find((i) => i.kind === "approval")!;
    const old = (await A.listingChat(listingId))!;
    // a newer conversation made the way chats were before cards were closed
    const newer = await A.startChat(listingId, "Newer");
    await A.addChatMessage(newer, { role: "user", content: "Newer" });
    expect(await A.listingChat(listingId)).toBe(newer);

    const yes = await chat({ approve: { toolCallId: card.id, yes: true }, chatId: old });
    expect(yes).toContainEqual({ type: "error", code: "expired" });
    expect(items(yes)[0]).toMatchObject({ id: card.id, state: "declined" });
    expect(await storeSaves()).toBe(0);
  });

  it("keeps a reply that didn't finish, and tries it again", async () => {
    const busy = vi.spyOn(mockMeta, "chat").mockRejectedValueOnce(new StepError("metaBusy"));
    const failed = await chat({ message: "Set the price to 990", newChat: true });
    busy.mockRestore();
    expect(failed.some((e) => e.type === "error")).toBe(false);
    expect(items(failed).at(-1)).toMatchObject({ kind: "failed", code: "busy" });
    expect((items(failed).at(-1) as { message?: string }).message).toBeTruthy();
    const chatId = (await A.listingChat(listingId))!;
    // a reload, or the new chat's own page, still shows it
    expect(chatItems(await A.chatMessages(chatId)).at(-1)).toMatchObject({ kind: "failed", code: "busy" });

    const again = await chat({ retry: true, chatId });
    expect(again.at(-1)).toMatchObject({ type: "done", changed: true });
    expect((await A.getListing(listingId))!.price_bdt).toBe(990);
    // the seller's message is there once; the model never saw the failure mark
    const stored = await A.chatMessages(chatId);
    expect(stored.filter((m) => m.role === "user")).toHaveLength(1);

    // there's nothing to try again once it worked
    expect(await chat({ retry: true, chatId })).toContainEqual({ type: "error", code: "answered" });
  });

  it("says whether a reply is still being worked on", async () => {
    const chatId = (await A.listingChat(listingId))!;
    expect(await A.chatRunning(chatId)).toBe(false);
    expect(await A.claimChat(chatId, "t", 60_000)).toBe(true);
    expect(await A.chatRunning(chatId)).toBe(true);
    await A.releaseChat(chatId, "t");
    expect(await A.chatRunning(chatId)).toBe(false);
  });
});
