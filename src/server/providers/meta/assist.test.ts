import { describe, expect, it } from "vitest";
import { AssistRequest, assistActions } from "@/lib/schemas/assist";
import { assistPrompt } from "./assist";

const product = { title: "Jamdani Saree", category: "Sarees", attributes: [{ name: "Fabric", value: "Cotton" }] };

describe("AssistRequest", () => {
  const req = (r: object) => AssistRequest.safeParse({ field: "description", lang: "en", text: "Soft cotton.", ...r });

  it("translates only into Bangla, and only from English text", () => {
    expect(req({ action: "translate", lang: "bn", text: "", source: "Soft cotton." }).success).toBe(true);
    expect(req({ action: "translate", lang: "bn", text: "", source: " " }).success).toBe(false);
    expect(req({ action: "translate", source: "Soft cotton." }).success).toBe(false);
  });

  it("needs text to change, and keeps titles short", () => {
    expect(req({ action: "rewrite", text: "  " }).success).toBe(false);
    expect(req({ action: "longer", field: "title" }).success).toBe(false);
  });

  it("offers Translate on Bangla fields and More detail on descriptions only", () => {
    expect(assistActions("title", "en")).toEqual(["rewrite", "shorter"]);
    expect(assistActions("description", "bn")).toEqual(["rewrite", "shorter", "longer", "translate"]);
  });
});

describe("assistPrompt", () => {
  it("sends the facts and the current text, and writes Bangla from the English", () => {
    const en = assistPrompt({
      field: "title",
      action: "shorter",
      lang: "en",
      text: "Handwoven Dhakai Jamdani Saree",
      product,
      brandVoice: "Friendly",
    });
    expect(en.userText).toContain("at most 70 characters");
    expect(en.userText).toContain('"Fabric"');
    expect(en.userText).toContain("Current text:\nHandwoven Dhakai Jamdani Saree");

    const bn = assistPrompt({
      field: "description",
      action: "translate",
      lang: "bn",
      text: "",
      source: "Soft cotton.",
      product,
      brandVoice: "Friendly",
    });
    expect(bn.system).toContain("Bangla");
    expect(bn.userText).toContain("English version:\nSoft cotton.");
    expect(bn.userText).not.toContain("Current Bangla text");
  });
});
