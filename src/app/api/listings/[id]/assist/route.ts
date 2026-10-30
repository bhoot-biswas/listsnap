import { apiViewer } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { brandVoice } from "@/server/db/workspaces";
import { fail, notFound, ok, unauthorized } from "@/server/http";
import { StepError } from "@/server/pipeline/run-step";
import { meta } from "@/server/providers";
import { AssistRequest } from "@/lib/schemas/assist";
import { ListingText } from "@/lib/schemas/pipeline";
import { errorWords, requestLocale } from "@/server/step-text";

/** About a cent a click, five per listing on a full day; the cap stops a runaway loop or abuse. */
const DAILY_ASSISTS = 100;

/**
 * Review's per-field AI help: returns new text for one field and saves nothing. The
 * page puts the text in the field, where autosave stores it and Undo can take it back.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/listings/[id]/assist">) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const parsed = AssistRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "bad_request", "There's no text to change here.");
  const { id } = await ctx.params;
  const ws = forWorkspace(viewer.workspace.id);
  const listing = await ws.getListing(id);
  const en = ListingText.safeParse(listing?.fields_json?.en);
  if (!listing || !en.success) return notFound();
  if ((await ws.assistsToday()) >= DAILY_ASSISTS)
    return fail(429, "limit_reached", "You've used today's AI help. It comes back at midnight; your text is saved.");

  try {
    const text = await meta().assist(
      { workspaceId: ws.id, jobId: listing.job_id, step: "assist" },
      {
        ...parsed.data,
        product: { title: en.data.title, category: en.data.category, attributes: en.data.attributes },
        voice: brandVoice(viewer.workspace.settings),
      },
    );
    return ok({ text });
  } catch (err) {
    if (err instanceof StepError) return fail(503, "busy", errorWords(err, await requestLocale()));
    console.error("[assist] unexpected error:", err);
    return fail(500, "error", "Something went wrong. Your text hasn't changed; try again.");
  }
}
