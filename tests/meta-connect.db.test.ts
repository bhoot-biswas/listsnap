import { afterAll, describe, expect, it } from "vitest";
import { createTestWorkspace, dbEnv } from "./db-helpers";

/** Facebook Login with the mock provider: what is saved, which Page is chosen, and which token posts. */
const enabled = dbEnv();

describe.skipIf(!enabled)("Connecting Facebook (MariaDB)", async () => {
  const { getPool } = await import("@/server/db/pool");
  const { forWorkspace } = await import("@/server/db/scope");
  const { encryptSecret } = await import("@/server/crypto");
  const { metaConnection } = await import("@/server/social/connection");
  const { authorizeUrl, finishLogin, readStateCookie, settingsFor, stateCookie } =
    await import("@/server/social/meta-connect");
  const { connectionsOverview } = await import("@/server/connections/overview");
  const { MetaSettings } = await import("@/lib/schemas/social");

  const a = await createTestWorkspace();
  const A = forWorkspace(a.workspace.id);

  afterAll(async () => {
    await a.remove();
    await getPool().end();
  });

  it("only accepts its own unexpired state", () => {
    const c = stateCookie(a.workspace.id);
    expect(readStateCookie(c.value)).toMatchObject({ state: c.state, workspaceId: a.workspace.id });
    const [body, mac] = c.value.split(".");
    const forged = Buffer.from(JSON.stringify({ state: c.state, workspaceId: "other", exp: Date.now() + 1e6 }));
    expect(readStateCookie(`${forged.toString("base64url")}.${mac}`)).toBeNull();
    expect(readStateCookie(`${body}.x${mac}`)).toBeNull();
    // with the mocks there is no Facebook; the link comes straight back to our callback
    expect(authorizeUrl(c.state)).toContain(`/api/meta/callback?code=mock-code&state=${c.state}`);
  });

  it("saves every Page and posts as the one with Instagram", async () => {
    expect(await finishLogin(a.workspace.id, "mock-code")).toBeNull();
    const conn = (await metaConnection(A))!;
    expect(conn.settings).toMatchObject({ pageName: "Rupkotha Fashion", igUsername: "@rupkotha.fashion", test: false });
    expect(conn.settings.pages.map((p) => p.name)).toEqual(["Rupkotha Fashion", "Rupkotha Outlet"]);
    expect(conn.account("facebook")).toMatchObject({ id: "100000000000001", token: "mock-page-token-1" });
    expect(conn.account("instagram")).toMatchObject({ id: "17800000000000001", token: "mock-page-token-1" });
    const meta = (await connectionsOverview(a.workspace)).services.find((s) => s.service === "meta");
    expect(meta?.status).toBe("connected");
    // tokens are never in the settings the pages read
    expect(JSON.stringify((await A.storeConnection("meta"))?.settings_json)).not.toContain("mock-page-token");
  });

  it("switches Page with that Page's own token, and keeps the choice on reconnect", async () => {
    const s = MetaSettings.parse((await A.storeConnection("meta"))?.settings_json);
    await A.setConnectionSettings("meta", settingsFor(s.pages[1]!, s.pages));
    let conn = (await metaConnection(A))!;
    expect(conn.account("facebook")).toMatchObject({ name: "Rupkotha Outlet", token: "mock-page-token-2" });
    expect(conn.account("instagram")).toBeNull();

    await finishLogin(a.workspace.id, "mock-code");
    conn = (await metaConnection(A))!;
    expect(conn.settings.pageName).toBe("Rupkotha Outlet");
  });

  it("still reads a test Page saved before Facebook Login existed", async () => {
    await A.saveConnection("meta", {
      baseUrl: null,
      credentialsEnc: encryptSecret("test-page-token"),
      checks: null,
      settings: { pageId: "1", pageName: "Test Page", igUserId: "2", igUsername: "@test", test: true },
    });
    const conn = (await metaConnection(A))!;
    expect(conn.settings.pages).toEqual([]);
    expect(conn.account("instagram")).toEqual({ id: "2", name: "@test", token: "test-page-token" });
  });
});
