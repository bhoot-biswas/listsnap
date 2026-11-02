import { apiViewer } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import {
  addDictation,
  DICTATIONS_PER_DAY,
  hasRoom,
  newDictationId,
  removeDictation,
} from "@/server/dictation/sessions";
import { fail, unauthorized } from "@/server/http";
import { SHOP_WORDS } from "@/server/media/voice";
import { meta } from "@/server/providers";
import type { LiveTranscription } from "@/server/providers/types";
import type { DictationEvent } from "@/lib/schemas/dictation";

/** A minute of talking, then the last words. */
export const maxDuration = 120;

/**
 * Starts live dictation for a chat box. The answer is a stream of newline-separated JSON
 * events: `ready` with the session id the audio uploads go to, the words as they're
 * heard, then `final` (or `failed`, and the browser sends the recording whole instead).
 * Like /api/transcribe, the words only fill the box; the seller reads them and sends.
 */
export async function POST() {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const ws = forWorkspace(viewer.workspace.id);
  if ((await ws.dictationsToday()) >= DICTATIONS_PER_DAY) return fail(429, "limit", "dictateLimit");
  // no room: the browser quietly sends the recording whole when the seller stops
  if (!hasRoom(ws.id)) return fail(503, "busy", "sendRecording");

  const id = newDictationId();
  const encoder = new TextEncoder();
  let live: LiveTranscription | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const emit = (e: DictationEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          // the seller left; cancel() below tidies up
        }
      };
      const close = () => {
        if (!open) return;
        open = false;
        removeDictation(id);
        try {
          controller.close();
        } catch {
          // already cancelled
        }
      };
      try {
        live = meta().transcribeLive({ workspaceId: ws.id, jobId: null, step: "dictate" }, SHOP_WORDS, {
          partial: (text) => emit({ type: "partial", text }),
          final: (text) => {
            emit({ type: "final", text });
            close();
          },
          failed: (reason) => {
            emit({ type: "failed", reason });
            close();
          },
        });
      } catch (err) {
        // an open breaker or a missing key: the one-shot path will say which
        console.warn("[dictate] could not start:", err instanceof Error ? err.message : err);
        emit({ type: "failed", reason: "busy" });
        close();
        return;
      }
      const session = live;
      addDictation({ id, workspaceId: ws.id, live: session }, () => {
        session.cancel();
        emit({ type: "failed", reason: "lost" });
        close();
      });
      emit({ type: "ready", id });
    },
    cancel() {
      live?.cancel();
      removeDictation(id);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Nginx would otherwise hold the words back until the seller stops
      "X-Accel-Buffering": "no",
    },
  });
}
