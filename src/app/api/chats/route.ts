import { apiViewer } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { notFound, ok, unauthorized } from "@/server/http";
import type { ChatSummary } from "@/lib/schemas/chat";

/**
 * The earlier conversations a chat box can open: a listing's with `?listing=<id>`, the
 * shop chat's without it. Read when the seller opens the list, so it's never stale.
 */
export async function GET(request: Request) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const ws = forWorkspace(viewer.workspace.id);
  const listingId = new URL(request.url).searchParams.get("listing");
  if (listingId && !(await ws.getListing(listingId))) return notFound();

  const rows = await ws.chatList(listingId);
  const chats: ChatSummary[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
  return ok({ chats });
}
