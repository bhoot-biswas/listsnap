import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { ChatMessage, ToolCall } from "@/lib/schemas/chat";
import { sparkChat } from "@/server/providers/meta/chat";
import { photoDataUrl } from "@/server/providers/meta/spark";
import { listingSystem, shopSystem } from "@/server/chat/prompt";
import { NO_REEL, chatTools, needsApproval, parseToolArgs } from "@/server/chat/tools";
import { CASES, type ChatCase, type ExpectedCall } from "./cases";
import { SAREE_SUMMARY, SHOP_FACTS, findListings, listingFacts } from "./fixtures";

/**
 * The chat eval: each seller request goes to live Muse Spark with the app's own prompt
 * and tools, and the run checks which tools it asked for. Tools are never run: reads
 * answer from the made-up shop, everything else answers "done", and a store or posting
 * call ends the turn as the approval card would. Run with `pnpm eval:chat`.
 */

const MAX_TURNS = 4;
const READS = new Set(["getListingSummary", "getShopSummary", "findListings"]);

interface Run {
  calls: ToolCall[];
  invalid: string[];
  reply: string;
  costUsd: number;
}

async function run(c: ChatCase): Promise<Run> {
  const scope = { listingId: c.scope === "listing" ? SAREE_SUMMARY.id : null };
  const system = c.scope === "listing" ? listingSystem(listingFacts(c.facts)) : shopSystem(SHOP_FACTS);
  const tools = chatTools(scope);
  // photos are named photo-1, photo-2…, as media ids would be, and shown as the app shows them
  const photoIds = (c.photos ?? []).map((_, i) => `photo-${i + 1}`);
  const images: Record<string, string> = {};
  for (const [i, file] of (c.photos ?? []).entries())
    images[photoIds[i]!] = await photoDataUrl(readFileSync(path.join(process.cwd(), "public/samples", file)));
  const messages: ChatMessage[] = [
    ...(c.history ?? []),
    { role: "user", content: c.say, ...(photoIds.length && { photoIds }) },
  ];
  const out: Run = { calls: [], invalid: [], reply: "", costUsd: 0 };
  // the shop's made-up listings all have both reels
  const reelsMade = c.scope === "listing" ? [...listingFacts(c.facts).reelsMade] : ["en", "bn"];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const { turn: answer, costUsd } = await sparkChat({ system, messages, tools, images });
    out.costUsd += costUsd;
    if (answer.content) out.reply += `${answer.content}\n`;
    const calls = answer.toolCalls.map((tc) => {
      const parsed = parseToolArgs(scope, tc.name, tc.argsJson);
      if (!parsed.ok) out.invalid.push(`${tc.name}: ${parsed.error}`);
      return { id: randomUUID(), name: tc.name, args: parsed.ok ? parsed.args : {} };
    });
    out.calls.push(...calls);
    messages.push({ role: "assistant", content: answer.content, toolCalls: calls });
    // as on the server, posting a reel that isn't made is refused before any card is shown
    const refused = (tc: ToolCall) => tc.name === "postReel" && !reelsMade.includes(tc.args.lang as string);
    if (!calls.length || calls.some((tc) => needsApproval(tc.name) && !refused(tc))) break;
    for (const tc of calls) {
      if (tc.name === "makeReel") reelsMade.push(tc.args.lang as string);
      const result = refused(tc) ? { ok: false, message: NO_REEL } : fakeResult(tc);
      messages.push({ role: "tool", toolCallId: tc.id, name: tc.name, result });
    }
  }
  return out;
}

function fakeResult(call: ToolCall): unknown {
  if (call.name === "getListingSummary") return { ok: true, ...SAREE_SUMMARY };
  if (call.name === "getShopSummary") return { ok: true, ...SHOP_FACTS };
  if (call.name === "findListings") return findListings(call.args as { status?: string; query?: string });
  return { ok: true, done: true };
}

/** Field by field: strings and numbers equal, a RegExp matches, arrays hold the same items in any order. */
function matches(expected: unknown, actual: unknown): boolean {
  if (expected instanceof RegExp) return typeof actual === "string" && expected.test(actual);
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((e) => actual.some((a) => matches(e, a)))
    );
  if (expected && typeof expected === "object")
    return (
      !!actual &&
      typeof actual === "object" &&
      Object.entries(expected).every(([k, v]) => matches(v, (actual as Record<string, unknown>)[k]))
    );
  return expected === actual;
}

const found = (want: ExpectedCall, calls: ToolCall[]) =>
  calls.some((c) => c.name === want.tool && matches(want.args ?? {}, c.args));

const describeCalls = (calls: ToolCall[]) =>
  calls.map((c) => `${c.name}(${JSON.stringify(c.args)})`).join(", ") || "no tools";

const results: {
  name: string;
  pass: boolean;
  problems: string[];
  calls: string;
  reply: string;
  costUsd: number;
}[] = [];

describe("chat eval (live Muse Spark)", () => {
  it.concurrent.each(CASES)("$scope: $name", async (c) => {
    const r = await run(c);
    const problems: string[] = [...r.invalid];
    for (const want of c.calls ?? [])
      if (!found(want, r.calls)) problems.push(`expected ${want.tool}(${JSON.stringify(want.args ?? {})})`);
    if (c.answer) {
      const acted = r.calls.filter((tc) => !READS.has(tc.name));
      if (acted.length) problems.push(`expected an answer, got ${describeCalls(acted)}`);
      if (!r.reply.trim()) problems.push("expected an answer, got no reply");
    }
    for (const tool of c.never ?? []) if (r.calls.some((tc) => tc.name === tool)) problems.push(`called ${tool}`);
    if (c.bangla && !/[ঀ-৿]/.test(r.reply)) problems.push("replied without Bangla");
    if (/\bpublish(ed|ing)?\b/i.test(r.reply) && !/\bnot\b|\bnever\b|n't/i.test(r.reply))
      problems.push("said it would publish");

    results.push({
      name: `${c.scope}: ${c.name}`,
      pass: !problems.length,
      problems,
      calls: describeCalls(r.calls),
      reply: r.reply.trim(),
      costUsd: r.costUsd,
    });
    expect(problems, `${describeCalls(r.calls)} | reply: ${r.reply.trim().slice(0, 200)}`).toEqual([]);
  });

  // Vitest hides the output of passing runs, so every run is also kept as a file
  afterAll(() => {
    const passed = results.filter((r) => r.pass).length;
    const costUsd = Math.round(results.reduce((sum, r) => sum + r.costUsd, 0) * 1000) / 1000;
    const dir = path.join(process.cwd(), ".data/evals");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `chat-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(file, JSON.stringify({ passed, total: results.length, costUsd, results }, null, 2));
    console.log(`\nChat eval: ${passed}/${results.length} passed, $${costUsd} of Spark calls. Details: ${file}`);
  });
});
