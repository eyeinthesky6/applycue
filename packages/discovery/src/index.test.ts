import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { JobRecord, SourcePlanSearchProfile } from "@applycue/core";
import { describe, expect, it } from "vitest";
import {
  discoverJobsFromCompanyPage,
  discoverJobsFromCompanyPages,
  discoverJobsFromAtsDirectory,
  discoverJobsFromJobBoards,
  discoverJobSpyJobs,
  discoverJobsFromDirectory,
  discoverJobsFromFile,
  discoverJobsFromPath,
  discoverHimalayasJobs,
  discoverJobicyJobs,
  discoverRemotiveJobs,
  discoverRemoteOkJobs,
  discoverTheMuseJobs,
  discoverWorkingNomadsJobs,
  appendScanHistoryEntries,
  buildScanHistoryEntries,
  classifyJobLivenessFromText,
  createSourcePlan,
  createTextLivenessVerifier,
  detectScanHistoryReposts,
  filterJobsBySearchProfile,
  filterJobsByScanHistory,
  parseAtsDirectorySources,
  readScanHistoryEntries,
  resolveJobSpyPythonCommand,
  type FetchJson,
  type FetchText
} from "./index.js";

describe("discoverJobsFromFile", () => {
  it("loads JSONL jobs and normalizes them", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "applycue-jobs-"));
    const jobsPath = path.join(dir, "jobs.jsonl");
    await writeFile(
      jobsPath,
      `${JSON.stringify({
        company: "Example Fintech",
        title: "Head of AI Transformation",
        url: "https://example.com/job",
        description: "Lead AI transformation and fintech strategy.",
        location: "Remote India",
        workMode: "remote",
        liveState: "closed"
      })}\n`,
      "utf8"
    );

    const jobs = await discoverJobsFromFile(jobsPath);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.company).toBe("Example Fintech");
    expect(jobs[0]?.source.kind).toBe("manual");
    expect(jobs[0]?.id).toContain("example-fintech-head-of-ai-transformation");
    expect(jobs[0]?.liveState).toBe("closed");
  });

  it("loads Markdown job documents with front matter", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "applycue-jobs-md-"));
    const jobsPath = path.join(dir, "example-company-head-product.md");
    await writeFile(
      jobsPath,
      `---
company: Example Company
title: Head of Product
url: https://example.com/jobs/head-product
location: Remote India
workMode: remote
seniority: director
employmentType: full_time
companyStage: scaleup
liveState: live
---

Lead product strategy, AI workflows, and go-to-market execution.
`,
      "utf8"
    );

    const jobs = await discoverJobsFromFile(jobsPath);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.company).toBe("Example Company");
    expect(jobs[0]?.title).toBe("Head of Product");
    expect(jobs[0]?.workMode).toBe("remote");
    expect(jobs[0]?.seniority).toBe("director");
    expect(jobs[0]?.employmentType).toBe("full_time");
    expect(jobs[0]?.companyStage).toBe("scaleup");
    expect(jobs[0]?.liveState).toBe("live");
    expect(jobs[0]?.description).toContain("Lead product strategy");
  });

  it("loads a directory of supported job import files", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "applycue-jobs-dir-"));
    await writeFile(
      path.join(dir, "one.jsonl"),
      `${JSON.stringify({
        company: "JSONL Co",
        title: "Director AI Strategy",
        url: "https://example.com/jsonl",
        description: "Lead AI strategy.",
        workMode: "remote"
      })}\n`,
      "utf8"
    );
    await writeFile(
      path.join(dir, "two.txt"),
      `Company: Text Co
Title: VP Product Strategy
URL: https://example.com/text
Location: Delhi NCR
Work Mode: hybrid

Own product strategy and automation programs.
`,
      "utf8"
    );

    const jobs = await discoverJobsFromDirectory(dir);
    const jobsFromPath = await discoverJobsFromPath(dir);

    expect(jobs.map((job) => job.company).sort()).toEqual(["JSONL Co", "Text Co"]);
    expect(jobsFromPath).toHaveLength(2);
    expect(jobs.find((job) => job.company === "Text Co")?.workMode).toBe("hybrid");
  });
});

