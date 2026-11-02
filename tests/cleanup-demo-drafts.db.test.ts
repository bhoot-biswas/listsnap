import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { createTestWorkspace, dbEnv } from "./db-helpers";

// The demo cleanup moves an expired demo shop's drafts to the demo store's trash. Drafts
// saved since multi-store are recorded only in listing_store_products. Dry run: nothing
// in the shared database is deleted.
const enabled = dbEnv();

describe.skipIf(!enabled)("demo cleanup finds a shop's drafts in the demo store (MariaDB)", async () => {
  const { execute, getPool } = await import("@/server/db/pool");
  const shop = await createTestWorkspace();
  afterAll(async () => {
    await shop.remove();
    await getPool().end();
  });

  it("counts drafts from the store-products table, not the old listings column", async () => {
    const id = shop.workspace.id;
    const jobId = randomUUID();
    const listingId = randomUUID();
    await execute("UPDATE workspaces SET is_demo = TRUE, expires_at = UTC_TIMESTAMP(3) - INTERVAL 3 DAY WHERE id = ?", [
      id,
    ]);
    await execute("INSERT INTO jobs (id, workspace_id) VALUES (?, ?)", [jobId, id]);
    await execute(
      "INSERT INTO listings (id, job_id, workspace_id, status, item_ids_json) VALUES (?, ?, ?, 'in_store', '[]')",
      [listingId, jobId, id],
    );
    // saved since multi-store: only the store-products table has it
    await execute(
      "INSERT INTO listing_store_products (listing_id, kind, workspace_id, product_ref) VALUES (?, 'woo', ?, '4242')",
      [listingId, id],
    );
    const { stdout } = await promisify(execFile)("node", ["scripts/cleanup-demo.mjs", "--dry-run"], {
      env: process.env,
    });
    expect(stdout).toContain(`would delete ${id} (1 store draft(s))`);
  });
});
