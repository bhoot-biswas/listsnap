import "server-only";
import en from "../../../messages/en.json";
import bn from "../../../messages/bn.json";
import { reelPrice } from "@/server/reels/inputs";
import { CAPTION_MAX } from "@/lib/schemas/social";
import type { ReelLang } from "@/lib/schemas/reels";

const WORDS = { en, bn };
const MAX_TAGS = 8;

/** "jamdani saree" → "#jamdanisaree"; Bangla letters and their vowel signs are kept. */
const hashtag = (tag: string) => {
  const word = tag.normalize("NFC").replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
  return word ? `#${word}` : "";
};

/**
 * The caption a reel starts with: the saved title, short description, price and the
 * ask, then the listing's tags as hashtags. Built from the listing, not written by AI,
 * so it never claims anything the listing doesn't; the seller edits it before posting.
 */
export function defaultCaption(input: {
  lang: ReelLang;
  title: string;
  shortDescription: string;
  priceBdt: number | null;
  tags: string[];
}): string {
  const w = WORDS[input.lang].review.reels.post;
  const tags = [...new Set(input.tags.map(hashtag).filter(Boolean))].slice(0, MAX_TAGS).join(" ");
  const lines = [
    input.title,
    input.shortDescription,
    input.priceBdt !== null ? w.priceLine.replace("{price}", reelPrice(input.priceBdt, input.lang)) : "",
    w.cta,
    tags,
  ].filter((l) => l.trim());
  return lines.join("\n\n").slice(0, CAPTION_MAX);
}