describe("createSourcePlan", () => {
  it("generates review-only source suggestions from profile preferences", () => {
    const plan = createSourcePlan(
      {
        id: "profile-1",
        pastEmployers: [],
        preferences: {
          targetRoleTerms: ["Head of Product"],
          adjacentRoleTerms: [],
          targetIndustries: ["fintech"],
          excludedIndustries: [],
          preferredLocations: ["Remote India"],
          extraLocations: ["Singapore"],
          askBeforeLocations: ["Dubai"],
          acceptableWorkModes: ["remote"],
          targetSeniorities: ["director", "vp"],
          acceptableSeniorities: ["director", "vp"],
          employmentTypes: ["full_time"],
          companyStages: [],
          preferredCompanyNames: ["Example Bank"],
          blockedCompanyNames: [],
          noGoRoleTerms: ["Intern"],
          requiredKeywords: ["roadmap"],
          niceToHaveKeywords: ["ai"],
          excludedKeywords: ["BPO"],
          workAuthorizationCountries: ["india"],
          preferredTimezones: []
        },
        searchSettings: {
          searchCountries: ["India"],
          searchAreas: ["Delhi NCR"],
          remoteRegions: ["APAC"],
          agentMayExpandSearchArea: true,
          informUserOnSearchAreaChange: true,
          standardHoursOnly: true,
          preferredShifts: ["standard"],
          askBeforeShifts: ["night"]
        },
        sourceSettings: {
          allowLoggedInBrowserAccess: false,
          defaultPortalApplyPolicy: "ask",
          trustedPortals: [],
          askBeforePortals: [],
          blockedPortals: [],
          fraudSignalTerms: [],
          jobBoardDefaults: {
            siteNames: ["indeed", "google", "naukri"],
            countryIndeed: "india"
          },
          searchTemplates: [
            {
              label: "Naukri search",
              kind: "job_board",
              queryTemplate: "\"{role}\" \"{location}\" site:naukri.com",
              priority: 0.82,
              requiresBrowser: true
            }
          ]
        },
        applySettings: {
          mode: "daily",
          applicationsPerDay: 10,
          minimumFitToApply: 0.75,
          allowedSourceKinds: ["ats", "job_board", "company_site", "manual"],
          messagePolicy: "draft_only",
          pauseReasons: [],
          trackEmailReplies: false,
          allowRecruiterDmDrafts: false
        },
        matchSettings: {
          range: "normal",
          widenIfFewerThan: 20,
          relaxOrder: ["source"],
          minimumFitFloor: 0.55,
          allowAdjacentTitles: true,
          allowAdjacentIndustries: true
        },
        proofBank: []
      },
      {
        approvedSources: [
          {
            id: "approved-manual",
            kind: "manual",
            label: "Manual job import fallback"
          }
        ]
      }
    );

    expect(plan.status).toBe("generated_for_review");
    expect(plan.suggestions.every((source) => source.origin === "system_generated")).toBe(true);
    expect(plan.searchProfile.titleFilter.positive).toEqual(["Head of Product"]);
    expect(plan.searchProfile.titleFilter.negative).toEqual(["Intern", "BPO"]);
    expect(plan.searchProfile.titleFilter.seniorityBoost).toEqual(["Director", "VP", "Vice President"]);
    expect(plan.searchProfile.locationFilter.allow).toEqual(
      expect.arrayContaining(["Delhi NCR", "India", "APAC", "Remote India", "Singapore"])
    );
    expect(plan.searchProfile.locationFilter.askBefore).toEqual(["Dubai"]);
    expect(plan.searchProfile.contentFilter.required).toEqual(["roadmap"]);
    expect(plan.searchProfile.contentFilter.positive).toEqual(["fintech", "ai"]);
    expect(plan.searchProfile.contentFilter.negative).toEqual(["BPO", "Intern"]);
    expect(plan.suggestions.some((source) => source.provider === "greenhouse")).toBe(true);
    expect(plan.suggestions.some((source) => source.provider === "workable")).toBe(true);
    expect(plan.suggestions.some((source) => source.provider === "smartrecruiters")).toBe(true);
    expect(plan.suggestions.some((source) => source.provider === "bamboohr")).toBe(true);
    expect(plan.suggestions.some((source) => source.provider === "breezy")).toBe(true);
    expect(plan.suggestions.some((source) => source.provider === "recruitee")).toBe(true);
    expect(plan.suggestions.some((source) => source.provider === "pinpoint")).toBe(true);
    expect(plan.suggestions.some((source) => source.provider === "workday")).toBe(true);
    expect(plan.suggestions.some((source) => source.provider === "personio")).toBe(true);
    expect(plan.suggestions.some((source) => source.provider === "rippling")).toBe(true);
    expect(plan.suggestions.some((source) => source.provider === "ats_directory")).toBe(true);
    expect(plan.suggestions.find((source) => source.provider === "ats_directory")?.options?.providers).toEqual([
      "greenhouse",
      "lever",
      "ashby"
    ]);
    expect(plan.suggestions.some((source) => source.provider === "greenhouse" && source.query?.includes("Head of Product fintech"))).toBe(true);
    expect(plan.suggestions.find((source) => source.provider === "greenhouse")?.requiresBrowser).toBe(true);
    expect(plan.suggestions.some((source) => source.provider === "jobspy")).toBe(true);
    expect(plan.suggestions.filter((source) => source.provider === "jobspy")).toHaveLength(10);
    expect(plan.suggestions.find((source) => source.provider === "jobspy")?.options?.siteNames).toEqual(["indeed", "google", "naukri"]);
    expect(plan.suggestions.find((source) => source.provider === "jobspy")?.options?.location).toBe("Delhi NCR");
    expect(plan.suggestions.some((source) => source.provider === "jobspy" && source.query === "Head of Product fintech")).toBe(true);
    expect(plan.suggestions.some((source) => source.provider === "jobspy" && source.query === "vice president product")).toBe(true);
    expect(plan.suggestions.some((source) => source.provider === "jobspy" && source.query === "director of product")).toBe(true);
    expect(plan.suggestions.some((source) => source.label === "Naukri search")).toBe(true);
    expect(plan.suggestions.some((source) => source.provider === "remotive")).toBe(true);
    expect(plan.suggestions.some((source) => source.provider === "remoteok")).toBe(true);
    expect(plan.suggestions.some((source) => source.provider === "workingnomads")).toBe(true);
    expect(plan.suggestions.some((source) => source.provider === "jobicy")).toBe(true);
    expect(plan.suggestions.some((source) => source.provider === "himalayas")).toBe(true);
    expect(plan.suggestions.some((source) => source.provider === "themuse")).toBe(true);
    expect(plan.suggestions.some((source) => source.company === "Example Bank")).toBe(true);
    const manual = plan.suggestions.find((source) => source.kind === "manual");
    expect(manual?.priority).toBeLessThan(0.5);
    expect(manual?.duplicateOf).toBe("approved-manual");
  });

  it("uses job-board query budget for distinct target roles before industry variants", () => {
    const plan = createSourcePlan({
      id: "profile-product-volume",
      pastEmployers: [],
      preferences: {
        targetRoleTerms: [
          "vp product",
          "head of product",
          "director product",
          "product strategy",
          "product management",
          "chief product officer"
        ],
        adjacentRoleTerms: ["business development", "gtm strategy"],
        targetIndustries: ["fintech", "payments"],
        excludedIndustries: [],
        preferredLocations: ["India"],
        extraLocations: [],
        askBeforeLocations: [],
        acceptableWorkModes: ["remote", "hybrid"],
        targetSeniorities: ["vp"],
        acceptableSeniorities: ["director", "vp", "c_level"],
        employmentTypes: ["full_time"],
        companyStages: [],
        preferredCompanyNames: [],
        blockedCompanyNames: [],
        noGoRoleTerms: [],
        requiredKeywords: [],
        niceToHaveKeywords: ["roadmap"],
        excludedKeywords: [],
        workAuthorizationCountries: ["india"],
        preferredTimezones: []
      },
      searchSettings: {
        searchCountries: ["India"],
        searchAreas: ["India"],
        remoteRegions: ["India"],
        agentMayExpandSearchArea: true,
        informUserOnSearchAreaChange: true,
        standardHoursOnly: true,
        preferredShifts: ["standard"],
        askBeforeShifts: []
      },
      sourceSettings: {
        allowLoggedInBrowserAccess: false,
        defaultPortalApplyPolicy: "ask",
        trustedPortals: [],
        askBeforePortals: [],
        blockedPortals: [],
        fraudSignalTerms: [],
        jobBoardDefaults: {
          siteNames: ["indeed", "google", "naukri"],
          countryIndeed: "india"
        }
      },
      applySettings: {
        mode: "review",
        applicationsPerDay: 5,
        minimumFitToApply: 0.72,
        allowedSourceKinds: ["ats", "job_board", "company_site", "manual"],
        messagePolicy: "draft_only",
        pauseReasons: [],
        trackEmailReplies: false,
        allowRecruiterDmDrafts: false
      },
      matchSettings: {
        range: "normal",
        widenIfFewerThan: 20,
        relaxOrder: ["source", "title", "industry", "location", "recency", "minimum_fit"],
        minimumFitFloor: 0.55,
        allowAdjacentTitles: true,
        allowAdjacentIndustries: true
      },
      proofBank: []
    });

    const jobSpyQueries = plan.suggestions
      .filter((source) => source.provider === "jobspy")
      .map((source) => source.query);

    expect(jobSpyQueries).toHaveLength(10);
    expect(jobSpyQueries).toEqual(
      expect.arrayContaining([
        "chief product officer",
        "vp product fintech",
        "vice president product",
        "vice president product fintech"
      ])
    );
    expect(jobSpyQueries).not.toContain("product management");
    expect(jobSpyQueries).not.toContain("product strategy");
    expect(jobSpyQueries).not.toContain("business development");
    expect(plan.searchProfile.titleFilter.positive).not.toContain("business development");
    expect(plan.searchProfile.titleFilter.negative).toContain("business development");
  });

  it("does not inject market-specific boards or locations unless the profile asks for them", () => {
    const plan = createSourcePlan({
      id: "profile-berlin",
      pastEmployers: [],
      preferences: {
        targetRoleTerms: ["Chief of Staff"],
        adjacentRoleTerms: ["Business Operations Lead"],
        targetIndustries: ["climate tech"],
        excludedIndustries: [],
        preferredLocations: ["Berlin"],
        extraLocations: ["Germany"],
        askBeforeLocations: [],
        acceptableWorkModes: ["hybrid"],
        targetSeniorities: ["lead"],
        acceptableSeniorities: ["lead", "manager"],
        employmentTypes: ["full_time"],
        companyStages: ["startup"],
        preferredCompanyNames: [],
        blockedCompanyNames: [],
        noGoRoleTerms: [],
        requiredKeywords: [],
        niceToHaveKeywords: ["operations"],
        excludedKeywords: [],
        workAuthorizationCountries: ["germany"],
        preferredTimezones: []
      },
      searchSettings: {
        searchCountries: ["Germany"],
        searchAreas: ["Berlin"],
        remoteRegions: [],
        agentMayExpandSearchArea: true,
        informUserOnSearchAreaChange: true,
        standardHoursOnly: true,
        preferredShifts: ["standard"],
        askBeforeShifts: []
      },
      sourceSettings: {
        allowLoggedInBrowserAccess: false,
        defaultPortalApplyPolicy: "ask",
        trustedPortals: [],
        askBeforePortals: [],
        blockedPortals: [],
        fraudSignalTerms: []
      },
      applySettings: {
        mode: "daily",
        applicationsPerDay: 5,
        minimumFitToApply: 0.75,
        allowedSourceKinds: ["ats", "job_board", "company_site", "manual"],
        messagePolicy: "draft_only",
        pauseReasons: [],
        trackEmailReplies: false,
        allowRecruiterDmDrafts: false
      },
      matchSettings: {
        range: "normal",
        widenIfFewerThan: 20,
        relaxOrder: ["source"],
        minimumFitFloor: 0.55,
        allowAdjacentTitles: true,
        allowAdjacentIndustries: true
      },
      proofBank: []
    });

    const serializedPlan = JSON.stringify(plan).toLowerCase();

    expect(plan.searchProfile.locationFilter.allow).toEqual(expect.arrayContaining(["Berlin", "Germany"]));
    expect(plan.suggestions.find((source) => source.provider === "jobspy")?.options?.siteNames).toEqual(["indeed", "google"]);
    expect(serializedPlan).not.toContain("naukri");
    expect(serializedPlan).not.toContain("india");
  });

  it("does not hardcode product title variants for non-product targets", () => {
    const plan = createSourcePlan({
      id: "profile-chief-of-staff",
      pastEmployers: [],
      preferences: {
        targetRoleTerms: ["chief of staff"],
        adjacentRoleTerms: [],
        targetIndustries: ["climate tech"],
        excludedIndustries: [],
        preferredLocations: ["Germany"],
        extraLocations: [],
        askBeforeLocations: [],
        acceptableWorkModes: ["hybrid"],
        targetSeniorities: ["vp"],
        acceptableSeniorities: ["director", "vp"],
        employmentTypes: ["full_time"],
        companyStages: ["startup"],
        preferredCompanyNames: [],
        blockedCompanyNames: [],
        noGoRoleTerms: [],
        requiredKeywords: [],
        niceToHaveKeywords: ["operations"],
        excludedKeywords: [],
        workAuthorizationCountries: ["germany"],
        preferredTimezones: []
      },
      searchSettings: {
        searchCountries: ["Germany"],
        searchAreas: ["Berlin"],
        remoteRegions: [],
        agentMayExpandSearchArea: true,
        informUserOnSearchAreaChange: true,
        standardHoursOnly: true,
        preferredShifts: ["standard"],
        askBeforeShifts: []
      },
      sourceSettings: {
        allowLoggedInBrowserAccess: false,
        defaultPortalApplyPolicy: "ask",
        trustedPortals: [],
        askBeforePortals: [],
        blockedPortals: [],
        fraudSignalTerms: []
      },
      applySettings: {
        mode: "review",
        applicationsPerDay: 5,
        minimumFitToApply: 0.75,
        allowedSourceKinds: ["ats", "job_board", "company_site", "manual"],
        messagePolicy: "draft_only",
        pauseReasons: [],
        trackEmailReplies: false,
        allowRecruiterDmDrafts: false
      },
      matchSettings: {
        range: "normal",
        widenIfFewerThan: 20,
        relaxOrder: ["source", "title", "industry", "location", "recency", "minimum_fit"],
        minimumFitFloor: 0.55,
        allowAdjacentTitles: true,
        allowAdjacentIndustries: true
      },
      proofBank: []
    });

    const jobSpyQueries = plan.suggestions
      .filter((source) => source.provider === "jobspy")
      .map((source) => source.query);

    expect(jobSpyQueries).toContain("vice president staff");
    expect(jobSpyQueries).not.toContain("vice president product");
    expect(JSON.stringify(plan).toLowerCase()).not.toContain("product management");
  });
});

