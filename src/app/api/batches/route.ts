import { z } from "zod";
import { apiViewer } from "@/server/auth/session";
import { forWorkspace } from "@/server/db/scope";
import { fail, ok, unauthorized } from "@/server/http";
import { MAX_BULK } from "@/lib/batch-state";

const Body = z.object({ total: z.number().int().min(1).max(MAX_BULK) });

/** Starts a bulk upload. The photos follow one by one to POST /api/jobs with this batch's id. */
export async function POST(request: Request) {
  const viewer = await apiViewer();
  if (!viewer) return unauthorized();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "bad_request", `Choose 1 to ${MAX_BULK} photos.`);
  const id = await forWorkspace(viewer.workspace.id).createBatch(parsed.data.total);
  return ok({ id }, 201);
}
