import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { callbackHmac, hasScopes, installUrl, verifyCallbackHmac, verifyWebhookHmac } from "./oauth";

const SECRET = "hush";

describe("callback hmac", () => {
  const signed = (entries: [string, string][]) => {
    const q = new URLSearchParams(entries);
    q.set("hmac", callbackHmac(q, SECRET));
    return q;
  };

  it("signs the sorted parameters without the hmac itself", () => {
    const q = new URLSearchParams({ shop: "a.myshopify.com", code: "c", timestamp: "1" });
    const expected = createHmac("sha256", SECRET).update("code=c&shop=a.myshopify.com&timestamp=1").digest("hex");
    expect(callbackHmac(q, SECRET)).toBe(expected);
  });

  it("accepts Shopify's signature in any parameter order", () => {
    const q = signed([
      ["timestamp", "1"],
      ["shop", "a.myshopify.com"],
      ["code", "c"],
    ]);
    const reordered = new URLSearchParams([
      ["hmac", q.get("hmac")!],
      ["code", "c"],
      ["shop", "a.myshopify.com"],
      ["timestamp", "1"],
    ]);
    expect(verifyCallbackHmac(reordered, SECRET)).toBe(true);
  });

  it("refuses a changed parameter, a missing hmac and an empty secret", () => {
    const q = signed([
      ["shop", "a.myshopify.com"],
      ["code", "c"],
    ]);
    q.set("shop", "b.myshopify.com");
    expect(verifyCallbackHmac(q, SECRET)).toBe(false);
    expect(verifyCallbackHmac(new URLSearchParams({ shop: "a.myshopify.com" }), SECRET)).toBe(false);
    expect(verifyCallbackHmac(signed([["shop", "a.myshopify.com"]]), "")).toBe(false);
  });
});

describe("webhook hmac", () => {
  const body = JSON.stringify({ shop_domain: "a.myshopify.com" });
  const header = createHmac("sha256", SECRET).update(body).digest("base64");

  it("checks the raw body", () => {
    expect(verifyWebhookHmac(body, header, SECRET)).toBe(true);
    expect(verifyWebhookHmac(`${body} `, header, SECRET)).toBe(false);
    expect(verifyWebhookHmac(body, null, SECRET)).toBe(false);
    expect(verifyWebhookHmac(body, header, "other")).toBe(false);
  });
});

describe("scopes", () => {
  it("counts write_* as covering read_*", () => {
    expect(hasScopes("write_products,write_locations,write_inventory")).toBe(true);
    expect(hasScopes("write_products, read_locations, write_inventory")).toBe(true);
    expect(hasScopes("write_products,read_locations")).toBe(false);
    expect(hasScopes("read_products,read_locations,write_inventory")).toBe(false);
  });

  it("asks for them all on the install link, on the shop's own domain only", () => {
    const url = new URL(
      installUrl({ shop: "a.myshopify.com", clientId: "id", redirectUri: "https://x/cb", state: "s" }),
    );
    expect(url.host).toBe("a.myshopify.com");
    expect(url.searchParams.get("scope")).toBe("write_products,read_locations,write_inventory");
    expect(() =>
      installUrl({ shop: "a.myshopify.com.evil.example", clientId: "id", redirectUri: "x", state: "s" }),
    ).toThrow();
  });
});
