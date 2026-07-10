import type { BrowserPageSnapshot, PlaywrightLikeLocator, PlaywrightLikePage } from "@applycue/browser-agent";
import type { ApplicationDraft, BrowserApplyPlan } from "@applycue/core";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SampleBatchResult } from "@applycue/engine";
import { runLiveBrowserApply } from "./live-apply.js";
import { writeMasterFormDataReport } from "./master-form-data.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("live browser apply", () => {
  it("blocks before launching the browser when master form data is not confirmed", async () => {
    const outputRoot = await tempOutputRoot();
    await writeFile(path.join(outputRoot, "outputs", "cvs", "cv.docx"), "PK fake docx", "utf8");
    await writePreflightReport(outputRoot, {
      selectedPlanId: "example-live-plan",
      selectedJobId: "job-1",
      status: "pass"
    });
    const events: string[] = [];
    const report = await runLiveBrowserApply({
      batch: {
        browserPlans: [samplePlan()],
        drafts: [sampleDraft()],
        outputRoot
      },
      playwright: fakePlaywright(events, passSnapshot())
    });

    expect(report.status).toBe("fail");
    expect(report.summary).toContain("confirm master form data");
    expect(report.checks.some((check) => check.id === "master-form-data" && check.status === "fail")).toBe(true);
    expect(events).toEqual([]);
  });

  it("blocks without launching the browser when current live preflight is missing", async () => {
    const outputRoot = await tempOutputRoot();
    await writeFile(path.join(outputRoot, "outputs", "cvs", "cv.docx"), "PK fake docx", "utf8");
    await confirmMasterFormData(outputRoot);
    const events: string[] = [];
    const report = await runLiveBrowserApply({
      batch: {
        browserPlans: [samplePlan()],
        drafts: [sampleDraft()],
        outputRoot
      },
      playwright: fakePlaywright(events, passSnapshot())
    });

    expect(report.status).toBe("fail");
    expect(report.summary).toContain("current passing live preflight");
    expect(events).toEqual([]);
  });

  it("fills, uploads, and pauses when live preflight passed for the selected plan", async () => {
    const outputRoot = await tempOutputRoot();
    await writeFile(path.join(outputRoot, "outputs", "cvs", "cv.docx"), "PK fake docx", "utf8");
    await writePreflightReport(outputRoot, {
      selectedPlanId: "example-live-plan",
      selectedJobId: "job-1",
      status: "pass"
    });
    await confirmMasterFormData(outputRoot);
    const events: string[] = [];
    const report = await runLiveBrowserApply({
      batch: {
        browserPlans: [samplePlan()],
        drafts: [sampleDraft()],
        outputRoot
      },
      playwright: fakePlaywright(events, passSnapshot())
    });

    expect(report.status).toBe("pass");
    expect(report.resultStatus).toBe("paused");
    expect(report.receiptStatus).toBe("paused");
    expect(report.summary).toContain("uploaded the generated DOCX");
    expect(events).toContain("goto:https://boards.greenhouse.io/example/jobs/123");
    expect(events.some((event) => event.startsWith("fill:"))).toBe(true);
    expect(events.some((event) => event.startsWith("files:"))).toBe(true);
    expect(events.some((event) => event.startsWith("click:"))).toBe(false);
    expect(await readFile(report.paths.receipt, "utf8")).toContain('"status": "paused"');
    expect(await readFile(report.paths.plan, "utf8")).toContain('"canSubmit": false');
  });

  it("blocks stale passing preflight for a different browser plan", async () => {
    const outputRoot = await tempOutputRoot();
    await writeFile(path.join(outputRoot, "outputs", "cvs", "cv.docx"), "PK fake docx", "utf8");
    await writePreflightReport(outputRoot, {
      selectedPlanId: "old-plan",
      selectedJobId: "old-job",
      status: "pass"
    });
    await confirmMasterFormData(outputRoot);
    const events: string[] = [];
    const report = await runLiveBrowserApply({
      batch: {
        browserPlans: [samplePlan()],
        drafts: [sampleDraft()],
        outputRoot
      },
      planId: "example-live-plan",
      playwright: fakePlaywright(events, passSnapshot())
    });

    expect(report.status).toBe("fail");
    expect(report.checks.some((check) => check.id === "live-preflight-current" && check.status === "fail")).toBe(true);
    expect(events).toEqual([]);
  });

  it("records a submitted outcome after an allowed live submit", async () => {
    const outputRoot = await tempOutputRoot();
    await mkdir(path.join(outputRoot, "outputs", "dashboard"), { recursive: true });
    await mkdir(path.join(outputRoot, "outputs", "runs"), { recursive: true });
    await writeFile(path.join(outputRoot, "outputs", "cvs", "cv.docx"), "PK fake docx", "utf8");
    await writePreflightReport(outputRoot, {
      selectedPlanId: "example-live-plan",
      selectedJobId: "job-1",
      status: "pass"
    });
    await confirmMasterFormData(outputRoot);
    const plan = sampleSubmitPlan();
    const events: string[] = [];
    const report = await runLiveBrowserApply({
      allowSubmit: true,
      batch: fullBatch(outputRoot, plan),
      playwright: fakePlaywright(events, passSnapshot())
    });

    expect(report.status).toBe("pass");
    expect(report.resultStatus).toBe("submitted");
    expect(report.receiptStatus).toBe("submitted");
    expect(report.paths.outcomes).toBe(path.join(outputRoot, "data", "local", "outcomes.jsonl"));
    expect(report.checks.find((check) => check.id === "outcome-event")?.detail).toContain("Recorded submitted outcome");
    expect(events.some((event) => event.startsWith("click:"))).toBe(true);

    const outcomes = await readFile(path.join(outputRoot, "data", "local", "outcomes.jsonl"), "utf8");
    expect(outcomes).toContain('"applicationId":"application-1"');
    expect(outcomes).toContain('"type":"submitted"');
    const summary = await readFile(path.join(outputRoot, "outputs", "runs", "latest-summary.md"), "utf8");
    expect(summary).toContain("- Submitted or confirmed: 1");
    expect(summary).toContain("- Monitor email for application confirmation or recruiter replies.");
    expect(summary).not.toContain("Record the submission outcome");
  });
});

