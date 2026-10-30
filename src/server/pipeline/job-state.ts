import "server-only";
import { forWorkspace } from "@/server/db/scope";
import type { Workspace } from "@/server/db/workspaces";
import { mediaUrl } from "@/server/media/store";
import type { JobState, StepView } from "@/lib/job-state";
import type { GroupResult, PlanResult, SegmentResult } from "@/lib/schemas/pipeline";
import { autoScenes } from "./execute";
import { nextCalls, type NextCall } from "./next-calls";
import { MAX_ATTEMPTS } from "./run-step";
import { errorText, parseStoredError, text } from "@/server/step-text";
import type { Locale } from "@/i18n/request";

const callUrl = (jobId: string, c: NextCall): string => {
  if (c.kind === "job") return `/api/jobs/${jobId}/steps/${c.step}`;
  const base = `/api/listings/${c.listingId}/steps/${c.step}`;
  return c.scene ? `${base}?scene=${c.scene}` : base;
};

const callKey = (c: NextCall) =>
  c.kind === "job" ? c.step : `${c.step}:${c.listingId}${c.scene ? `:${c.scene}` : ""}`;

/** The one-line "what the AI decided" under each finished step, in the seller's language. */
function detail(step: string, result: unknown, locale: Locale): string | null {
  if (!result) return null;
  const t = (key: string, params?: Record<string, string | number>) => text(locale, `stepText.details.${key}`, params);
  if (step === "plan") return t("lookingFor", { phrase: (result as PlanResult).sam_phrase });
  if (step === "segment") {
    const r = result as SegmentResult;
    const found = { count: r.instances.length, phrase: r.phrase, fill: r.check.fillPercent };
    return r.tried.length > 1 ? t("foundRetried", { ...found, first: r.tried[0]! }) : t("found", found);
  }
  // the model writes this reason in English; it is shown as written
  if (step === "group") return (result as GroupResult).reason;
  if (step === "write" || step === "translate")
    return t("quoted", { title: (result as { title?: string }).title ?? "" });
  const scene = step === "render" ? (result as { scene?: string }).scene : undefined;
  return scene ? text(locale, `job.scenes.${scene}`) : null;
}

/** `locale` is the seller's UI language, for the step errors and details. */
export async function loadJobState(
  workspace: Workspace,
  jobId: string,
  locale: Locale = "en",
): Promise<JobState | null> {
  const ws = forWorkspace(workspace.id);
  const job = await ws.getJob(jobId);
  if (!job) return null;
  const [photos, steps, items, listings, calls] = await Promise.all([
    ws.photos(jobId),
    ws.steps(jobId),
    ws.items(jobId),
    ws.listings(jobId),
    ws.apiCalls(jobId),
  ]);
  const media = await ws.listingMedia(listings.map((l) => l.id));
  const scenes = autoScenes(workspace, job.group_mode);
  const translate = workspace.settings.listingLanguages.includes("bn");
  const next = nextCalls({ jobStatus: job.status, steps, listingIds: listings.map((l) => l.id), scenes, translate });
  const group = steps.find((s) => s.step === "group" && s.status === "done")?.result_json as GroupResult | undefined;
  const segment = steps.find((s) => s.step === "segment" && s.status === "done")?.result_json as
    SegmentResult | undefined;

  const stepViews: StepView[] = steps.map((s) => ({
    step: s.step,
    target: s.target,
    status: s.status,
    attempts: s.attempts,
    exhausted: s.status === "failed" && s.attempts >= MAX_ATTEMPTS,
    error: s.status === "failed" && s.last_error ? errorText(s.last_error, locale) : null,
    errorKey: s.status === "failed" && s.last_error ? (parseStoredError(s.last_error)?.key ?? null) : null,
    detail: s.status === "done" ? detail(s.step, s.result_json, locale) : null,
  }));

  return {
    id: job.id,
    status: job.status,
    groupMode: job.group_mode,
    createdAt: job.created_at.toISOString(),
    photos: photos.map((p) => ({ id: p.id, url: mediaUrl(p.media_id), width: p.width, height: p.height })),
    steps: stepViews,
    items: items.map((i) => ({
      id: i.id,
      url: i.cutout_media_id ? mediaUrl(i.cutout_media_id) : null,
      png: i.cutout_png_media_id ? mediaUrl(i.cutout_png_media_id) : null,
      box: i.box_json,
      color: i.color,
      score: i.score,
    })),
    suggestion:
      job.status === "awaiting_choice" && group && !group.auto
        ? { mode: group.mode, colors: group.colors, reason: group.reason }
        : null,
    listings: listings.map((l) => {
      const en = l.fields_json?.en as { title?: string } | undefined;
      const bn = l.fields_json?.bn as { title?: string } | undefined;
      const firstItem = items.find((i) => i.id === l.item_ids_json[0]);
      const images = [
        ...(firstItem?.cutout_media_id
          ? [{ id: firstItem.cutout_media_id, url: mediaUrl(firstItem.cutout_media_id), kind: "main" }]
          : []),
        ...media.filter((m) => m.listing_id === l.id).map((m) => ({ id: m.id, url: mediaUrl(m.id), kind: m.kind })),
      ];
      return {
        id: l.id,
        status: l.status,
        title: en?.title ?? null,
        titleBn: bn?.title ?? null,
        confidence: l.confidence,
        stockQty: l.stock_qty,
        images,
      };
    }),
    check: segment ? { fillPercent: segment.check.fillPercent, hints: segment.check.hints } : null,
    scenes,
    translate,
    next: next.map((c) => ({ key: callKey(c), url: callUrl(jobId, c) })),
    calls: calls.map((c) => ({
      id: c.id,
      at: c.created_at.toISOString(),
      model: c.model,
      step: c.step,
      mode: c.mode,
      ms: c.ms,
      costUsd: c.cost_usd,
      ok: !!c.ok,
      summary: c.summary,
    })),
    costUsd: calls.reduce((s, c) => s + c.cost_usd, 0),
  };
}
