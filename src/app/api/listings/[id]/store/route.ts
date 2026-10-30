import { apiViewer } from "@/server/auth/session";
import { ops } from "@/server/ops";
import { fail, notFound, stepResponse, unauthorized } from "@/server/http";
import { requestLocale, text } from "@/server/step-text";

/** Saves the listing to the shop's store as a draft (never published). Safe to repeat; `?update=1` sends edits again. */
export async function POST(request: Request, ctx: RouteContext<"/api/listings/[id]/store">) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const { id } = await ctx.params;
  const update = new URL(request.url).searchParams.get("update") === "1";
  // the seller pressed "Save as draft", which is the confirmation a store change needs
  const r = await ops.saveDraftToStore.call(
    viewer.workspace,
    { listingId: id, update },
    { via: "ui", confirmed: true },
  );
  if (r.ok) return stepResponse(r.value.outcome);
  if (r.error === "not_found") return notFound();
  if (r.error === "not_ready")
    return fail(409, "not_ready", text(await requestLocale(), "stepText.errors.notFinished"));
  return fail(400, "invalid", "Invalid request.");
}