async function tempOutputRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "applycue-live-apply-test-"));
  tempDirs.push(root);
  await mkdir(path.join(root, "outputs", "cvs"), { recursive: true });
  await mkdir(path.join(root, "outputs", "live-preflight"), { recursive: true });
  return root;
}

async function writePreflightReport(
  outputRoot: string,
  input: { selectedJobId: string; selectedPlanId: string; status: "pass" | "pause" | "fail" | "skipped" }
): Promise<void> {
  const livePreflightDir = path.join(outputRoot, "outputs", "live-preflight");
  await writeFile(
    path.join(livePreflightDir, "live-preflight-report.json"),
    JSON.stringify({
      id: "applycue-live-browser-preflight",
      status: input.status,
      generatedAt: "2026-07-06T00:03:00.000Z",
      selectedPlanId: input.selectedPlanId,
      selectedJobId: input.selectedJobId,
      selectedCompany: "Example",
      selectedRoleTitle: "Example Role",
      checkedUrl: "https://boards.greenhouse.io/example/jobs/123",
      answerPrompts: [],
      checks: [],
      paths: {
        answerApprovalTemplate: path.join(livePreflightDir, "live-answer-approval-template.json"),
        answerPrompts: path.join(livePreflightDir, "live-answer-prompts.json"),
        answerPromptsHtml: path.join(livePreflightDir, "live-answer-prompts.html"),
        answerPromptsMarkdown: path.join(livePreflightDir, "live-answer-prompts.md"),
        markdownReport: path.join(livePreflightDir, "live-preflight-report.md"),
        preflight: path.join(livePreflightDir, "live-preflight-result.json"),
        report: path.join(livePreflightDir, "live-preflight-report.json"),
        snapshot: path.join(livePreflightDir, "live-page-snapshot.json")
      },
      summary: "Live browser preflight passed for Example - Example Role."
    }),
    "utf8"
  );
}

async function confirmMasterFormData(outputRoot: string): Promise<void> {
  await writeMasterFormDataReport({ drafts: [sampleDraft()], outputRoot }, { confirm: true });
}

function sampleDraft(): ApplicationDraft {
  return {
    jobId: "job-1",
    cvVariantId: "cv-1",
    answers: [
      {
        field: "name",
        value: "Sample Candidate",
        needsApproval: false,
        aliases: ["Full name"],
        sourceRef: "profile.contact.name"
      },
      {
        field: "email",
        value: "sample@example.com",
        needsApproval: false,
        aliases: ["Email address"],
        sourceRef: "profile.contact.email"
      },
      {
        field: "final_submit",
        value: "Pause before submit.",
        needsApproval: true,
        sourceRef: "applySettings"
      }
    ],
    submitRequiresApproval: true,
    canAutoSubmit: false,
    applyMode: "review",
    pauseReasons: ["missing_required_answer"]
  };
}

