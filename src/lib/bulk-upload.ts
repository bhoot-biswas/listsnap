import { resizeForUpload } from "./resize-image";

export type BulkUploadResult =
  { ok: true; batchId: string; failed: number; limited: number } | { ok: false; status: number; code?: string };

/**
 * Uploads a bulk batch: makes the batch, then sends each photo as its own job, shrunk
 * in the browser first. One request per photo keeps uploads small on mobile data and
 * lets the page show progress; a photo that fails is counted, not fatal. Photos past
 * today's limit are counted apart, so the page can say why they were left out.
 */
export async function uploadBatch(files: File[], onProgress: (done: number) => void): Promise<BulkUploadResult> {
  const res = await fetch("/api/batches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ total: files.length }),
  }).catch(() => null);
  if (!res?.ok) {
    const body = (await res?.json().catch(() => null)) as { error?: { code?: string } } | null;
    return { ok: false, status: res?.status ?? 0, code: body?.error?.code };
  }
  const { id } = (await res.json()) as { id: string };

  let failed = 0;
  let limited = 0;
  for (const [i, file] of files.entries()) {
    // once today's limit is hit, the rest would only be refused too
    if (limited) {
      limited++;
      onProgress(i + 1);
      continue;
    }
    try {
      const form = new FormData();
      form.append("batchId", id);
      form.append("photos", await resizeForUpload(file), file.name.replace(/\.\w+$/, ".jpg"));
      const up = await fetch("/api/jobs", { method: "POST", body: form });
      if (up.status === 429) limited++;
      else if (!up.ok) failed++;
    } catch {
      failed++;
    }
    onProgress(i + 1);
  }
  return { ok: true, batchId: id, failed, limited };
}
