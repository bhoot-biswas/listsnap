import { resizeForUpload } from "./resize-image";

export type BulkUploadResult = { ok: true; batchId: string; failed: number } | { ok: false; status: number };

/**
 * Uploads a bulk batch: makes the batch, then sends each photo as its own job, shrunk
 * in the browser first. One request per photo keeps uploads small on mobile data and
 * lets the page show progress; a photo that fails is counted, not fatal.
 */
export async function uploadBatch(files: File[], onProgress: (done: number) => void): Promise<BulkUploadResult> {
  const res = await fetch("/api/batches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ total: files.length }),
  }).catch(() => null);
  if (!res?.ok) return { ok: false, status: res?.status ?? 0 };
  const { id } = (await res.json()) as { id: string };

  let failed = 0;
  for (const [i, file] of files.entries()) {
    try {
      const form = new FormData();
      form.append("batchId", id);
      form.append("photos", await resizeForUpload(file), file.name.replace(/\.\w+$/, ".jpg"));
      const up = await fetch("/api/jobs", { method: "POST", body: form });
      if (!up.ok) failed++;
    } catch {
      failed++;
    }
    onProgress(i + 1);
  }
  return { ok: true, batchId: id, failed };
}