function samplePlan(): BrowserApplyPlan {
  return {
    id: "example-live-plan",
    jobId: "job-1",
    url: "https://boards.greenhouse.io/example/jobs/123",
    company: "Example",
    roleTitle: "Example Role",
    applyMode: "review",
    canSubmit: false,
    submitRequiresApproval: true,
    pauseReasons: ["user_approval_required"],
    actions: [
      {
        id: "job-1-open",
        type: "open_url",
        label: "Open application page",
        target: "https://boards.greenhouse.io/example/jobs/123",
        value: "https://boards.greenhouse.io/example/jobs/123",
        requiresApproval: false
      },
      {
        id: "job-1-fill-name",
        type: "fill_field",
        label: "Fill name",
        target: "name",
        value: "Sample Candidate",
        requiresApproval: false
      },
      {
        id: "job-1-upload",
        type: "upload_file",
        label: "Upload generated CV",
        target: "resume_or_cv",
        value: "outputs/cvs/cv.docx",
        requiresApproval: false
      },
      {
        id: "job-1-pause",
        type: "pause",
        label: "Pause before final submit",
        value: "user_approval_required",
        pauseReason: "user_approval_required",
        requiresApproval: true
      }
    ],
    createdAt: "2026-07-06T00:00:00.000Z",
    cvVariantId: "cv-1",
    cvPath: "outputs/cvs/cv.docx"
  };
}

function sampleSubmitPlan(): BrowserApplyPlan {
  return {
    ...samplePlan(),
    applyMode: "daily",
    canSubmit: true,
    submitRequiresApproval: false,
    pauseReasons: [],
    actions: [
      ...samplePlan().actions.filter((action) => action.type !== "pause"),
      {
        id: "job-1-submit",
        type: "submit",
        label: "Submit application",
        requiresApproval: false
      },
      {
        id: "job-1-capture-receipt",
        type: "capture_receipt",
        label: "Capture receipt",
        requiresApproval: false
      }
    ]
  };
}

function fullBatch(outputRoot: string, plan: BrowserApplyPlan): SampleBatchResult {
  return {
    applications: [{
      id: "application-1",
      jobId: "job-1",
      status: "prepared",
      cvVariantId: "cv-1",
      notes: ["Prepared by test."],
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z"
    }],
    applyRoutes: [{
      id: "application-1-apply-route",
      applicationId: "application-1",
      jobId: "job-1",
      type: "browser",
      status: "needs_preflight",
      label: "Browser apply",
      reason: "Test browser route.",
      canSubmit: plan.canSubmit,
      submitRequiresApproval: plan.submitRequiresApproval,
      pauseReasons: plan.pauseReasons,
      createdAt: "2026-07-06T00:00:00.000Z",
      artifacts: {
        browserPlanId: plan.id,
        cvPath: "outputs/cvs/cv.docx"
      },
      execution: {
        browser: {
          planId: plan.id,
          preflightCommand: `pnpm applycue:browser-live-preflight -- --plan-id ${plan.id}`,
          applyCommand: `pnpm applycue:browser-live-apply -- --plan-id ${plan.id}`
        }
      },
      notes: ["Test route."]
    }],
    atsDiagnosticReports: [],
    browserPlans: [plan],
    cvDocxs: [],
    cvHtmls: [],
    cvMarkdowns: [],
    cvVariants: [],
    drafts: [sampleDraft()],
    jobs: [{
      id: "job-1",
      source: {
        id: "greenhouse-example",
        kind: "ats",
        name: "Greenhouse Example",
        url: "https://boards.greenhouse.io/example/jobs/123"
      },
      company: "Example",
      title: "Example Role",
      url: "https://boards.greenhouse.io/example/jobs/123",
      description: "Example is hiring for Example Role.",
      workMode: "remote",
      discoveredAt: "2026-07-06T00:00:00.000Z",
      liveState: "live"
    }],
    jobDecisions: [],
    manifest: {
      id: "local-first-build",
      kind: "daily_batch",
      startedAt: "2026-07-06T00:00:00.000Z",
      completedAt: "2026-07-06T00:00:00.000Z",
      profileId: "profile-1",
      jobIds: ["job-1"],
      cvVariantIds: ["cv-1"],
      applicationIds: ["application-1"],
      generatedFiles: [],
      sourceCodeWriteCount: 0,
      notes: ["Test run."]
    },
    outputRoot,
    pendingQuestions: [],
    profile: {
      id: "profile-1",
      pastEmployers: [],
      preferences: {
        targetRoleTerms: ["product"],
        adjacentRoleTerms: [],
        targetIndustries: [],
        excludedIndustries: [],
        preferredLocations: [],
        extraLocations: [],
        askBeforeLocations: [],
        acceptableWorkModes: ["remote"],
        targetSeniorities: ["vp"],
        acceptableSeniorities: ["vp"],
        employmentTypes: ["full_time"],
        companyStages: [],
        preferredCompanyNames: [],
        blockedCompanyNames: [],
        noGoRoleTerms: [],
        requiredKeywords: [],
        niceToHaveKeywords: [],
        excludedKeywords: [],
        workAuthorizationCountries: [],
        preferredTimezones: []
      },
      searchSettings: {
        searchCountries: [],
        searchAreas: [],
        remoteRegions: [],
        agentMayExpandSearchArea: false,
        informUserOnSearchAreaChange: true,
        standardHoursOnly: true,
        preferredShifts: [],
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
        applicationsPerDay: 1,
        minimumFitToApply: 0,
        allowedSourceKinds: ["ats"],
        messagePolicy: "draft_only",
        pauseReasons: [],
        trackEmailReplies: false,
        allowRecruiterDmDrafts: false
      },
      matchSettings: {
        range: "normal",
        widenIfFewerThan: 1,
        relaxOrder: [],
        minimumFitFloor: 0,
        allowAdjacentTitles: false,
        allowAdjacentIndustries: false
      },
      proofBank: []
    },
    progressItems: [{
      applicationId: "application-1",
      jobId: "job-1",
      company: "Example",
      title: "Example Role",
      status: "prepared",
      browserPlanPath: "outputs/browser-plans/example-live-plan.json",
      cvVariantId: "cv-1",
      canAutoSubmit: true,
      submitRequiresApproval: false,
      pauseReasons: [],
      nextStep: "Ready to submit under configured policy."
    }],
    reconciliationReports: [],
    sourcePlan: {
      id: "source-plan-1",
      profileId: "profile-1",
      generatedAt: "2026-07-06T00:00:00.000Z",
      status: "generated_for_review",
      generatedFrom: {
        targetRoleTerms: ["product"],
        targetIndustries: [],
        preferredLocations: [],
        extraLocations: [],
        preferredCompanyNames: []
      },
      searchProfile: {
        titleFilter: { positive: [], negative: [], seniorityBoost: [] },
        locationFilter: { alwaysAllow: [], allow: [], askBefore: [], block: [] },
        contentFilter: { required: [], targetIndustries: [], positive: [], negative: [] },
        sourceHints: {
          preferredCompanies: [],
          blockedCompanies: [],
          trustedPortals: [],
          askBeforePortals: [],
          blockedPortals: [],
          fraudSignalTerms: []
        },
        notes: []
      },
      suggestions: [],
      notes: []
    }
  };
}

