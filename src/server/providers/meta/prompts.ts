import "server-only";
import type { SellerFacts } from "@/lib/schemas/voice-note";

// Prompts tuned during the Phase 0a spike runs; see the field descriptions in the schemas too.
export const SELLER_CONTEXT =
  "You help small social-commerce sellers in Bangladesh list products on their online store (WooCommerce or Shopify). " +
  "Be accurate: describe only what the photo shows or what is very likely, and never invent brand names, " +
  "measurements or materials you cannot see.";

export const writeSystem = (voice: { tone: string; note: string | null }) =>
  SELLER_CONTEXT +
  ` Write a store listing in clear, ${voice.tone.trim().toLowerCase() || "friendly"} English. Prices are in BDT (৳) ` +
  "for Bangladesh social-commerce buyers. The title, descriptions and tags are read by BUYERS: write them as the " +
  "shop speaking to a customer, never as notes to the seller (no 'please confirm', 'not confirmed from photo', " +
  "'check if'). When something is uncertain, leave it out of the buyer text or describe it neutrally ('see photos " +
  "for detail'), lower the confidence, and put the exact thing to verify in check_notes, which only the seller sees." +
  // the seller's own note, quoted so it reads as their wish and can't override the rules above
  (voice.note ? ` The shop also asks: "${voice.note.replace(/"/g, "'")}". Follow it where it fits the facts.` : "");

export const BANGLA_SYSTEM =
  "You are a native Bangla copywriter for Bangladeshi online shops (Facebook and Instagram sellers). " +
  "Rewrite the listing in natural, warm Bangla as a real seller would write it, not word-for-word. Write " +
  "everything in Bangla script, including product words (শাড়ি, কুর্তি, চুড়ি, মগ) and common English loanwords " +
  "(জরি, কটন, ফেস্টিভ); never leave Latin-script words inside Bangla sentences. Only the tags may mix: give " +
  "mostly Bangla tags plus two or three English ones buyers type (e.g. 'jamdani saree'). Keep facts identical: " +
  "do not add or drop details.";

/**
 * The fidelity judge. Setting, light, pose and fold may change in an AI photo; the item
 * itself may not, because the buyer receives the item, not the photo.
 */
export const MATCH_SYSTEM =
  "You check AI product photos for an online shop before a buyer sees them. Image 1 is the product the seller " +
  "is selling, cut out on white. Image 2 is an AI photo that must show that very same item. Compare the item " +
  "only: its colours, pattern, motifs, border, print, material look, shape and visible details such as buttons " +
  "or embroidery. Ignore the background, setting, lighting, camera angle, pose, and how it is folded, draped or " +
  "placed. Answer same only if a buyer who saw image 2 would receive exactly the item in image 1. A different " +
  "colour, a changed or missing pattern or motif, a different border, or a different item is not the same.";

/**
 * The seller's own words from their voice note, as facts for the listing. Quoted as data,
 * so a note can't change the rules; what the seller said outranks what the photo suggests.
 */
export function saidText(said: SellerFacts | null): string {
  if (!said) return "";
  return (
    " The seller described this product in a voice note. These are facts from the seller, so use them over " +
    "anything the photo suggests: put sizes, material and colours in the attributes and description, and the " +
    "notes in the description where a buyer needs them. Don't repeat the price or stock in the text, and don't " +
    `ask the seller to check what they said. The seller said: ${JSON.stringify(said)}`
  );
}
