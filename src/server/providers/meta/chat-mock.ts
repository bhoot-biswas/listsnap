import "server-only";
import type { ChatInput, ChatTurn } from "../types";

/**
 * A stand-in for the chat model that picks tools from keywords, so the chat box, the
 * approval cards and the tests work without a key. It follows the same protocol as
 * the live model: after tool results it answers in words.
 */
export function mockChatTurn(input: ChatInput): ChatTurn {
  const last = input.messages.at(-1);
  if (!last || last.role === "assistant") return reply("How can I help with this listing?");
  const shop = input.tools.some((t) => t.name === "findListings");
  if (last.role === "tool") {
    const results = trailingResults(input);
    // the shop chat's "save everything Ready": the listings found, then one approval for all
    const found = (results[0] as { listings?: { id: string }[] } | undefined)?.listings;
    const asked = [...input.messages].reverse().find((m) => m.role === "user");
    if (shop && found && asked?.role === "user" && /store/i.test(asked.content))
      return found.length
        ? {
            content: null,
            toolCalls: [
              { name: "saveDraftsToStore", argsJson: JSON.stringify({ listingIds: found.map((l) => l.id) }) },
            ],
          }
        : reply("There's nothing to save.");
    const failed = results.find((r) => !(r as { ok?: boolean }).ok) as { message?: string } | undefined;
    return reply(failed ? `That didn't work: ${failed.message ?? "try again"}.` : "Done.");
  }

  const text = last.content.toLowerCase();
  const lang = /bangla|bengali|বাংলা/.test(text) ? "bn" : "en";
  const has = (name: string) => input.tools.some((t) => t.name === name);
  const call = (name: string, args: Record<string, unknown> = {}): ChatTurn =>
    has(name)
      ? { content: null, toolCalls: [{ name, argsJson: JSON.stringify(args) }] }
      : reply("I can't do that here.");

  if (shop) {
    // a photo on its own, or with "sell" or "listing", is a new product
    if (last.photoIds?.length && (!text || /sell|listing|বিক্রি|লিস্টিং/.test(text)))
      return call("startListing", { photoIds: last.photoIds });
    if (/ready/.test(text)) return call("findListings", { status: "ready" });
    if (/review/.test(text)) return call("findListings", { status: "needs_review" });
    if (/left|how many/.test(text)) return call("getShopSummary");
  }
  if (/reel/.test(text) && /post|instagram|facebook/.test(text))
    return call("postReel", { lang, destination: /instagram/.test(text) ? "instagram" : "facebook" });
  if (/reel|video/.test(text)) return call("makeReel", { lang });
  if (/store|draft|woo/.test(text)) return call("saveDraftToStore", {});
  if (/undo|go back/.test(text)) return call("undoLast");
  const price = /price[^\d]*(\d[\d,]*)/.exec(text);
  if (price) return call("editListingFields", { priceBdt: Number(price[1]!.replace(/,/g, "")) });
  const title = /title[^"“]*["“]([^"”]+)["”]/.exec(last.content);
  if (title) return call("editListingFields", { title: title[1] });
  const look = /\b(eid|boishakh|minimal|outdoor|wedding)\b/.exec(text);
  if (look) return call("renderLook", { look: look[1] });
  const scene = /\b(studio|lifestyle|banner)\b/.exec(text);
  if (scene) return call("renderScene", { scene: scene[1] });
  if (/status|why|review|what/.test(text)) return call("getListingSummary");
  return reply(
    "I can change the title or price, make photos and reels, save this listing to your store, or post its reel.",
  );
}

const reply = (content: string): ChatTurn => ({ content, toolCalls: [] });

/** The tool results after the model's last tool calls. */
function trailingResults(input: ChatInput): unknown[] {
  const out: unknown[] = [];
  for (let i = input.messages.length - 1; i >= 0; i--) {
    const m = input.messages[i]!;
    if (m.role !== "tool") break;
    out.push(m.result);
  }
  return out;
}