function passSnapshot(): BrowserPageSnapshot {
  return {
    applyControls: ["Submit application"],
    fields: [
      { label: "Full name", name: "name", required: true, type: "text" },
      { label: "Resume", name: "resume_or_cv", required: true, type: "file" }
    ],
    finalUrl: "https://boards.greenhouse.io/example/jobs/123",
    pageText: "Example is hiring for Example Role. Apply now.",
    title: "Example Role - Example",
    visibleCompany: "Example",
    visibleRole: "Example Role"
  };
}

function fakePlaywright(events: string[], snapshot: BrowserPageSnapshot) {
  return {
    chromium: {
      async launch() {
        return new FakeBrowser(events, snapshot);
      }
    }
  };
}

class FakeBrowser {
  constructor(
    private readonly events: string[],
    private readonly snapshot: BrowserPageSnapshot
  ) {}

  async newPage(): Promise<PlaywrightLikePage> {
    return new FakePage(this.events, this.snapshot);
  }

  async close(): Promise<unknown> {
    this.events.push("browser:close");
    return undefined;
  }
}

class FakePage implements PlaywrightLikePage {
  private currentUrl = "about:blank";

  constructor(
    private readonly events: string[],
    private readonly snapshot: BrowserPageSnapshot
  ) {}

  async evaluate<T = unknown>(): Promise<T> {
    this.events.push("evaluate");
    return {
      ...this.snapshot,
      finalUrl: this.currentUrl
    } as T;
  }

  async goto(url: string): Promise<unknown> {
    this.currentUrl = url;
    this.events.push(`goto:${url}`);
    return undefined;
  }

  locator(selector: string): PlaywrightLikeLocator {
    return new FakeLocator(selector, this.events);
  }

  async title(): Promise<string> {
    this.events.push("title");
    return this.snapshot.title ?? "";
  }

  url(): string {
    return this.currentUrl;
  }
}

class FakeLocator implements PlaywrightLikeLocator {
  constructor(
    private readonly selector: string,
    private readonly events: string[]
  ) {}

  async click(): Promise<unknown> {
    this.events.push(`click:${this.selector}`);
    return undefined;
  }

  async fill(value: string): Promise<unknown> {
    this.events.push(`fill:${this.selector}=${value}`);
    return undefined;
  }

  async setInputFiles(filePath: string | string[]): Promise<unknown> {
    this.events.push(`files:${this.selector}=${Array.isArray(filePath) ? filePath.join(",") : filePath}`);
    return undefined;
  }
}
