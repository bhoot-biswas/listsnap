import "server-only";
import { randomUUID } from "node:crypto";
import type { Workspace } from "@/server/db/workspaces";
import { forWorkspace } from "@/server/db/scope";
import { meta } from "@/server/providers";
import { photoDataUrl } from "@/server/providers/meta/spark";
import { readMedia } from "@/server/media/store";
import { StepError } from "@/server/pipeline/run-step";
import type { ChatEvent, ChatMessage, ChatRequest, ToolCall } from "@/lib/schemas/chat";
import { chatSystem } from "./prompt";
import { changesListing, chatTools, checkArgs, makesMedia, needsApproval, runTool, type ChatScope } from "./tools";
import { approvalItem, pendingCalls, toolExtras } from "./view";

/** Model turns per seller message: enough to read, act and answer, not enough to wander. */
const MAX_TURNS = 6;
/**
 * Photos and reels one message may start; more needs the seller to ask again. The shop
 * chat allows a few more, for "Eid photos for my red sarees".
 */
const maxMedia = (scope: ChatScope) => (scope.listingId ? 2 : 4);
/** Spark calls a shop may make through chat each day, about a dollar at worst. */
export const CHAT_CALLS_PER_DAY = 300;

const DECLINED = { ok: false, declined: true, message: "The seller said no. Nothing was sent." };
const MOVED_ON = {
  ok: false,
  declined: true,
  message: "The seller wrote again instead of approving. Nothing was sent.",
};

/**
 * One request of a listing's chat or the shop chat: a new message, or the seller's answer to an approval
 * card. Every message is stored as it happens, so a reload shows the same conversation
 * and a card left open is still waiting. Store and posting calls stop the loop until the
 * seller answers; they run only with that approval, using the args the card showed.
 */
export async function runChat(
  workspace: Workspace,
  scope: ChatScope,
  req: ChatRequest,
  emit: (e: ChatEvent) => void,
  /** The visitor's address, which a demo shop's listing limit counts by. */
  clientIp?: string,
): Promise<void> {
  const ws = forWorkspace(workspace.id);
  const listing = scope.listingId ? await ws.getListing(scope.listingId) : null;
  if (scope.listingId && !listing) return emit({ type: "error", code: "generic" });
  // an earlier conversation the seller opened, or the one used last
  let chatId = req.chatId ? await ws.chatInScope(req.chatId, scope.listingId) : await ws.listingChat(scope.listingId);
  if (req.chatId && !chatId) return emit({ type: "error", code: "generic" });
  const history = chatId ? await ws.chatMessages(chatId) : [];
  const add = async (m: ChatMessage) => {
    history.push(m);
    await ws.addChatMessage(chatId!, m);
  };
  let changed = false;
  const done = () => emit({ type: "done", changed, ...(chatId && { chatId }) });

  if ("message" in req) {
    if ((await ws.chatCallsToday()) >= CHAT_CALLS_PER_DAY) return emit({ type: "error", code: "limit" });
    const photoIds = [...new Set(req.photoIds)];
    if ((await ws.chatPhotos(photoIds)).length !== photoIds.length) return emit({ type: "error", code: "generic" });
    if (!chatId || req.newChat) {
      // a card left open in the old chat can't be answered any more, so nothing is sent
      chatId = await ws.startChat(scope.listingId, req.message || "Photo");
      history.length = 0;
    }
    for (const call of pendingCalls(history)) {
      await add({ role: "tool", toolCallId: call.id, name: call.name, result: MOVED_ON });
      emit({ type: "item", item: approvalItem(call, "declined") });
    }
    await add({ role: "user", content: req.message, ...(photoIds.length && { photoIds }) });
  } else {
    const call = pendingCalls(history).find((c) => c.id === req.approve.toolCallId);
    if (!call) return emit({ type: "error", code: "answered" });
    let result: Record<string, unknown> = DECLINED;
    if (req.approve.yes) {
      emit({ type: "working", name: call.name });
      result = await runTool(workspace, scope, call, true, clientIp);
      changed = result.ok === true;
    }
    await add({ role: "tool", toolCallId: call.id, name: call.name, result });
    const state = !req.approve.yes ? "declined" : result.ok ? "approved" : "failed";
    emit({ type: "item", item: approvalItem(call, state, result) });
    // another card from the same turn still waits for its own answer
    if (pendingCalls(history).length) return done();
  }

  const ctx = { workspaceId: workspace.id, jobId: listing?.job_id ?? null, step: "chat" };
  const system = await chatSystem(workspace, scope);
  const tools = chatTools(scope);
  const images = await latestPhotos(workspace.id, history);
  let media = 0;
  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      emit({ type: "working", name: null });
      const answer = await meta().chat(ctx, { system, messages: history, tools, images });
      // our own ids: the model's may repeat across turns, and an id is an op's idempotency key
      const checked = await Promise.all(
        answer.toolCalls.map(async (c) => ({
          id: randomUUID(),
          name: c.name,
          check: await checkArgs(workspace, scope, c.name, c.argsJson),
        })),
      );
      const calls: ToolCall[] = checked.map((c) => ({
        id: c.id,
        name: c.name,
        args: c.check.ok ? c.check.args : {},
        ...(c.check.ok && c.check.preview && { preview: c.check.preview }),
      }));
      await add({ role: "assistant", content: answer.content, toolCalls: calls });
      if (answer.content) emit({ type: "item", item: { kind: "assistant", id: randomUUID(), text: answer.content } });
      if (!calls.length) return done();

      let waiting = false;
      for (const [i, call] of calls.entries()) {
        const check = checked[i]!.check;
        let result: Record<string, unknown>;
        if (!check.ok) result = { ok: false, message: check.error };
        else if (needsApproval(call.name)) {
          emit({ type: "item", item: approvalItem(call, "pending") });
          waiting = true;
          continue;
        } else if (makesMedia(call.name) && ++media > maxMedia(scope)) {
          result = {
            ok: false,
            message: `Only ${maxMedia(scope)} photos or reels per message. Ask the seller before making more.`,
          };
        } else {
          emit({ type: "working", name: call.name });
          result = await runTool(workspace, scope, call, false, clientIp);
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
      if (waiting) return done();
    }
    emit({ type: "error", code: "steps" });
  } catch (err) {
    if (err instanceof StepError) emit({ type: "error", code: "busy", message: err.message });
    else {
      console.error("[chat] unexpected error:", err);
      emit({ type: "error", code: "generic" });
    }
  }
  done();
}

/** The photos of the seller's latest message, ready for the model; older ones it knows by id. */
async function latestPhotos(workspaceId: string, history: ChatMessage[]): Promise<Record<string, string>> {
  const last = history.findLast((m) => m.role === "user");
  const out: Record<string, string> = {};
  for (const id of (last?.role === "user" && last.photoIds) || []) {
    const media = await readMedia(workspaceId, id);
    if (media) out[id] = await photoDataUrl(media.data);
  }
  return out;
}
