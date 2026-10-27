import { describe, expect, it } from "vitest";
import { isPrivateAddress, isPublicHost } from "./public-host";

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
    ])
      expect(isPrivateAddress(ip), ip).toBe(true);
  });

  it("lets public addresses through", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});

describe("isPublicHost", () => {
  it("refuses local names without looking them up", async () => {
    expect(await isPublicHost("localhost")).toBe(false);
    expect(await isPublicHost("store.internal")).toBe(false);
    expect(await isPublicHost("[::1]")).toBe(false);
    expect(await isPublicHost("192.168.0.10")).toBe(false);
  });
});
