import { apiViewer } from "@/server/auth/session";
import { fail, unauthorized } from "@/server/http";
import { runChat } from "@/server/chat/run-chat";
import { ChatRequest, type ChatEvent } from "@/lib/schemas/chat";

/** A shop chat turn can wait on a few photos or a reel render plus the model's turns around them. */
export const maxDuration = 300;

/**
 * The shop chat: the same protocol as a listing's chat (a message or an answer to an
 * approval card in, newline-separated JSON events out), with tools over the whole shop.
 */
export async function POST(request: Request) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const body = ChatRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "invalid", "Write a message first.");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: ChatEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          // the seller left the page; the turn still finishes and is stored
        }
      };
      try {
        await runChat(viewer.workspace, { listingId: null }, body.data, emit);
      } catch (err) {
        console.error("[chat] unexpected error:", err);
        emit({ type: "error", code: "generic" });
      }
      try {
        controller.close();
      } catch {
        // already closed by a cancelled request
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Nginx would otherwise hold the events back until the whole turn is done
      "X-Accel-Buffering": "no",
    },
  });
}
