import { apiViewer } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { notFound, ok, unauthorized } from "@/server/http";
import { chatItems } from "@/server/chat/view";

/** One earlier conversation as the chat box draws it; another shop's id is "not found". */
export async function GET(_request: Request, { params }: RouteContext<"/api/chats/[id]">) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const { id } = await params;
  const ws = forWorkspace(viewer.workspace.id);
  if ((await ws.chatListing(id)) === undefined) return notFound();
  const [messages, running] = await Promise.all([ws.chatMessages(id), ws.chatRunning(id)]);
  // running: a turn still holds it, so a chat box that lost its stream keeps reading
  return ok({ id, items: chatItems(messages), running });
}
