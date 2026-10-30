import "server-only";
import { randomUUID } from "node:crypto";
import type { Workspace } from "@/server/db/workspaces";
import { forWorkspace } from "@/server/db/scope";
import { meta } from "@/server/providers";
import { StepError } from "@/server/pipeline/run-step";
import type { ChatEvent, ChatMessage, ChatRequest, ToolCall } from "@/lib/schemas/chat";
import { chatSystem } from "./prompt";
import { changesListing, checkArgs, listingTools, makesMedia, needsApproval, runTool } from "./tools";
import { pendingCalls, toolExtras } from "./view";

/** Model turns per seller message: enough to read, act and answer, not enough to wander. */
const MAX_TURNS = 6;
/** Photos and reels one message may start; more needs the seller to ask again. */
const MAX_MEDIA_PER_MESSAGE = 2;
/** Spark calls a shop may make through chat each day, about a dollar at worst. */
export const CHAT_CALLS_PER_DAY = 300;

const DECLINED = { ok: false, declined: true, message: "The seller said no. Nothing was sent." };
const MOVED_ON = {
  ok: false,
  declined: true,
  message: "The seller wrote again instead of approving. Nothing was sent.",
};

/**
 * One request of the listing chat: a new message, or the seller's answer to an approval
 * card. Every message is stored as it happens, so a reload shows the same conversation
 * and a card left open is still waiting. Store and posting calls stop the loop until the
 * seller answers; they run only with that approval, using the args the card showed.
 */
export async function runChat(
  workspace: Workspace,
  listingId: string,
  req: ChatRequest,
  emit: (e: ChatEvent) => void,
): Promise<void> {
  const ws = forWorkspace(workspace.id);
  const listing = await ws.getListing(listingId);
  if (!listing) return emit({ type: "error", code: "generic" });
  let chatId = await ws.listingChat(listingId);
  const history = chatId ? await ws.chatMessages(chatId) : [];
  const add = async (m: ChatMessage) => {
    history.push(m);
    await ws.addChatMessage(chatId!, m);
  };
  let changed = false;

  if ("message" in req) {
    if ((await ws.chatCallsToday()) >= CHAT_CALLS_PER_DAY) return emit({ type: "error", code: "limit" });
    if (!chatId || req.newChat) {
      // a card left open in the old chat can't be answered any more, so nothing is sent
      chatId = await ws.startChat(listingId, req.message);
      history.length = 0;
    }
    for (const call of pendingCalls(history)) {
      await add({ role: "tool", toolCallId: call.id, name: call.name, result: MOVED_ON });
      emit({
        type: "item",
        item: { kind: "approval", id: call.id, name: call.name, args: call.args, state: "declined" },
      });
    }
    await add({ role: "user", content: req.message });
  } else {
    const call = pendingCalls(history).find((c) => c.id === req.approve.toolCallId);
    if (!call) return emit({ type: "error", code: "answered" });
    let result: Record<string, unknown> = DECLINED;
    if (req.approve.yes) {
      emit({ type: "working", name: call.name });
      result = await runTool(workspace, listingId, call, true);
      changed = result.ok === true;
    }
    await add({ role: "tool", toolCallId: call.id, name: call.name, result });
    const state = !req.approve.yes ? "declined" : result.ok ? "approved" : "failed";
    emit({
      type: "item",
      item: {
        kind: "approval",
        id: call.id,
        name: call.name,
        args: call.args,
        state,
        ...toolExtras(call.name, result),
      },
    });
    // another card from the same turn still waits for its own answer
    if (pendingCalls(history).length) return emit({ type: "done", changed });
  }

  const ctx = { workspaceId: workspace.id, jobId: listing.job_id, step: "chat" };
  const system = await chatSystem(workspace, listingId);
  const tools = listingTools();
  let media = 0;
  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      emit({ type: "working", name: null });
      const answer = await meta().chat(ctx, { system, messages: history, tools });
      // our own ids: the model's may repeat across turns, and an id is an op's idempotency key
      const checked = await Promise.all(
        answer.toolCalls.map(async (c) => ({
          id: randomUUID(),
          name: c.name,
          check: await checkArgs(workspace, listingId, c.name, c.argsJson),
        })),
      );
      const calls: ToolCall[] = checked.map((c) => ({ id: c.id, name: c.name, args: c.check.ok ? c.check.args : {} }));
      await add({ role: "assistant", content: answer.content, toolCalls: calls });
      if (answer.content) emit({ type: "item", item: { kind: "assistant", id: randomUUID(), text: answer.content } });
      if (!calls.length) return emit({ type: "done", changed });

      let waiting = false;
      for (const [i, call] of calls.entries()) {
        const check = checked[i]!.check;
        let result: Record<string, unknown>;
        if (!check.ok) result = { ok: false, message: check.error };
        else if (needsApproval(call.name)) {
          emit({
            type: "item",
            item: { kind: "approval", id: call.id, name: call.name, args: call.args, state: "pending" },
          });
          waiting = true;
          continue;
        } else if (makesMedia(call.name) && ++media > MAX_MEDIA_PER_MESSAGE) {
          result = {
            ok: false,
            message: `Only ${MAX_MEDIA_PER_MESSAGE} photos or reels per message. Ask the seller before making more.`,
          };
        } else {
          emit({ type: "working", name: call.name });
          result = await runTool(workspace, listingId, call);
          if (result.ok && changesListing(call.name)) changed = true;
        }
        await add({ role: "tool", toolCallId: call.id, name: call.name, result });
        emit({
          type: "item",
          item: {
            kind: "tool",
            id: call.id,
            name: call.name,
            ok: result.ok === true,
            ...toolExtras(call.name, result),
          },
        });
      }
      if (waiting) return emit({ type: "done", changed });
    }
    emit({ type: "error", code: "steps" });
  } catch (err) {
    if (err instanceof StepError) emit({ type: "error", code: "busy", message: err.message });
    else {
      console.error("[chat] unexpected error:", err);
      emit({ type: "error", code: "generic" });
    }
  }
  emit({ type: "done", changed });
}
