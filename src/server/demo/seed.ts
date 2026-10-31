import "server-only";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { forWorkspace, type WorkspaceScope } from "@/server/db/scope";
import { recordDoneSteps } from "@/server/db/steps";
import { dimensions, photoCheck } from "@/server/image-ops";
import { normalisePhoto, saveMedia } from "@/server/media/store";
import type { GroupResult, RenderResult, SegmentResult } from "@/lib/schemas/pipeline";
import { DEMO_SAMPLES, SAMPLE_SOURCE_SIZE, type DemoSample } from "./samples";

const sampleFile = (name: string) =>
  readFile(path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "samples", name));

/**
 * Gives a new demo shop its three sample listings, so judges land on a dashboard
 * with something in it. Every file is copied into the workspace's own media, so the
 * samples behave like the shop's own listings and are deleted with it.
 */
export async function seedDemoWorkspace(workspaceId: string): Promise<void> {
  const ws = forWorkspace(workspaceId);
  for (const sample of DEMO_SAMPLES) await seedSample(ws, sample);
  await ws.countSampleListings(DEMO_SAMPLES.length);
}

async function seedSample(ws: WorkspaceScope, s: DemoSample): Promise<void> {
  const photo = await normalisePhoto(await sampleFile(`${s.key}.jpg`));
  const original = await saveMedia(ws.id, "original", photo.data, {
    mime: "image/jpeg",
    width: photo.width,
    height: photo.height,
  });
  const jobId = await ws.createJob([{ mediaId: original.id, width: photo.width, height: photo.height }]);
  const [photoRow] = await ws.photos(jobId);
  if (!photoRow) throw new Error("The sample job has no photo row.");

  const k = photo.width / SAMPLE_SOURCE_SIZE;
  const saved = [];
  for (const [i, b] of s.boxes.entries()) {
    const main = await sampleFile(`${s.key}-${i + 1}.jpg`);
    const size = await dimensions(main);
    const media = await saveMedia(ws.id, "main", main, { mime: "image/jpeg", ...size });
    const box = { x: Math.round(b.x * k), y: Math.round(b.y * k), w: Math.round(b.w * k), h: Math.round(b.h * k) };
    saved.push({ box, score: b.score, cutoutMediaId: media.id });
  }
  const itemIds = await ws.replaceItems(photoRow.id, saved);
  const check = await photoCheck(
    photo.data,
    saved.map((x) => x.box),
  );
  await ws.setPhotoCheck(photoRow.id, check);
  if (s.colors.length) await ws.setItemColors(itemIds.map((itemId, i) => ({ itemId, color: s.colors[i] ?? "" })));

  const [listingId] = await ws.createListings(jobId, [{ itemIds }]);
  if (!listingId) throw new Error("The sample listing wasn't created.");
  await ws.saveListingText(listingId, "en", s.en, {
    confidence: s.en.confidence,
    checkNotes: s.en.check_notes,
    status: s.status,
  });
  await ws.saveListingText(listingId, "bn", s.bn);

  const studio = await sampleFile(`${s.key}-studio.jpg`);
  const studioMedia = await saveMedia(ws.id, "studio", studio, {
    mime: "image/jpeg",
    ...(await dimensions(studio)),
    listingId,
    sort: 1,
  });

  const segment: SegmentResult = {
    phrase: s.plan.sam_phrase,
    tried: [s.plan.sam_phrase],
    instances: saved.map((x, i) => ({ itemId: itemIds[i]!, box: x.box, score: x.score, cutoutMediaId: x.cutoutMediaId })),
    check,
  };
  const group: GroupResult = { mode: s.mode, auto: s.mode === "single", colors: s.colors, reason: s.reason };
  const render: RenderResult = { scene: "studio", mediaId: studioMedia.id, aiLabel: "ai_background" };
  // about what each step takes on the live models
  await recordDoneSteps(ws.id, jobId, [
    { step: "plan", target: "-", result: s.plan, seconds: 8 },
    { step: "segment", target: "-", result: segment, seconds: 4 },
    { step: "group", target: "-", result: group, seconds: 0.5 },
    { step: "write", target: listingId, result: s.en, seconds: 8 },
    { step: "translate", target: listingId, result: s.bn, seconds: 4 },
    { step: "render", target: `${listingId}:studio`, result: render, seconds: 9 },
  ]);
  await ws.updateJob(jobId, { status: "ready", groupMode: s.mode, cameraAngle: s.plan.camera_angle });
}
