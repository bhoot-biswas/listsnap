import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SellerFacts } from "@/lib/schemas/voice-note";

const FACTS: SellerFacts = { price_bdt: 1500, sizes: ["M"], colors: [], stock: 12, material: null, notes: [] };
const transcribe = vi.fn();
const facts = vi.fn();
const factsFromAudio = vi.fn();

vi.mock("@/server/providers", () => ({
  meta: () => ({ transcribe }),
  baseten: () => ({ facts, factsFromAudio }),
}));
vi.mock("@/server/media/store", () => ({
  readMedia: async (_ws: string, id: string) => ({ data: Buffer.from(id), mime: "x" }),
}));

const { listenStep } = await import("./listen-step");

const ctx = {
  jobId: "J1",
  ws: {
    id: "W1",
    getJob: async () => ({ voice_media_id: "voice" }),
    photos: async () => [{ media_id: "photo" }],
  },
} as unknown as Parameters<typeof listenStep>[0];

describe("listenStep", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reads the facts from Transcribe's words", async () => {
    transcribe.mockResolvedValue({ text: "দাম দেড় হাজার টাকা", seconds: 3 });
    facts.mockResolvedValue(FACTS);
    expect(await listenStep(ctx)).toEqual({ transcript: "দাম দেড় হাজার টাকা", heardBy: "transcribe", facts: FACTS });
    expect(factsFromAudio).not.toHaveBeenCalled();
  });

  it("hears the recording with Spark Open when Transcribe fails", async () => {
    transcribe.mockRejectedValue(new Error("down"));
    factsFromAudio.mockResolvedValue({ heard: "দাম বারোশো", facts: FACTS });
    expect(await listenStep(ctx)).toEqual({ transcript: "দাম বারোশো", heardBy: "audio", facts: FACTS });
    expect(facts).not.toHaveBeenCalled();
  });

  it("skips Spark Open for a note with no words, and keeps facts that say nothing as none", async () => {
    transcribe.mockResolvedValue({ text: " । ", seconds: 2 });
    expect(await listenStep(ctx)).toEqual({ transcript: "", heardBy: "transcribe", facts: null });
    expect(facts).not.toHaveBeenCalled();

    transcribe.mockResolvedValue({ text: "আসসালামু আলাইকুম", seconds: 2 });
    facts.mockResolvedValue({ price_bdt: null, sizes: [], colors: [], stock: null, material: null, notes: [] });
    expect((await listenStep(ctx)).facts).toBeNull();
  });
});
