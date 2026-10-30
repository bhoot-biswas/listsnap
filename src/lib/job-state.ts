/**
 * The job as the browser sees it: GET /api/jobs/:id, the Processing page and the
 * step runner all use this one shape. Built on the server from saved state only.
 */

export type StepStatus = "pending" | "running" | "done" | "failed";

export interface StepView {
  step: string;
  target: string;
  status: StepStatus;
  attempts: number;
  exhausted: boolean;
  error: string | null;
  /** Which error it is, so the page can offer the right way out (no Try again on a used-up limit). */
  errorKey: string | null;
  /** One line on what the AI decided, e.g. 'Looking for: "jamdani saree"'. */
  detail: string | null;
}

export interface ListingView {
  id: string;
  status: "processing" | "needs_review" | "ready" | "in_store" | "posted" | "failed";
  title: string | null;
  titleBn: string | null;
  confidence: number | null;
  stockQty: number | null;
  images: { id: string; url: string; kind: string }[];
}

export interface ItemView {
  id: string;
  url: string | null;
  /** The transparent cutout from SAM's mask; null for mock crops. */
  png: string | null;
  /** Where SAM found the item, in photo pixels. */
  box: { x: number; y: number; w: number; h: number };
  color: string | null;
  score: number | null;
}

export interface ApiCallView {
  id: number;
  at: string;
  model: string;
  step: string;
  mode: "mock" | "live";
  ms: number;
  costUsd: number;
  ok: boolean;
  summary: string | null;
}

/** A step call the runner should make next, already as a URL. */
export interface NextCallView {
  key: string;
  url: string;
}

export interface JobState {
  id: string;
  status: "processing" | "awaiting_choice" | "ready" | "failed";
  groupMode: string | null;
  createdAt: string;
  photos: { id: string; url: string; width: number; height: number }[];
  steps: StepView[];
  items: ItemView[];
  /** Only while waiting for the seller (Choose items). */
  suggestion: { mode: string; colors: string[]; reason: string } | null;
  listings: ListingView[];
  /** The photo check once segment is done: how much of the frame the items fill, and retake hint keys. */
  check: { fillPercent: number; hints: string[] } | null;
  scenes: string[];
  translate: boolean;
  next: NextCallView[];
  calls: ApiCallView[];
  costUsd: number;
}
