const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type Loaded<T> = { state: T } | { error: "signed-out" | "offline" | "unreachable" };

/**
 * Loads a job's or a batch's state. Right after a phone's connection comes back the
 * first requests often still fail, so a failure is tried again a few times, a little
 * longer apart each time, before the page says it couldn't reach ListSnap.
 */
export async function loadState<T>(url: string, tries = 4): Promise<Loaded<T>> {
  for (let i = 0; ; i++) {
    const res = await fetch(url, { cache: "no-store" }).catch(() => null);
    if (res?.status === 401) return { error: "signed-out" };
    if (res?.ok) return { state: (await res.json()) as T };
    if (!navigator.onLine) return { error: "offline" };
    if (i >= tries - 1) return { error: "unreachable" };
    await sleep(1000 * (i + 1));
  }
}
