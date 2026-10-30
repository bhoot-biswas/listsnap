import type { ChatMessage } from "@/lib/schemas/chat";
import { BANGLES, KURTI, PANJABI, SAREE } from "./fixtures";

/**
 * Seller requests and what the chat should do with each. A case passes when every
 * expected call appears among the calls the model made (arguments compared field by
 * field; a RegExp matches text), no forbidden tool was called, and an "answer" case
 * changed nothing. Read tools are always allowed on the way.
 */

export interface ExpectedCall {
  tool: string;
  args?: Record<string, unknown>;
}

export interface ChatCase {
  name: string;
  scope: "listing" | "shop";
  say: string;
  history?: ChatMessage[];
  /** Sample photos (from public/samples) attached to the message, shown to the model. */
  photos?: string[];
  /** The listing's prompt facts, when the case needs them different from the default. */
  facts?: { reelsMade?: string[]; inStore?: boolean };
  /** Every one of these calls must be made. */
  calls?: ExpectedCall[];
  /** Answers in words: no tool that changes anything. */
  answer?: true;
  /** Tools that must not be called. */
  never?: string[];
  /** The reply has to be in Bangla. */
  bangla?: true;
}

const priceEdit = (priceBdt: number): ChatMessage[] => [
  { role: "user", content: `Set the price to ${priceBdt}` },
  { role: "assistant", content: null, toolCalls: [{ id: "c1", name: "editListingFields", args: { priceBdt } }] },
  { role: "tool", toolCallId: "c1", name: "editListingFields", result: { ok: true, saved: true } },
  { role: "assistant", content: `Done, the price is now ৳${priceBdt}.`, toolCalls: [] },
];

const STORE_AND_POST = ["saveDraftToStore", "saveDraftsToStore", "postReel"];