describe("filterJobsBySearchProfile", () => {
  const searchProfile: SourcePlanSearchProfile = {
    titleFilter: {
      positive: ["head of product", "director product", "product management"],
      negative: ["intern", "software engineer"],
      seniorityBoost: ["Director", "VP"]
    },
    locationFilter: {
      alwaysAllow: ["India", "Remote"],
      allow: ["India", "Remote India"],
      askBefore: [],
      block: ["Campus"]
    },
    contentFilter: {
      required: [],
      positive: ["fintech", "product strategy"],
      negative: ["BPO"]
    },
    sourceHints: {
      preferredCompanies: [],
      blockedCompanies: [],
      trustedPortals: [],
      askBeforePortals: [],
      blockedPortals: [],
      fraudSignalTerms: []
    },
    notes: []
  };

  it("keeps strong job-board title matches and filters broad board noise", () => {
    const relevant = jobRecord({
      id: "relevant",
      title: "Senior Product Manager",
      description: "Lead product strategy for fintech customers.",
      location: "Remote India"
    });
    const noisy = jobRecord({
      id: "noisy",
      title: "Principal Engineer, Full Stack, VP",
      description: "Build Java and Kubernetes platforms.",
      location: "KA, IN"
    });

    const result = filterJobsBySearchProfile([relevant, noisy], searchProfile);

    expect(result.jobs.map((job) => job.id)).toEqual(["relevant"]);
    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0]?.reason).toBe("title");
    expect(result.summary.byReason.title).toBe(1);
  });

  it("keeps senior product title variants only when the role anchor matches", () => {
    const seniorProduct = jobRecord({
      id: "vp-product",
      title: "Vice President Product",
      description: "Lead product strategy for fintech customers.",
      location: "Remote India"
    });
    const seniorSales = jobRecord({
      id: "vp-sales",
      title: "Vice President Sales",
      description: "Lead enterprise sales for fintech customers.",
      location: "Remote India"
    });
    const profileWithVicePresident: SourcePlanSearchProfile = {
      ...searchProfile,
      titleFilter: {
        ...searchProfile.titleFilter,
        seniorityBoost: [...searchProfile.titleFilter.seniorityBoost, "Vice President"]
      }
    };

    const result = filterJobsBySearchProfile([seniorProduct, seniorSales], profileWithVicePresident);

    expect(result.jobs.map((job) => job.id)).toEqual(["vp-product"]);
    expect(result.filtered.map((item) => item.job.id)).toEqual(["vp-sales"]);
    expect(result.summary.byReason.title).toBe(1);
  });

  it("allows remote regions that can include an authorized region", () => {
    const remote = jobRecord({
      id: "remote-asia",
      title: "Product Director",
      description: "Lead product strategy.",
      location: "Americas, Europe, Asia, Oceania",
      workMode: "remote"
    });

    const result = filterJobsBySearchProfile([remote], searchProfile);

    expect(result.jobs).toHaveLength(1);
    expect(result.filtered).toHaveLength(0);
  });

  it("matches country aliases in provider region-code locations", () => {
    const indiaRole = jobRecord({
      id: "india-region-code",
      title: "Product Director",
      description: "Lead product strategy.",
      location: "MH, IN"
    });

    const result = filterJobsBySearchProfile([indiaRole], searchProfile);

    expect(result.jobs).toHaveLength(1);
    expect(result.filtered).toHaveLength(0);
  });

  it("does not filter manual jobs through generated source quality rules", () => {
    const manual = jobRecord({
      id: "manual",
      sourceKind: "manual",
      title: "Unusual Founder Office Role",
      description: "User pasted this for review.",
      location: "Moon Base"
    });

    const result = filterJobsBySearchProfile([manual], searchProfile);

    expect(result.jobs).toHaveLength(1);
    expect(result.filtered).toHaveLength(0);
  });

  it("filters broad ATS directory noise before ranking", () => {
    const relevant = jobRecord({
      id: "ats-relevant",
      sourceKind: "ats",
      title: "Director Product Management",
      description: "Lead product strategy.",
      location: "Remote India"
    });
    const noisy = jobRecord({
      id: "ats-noisy",
      sourceKind: "ats",
      title: "Backend Engineer",
      description: "Build APIs.",
      location: "Remote India"
    });

    const result = filterJobsBySearchProfile([relevant, noisy], searchProfile);

    expect(result.jobs.map((job) => job.id)).toEqual(["ats-relevant"]);
    expect(result.summary.byReason.title).toBe(1);
  });

  it("filters adjacent-lane titles when the generated title profile is target-only", () => {
    const targetOnlyProfile: SourcePlanSearchProfile = {
      ...searchProfile,
      titleFilter: {
        positive: ["vp product", "head of product", "director product"],
        negative: ["business development", "product marketing"],
        seniorityBoost: ["Director", "VP"]
      }
    };
    const product = jobRecord({
      id: "target-product",
      title: "Head of Product",
      description: "Lead product strategy.",
      location: "Remote India"
    });
    const businessDevelopment = jobRecord({
      id: "adjacent-bd",
      title: "Head of Business Development",
      description: "Lead partnerships with product teams.",
      location: "Remote India"
    });
    const productMarketing = jobRecord({
      id: "adjacent-product-marketing",
      title: "Director Product Marketing",
      description: "Lead launches and GTM.",
      location: "Remote India"
    });

    const result = filterJobsBySearchProfile([product, businessDevelopment, productMarketing], targetOnlyProfile);

    expect(result.jobs.map((job) => job.id)).toEqual(["target-product"]);
    expect(result.filtered.map((job) => job.job.id)).toEqual(["adjacent-bd", "adjacent-product-marketing"]);
    expect(result.summary.byReason.title).toBe(2);
  });
});

