import "server-only";
import { env } from "@/server/env";
import type { SellerFacts } from "@/lib/schemas/voice-note";
import type { VideoProduct } from "@/lib/schemas/video";
import { logged } from "../log";
import { MOCK_TRANSCRIPT } from "../meta/mock";
import type { BasetenProvider } from "../types";

/** The facts in the mock transcript, so a mock snap with a voice note shows them end to end. */
const FACTS: SellerFacts = {
  price_bdt: 1500,
  sizes: ["M", "L", "XL"],
  colors: ["Maroon"],
  stock: 12,
  material: "Cotton",
  notes: [],
};

const MOCK_PRODUCTS: VideoProduct[] = [
  { ...FACTS, best_frame_s: 0.5, phrase: "maroon three-piece", said: "এই যে মেরুন থ্রি-পিসটা, দাম দেড় হাজার টাকা।" },
  {
    price_bdt: 4500,
    sizes: [],
    colors: ["Red"],
    stock: 3,
    material: null,
    notes: [],
    best_frame_s: 1.5,
    phrase: "red jamdani saree",
    said: "লাল জামদানি শাড়ি, চার হাজার পাঁচশো, আছে তিনটা।",
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const delay = () => sleep(env().mockDelayMs * (0.6 + Math.random() * 0.8));
const info = {
  provider: "baseten",
  model: "muse-spark-open (mock)",
  endpoint: "chat/completions",
  mode: "mock",
} as const;

export const mockBaseten: BasetenProvider = {
  mode: "mock",

  facts: (ctx) =>
    logged(
      ctx,
      info,
      async () => {
        await delay();
        return FACTS;
      },
      () => ({ summary: "৳1500 · sizes M/L/XL · stock 12 · Cotton", costUsd: 0 }),
    ),

  factsFromAudio: (ctx) =>
    logged(
      ctx,
      info,
      async () => {
        await delay();
        return { heard: MOCK_TRANSCRIPT, facts: FACTS };
      },
      () => ({ summary: "from audio · ৳1500", costUsd: 0 }),
    ),

  watch: (ctx) =>
    logged(
      ctx,
      { ...info, endpoint: "chat/completions (video)" },
      async () => {
        await delay();
        // early in any clip, so the frames exist however short the test video is
        return MOCK_PRODUCTS;
      },
      (r) => ({ summary: `${r.length} products`, costUsd: 0 }),
    ),
};
