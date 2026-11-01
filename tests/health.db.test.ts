import { afterAll, describe, expect, it } from "vitest";
import { dbEnv } from "./db-helpers";

// GET /api/health as a visitor sees it through the proxy, and as the deploy script sees it on the server.
const enabled = dbEnv();

describe.skipIf(!enabled)("health route (MariaDB)", async () => {
  const { getPool } = await import("@/server/db/pool");
  const { env } = await import("@/server/env");
  const { GET } = await import("@/app/api/health/route");

  afterAll(async () => {
    await getPool().end();
  });

  it("tells a visitor only whether the deploy works", async () => {
    const res = await GET(new Request("http://test/api/health", { headers: { [env().ipHeader]: "203.0.113.7" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, database: "ok", media: "ok", config: "ok" });
  });

  it("shows the providers and secrets to a request made on the server itself", async () => {
    const body = await (await GET(new Request("http://test/api/health"))).json();
    expect(body).toMatchObject({ ok: true, database: "ok", media: "ok" });
    expect(Object.keys(body)).toEqual(expect.arrayContaining(["migration", "providers", "secrets"]));
  });
});
