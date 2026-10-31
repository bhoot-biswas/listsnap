import "server-only";
import { forWorkspace } from "@/server/db/scope";
import type { Workspace } from "@/server/db/workspaces";
import type { BatchRow, BatchState } from "@/lib/batch-state";
import { ListingText } from "@/lib/schemas/pipeline";
import { suggestedPrice } from "@/lib/schemas/review";
import { buildJobState } from "./job-state";
import type { Locale } from "@/i18n/request";

/**
 * A batch as the bulk page sees it. Each row comes from the job's own saved state, so
 * the batch runner calls exactly what the single-job page would, and a refresh or a
 * second tab picks up where the batch stopped. The rows of every job are read together,
 * one query per table, since the page asks again every couple of seconds.
 */
export async function loadBatchState(
  workspace: Workspace,
  batchId: string,
  locale: Locale = "en",
): Promise<BatchState | null> {
  const ws = forWorkspace(workspace.id);
  const batch = await ws.getBatch(batchId);
  if (!batch) return null;
  const data = await ws.batchJobData(batchId);
  const media = await ws.listingMedia(data.listings.map((l) => l.id));
  const of = <T extends { job_id: string }>(rows: T[], id: string) => rows.filter((r) => r.job_id === id);
  const rows: BatchRow[] = [];
  for (const job of data.jobs) {
    const id = job.id;
    const listings = of(data.listings, id);
    const ids = new Set(listings.map((l) => l.id));
    const state = buildJobState(
      workspace,
      {
        job,
        photos: of(data.photos, id),
        steps: of(data.steps, id),
        items: of(data.items, id),
        listings,
        media: media.filter((m) => ids.has(m.listing_id)),
        calls: [],
      },
      locale,
    );
    const view = state.listings[0];
    const row = listings[0];
    const en = ListingText.safeParse(row?.fields_json?.en);
    rows.push({
      jobId: id,
      jobStatus: state.status,
      photoUrl: state.photos[0]?.url ?? null,
      thumbUrl: view?.images.find((i) => i.kind === "main")?.url ?? null,
      listing:
        view && row
          ? {
              id: view.id,
              status: view.status,
              title: view.title,
              priceBdt:
                row.price_bdt ??
                (en.success ? suggestedPrice(en.data.price_hint_bdt, workspace.settings.priceRounding) : null),
              category: en.success ? en.data.category : null,
              confidence: view.confidence,
            }
          : null,
      listingCount: state.listings.length,
      stuck: state.steps.some((s) => s.exhausted),
      next: state.next,
    });
  }
  return { id: batch.id, total: batch.total, createdAt: batch.created_at.toISOString(), rows };
}
