import "server-only";
import { sqlStepStore } from "@/server/db/steps";
import { forWorkspace, type WorkspaceScope } from "@/server/db/scope";
import type { Workspace } from "@/server/db/workspaces";
import { GroupMode, Scene, writtenStatus } from "@/lib/schemas/pipeline";
import { runStep, type StepOutcome } from "./run-step";
import { groupStep, planStep, segmentStep } from "./job-steps";
import { listenStep } from "./listen-step";
import { lookStep, renderStep, translateStep, writeStep } from "./listing-steps";
import { reelStep } from "./reel-step";
import { postStep } from "./post-step";
import type { PostRequest } from "@/lib/schemas/social";
import type { Look } from "@/lib/schemas/looks";
import type { ReelLang, ReelTemplate } from "@/lib/schemas/reels";
import { isSettled, renderTarget, stepBefore, type JobStepName, type ListingStepName } from "./next-calls";

/**
 * The entry points Route Handlers call. Each finds the record inside the workspace
 * (another shop's id is "not found"), runs one step under the §3c rules, then settles
 * the job's status. Render steps make an image and may check it, so they hold their lock longer.
 */

const LOCK_MS = 45_000;
// a lifestyle scene is the image (up to 75 s), then its fidelity check: SAM (18 s) and Spark (40 s)
const RENDER_LOCK_MS = 150_000;
// a reel waits its turn behind another render on this server, then takes about a minute
const REEL_LOCK_MS = 360_000;
// Instagram processes a reel before it can be published; the provider waits for that
const POST_LOCK_MS = 180_000;

export type ExecuteResult = { found: false } | { found: true; outcome: StepOutcome<unknown> };

export async function executeJobStep(
  workspace: Workspace,
  jobId: string,
  step: JobStepName,
  force = false,
): Promise<ExecuteResult | { found: true; notReady: true }> {
  const ws = forWorkspace(workspace.id);
  const job = await ws.getJob(jobId);
  if (!job) return { found: false };
  // checked before the claim: a step called early would otherwise use up its attempts,
  // and group run before segment makes a listing with no items that can't be undone
  const before = stepBefore(step);
  if (before && !(await ws.stepResult(jobId, before))) return { found: true, notReady: true };
  // "Try again" on a job that gave up puts it back to work
  if (force && job.status === "failed") await ws.transitionJob(jobId, "failed", "processing");
  const ctx = { ws, jobId };
  const work = (): Promise<unknown> =>
    step === "plan"
      ? planStep(ctx)
      : step === "segment"
        ? segmentStep(ctx)
        : step === "listen"
          ? listenStep(ctx)
          : groupStep(ctx);
  const outcome = await runStep(sqlStepStore(ws.id), { jobId, step, target: "-" }, { lockMs: LOCK_MS, force }, work);
  await settleJob(ws, workspace, jobId);
  return { found: true, outcome };
}

export async function executeListingStep(
  workspace: Workspace,
  listingId: string,
  step: ListingStepName,
  opts: { scene?: string; force?: boolean } = {},
): Promise<ExecuteResult | { found: true; invalid: string }> {
  const ws = forWorkspace(workspace.id);
  const listing = await ws.getListing(listingId);
  if (!listing) return { found: false };
  const ctx = { ws, workspace, listing };
  const store = sqlStepStore(ws.id);
  let outcome: StepOutcome<unknown>;
  if (step === "render") {
    const scene = Scene.safeParse(opts.scene);
    if (!scene.success) return { found: true, invalid: "Unknown scene" };
    outcome = await runStep(
      store,
      { jobId: listing.job_id, step, target: renderTarget(listingId, scene.data) },
      { lockMs: RENDER_LOCK_MS, force: opts.force },
      () => renderStep(ctx, scene.data),
    );
  } else {
    const work = (): Promise<unknown> => (step === "write" ? writeStep(ctx) : translateStep(ctx));
    outcome = await runStep(
      store,
      { jobId: listing.job_id, step, target: listingId },
      { lockMs: LOCK_MS, force: opts.force },
      work,
    );
    if (step === "write" && outcome.state === "failed" && outcome.exhausted)
      await ws.setListingStatus(listingId, "failed");
  }
  await settleListing(ws, workspace, listingId);
  await settleJob(ws, workspace, listing.job_id);
  return { found: true, outcome };
}

const LOOKABLE = new Set(["needs_review", "ready", "in_store", "posted"]);

/**
 * A campaign look the seller asked for. Not part of the automatic pipeline, so the job's
 * status is left alone, but it runs under the same step rules: a second click, or a second
 * tab, gets the saved photo instead of paying for another.
 */
export async function executeLookStep(
  workspace: Workspace,
  listingId: string,
  look: Look,
  force = false,
): Promise<ExecuteResult | { found: true; invalid: string }> {
  const ws = forWorkspace(workspace.id);
  const listing = await ws.getListing(listingId);
  if (!listing) return { found: false };
  if (!LOOKABLE.has(listing.status)) return { found: true, invalid: "This listing isn't finished yet." };
  const outcome = await runStep(
    sqlStepStore(ws.id),
    { jobId: listing.job_id, step: "look", target: `${listingId}:${look}` },
    { lockMs: RENDER_LOCK_MS, force },
    () => lookStep({ ws, workspace, listing }, look),
  );
  return { found: true, outcome };
}

