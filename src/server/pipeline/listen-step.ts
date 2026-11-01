import "server-only";
import { StepError } from "./run-step";
import { readMedia } from "@/server/media/store";
import { baseten, meta } from "@/server/providers";
import { ListenResult, saidNothing } from "@/lib/schemas/voice-note";
import type { JobStepContext } from "./job-steps";

/**
 * Words Muse Voice Transcribe should hear right in a Bangladeshi clothes or crafts shop.
 * Bangla script only: the spike found English keywords pulled the whole transcript into
 * Latin letters.
 */
const KEYWORDS = [
  "জামদানি",
  "থ্রি-পিস",
  "কুর্তি",
  "শাড়ি",
  "কাতান",
  "মসলিন",
  "সুতি",
  "সিল্ক",
  "জর্জেট",
  "পাঞ্জাবি",
  "লেহেঙ্গা",
  "ওড়না",
  "সালোয়ার",
  "কামিজ",
  "টাকা",
];

const call = (ctx: JobStepContext) => ({ workspaceId: ctx.ws.id, jobId: ctx.jobId, step: "listen" });

/**
 * The seller's voice note into facts: Muse Voice Transcribe writes down the words, then
 * Muse Spark Open reads them with the photo. It runs beside plan, and write waits for it.
 * If Transcribe fails, Spark Open hears the recording itself, so one outage doesn't lose
 * the note; Review then asks the seller to check the price, which that route got wrong
 * in the spike.
 */
export async function listenStep(ctx: JobStepContext): Promise<ListenResult> {
  const job = await ctx.ws.getJob(ctx.jobId);
  const [photo] = await ctx.ws.photos(ctx.jobId);
  const [voice, original] = await Promise.all([
    job?.voice_media_id ? readMedia(ctx.ws.id, job.voice_media_id) : null,
    photo ? readMedia(ctx.ws.id, photo.media_id) : null,
  ]);
  if (!voice) throw new StepError("voiceNoteMissing");
  if (!original) throw new StepError("photoMissing");

  let transcript: string;
  try {
    transcript = (await meta().transcribe(call(ctx), voice.data, KEYWORDS)).text;
  } catch (err) {
    console.warn("[listen] Transcribe failed, hearing the audio instead:", err instanceof Error ? err.message : err);
    const r = await baseten().factsFromAudio(call(ctx), voice.data, original.data);
    return { transcript: r.heard, heardBy: "audio", facts: saidNothing(r.facts) ? null : r.facts };
  }
  // a silent or empty note: nothing to read, and nothing to pay Spark Open for
  if (transcript.replace(/[\s.,।?!]/g, "").length < 2) return { transcript: "", heardBy: "transcribe", facts: null };
  const facts = await baseten().facts(call(ctx), transcript, original.data);
  return { transcript, heardBy: "transcribe", facts: saidNothing(facts) ? null : facts };
}
