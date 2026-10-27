import { describe, expect, it } from "vitest";
import { toHtml } from "./live";
import { oauthQuery } from "./http";

describe("toHtml", () => {
  it("turns blank lines into paragraphs and keeps single line breaks", () => {
    expect(toHtml("First line\nsecond line\n\nNext <para> & more")).toBe(
      "<p>First line<br>\nsecond line</p>\n<p>Next &lt;para&gt; &amp; more</p>",
    );
  });
});

describe("oauthQuery", () => {
  const store = { url: "http://localhost:8080", key: "ck_test", secret: "cs_test" };

  it("signs every query parameter with HMAC-SHA256", () => {
    const q = new URLSearchParams(
      oauthQuery("GET", `${store.url}/wp-json/wc/v3/products`, { search: "red saree" }, store),
    );
    expect(q.get("search")).toBe("red saree");
    expect(q.get("oauth_consumer_key")).toBe("ck_test");
    expect(q.get("oauth_signature_method")).toBe("HMAC-SHA256");
    expect(q.get("oauth_signature")).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("uses a fresh nonce each time", () => {
    const a = new URLSearchParams(oauthQuery("GET", store.url, {}, store)).get("oauth_nonce");
    const b = new URLSearchParams(oauthQuery("GET", store.url, {}, store)).get("oauth_nonce");
    expect(a).not.toBe(b);
  });
});
