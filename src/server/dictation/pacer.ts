import "server-only";

/**
 * Feeds a phone's audio to Muse Voice Transcribe's realtime socket at the pace it wants.
 * The phone uploads in uneven bursts; the socket closes a session that runs more than
 * 5 s ahead ("backlog too large") or stays below real time for 10 s, and the spike found
 * that uneven sending made it repeat words. So the pacer keeps a short cushion and sends
 * evenly behind it, pads silence through a long gap, and catches up gently afterwards.
 *
 * Pure and clock-driven (the caller ticks it every TICK_MS), so it can be tested without
 * a socket.
 */

export const TICK_MS = 80;
/** 24 kHz, 16-bit mono: the engine's native PCM. */
export const BYTES_PER_MS = 48;

export interface PacerOptions {
  /** How far behind the phone we send, so upload jitter never reaches the model. */
  cushionMs: number;
  /** The most we ever send ahead of the even schedule, while catching up or on stop. */
  leadMs: number;
  /** Behind the schedule by this much with nothing to send: pad silence. */
  padAfterMs: number;
  /** How much faster than real time a backlog drains. */
  catchUp: number;
  /** No audio from the phone for this long: the session is lost. */
  quietMs: number;
  /** More than this waiting in our buffer: the phone is too far behind to be live. */
  maxBufferMs: number;
}

export const PACER_DEFAULTS: PacerOptions = {
  cushionMs: 800,
  leadMs: 2000,
  padAfterMs: 3000,
  catchUp: 1.25,
  quietMs: 5000,
  maxBufferMs: 8000,
};

export type TickResult =
  | { state: "sending"; frames: Buffer[] }
  /** Everything the phone sent has gone out: time for endStream. */
  | { state: "drained"; frames: Buffer[] }
  | { state: "lost"; reason: "quiet" | "backlog" };

/** A phone upload is about 250 ms, so the phone can be up to that far ahead of the clock. */
const BACKLOG_SLACK_MS = 300;

const evenBytes =(ms: number) => Math.max(0, Math.floor(ms * BYTES_PER_MS) & ~1);

export class Pacer {
  private readonly o: PacerOptions;
  private chunks: Buffer[] = [];
  private bufferedBytes = 0;
  private sentBytes = 0;
  /** Extra room ahead of the schedule, grown while a backlog drains. */
  private aheadMs = 0;
  /** When the phone's first audio arrived: the schedule's zero. */
  private origin: number | null = null;
  private lastPush = 0;
  private finished = false;
  private paddedMs = 0;

  constructor(options: Partial<PacerOptions> = {}) {
    this.o = { ...PACER_DEFAULTS, ...options };
  }

  push(pcm: Buffer, now: number): void {
    if (this.finished || !pcm.length) return;
    this.origin ??= now;
    this.lastPush = now;
    this.chunks.push(pcm);
    this.bufferedBytes += pcm.length;
  }

  /** The phone has stopped; what's left goes out at up to the lead. */
  finish(): void {
    this.finished = true;
  }

  get silencePaddedMs(): number {
    return this.paddedMs;
  }

  get sentMs(): number {
    return this.sentBytes / BYTES_PER_MS;
  }

  tick(now: number): TickResult {
    if (this.origin === null) return this.finished ? { state: "drained", frames: [] } : { state: "sending", frames: [] };
    const elapsed = now - this.origin;
    const bufferedMs = this.bufferedBytes / BYTES_PER_MS;
    if (bufferedMs > this.o.maxBufferMs) return { state: "lost", reason: "backlog" };
    if (!this.finished && now - this.lastPush > this.o.quietMs) return { state: "lost", reason: "quiet" };

    // the even schedule: real time, a cushion behind the phone (none once it has stopped)
    const schedule = Math.max(0, elapsed - (this.finished ? 0 : this.o.cushionMs));
    // more audio than time has passed: silence went in for a gap whose sound came later
    const backlog = this.sentMs + bufferedMs - elapsed - BACKLOG_SLACK_MS;
    this.aheadMs =
      backlog > 0
        ? Math.min(this.o.leadMs, this.aheadMs + TICK_MS * (this.o.catchUp - 1))
        : Math.max(0, this.aheadMs - TICK_MS * (this.o.catchUp - 1));
    if (this.finished) this.aheadMs = this.o.leadMs;

    const frames: Buffer[] = [];
    const room = evenBytes(schedule + this.aheadMs - this.sentMs);
    if (this.bufferedBytes && room) {
      const out = this.take(Math.min(room, this.bufferedBytes));
      frames.push(out);
      this.sentBytes += out.length;
    } else if (!this.bufferedBytes && !this.finished && schedule - this.sentMs > this.o.padAfterMs) {
      // a phone hiccup: keep the socket at real time with silence, a second behind
      const pad = evenBytes(schedule - this.sentMs - 1000);
      frames.push(Buffer.alloc(pad));
      this.sentBytes += pad;
      this.paddedMs += pad / BYTES_PER_MS;
    }
    if (this.finished && !this.bufferedBytes) return { state: "drained", frames };
    return { state: "sending", frames };
  }

  private take(n: number): Buffer {
    const out = Buffer.alloc(n);
    let off = 0;
    while (off < n && this.chunks.length) {
      const c = this.chunks[0];
      const k = Math.min(c.length, n - off);
      c.copy(out, off, 0, k);
      off += k;
      if (k === c.length) this.chunks.shift();
      else this.chunks[0] = c.subarray(k);
    }
    this.bufferedBytes -= off;
    return out;
  }
}
