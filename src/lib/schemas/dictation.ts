import { z } from "zod";

/** About 250 ms of 24 kHz 16-bit mono is 12 KB; this leaves room for a phone catching up. */
export const DICTATION_CHUNK_MAX_BYTES = 64 * 1024;

/**
 * What /api/dictate streams back, one JSON object per line. `partial` is the whole
 * hypothesis so far and replaces the last one; after `failed` the browser sends the
 * recording whole to /api/transcribe instead.
 */
export const DictationEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready"), id: z.string() }),
  z.object({ type: z.literal("partial"), text: z.string() }),
  z.object({ type: z.literal("final"), text: z.string() }),
  z.object({ type: z.literal("failed"), reason: z.enum(["busy", "lost", "generic"]) }),
]);
export type DictationEvent = z.infer<typeof DictationEvent>;
