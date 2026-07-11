import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { JobRecord, SourcePlan, UserProfile } from "@applycue/core";
import type { JobSpyRunRequest } from "@applycue/discovery";
import { createProfile } from "@applycue/profile";
import { describe, expect, it } from "vitest";
import {
  approveApplicationAnswers,
  approveSourceSuggestions,
  applyTuningSignals,
  recordJobDecision,
  recordJobDecisions,
  recordOutcomeEvent,
  recordTuningSignal,
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
    expect(result.applyRoutes).toHaveLength(result.applications.length);
    expect(result.manifest.sourceCodeWriteCount).toBe(0);
    expect(result.manifest.applyRouteIds).toHaveLength(result.applyRoutes.length);
    expect(result.manifest.cvQuality?.generatedCvs).toBe(result.cvVariants.length);
    expect(result.manifest.cvQuality?.minimumCvChars).toBeGreaterThan(0);
    expect(result.manifest.cvQuality?.minimumBullets).toBeGreaterThan(0);
    expect(result.atsDiagnosticReports).toHaveLength(result.cvVariants.length);
    expect(result.manifest.atsDiagnostics?.reports).toBe(result.cvVariants.length);
    expect(result.progressItems[0]?.atsDiagnosticsPath).toContain("outputs/ats-diagnostics/");
    expect(result.progressItems.length).toBe(result.applications.length);
    expect(result.progressItems[0]?.cvDocxPath).toContain("outputs/cvs/");
    expect(result.progressItems[0]?.cvDocxPath).toContain(".docx");
    expect(result.progressItems[0]?.cvHtmlPath).toContain("outputs/cvs/");
    expect(result.progressItems[0]?.cvHtmlPath).toContain(".html");
    expect(result.progressItems[0]?.cvPath).toContain("outputs/cvs/");
    expect(result.progressItems[0]?.jdPath).toContain("outputs/jds/");
    expect(result.progressItems[0]?.jdPath).toContain(".md");
    expect(result.progressItems[0]?.applyRoutePath).toContain("outputs/apply-routes/");
    expect(result.progressItems[0]?.applyRouteType).toBe("browser");
    expect(result.progressItems[0]?.applyRouteStatus).toBe("needs_preflight");
    expect(result.browserPlans[0]?.cvPath).toContain(".docx");
    expect(result.applyRoutes[0]?.execution.browser?.planId).toBe(result.browserPlans[0]?.id);
    expect(result.progressItems[0]?.reconciliationPath).toContain("outputs/reconciliation/");
    expect(result.cvVariants.every((variant) => variant.formatMode === "standard_ats_v1")).toBe(true);
    expect(result.cvVariants.every((variant) => variant.reconciliationStatus === "passed")).toBe(true);
    expect(result.reconciliationReports.every((report) => report.status === "passed")).toBe(true);
    expect(result.manifest.generatedFiles.some((file) => file.path === "outputs/dashboard/latest.html")).toBe(true);
    expect(result.manifest.generatedFiles.some((file) => file.kind === "cv_docx")).toBe(true);
    expect(result.manifest.generatedFiles.some((file) => file.kind === "cv_html")).toBe(true);
    expect(result.manifest.generatedFiles.some((file) => file.kind === "ats_diagnostics_json")).toBe(true);
    expect(result.manifest.generatedFiles.some((file) => file.kind === "job_description_markdown")).toBe(true);
    expect(result.manifest.generatedFiles.some((file) => file.kind === "apply_route_json")).toBe(true);
    expect(result.manifest.generatedFiles.some((file) => file.kind === "browser_plan_json")).toBe(true);
    expect(result.manifest.generatedFiles.some((file) => file.kind === "source_plan_json")).toBe(true);
    expect(result.manifest.generatedFiles.some((file) => file.kind === "run_summary_markdown")).toBe(true);
    expect(result.manifest.generatedFiles.some((file) => file.kind === "job_decisions_json")).toBe(true);
    expect(result.manifest.generatedFiles.some((file) => file.path === "outputs/runs/latest-summary.md")).toBe(true);
    expect(result.jobDecisions).toHaveLength(result.jobs.length);
    expect(result.sourcePlan.status).toBe("generated_for_review");
  });

  it("requires a recorded apply decision when normal preparation enables the agent gate", async () => {
    const seed = await runSampleBatch({ writeFiles: false });
    const ambiguousProfile: UserProfile = {
      ...seed.profile,
      applySettings: {
        ...seed.profile.applySettings,
        minimumFitToApply: 1
      }
    };

    const withoutDecision = await runBatch({
      jobs: seed.jobs,
      profile: ambiguousProfile,
      requireRecordedJobDecisions: true,
      runId: "agent-gated-empty",
      writeFiles: false
    });
    const candidate = withoutDecision.jobDecisions.find((item) => item.failedGates.length === 0 && item.decision === "review");
    expect(candidate).toBeDefined();
    expect(withoutDecision.applications).toHaveLength(0);
    expect(withoutDecision.jobDecisions.length).toBeGreaterThan(0);
    expect(withoutDecision.manifest.funnelHealth?.status).toBe("awaiting_decisions");
    expect(withoutDecision.manifest.funnelHealth?.awaitingDecisions).toBe(
      withoutDecision.jobDecisions.filter((item) => item.failedGates.length === 0 && item.decision === "review").length
    );
    expect(withoutDecision.manifest.funnelHealth?.suggestedActions.join(" ")).not.toContain("search more public job boards");

    const withDecision = await runBatch({
      jobs: seed.jobs,
      profile: ambiguousProfile,
      recordedJobDecisions: [{
        id: "decision-agent-gated",
        jobId: candidate!.jobId,
        decision: "apply",
        reasons: ["Approved evidence supports the role."],
        evidenceRefs: ["outputs/runs/latest-job-decisions.json"],
        actorKind: "agent",
        actorName: "codex",
        decidedAt: "2026-07-10T12:00:00.000Z",
        backendDecision: candidate!.decision,
        backendFailedGates: []
      }],
      requireRecordedJobDecisions: true,
      runId: "agent-gated-approved",
      writeFiles: false
    });
    expect(withDecision.applications).toHaveLength(1);
    expect(withDecision.applications[0]?.jobId).toBe(candidate!.jobId);
    expect(withDecision.jobDecisions.find((item) => item.jobId === candidate!.jobId)).toMatchObject({
      decision: candidate!.decision,
      recordedDecision: "apply",
      recordedReasons: ["Approved evidence supports the role."],
      decisionActorKind: "agent",
      decisionActorName: "codex"
    });
  });

  it("prepares clear rule-based matches without requiring an agent decision", async () => {
    const seed = await runSampleBatch({ writeFiles: false });
    const profile: UserProfile = {
      ...seed.profile,
      applySettings: {
        ...seed.profile.applySettings,
        mode: "review",
        minimumFitToApply: 0.01
      }
    };
    const clearJob = seed.jobs.find((job) => job.id === seed.applications[0]?.jobId);
    expect(clearJob).toBeDefined();

    const result = await runBatch({
      jobs: [clearJob!],
      profile,
      requireRecordedJobDecisions: true,
      runId: "system-clear-shortlist",
      writeFiles: false
    });

    expect(
      result.applications.length,
      JSON.stringify(result.jobDecisions.map((item) => ({ decision: item.decision, failedGates: item.failedGates, priority: item.priority })))
    ).toBeGreaterThan(0);
    expect(result.manifest.decisionAuthority).toBe("system_clear");
    expect(result.manifest.funnelHealth?.awaitingDecisions).toBe(0);
  });

  it("labels a shortlist hybrid when a recorded decision promotes an ambiguous job beside a clear match", async () => {
    const seed = await runSampleBatch({ writeFiles: false });
    const seedClear = seed.jobDecisions.find((item) => item.failedGates.length === 0 && item.decision === "apply");
    const seedClearJob = seed.jobs.find((job) => job.id === seedClear?.jobId);
    expect(seedClearJob).toBeDefined();
    const ambiguousJob: JobRecord = {
      ...seedClearJob!,
      id: "hybrid-ambiguous-job",
      company: "Ambiguous AI Co",
      title: "AI Program Lead",
      description: "Lead AI program delivery for fintech stakeholders.",
      url: "https://example.com/hybrid-ambiguous-job"
    };
    const hybridJobs = [seedClearJob!, ambiguousJob];
    const hybridProfile: UserProfile = {
      ...seed.profile,
      applySettings: {
        ...seed.profile.applySettings,
        minimumFitToApply: 0.9
      },
      matchSettings: {
        ...seed.profile.matchSettings,
        minimumFitFloor: 0.1
      }
    };
    const classified = await runBatch({
      jobs: hybridJobs,
      profile: hybridProfile,
      requireRecordedJobDecisions: true,
      runId: "hybrid-classification",
      writeFiles: false
    });
    const clear = classified.jobDecisions.find((item) => item.failedGates.length === 0 && item.decision === "apply");
    const ambiguous = classified.jobDecisions.find((item) => item.failedGates.length === 0 && item.decision === "review");
    expect(clear).toBeDefined();
    expect(ambiguous).toBeDefined();
    const jobs = hybridJobs.filter((job) => job.id === clear!.jobId || job.id === ambiguous!.jobId);

    const result = await runBatch({
      jobs,
      profile: hybridProfile,
      recordedJobDecisions: [{
        id: "decision-hybrid-ambiguous",
        jobId: ambiguous!.jobId,
        decision: "apply",
        reasons: ["The evidence resolves the ambiguous fit."],
        evidenceRefs: ["outputs/runs/latest-job-decisions.json"],
        actorKind: "agent",
        actorName: "codex",
        decidedAt: "2026-07-11T12:00:00.000Z",
        backendDecision: "review",
        backendFailedGates: []
      }],
      requireRecordedJobDecisions: true,
      runId: "hybrid-shortlist",
      writeFiles: false
    });

    expect(result.applications).toHaveLength(2);
    expect(result.manifest.decisionAuthority).toBe("hybrid_system_external");
  });

  it("writes the full ranked decision queue for agent review", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-decisions-"));
    const result = await runSampleBatch({ workspaceRoot, writeFiles: true });

    const queuePath = path.join(workspaceRoot, "outputs", "runs", "latest-job-decisions.json");
    const queue = JSON.parse(await readFile(queuePath, "utf8")) as {
      runId: string;
      profileId: string;
      queueCount: number;
      decisions: Array<{
        jobId: string;
        decision: string;
        reasons: string[];
        url?: string;
        descriptionExcerpt?: string;
        jobDescriptionPath?: string;
        priority?: number;
      }>;
    };

    expect(queue.runId).toBe(result.manifest.id);
    expect(queue.profileId).toBe(result.profile.id);
    expect(queue.queueCount).toBe(result.jobDecisions.length);
    expect(queue.decisions).toHaveLength(result.jobDecisions.length);
    expect(queue.decisions[0]?.reasons.length).toBeGreaterThan(0);
    expect(queue.decisions[0]?.url).toMatch(/^https?:\/\//);
    expect(queue.decisions[0]?.descriptionExcerpt?.length).toBeGreaterThan(0);
    expect(queue.decisions[0]?.jobDescriptionPath).toMatch(/^outputs\/jds\/.+\.md$/);
    expect(queue.decisions[0]?.priority).toEqual(expect.any(Number));
    await expect(readFile(path.join(workspaceRoot, queue.decisions[0]!.jobDescriptionPath!), "utf8"))
      .resolves.toContain("## Job Description");
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

  it("keeps recent known posts first and holds older known posts until expansion", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-freshness-"));
    const applyCueHome = path.join(workspaceRoot, "applycue-home");
    const profileDir = path.join(applyCueHome, "profiles", "default");
    await mkdir(profileDir, { recursive: true });
    await writeFile(
      path.join(profileDir, "applycue.json"),
      JSON.stringify({
        profile: {
          name: "Freshness Candidate",
          email: "freshness@example.com"
        },
        preferences: {
          targetRoleTerms: ["head of product"],
          targetIndustries: ["fintech"],
          preferredLocations: ["Remote India"],
          acceptableWorkModes: ["remote"],
          targetSeniorities: ["director", "vp"],
          acceptableSeniorities: ["director", "vp"],
          employmentTypes: ["full_time"],
          niceToHaveKeywords: ["product strategy", "roadmap"]
        },
        searchSettings: {
          freshnessDays: 30,
          includeUnknownPostDates: true
        },
        applySettings: {
          mode: "review",
          applicationsPerDay: 5,
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
            claim: "Led product strategy work.",
            evidence: "Profile includes product strategy leadership.",
            tags: ["product strategy", "roadmap", "fintech"],
            kind: "work"
          }
        ],
        sources: {
          jobBoards: [
            {
              label: "Approved JobSpy freshness search",
              provider: "jobspy",
              query: "head of product fintech",
              options: {
                siteNames: ["indeed"],
                location: "India",
                resultsWanted: 10
              }
            }
          ]
        }
      }),
      "utf8"
    );
    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const requests: Array<{ hoursOld?: number }> = [];
    const jobSpyRunner = async (request: JobSpyRunRequest) => {
      requests.push(typeof request.hours_old === "number" ? { hoursOld: request.hours_old } : {});
      return [
        {
          site: "indeed",
          title: "Head of Product",
          company: "Fresh Fintech",
          job_url: "https://jobs.example.test/fresh-product",
          location: "Remote India",
          is_remote: true,
          job_type: "full_time",
          date_posted: recentDate,
          description: "Lead product strategy, roadmap, and fintech platform growth."
        },
        {
          site: "indeed",
          title: "Head of Product",
          company: "Old Fintech",
          job_url: "https://jobs.example.test/old-product",
          location: "Remote India",
          is_remote: true,
          job_type: "full_time",
          date_posted: oldDate,
          description: "Lead product strategy, roadmap, and fintech platform growth."
        },
        {
          site: "indeed",
          title: "Head of Product",
          company: "Unknown Date Fintech",
          job_url: "https://jobs.example.test/unknown-date-product",
          location: "Remote India",
          is_remote: true,
          job_type: "full_time",
          description: "Lead product strategy, roadmap, and fintech platform growth."
        }
      ];
    };

    const clean = await runLocalOrSampleBatch({
      workspaceRoot,
      applyCueHome,
      jobSpyRunner,
      writeFiles: false
    });

    expect(requests[0]).toEqual({ hoursOld: 720 });
    expect(clean.jobs.map((job) => job.company)).toEqual(["Fresh Fintech", "Unknown Date Fintech"]);
    expect(clean.manifest.freshness?.filteredOldJobs).toBe(1);
    expect(clean.manifest.freshness?.unknownPostDateJobs).toBe(1);

    const widened = await runLocalOrSampleBatch({
      workspaceRoot,
      applyCueHome,
      includeOlderPosts: true,
      jobSpyRunner,
      writeFiles: false
    });

    expect(widened.jobs.map((job) => job.company)).toEqual(["Fresh Fintech", "Old Fintech", "Unknown Date Fintech"]);
    expect(widened.manifest.freshness?.includeOlderPosts).toBe(true);
    expect(widened.manifest.freshness?.filteredOldJobs).toBe(0);
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

  it("does not use generated public job-board expansion on the clean first run", async () => {
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
        if (request.search_term !== "head of product fintech") return [];
        return [
          {
            site: "indeed",
            title: "Vice President Product",
            company: "Expansion Fintech",
            job_url: "https://careers.expansionfintech.test/jobs/head-product",
            location: "Remote India",
            is_remote: true,
            job_type: "full_time",
            description: "Lead product strategy, roadmap, and fintech platform growth."
          }
        ];
      }
    });

    expect(requests).toEqual([]);
    expect(result.jobs.map((job) => job.company)).not.toContain("Expansion Fintech");
    expect(result.applications).toHaveLength(0);
    expect(result.manifest.notes.some((note) => note.includes("Transient source expansion ran"))).toBe(false);
  });

  it("uses transient generated public job-board expansion only when more results are requested", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-expansion-requested-"));
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
      generatedSourceExpansion: true,
      writeFiles: true,
      jobSpyRunner: async (request) => {
        requests.push(request.search_term ?? "");
        if (request.search_term !== "head of product fintech") return [];
        return [
          {
            site: "indeed",
            title: "Vice President Product",
            company: "Expansion Fintech",
            job_url: "https://careers.expansionfintech.test/jobs/head-product",
            location: "Remote India",
            is_remote: true,
            job_type: "full_time",
            description: "Lead product strategy, roadmap, and fintech platform growth."
          }
        ];
      }
    });

    expect(requests).toContain("head of product fintech");
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
      generatedSourceExpansion: true,
      writeFiles: true,
      jobSpyRunner: async (request) => {
        const recordedRequest: { hoursOld?: number; resultsWanted?: number; searchTerm?: string } = {};
        if (typeof request.hours_old === "number") recordedRequest.hoursOld = request.hours_old;
        if (typeof request.results_wanted === "number") recordedRequest.resultsWanted = request.results_wanted;
        if (request.search_term) recordedRequest.searchTerm = request.search_term;
        requests.push(recordedRequest);
        if (request.search_term !== "vice president product" || request.hours_old !== 720) return [];
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
      expect.objectContaining({ searchTerm: "vice president product", resultsWanted: 5, hoursOld: 720 })
    );
    expect(requests).toContainEqual(
      expect.objectContaining({ searchTerm: "vice president product", resultsWanted: 35, hoursOld: 720 })
    );
    expect(result.jobs.map((job) => job.company)).toContain("Widened Expansion Fintech");
    expect(result.applications).toHaveLength(1);
    expect(result.manifest.notes.some((note) => note.includes("Transient source expansion ran"))).toBe(true);
  });

  it("uses an explicit target ranking queue to expand even above the default small-batch threshold", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-target-queue-"));
    const applyCueHome = path.join(workspaceRoot, "applycue-home");
    const profileDir = path.join(applyCueHome, "profiles", "default");
    await mkdir(profileDir, { recursive: true });
    await writeFile(
      path.join(profileDir, "applycue.json"),
      JSON.stringify({
        profile: {
          name: "Target Queue Candidate",
          email: "target@example.com",
          currentDesignation: "Head of Product",
          currentCountry: "India"
        },
        preferences: {
          targetRoleTerms: ["vice president product"],
          targetIndustries: ["fintech"],
          preferredLocations: ["Remote India"],
          acceptableWorkModes: ["remote"],
          targetSeniorities: ["vp"],
          acceptableSeniorities: ["vp"],
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
            tags: ["vice president product", "product strategy", "roadmap", "fintech"],
            kind: "work"
          }
        ],
        sources: {
          jobBoards: [
            {
              id: "approved-vp-product-target",
              label: "Approved VP Product target search",
              provider: "jobspy",
              query: "vice president product",
              options: {
                siteNames: ["indeed"],
                location: "India",
                resultsWanted: 25,
                hoursOld: 720
              }
            }
          ]
        }
      }),
      "utf8"
    );
    const requests: Array<{ resultsWanted?: number; searchTerm?: string }> = [];

    const result = await runLocalOrSampleBatch({
      workspaceRoot,
      applyCueHome,
      generatedSourceExpansion: true,
      targetRankingQueue: 30,
      writeFiles: true,
      jobSpyRunner: async (request) => {
        requests.push({
          ...(typeof request.results_wanted === "number" ? { resultsWanted: request.results_wanted } : {}),
          ...(request.search_term ? { searchTerm: request.search_term } : {})
        });
        if (request.search_term !== "vice president product") return [];
        if (request.results_wanted === 25) {
          return Array.from({ length: 25 }, (_, index) => ({
            site: "indeed",
            title: `Vice President Product ${index + 1}`,
            company: `Target Queue Fintech ${index + 1}`,
            job_url: `https://careers.target-queue.test/jobs/vp-product-${index + 1}`,
            location: "Remote India",
            is_remote: true,
            job_type: "full_time",
            description: "Lead product strategy, roadmap, and fintech platform growth."
          }));
        }
        if (request.results_wanted === 35) {
          return [
            {
              site: "indeed",
              title: "Vice President Product Expansion",
              company: "Target Queue Expansion Fintech",
              job_url: "https://careers.target-queue.test/jobs/vp-product-expansion",
              location: "Remote India",
              is_remote: true,
              job_type: "full_time",
              description: "Lead product strategy, roadmap, and fintech platform growth."
            }
          ];
        }
        return [];
      }
    });

    expect(requests).toContainEqual(expect.objectContaining({ searchTerm: "vice president product", resultsWanted: 25 }));
    expect(requests).toContainEqual(expect.objectContaining({ searchTerm: "vice president product", resultsWanted: 35 }));
    expect(result.sourceQuality?.keptJobs).toBeGreaterThan(20);
    expect(result.jobs.map((job) => job.company)).toContain("Target Queue Expansion Fintech");
    expect(result.manifest.notes.some((note) => note.includes("Transient source expansion ran"))).toBe(true);
  });

  it("does not spend explicit-geo expansion on global no-location boards", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-expansion-explicit-geo-"));
    const applyCueHome = path.join(workspaceRoot, "applycue-home");
    const profileDir = path.join(applyCueHome, "profiles", "default");
    await mkdir(profileDir, { recursive: true });
    const coveredQueries = [
      "head of product",
      "head of product fintech",
      "vice president product",
      "vice president product fintech",
      "vice president product management",
      "vice president product management fintech"
    ];
    await writeFile(
      path.join(profileDir, "applycue.json"),
      JSON.stringify({
        profile: {
          name: "Explicit Geo Candidate",
          email: "explicit-geo@example.com",
          currentDesignation: "Head of Product",
          currentCountry: "India"
        },
        preferences: {
          targetRoleTerms: ["head of product"],
          targetIndustries: ["fintech"],
          preferredLocations: ["Remote India"],
          acceptableWorkModes: ["remote"],
          targetSeniorities: ["vp"],
          acceptableSeniorities: ["vp"],
          employmentTypes: ["full_time"],
          niceToHaveKeywords: ["product strategy", "roadmap"]
        },
        applySettings: {
          mode: "review",
          applicationsPerDay: 5,
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
          jobBoards: coveredQueries.map((query) => ({
            id: `covered-${query.replace(/[^a-z0-9]+/gi, "-")}`,
            label: `Covered ${query}`,
            provider: "jobspy",
            query,
            options: {
              siteNames: ["indeed"],
              location: "India",
              resultsWanted: 100,
              hoursOld: 999
            }
          }))
        }
      }),
      "utf8"
    );
    const fetchedUrls: string[] = [];

    const result = await runLocalOrSampleBatch({
      workspaceRoot,
      applyCueHome,
      generatedSourceExpansion: true,
      writeFiles: true,
      jobSpyRunner: async () => [],
      jobBoardFetchJson: async (url) => {
        fetchedUrls.push(String(url));
        return { jobs: [], page_count: 1, results: [] };
      }
    });

    expect(result.jobs).toHaveLength(0);
    expect(fetchedUrls).toEqual([]);
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

  it("records an agent job decision against the latest ranked queue and preserves hard gates", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-record-decision-"));
    const configPath = path.join(workspaceRoot, "config", "applycue.local.json");
    const queuePath = path.join(workspaceRoot, "config", "outputs", "runs", "latest-job-decisions.json");
    await mkdir(path.dirname(queuePath), { recursive: true });
    await writeFile(configPath, JSON.stringify({ profile: { name: "Decision Candidate" } }), "utf8");
    await writeFile(queuePath, JSON.stringify({
      runId: "decision-test-run",
      profileId: "decision-candidate",
      generatedAt: "2026-07-10T09:59:00.000Z",
      queueCount: 2,
      decisions: [{
        jobId: "job-clear",
        company: "Clear Co",
        title: "Product Lead",
        sourceName: "ATS",
        decision: "review",
        reasons: ["Backend fit was promising."],
        failedGates: [],
        nextStep: "Review and prepare before submit."
      },
      {
        jobId: "job-blocked",
        company: "Blocked Co",
        title: "Product Lead",
        sourceName: "ATS",
        decision: "skip",
        reasons: ["Portal is blocked."],
        failedGates: ["blocked-portal: User policy blocks this portal."],
        nextStep: "Skipped until the blocker is resolved."
      }]
    }), "utf8");

    const result = await recordJobDecision({
      workspaceRoot,
      applyCueHome: path.join(workspaceRoot, "empty-applycue-home"),
      actorName: "codex",
      decision: "apply",
      evidenceRefs: ["agent-review:job-clear"],
      jobId: "job-clear",
      reasons: ["The CV evidence supports the must-have requirements."],
      decidedAt: "2026-07-10T10:00:00.000Z"
    });

    expect(result.decision).toMatchObject({
      actorKind: "agent",
      actorName: "codex",
      backendDecision: "review",
      decision: "apply",
      jobId: "job-clear"
    });
    expect(result.decision.evidenceRefs).toContain("outputs/runs/latest-job-decisions.json");
    expect(await readFile(result.decisionsPath, "utf8")).toContain("agent-review:job-clear");

    await expect(recordJobDecision({
      workspaceRoot,
      applyCueHome: path.join(workspaceRoot, "empty-applycue-home"),
      actorName: "claude",
      decision: "apply",
      jobId: "job-blocked",
      reasons: ["Would otherwise be a strong match."]
    })).rejects.toThrow("hard gates failed");
  });

  it("records reviewed decisions atomically and skips an unchanged retry", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-record-decisions-"));
    const configPath = path.join(workspaceRoot, "config", "applycue.local.json");
    const queuePath = path.join(workspaceRoot, "config", "outputs", "runs", "latest-job-decisions.json");
    await mkdir(path.dirname(queuePath), { recursive: true });
    await writeFile(configPath, JSON.stringify({ profile: { name: "Batch Candidate" } }), "utf8");
    await writeFile(queuePath, JSON.stringify({
      runId: "batch-decision-test-run",
      profileId: "batch-candidate",
      generatedAt: "2026-07-11T09:00:00.000Z",
      queueCount: 3,
      decisions: [
        { jobId: "job-a", company: "A", title: "Product Lead", sourceName: "ATS", decision: "review", reasons: ["Promising."], failedGates: [], nextStep: "Review." },
        { jobId: "job-b", company: "B", title: "Product Director", sourceName: "ATS", decision: "apply", reasons: ["Strong."], failedGates: [], nextStep: "Apply." },
        { jobId: "job-blocked", company: "C", title: "Product VP", sourceName: "ATS", decision: "skip", reasons: ["Blocked."], failedGates: ["portal: blocked"], nextStep: "Skip." }
      ]
    }), "utf8");

    const decisions = [
      { jobId: "job-a", decision: "apply" as const, reasons: ["Approved profile evidence covers the requirements."] },
      { jobId: "job-b", decision: "watch" as const, reasons: ["Good role, but not in today's top batch."] }
    ];
    const first = await recordJobDecisions({
      workspaceRoot,
      applyCueHome: path.join(workspaceRoot, "empty-applycue-home"),
      actorName: "codex",
      decisions
    });
    expect(first.recordedCount).toBe(2);
    expect(first.skippedCount).toBe(0);

    const retry = await recordJobDecisions({
      workspaceRoot,
      applyCueHome: path.join(workspaceRoot, "empty-applycue-home"),
      actorName: "codex",
      decisions
    });
    expect(retry.recordedCount).toBe(0);
    expect(retry.skippedCount).toBe(2);
    const beforeBlockedAttempt = await readFile(first.decisionsPath, "utf8");

    await expect(recordJobDecisions({
      workspaceRoot,
      applyCueHome: path.join(workspaceRoot, "empty-applycue-home"),
      actorName: "codex",
      decisions: [
        { jobId: "job-a", decision: "watch", reasons: ["Changed judgement."] },
        { jobId: "job-blocked", decision: "apply", reasons: ["Would be attractive without the hard gate."] }
      ]
    })).rejects.toThrow("hard gates failed");
    expect(await readFile(first.decisionsPath, "utf8")).toBe(beforeBlockedAttempt);
  });

  it("records user and agent tuning signals without editing active config", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-record-tuning-"));
    const configPath = path.join(workspaceRoot, "config", "applycue.local.json");
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify({
        profile: {
          name: "Tuning Candidate",
          email: "tuning@example.com"
        },
        preferences: {
          targetRoleTerms: ["head of product"]
        }
      }),
      "utf8"
    );
    const originalConfig = await readFile(configPath, "utf8");

    const agentSignal = await recordTuningSignal({
      workspaceRoot,
      applyCueHome: path.join(workspaceRoot, "empty-applycue-home"),
      origin: "agent_analysis",
      target: "title_variant",
      action: "promote",
      value: "group product manager",
      reason: "Several senior product jobs use this title in large companies.",
      confidence: "medium",
      evidenceRefs: ["outputs/runs/latest-summary.md"],
      createdAt: "2026-07-07T11:00:00.000Z"
    });

    const userSignal = await recordTuningSignal({
      workspaceRoot,
      applyCueHome: path.join(workspaceRoot, "empty-applycue-home"),
      origin: "user_feedback",
      target: "role_term",
      action: "block",
      value: "product marketing",
      reason: "User said this is not a target role.",
      approvedByUser: true,
      createdAt: "2026-07-07T11:05:00.000Z"
    });

    expect(agentSignal.tuningSignalsPath).toBe(path.join(workspaceRoot, "config", "data", "local", "tuning-signals.jsonl"));
    expect(agentSignal.signal.status).toBe("proposed");
    expect(userSignal.signal.status).toBe("approved");
    expect(await readFile(configPath, "utf8")).toBe(originalConfig);
    const rows = (await readFile(agentSignal.tuningSignalsPath, "utf8")).trim().split(/\r?\n/).map((row) => JSON.parse(row));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      origin: "agent_analysis",
      target: "title_variant",
      action: "promote",
      value: "group product manager",
      status: "proposed"
    });
    expect(rows[1]).toMatchObject({
      origin: "user_feedback",
      target: "role_term",
      action: "block",
      value: "product marketing",
      status: "approved",
      approvedByUser: true
    });
  });

  it("applies approved tuning signals into editable config with dry-run support", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-apply-tuning-"));
    const configPath = path.join(workspaceRoot, "config", "applycue.local.json");
    const tuningSignalsPath = path.join(workspaceRoot, "config", "data", "local", "tuning-signals.jsonl");
    await mkdir(path.dirname(configPath), { recursive: true });
    await mkdir(path.dirname(tuningSignalsPath), { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify({
        profile: {
          name: "Tuning Apply Candidate",
          email: "tuning-apply@example.com"
        },
        preferences: {
          targetRoleTerms: ["head of product"],
          noGoRoleTerms: [],
          targetIndustries: ["fintech"]
        },
        sourceSettings: {
          trustedPortals: [],
          askBeforePortals: [],
          blockedPortals: []
        }
      }),
      "utf8"
    );
    await writeFile(
      tuningSignalsPath,
      [
        {
          id: "signal-approved-title",
          origin: "user_feedback",
          target: "title_variant",
          action: "promote",
          value: "group product manager",
          reason: "User approved this as a relevant senior title variant.",
          status: "approved",
          approvedByUser: true,
          createdAt: "2026-07-07T12:00:00.000Z"
        },
        {
          id: "signal-block-role",
          origin: "user_feedback",
          target: "role_term",
          action: "block",
          value: "product marketing",
          reason: "User said this is not a target role.",
          status: "approved",
          approvedByUser: true,
          createdAt: "2026-07-07T12:05:00.000Z"
        },
        {
          id: "signal-proposed-industry",
          origin: "agent_analysis",
          target: "industry",
          action: "promote",
          value: "healthtech",
          reason: "Agent saw several interesting roles, but user has not approved yet.",
          status: "proposed",
          createdAt: "2026-07-07T12:10:00.000Z"
        },
        {
          id: "signal-block-source",
          origin: "user_feedback",
          target: "source",
          action: "block",
          value: "noisy.example",
          reason: "User marked this portal as noisy.",
          status: "approved",
          approvedByUser: true,
          createdAt: "2026-07-07T12:15:00.000Z"
        },
        {
          id: "signal-unsupported-seniority",
          origin: "agent_analysis",
          target: "seniority",
          action: "promote",
          value: "large-company principal maps to director",
          reason: "Needs human interpretation before becoming reusable config.",
          status: "approved",
          createdAt: "2026-07-07T12:20:00.000Z"
        }
      ].map((row) => JSON.stringify(row)).join("\n"),
      "utf8"
    );
    const originalConfig = await readFile(configPath, "utf8");

    const dryRun = await applyTuningSignals({
      workspaceRoot,
      applyCueHome: path.join(workspaceRoot, "empty-applycue-home"),
      dryRun: true,
      applyAll: true
    });

    expect(dryRun.appliedCount).toBe(3);
    expect(dryRun.skippedCount).toBe(2);
    expect(await readFile(configPath, "utf8")).toBe(originalConfig);

    const applied = await applyTuningSignals({
      workspaceRoot,
      applyCueHome: path.join(workspaceRoot, "empty-applycue-home"),
      applyAll: true
    });

    expect(applied.appliedCount).toBe(3);
    expect(applied.updates.find((update) => update.signalId === "signal-proposed-industry")?.status).toBe("skipped");
    expect(applied.updates.find((update) => update.signalId === "signal-unsupported-seniority")?.status).toBe("skipped");
    const updatedConfig = JSON.parse(await readFile(configPath, "utf8")) as {
      preferences?: {
        targetRoleTerms?: string[];
        noGoRoleTerms?: string[];
        targetIndustries?: string[];
      };
      sourceSettings?: {
        blockedPortals?: string[];
      };
    };
    expect(updatedConfig.preferences?.targetRoleTerms).toEqual(["head of product", "group product manager"]);
    expect(updatedConfig.preferences?.noGoRoleTerms).toEqual(["product marketing"]);
    expect(updatedConfig.preferences?.targetIndustries).toEqual(["fintech"]);
    expect(updatedConfig.sourceSettings?.blockedPortals).toEqual(["noisy.example"]);

    const secondRun = await applyTuningSignals({
      workspaceRoot,
      applyCueHome: path.join(workspaceRoot, "empty-applycue-home"),
      applyAll: true
    });

    expect(secondRun.appliedCount).toBe(0);
    expect(secondRun.skippedCount).toBe(5);
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

  it("loads approved JobHive ATS directory sources from search config", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-ats-directory-"));
    await mkdir(path.join(workspaceRoot, "config"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, "config", "applycue.local.json"),
      JSON.stringify({
        profile: {
          name: "JobHive Candidate",
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
              label: "JobHive ATS directory scan",
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
      atsDirectoryFetchText: async (url) => {
        expect(url).toBe("https://storage.stapply.ai/jobhive/v1/greenhouse/companies.csv");
        return "name,slug,url\nReverse Fintech,reversefintech,https://job-boards.greenhouse.io/reversefintech\n";
      },
      atsDirectoryFetchJson: async (url) => {
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
    expect(result.jobs[0]?.company).toBe("Reverse Fintech");
    expect(result.cvVariants).toHaveLength(1);
    expect(result.manifest.notes).toContain("Loaded 1 job(s) from 1 ATS directory source(s).");
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
    expect(result.manifest.sourceQuality).toEqual(
      expect.objectContaining({
        inputJobs: 2,
        keptJobs: 1,
        filteredJobs: 1,
        byReason: {
          title: 1,
          industry: 0,
          location: 0,
          content: 0
        },
        examplesByReason: expect.objectContaining({
          title: [
            "Remote Engineering Co - Principal Engineer, Full Stack, VP, Worldwide via Remotive product (remotive): Title matched an obvious non-target role family."
          ]
        })
      })
    );
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
    expect(second.manifest.dedupe?.alreadyHandledRepeats).toBe(2);
    expect(second.manifest.dedupe?.totalAvoided).toBe(2);
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

  it("explains low batch volume through source filters without seniority hard blocks by default", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-funnel-health-"));
    const profile: UserProfile = {
      id: "funnel-health-user",
      currentLevel: "vp",
      totalExperienceYears: 16,
      currentDesignation: "VP Product",
      pastEmployers: [],
      preferences: {
        targetRoleTerms: ["vp product", "head of product", "product management"],
        adjacentRoleTerms: [],
        targetIndustries: ["fintech"],
        excludedIndustries: [],
        preferredLocations: ["india"],
        extraLocations: [],
        askBeforeLocations: [],
        acceptableWorkModes: ["remote", "hybrid", "onsite"],
        targetSeniorities: ["vp"],
        acceptableSeniorities: ["vp", "c_level"],
        employmentTypes: ["full_time"],
        companyStages: [],
        preferredCompanyNames: [],
        blockedCompanyNames: [],
        noGoRoleTerms: [],
        requiredKeywords: [],
        niceToHaveKeywords: ["product strategy", "payments"],
        excludedKeywords: [],
        workAuthorizationCountries: ["india"],
        preferredTimezones: []
      },
      searchSettings: {
        searchCountries: ["india"],
        searchAreas: ["india"],
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
        minimumFitToApply: 0.65,
        allowedSourceKinds: ["manual", "job_board"],
        messagePolicy: "draft_only",
        pauseReasons: ["unsupported_cv_claim"],
        trackEmailReplies: false,
        allowRecruiterDmDrafts: false
      },
      matchSettings: {
        range: "normal",
        widenIfFewerThan: 10,
        relaxOrder: ["source", "title", "location", "minimum_fit"],
        minimumFitFloor: 0.5,
        allowAdjacentTitles: false,
        allowAdjacentIndustries: false
      },
      proofBank: [
        {
          id: "proof-vp-product",
          claim: "Led VP Product work across product strategy and payments.",
          evidence: "Approved profile proof covers VP Product, product strategy, fintech, and payments.",
          tags: ["vp product", "product management", "product strategy", "fintech", "payments"],
          kind: "work"
        }
      ]
    };
    const jobs: JobRecord[] = [
      {
        id: "vp-product",
        source: { id: "job-board", kind: "job_board", name: "Board" },
        company: "Good Fintech",
        title: "VP Product",
        url: "https://example.com/vp",
        description: "Lead product strategy and payments for fintech.",
        location: "India",
        workMode: "hybrid",
        seniority: "vp",
        employmentType: "full_time",
        discoveredAt: "2026-07-05T00:00:00.000Z",
        liveState: "live"
      },
      {
        id: "senior-pm",
        source: { id: "job-board", kind: "job_board", name: "Board" },
        company: "Large Employer",
        title: "Senior Product Manager",
        url: "https://example.com/spm",
        description: "Own product management and product strategy for fintech.",
        location: "India",
        workMode: "hybrid",
        seniority: "manager",
        employmentType: "full_time",
        discoveredAt: "2026-07-05T00:00:00.000Z",
        liveState: "live"
      },
      {
        id: "product-manager",
        source: { id: "job-board", kind: "job_board", name: "Board" },
        company: "Smaller Co",
        title: "Product Manager",
        url: "https://example.com/pm",
        description: "Own product management and payments.",
        location: "India",
        workMode: "hybrid",
        seniority: "manager",
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
      runId: "funnel-health",
      kind: "daily_batch",
      writeFiles: false,
      sourceQuality: {
        inputJobs: 150,
        keptJobs: 3,
        filteredJobs: 147,
        byReason: {
          title: 120,
          industry: 0,
          location: 20,
          content: 7
        }
      }
    });

    expect(result.applications).toHaveLength(3);
    expect(result.manifest.funnelHealth?.status).toBe("low_volume");
    expect(result.manifest.funnelHealth?.dominantFilters[0]).toEqual(
      expect.objectContaining({ id: "title", count: 120 })
    );
    expect(result.manifest.funnelHealth?.dominantGateBlocks.some((item) => item.id === "seniority")).toBe(false);
    expect(result.manifest.funnelHealth?.suggestedActions.join(" ")).toContain("More results option");
    expect(result.manifest.funnelHealth?.suggestedActions.join(" ")).toContain("search more public job boards");
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
    expect(result.manifest.notes).toContain("Skipped 1 candidate CV(s) because reconciliation or CV completeness did not pass.");
    const blockedDecision = result.jobDecisions.find((decision) => decision.company === "Blocked Product Co");
    expect(blockedDecision?.reconciliationStatus).toBe("blocked");
    expect(blockedDecision?.skippedReason).toContain("Unsupported requirement must not be claimed");
    expect(blockedDecision?.nextStep).toBe("Skipped until CV reconciliation passes.");
  });

  it("skips candidates whose generated CV fails completeness", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "applycue-engine-cv-quality-skip-"));
    const profile = createProfile({
      id: "thin-cv-user",
      name: "Thin CV Candidate",
      baseCvText: `Thin CV Candidate\n\n${"Long base CV evidence line.\n".repeat(260)}`,
      preferences: {
        targetRoleTerms: ["head of product"],
        targetIndustries: ["fintech"],
        acceptableWorkModes: ["remote", "unknown"],
        employmentTypes: ["full_time"],
        niceToHaveKeywords: ["product strategy"]
      },
      applySettings: {
        mode: "review",
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
          tags: ["product strategy", "fintech"],
          kind: "work"
        }
      ]
    });
    const jobs: JobRecord[] = [
      {
        id: "thin-cv-job",
        source: { id: "manual", kind: "manual", name: "Manual" },
        company: "Thin CV Co",
        title: "Head of Product",
        url: "https://example.com/thin-cv",
        description: "Lead product strategy for fintech.",
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
      runId: "thin-cv-skip",
      kind: "daily_batch",
      writeFiles: false
    });

    expect(result.applications).toHaveLength(0);
    expect(result.cvVariants).toHaveLength(0);
    expect(result.manifest.notes).toContain("Skipped 1 candidate CV(s) because reconciliation or CV completeness did not pass.");
    const skippedDecision = result.jobDecisions.find((decision) => decision.jobId === "thin-cv-job");
    expect(skippedDecision?.skippedReason).toContain("Generated CV failed completeness");
    expect(skippedDecision?.nextStep).toBe("Skipped until the generated CV meets completeness checks.");
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
    expect(updatedConfig.sources.searches ?? []).toHaveLength(0);
    expect(updatedConfig.sources.jobBoards).toHaveLength(1);
    expect(updatedConfig.sources.jobBoards?.[0]?.sourceSuggestionId).toBe(jobSpy?.id);
    expect(updatedConfig.sources.jobBoards?.[0]?.provider).toBe("jobspy");
    expect((updatedConfig.sources.jobBoards?.[0]?.options as { siteNames?: string[] } | undefined)?.siteNames).toEqual([
      "indeed",
      "google",
      "naukri"
    ]);
    expect(updatedConfig.sources.loggedInBrowserSources).toHaveLength(2);
    expect(updatedConfig.sources.loggedInBrowserSources?.map((source) => source.sourceSuggestionId)).toEqual(
      expect.arrayContaining([greenhouse?.id, linkedIn?.id])
    );
    expect(updatedConfig.sources.loggedInBrowserSources?.[0]?.origin).toBe("system_generated");

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
