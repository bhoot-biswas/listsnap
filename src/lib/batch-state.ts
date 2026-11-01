import type { JobState, ListingView, NextCallView } from "./job-state";

/** Photos per bulk upload. Muse Image allows 150 images a minute, and the daily listing limit is 20. */
export const MAX_BULK = 20;

/** One row of a bulk batch: a photo, its job, and the listing it made. */
export interface BatchRow {
  jobId: string;
  jobStatus: JobState["status"];
  photoUrl: string | null;
  /** The listing's main image once there is one. */
  thumbUrl: string | null;
  listing: {
    id: string;
    status: ListingView["status"];
    title: string | null;
    priceBdt: number | null;
    category: string | null;
    confidence: number | null;
  } | null;
  /** Several listings came from this photo (separate items); the row shows the first. */
  listingCount: number;
  /** A step ran out of attempts and waits for "Try again" on the job page. */
  stuck: boolean;
  next: NextCallView[];
}

/** Watching the video a batch comes from, before it has any rows. */
export interface WatchView {
  status: "pending" | "running" | "done" | "failed";
  /** The call to make next; null when it's done or out of attempts. */
  url: string | null;
  /** Out of attempts: waits for "Try again". */
  exhausted: boolean;
  error: string | null;
  found: number | null;
  limited: number;
}

export interface BatchState {
  id: string;
  total: number;
  createdAt: string;
  /** Null for a batch of photos. */
  watch: WatchView | null;
  rows: BatchRow[];
}
