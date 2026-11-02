import { apiViewer } from "@/server/auth/session";
import { ops } from "@/server/ops";
import { checkCatalog } from "@/server/pipeline/catalog-step";
import { StepError } from "@/server/pipeline/run-step";
import { errorWords, requestLocale } from "@/server/step-text";
import { fail, failWords, notFound, ok, stepResponse, unauthorized } from "@/server/http";

/**
 * Saves the listing to the shop's Facebook catalog. Safe to repeat; `?update=1` sends
 * the latest edits to the same items, and `?check=1` asks Meta again about a save it
 * hadn't finished checking.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/listings/[id]/catalog">) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const { id } = await ctx.params;
  const search = new URL(request.url).searchParams;
  if (search.get("check") === "1") {
    try {
      const saved = await checkCatalog(viewer.workspace, id);
      return saved ? ok({ state: "done", result: saved }) : notFound();
    } catch (err) {
      if (err instanceof StepError) return failWords(409, err.key, errorWords(err, await requestLocale()));
      throw err;
    }
  }
  const update = search.get("update") === "1";
  // the seller pressed "Save to catalog", which is the confirmation a catalog change needs
  const r = await ops.saveToFacebookCatalog.call(
    viewer.workspace,
    { listingId: id, update },
    { via: "ui", confirmed: true },
  );
  if (r.ok) return stepResponse(r.value.outcome);
  if (r.error === "not_found") return notFound();
  if (r.error === "not_ready") return fail(409, "not_ready", "notFinished");
  return fail(400, "invalid", "invalidRequest");
}
