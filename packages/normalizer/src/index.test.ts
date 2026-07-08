import { describe, expect, it } from "vitest";
import { inferCompanyMarketGrade, inferRequiredExperienceYears, inferSeniorityFromTitle, normalizeJob } from "./index.js";

const source = {
  id: "test",
  kind: "manual" as const,
  name: "Test"
};

describe("normalizeJob seniority and experience inference", () => {
  it("infers seniority from clear product titles", () => {
    expect(inferSeniorityFromTitle("Senior Product Manager")).toBe("senior");
    expect(inferSeniorityFromTitle("Director of Product")).toBe("director");
    expect(inferSeniorityFromTitle("Product Owner - Technology -VP")).toBe("vp");
  });

  it("does not treat AVP as VP without more evidence", () => {
    expect(inferSeniorityFromTitle("AVP Product")).toBeUndefined();
    expect(inferSeniorityFromTitle("Assistant Vice President, Product")).toBeUndefined();
  });

  it("preserves explicit seniority over title inference", () => {
    const job = normalizeJob({
      source,
      company: "Example",
      title: "Senior Product Manager",
      url: "https://example.com/job",
      seniority: "director"
    });

    expect(job.seniority).toBe("director");
    expect(job.seniorityEvidence?.source).toBe("explicit");
  });

  it("extracts simple required experience ranges from JD text", () => {
    expect(inferRequiredExperienceYears("Requires 8+ years of product management experience.")).toEqual({ min: 8 });
    expect(inferRequiredExperienceYears("Open to 0-2 years of experience.")).toEqual({ min: 0, max: 2 });
    expect(inferRequiredExperienceYears("Minimum of 10 years in product leadership.")).toEqual({ min: 10 });
  });

  it("adds inferred fields to normalized jobs", () => {
    const job = normalizeJob({
      source,
      company: "Example",
      title: "Senior Product Manager",
      url: "https://example.com/job",
      description: "Requires 8+ years of product management experience."
    });

    expect(job.seniority).toBe("senior");
    expect(job.seniorityEvidence?.source).toBe("title");
    expect(job.requiredExperienceYears).toEqual({ min: 8 });
  });

  it("infers reusable global-enterprise company grade from known company markers", () => {
    expect(inferCompanyMarketGrade("Amazon.com", "https://www.amazon.jobs/jobs/1")).toBe("global_enterprise");
    expect(inferCompanyMarketGrade("Barclays", "https://search.jobs.barclays/job/1")).toBe("global_enterprise");
    expect(inferCompanyMarketGrade("Small Startup", "https://example.com/job")).toBeUndefined();
  });
});