describe("job liveness", () => {
  it("lets closed text win over generic apply controls", () => {
    const result = classifyJobLivenessFromText({
      pageText: "Apply now for this role. This job is no longer accepting applications."
    });

    expect(result.liveState).toBe("closed");
    expect(result.code).toBe("closed_text");
  });

  it("treats anti-bot pages as unknown instead of closed", () => {
    const result = classifyJobLivenessFromText({
      status: 503,
      pageText: "Just a moment. Checking your browser before accessing this page. Ray ID 123"
    });

    expect(result.liveState).toBe("unknown");
    expect(result.code).toBe("bot_challenge");
  });

  it("marks a posting live when an apply control is visible", () => {
    const result = classifyJobLivenessFromText({
      pageText: "Head of Product. Lead product strategy for fintech teams.",
      applyControls: ["Apply now"]
    });

    expect(result.liveState).toBe("live");
    expect(result.code).toBe("apply_control");
  });

  it("creates an injectable verifier from fetched page text", async () => {
    const verifier = createTextLivenessVerifier(async (job) => {
      expect(job.id).toBe("closed-page");
      return {
        finalUrl: "https://example.com/jobs/closed",
        pageText: "This position has been filled. Back to all jobs."
      };
    });

    const result = await verifier(jobRecord({
      id: "closed-page",
      title: "Head of Product",
      description: "Lead product strategy."
    }));

    expect(typeof result).toBe("object");
    expect(result && typeof result === "object" ? result.liveState : result).toBe("closed");
  });
});

describe("scan history", () => {
  it("skips already prepared non-manual jobs in automation modes", () => {
    const prepared = jobRecord({
      id: "prepared",
      title: "Head of Product",
      description: "Lead product strategy.",
      location: "Remote India"
    });
    const manual = jobRecord({
      id: "manual-prepared",
      sourceKind: "manual",
      title: "Head of Product",
      description: "User pasted this for review.",
      location: "Remote India"
    });
    const entries = buildScanHistoryEntries(
      [prepared, manual],
      [
        {
          id: "app-prepared",
          jobId: prepared.id,
          status: "prepared",
          notes: [],
          createdAt: "2026-07-06T00:00:00.000Z",
          updatedAt: "2026-07-06T00:00:00.000Z"
        },
        {
          id: "app-manual",
          jobId: manual.id,
          status: "prepared",
          notes: [],
          createdAt: "2026-07-06T00:00:00.000Z",
          updatedAt: "2026-07-06T00:00:00.000Z"
        }
      ],
      "2026-07-06T00:00:00.000Z"
    );

    const daily = filterJobsByScanHistory([prepared, manual], entries, {
      mode: "daily",
      historyPath: "data/local/scan-history.jsonl"
    });
    const review = filterJobsByScanHistory([prepared, manual], entries, {
      mode: "review",
      historyPath: "data/local/scan-history.jsonl"
    });

    expect(daily.jobs.map((job) => job.id)).toEqual(["manual-prepared"]);
    expect(daily.skipped).toHaveLength(1);
    expect(daily.summary.skippedPrepared).toBe(1);
    expect(daily.summary.skippedClosed).toBe(0);
    expect(daily.summary.repostClusters).toBe(0);
    expect(review.jobs.map((job) => job.id)).toEqual(["prepared", "manual-prepared"]);
    expect(review.summary.skippedJobs).toBe(0);
  });

  it("writes and reads JSONL scan history entries", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "applycue-scan-history-"));
    const historyPath = path.join(dir, "scan-history.jsonl");
    const closed = jobRecord({
      id: "closed",
      title: "Head of Product",
      description: "This job is no longer accepting applications.",
      location: "Remote India"
    });
    closed.liveState = "closed";
    const prepared = jobRecord({
      id: "prepared",
      title: "Head of Product",
      description: "Lead product strategy.",
      location: "Remote India"
    });
    const entries = buildScanHistoryEntries(
      [closed, prepared],
      [
        {
          id: "app-prepared",
          jobId: prepared.id,
          status: "prepared",
          notes: [],
          createdAt: "2026-07-06T00:00:00.000Z",
          updatedAt: "2026-07-06T00:00:00.000Z"
        }
      ],
      "2026-07-06T00:00:00.000Z"
    );

    await appendScanHistoryEntries(historyPath, entries);
    await appendScanHistoryEntries(historyPath, []);

    const raw = await readFile(historyPath, "utf8");
    const readBack = await readScanHistoryEntries(historyPath);

    expect(raw.trim().split(/\r?\n/)).toHaveLength(2);
    expect(readBack.map((entry) => entry.status).sort()).toEqual(["closed", "prepared"]);
  });

  it("flags likely reposts by company and fuzzy role without treating same-url repeats as reposts", () => {
    const entries = buildScanHistoryEntries(
      [
        jobRecord({
          id: "growth-1",
          company: "Acme AI",
          title: "Senior Product Manager - Growth",
          description: "Lead product strategy.",
          location: "Remote India"
        }),
        jobRecord({
          id: "growth-2",
          company: "Acme AI",
          title: "Product Manager, Growth",
          description: "Lead growth product strategy.",
          location: "Remote India"
        }),
        jobRecord({
          id: "backend",
          company: "Acme AI",
          title: "Backend Engineer - Growth Platform",
          description: "Build services.",
          location: "Remote India"
        })
      ],
      [],
      "2026-07-06T00:00:00.000Z"
    );
    const firstEntry = entries[0];
    expect(firstEntry).toBeDefined();
    if (!firstEntry) throw new Error("Expected first scan-history entry");
    entries.push({
      ...firstEntry,
      firstSeenAt: "2026-07-07T00:00:00.000Z",
      lastSeenAt: "2026-07-07T00:00:00.000Z"
    });

    const clusters = detectScanHistoryReposts(entries, 90);
    const daily = filterJobsByScanHistory([], entries, { mode: "daily" });

    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.company).toBe("Acme AI");
    expect(clusters[0]?.appearances).toBe(2);
    expect(clusters[0]?.urls).toHaveLength(2);
    expect(daily.summary.repostClusters).toBe(1);
    expect(daily.summary.repostedJobs).toBe(2);
    expect(daily.summary.topReposts[0]?.role).toBe("Product Manager, Growth");
  });
});

