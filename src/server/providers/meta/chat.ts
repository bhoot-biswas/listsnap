import "server-only";
import { z } from "zod";
import { env } from "@/server/env";
import { PermanentError } from "@/server/pipeline/run-step";
import type { ChatMessage } from "@/lib/schemas/chat";
import { logged } from "../log";
import type { CallContext, ChatInput, ChatTurn } from "../types";
import { SPARK_MODEL, sparkCost, sparkPost } from "./spark";

/**
 * The shop assistant's turns through Muse Spark's Chat Completions with function tools.
 * `tool_choice` stays "auto", the only value Spark accepts, and the history is ours:
 * each tool call goes back as the assistant message, followed by one `tool` message per
 * call, as the cookbook's tool-calling recipe does.
 */

// a chat turn is short and the seller is waiting; tools do the slow work in their own requests
const TIMEOUT_MS = 45_000;

const Completion = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullish(),
          tool_calls: z
            .array(z.object({ function: z.object({ name: z.string(), arguments: z.string().nullish() }) }))
            .nullish(),
        }),
      }),
    )
    .min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).nullish(),
});

export function chatBody(input: ChatInput): Record<string, unknown> {
  return {
    model: SPARK_MODEL,
    messages: [{ role: "developer", content: input.system }, ...input.messages.map(toWire)],
    tools: input.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    })),
    tool_choice: "auto",
    // picking a tool and writing two sentences doesn't need deep thought, and the seller is waiting
    reasoning_effort: "low",
    prompt_cache_key: "listsnap-chat-v1",
  };
}

function toWire(m: ChatMessage): Record<string, unknown> {
  if (m.role === "user") return { role: "user", content: m.content };
  if (m.role === "tool") return { role: "tool", tool_call_id: m.toolCallId, content: JSON.stringify(m.result) };
  return {
    role: "assistant",
    content: m.content,
    ...(m.toolCalls.length && {
      tool_calls: m.toolCalls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: JSON.stringify(c.args) },
      })),
    }),
  };
}

/** Names and counts only: the seller's words and the model's reply never reach the log. */
export const chatSummary = (turn: ChatTurn) =>
  turn.toolCalls.length ? `tools: ${turn.toolCalls.map((c) => c.name).join(", ")}` : "reply";

/** One chat turn from Spark, unlogged: the eval calls it directly, the app through liveChat. */
export async function sparkChat(input: ChatInput): Promise<{ turn: ChatTurn; costUsd: number }> {
  const key = env().modelApiKey;
  if (!key) throw new PermanentError("PROVIDER_MODE_META=live needs MODEL_API_KEY.");
  const completion = await sparkPost(key, JSON.stringify(chatBody(input)), TIMEOUT_MS, Completion);
  const message = completion.choices[0]!.message;
  return {
    turn: {
      content: message.content?.trim() || null,
      toolCalls: (message.tool_calls ?? []).map((c) => ({
        name: c.function.name,
        argsJson: c.function.arguments || "{}",
      })),
    },
    costUsd: completion.usage ? Math.round(sparkCost(completion.usage) * 1e6) / 1e6 : 0,
  };
}

export async function liveChat(ctx: CallContext, input: ChatInput): Promise<ChatTurn> {
  const r = await logged(
    ctx,
    { provider: "meta", model: SPARK_MODEL, endpoint: "chat/completions", mode: "live" },
    () => sparkChat(input),
    (r) => ({ summary: chatSummary(r.turn), costUsd: r.costUsd }),
  );
  return r.turn;
}
