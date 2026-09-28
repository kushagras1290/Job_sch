import { describe, expect, it } from "vitest";
import { canonicalUrl, dedupe, validateJob } from "../src/policy";
import type { Job } from "../src/types";

const job: Job = {
  id: "1", company: "Example", role: "AI Engineer", url: "https://example.com/jobs/1?utm_source=x", source: "test", discoveredAt: "2026-09-28T00:00:00Z", lastVerifiedAt: "2026-09-28T00:00:00Z",
  remoteScope: "India remote", indiaEvidence: "India permitted", hoursEvidence: "India hours", timeZone: "India compatible", requiredExperience: "3 years",
  matchedSkills: ["Python"], gaps: [], score: 80, scoreRationale: "evidence", status: "New", notes: ""
};

describe("job safeguards", () => {
  it("removes tracking parameters without losing job identifiers", () => {
    expect(canonicalUrl(job.url)).toBe("https://example.com/jobs/1");
    expect(canonicalUrl("https://example.com/jobs/1?id=42")).toContain("id=42");
  });
  it("holds unknown or incompatible hours", () => {
    expect(() => validateJob({ ...job, timeZone: "Unknown" })).toThrow(/Hold/);
    expect(() => validateJob({ ...job, timeZone: "Incompatible", status: "Hold" })).not.toThrow();
  });
  it("deduplicates canonical URLs and company-role pairs", () => {
    expect(dedupe([job], { ...job, id: "2", url: "https://example.com/jobs/1?utm_campaign=x" })).toBe(true);
    expect(dedupe([job], { ...job, id: "2", url: "https://other.example/jobs/9" })).toBe(true);
  });
});