export const CASES: ChatCase[] = [
  // a listing's chat: explaining
  { name: "explains why it needs review", scope: "listing", say: "Why does this need review?", answer: true },
  {
    name: "explains in Bangla",
    scope: "listing",
    say: "এটা রিভিউতে কেন?",
    answer: true,
    bangla: true,
  },
  {
    name: "answers the allowance from the facts",
    scope: "listing",
    say: "How many AI photos can I still make today?",
    answer: true,
  },
  { name: "stays on topic", scope: "listing", say: "What's the weather in Dhaka today?", answer: true },
  {
    name: "can't delete, and doesn't try",
    scope: "listing",
    say: "Delete this listing",
    answer: true,
    never: STORE_AND_POST,
  },

  // a listing's chat: editing
  {
    name: "changes the title",
    scope: "listing",
    say: 'Change the title to "Red Banarasi Saree with Gold Butti"',
    calls: [{ tool: "editListingFields", args: { title: "Red Banarasi Saree with Gold Butti" } }],
  },
  {
    name: "sets the price",
    scope: "listing",
    say: "Set the price to 1,250 taka",
    calls: [{ tool: "editListingFields", args: { priceBdt: 1250 } }],
  },
  {
    name: "sets the price in Bangla digits",
    scope: "listing",
    say: "দাম ১২০০ টাকা করো",
    calls: [{ tool: "editListingFields", args: { priceBdt: 1200 } }],
  },
  {
    name: "works out a price from the current one",
    scope: "listing",
    say: "Make it 200 taka cheaper",
    calls: [{ tool: "editListingFields", args: { priceBdt: 1300 } }],
  },
  {
    name: "undoes the last change",
    scope: "listing",
    say: "Undo that",
    history: priceEdit(1300),
    calls: [{ tool: "undoLast" }],
  },
  {
    name: "undoes in Bangla",
    scope: "listing",
    say: "আগের দামে ফিরিয়ে দাও",
    history: priceEdit(1300),
    calls: [{ tool: "undoLast" }],
  },

  // a listing's chat: photos and reels
  {
    name: "makes a studio photo",
    scope: "listing",
    say: "Make a clean studio photo",
    calls: [{ tool: "renderScene", args: { scene: "studio" } }],
  },
  {
    name: "makes an Eid look in Bangla",
    scope: "listing",
    say: "একটা ঈদের ছবি বানাও",
    calls: [{ tool: "renderLook", args: { look: "eid" } }],
  },
  {
    name: "makes a Pohela Boishakh look",
    scope: "listing",
    say: "I want a photo for Pohela Boishakh",
    calls: [{ tool: "renderLook", args: { look: "boishakh" } }],
  },
  {
    name: "makes an English reel",
    scope: "listing",
    say: "Make a reel",
    facts: { reelsMade: [] },
    calls: [{ tool: "makeReel", args: { lang: "en" } }],
  },
  {
    name: "makes a Bangla reel",
    scope: "listing",
    say: "বাংলা রিল বানাও",
    facts: { reelsMade: [] },
    calls: [{ tool: "makeReel", args: { lang: "bn" } }],
  },
  {
    name: "remakes a reel after edits",
    scope: "listing",
    say: "I changed the price, make the English reel again",
    calls: [{ tool: "makeReel", args: { lang: "en", retry: true } }],
  },

  // a listing's chat: store and posting, always behind an approval card
  {
    name: "posts the Bangla reel to Instagram",
    scope: "listing",
    say: "Post the Bangla reel to Instagram",
    calls: [{ tool: "postReel", args: { lang: "bn", destination: "instagram" } }],
  },
  {
    name: "posts to both, one card each",
    scope: "listing",
    say: "Post the English reel on Facebook and Instagram",
    calls: [
      { tool: "postReel", args: { lang: "en", destination: "facebook" } },
      { tool: "postReel", args: { lang: "en", destination: "instagram" } },
    ],
  },
  {
    name: "makes the reel before posting it",
    scope: "listing",
    say: "Post a reel of this to Facebook",
    facts: { reelsMade: [] },
    calls: [{ tool: "makeReel", args: { lang: "en" } }],
  },
  { name: "saves to the store", scope: "listing", say: "Save it to my store", calls: [{ tool: "saveDraftToStore" }] },
  {
    name: "saves a draft when asked to publish",
    scope: "listing",
    say: "Publish it on my website now",
    calls: [{ tool: "saveDraftToStore" }],
  },
  {
    name: "updates the store draft",
    scope: "listing",
    say: "Send my latest edits to the store",
    facts: { inStore: true },
    calls: [{ tool: "saveDraftToStore", args: { update: true } }],
  },

  // the shop chat
  {
    name: "finds listings that need review",
    scope: "shop",
    say: "Which listings need review?",
    calls: [{ tool: "findListings", args: { status: "needs_review" } }],
  },
  {
    name: "finds them in Bangla",
    scope: "shop",
    say: "কোন লিস্টিংগুলো রিভিউতে আছে?",
    calls: [{ tool: "findListings", args: { status: "needs_review" } }],
  },
  {
    name: "answers the allowance for the shop",
    scope: "shop",
    say: "How many AI photos are left today?",
    answer: true,
  },
  {
    name: "saves everything Ready under one card",
    scope: "shop",
    say: "Save everything that's Ready to my store",
    calls: [{ tool: "saveDraftsToStore", args: { listingIds: [KURTI, PANJABI] } }],
    never: ["saveDraftToStore"],
  },
  {
    name: "finds a listing by name, then makes its look",
    scope: "shop",
    say: "Make an Eid photo for the Jamdani saree",
    calls: [{ tool: "renderLook", args: { listingId: SAREE, look: "eid" } }],
  },
  {
    name: "posts a named listing's reel in Bangla",
    scope: "shop",
    say: "কুর্তির বাংলা রিলটা ফেসবুকে পোস্ট করো",
    calls: [{ tool: "postReel", args: { listingId: KURTI, lang: "bn", destination: "facebook" } }],
  },
  {
    name: "starts a listing from a sent photo",
    scope: "shop",
    say: "I want to sell this",
    photos: ["saree.jpg", "saree-1.jpg"],
    calls: [{ tool: "startListing", args: { photoIds: ["photo-1", "photo-2"] } }],
  },
  {
    name: "answers about a photo without starting a listing",
    scope: "shop",
    say: "এই ছবিটা কি যথেষ্ট পরিষ্কার?",
    photos: ["kurti.jpg"],
    answer: true,
    bangla: true,
    never: ["startListing"],
  },
  {
    name: "changes a named listing's price",
    scope: "shop",
    say: "Set the bangles to 400 taka",
    calls: [{ tool: "editListingFields", args: { listingId: BANGLES, priceBdt: 400 } }],
  },
];
