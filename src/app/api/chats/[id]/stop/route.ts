import { apiViewer } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { notFound, ok, unauthorized } from "@/server/http";

/**
 * The seller's Stop for the turn running in a chat. Its own request, because the chat's
 * stream ending only means the connection dropped, and that turn should still finish.
 */
export async function POST(_request: Request, { params }: RouteContext<"/api/chats/[id]/stop">) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const { id } = await params;
  if (!(await forWorkspace(viewer.workspace.id).requestChatStop(id))) return notFound();
  return ok({ stopping: true });
}
