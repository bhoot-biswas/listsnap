import { apiViewer } from "@/server/auth/session";
import { ops } from "@/server/ops";
import { fail, notFound, stepResponse, unauthorized } from "@/server/http";
import { ReelLang } from "@/lib/schemas/reels";
import { requestLocale, text } from "@/server/step-text";

// Lives at `reel/[language]`: under `reels/` (with `[lang]` or `[language]`) Next 16.3.8's dev
// server answered 404 for every nested route under `[id]` on a cold start, steps included.
// The cause wasn't found; this path was checked to route.

/** Makes the reel of a listing in one language. Safe to repeat: a made reel is returned, not re-rendered. `?retry=1` makes a new one. */
export async function POST(request: Request, ctx: RouteContext<"/api/listings/[id]/reel/[language]">) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const { id, language: lang } = await ctx.params;
  if (!ReelLang.safeParse(lang).success) return fail(404, "unknown_language", "Unknown language.");
  const retry = new URL(request.url).searchParams.get("retry") === "1";
  const r = await ops.makeReel.call(viewer.workspace, { listingId: id, lang, retry }, { via: "ui" });
  if (r.ok) return stepResponse(r.value.outcome);
  if (r.error === "not_found") return notFound();
  if (r.error === "not_ready")
    return fail(409, "not_ready", text(await requestLocale(), "stepText.errors.notFinished"));
  return fail(400, "invalid", "Invalid request.");
}
