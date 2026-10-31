import { apiViewer } from "@/server/auth/session";
import { ops } from "@/server/ops";
import { fail, notFound, stepResponse, unauthorized } from "@/server/http";
import { StoreKind } from "@/lib/stores";

/**
 * Saves the listing as a draft (never published) to every store the shop saves drafts
 * to, or to one with `?store=woo|shopify`. Safe to repeat; `?update=1` sends edits again.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/listings/[id]/store">) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const { id } = await ctx.params;
  const query = new URL(request.url).searchParams;
  const update = query.get("update") === "1";
  const store = StoreKind.safeParse(query.get("store"));
  // the seller pressed "Save as draft", which is the confirmation a store change needs
  const r = await ops.saveDraftToStore.call(
    viewer.workspace,
    { listingId: id, update, ...(store.success ? { stores: [store.data] } : {}) },
    { via: "ui", confirmed: true },
  );
  if (r.ok) return stepResponse(r.value.outcome);
  if (r.error === "not_found") return notFound();
  if (r.error === "not_ready") return fail(409, "not_ready", "notFinished");
  return fail(400, "invalid", "invalidRequest");
}