/**
 * A reel of a finished listing in one language, on request like a look. Under the step
 * rules, so pressing again while it renders waits for the same video.
 */
export async function executeReelStep(
  workspace: Workspace,
  listingId: string,
  lang: ReelLang,
  template: ReelTemplate,
  force = false,
): Promise<ExecuteResult | { found: true; invalid: string }> {
  const ws = forWorkspace(workspace.id);
  const listing = await ws.getListing(listingId);
  if (!listing) return { found: false };
  if (!LOOKABLE.has(listing.status)) return { found: true, invalid: "This listing isn't finished yet." };
  const outcome = await runStep(
    sqlStepStore(ws.id),
    { jobId: listing.job_id, step: "reel", target: `${listingId}:${template}:${lang}` },
    { lockMs: REEL_LOCK_MS, force, redo: force },
    () => reelStep({ ws, workspace, listing }, lang, template),
  );
  return { found: true, outcome };
}

/**
 * A reel posted to Facebook or Instagram. One step per listing, language and destination,
 * and no redo: a saved post is returned, so nothing is ever posted twice by accident.
 */
export async function executePostStep(
  workspace: Workspace,
  listingId: string,
  req: PostRequest,
): Promise<ExecuteResult | { found: true; invalid: string }> {
  const ws = forWorkspace(workspace.id);
  const listing = await ws.getListing(listingId);
  if (!listing) return { found: false };
  if (!LOOKABLE.has(listing.status)) return { found: true, invalid: "This listing isn't finished yet." };
  const outcome = await runStep(
    sqlStepStore(ws.id),
    { jobId: listing.job_id, step: "post", target: `${listingId}:${req.lang}:${req.destination}` },
    { lockMs: POST_LOCK_MS },
    () => postStep({ ws, workspace, listing }, req),
  );
  return { found: true, outcome };
}

/**
 * The seller's answer on Choose items (S6): which items to keep and how to group them.
 * Creates the listings and lets the pipeline continue. Only valid while the job waits.
 */
export async function applyChoice(
  workspace: Workspace,
  jobId: string,
  choice: { mode: GroupMode; keepItemIds: string[] },
): Promise<"ok" | "not_found" | "not_waiting" | "invalid"> {
  const ws = forWorkspace(workspace.id);
  const job = await ws.getJob(jobId);
  if (!job) return "not_found";
  if (job.status !== "awaiting_choice") return "not_waiting";
  const items = await ws.items(jobId);
  const kept = items.filter((i) => choice.keepItemIds.includes(i.id)).map((i) => i.id);
  if (!kept.length || !["separate", "set", "variants"].includes(choice.mode)) return "invalid";

  const groups = choice.mode === "separate" ? kept.map((id) => ({ itemIds: [id] })) : [{ itemIds: kept }];
  await ws.createListings(jobId, groups);
  await ws.updateJob(jobId, { groupMode: choice.mode });
  await ws.transitionJob(jobId, "awaiting_choice", "processing");
  return "ok";
}

/** Scenes made automatically: `separate` gets studio only per item (to keep image costs down). */
export function autoScenes(workspace: Workspace, groupMode: string | null): Scene[] {
  return groupMode === "separate" ? ["studio"] : workspace.settings.scenes;
}

/**
 * Moves a written listing out of Processing once its own Bangla and photos are done or out
 * of attempts, so it never shows Ready (or gets saved to the store) half made.
 */
async function settleListing(ws: WorkspaceScope, workspace: Workspace, listingId: string): Promise<void> {
  const listing = await ws.getListing(listingId);
  // no confidence yet means the English text isn't written
  if (!listing || listing.status !== "processing" || listing.confidence === null) return;
  const job = await ws.getJob(listing.job_id);
  if (!job) return;
  const input = {
    jobStatus: job.status,
    steps: await ws.steps(job.id),
    listingIds: [listingId],
    scenes: autoScenes(workspace, job.group_mode),
    translate: workspace.settings.listingLanguages.includes("bn"),
  };
  if (!isSettled(input)) return;
  await ws.settleListing(
    listingId,
    writtenStatus({ confidence: listing.confidence, check_notes: listing.check_notes ?? [] }),
  );
}

/** Marks the job ready or failed once nothing is left to run. */
async function settleJob(ws: WorkspaceScope, workspace: Workspace, jobId: string): Promise<void> {
  const job = await ws.getJob(jobId);
  if (!job || job.status !== "processing") return;
  const [steps, listings] = await Promise.all([ws.steps(jobId), ws.listings(jobId)]);
  const input = {
    jobStatus: job.status,
    steps,
    listingIds: listings.map((l) => l.id),
    scenes: autoScenes(workspace, job.group_mode),
    translate: workspace.settings.listingLanguages.includes("bn"),
  };
  if (!isSettled(input)) return;
  // a voice note that couldn't be heard leaves the listing written from the photo, not a failed job
  const jobStepFailed = steps.some((s) => s.target === "-" && s.step !== "listen" && s.status === "failed");
  await ws.transitionJob(jobId, "processing", jobStepFailed || !listings.length ? "failed" : "ready");
}
