import { describe, expect, it } from "vitest";
import { checkUserWrite } from "./profile-fields";

describe("checkUserWrite", () => {
  it("passes allowed values and trims the phone", () => {
    expect(checkUserWrite({ phone: " +880 1711-000000 ", theme: "dark", uiLang: "bn" })).toEqual({
      phone: "+880 1711-000000",
      theme: "dark",
      uiLang: "bn",
    });
  });

  it("refuses values the profile form would refuse", () => {
    expect(checkUserWrite({ theme: "<b>x</b>" })).toBeNull();
    expect(checkUserWrite({ phone: "call me maybe" })).toBeNull();
    expect(checkUserWrite({ uiLang: "fr" })).toBeNull();
  });

  it("leaves the name and Better Auth's own fields alone", () => {
    expect(checkUserWrite({ name: "x".repeat(200), emailVerified: true, phone: null })).toEqual({});
  });
});