describe("discoverJobsFromCompanyPage", () => {
  it("parses reverse ATS directory sources from approved search config", () => {
    const sources = parseAtsDirectorySources([
      {
        id: "reverse-ats",
        label: "Reverse ATS",
        provider: "ats_directory",
        kind: "ats",
        enabled: true,
        options: {
          providers: ["greenhouse"],
          limitPerProvider: 2
        }
      },
      {
        provider: "greenhouse",
        label: "Plain ATS query"
      }
    ]);

    expect(sources).toHaveLength(1);
    expect(sources[0]?.provider).toBe("ats_directory");
    expect(sources[0]?.options?.providers).toEqual(["greenhouse"]);
  });

  it("loads jobs through a reverse ATS directory scan", async () => {
    const requestedUrls: string[] = [];
    const fetchJson: FetchJson = async (url) => {
      requestedUrls.push(url);
      if (url === "https://raw.githubusercontent.com/Feashliaa/job-board-aggregator/main/data/greenhouse_companies.json") {
        return ["example", "bad/slug", "example-two"];
      }
      if (url === "https://boards-api.greenhouse.io/v1/boards/example/jobs?content=true") {
        return {
          jobs: [
            {
              title: "Head of Product",
              absolute_url: "https://job-boards.greenhouse.io/example/jobs/123",
              location: { name: "Remote India" },
              content: "<p>Lead product strategy.</p>"
            }
          ]
        };
      }
      if (url === "https://boards-api.greenhouse.io/v1/boards/example-two/jobs?content=true") {
        return {
          jobs: [
            {
              title: "Principal Engineer",
              absolute_url: "https://job-boards.greenhouse.io/example-two/jobs/456",
              location: { name: "Remote India" },
              content: "<p>Build backend systems.</p>"
            }
          ]
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const jobs = await discoverJobsFromAtsDirectory(
      {
        id: "reverse-ats",
        label: "Reverse ATS",
        provider: "ats_directory",
        options: {
          providers: ["greenhouse"],
          limitPerProvider: 2,
          sample: "prefix",
          batchSize: 1
        }
      },
      fetchJson
    );

    expect(requestedUrls).toEqual([
      "https://raw.githubusercontent.com/Feashliaa/job-board-aggregator/main/data/greenhouse_companies.json",
      "https://boards-api.greenhouse.io/v1/boards/example/jobs?content=true",
      "https://boards-api.greenhouse.io/v1/boards/example-two/jobs?content=true"
    ]);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]?.source.kind).toBe("ats");
    expect(jobs[0]?.company).toBe("Example");
    expect(jobs[0]?.title).toBe("Head of Product");
  });

  it("loads Greenhouse jobs from the public job board API", async () => {
    const fetchJson: FetchJson = async (url) => {
      expect(url).toBe("https://boards-api.greenhouse.io/v1/boards/example/jobs?content=true");
      return {
        jobs: [
          {
            title: "Director Product Strategy",
            absolute_url: "https://job-boards.greenhouse.io/example/jobs/123",
            location: { name: "Remote India" },
            content: "<p>Lead product strategy &amp; AI programs.</p>"
          }
        ]
      };
    };

    const jobs = await discoverJobsFromCompanyPage(
      {
        company: "Example",
        provider: "greenhouse",
        careersUrl: "https://job-boards.greenhouse.io/example"
      },
      fetchJson
    );

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.company).toBe("Example");
    expect(jobs[0]?.source.kind).toBe("ats");
    expect(jobs[0]?.description).toContain("Lead product strategy & AI programs");
  });

  it("loads Lever jobs from the public postings API", async () => {
    const fetchJson: FetchJson = async (url) => {
      expect(url).toBe("https://api.lever.co/v0/postings/example?mode=json");
      return [
        {
          text: "VP Product",
          hostedUrl: "https://jobs.lever.co/example/abc",
          descriptionPlain: "Own product strategy for automation.",
          categories: {
            location: "Hybrid Delhi",
            commitment: "Full-time"
          }
        }
      ];
    };

    const jobs = await discoverJobsFromCompanyPage(
      {
        company: "Example Lever",
        provider: "lever",
        careersUrl: "https://jobs.lever.co/example"
      },
      fetchJson
    );

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe("VP Product");
    expect(jobs[0]?.workMode).toBe("hybrid");
    expect(jobs[0]?.employmentType).toBe("full_time");
  });

  it("loads Ashby jobs from the public posting API", async () => {
    const fetchJson: FetchJson = async (url) => {
      expect(url).toBe("https://api.ashbyhq.com/posting-api/job-board/example?includeCompensation=true");
      return {
        jobs: [
          {
            title: "Head of AI Product",
            location: "India",
            secondaryLocations: [
              {
                location: "Remote APAC",
                address: {
                  postalAddress: {
                    addressLocality: "Delhi",
                    addressCountry: "India"
                  }
                }
              }
            ],
            isRemote: true,
            workplaceType: "Remote",
            descriptionPlain: "Lead AI product strategy.",
            employmentType: "FullTime",
            jobUrl: "https://jobs.ashbyhq.com/example/job",
            compensation: {
              summaryComponents: [
                {
                  compensationType: "Salary",
                  interval: "1 YEAR",
                  currencyCode: "USD",
                  minValue: 100000,
                  maxValue: 140000
                }
              ]
            }
          }
        ]
      };
    };

    const jobs = await discoverJobsFromCompanyPage(
      {
        company: "Example Ashby",
        provider: "ashby",
        careersUrl: "https://jobs.ashbyhq.com/example"
      },
      fetchJson
    );

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.workMode).toBe("remote");
    expect(jobs[0]?.location).toContain("Remote APAC");
    expect(jobs[0]?.compensation?.min).toBe(100000);
  });

  it("loads Workable jobs from the public markdown feed and detail page", async () => {
    const calls: string[] = [];
    const fetchText: FetchText = async (url) => {
      calls.push(url);
      if (url === "https://apply.workable.com/example/jobs.md") {
        return [
          "| Title | Department | Location | Type | Salary | Posted | Details |",
          "| VP Product | Product | Bengaluru, India | Full-time | | Today | [View](https://apply.workable.com/example/jobs/view/123.md) |"
        ].join("\n");
      }
      if (url === "https://apply.workable.com/example/jobs/view/123.md") {
        return "# VP Product\n\nLead product strategy for merchant automation.";
      }
      throw new Error(`unexpected URL: ${url}`);
    };

    const jobs = await discoverJobsFromCompanyPage(
      {
        company: "Example Workable",
        provider: "workable",
        careersUrl: "https://apply.workable.com/example"
      },
      undefined,
      fetchText
    );

    expect(calls).toEqual([
      "https://apply.workable.com/example/jobs.md",
      "https://apply.workable.com/example/jobs/view/123.md"
    ]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe("VP Product");
    expect(jobs[0]?.url).toBe("https://apply.workable.com/example/jobs/view/123");
    expect(jobs[0]?.description).toContain("Lead product strategy");
    expect(jobs[0]?.employmentType).toBe("full_time");
  });

  it("loads SmartRecruiters jobs from the public postings API and detail endpoint", async () => {
    const calls: string[] = [];
    const fetchJson: FetchJson = async (url) => {
      calls.push(url);
      if (url === "https://api.smartrecruiters.com/v1/companies/example/postings?limit=100&offset=0&status=PUBLIC") {
        return {
          content: [
            {
              id: "abc",
              name: "Director Product",
              ref: "https://api.smartrecruiters.com/v1/companies/example/postings/abc",
              location: {
                fullLocation: "Bengaluru, India",
                remote: false
              },
              typeOfEmployment: "Full-time"
            }
          ]
        };
      }
      if (url === "https://api.smartrecruiters.com/v1/companies/example/postings/abc") {
        return {
          jobAd: {
            sections: {
              jobDescription: { text: "<p>Lead product roadmap and AI automation.</p>" },
              qualifications: { text: "<p>Banking platform experience preferred.</p>" }
            }
          }
        };
      }
      throw new Error(`unexpected URL: ${url}`);
    };

    const jobs = await discoverJobsFromCompanyPage(
      {
        company: "Example SmartRecruiters",
        provider: "smartrecruiters",
        careersUrl: "https://jobs.smartrecruiters.com/example"
      },
      fetchJson
    );

    expect(calls).toEqual([
      "https://api.smartrecruiters.com/v1/companies/example/postings?limit=100&offset=0&status=PUBLIC",
      "https://api.smartrecruiters.com/v1/companies/example/postings/abc"
    ]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe("Director Product");
    expect(jobs[0]?.url).toBe("https://jobs.smartrecruiters.com/example/postings/abc");
    expect(jobs[0]?.location).toBe("Bengaluru, India");
    expect(jobs[0]?.description).toContain("Lead product roadmap");
  });

  it("loads BambooHR jobs from the public tenant careers list", async () => {
    const calls: string[] = [];
    const fetchJson: FetchJson = async (url, options) => {
      calls.push(url);
      expect(options?.redirect).toBe("error");
      expect(url).toBe("https://example.bamboohr.com/careers/list");
      return {
        result: [
          {
            id: 123,
            jobOpeningName: "VP Product",
            departmentLabel: "Product",
            employmentStatusLabel: "Full-time",
            isRemote: 1,
            location: {
              city: "Delhi",
              state: "NCR",
              country: "India"
            },
            jobOpeningBrief: "<p>Lead product strategy for workflow automation.</p>"
          },
          {
            id: "",
            jobOpeningName: "Skipped Role"
          }
        ]
      };
    };

    const jobs = await discoverJobsFromCompanyPage(
      {
        company: "Example BambooHR",
        provider: "bamboohr",
        careersUrl: "https://example.bamboohr.com/careers"
      },
      fetchJson
    );

    expect(calls).toEqual(["https://example.bamboohr.com/careers/list"]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe("VP Product");
    expect(jobs[0]?.url).toBe("https://example.bamboohr.com/careers/123");
    expect(jobs[0]?.location).toBe("Delhi, NCR, India, Remote");
    expect(jobs[0]?.workMode).toBe("remote");
    expect(jobs[0]?.employmentType).toBe("full_time");
    expect(jobs[0]?.description).toContain("Lead product strategy");
  });

  it("loads Breezy jobs from the public tenant JSON feed", async () => {
    const calls: string[] = [];
    const fetchJson: FetchJson = async (url, options) => {
      calls.push(url);
      expect(options?.redirect).toBe("error");
      expect(url).toBe("https://example.breezy.hr/json");
      return [
        {
          name: "Director Product",
          url: "https://example.breezy.hr/p/abc-director-product",
          location: {
            name: "Bengaluru, India",
            is_remote: true
          },
          description: "<p>Own product strategy for automation platforms.</p>"
        },
        {
          name: "Skipped External URL",
          url: "https://other.breezy.hr/p/not-this-tenant"
        }
      ];
    };

    const jobs = await discoverJobsFromCompanyPage(
      {
        company: "Example Breezy",
        provider: "breezy",
        careersUrl: "https://example.breezy.hr"
      },
      fetchJson
    );

    expect(calls).toEqual(["https://example.breezy.hr/json"]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe("Director Product");
    expect(jobs[0]?.url).toBe("https://example.breezy.hr/p/abc-director-product");
    expect(jobs[0]?.location).toBe("Bengaluru, India, Remote");
    expect(jobs[0]?.workMode).toBe("remote");
    expect(jobs[0]?.description).toContain("Own product strategy");
  });

  it("loads Recruitee jobs from the public tenant offers API", async () => {
    const calls: string[] = [];
    const fetchJson: FetchJson = async (url, options) => {
      calls.push(url);
      expect(options?.redirect).toBe("error");
      expect(url).toBe("https://example.recruitee.com/api/offers/");
      return {
        offers: [
          {
            title: "Head of Product",
            careers_url: "https://careers.example.com/o/head-of-product",
            city: "Delhi",
            country: "India",
            remote: true,
            employment_type: "Full-time",
            description: "<p>Lead platform product strategy and automation.</p>"
          },
          {
            title: "Skipped Insecure URL",
            careers_url: "http://careers.example.com/o/skipped"
          }
        ]
      };
    };

    const jobs = await discoverJobsFromCompanyPage(
      {
        company: "Example Recruitee",
        provider: "recruitee",
        careersUrl: "https://example.recruitee.com"
      },
      fetchJson
    );

    expect(calls).toEqual(["https://example.recruitee.com/api/offers/"]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe("Head of Product");
    expect(jobs[0]?.url).toBe("https://careers.example.com/o/head-of-product");
    expect(jobs[0]?.location).toBe("Delhi, India, Remote");
    expect(jobs[0]?.workMode).toBe("remote");
    expect(jobs[0]?.employmentType).toBe("full_time");
    expect(jobs[0]?.description).toContain("Lead platform product strategy");
  });

  it("loads Pinpoint jobs from the public tenant postings feed", async () => {
    const calls: string[] = [];
    const fetchJson: FetchJson = async (url, options) => {
      calls.push(url);
      expect(options?.redirect).toBe("error");
      expect(url).toBe("https://example.pinpointhq.com/postings.json");
      return {
        data: [
          {
            title: "Product Director",
            url: "https://example.pinpointhq.com/postings/abc-product-director",
            location: {
              name: "London, UK"
            },
            job: {
              department: "Product",
              division: "Platform",
              description: "<p>Lead product strategy for platform growth.</p>"
            },
            employment_type: "Full-time"
          },
          {
            title: "Skipped Missing URL"
          }
        ]
      };
    };

    const jobs = await discoverJobsFromCompanyPage(
      {
        company: "Example Pinpoint",
        provider: "pinpoint",
        careersUrl: "https://example.pinpointhq.com"
      },
      fetchJson
    );

    expect(calls).toEqual(["https://example.pinpointhq.com/postings.json"]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe("Product Director");
    expect(jobs[0]?.url).toBe("https://example.pinpointhq.com/postings/abc-product-director");
    expect(jobs[0]?.location).toBe("London, UK");
    expect(jobs[0]?.employmentType).toBe("full_time");
    expect(jobs[0]?.description).toContain("Lead product strategy");
  });

  it("loads Workday jobs from the public tenant CXS endpoint", async () => {
    const calls: string[] = [];
    const fetchJson: FetchJson = async (url, options) => {
      calls.push(url);
      expect(url).toBe("https://example.wd3.myworkdayjobs.com/wday/cxs/example/External/jobs");
      expect(options?.method).toBe("POST");
      expect(options?.redirect).toBe("error");
      expect(options?.headers?.accept).toBe("application/json");
      expect(options?.headers?.["content-type"]).toBe("application/json");
      expect(JSON.parse(options?.body ?? "{}")).toEqual({
        limit: 20,
        offset: 0,
        searchText: "",
        appliedFacets: {}
      });
      return {
        jobPostings: [
          {
            title: "Product Director",
            externalPath: "/job/London/Product-Director_R123",
            locationsText: "London, UK",
            postedOn: "Posted Today",
            timeType: "Full time"
          },
          {
            title: "Skipped Missing Path"
          }
        ]
      };
    };

    const jobs = await discoverJobsFromCompanyPage(
      {
        company: "Example Workday",
        provider: "workday",
        careersUrl: "https://example.wd3.myworkdayjobs.com/External"
      },
      fetchJson
    );

    expect(calls).toEqual(["https://example.wd3.myworkdayjobs.com/wday/cxs/example/External/jobs"]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe("Product Director");
    expect(jobs[0]?.url).toBe("https://example.wd3.myworkdayjobs.com/External/job/London/Product-Director_R123");
    expect(jobs[0]?.location).toBe("London, UK");
    expect(jobs[0]?.workMode).toBe("unknown");
    expect(jobs[0]?.employmentType).toBe("full_time");
    expect(jobs[0]?.description).toContain("Posted Today");
    expect(jobs[0]?.source.kind).toBe("ats");
  });

  it("loads Personio jobs from the public tenant XML feed", async () => {
    const calls: string[] = [];
    const fetchText: FetchText = async (url, options) => {
      calls.push(url);
      expect(url).toBe("https://example.jobs.personio.de/xml");
      expect(options?.redirect).toBe("error");
      expect(options?.headers?.accept).toContain("application/xml");
      return `<?xml version="1.0" encoding="UTF-8"?>
<workzag-jobs>
  <position>
    <id>123</id>
    <name><![CDATA[Head of Product]]></name>
    <office>Berlin</office>
    <additionalOffices>
      <office>Remote Germany</office>
    </additionalOffices>
    <employmentType>permanent</employmentType>
    <jobDescriptions>
      <jobDescription>
        <name>Responsibilities</name>
        <value><![CDATA[<p>Lead product strategy and automation programs.</p>]]></value>
      </jobDescription>
    </jobDescriptions>
  </position>
  <position>
    <id>unsafe/path</id>
    <name>Skipped Bad Id</name>
  </position>
</workzag-jobs>`;
    };

    const jobs = await discoverJobsFromCompanyPage(
      {
        company: "Example Personio",
        provider: "personio",
        careersUrl: "https://example.jobs.personio.de"
      },
      async () => {
        throw new Error("Personio should use fetchText");
      },
      fetchText
    );

    expect(calls).toEqual(["https://example.jobs.personio.de/xml"]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe("Head of Product");
    expect(jobs[0]?.url).toBe("https://example.jobs.personio.de/job/123");
    expect(jobs[0]?.location).toBe("Berlin, Remote Germany");
    expect(jobs[0]?.workMode).toBe("remote");
    expect(jobs[0]?.employmentType).toBe("full_time");
    expect(jobs[0]?.description).toContain("Lead product strategy");
    expect(jobs[0]?.source.kind).toBe("ats");
  });

  it("loads Rippling jobs from the public tenant board API", async () => {
    const calls: string[] = [];
    const fetchJson: FetchJson = async (url, options) => {
      calls.push(url);
      expect(url).toBe("https://api.rippling.com/platform/api/ats/v1/board/example-co/jobs");
      expect(options?.redirect).toBe("error");
      expect(options?.headers?.accept).toBe("application/json");
      return [
        {
          uuid: "abc",
          name: "Director Product",
          department: {
            label: "Product"
          },
          url: "https://ats.rippling.com/example-co/jobs/abc",
          workLocation: {
            label: "Remote (India)"
          }
        },
        {
          uuid: "unsafe",
          name: "Skipped External URL",
          url: "https://example.com/jobs/unsafe",
          workLocation: "Remote"
        }
      ];
    };

    const jobs = await discoverJobsFromCompanyPage(
      {
        company: "Example Rippling",
        provider: "rippling",
        careersUrl: "https://ats.rippling.com/example-co/jobs"
      },
      fetchJson
    );

    expect(calls).toEqual(["https://api.rippling.com/platform/api/ats/v1/board/example-co/jobs"]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe("Director Product");
    expect(jobs[0]?.url).toBe("https://ats.rippling.com/example-co/jobs/abc");
    expect(jobs[0]?.location).toBe("Remote (India)");
    expect(jobs[0]?.workMode).toBe("remote");
    expect(jobs[0]?.description).toContain("Product");
    expect(jobs[0]?.source.kind).toBe("ats");
  });

  it("ignores disabled sources and warns instead of failing the whole batch", async () => {
    const warnings: string[] = [];
    const jobs = await discoverJobsFromCompanyPages(
      [
        {
          company: "Disabled",
          provider: "greenhouse",
          careersUrl: "https://job-boards.greenhouse.io/disabled",
          enabled: false
        },
        {
          company: "Broken",
          provider: "greenhouse",
          enabled: true
        }
      ],
      {
        fetchJson: async () => {
          throw new Error("should not fetch disabled source");
        },
        onWarning: (message) => warnings.push(message)
      }
    );

    expect(jobs).toHaveLength(0);
    expect(warnings).toEqual(["Broken: missing Greenhouse board token or careersUrl"]);
  });
});

describe("discoverJobsFromJobBoards", () => {
  it("uses explicit or user-local JobSpy Python without requiring env-file edits", async () => {
    const previousPython = process.env.APPLYCUE_PYTHON;
    const previousHome = process.env.APPLYCUE_HOME;
    const explicitPython = path.join("C:", "Tools", "python.exe");
    try {
      process.env.APPLYCUE_PYTHON = explicitPython;
      expect(resolveJobSpyPythonCommand()).toBe(explicitPython);

      delete process.env.APPLYCUE_PYTHON;
      const home = await mkdtemp(path.join(os.tmpdir(), "applycue-home-"));
      process.env.APPLYCUE_HOME = home;
      const localPython = path.join(
        home,
        "tools",
        "jobspy-venv",
        process.platform === "win32" ? "Scripts" : "bin",
        process.platform === "win32" ? "python.exe" : "python"
      );
      await mkdir(path.dirname(localPython), { recursive: true });
      await writeFile(localPython, "", "utf8");

      expect(resolveJobSpyPythonCommand()).toBe(localPython);
    } finally {
      if (previousPython === undefined) delete process.env.APPLYCUE_PYTHON;
      else process.env.APPLYCUE_PYTHON = previousPython;
      if (previousHome === undefined) delete process.env.APPLYCUE_HOME;
      else process.env.APPLYCUE_HOME = previousHome;
    }
  });

  it("loads JobSpy rows through an injected runner and normalizes them", async () => {
    const seenRequests: unknown[] = [];
    const jobs = await discoverJobSpyJobs(
      {
        id: "jobspy-product-india",
        label: "JobSpy product India",
        provider: "jobspy",
        query: "vp product",
        enabled: true,
        options: {
          siteNames: ["indeed", "google", "naukri"],
          location: "India",
          resultsWanted: 25,
          hoursOld: 72,
          jobType: "fulltime",
          countryIndeed: "india",
          descriptionFormat: "markdown"
        }
      },
      async (request) => {
        seenRequests.push(request);
        return [
          {
            site: "indeed",
            id: "indeed-1",
            title: "VP Product",
            company: "Search Fintech",
            job_url: "https://example.com/indeed-job",
            job_url_direct: "https://example.com/apply",
            location: "Remote India",
            is_remote: true,
            job_type: "fulltime",
            interval: "yearly",
            min_amount: 120000,
            max_amount: 180000,
            currency: "USD",
            description: "Lead product strategy for fintech."
          }
        ];
      }
    );

    expect(seenRequests).toEqual([
      {
        site_name: ["indeed", "google", "naukri"],
        search_term: "vp product",
        location: "India",
        job_type: "fulltime",
        hours_old: 72,
        results_wanted: 25,
        country_indeed: "india",
        description_format: "markdown",
        verbose: 0
      }
    ]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.source.kind).toBe("job_board");
    expect(jobs[0]?.source.name).toContain("indeed");
    expect(jobs[0]?.url).toBe("https://example.com/apply");
    expect(jobs[0]?.workMode).toBe("remote");
    expect(jobs[0]?.employmentType).toBe("full_time");
    expect(jobs[0]?.compensation?.min).toBe(120000);
  });

  it("loads Remotive jobs through the public no-key API shape", async () => {
    const fetchJson: FetchJson = async (url) => {
      expect(url).toBe("https://remotive.com/api/remote-jobs?search=product&limit=1");
      return {
        jobs: [
          {
            id: 123,
            url: "https://remotive.com/remote-jobs/product/lead-product-123",
            title: "Lead Product Manager",
            company_name: "Remote Co",
            candidate_required_location: "Worldwide",
            job_type: "full_time",
            salary: "$120,000 - $150,000",
            description: "<p>Lead remote product work.</p>"
          }
        ]
      };
    };

    const jobs = await discoverRemotiveJobs(
      {
        id: "remotive-product",
        label: "Remotive product",
        provider: "remotive",
        query: "product",
        options: {
          limit: 1
        }
      },
      fetchJson
    );

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.company).toBe("Remote Co");
    expect(jobs[0]?.workMode).toBe("remote");
    expect(jobs[0]?.description).toContain("Lead remote product work.");
    expect(jobs[0]?.compensation?.currency).toBe("USD");
  });

  it("loads RemoteOK jobs through the public no-key API shape", async () => {
    const fetchJson: FetchJson = async (url) => {
      expect(url).toBe("https://remoteok.com/api");
      return [
        { last_updated: "2026-07-07" },
        {
          id: "remoteok-1",
          position: "Senior Product Manager",
          company: "RemoteOK Co",
          url: "https://remoteok.com/remote-jobs/remote-product-manager-1",
          location: "Worldwide",
          salary_min: 120000,
          salary_max: 160000,
          currency: "USD",
          description: "<p>Lead product strategy.</p>"
        }
      ];
    };

    const jobs = await discoverRemoteOkJobs(
      {
        id: "remoteok-product",
        label: "RemoteOK product",
        provider: "remoteok",
        options: {
          limit: 1
        }
      },
      fetchJson
    );

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.source.name).toContain("remoteok");
    expect(jobs[0]?.company).toBe("RemoteOK Co");
    expect(jobs[0]?.workMode).toBe("remote");
    expect(jobs[0]?.compensation?.max).toBe(160000);
  });

  it("loads Working Nomads jobs through the public no-key API shape", async () => {
    const fetchJson: FetchJson = async (url) => {
      expect(url).toBe("https://www.workingnomads.com/api/exposed_jobs/");
      return [
        {
          title: "Head of Product",
          company_name: "Nomad Product Co",
          url: "https://www.workingnomads.com/jobs/head-product",
          location: "Remote",
          description: "<p>Own product roadmap.</p>"
        }
      ];
    };

    const jobs = await discoverWorkingNomadsJobs(
      {
        id: "workingnomads-product",
        label: "Working Nomads product",
        provider: "workingnomads"
      },
      fetchJson
    );

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.company).toBe("Nomad Product Co");
    expect(jobs[0]?.description).toContain("Own product roadmap.");
  });

  it("loads Jobicy jobs through the public no-key API shape", async () => {
    const fetchJson: FetchJson = async (url) => {
      expect(url).toBe("https://jobicy.com/api/v2/remote-jobs?count=2");
      return {
        jobs: [
          {
            jobTitle: "Product Strategy Lead",
            companyName: "Jobicy Co",
            url: "https://jobicy.com/jobs/product-strategy-lead",
            jobGeo: "Anywhere",
            annualSalaryMin: 100000,
            annualSalaryMax: 140000,
            salaryCurrency: "USD",
            jobDescription: "<p>Lead product strategy.</p>"
          }
        ]
      };
    };

    const jobs = await discoverJobicyJobs(
      {
        id: "jobicy-product",
        label: "Jobicy product",
        provider: "jobicy",
        options: {
          limit: 2
        }
      },
      fetchJson
    );

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.company).toBe("Jobicy Co");
    expect(jobs[0]?.location).toBe("Anywhere");
    expect(jobs[0]?.compensation?.min).toBe(100000);
  });

  it("loads Himalayas jobs through the public no-key API shape", async () => {
    const fetchJson: FetchJson = async (url) => {
      expect(url).toBe("https://himalayas.app/jobs/api?limit=3");
      return {
        jobs: [
          {
            title: "VP Product",
            companyName: "Himalayas Co",
            applicationLink: "https://himalayas.app/companies/himalayas-co/jobs/vp-product",
            locationRestrictions: ["Worldwide"],
            description: "<p>Lead product portfolio.</p>"
          }
        ]
      };
    };

    const jobs = await discoverHimalayasJobs(
      {
        id: "himalayas-product",
        label: "Himalayas product",
        provider: "himalayas",
        options: {
          limit: 3
        }
      },
      fetchJson
    );

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.company).toBe("Himalayas Co");
    expect(jobs[0]?.location).toBe("Worldwide");
    expect(jobs[0]?.description).toContain("Lead product portfolio.");
  });

  it("loads The Muse jobs through the public no-key API shape", async () => {
    const calls: string[] = [];
    const fetchJson: FetchJson = async (url, options) => {
      calls.push(url);
      expect(options?.redirect).toBe("error");
      if (url === "https://www.themuse.com/api/public/jobs?page=0&keyword=product") {
        return {
          page_count: 2,
          results: [
            {
              name: "Director of Product",
              refs: {
                landing_page: "https://www.themuse.com/jobs/example/director-of-product"
              },
              company: {
                name: "Muse Product Co"
              },
              locations: [
                { name: "Remote" },
                { name: "New York, NY" }
              ],
              type: {
                name: "Full Time"
              },
              contents: "<p>Lead product strategy and platform growth.</p>"
            }
          ]
        };
      }
      expect(url).toBe("https://www.themuse.com/api/public/jobs?page=1&keyword=product");
      return {
        page_count: 2,
        results: [
          {
            name: "Skipped insecure URL",
            refs: {
              landing_page: "http://www.themuse.com/jobs/example/skipped"
            }
          }
        ]
      };
    };

    const jobs = await discoverTheMuseJobs(
      {
        id: "themuse-product",
        label: "The Muse product",
        provider: "themuse",
        query: "product",
        options: {
          limit: 2,
          pageLimit: 2
        }
      },
      fetchJson
    );

    expect(calls).toEqual([
      "https://www.themuse.com/api/public/jobs?page=0&keyword=product",
      "https://www.themuse.com/api/public/jobs?page=1&keyword=product"
    ]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.source.name).toContain("themuse");
    expect(jobs[0]?.company).toBe("Muse Product Co");
    expect(jobs[0]?.title).toBe("Director of Product");
    expect(jobs[0]?.url).toBe("https://www.themuse.com/jobs/example/director-of-product");
    expect(jobs[0]?.location).toBe("Remote, New York, NY");
    expect(jobs[0]?.workMode).toBe("remote");
    expect(jobs[0]?.employmentType).toBe("full_time");
    expect(jobs[0]?.description).toContain("Lead product strategy");
  });

  it("skips key-required sources unless credentials are user-owned", async () => {
    const warnings: string[] = [];
    const jobs = await discoverJobsFromJobBoards(
      [
        {
          id: "bad-shared-key",
          label: "Bad shared key",
          provider: "remotive",
          query: "product",
          credentialRequired: true,
          credentialRef: {
            owner: "applycue",
            kind: "env",
            ref: "SHARED_KEY"
          }
        }
      ],
      {
        fetchJson: async () => {
          throw new Error("should not fetch with non-user credential");
        },
        onWarning: (message) => warnings.push(message)
      }
    );

    expect(jobs).toHaveLength(0);
    expect(warnings[0]).toContain("provider credentials must be user-owned");
  });
});

function jobRecord(input: {
  company?: string;
  description: string;
  id: string;
  location?: string;
  sourceKind?: JobRecord["source"]["kind"];
  title: string;
  workMode?: JobRecord["workMode"];
}): JobRecord {
  return {
    id: input.id,
    source: {
      id: `${input.sourceKind ?? "job_board"}-source`,
      kind: input.sourceKind ?? "job_board",
      name: "Test source"
    },
    company: input.company ?? "Example",
    title: input.title,
    url: `https://example.com/${input.id}`,
    description: input.description,
    workMode: input.workMode ?? "hybrid",
    discoveredAt: "2026-07-06T00:00:00.000Z",
    liveState: "live",
    ...(input.location ? { location: input.location } : {})
  };
}
