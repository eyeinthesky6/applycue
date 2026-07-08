import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BrowserPageSnapshot, PlaywrightLikeLocator, PlaywrightLikePage } from "@applycue/browser-agent";
import type { BrowserApplyPlan } from "@applycue/core";
import { runLiveBrowserPreflight } from "./live-preflight.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("live browser preflight", () => {
  it("skips cleanly when browser tooling is not installed", async () => {
    const outputRoot = await tempOutputRoot();
    const report = await runLiveBrowserPreflight({
      batch: {
        browserPlans: [samplePlan()],
        outputRoot
      },
      importPlaywright: async () => {
        throw new Error("missing browser tool");
      }
    });

    expect(report.status).toBe("skipped");
    expect(report.summary).toContain("browser tooling is not installed");
  });

  it("opens and preflights a live page snapshot without filling or submitting", async () => {
    const outputRoot = await tempOutputRoot();
    const events: string[] = [];
    const report = await runLiveBrowserPreflight({
      batch: {
        browserPlans: [samplePlan()],
        outputRoot
      },
      playwright: fakePlaywright(events, passSnapshot())
    });

    expect(report.status).toBe("pass");
    expect(report.summary).toContain("Live browser preflight passed");
    expect(events).toContain("goto:https://boards.greenhouse.io/example/jobs/123");
    expect(events).toContain("evaluate");
    expect(events.some((event) => event.startsWith("fill:"))).toBe(false);
    expect(events.some((event) => event.startsWith("files:"))).toBe(false);
    expect(events.some((event) => event.startsWith("click:"))).toBe(false);
  });

  it("pauses when the visible live page does not match the selected plan", async () => {
    const outputRoot = await tempOutputRoot();
    const report = await runLiveBrowserPreflight({
      batch: {
        browserPlans: [samplePlan()],
        outputRoot
      },
      playwright: fakePlaywright([], {
        ...passSnapshot(),
        pageText: "OtherCo is hiring Account Executive. Apply now.",
        title: "Account Executive - OtherCo",
        visibleCompany: "OtherCo",
        visibleRole: "Account Executive"
      })
    });

    expect(report.status).toBe("pause");
    expect(report.summary).toContain("does not match expected company");
    expect(report.checks.find((check) => check.id === "no-fill-submit")?.status).toBe("pass");
  });

  it("writes chat-ready answer prompts when required form answers are missing", async () => {
    const outputRoot = await tempOutputRoot();
    const report = await runLiveBrowserPreflight({
      batch: {
        browserPlans: [samplePlan()],
        outputRoot
      },
      playwright: fakePlaywright([], {
        ...passSnapshot(),
        fields: [
          { label: "Full name", name: "name", required: true, type: "text" },
          { label: "What is your notice period?", name: "notice", required: true, type: "text" },
          { label: "How many years of PM experience do you have?", name: "pm_years", required: true, type: "number" },
          { label: "", name: "", required: true, type: "text" },
          { label: "Resume", name: "resume_or_cv", required: true, type: "file" }
        ]
      })
    });

    expect(report.status).toBe("pause");
    expect(report.selectedCompany).toBe("Example");
    expect(report.selectedRoleTitle).toBe("Example Role");
    expect(report.answerPrompts?.map((prompt) => prompt.field)).toEqual([
      "notice_period",
      "product_management_years",
      "unlabeled_field"
    ]);
    expect(report.answerPrompts?.[0]?.suggestedDryRunCommand).toContain("pnpm approve-answers -- --dry-run");
    const html = await readFile(report.paths.answerPromptsHtml, "utf8");
    expect(html).toContain("ApplyCue Live Answer Review");
    expect(html).toContain("Copy This To Chat");
    expect(html).toContain("Save Approved Answers");
    expect(html).toContain("pnpm approve-answers -- --from-live");
    expect(html).toContain("--set &quot;notice_period=&lt;approved answer&gt;&quot;");
    expect(html).toContain("What is your notice period?");
    expect(html).toContain("Reusable with your approval");
    expect(html).toContain("One required field on the page had no visible label");
    expect(html).toContain("pnpm approve-answers -- --dry-run");
    const markdown = await readFile(report.paths.answerPromptsMarkdown, "utf8");
    expect(markdown).toContain("Ask these in chat");
    expect(markdown).toContain("## Copy This To Chat");
    expect(markdown).toContain("live-answer-approval-template.json");
    expect(markdown).toContain("pnpm approve-answers -- --from-live");
    expect(markdown).toContain("--set \"notice_period=<approved answer>\"");
    expect(markdown).toContain("Dry-run first");
    expect(markdown).toContain("- Company: Example");
    expect(markdown).toContain("- Role: Example Role");
    expect(markdown).toContain("### Reusable With Your Approval");
    expect(markdown).toContain("### Use Once For This Application");
    expect(markdown).toContain("One required field on the page had no visible label");
    expect(await readFile(report.paths.answerPrompts, "utf8")).toContain("notice_period");
    const template = JSON.parse(await readFile(report.paths.answerApprovalTemplate, "utf8")) as {
      reusableAnswers: Array<{ approveForReuse: boolean; field: string; question: string; value: string }>;
      oneOffAnswers: Array<{ field: string }>;
    };
    expect(template.reusableAnswers).toEqual([
      {
        approveForReuse: false,
        aliases: ["What is your notice period?"],
        field: "notice_period",
        note: "Fill value and set approveForReuse to true only after the user explicitly approves reuse.",
        question: "What is your notice period?",
        sourceRef: "live-preflight:example-live-plan",
        value: ""
      },
      {
        approveForReuse: false,
        aliases: ["How many years of PM experience do you have?"],
        field: "product_management_years",
        note: "Fill value and set approveForReuse to true only after the user explicitly approves reuse.",
        question: "How many years of PM experience do you have?",
        sourceRef: "live-preflight:example-live-plan",
        value: ""
      }
    ]);
    expect(template.oneOffAnswers.map((answer) => answer.field)).toEqual(["unlabeled_field"]);
  });
});

async function tempOutputRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "applycue-live-preflight-test-"));
  tempDirs.push(root);
  await mkdir(path.join(root, "outputs"), { recursive: true });
  return root;
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
