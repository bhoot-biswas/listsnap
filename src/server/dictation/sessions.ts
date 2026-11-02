import "server-only";
import { randomBytes } from "node:crypto";
import type { LiveTranscription } from "@/server/providers/types";

/**
 * Live dictations in progress. In memory: the phone's audio uploads and the stream of
 * words must reach the process that holds the socket to Meta, and one VPS runs one
 * process. Running more than one would need sticky routing for /api/dictate.
 */

/** A minute each, so this is hours of talking; past it the box is still there to type in. */
export const DICTATIONS_PER_DAY = 100;

/** A seller with two tabs, at most; past that the recording goes up whole instead. */
export const PER_WORKSPACE = 2;
/** Well under Meta's 256 concurrent streams, and light on a 2-CPU box. */
export const TOTAL = 40;
/** The 60 s recording limit plus time for the last words. */
export const MAX_AGE_MS = 75_000;

export interface Dictation {
  id: string;
  workspaceId: string;
  /** The next audio upload's number, so a resent or reordered one is refused. */
  seq: number;
  live: LiveTranscription;
  timer: ReturnType<typeof setTimeout>;
}

const sessions = new Map<string, Dictation>();

export function hasRoom(workspaceId: string): boolean {
  if (sessions.size >= TOTAL) return false;
  let mine = 0;
  for (const d of sessions.values()) if (d.workspaceId === workspaceId) mine++;
  return mine < PER_WORKSPACE;
}

export const newDictationId = () => randomBytes(16).toString("base64url");

/** `onExpire` runs if the session outlives MAX_AGE_MS: a tab left recording, or a lost phone. */
export function addDictation(
  d: Omit<Dictation, "seq" | "timer">,
  onExpire: () => void,
): Dictation {
  const entry: Dictation = { ...d, seq: 0, timer: setTimeout(onExpire, MAX_AGE_MS) };
  sessions.set(d.id, entry);
  return entry;
}

/** Another shop's id reads as missing. */
export function findDictation(id: string, workspaceId: string): Dictation | null {
  const d = sessions.get(id);
  return d && d.workspaceId === workspaceId ? d : null;
}

export function removeDictation(id: string): void {
  const d = sessions.get(id);
  if (!d) return;
  clearTimeout(d.timer);
  sessions.delete(id);
}

/** For tests. */
export function resetDictations(): void {
  for (const d of sessions.values()) clearTimeout(d.timer);
  sessions.clear();
}
