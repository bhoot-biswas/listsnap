import { z } from "zod";
import { apiViewer } from "@/server/auth/session";
import { findDictation } from "@/server/dictation/sessions";
import { fail, notFound, unauthorized } from "@/server/http";
import { DICTATION_CHUNK_MAX_BYTES } from "@/lib/schemas/dictation";

const Seq = z.coerce.number().int().min(0);

/**
 * A quarter second or so of the seller's voice: raw 24 kHz 16-bit mono PCM, numbered so
 * a resent or reordered upload can't scramble the words.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/dictate/[id]/audio">) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const { id } = await ctx.params;
  const d = findDictation(id, viewer.workspace.id);
  if (!d) return notFound();

  const seq = Seq.safeParse(new URL(request.url).searchParams.get("seq"));
  if (!seq.success) return fail(400, "bad_request", "sendRecording");
  if (seq.data !== d.seq) return fail(409, "out_of_order", "sendRecording");
  if (Number(request.headers.get("content-length") ?? 0) > DICTATION_CHUNK_MAX_BYTES)
    return fail(413, "too_large", "voiceNoteTooLarge");
  const pcm = Buffer.from(await request.arrayBuffer());
  // 16-bit samples come in pairs of bytes
  if (pcm.length > DICTATION_CHUNK_MAX_BYTES || pcm.length % 2) return fail(400, "bad_request", "sendRecording");

  d.seq++;
  d.live.push(pcm);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
