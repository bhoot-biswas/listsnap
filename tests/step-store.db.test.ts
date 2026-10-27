import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs against the local MariaDB (pnpm db:up && pnpm db:migrate); skipped when it isn't configured.
try {
  process.loadEnvFile(".env.local");
} catch {}
const enabled = !!process.env.DATABASE_URL;

describe.skipIf(!enabled)("job_steps lock SQL (MariaDB)", async () => {
  const { getPool, execute } = await import("@/server/db/pool");
  const { sqlStepStore } = await import("@/server/db/steps");
  const { runStep } = await import("@/server/pipeline/run-step");

  const ws = randomUUID();
  const job = randomUUID();
  const store = sqlStepStore(ws);

  beforeAll(async () => {
    await execute("INSERT INTO workspaces (id, name, settings_json) VALUES (?, 'test', '{}')", [ws]);
    await execute("INSERT INTO jobs (id, workspace_id) VALUES (?, ?)", [job, ws]);
  });
  afterAll(async () => {
    await execute("DELETE FROM workspaces WHERE id = ?", [ws]); // cascades to jobs and job_steps
    await getPool().end();
  });

  it("lets exactly one of ten concurrent claims win", async () => {
    const key = { jobId: job, step: "plan", target: "-" };
    await store.ensure(key);
    const wins = await Promise.all(Array.from({ length: 10 }, () => store.claim(key, 45_000, 3)));
    expect(wins.filter(Boolean)).toHaveLength(1);
    expect((await store.get(key))?.lockValid).toBe(true);
  });

  it("can reclaim once the lock has expired, by the database clock", async () => {
    const key = { jobId: job, step: "segment", target: "-" };
    await store.ensure(key);
    expect(await store.claim(key, 1, 3)).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect((await store.get(key))?.lockValid).toBe(false);
    expect(await store.claim(key, 45_000, 3)).toBe(true);
    expect((await store.get(key))?.attempts).toBe(2);
  });

  it("runs the work once across parallel runStep calls and saves the result", async () => {
    const key = { jobId: job, step: "write", target: randomUUID() };
    let calls = 0;
    const work = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 50));
      return { title: "Jamdani Saree" };
    };
    const outcomes = await Promise.all(Array.from({ length: 5 }, () => runStep(store, key, { lockMs: 45_000 }, work)));
    expect(calls).toBe(1);
    expect(outcomes.filter((o) => o.state === "done")).toHaveLength(1);
    expect(outcomes.filter((o) => o.state === "running")).toHaveLength(4);
    expect(await runStep(store, key, { lockMs: 45_000 }, work)).toEqual({
      state: "done",
      result: { title: "Jamdani Saree" },
      fresh: false,
    });
  });
});
