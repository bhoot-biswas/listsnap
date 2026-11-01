import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createTestWorkspace, dbEnv } from "./db-helpers";

/** The Usage page counts AI photos the way the daily meter and the Media library do. */
const enabled = dbEnv();

describe.skipIf(!enabled)("Usage days (MariaDB)", async () => {
  const { execute, getPool } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");

  const a = await createTestWorkspace();
  const A = forWorkspace(a.workspace.id);

  afterAll(async () => {
    await a.remove();
    await getPool().end();
  });

  const today = async () => (await A.usageDays()).at(-1)!.photos;
  const addMedia = (kind: string) =>
    execute(
      "INSERT INTO media (id, workspace_id, kind, path, mime, bytes, width, height) VALUES (?, ?, ?, ?, 'image/png', 1, 1, 1)",
      [randomUUID(), a.workspace.id, kind, `test/${randomUUID()}.png`],
    );

  it("counts scenes and campaign looks as AI photos, and cutouts not", async () => {
    const before = await today();
    await addMedia("studio");
    await addMedia("look_eid");
    await addMedia("cutout");
    expect(await today()).toBe(before + 2);
  });
});
