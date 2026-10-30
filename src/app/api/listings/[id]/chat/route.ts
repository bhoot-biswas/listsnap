import { apiViewer } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { fail, notFound, unauthorized } from "@/server/http";
import { runChat } from "@/server/chat/run-chat";
import { ChatRequest, type ChatEvent } from "@/lib/schemas/chat";

/** A chat turn can wait on a reel render (about a minute) plus the model's turns around it. */
export const maxDuration = 300;

/**
 * The listing chat. The body is a message or an answer to an approval card; the response
 * streams events as newline-separated JSON, so the seller sees each step (thinking,
 * making the reel, the reply) as it happens instead of after a minute.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/listings/[id]/chat">) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const body = ChatRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "invalid", "Write a message first.");
  const { id } = await ctx.params;
  if (!(await forWorkspace(viewer.workspace.id).getListing(id))) return notFound();

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
        await runChat(viewer.workspace, id, body.data, emit);
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
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
