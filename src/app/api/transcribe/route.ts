import { apiViewer } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { fail, ok, unauthorized } from "@/server/http";
import { normaliseVoice, SHOP_WORDS, unreadableVoice, voiceFileProblem } from "@/server/media/voice";
import { meta } from "@/server/providers";

/** A minute each, so this is hours of talking; past it the box is still there to type in. */
const PER_DAY = 100;

/**
 * Speech into words for a chat box (multipart field "audio"): Muse Voice Transcribe, with
 * the same Bangla shop words as voice notes. The words go back to the box for the seller
 * to read and send, so nothing reaches the chat model unseen. The recording isn't kept.
 */
export async function POST(request: Request) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "bad_request", "sendRecording");
  }
  const file = form.get("audio");
  if (!(file instanceof File) || !file.size) return fail(400, "no_audio", "unreadableVoiceNote");
  const problem = voiceFileProblem(file);
  if (problem) return problem;

  const ws = forWorkspace(viewer.workspace.id);
  if ((await ws.dictationsToday()) >= PER_DAY) return fail(429, "limit", "dictateLimit");
  const note = await normaliseVoice(Buffer.from(await file.arrayBuffer()));
  if (!note) return unreadableVoice();
  const heard = await meta().transcribe({ workspaceId: ws.id, jobId: null, step: "dictate" }, note.data, SHOP_WORDS);
  return ok({ text: heard.text });
}
