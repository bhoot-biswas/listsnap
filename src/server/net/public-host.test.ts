import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fetch } from "undici";
import { describe, expect, it } from "vitest";
import { isPrivateAddress, isPublicHost, publicOnlyAgent } from "./public-host";

describe("isPrivateAddress", () => {
  it("flags loopback, private, link-local and metadata addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.54",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "::ffff:10.0.0.1",
      // how URL writes https://[::ffff:127.0.0.1]
      "::ffff:7f00:1",
      "::ffff:a9fe:a9fe",
      "64:ff9b::a00:1",
      "fe80::1",
      "240.0.0.1",
    ])
      expect(isPrivateAddress(ip), ip).toBe(true);
  });

  it("lets public addresses through", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "2606:4700::1111", "::ffff:808:808"])
      expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("counts text that isn't an address as private", () => {
    for (const s of ["", "not-an-ip", "999.1.1.1"]) expect(isPrivateAddress(s), s).toBe(true);
  });
});

describe("isPublicHost", () => {
  it("refuses local names without looking them up", async () => {
    expect(await isPublicHost("localhost")).toBe(false);
    expect(await isPublicHost("store.internal")).toBe(false);
    expect(await isPublicHost("[::1]")).toBe(false);
    expect(await isPublicHost("192.168.0.10")).toBe(false);
    expect(await isPublicHost(new URL("https://[::ffff:127.0.0.1]").hostname)).toBe(false);
  });
});

describe("publicOnlyAgent", () => {
  it("won't connect to a name that resolves to a private address", async () => {
    const server = createServer((_, res) => res.end("ok")).listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const url = `http://localhost:${(server.address() as AddressInfo).port}/`;
    try {
      expect(await (await fetch(url)).text()).toBe("ok");
      const err = await fetch(url, { dispatcher: publicOnlyAgent() }).catch((e: Error) => e);
      expect(String((err as Error & { cause?: Error }).cause?.message)).toContain("private address");
    } finally {
      server.close();
    }
  });
});
