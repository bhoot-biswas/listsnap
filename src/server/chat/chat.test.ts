import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/schemas/chat";
import { chatBody } from "@/server/providers/meta/chat";
import { mockChatTurn } from "@/server/providers/meta/chat-mock";
import { chatTools } from "./tools";
import { chatItems, chatRevision, pendingCalls } from "./view";

const listingTools = () => chatTools({ listingId: "l1" });

const call = (id: string, name: string, args: Record<string, unknown> = {}) => ({ id, name, args });

const history: ChatMessage[] = [
  { role: "user", content: "Make a reel and post it to Instagram" },
  { role: "assistant", content: null, toolCalls: [call("c1", "makeReel", { lang: "en" })] },
  { role: "tool", toolCallId: "c1", name: "makeReel", result: { ok: true, done: true, result: { mediaId: "m1" } } },
  {
    role: "assistant",
    content: "The reel is ready.",
    toolCalls: [call("c2", "postReel", { lang: "en", destination: "instagram", caption: "Red saree" })],
  },
];

describe("listing chat", () => {
  it("keeps the listing id out of every tool, so the model can't aim at another listing", () => {
    const tools = listingTools();
    expect(tools.map((t) => t.name)).toContain("postReel");
    for (const t of tools) {
      expect(JSON.stringify(t.parameters), t.name).not.toContain("listingId");
      expect(t.parameters.$schema, t.name).toBeUndefined();
    }
    const post = tools.find((t) => t.name === "postReel")!.parameters as { required?: string[] };
    expect(post.required).not.toContain("caption");
  });

  it("gives the shop chat the shop tools, where the model names the listing", () => {
    const tools = chatTools({ listingId: null });
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(["findListings", "saveDraftsToStore"]));
    const post = tools.find((t) => t.name === "postReel")!.parameters as { required?: string[] };
    expect(post.required).toContain("listingId");
    expect(listingTools().map((t) => t.name)).not.toContain("saveDraftsToStore");
  });

  it("sends history the way Spark's tool calling expects it", () => {
    const body = chatBody({ system: "rules", messages: history, tools: listingTools() }) as {
      messages: Record<string, unknown>[];
      tool_choice: string;
    };
    expect(body.tool_choice).toBe("auto");
    expect(body.messages[0]).toEqual({ role: "developer", content: "rules" });
    expect(body.messages[2]).toMatchObject({
      role: "assistant",
      tool_calls: [{ id: "c1", type: "function", function: { name: "makeReel", arguments: '{"lang":"en"}' } }],
    });
    expect(body.messages[3]).toMatchObject({ role: "tool", tool_call_id: "c1" });
    // the cookbook lists these as unsupported on Spark
    for (const key of ["stop", "n", "logit_bias", "logprobs", "temperature"]) expect(body).not.toHaveProperty(key);
  });

  it("shows the model the latest photos and names every photo by id", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "", photoIds: ["p1"] },
      { role: "assistant", content: "Nice saree.", toolCalls: [] },
      { role: "user", content: "Sell this one", photoIds: ["p2"] },
    ];
    const body = chatBody({
      system: "rules",
      messages,
      tools: chatTools({ listingId: null }),
      images: { p2: "data:image/jpeg;base64,AA" },
    }) as { messages: { content: unknown }[] };
    expect(body.messages[1]!.content).toEqual([{ type: "text", text: "[Attached photos: p1]" }]);
    expect(body.messages[3]!.content).toEqual([
      { type: "text", text: "Sell this one\n\n[Attached photos: p2]" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,AA" } },
    ]);
    expect(mockChatTurn({ system: "", messages, tools: chatTools({ listingId: null }) }).toolCalls).toEqual([
      { name: "startListing", argsJson: '{"photoIds":["p2"]}' },
    ]);
  });

  it("waits for the seller on store and posting calls only", () => {
    expect(pendingCalls(history).map((c) => c.id)).toEqual(["c2"]);
    const answered: ChatMessage[] = [
      ...history,
      { role: "tool", toolCallId: "c2", name: "postReel", result: { ok: false, declined: true } },
    ];
    expect(pendingCalls(answered)).toEqual([]);
    expect(chatItems(answered).at(-1)).toMatchObject({ kind: "approval", id: "c2", state: "declined" });
  });

  it("draws the conversation with what each tool made", () => {
    const items = chatItems(history);
    expect(items.map((i) => i.kind)).toEqual(["user", "tool", "assistant", "approval"]);
    expect(items[1]).toMatchObject({ name: "makeReel", ok: true, media: { video: true } });
    expect(items[3]).toMatchObject({ state: "pending", args: { caption: "Red saree" } });
    expect(chatRevision(history)).toBe(1);
  });

  it("hides steps a Stop kept from running, and keeps a card shown before it answerable", () => {
    // the card and the reel came in one turn; Stop came between them
    const turn = history.at(-1) as Extract<ChatMessage, { role: "assistant" }>;
    const stopped: ChatMessage[] = [
      ...history.slice(0, -1),
      { ...turn, toolCalls: [...turn.toolCalls, call("c3", "makeReel", { lang: "bn" })] },
      { role: "tool", toolCallId: "c3", name: "makeReel", result: { ok: false, stopped: true } },
      { role: "assistant", content: null, toolCalls: [], stopped: true },
    ];
    expect(chatItems(stopped).map((i) => i.kind)).toEqual(["user", "tool", "assistant", "approval", "stopped"]);
    expect(pendingCalls(stopped).map((c) => c.id)).toEqual(["c2"]);
  });

  it("has a mock that picks tools and then answers in words", () => {
    const tools = listingTools();
    const reel = mockChatTurn({ system: "", tools, messages: [{ role: "user", content: "Make a Bangla reel" }] });
    expect(reel.toolCalls).toEqual([{ name: "makeReel", argsJson: '{"lang":"bn"}' }]);
    expect(mockChatTurn({ system: "", tools, messages: history.slice(0, 3) })).toEqual({
      content: "Done.",
      toolCalls: [],
    });
  });
});
