import { describe, expect, it } from "vitest";
import { listingHref } from "./listing-links";

describe("listingHref", () => {
  it("opens Review for listings that are written, and the job page otherwise", () => {
    expect(listingHref({ job_id: "j", id: "l", status: "in_store" })).toBe("/job/j/review?l=l");
    expect(listingHref({ job_id: "j", id: "l", status: "processing" })).toBe("/job/j");
    expect(listingHref({ job_id: "j", id: null, status: "failed" })).toBe("/job/j");
  });
});
