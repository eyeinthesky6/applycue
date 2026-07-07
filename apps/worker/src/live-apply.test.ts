import type { BrowserPageSnapshot, PlaywrightLikeLocator, PlaywrightLikePage } from "@applycue/browser-agent";
import type { BrowserApplyPlan } from "@applycue/core";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runLiveBrowserApply } from "./live-apply.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("live browser apply", () => {
  it("blocks without launching the browser when current live preflight is missing", async () => {
    const outputRoot = await tempOutputRoot();
    await writeFile(path.join(outputRoot, "outputs", "cvs", "cv.docx"), "PK fake docx", "utf8");
    const events: string[] = [];
    const report = await runLiveBrowserApply({
      batch: {
        browserPlans: [samplePlan()],
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
    const events: string[] = [];
    const report = await runLiveBrowserApply({
      batch: {
        browserPlans: [samplePlan()],
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
    const events: string[] = [];
    const report = await runLiveBrowserApply({
      batch: {
        browserPlans: [samplePlan()],
        outputRoot
      },
      planId: "example-live-plan",
      playwright: fakePlaywright(events, passSnapshot())
    });

    expect(report.status).toBe("fail");
    expect(report.checks.some((check) => check.id === "live-preflight-current" && check.status === "fail")).toBe(true);
    expect(events).toEqual([]);
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
