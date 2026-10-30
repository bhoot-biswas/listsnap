import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ChatEvent, ChatItem, ChatRequest } from "@/lib/schemas/chat";
import { createTestJob, createTestWorkspace, dbEnv, runJob, samplePhoto } from "./db-helpers";

/**
 * The listing chat on the real database with the mock model: tools run as ops, posting
 * waits for the seller's answer and then runs exactly what the card showed, once.
 */
const enabled = dbEnv();

describe.skipIf(!enabled)("listing chat (MariaDB)", async () => {
  const { getPool, select } = await import("@/server/db/pool");
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
    expect(items(priced)[0]).toMatchObject({ kind: "tool", name: "editListingFields", ok: true });
    expect((await A.getListing(listingId))!.price_bdt).toBe(1250);

    const events = await chat({ message: "Make an English reel" });
    expect(items(events)).toMatchObject([
      { kind: "tool", name: "makeReel", ok: true, media: { video: true } },
      { kind: "assistant", text: "Done." },
    ]);
    expect(events.at(-1)).toEqual({ type: "done", changed: true });
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
    expect((await A.getListing(listingId))!.status).toBe("posted");

    expect(await chat({ approve: { toolCallId: card.id, yes: true } })).toContainEqual({
      type: "error",
      code: "answered",
    });
    expect(await posts()).toBe(1);
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
});
