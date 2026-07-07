import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BrowserApplyPlan } from "@applycue/core";
import type { PlaywrightLikeLocator, PlaywrightLikePage } from "@applycue/browser-agent";
import { runBrowserApplyUat } from "./browser-uat.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("browser apply UAT", () => {
  it("skips cleanly when Playwright is not installed", async () => {
    const outputRoot = await tempOutputRoot();
    const report = await runBrowserApplyUat({
      batch: {
        browserPlans: [samplePlan()],
        outputRoot
      },
      importPlaywright: async () => {
        throw new Error("missing optional browser package");
      }
    });

    expect(report.status).toBe("skipped");
    expect(report.summary).toContain("Playwright is not installed");
    expect(report.checks[0]?.status).toBe("skipped");
  });

  it("runs a safe local browser proof that fills, uploads, and pauses", async () => {
    const outputRoot = await tempOutputRoot();
    await writeFile(path.join(outputRoot, "outputs", "cvs", "cv.docx"), "PK fake docx", "utf8");
    const events: string[] = [];
    const report = await runBrowserApplyUat({
      batch: {
        browserPlans: [samplePlan({ extraIdentityFields: true })],
        outputRoot
      },
      playwright: fakePlaywright(events)
    });

    expect(report.status).toBe("pass");
    expect(report.resultStatus).toBe("paused");
    expect(report.summary).toContain("uploaded the generated DOCX");
    expect(events.some((event) => event.startsWith("goto:file:"))).toBe(true);
    expect(events.some((event) => event.includes("fill:"))).toBe(true);
    expect(events.some((event) => event.includes("files:"))).toBe(true);
    expect(events.some((event) => event.includes("click:"))).toBe(false);
    expect(await readFile(report.paths.form, "utf8")).toContain('name="first_name"');
  });

  it("fails before browser launch when the selected plan uploads a non-DOCX artifact", async () => {
    const outputRoot = await tempOutputRoot();
    await writeFile(path.join(outputRoot, "outputs", "cvs", "cv.md"), "# CV", "utf8");
    const report = await runBrowserApplyUat({
      batch: {
        browserPlans: [samplePlan({ cvPath: "outputs/cvs/cv.md" })],
        outputRoot
      },
      playwright: fakePlaywright([])
    });

    expect(report.status).toBe("fail");
    expect(report.checks.some((check) => check.id === "docx-upload" && check.status === "fail")).toBe(true);
    expect(report.summary).toContain("not safe to execute");
  });
});

async function tempOutputRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "applycue-browser-uat-test-"));
  tempDirs.push(root);
  await mkdir(path.join(root, "outputs", "cvs"), { recursive: true });
  return root;
}

function samplePlan(input: { cvPath?: string; extraIdentityFields?: boolean } = {}): BrowserApplyPlan {
  const cvPath = input.cvPath ?? "outputs/cvs/cv.docx";
  const extraIdentityActions: BrowserApplyPlan["actions"] = input.extraIdentityFields ? [
    {
      id: "job-1-fill-first-name",
      type: "fill_field",
      label: "Fill first_name",
      target: "first_name",
      value: "Sample",
      requiresApproval: false
    },
    {
      id: "job-1-fill-last-name",
      type: "fill_field",
      label: "Fill last_name",
      target: "last_name",
      value: "Candidate",
      requiresApproval: false
    }
  ] : [];
  return {
    id: "example-browser-plan",
    jobId: "job-1",
    url: "https://example.com/apply",
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
        target: "https://example.com/apply",
        value: "https://example.com/apply",
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
        id: "job-1-fill-email",
        type: "fill_field",
        label: "Fill email",
        target: "email",
        value: "sample@example.com",
        requiresApproval: false
      },
      ...extraIdentityActions,
      {
        id: "job-1-upload",
        type: "upload_file",
        label: "Upload generated CV",
        target: "resume_or_cv",
        value: cvPath,
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
    cvPath
  };
}

function fakePlaywright(events: string[]) {
  return {
    chromium: {
      async launch() {
        return new FakeBrowser(events);
      }
    }
  };
}

class FakeBrowser {
  constructor(private readonly events: string[]) {}

  async newPage(): Promise<PlaywrightLikePage> {
    return new FakePage(this.events);
  }

  async close(): Promise<unknown> {
    this.events.push("browser:close");
    return undefined;
  }
}

class FakePage implements PlaywrightLikePage {
  private currentUrl = "about:blank";

  constructor(private readonly events: string[]) {}

  async evaluate<T = unknown>(): Promise<T> {
    this.events.push("evaluate");
    return {
      applyControls: ["Submit application"],
      fields: [
        { label: "Full name", name: "name", required: true, type: "text" },
        { label: "Email", name: "email", required: true, type: "text" },
        { label: "Resume", name: "resume_or_cv", required: true, type: "file" }
      ],
      finalUrl: this.currentUrl,
      pageText: "Example is hiring for Example Role. Apply now.",
      title: "Example Role - Example",
      visibleCompany: "Example",
      visibleRole: "Example Role"
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
    return "Example Role - Example";
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
