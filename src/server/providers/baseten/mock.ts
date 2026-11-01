import "server-only";
import { env } from "@/server/env";
import type { SellerFacts } from "@/lib/schemas/voice-note";
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
};
