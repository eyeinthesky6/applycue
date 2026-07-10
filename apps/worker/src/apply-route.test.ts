import type { ApplicationDraft, ApplyRoute } from "@applycue/core";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runApplyRouteExecution } from "./apply-route.js";
import { writeMasterFormDataReport } from "./master-form-data.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("apply route execution", () => {
  it("blocks browser routes until master form data is confirmed", async () => {
    const outputRoot = await tempOutputRoot();
    const route = routeFixture("browser");
    const draft = draftFixture();

    const report = await runApplyRouteExecution({
      batch: {
        applyRoutes: [route],
        drafts: [draft],
        outputRoot
      },
      routeId: route.id
    });

    expect(report.status).toBe("blocked");
    expect(report.summary).toContain("confirm master form data");
    expect(report.nextCommands[0]).toContain("form-data");
    expect(report.paths.masterFormDataPreview).toBeTruthy();
    expect(await readFile(report.paths.markdownReport, "utf8")).toContain("Master Form Data Confirmed");
  });

  it("hands confirmed browser routes to live preflight and live apply commands", async () => {
    const outputRoot = await tempOutputRoot();
    const route = routeFixture("browser");
    const draft = draftFixture();
    await writeMasterFormDataReport({ drafts: [draft], outputRoot }, { confirm: true });

    const report = await runApplyRouteExecution({
      batch: {
        applyRoutes: [route],
        drafts: [draft],
        outputRoot
      },
      routeId: route.id
    });

    expect(report.status).toBe("handoff");
    expect(report.nextCommands[0]).toContain("browser-live-preflight");
    expect(report.nextCommands[1]).toContain("browser-live-apply");
    expect(await readFile(report.paths.markdownReport, "utf8")).toContain("Browser route ready");
  });

  it("writes email draft artifacts from email routes", async () => {
    const outputRoot = await tempOutputRoot();
    const route = routeFixture("email");

    const report = await runApplyRouteExecution({
      batch: {
        applyRoutes: [route],
        drafts: [draftFixture()],
        outputRoot
      },
      routeType: "email"
    });

    expect(report.status).toBe("drafted");
    expect(report.paths.emailDraft).toBeTruthy();
    const draft = await readFile(report.paths.emailDraft!, "utf8");
    expect(draft).toContain("To: careers@example.com");
    expect(draft).toContain("Subject: Application for Head of Product");
    expect(draft).toContain("outputs/cvs/cv.docx");
  });

  it("writes DM draft artifacts from DM routes", async () => {
    const outputRoot = await tempOutputRoot();
    const route = routeFixture("dm");

    const report = await runApplyRouteExecution({
      batch: {
        applyRoutes: [route],
        drafts: [draftFixture()],
        outputRoot
      },
      applicationId: route.applicationId
    });

    expect(report.status).toBe("drafted");
    expect(report.paths.dmDraft).toBeTruthy();
    const draft = await readFile(report.paths.dmDraft!, "utf8");
    expect(draft).toContain("Platform: linkedin");
    expect(draft).toContain("Hi, I saw the Head of Product role");
  });

  it("pauses API routes when no local adapter executor is registered", async () => {
    const outputRoot = await tempOutputRoot();
    const route = routeFixture("api");

    const report = await runApplyRouteExecution({
      batch: {
        applyRoutes: [route],
        drafts: [draftFixture()],
        outputRoot
      },
      jobId: route.jobId
    });

    expect(report.status).toBe("blocked");
    expect(report.summary).toContain("API route paused");
    expect(report.checks.find((check) => check.id === "api-adapter")?.status).toBe("fail");
    expect(report.nextCommands[0]).toContain("browser-live-preflight");
  });

  it("reports manual-review blockers and questions", async () => {
    const outputRoot = await tempOutputRoot();
    const route = routeFixture("manual_review");

    const report = await runApplyRouteExecution({
      batch: {
        applyRoutes: [route],
        drafts: [draftFixture()],
        outputRoot
      },
      routeId: route.id
    });

    expect(report.status).toBe("blocked");
    expect(report.summary).toContain("Manual review required");
    expect(report.checks.find((check) => check.id === "manual-review")?.detail).toContain("Resolve platform rule");
  });

  it("fails cleanly when no route matches", async () => {
    const outputRoot = await tempOutputRoot();

    const report = await runApplyRouteExecution({
      batch: {
        applyRoutes: [routeFixture("browser")],
        drafts: [draftFixture()],
        outputRoot
      },
      routeId: "missing-route"
    });

    expect(report.status).toBe("fail");
    expect(report.summary).toContain("no matching generated apply route");
  });
});

async function tempOutputRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "applycue-apply-route-test-"));
  tempDirs.push(root);
  await mkdir(path.join(root, "outputs", "apply-routes"), { recursive: true });
  return root;
}

function draftFixture(): ApplicationDraft {
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
        field: "notice_period",
        value: "30 days",
        needsApproval: false,
        aliases: ["What is your notice period?"],
        sourceRef: "applicationAnswers.notice_period"
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

function routeFixture(type: ApplyRoute["type"]): ApplyRoute {
  const base = {
    id: `application-1-${type}-route`,
    applicationId: "application-1",
    jobId: "job-1",
    type,
    status: type === "browser" ? "needs_preflight" : type === "manual_review" ? "blocked" : "draft_only",
    label: `${type} route`,
    reason: "Test route.",
    canSubmit: false,
    submitRequiresApproval: true,
    pauseReasons: ["user_approval_required" as const],
    createdAt: "2026-07-06T00:00:00.000Z",
    artifacts: {
      browserPlanId: "browser-plan-1",
      cvPath: "outputs/cvs/cv.docx"
    },
    notes: ["Test route."]
  };

  if (type === "browser") {
    return {
      ...base,
      type,
      status: "needs_preflight",
      execution: {
        browser: {
          planId: "browser-plan-1",
          preflightCommand: "pnpm applycue:browser-live-preflight -- --plan-id browser-plan-1",
          applyCommand: "pnpm applycue:browser-live-apply -- --plan-id browser-plan-1"
        }
      }
    };
  }

  if (type === "email") {
    return {
      ...base,
      type,
      status: "draft_only",
      execution: {
        email: {
          to: ["careers@example.com"],
          subject: "Application for Head of Product - Sample Candidate",
          body: "Please find my CV attached.",
          attachmentPaths: ["outputs/cvs/cv.docx"]
        }
      }
    };
  }

  if (type === "dm") {
    return {
      ...base,
      type,
      status: "draft_only",
      execution: {
        dm: {
          platform: "linkedin",
          targetUrl: "https://linkedin.com/in/recruiter",
          message: "Hi, I saw the Head of Product role and would like to connect.",
          attachmentPaths: ["outputs/cvs/cv.docx"]
        }
      }
    };
  }

  if (type === "api") {
    return {
      ...base,
      type,
      status: "ready",
      execution: {
        api: {
          adapterId: "example-api",
          endpoint: "https://api.example.com/apply",
          method: "POST"
        }
      }
    };
  }

  return {
    ...base,
    type: "manual_review",
    status: "blocked",
    execution: {
      manualReview: {
        questions: ["Resolve platform rule before applying."]
      }
    }
  };
}
