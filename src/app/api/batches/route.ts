import { z } from "zod";
import { apiViewer } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { fail, ok, unauthorized } from "@/server/http";
import { requestLocale, text } from "@/server/step-text";
import { limitReached } from "@/server/limits";
import { MAX_BULK } from "@/lib/batch-state";

const Body = z.object({ total: z.number().int().min(1).max(MAX_BULK) });

/** Starts a bulk upload. The photos follow one by one to POST /api/jobs with this batch's id. */
export async function POST(request: Request) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "bad_request", "chooseBulk", { max: MAX_BULK });
  const ws = forWorkspace(viewer.workspace.id);
  // each photo still takes its own slot; this only stops a batch that can't fit today
  const left = viewer.workspace.limits.listings - (await ws.usageToday()).listings;
  if (left <= 0) return limitReached();
  if (parsed.data.total > left)
    return ok(
      { error: { code: "over_limit", message: text(await requestLocale(), "apiErrors.canStartMore", { left }), left } },
      409,
    );
  const id = await ws.createBatch(parsed.data.total);
  return ok({ id }, 201);
}
