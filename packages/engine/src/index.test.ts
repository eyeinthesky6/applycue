import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { JobRecord, SourcePlan, UserProfile } from "@applycue/core";
import { describe, expect, it } from "vitest";
import {
  approveApplicationAnswers,
  approveSourceSuggestions,
  recordOutcomeEvent,
  runBatch,
  runLocalOrSampleBatch,
  runSampleBatch
} from "./index.js";

describe("runSampleBatch", () => {
  it("keeps the first-build run inside ApplyCue invariants", async () => {
    const result = await runSampleBatch({ writeFiles: false });

    expect(result.jobs).toHaveLength(5);
    expect(result.cvVariants.length).toBeGreaterThan(0);
    expect(result.cvDocxs).toHaveLength(result.cvVariants.length);
    expect(result.cvDocxs[0]?.docx.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(result.cvHtmls).toHaveLength(result.cvVariants.length);
    expect(result.browserPlans).toHaveLength(result.applications.length);
    expect(result.manifest.sourceCodeWriteCount).toBe(0);
    expect(result.manifest.cvQuality?.generatedCvs).toBe(result.cvVariants.length);
    expect(result.manifest.cvQuality?.minimumCvChars).toBeGreaterThan(0);
    expect(result.manifest.cvQuality?.minimumBullets).toBeGreaterThan(0);
    expect(result.progressItems.length).toBe(result.applications.length);
    expect(result.progressItems[0]?.cvDocxPath).toContain("outputs/cvs/");
    expect(result.progressItems[0]?.cvDocxPath).toContain(".docx");
    expect(result.progressItems[0]?.cvHtmlPath).toContain("outputs/cvs/");
    expect(result.progressItems[0]?.cvHtmlPath).toContain(".html");
    expect(result.progressItems[0]?.cvPath).toContain("outputs/cvs/");
    expect(result.browserPlans[0]?.cvPath).toContain(".docx");
    expect(result.progressItems[0]?.reconciliationPath).toContain("outputs/reconciliation/");
    expect(result.cvVariants.every((variant) => variant.formatMode === "standard_ats_v1")).toBe(true);
    expect(result.cvVariants.every((variant) => variant.reconciliationStatus === "passed")).toBe(true);
    expect(result.reconciliationReports.every((report) => report.status === "passed")).toBe(true);
    expect(result.manifest.generatedFiles.some((file) => file.path === "outputs/dashboard/latest.html")).toBe(true);
    expect(result.manifest.generatedFiles.some((file) => file.kind === "cv_docx")).toBe(true);
    expect(result.manifest.generatedFiles.some((file) => file.kind === "cv_html")).toBe(true);
    expect(result.manifest.generatedFiles.some((file) => file.kind === "browser_plan_json")).toBe(true);
    expect(result.manifest.generatedFiles.some((file) => file.kind === "source_plan_json")).toBe(true);
    expect(result.manifest.generatedFiles.some((file) => file.kind === "run_summary_markdown")).toBe(true);
    expect(result.manifest.generatedFiles.some((file) => file.path === "outputs/runs/latest-summary.md")).toBe(true);
    expect(result.sourcePlan.status).toBe("generated_for_review");
  });

  it("uses local config and local job files when present", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-"));
    await mkdir(path.join(workspaceRoot, "config"), { recursive: true });
    await mkdir(path.join(workspaceRoot, "data", "input"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, "config", "applycue.local.json"),
      JSON.stringify({
        profile: {
          name: "Local Candidate",
          email: "local@example.com",
          currentDesignation: "Head of AI Transformation",
          currentLocation: "Delhi NCR"
        },
        preferences: {
          targetRoleTerms: ["ai transformation"],
          targetIndustries: ["fintech"],
          acceptableWorkModes: ["remote"],
          employmentTypes: ["full_time"],
          niceToHaveKeywords: ["ai", "automation"]
        },
        applySettings: {
          mode: "daily",
          applicationsPerDay: 2,
          minimumFitToApply: 0.7
        },
        proofBank: [
          {
            id: "proof-ai",
            claim: "Led AI transformation work.",
            evidence: "Base CV includes AI transformation work.",
            tags: ["ai", "transformation", "automation"],
            kind: "work"
          },
          {
            id: "proof-fintech",
            claim: "Worked on fintech strategy.",
            evidence: "Base CV includes fintech strategy.",
            tags: ["fintech", "strategy"],
            kind: "work"
          }
        ],
        sources: {
          localJobsPath: "../data/input/jobs.jsonl"
        }
      }),
      "utf8"
    );
    await writeFile(
      path.join(workspaceRoot, "data", "input", "jobs.jsonl"),
      `${JSON.stringify({
        company: "Local Fintech",
        title: "Head of AI Transformation",
        url: "https://example.com/local-job",
        description: "Lead AI transformation and automation for fintech teams.",
        location: "Remote India",
        workMode: "remote",
        employmentType: "full_time"
      })}\n`,
      "utf8"
    );

    const result = await runLocalOrSampleBatch({
      workspaceRoot,
      applyCueHome: path.join(workspaceRoot, "empty-applycue-home"),
      writeFiles: false
    });

    expect(result.profile.name).toBe("Local Candidate");
    expect(result.jobs).toHaveLength(1);
    expect(result.manifest.id).toBe("local-first-build");
    expect(result.cvVariants).toHaveLength(1);
    expect(result.reconciliationReports[0]?.status).toBe("passed");
  });

  it("does not silently load repo job fixtures for an external user profile", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-no-fallback-workspace-"));
    const applyCueHome = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-no-fallback-home-"));
    const profileDir = path.join(applyCueHome, "profiles", "default");
    await mkdir(path.join(workspaceRoot, "data", "input"), { recursive: true });
    await mkdir(profileDir, { recursive: true });
    await writeFile(
      path.join(workspaceRoot, "data", "input", "jobs.jsonl"),
      `${JSON.stringify({
        company: "Fallback Fixture",
        title: "Head of Product",
        url: "https://example.com/fallback-fixture",
        description: "This repo fixture must not enter an external user run.",
        location: "Remote India",
        workMode: "remote",
        employmentType: "full_time"
      })}\n`,
      "utf8"
    );
    await writeFile(
      path.join(profileDir, "applycue.json"),
      JSON.stringify({
        profile: {
          name: "External Candidate",
          email: "external@example.com"
        },
        preferences: {
          targetRoleTerms: ["head of product"],
          preferredLocations: ["remote", "india"],
          acceptableWorkModes: ["remote"],
          employmentTypes: ["full_time"]
        },
        applySettings: {
          mode: "review",
          applicationsPerDay: 5,
          minimumFitToApply: 0.7
        }
      }),
      "utf8"
    );

    const result = await runLocalOrSampleBatch({
      workspaceRoot,
      applyCueHome,
      writeFiles: false
    });

    expect(result.jobs).toHaveLength(0);
    expect(result.manifest.notes).toContain("No manual local job file configured; using approved source connectors only.");
  });

  it("uses transient generated public job-board expansion when the configured batch is short", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-expansion-"));
    const applyCueHome = path.join(workspaceRoot, "applycue-home");
    const profileDir = path.join(applyCueHome, "profiles", "default");
    await mkdir(profileDir, { recursive: true });
    await writeFile(
      path.join(profileDir, "applycue.json"),
      JSON.stringify({
        profile: {
          name: "Expansion Candidate",
          email: "expansion@example.com",
          currentDesignation: "Head of Product",
          currentCountry: "India"
        },
        preferences: {
          targetRoleTerms: ["head of product"],
          targetIndustries: ["fintech"],
          preferredLocations: ["Remote India"],
          acceptableWorkModes: ["remote"],
          targetSeniorities: ["vp"],
          acceptableSeniorities: ["director", "vp"],
          employmentTypes: ["full_time"],
          niceToHaveKeywords: ["product strategy", "roadmap"]
        },
        applySettings: {
          mode: "review",
          applicationsPerDay: 1,
          minimumFitToApply: 0.5
        },
        matchSettings: {
          widenIfFewerThan: 20,
          relaxOrder: ["source", "recency"],
          minimumFitFloor: 0.5
        },
        proofBank: [
          {
            id: "proof-product",
            claim: "Led product strategy and roadmap for fintech products.",
            evidence: "Approved profile proof.",
            tags: ["head of product", "product strategy", "roadmap", "fintech"],
            kind: "work"
          }
        ],
        sources: {
          jobBoards: []
        }
      }),
      "utf8"
    );
    const requests: string[] = [];

    const result = await runLocalOrSampleBatch({
      workspaceRoot,
      applyCueHome,
      writeFiles: true,
      jobSpyRunner: async (request) => {
        requests.push(request.search_term ?? "");
        if (request.search_term !== "vice president product") return [];
        return [
          {
            site: "indeed",
            title: "Vice President Product",
            company: "Expansion Fintech",
            job_url: "https://careers.expansionfintech.test/jobs/vp-product",
            location: "Remote India",
            is_remote: true,
            job_type: "full_time",
            description: "Lead product strategy, roadmap, and fintech platform growth."
          }
        ];
      }
    });

    expect(requests).toContain("vice president product");
    expect(result.jobs.map((job) => job.company)).toContain("Expansion Fintech");
    expect(result.applications).toHaveLength(1);
    expect(result.manifest.notes.some((note) => note.includes("Transient source expansion ran"))).toBe(true);
  });

  it("widens approved public job-board sources transiently when their first pass is short", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-expansion-widen-"));
    const applyCueHome = path.join(workspaceRoot, "applycue-home");
    const profileDir = path.join(applyCueHome, "profiles", "default");
    await mkdir(profileDir, { recursive: true });
    await writeFile(
      path.join(profileDir, "applycue.json"),
      JSON.stringify({
        profile: {
          name: "Expansion Widen Candidate",
          email: "expansion-widen@example.com",
          currentDesignation: "Head of Product",
          currentCountry: "India"
        },
        preferences: {
          targetRoleTerms: ["head of product"],
          targetIndustries: ["fintech"],
          preferredLocations: ["Remote India"],
          acceptableWorkModes: ["remote"],
          targetSeniorities: ["vp"],
          acceptableSeniorities: ["director", "vp"],
          employmentTypes: ["full_time"],
          niceToHaveKeywords: ["product strategy", "roadmap"]
        },
        applySettings: {
          mode: "review",
          applicationsPerDay: 1,
          minimumFitToApply: 0.5
        },
        matchSettings: {
          widenIfFewerThan: 20,
          relaxOrder: ["source", "recency"],
          minimumFitFloor: 0.5
        },
        proofBank: [
          {
            id: "proof-product",
            claim: "Led product strategy and roadmap for fintech products.",
            evidence: "Approved profile proof.",
            tags: ["head of product", "product strategy", "roadmap", "fintech"],
            kind: "work"
          }
        ],
        sources: {
          jobBoards: [
            {
              id: "approved-vp-product",
              label: "Approved VP Product search",
              provider: "jobspy",
              query: "vice president product",
              options: {
                siteNames: ["indeed"],
                location: "India",
                resultsWanted: 5,
                hoursOld: 24
              }
            }
          ]
        }
      }),
      "utf8"
    );
    const requests: Array<{ hoursOld?: number; resultsWanted?: number; searchTerm?: string }> = [];

    const result = await runLocalOrSampleBatch({
      workspaceRoot,
      applyCueHome,
      writeFiles: true,
      jobSpyRunner: async (request) => {
        const recordedRequest: { hoursOld?: number; resultsWanted?: number; searchTerm?: string } = {};
        if (typeof request.hours_old === "number") recordedRequest.hoursOld = request.hours_old;
        if (typeof request.results_wanted === "number") recordedRequest.resultsWanted = request.results_wanted;
        if (request.search_term) recordedRequest.searchTerm = request.search_term;
        requests.push(recordedRequest);
        if (request.search_term !== "vice president product" || request.hours_old !== 336) return [];
        return [
          {
            site: "indeed",
            title: "Vice President Product",
            company: "Widened Expansion Fintech",
            job_url: "https://careers.widened-expansion.test/jobs/vp-product",
            location: "Remote India",
            is_remote: true,
            job_type: "full_time",
            description: "Lead product strategy, roadmap, and fintech platform growth."
          }
        ];
      }
    });

    expect(requests).toContainEqual(
      expect.objectContaining({ searchTerm: "vice president product", resultsWanted: 5, hoursOld: 24 })
    );
    expect(requests).toContainEqual(
      expect.objectContaining({ searchTerm: "vice president product", resultsWanted: 35, hoursOld: 336 })
    );
    expect(result.jobs.map((job) => job.company)).toContain("Widened Expansion Fintech");
    expect(result.applications).toHaveLength(1);
    expect(result.manifest.notes.some((note) => note.includes("Transient source expansion ran"))).toBe(true);
  });

  it("removes obvious demo jobs from real external user runs", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-demo-guard-workspace-"));
    const applyCueHome = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-demo-guard-home-"));
    const profileDir = path.join(applyCueHome, "profiles", "default");
    await mkdir(path.join(profileDir, "assets", "jobs"), { recursive: true });
    await writeFile(
      path.join(profileDir, "applycue.json"),
      JSON.stringify({
        profile: {
          name: "External Candidate",
          email: "external@example.com",
          currentDesignation: "Head of Product"
        },
        preferences: {
          targetRoleTerms: ["head of product"],
          targetIndustries: ["fintech"],
          preferredLocations: ["remote", "india"],
          acceptableWorkModes: ["remote"],
          employmentTypes: ["full_time"],
          niceToHaveKeywords: ["product strategy"]
        },
        applySettings: {
          mode: "review",
          applicationsPerDay: 5,
          minimumFitToApply: 0.5
        },
        matchSettings: {
          minimumFitFloor: 0.5
        },
        proofBank: [
          {
            id: "proof-product",
            claim: "Led product strategy work.",
            evidence: "Approved profile proof.",
            tags: ["product strategy", "fintech"],
            kind: "work"
          }
        ],
        sources: {
          localJobsPath: "assets/jobs/jobs.jsonl"
        }
      }),
      "utf8"
    );
    await writeFile(
      path.join(profileDir, "assets", "jobs", "jobs.jsonl"),
      [
        {
          company: "Example Fintech",
          title: "Head of Product",
          url: "https://example.com/demo-job",
          description: "Lead product strategy for fintech.",
          location: "Remote India",
          workMode: "remote",
          employmentType: "full_time"
        },
        {
          company: "Real Fintech Co",
          title: "Head of Product",
          url: "https://jobs.realfintech.co/head-product",
          description: "Lead product strategy for fintech.",
          location: "Remote India",
          workMode: "remote",
          employmentType: "full_time"
        }
      ].map((row) => JSON.stringify(row)).join("\n"),
      "utf8"
    );

    const result = await runLocalOrSampleBatch({
      workspaceRoot,
      applyCueHome,
      writeFiles: false
    });

    expect(result.jobs.map((job) => job.company)).toEqual(["Real Fintech Co"]);
    expect(result.manifest.notes).toContain("Skipped 1 development/demo job(s) from this real user run.");
  });

  it("adds source outcome learning from the local outcome event store", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-source-outcomes-"));
    await mkdir(path.join(workspaceRoot, "config", "data", "local"), { recursive: true });
    await mkdir(path.join(workspaceRoot, "data", "input"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, "config", "applycue.local.json"),
      JSON.stringify({
        profile: {
          name: "Outcome Candidate",
          email: "outcome@example.com",
          currentDesignation: "Head of Product"
        },
        preferences: {
          targetRoleTerms: ["head of product"],
          targetIndustries: ["fintech"],
          acceptableWorkModes: ["remote"],
          employmentTypes: ["full_time"],
          niceToHaveKeywords: ["product strategy"]
        },
        applySettings: {
          mode: "daily",
          applicationsPerDay: 1,
          minimumFitToApply: 0.5
        },
        matchSettings: {
          minimumFitFloor: 0.5
        },
        proofBank: [
          {
            id: "proof-product",
            claim: "Led product strategy work.",
            evidence: "Approved profile proof.",
            tags: ["head of product", "product strategy", "fintech"],
            kind: "work"
          }
        ],
        sources: {
          localJobsPath: "../data/input/jobs.jsonl"
        }
      }),
      "utf8"
    );
    await writeFile(
      path.join(workspaceRoot, "data", "input", "jobs.jsonl"),
      `${JSON.stringify({
        company: "Outcome Fintech",
        title: "Head of Product",
        url: "https://example.com/outcome-job",
        description: "Lead product strategy for fintech teams.",
        location: "Remote India",
        workMode: "remote",
        employmentType: "full_time",
        source: {
          id: "jobspy-outcome",
          kind: "job_board",
          name: "JobSpy outcome search"
        }
      })}\n`,
      "utf8"
    );
    await writeFile(
      path.join(workspaceRoot, "config", "data", "local", "outcomes.jsonl"),
      `${JSON.stringify({
        id: "outcome-reply",
        applicationId: "local-first-build-application-outcome-fintech-head-of-product-example-com-outcome-job",
        type: "reply",
        note: "Recruiter replied.",
        occurredAt: "2026-07-07T00:00:00.000Z"
      })}\n`,
      "utf8"
    );

    const result = await runLocalOrSampleBatch({
      workspaceRoot,
      applyCueHome: path.join(workspaceRoot, "empty-applycue-home"),
      writeFiles: false
    });

    expect(result.applications).toHaveLength(1);
    expect(result.manifest.sourceOutcomes?.eventPath).toContain("outcomes.jsonl");
    expect(result.manifest.sourceOutcomes?.trackedApplications).toBe(1);
    expect(result.manifest.sourceOutcomes?.outcomeEvents).toBe(1);
    expect(result.manifest.sourceOutcomes?.positiveOutcomes).toBe(1);
    expect(result.manifest.sourceOutcomes?.sources[0]?.sourceName).toBe("JobSpy outcome search");
    expect(result.sourceOutcomes?.replies).toBe(1);
  });

  it("records outcome events through the engine instead of hand-editing the store", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-record-outcome-"));
    await mkdir(path.join(workspaceRoot, "config"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, "config", "applycue.local.json"),
      JSON.stringify({
        profile: {
          name: "Recorder Candidate",
          email: "recorder@example.com"
        }
      }),
      "utf8"
    );

    const result = await recordOutcomeEvent({
      workspaceRoot,
      applyCueHome: path.join(workspaceRoot, "empty-applycue-home"),
      applicationId: "app-123",
      type: "interview",
      note: "Interview request received.",
      occurredAt: "2026-07-07T10:00:00.000Z"
    });

    expect(result.outcomesPath).toBe(path.join(workspaceRoot, "config", "data", "local", "outcomes.jsonl"));
    expect(result.event.id).toContain("app-123");
    expect(await readFile(result.outcomesPath, "utf8")).toContain("\"type\":\"interview\"");
  });

  it("prefers an external ApplyCue profile store over repo-local config", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-workspace-"));
    const applyCueHome = path.join(workspaceRoot, "applycue-home");
    const profileDir = path.join(applyCueHome, "profiles", "default");
    await mkdir(path.join(profileDir, "assets", "jobs"), { recursive: true });
    await writeFile(
      path.join(profileDir, "applycue.json"),
      JSON.stringify({
        profile: {
          name: "External Candidate",
          email: "external@example.com",
          currentDesignation: "Head of Product"
        },
        preferences: {
          targetRoleTerms: ["head of product"],
          targetIndustries: ["fintech"],
          acceptableWorkModes: ["remote"],
          employmentTypes: ["full_time"],
          niceToHaveKeywords: ["product strategy"]
        },
        proofBank: [
          {
            id: "proof-product",
            claim: "Led product strategy work.",
            evidence: "Approved external profile proof.",
            tags: ["head of product", "product strategy", "fintech"],
            kind: "work"
          }
        ],
        sources: {
          localJobsPath: "assets/jobs/jobs.jsonl"
        }
      }),
      "utf8"
    );
    await writeFile(
      path.join(profileDir, "assets", "jobs", "jobs.jsonl"),
      `${JSON.stringify({
        company: "External Fintech",
        title: "Head of Product",
        url: "https://example.com/external-job",
        description: "Lead product strategy for fintech.",
        location: "Remote India",
        workMode: "remote",
        employmentType: "full_time"
      })}\n`,
      "utf8"
    );

    const result = await runLocalOrSampleBatch({ workspaceRoot, applyCueHome, writeFiles: false });

    expect(result.profile.name).toBe("External Candidate");
    expect(result.jobs[0]?.company).toBe("External Fintech");
    expect(result.manifest.notes[0]).toContain("applycue-home");
  });

  it("loads local jobs from a configured directory", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-directory-"));
    await mkdir(path.join(workspaceRoot, "config"), { recursive: true });
    await mkdir(path.join(workspaceRoot, "data", "input", "jobs"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, "config", "applycue.local.json"),
      JSON.stringify({
        profile: {
          name: "Directory Candidate",
          email: "directory@example.com",
          currentDesignation: "VP Product"
        },
        preferences: {
          targetRoleTerms: ["vp product"],
          targetIndustries: ["saas"],
          acceptableWorkModes: ["remote", "hybrid"],
          employmentTypes: ["full_time"],
          niceToHaveKeywords: ["product strategy", "automation"]
        },
        proofBank: [
          {
            id: "proof-product-strategy",
            claim: "Led product strategy work.",
            evidence: "Approved profile proof.",
            tags: ["product strategy", "automation"],
            kind: "work"
          }
        ],
        sources: {
          localJobsPath: "../data/input/jobs"
        }
      }),
      "utf8"
    );
    await writeFile(
      path.join(workspaceRoot, "data", "input", "jobs", "job.md"),
      `---
company: Directory SaaS
title: VP Product Strategy
url: https://example.com/directory-job
location: Remote India
workMode: remote
employmentType: full_time
---

Lead product strategy and automation.
`,
      "utf8"
    );

    const result = await runLocalOrSampleBatch({
      workspaceRoot,
      applyCueHome: path.join(workspaceRoot, "empty-applycue-home"),
      writeFiles: false
    });

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.company).toBe("Directory SaaS");
    expect(result.cvVariants).toHaveLength(1);
  });

  it("does not prepare closed jobs even when the role match is strong", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-closed-job-"));
    await mkdir(path.join(workspaceRoot, "config"), { recursive: true });
    await mkdir(path.join(workspaceRoot, "data", "input"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, "config", "applycue.local.json"),
      JSON.stringify({
        profile: {
          name: "Closed Job Candidate",
          email: "closed@example.com",
          currentDesignation: "Head of Product"
        },
        preferences: {
          targetRoleTerms: ["head of product"],
          targetIndustries: ["fintech"],
          acceptableWorkModes: ["remote"],
          employmentTypes: ["full_time"],
          niceToHaveKeywords: ["product strategy"]
        },
        applySettings: {
          mode: "review",
          applicationsPerDay: 3,
          minimumFitToApply: 0.5
        },
        matchSettings: {
          minimumFitFloor: 0.5
        },
        proofBank: [
          {
            id: "proof-product",
            claim: "Led product strategy work.",
            evidence: "Approved profile proof.",
            tags: ["head of product", "product strategy", "fintech"],
            kind: "work"
          }
        ],
        sources: {
          localJobsPath: "../data/input/jobs.jsonl"
        }
      }),
      "utf8"
    );
    const rows = [
      {
        company: "Open Fintech",
        title: "Head of Product",
        url: "https://example.com/open-product",
        description: "Lead product strategy for fintech.",
        location: "Remote India",
        workMode: "remote",
        employmentType: "full_time",
        liveState: "live"
      },
      {
        company: "Closed Fintech",
        title: "Head of Product",
        url: "https://example.com/closed-product",
        description: "Lead product strategy for fintech.",
        location: "Remote India",
        workMode: "remote",
        employmentType: "full_time",
        liveState: "closed"
      }
    ];
    await writeFile(
      path.join(workspaceRoot, "data", "input", "jobs.jsonl"),
      rows.map((row) => JSON.stringify(row)).join("\n"),
      "utf8"
    );

    const result = await runLocalOrSampleBatch({
      workspaceRoot,
      applyCueHome: path.join(workspaceRoot, "empty-applycue-home"),
      writeFiles: false
    });
    const closedJob = result.jobs.find((job) => job.company === "Closed Fintech");
    const closedDecision = result.jobDecisions.find((item) => item.company === "Closed Fintech");

    expect(result.jobs).toHaveLength(2);
    expect(closedJob?.liveState).toBe("closed");
    expect(result.cvVariants.some((variant) => variant.jobId === closedJob?.id)).toBe(false);
    expect(result.applications.some((application) => application.jobId === closedJob?.id)).toBe(false);
    expect(result.browserPlans.some((plan) => plan.jobId === closedJob?.id)).toBe(false);
    expect(closedDecision?.decision).toBe("skip");
    expect(closedDecision?.failedGates.some((gate) => gate.startsWith("live:"))).toBe(true);
  });

  it("uses an injected liveness verifier before CV and application prep", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-liveness-verifier-"));
    await mkdir(path.join(workspaceRoot, "config"), { recursive: true });
    await mkdir(path.join(workspaceRoot, "data", "input"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, "config", "applycue.local.json"),
      JSON.stringify({
        profile: {
          name: "Verifier Candidate",
          email: "verifier@example.com",
          currentDesignation: "Head of Product"
        },
        preferences: {
          targetRoleTerms: ["head of product"],
          targetIndustries: ["fintech"],
          acceptableWorkModes: ["remote"],
          employmentTypes: ["full_time"],
          niceToHaveKeywords: ["product strategy"]
        },
        applySettings: {
          mode: "review",
          applicationsPerDay: 2,
          minimumFitToApply: 0.5
        },
        matchSettings: {
          minimumFitFloor: 0.5
        },
        proofBank: [
          {
            id: "proof-product",
            claim: "Led product strategy work.",
            evidence: "Approved profile proof.",
            tags: ["head of product", "product strategy", "fintech"],
            kind: "work"
          }
        ],
        sources: {
          localJobsPath: "../data/input/jobs.jsonl"
        }
      }),
      "utf8"
    );
    await writeFile(
      path.join(workspaceRoot, "data", "input", "jobs.jsonl"),
      [
        {
          company: "Live Fintech",
          title: "Head of Product",
          url: "https://example.com/live-product",
          description: "Lead product strategy for fintech.",
          location: "Remote India",
          workMode: "remote",
          employmentType: "full_time"
        },
        {
          company: "Verifier Closed Fintech",
          title: "Head of Product",
          url: "https://example.com/stale-product",
          description: "Lead product strategy for fintech.",
          location: "Remote India",
          workMode: "remote",
          employmentType: "full_time"
        }
      ].map((row) => JSON.stringify(row)).join("\n"),
      "utf8"
    );

    const result = await runLocalOrSampleBatch({
      workspaceRoot,
      applyCueHome: path.join(workspaceRoot, "empty-applycue-home"),
      configPath: path.join(workspaceRoot, "config", "applycue.local.json"),
      writeFiles: false,
      livenessVerifier: (job) => job.company === "Verifier Closed Fintech" ? "closed" : undefined
    });
    const closedJob = result.jobs.find((job) => job.company === "Verifier Closed Fintech");

    expect(closedJob?.liveState).toBe("closed");
    expect(result.cvVariants.some((variant) => variant.jobId === closedJob?.id)).toBe(false);
    expect(result.applications.some((application) => application.jobId === closedJob?.id)).toBe(false);
    expect(result.browserPlans.some((plan) => plan.jobId === closedJob?.id)).toBe(false);
    expect(result.manifest.notes).toContain("Liveness verifier checked 2 job(s); updated 1 (1 closed, 0 live, 0 unknown).");
  });

  it("loads public ATS company sources from config", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-ats-"));
    await mkdir(path.join(workspaceRoot, "config"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, "config", "applycue.local.json"),
      JSON.stringify({
        profile: {
          name: "ATS Candidate",
          email: "ats@example.com",
          currentDesignation: "Head of Product"
        },
        preferences: {
          targetRoleTerms: ["head of product"],
          targetIndustries: ["fintech"],
          acceptableWorkModes: ["remote"],
          employmentTypes: ["full_time"],
          niceToHaveKeywords: ["product strategy", "ai"]
        },
        proofBank: [
          {
            id: "proof-product-ai",
            claim: "Led AI product strategy work.",
            evidence: "Approved profile proof.",
            tags: ["product strategy", "ai"],
            kind: "work"
          }
        ],
        sources: {
          localJobsPath: "../data/input/missing-jobs",
          companyPages: [
            {
              company: "ATS Fintech",
              provider: "greenhouse",
              careersUrl: "https://job-boards.greenhouse.io/atsfintech",
              enabled: true
            }
          ]
        }
      }),
      "utf8"
    );

    const result = await runLocalOrSampleBatch({
      workspaceRoot,
      applyCueHome: path.join(workspaceRoot, "empty-applycue-home"),
      writeFiles: false,
      companyPageFetchJson: async () => ({
        jobs: [
          {
            title: "Head of Product AI",
            absolute_url: "https://job-boards.greenhouse.io/atsfintech/jobs/123",
            location: { name: "Remote India" },
            content: "Lead product strategy and AI programs."
          }
        ]
      })
    });

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.source.kind).toBe("ats");
    expect(result.jobs[0]?.company).toBe("ATS Fintech");
    expect(result.cvVariants).toHaveLength(1);
    expect(result.manifest.notes).toContain("Loaded 1 job(s) from 1 company/ATS source(s).");
    expect(result.manifest.notes.some((note) => note.startsWith("Generated "))).toBe(true);
  });

  it("loads approved reverse ATS directory sources from search config", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-ats-directory-"));
    await mkdir(path.join(workspaceRoot, "config"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, "config", "applycue.local.json"),
      JSON.stringify({
        profile: {
          name: "Reverse ATS Candidate",
          email: "reverse@example.com",
          currentDesignation: "Head of Product"
        },
        preferences: {
          targetRoleTerms: ["head of product"],
          targetIndustries: ["fintech"],
          acceptableWorkModes: ["remote"],
          employmentTypes: ["full_time"],
          niceToHaveKeywords: ["product strategy"]
        },
        proofBank: [
          {
            id: "proof-product",
            claim: "Led product strategy work.",
            evidence: "Approved profile proof.",
            tags: ["head of product", "product strategy", "fintech"],
            kind: "work"
          }
        ],
        sources: {
          localJobsPath: "../data/input/missing-jobs",
          searches: [
            {
              id: "reverse-ats",
              origin: "system_generated",
              status: "active",
              kind: "ats",
              label: "Reverse ATS directory scan",
              enabled: true,
              provider: "ats_directory",
              query: "head of product",
              approvedAt: "2026-07-06T00:00:00.000Z",
              options: {
                providers: ["greenhouse"],
                limitPerProvider: 1,
                sample: "prefix",
                batchSize: 1
              }
            }
          ]
        }
      }),
      "utf8"
    );

    const result = await runLocalOrSampleBatch({
      workspaceRoot,
      applyCueHome: path.join(workspaceRoot, "empty-applycue-home"),
      writeFiles: false,
      atsDirectoryFetchJson: async (url) => {
        if (url === "https://raw.githubusercontent.com/Feashliaa/job-board-aggregator/main/data/greenhouse_companies.json") {
          return ["reversefintech"];
        }
        if (url === "https://boards-api.greenhouse.io/v1/boards/reversefintech/jobs?content=true") {
          return {
            jobs: [
              {
                title: "Head of Product",
                absolute_url: "https://job-boards.greenhouse.io/reversefintech/jobs/123",
                location: { name: "Remote India" },
                content: "Lead product strategy for fintech teams."
              }
            ]
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      }
    });

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.source.kind).toBe("ats");
    expect(result.jobs[0]?.company).toBe("Reversefintech");
    expect(result.cvVariants).toHaveLength(1);
    expect(result.manifest.notes).toContain("Loaded 1 job(s) from 1 reverse ATS source(s).");
  });

  it("loads approved job-board sources from config", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-job-board-"));
    await mkdir(path.join(workspaceRoot, "config"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, "config", "applycue.local.json"),
      JSON.stringify({
        profile: {
          name: "Job Board Candidate",
          email: "board@example.com",
          currentDesignation: "Head of Product"
        },
        preferences: {
          targetRoleTerms: ["head of product"],
          targetIndustries: ["fintech"],
          acceptableWorkModes: ["remote"],
          employmentTypes: ["full_time"],
          niceToHaveKeywords: ["product strategy"]
        },
        proofBank: [
          {
            id: "proof-product",
            claim: "Led product strategy work.",
            evidence: "Approved profile proof.",
            tags: ["product strategy", "fintech"],
            kind: "work"
          }
        ],
        sources: {
          localJobsPath: "../data/input/missing-jobs",
          jobBoards: [
            {
              id: "remotive-product",
              origin: "user_added",
              status: "active",
              kind: "job_board",
              label: "Remotive product",
              enabled: true,
              provider: "remotive",
              query: "product",
              approvedAt: "2026-07-06T00:00:00.000Z",
              options: {
                limit: 1
              }
            }
          ]
        }
      }),
      "utf8"
    );

    const result = await runLocalOrSampleBatch({
      workspaceRoot,
      applyCueHome: path.join(workspaceRoot, "empty-applycue-home"),
      writeFiles: false,
      jobBoardFetchJson: async (url) => {
        expect(url).toBe("https://remotive.com/api/remote-jobs?search=product&limit=1");
        return {
          jobs: [
            {
              id: 123,
              url: "https://remotive.com/remote-jobs/product/head-product-123",
              title: "Head of Product Strategy",
              company_name: "Remote Product Co",
              candidate_required_location: "Worldwide",
              job_type: "full_time",
              description: "<p>Lead product strategy for fintech teams.</p>"
            },
            {
              id: 456,
              url: "https://remotive.com/remote-jobs/software/principal-engineer-456",
              title: "Principal Engineer, Full Stack, VP",
              company_name: "Remote Engineering Co",
              candidate_required_location: "Worldwide",
              job_type: "full_time",
              description: "<p>Build backend systems for platform teams.</p>"
            }
          ]
        };
      }
    });

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.source.kind).toBe("job_board");
    expect(result.jobs[0]?.company).toBe("Remote Product Co");
    expect(result.cvVariants).toHaveLength(1);
    expect(result.manifest.notes).toContain("Loaded 2 job(s) from 1 job-board source(s).");
    expect(result.manifest.notes).toContain("Source quality kept 1 of 2 discovered job(s); filtered 1 (1 title).");
    expect(result.manifest.sourceQuality).toEqual({
      inputJobs: 2,
      keptJobs: 1,
      filteredJobs: 1,
      byReason: {
        title: 1,
        location: 0,
        content: 0
      }
    });
    expect(result.manifest.sourceScorecards?.fetchedJobs).toBe(2);
    expect(result.manifest.sourceScorecards?.keptJobs).toBe(1);
    expect(result.manifest.sourceScorecards?.filteredJobs).toBe(1);
    expect(result.manifest.sourceScorecards?.preparedApplications).toBe(1);
  });

  it("uses scan history to avoid repeated prepared job-board roles in automation runs", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-scan-history-"));
    await mkdir(path.join(workspaceRoot, "config"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, "config", "applycue.local.json"),
      JSON.stringify({
        profile: {
          name: "Scan History Candidate",
          email: "scan@example.com",
          currentDesignation: "Head of Product"
        },
        preferences: {
          targetRoleTerms: ["head of product"],
          targetIndustries: ["fintech"],
          acceptableWorkModes: ["remote"],
          employmentTypes: ["full_time"],
          niceToHaveKeywords: ["product strategy"]
        },
        applySettings: {
          mode: "daily",
          applicationsPerDay: 2,
          minimumFitToApply: 0.5
        },
        matchSettings: {
          minimumFitFloor: 0.5
        },
        proofBank: [
          {
            id: "proof-product",
            claim: "Led product strategy work.",
            evidence: "Approved profile proof.",
            tags: ["head of product", "product strategy", "fintech"],
            kind: "work"
          }
        ],
        sources: {
          localJobsPath: "../data/input/missing-jobs",
          jobBoards: [
            {
              id: "remotive-product",
              origin: "user_added",
              status: "active",
              kind: "job_board",
              label: "Remotive product",
              enabled: true,
              provider: "remotive",
              query: "product",
              approvedAt: "2026-07-06T00:00:00.000Z",
              options: {
                limit: 3
              }
            }
          ]
        }
      }),
      "utf8"
    );
    const firstRows = [
      {
        id: 123,
        url: "https://remotive.com/remote-jobs/product/head-product-123",
        title: "Head of Product",
        company_name: "Repeat Product Co",
        candidate_required_location: "Worldwide",
        job_type: "full_time",
        description: "<p>Lead product strategy for fintech teams.</p>"
      },
      {
        id: 456,
        url: "https://remotive.com/remote-jobs/product/head-product-456",
        title: "Head of Product Strategy",
        company_name: "Repeat Strategy Co",
        candidate_required_location: "Worldwide",
        job_type: "full_time",
        description: "<p>Lead product strategy for fintech teams.</p>"
      }
    ];
    const secondRows = [
      ...firstRows,
      {
        id: 789,
        url: "https://remotive.com/remote-jobs/product/head-product-789",
        title: "Head of Product Growth",
        company_name: "Fresh Product Co",
        candidate_required_location: "Worldwide",
        job_type: "full_time",
        description: "<p>Lead product strategy for fintech growth teams.</p>"
      }
    ];
    let rows = firstRows;

    const first = await runLocalOrSampleBatch({
      workspaceRoot,
      applyCueHome: path.join(workspaceRoot, "empty-applycue-home"),
      generatedSourceExpansion: false,
      writeFiles: true,
      jobBoardFetchJson: async () => ({ jobs: rows })
    });

    rows = secondRows;
    const second = await runLocalOrSampleBatch({
      workspaceRoot,
      applyCueHome: path.join(workspaceRoot, "empty-applycue-home"),
      writeFiles: false,
      jobBoardFetchJson: async () => ({ jobs: rows })
    });

    expect(first.applications).toHaveLength(2);
    expect(first.manifest.scanHistory?.recordedJobs).toBe(2);
    expect(first.manifest.scanHistory?.skippedJobs).toBe(0);
    expect(await readFile(path.join(workspaceRoot, "config", "data", "local", "scan-history.jsonl"), "utf8")).toContain("prepared");
    expect(second.jobs.map((job) => job.company)).toEqual(["Fresh Product Co"]);
    expect(second.applications).toHaveLength(1);
    expect(second.manifest.scanHistory?.skippedPrepared).toBe(2);
    expect(second.manifest.scanHistory?.keptJobs).toBe(1);
    expect(second.manifest.notes).toContain("Scan history kept 1 of 3 post-filter job(s); skipped 2 already handled job(s).");
  });

  it("prepares up to applicationsPerDay instead of a hardcoded tiny batch", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-batch-size-"));
    await mkdir(path.join(workspaceRoot, "config"), { recursive: true });
    await mkdir(path.join(workspaceRoot, "data", "input"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, "config", "applycue.local.json"),
      JSON.stringify({
        profile: {
          name: "Batch Candidate",
          email: "batch@example.com",
          currentDesignation: "Head of Product"
        },
        preferences: {
          targetRoleTerms: ["head of product"],
          targetIndustries: ["fintech"],
          acceptableWorkModes: ["remote"],
          employmentTypes: ["full_time"],
          niceToHaveKeywords: ["product strategy"]
        },
        applySettings: {
          mode: "review",
          applicationsPerDay: 5,
          minimumFitToApply: 0.5
        },
        matchSettings: {
          minimumFitFloor: 0.5
        },
        proofBank: [
          {
            id: "proof-product",
            claim: "Led product strategy work.",
            evidence: "Approved profile proof.",
            tags: ["product strategy", "fintech"],
            kind: "work"
          }
        ],
        sources: {
          localJobsPath: "../data/input/jobs.jsonl"
        }
      }),
      "utf8"
    );
    const rows = Array.from({ length: 6 }, (_item, index) => ({
      company: `Batch Fintech ${index + 1}`,
      title: "Head of Product",
      url: `https://example.com/batch-${index + 1}`,
      description: "Lead product strategy for fintech.",
      location: "Remote India",
      workMode: "remote",
      employmentType: "full_time"
    }));
    await writeFile(
      path.join(workspaceRoot, "data", "input", "jobs.jsonl"),
      rows.map((row) => JSON.stringify(row)).join("\n"),
      "utf8"
    );

    const result = await runLocalOrSampleBatch({
      workspaceRoot,
      applyCueHome: path.join(workspaceRoot, "empty-applycue-home"),
      writeFiles: false
    });

    expect(result.applications).toHaveLength(5);
    expect(result.cvVariants).toHaveLength(5);
  });

  it("does not prepare skipped weak-role jobs even when the match floor is low", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-decision-gate-"));
    const profile: UserProfile = {
      id: "decision-gate-user",
      currentLevel: "director",
      totalExperienceYears: 15,
      currentDesignation: "Head of Product",
      baseCvText: [
        "Decision Gate Candidate",
        "",
        "Example Product Co        Head of Product",
        "- Led product roadmap and fintech payments strategy.",
        "- Owned product leadership and GTM execution.",
        "",
        "EDUCATION",
        "MBA"
      ].join("\n"),
      pastEmployers: [],
      preferences: {
        targetRoleTerms: ["head of product", "director product"],
        adjacentRoleTerms: ["business development"],
        targetIndustries: ["fintech"],
        excludedIndustries: [],
        preferredLocations: ["remote india"],
        extraLocations: [],
        askBeforeLocations: [],
        acceptableWorkModes: ["remote", "hybrid"],
        targetSeniorities: ["director", "vp"],
        acceptableSeniorities: ["director", "vp", "c_level"],
        employmentTypes: ["full_time"],
        companyStages: [],
        preferredCompanyNames: [],
        blockedCompanyNames: [],
        noGoRoleTerms: [],
        requiredKeywords: [],
        niceToHaveKeywords: ["roadmap", "payments"],
        excludedKeywords: [],
        workAuthorizationCountries: ["india"],
        preferredTimezones: []
      },
      searchSettings: {
        searchCountries: ["india"],
        searchAreas: ["remote india"],
        remoteRegions: ["india"],
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
        minimumFitToApply: 0.8,
        allowedSourceKinds: ["manual", "job_board"],
        messagePolicy: "draft_only",
        pauseReasons: ["missing_required_answer"],
        trackEmailReplies: false,
        allowRecruiterDmDrafts: true
      },
      matchSettings: {
        range: "normal",
        widenIfFewerThan: 20,
        relaxOrder: ["source", "title", "industry", "location", "recency", "minimum_fit"],
        minimumFitFloor: 0.4,
        allowAdjacentTitles: true,
        allowAdjacentIndustries: true
      },
      proofBank: [
        {
          id: "proof-product",
          claim: "Worked as Head of Product and led product roadmap and fintech payments work.",
          evidence: "Approved profile proof covers Head of Product, roadmap, fintech, and payments.",
          tags: ["head of product", "product", "roadmap", "fintech", "payments"],
          kind: "work"
        }
      ],
      facts: [
        {
          id: "fact-head-of-product",
          statement: "Worked as Head of Product and led product roadmap and fintech payments strategy.",
          category: "role",
          sourceKind: "user_confirmed",
          sensitivity: "major",
          sourceRef: "engine-test",
          approvedByUser: true,
          createdAt: "2026-07-05T00:00:00.000Z"
        }
      ]
    };
    const jobs: JobRecord[] = [
      {
        id: "strong-product",
        source: { id: "manual", kind: "manual", name: "Manual" },
        company: "Good Fintech",
        title: "Head of Product",
        url: "https://example.com/strong",
        description: "Lead product roadmap and fintech payments strategy.",
        location: "Remote India",
        workMode: "remote",
        seniority: "director",
        employmentType: "full_time",
        discoveredAt: "2026-07-05T00:00:00.000Z",
        liveState: "live"
      },
      {
        id: "weak-adjacent",
        source: { id: "manual", kind: "manual", name: "Manual" },
        company: "Adjacent Co",
        title: "Head of Business Development",
        url: "https://example.com/weak",
        description: "Own partnerships and work with product teams on fintech GTM.",
        location: "Remote India",
        workMode: "remote",
        seniority: "director",
        employmentType: "full_time",
        discoveredAt: "2026-07-05T00:00:00.000Z",
        liveState: "live"
      }
    ];

    const result = await runBatch({
      workspaceRoot,
      outputRoot: workspaceRoot,
      profile,
      jobs,
      runId: "decision-gate",
      kind: "daily_batch",
      writeFiles: false
    });

    expect(result.cvVariants.map((variant) => variant.jobId)).toEqual(["strong-product"]);
    expect(result.jobDecisions.find((item) => item.jobId === "weak-adjacent")?.decision).toBe("skip");
  });

  it("fills review batches down to the match floor when strict apply threshold is short", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-batch-floor-"));
    await mkdir(path.join(workspaceRoot, "config"), { recursive: true });
    await mkdir(path.join(workspaceRoot, "data", "input"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, "config", "applycue.local.json"),
      JSON.stringify({
        profile: {
          name: "Floor Candidate",
          email: "floor@example.com",
          currentDesignation: "Head of Product"
        },
        preferences: {
          targetRoleTerms: ["head of product"],
          targetIndustries: ["fintech"],
          acceptableWorkModes: ["remote"],
          employmentTypes: ["full_time"],
          niceToHaveKeywords: ["product strategy"]
        },
        applySettings: {
          mode: "review",
          applicationsPerDay: 3,
          minimumFitToApply: 0.95
        },
        matchSettings: {
          minimumFitFloor: 0.5
        },
        proofBank: [
          {
            id: "proof-product",
            claim: "Led product strategy work.",
            evidence: "Approved profile proof.",
            tags: ["product strategy", "fintech"],
            kind: "work"
          }
        ],
        sources: {
          localJobsPath: "../data/input/jobs.jsonl"
        }
      }),
      "utf8"
    );
    await writeFile(
      path.join(workspaceRoot, "data", "input", "jobs.jsonl"),
      Array.from({ length: 3 }, (_item, index) =>
        JSON.stringify({
          company: `Floor Fintech ${index + 1}`,
          title: "Head of Product",
          url: `https://example.com/floor-${index + 1}`,
          description: "Lead product strategy for fintech.",
          location: "Remote India",
          workMode: "remote",
          employmentType: "full_time"
        })
      ).join("\n"),
      "utf8"
    );

    const result = await runLocalOrSampleBatch({
      workspaceRoot,
      applyCueHome: path.join(workspaceRoot, "empty-applycue-home"),
      writeFiles: false
    });

    expect(result.applications).toHaveLength(3);
  });

  it("skips candidates whose CV reconciliation does not pass and continues filling the batch", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-reconcile-skip-"));
    await mkdir(path.join(workspaceRoot, "config"), { recursive: true });
    await mkdir(path.join(workspaceRoot, "data", "input"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, "config", "applycue.local.json"),
      JSON.stringify({
        profile: {
          name: "Reconcile Candidate",
          email: "reconcile@example.com",
          currentDesignation: "Head of Product"
        },
        preferences: {
          targetRoleTerms: ["head of product"],
          targetIndustries: ["fintech"],
          acceptableWorkModes: ["remote"],
          employmentTypes: ["full_time"],
          niceToHaveKeywords: ["product strategy"]
        },
        applySettings: {
          mode: "review",
          applicationsPerDay: 2,
          minimumFitToApply: 0.5
        },
        matchSettings: {
          minimumFitFloor: 0.5
        },
        proofBank: [
          {
            id: "proof-product",
            claim: "Led product strategy work.",
            evidence: "Approved profile proof.",
            tags: ["head of product", "product strategy", "fintech"],
            kind: "work"
          }
        ],
        sources: {
          localJobsPath: "../data/input/jobs.jsonl"
        }
      }),
      "utf8"
    );
    const rows = [
      {
        company: "Blocked Product Co",
        title: "Head of Product",
        url: "https://example.com/blocked",
        description: "Lead product strategy for fintech and healthcare compliance.",
        location: "Remote India",
        workMode: "remote",
        employmentType: "full_time"
      },
      {
        company: "Passed Product Co 1",
        title: "Head of Product",
        url: "https://example.com/passed-1",
        description: "Lead product strategy for fintech.",
        location: "Remote India",
        workMode: "remote",
        employmentType: "full_time"
      },
      {
        company: "Passed Product Co 2",
        title: "Head of Product",
        url: "https://example.com/passed-2",
        description: "Lead product strategy for fintech.",
        location: "Remote India",
        workMode: "remote",
        employmentType: "full_time"
      }
    ];
    await writeFile(
      path.join(workspaceRoot, "data", "input", "jobs.jsonl"),
      rows.map((row) => JSON.stringify(row)).join("\n"),
      "utf8"
    );

    const result = await runLocalOrSampleBatch({
      workspaceRoot,
      applyCueHome: path.join(workspaceRoot, "empty-applycue-home"),
      writeFiles: false
    });

    expect(result.applications).toHaveLength(2);
    expect(result.browserPlans).toHaveLength(2);
    expect(result.cvVariants.map((variant) => variant.jobId)).not.toContain("blocked-product-co-head-of-product-example-com-blocked");
    expect(result.reconciliationReports.every((report) => report.status === "passed")).toBe(true);
    expect(result.manifest.notes).toContain("Skipped 1 candidate CV(s) because reconciliation did not pass.");
    const blockedDecision = result.jobDecisions.find((decision) => decision.company === "Blocked Product Co");
    expect(blockedDecision?.reconciliationStatus).toBe("blocked");
    expect(blockedDecision?.skippedReason).toContain("Unsupported requirement must not be claimed");
    expect(blockedDecision?.nextStep).toBe("Skipped until CV reconciliation passes.");
  });

  it("approves generated source suggestions into editable config without touching the generated plan", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-source-approval-"));
    const applyCueHome = path.join(workspaceRoot, "applycue-home");
    const profileDir = path.join(applyCueHome, "profiles", "default");
    await mkdir(profileDir, { recursive: true });
    const configPath = path.join(profileDir, "applycue.json");
    await writeFile(
      configPath,
      JSON.stringify({
        profile: {
          name: "Source Approval Candidate",
          email: "source@example.com",
          currentDesignation: "Head of Product",
          currentCountry: "India",
          currentLocation: "Delhi NCR"
        },
        preferences: {
          targetRoleTerms: ["head of product"],
          targetIndustries: ["fintech"],
          preferredLocations: ["Remote India"],
          acceptableWorkModes: ["remote"],
          employmentTypes: ["full_time"],
          niceToHaveKeywords: ["product strategy"]
        },
        sourceSettings: {
          jobBoardDefaults: {
            siteNames: ["indeed", "google", "naukri"],
            countryIndeed: "india"
          }
        },
        sources: {
          companyPages: [],
          jobBoards: [],
          loggedInBrowserSources: []
        }
      }),
      "utf8"
    );

    await runLocalOrSampleBatch({ workspaceRoot, applyCueHome, writeFiles: true, generatedSourceExpansion: false });
    const sourcePlanPath = path.join(profileDir, "data", "local", "source-plan.generated.json");
    const originalPlanJson = await readFile(sourcePlanPath, "utf8");
    const sourcePlan = JSON.parse(originalPlanJson) as SourcePlan;
    const greenhouse = sourcePlan.suggestions.find((suggestion) => suggestion.provider === "greenhouse");
    const jobSpy = sourcePlan.suggestions.find((suggestion) => suggestion.provider === "jobspy");
    const linkedIn = sourcePlan.suggestions.find((suggestion) => suggestion.label === "LinkedIn jobs search");
    const manual = sourcePlan.suggestions.find((suggestion) => suggestion.kind === "manual");
    expect(greenhouse).toBeDefined();
    expect(jobSpy).toBeDefined();
    expect(linkedIn).toBeDefined();
    expect(manual).toBeDefined();

    const result = await approveSourceSuggestions({
      workspaceRoot,
      applyCueHome,
      approvedAt: "2026-07-06T10:00:00.000Z",
      suggestionIds: [greenhouse?.id ?? "", jobSpy?.id ?? "", linkedIn?.id ?? "", manual?.id ?? ""]
    });

    expect(result.addedCount).toBe(3);
    expect(result.skippedCount).toBe(1);
    expect(await readFile(sourcePlanPath, "utf8")).toBe(originalPlanJson);

    const updatedConfig = JSON.parse(await readFile(configPath, "utf8")) as {
      sources: {
        searches?: Array<Record<string, unknown>>;
        jobBoards?: Array<Record<string, unknown>>;
        loggedInBrowserSources?: Array<Record<string, unknown>>;
      };
    };
    expect(updatedConfig.sources.searches).toHaveLength(1);
    expect(updatedConfig.sources.searches?.[0]?.sourceSuggestionId).toBe(greenhouse?.id);
    expect(updatedConfig.sources.searches?.[0]?.origin).toBe("system_generated");
    expect(updatedConfig.sources.jobBoards).toHaveLength(1);
    expect(updatedConfig.sources.jobBoards?.[0]?.sourceSuggestionId).toBe(jobSpy?.id);
    expect(updatedConfig.sources.jobBoards?.[0]?.provider).toBe("jobspy");
    expect((updatedConfig.sources.jobBoards?.[0]?.options as { siteNames?: string[] } | undefined)?.siteNames).toEqual([
      "indeed",
      "google",
      "naukri"
    ]);
    expect(updatedConfig.sources.loggedInBrowserSources).toHaveLength(1);
    expect(updatedConfig.sources.loggedInBrowserSources?.[0]?.sourceSuggestionId).toBe(linkedIn?.id);

    const secondRun = await approveSourceSuggestions({
      workspaceRoot,
      applyCueHome,
      approvedAt: "2026-07-06T10:05:00.000Z",
      suggestionIds: [greenhouse?.id ?? "", jobSpy?.id ?? "", linkedIn?.id ?? "", manual?.id ?? ""]
    });

    expect(secondRun.addedCount).toBe(0);
    expect(secondRun.skippedCount).toBe(4);
  });

  it("approves reusable application answers into editable config with dry-run and replacement guards", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-answer-approval-"));
    const applyCueHome = path.join(workspaceRoot, "applycue-home");
    const profileDir = path.join(applyCueHome, "profiles", "default");
    await mkdir(profileDir, { recursive: true });
    const configPath = path.join(profileDir, "applycue.json");
    await writeFile(
      configPath,
      JSON.stringify({
        profile: {
          name: "Answer Approval Candidate",
          email: "answers@example.com"
        },
        applicationAnswers: []
      }),
      "utf8"
    );

    const dryRun = await approveApplicationAnswers({
      workspaceRoot,
      applyCueHome,
      dryRun: true,
      approvedAt: "2026-07-06T10:00:00.000Z",
      answers: [
        {
          field: "notice_period",
          value: "30 days",
          aliases: ["What is your notice period?"],
          sourceRef: "live-preflight"
        }
      ]
    });

    expect(dryRun.addedCount).toBe(1);
    expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual({
      profile: {
        name: "Answer Approval Candidate",
        email: "answers@example.com"
      },
      applicationAnswers: []
    });

    const approved = await approveApplicationAnswers({
      workspaceRoot,
      applyCueHome,
      approvedAt: "2026-07-06T10:00:00.000Z",
      answers: [
        {
          field: "notice_period",
          value: "30 days",
          aliases: ["What is your notice period?"],
          sourceRef: "live-preflight"
        }
      ]
    });

    expect(approved.addedCount).toBe(1);
    const updatedConfig = JSON.parse(await readFile(configPath, "utf8")) as {
      applicationAnswers?: Array<Record<string, unknown>>;
    };
    expect(updatedConfig.applicationAnswers).toHaveLength(1);
    expect(updatedConfig.applicationAnswers?.[0]?.field).toBe("notice_period");
    expect(updatedConfig.applicationAnswers?.[0]?.value).toBe("30 days");
    expect(updatedConfig.applicationAnswers?.[0]?.approvedByUser).toBe(true);
    expect(updatedConfig.applicationAnswers?.[0]?.aliases).toEqual(["What is your notice period?"]);

    const conflicting = await approveApplicationAnswers({
      workspaceRoot,
      applyCueHome,
      approvedAt: "2026-07-06T10:05:00.000Z",
      answers: [
        {
          field: "notice_period",
          value: "45 days"
        }
      ]
    });

    expect(conflicting.addedCount).toBe(0);
    expect(conflicting.skippedCount).toBe(1);

    const replaced = await approveApplicationAnswers({
      workspaceRoot,
      applyCueHome,
      approvedAt: "2026-07-06T10:10:00.000Z",
      replaceExisting: true,
      answers: [
        {
          field: "notice_period",
          value: "45 days",
          aliases: ["When can you join?"]
        }
      ]
    });

    expect(replaced.updatedCount).toBe(1);
    const replacedConfig = JSON.parse(await readFile(configPath, "utf8")) as {
      applicationAnswers?: Array<Record<string, unknown>>;
    };
    expect(replacedConfig.applicationAnswers?.[0]?.value).toBe("45 days");
    expect(replacedConfig.applicationAnswers?.[0]?.aliases).toEqual([
      "What is your notice period?",
      "When can you join?"
    ]);
  });
});
