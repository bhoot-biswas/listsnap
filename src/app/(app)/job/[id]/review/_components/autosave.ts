export type SaveState = "saved" | "saving" | "error" | "offline" | "invalid";

/**
 * Autosave for Review. Saves run one after another and always send the latest whole
 * value, so a slow request can't overwrite a newer edit. A failed save is retried
 * while online and again when the connection comes back; a value the server rejects
 * as invalid isn't retried, since sending it again would fail the same way.
 */
export class Autosaver<T> {
  private latest: T;
  private dirty = false;
  private inFlight = false;
  private queue: Promise<boolean> = Promise.resolve(true);
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    initial: T,
    private readonly save: (value: T) => Promise<true | "invalid" | false>,
    private readonly onState: (state: SaveState) => void,
    private readonly delayMs = 800,
    private readonly retryMs = 3000,
  ) {
    this.latest = initial;
  }

  change(value: T): void {
    this.latest = value;
    this.dirty = true;
    this.onState("saving");
    this.schedule(this.delayMs);
  }

  /** Saves now if anything is pending; resolves true once everything is saved. */
  flush = (): Promise<boolean> => {
    this.clearTimer();
    this.queue = this.queue.then(() => this.persist());
    return this.queue;
  };

  /** True while an edit hasn't reached the server yet. */
  get pending(): boolean {
    return this.dirty || this.inFlight;
  }

  private async persist(): Promise<boolean> {
    if (!this.dirty) return true;
    this.dirty = false;
    this.onState("saving");
    this.inFlight = true;
    const result = await this.save(this.latest).catch(() => false as const);
    this.inFlight = false;
    if (result === true) {
      this.onState(this.dirty ? "saving" : "saved");
      return true;
    }
    this.dirty = true;
    const online = typeof navigator === "undefined" || navigator.onLine !== false;
    this.onState(result === "invalid" ? "invalid" : online ? "error" : "offline");
    if (online && result === false) this.schedule(this.retryMs);
    return false;
  }

  private schedule(ms: number) {
    this.clearTimer();
    this.timer = setTimeout(() => void this.flush(), ms);
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
