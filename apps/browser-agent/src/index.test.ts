import { describe, expect, it } from "vitest";
import type { ApplicationDraft, JobRecord } from "@applycue/core";
import {
  createApplicationReceipt,
  createBrowserApplyPlan,
  createInitialBrowserActionLog,
  createPlaywrightBrowserApplyController,
  describeBrowserPlan,
  executeBrowserApplyPlan,
  executeBrowserPlanDryRun,
  formatBrowserApplyPreflight,
  preflightBrowserApplyPlan,
  preflightBrowserApplyPlanFromSnapshot,
  recordBrowserAction,
  type BrowserApplyController,
  type BrowserPageSnapshot,
  type PlaywrightLikeLocator,
  type PlaywrightLikePage
} from "./index.js";

describe("browser apply plan", () => {
  it("pauses review-mode applications before final submit", () => {
    const draft = sampleDraft({
      canAutoSubmit: false,
      submitRequiresApproval: true
    });
    const plan = createBrowserApplyPlan({
      draft,
      job: sampleJob(),
      cvPath: "outputs/cvs/job-1.docx"
    });

    expect(plan.canSubmit).toBe(false);
    expect(plan.company).toBe("Example");
    expect(plan.roleTitle).toBe("Example Role");
    expect(plan.pauseReasons).toContain("user_approval_required");
    expect(plan.actions.map((action) => action.type)).toEqual([
      "open_url",
      "fill_field",
      "fill_field",
      "upload_file",
      "pause"
    ]);
    expect(describeBrowserPlan(draft)).toContain("ask the user for approval");

    const dryRun = executeBrowserPlanDryRun(plan);

    expect(dryRun.status).toBe("paused");
    expect(dryRun.preflight.status).toBe("pass");
    expect(dryRun.receipt.status).toBe("paused");
    expect(dryRun.actionLog.some((entry) => entry.actionType === "submit" && entry.status === "done")).toBe(false);
    expect(dryRun.actionLog.some((entry) => entry.actionType === "upload_file" && entry.status === "done")).toBe(true);
  });

  it("creates submit and receipt actions only when policy allows auto-submit", () => {
    const draft = sampleDraft({
      canAutoSubmit: true,
      submitRequiresApproval: false
    });
    const plan = createBrowserApplyPlan({
      draft,
      job: sampleJob(),
      cvPath: "outputs/cvs/job-1.docx"
    });

    expect(plan.canSubmit).toBe(true);
    expect(plan.pauseReasons).toEqual([]);
    expect(plan.actions.at(-2)?.type).toBe("submit");
    expect(plan.actions.at(-1)?.type).toBe("capture_receipt");

    const initialLog = createInitialBrowserActionLog(plan);
    const submittedLog = recordBrowserAction(initialLog, plan, `${draft.jobId}-submit`, "done", "Submitted in browser.");
    const receipt = createApplicationReceipt({
      actionLog: submittedLog,
      confirmationText: "Application received",
      confirmationUrl: "https://example.com/confirmation",
      plan,
      status: "submitted"
    });

    expect(receipt.status).toBe("submitted");
    expect(receipt.confirmationText).toBe("Application received");
    expect(receipt.cvVariantId).toBe("cv-1");

    const dryRun = executeBrowserPlanDryRun(plan);

    expect(dryRun.status).toBe("submitted");
    expect(dryRun.preflight.status).toBe("pass");
    expect(dryRun.receipt.status).toBe("submitted");
    expect(dryRun.receipt.confirmationText).toBe("Local dry-run receipt captured.");
    expect(dryRun.actionLog.some((entry) => entry.actionType === "capture_receipt" && entry.status === "done")).toBe(true);
  });

  it("derives the default local dry-run form from generated plan fields", () => {
    const draft = {
      ...sampleDraft({
        canAutoSubmit: false,
        submitRequiresApproval: true
      }),
      answers: [
        { field: "name", value: "Sample Candidate", needsApproval: false },
        { field: "first_name", value: "Sample", needsApproval: false },
        { field: "last_name", value: "Candidate", needsApproval: false },
        { field: "email", value: "sample@example.com", needsApproval: false },
        { field: "phone", value: "+1 555 0100", needsApproval: false },
        { field: "country", value: "United States", needsApproval: false },
        { field: "final_submit", value: "Prepared only.", needsApproval: true }
      ]
    };
    const plan = createBrowserApplyPlan({
      draft,
      job: sampleJob(),
      cvPath: "outputs/cvs/job-1.docx"
    });

    const dryRun = executeBrowserPlanDryRun(plan);

    expect(dryRun.status).toBe("paused");
    expect(dryRun.preflight.status).toBe("pass");
    expect(dryRun.actionLog.filter((entry) => entry.actionType === "fill_field" && entry.status === "done")).toHaveLength(6);
  });

  it("pauses when the draft has policy or CV pause reasons", () => {
    const draft = sampleDraft({
      canAutoSubmit: false,
      pauseReasons: ["unsupported_cv_claim"],
      submitRequiresApproval: true
    });
    const plan = createBrowserApplyPlan({
      draft,
      job: sampleJob()
    });

    expect(plan.canSubmit).toBe(false);
    expect(plan.pauseReasons).toEqual(["unsupported_cv_claim", "user_approval_required"]);
    expect(plan.actions.at(-1)?.type).toBe("pause");
    expect(describeBrowserPlan(draft)).toContain("unsupported_cv_claim");
  });

  it("fails preflight before filling when the posting is closed", () => {
    const draft = sampleDraft({
      canAutoSubmit: false,
      submitRequiresApproval: true
    });
    const plan = createBrowserApplyPlan({
      draft,
      job: sampleJob(),
      cvPath: "outputs/cvs/job-1.docx"
    });

    const dryRun = executeBrowserPlanDryRun(plan, {
      fields: ["name", "email"],
      uploadTargets: ["resume_or_cv"],
      pageText: "This job has expired and is no longer accepting applications.",
      title: "Example Role closed"
    });

    expect(dryRun.status).toBe("failed");
    expect(dryRun.preflight.status).toBe("fail");
    expect(dryRun.preflight.liveness.liveState).toBe("closed");
    expect(dryRun.receipt.confirmationText).toContain("Posting appears closed");
    expect(dryRun.actionLog.some((entry) => entry.actionType === "upload_file" && entry.status === "done")).toBe(false);
  });

  it("pauses preflight when sensitive required fields are visible", () => {
    const draft = sampleDraft({
      canAutoSubmit: true,
      submitRequiresApproval: false
    });
    const plan = createBrowserApplyPlan({
      draft,
      job: sampleJob(),
      cvPath: "outputs/cvs/job-1.docx"
    });

    const dryRun = executeBrowserPlanDryRun(plan, {
      fields: ["name", "email"],
      formFields: [
        { label: "Full name", name: "name", required: true, type: "text" },
        { label: "Email", name: "email", required: true, type: "text" },
        { label: "Expected salary", name: "expected_salary", required: true, type: "number" },
        { label: "Resume", name: "resume_or_cv", required: true, type: "file" }
      ],
      uploadTargets: ["resume_or_cv"],
      pageText: "Apply now for Example Role.",
      title: "Example application"
    });

    expect(dryRun.status).toBe("paused");
    expect(dryRun.preflight.status).toBe("pause");
    expect(dryRun.preflight.sensitiveFields.map((field) => field.name)).toContain("expected_salary");
    expect(dryRun.receipt.confirmationText).toContain("Sensitive required field");
    expect(dryRun.actionLog.some((entry) => entry.actionType === "submit" && entry.status === "done")).toBe(false);
  });

  it("passes sensitive required fields when the plan has approved matching answers", () => {
    const draft = {
      ...sampleDraft({
        canAutoSubmit: true,
        submitRequiresApproval: false
      }),
      answers: [
        { field: "name", value: "Sample Candidate", needsApproval: false },
        { field: "email", value: "sample@example.com", needsApproval: false },
        {
          field: "notice_period",
          value: "30 days",
          needsApproval: false,
          aliases: ["What is your notice period?", "notice period"]
        },
        {
          field: "expected_salary",
          value: "USD 120000",
          needsApproval: false,
          aliases: ["desired_salary", "What is your desired salary?"]
        },
        { field: "final_submit", value: "Can submit automatically.", needsApproval: false }
      ]
    };
    const plan = createBrowserApplyPlan({
      draft,
      job: sampleJob(),
      cvPath: "outputs/cvs/job-1.docx"
    });

    const preflight = preflightBrowserApplyPlanFromSnapshot(plan, {
      applyControls: ["Submit application"],
      fields: [
        { label: "Full name", name: "name", required: true, type: "text" },
        { label: "Email", name: "email", required: true, type: "text" },
        { label: "What is your notice period?", name: "notice", required: true, type: "text" },
        { label: "What is your desired salary?", name: "desired_salary", required: true, type: "number" },
        { label: "Resume", name: "resume_or_cv", required: true, type: "file" }
      ],
      finalUrl: "https://example.com/apply",
      pageText: "Example is hiring for Example Role. Apply now.",
      title: "Example Role - Example",
      visibleCompany: "Example",
      visibleRole: "Example Role"
    });

    expect(preflight.status).toBe("pass");
    expect(preflight.sensitiveFields).toEqual([]);
    expect(preflight.missingRequiredFields).toEqual([]);
  });

  it("fills alias-only fields during local dry run", () => {
    const draft = {
      ...sampleDraft({
        canAutoSubmit: false,
        submitRequiresApproval: true
      }),
      answers: [
        { field: "name", value: "Sample Candidate", needsApproval: false },
        { field: "email", value: "sample@example.com", needsApproval: false },
        {
          field: "notice_period",
          value: "30 days",
          needsApproval: false,
          aliases: ["When can you join?"]
        },
        { field: "final_submit", value: "Prepared only.", needsApproval: true }
      ]
    };
    const plan = createBrowserApplyPlan({
      draft,
      job: sampleJob(),
      cvPath: "outputs/cvs/job-1.docx"
    });

    const dryRun = executeBrowserPlanDryRun(plan, {
      fields: ["name", "email", "When can you join?"],
      formFields: [
        { label: "Full name", name: "name", required: true, type: "text" },
        { label: "Email", name: "email", required: true, type: "text" },
        { label: "When can you join?", name: "joining_date", required: true, type: "text" },
        { label: "Resume", name: "resume_or_cv", required: true, type: "file" }
      ],
      uploadTargets: ["resume_or_cv"],
      pageText: "Example is hiring for Example Role. Apply now.",
      title: "Example Role - Example",
      visibleCompany: "Example",
      visibleRole: "Example Role"
    });

    expect(dryRun.status).toBe("paused");
    expect(dryRun.preflight.status).toBe("pass");
    expect(dryRun.actionLog.some((entry) => entry.actionId.endsWith("fill-notice-period") && entry.note === "Filled When can you join?.")).toBe(true);
  });

  it("passes required public profile link fields when the plan has profile-link aliases", () => {
    const draft = {
      ...sampleDraft({
        canAutoSubmit: true,
        submitRequiresApproval: false
      }),
      answers: [
        { field: "name", value: "Sample Candidate", needsApproval: false },
        { field: "email", value: "sample@example.com", needsApproval: false },
        {
          field: "linkedin_url",
          value: "https://www.linkedin.com/in/sample-candidate",
          needsApproval: false,
          aliases: ["LinkedIn", "LinkedIn URL:"]
        },
        { field: "final_submit", value: "Can submit automatically.", needsApproval: false }
      ]
    };
    const plan = createBrowserApplyPlan({
      draft,
      job: sampleJob(),
      cvPath: "outputs/cvs/job-1.docx"
    });

    const preflight = preflightBrowserApplyPlanFromSnapshot(plan, {
      applyControls: ["Submit application"],
      fields: [
        { label: "Full name", name: "name", required: true, type: "text" },
        { label: "Email", name: "email", required: true, type: "text" },
        { label: "LinkedIn URL:", name: "link", required: true, type: "text" },
        { label: "Resume", name: "resume_or_cv", required: true, type: "file" }
      ],
      finalUrl: "https://example.com/apply",
      pageText: "Example is hiring for Example Role. Apply now.",
      title: "Example Role - Example",
      visibleCompany: "Example",
      visibleRole: "Example Role"
    });

    expect(preflight.status).toBe("pass");
    expect(preflight.missingRequiredFields).toEqual([]);
  });

  it("does not let a generic full-name answer satisfy split name fields", () => {
    const draft = sampleDraft({
      canAutoSubmit: true,
      submitRequiresApproval: false
    });
    const plan = createBrowserApplyPlan({
      draft,
      job: sampleJob(),
      cvPath: "outputs/cvs/job-1.docx"
    });

    const preflight = preflightBrowserApplyPlanFromSnapshot(plan, {
      applyControls: ["Submit application"],
      fields: [
        { label: "First Name", name: "first_name", required: true, type: "text" },
        { label: "Email", name: "email", required: true, type: "text" },
        { label: "Resume", name: "resume_or_cv", required: true, type: "file" }
      ],
      finalUrl: "https://example.com/apply",
      pageText: "Example is hiring for Example Role. Apply now.",
      title: "Example Role - Example",
      visibleCompany: "Example",
      visibleRole: "Example Role"
    });

    expect(preflight.status).toBe("pause");
    expect(preflight.missingRequiredFields.map((field) => field.name)).toContain("first_name");
  });

  it("pauses preflight on visible company or role mismatch", () => {
    const draft = sampleDraft({
      canAutoSubmit: true,
      submitRequiresApproval: false
    });
    const plan = createBrowserApplyPlan({
      draft,
      job: sampleJob()
    });

    const preflight = preflightBrowserApplyPlan({
      expectedCompany: "Example",
      expectedRole: "Example Role",
      pageText: "Apply now for Account Executive at OtherCo.",
      plan,
      title: "OtherCo application",
      visibleCompany: "OtherCo",
      visibleRole: "Account Executive"
    });

    expect(preflight.status).toBe("pause");
    expect(preflight.reasons.join(" ")).toContain("does not match expected company");
    expect(preflight.reasons.join(" ")).toContain("does not match expected role");
  });

  it("does not pause on a noisy secondary visible role when title and page lead match the plan", () => {
    const draft = sampleDraft({
      canAutoSubmit: true,
      submitRequiresApproval: false
    });
    const plan = createBrowserApplyPlan({
      draft,
      job: {
        ...sampleJob(),
        company: "Barclays",
        title: "Product Owner - Technology -VP",
        url: "https://search.jobs.barclays/job/mumbai/product-owner-technology-vp/13015/97432365168"
      },
      cvPath: "outputs/cvs/job-1.docx"
    });

    const preflight = preflightBrowserApplyPlanFromSnapshot(plan, {
      applyControls: ["Apply for job"],
      fields: [
        { label: "Full name", name: "name", required: true, type: "text" },
        { label: "Email", name: "email", required: true, type: "text" },
        { label: "Resume", name: "resume_or_cv", required: true, type: "file" }
      ],
      finalUrl: "https://search.jobs.barclays/job/mumbai/product-owner-technology-vp/13015/97432365168",
      pageText: "Product Owner - Technology -VP Mumbai, India Apply for job Date live: 07/06/2026 Barclays Product Development & Management.",
      title: "Product Owner - Technology -VP at Barclays",
      visibleCompany: "Barclays",
      visibleRole: "Business Relationship manager"
    });

    expect(preflight.status).toBe("pass");
    expect(preflight.reasons.join(" ")).not.toContain("does not match expected role");
  });

  it("runs preflight from a real browser-style page snapshot", () => {
    const draft = sampleDraft({
      canAutoSubmit: true,
      submitRequiresApproval: false
    });
    const plan = createBrowserApplyPlan({
      draft,
      job: sampleJob(),
      cvPath: "outputs/cvs/job-1.docx"
    });

    const preflight = preflightBrowserApplyPlanFromSnapshot(plan, {
      applyControls: ["Submit application"],
      fields: [
        { label: "Full name", name: "name", required: true, type: "text" },
        { label: "Email", name: "email", required: true, type: "text" },
        { label: "Resume", name: "resume_or_cv", required: true, type: "file" }
      ],
      finalUrl: "https://example.com/apply",
      pageText: "Example is hiring for Example Role. Apply now.",
      title: "Example Role - Example",
      visibleCompany: "Example",
      visibleRole: "Example Role"
    });

    expect(preflight.status).toBe("pass");
    expect(formatBrowserApplyPreflight(preflight)).toContain("No preflight blockers found.");
  });

  it("treats common resume upload labels as answered by the generated CV upload action", () => {
    const draft = sampleDraft({
      canAutoSubmit: true,
      submitRequiresApproval: false
    });
    const plan = createBrowserApplyPlan({
      draft,
      job: sampleJob(),
      cvPath: "outputs/cvs/job-1.docx"
    });

    const preflight = preflightBrowserApplyPlanFromSnapshot(plan, {
      applyControls: ["Submit application"],
      fields: [
        { label: "Full name", name: "name", required: true, type: "text" },
        { label: "Email", name: "email", required: true, type: "text" },
        { label: "Resume", name: "candidate_upload", required: true, type: "file" }
      ],
      finalUrl: "https://example.com/apply",
      pageText: "Example is hiring for Example Role. Apply now.",
      title: "Example Role - Example",
      visibleCompany: "Example",
      visibleRole: "Example Role"
    });

    expect(preflight.status).toBe("pass");
    expect(preflight.missingRequiredFields).toEqual([]);
  });

  it("treats split name, phone, and country fields as answered when the draft has profile contact answers", () => {
    const draft = {
      ...sampleDraft({
        canAutoSubmit: true,
        submitRequiresApproval: false
      }),
      answers: [
        { field: "first_name", value: "Sample", needsApproval: false },
        { field: "last_name", value: "Candidate", needsApproval: false },
        { field: "email", value: "sample@example.com", needsApproval: false },
        { field: "phone", value: "+1 555 0100", needsApproval: false },
        { field: "country", value: "United States", needsApproval: false },
        { field: "final_submit", value: "Can submit automatically.", needsApproval: false }
      ]
    };
    const plan = createBrowserApplyPlan({
      draft,
      job: sampleJob(),
      cvPath: "outputs/cvs/job-1.docx"
    });

    const preflight = preflightBrowserApplyPlanFromSnapshot(plan, {
      applyControls: ["Submit application"],
      fields: [
        { label: "First Name", name: "first_name", required: true, type: "text" },
        { label: "Last Name", name: "last_name", required: true, type: "text" },
        { label: "Email", name: "email", required: true, type: "text" },
        { label: "Phone", name: "phone", required: true, type: "text" },
        { label: "Country*", name: "country", required: true, type: "select" },
        { label: "Resume", name: "resume_or_cv", required: true, type: "file" }
      ],
      finalUrl: "https://example.com/apply",
      pageText: "Example is hiring for Example Role. Apply now.",
      title: "Example Role - Example",
      visibleCompany: "Example",
      visibleRole: "Example Role"
    });

    expect(preflight.status).toBe("pass");
    expect(preflight.missingRequiredFields).toEqual([]);
  });

  it("executes a browser controller but pauses before submit in review mode", async () => {
    const draft = sampleDraft({
      canAutoSubmit: false,
      submitRequiresApproval: true
    });
    const plan = createBrowserApplyPlan({
      draft,
      job: sampleJob(),
      cvPath: "outputs/cvs/job-1.docx"
    });
    const controller = new FakeBrowserController(passSnapshot());

    const result = await executeBrowserApplyPlan(plan, controller);

    expect(result.status).toBe("paused");
    expect(result.preflight.status).toBe("pass");
    expect(result.receipt.status).toBe("paused");
    expect(controller.events).toEqual([
      "open:https://example.com/apply",
      "fill:name=Sample Candidate",
      "fill:email=sample@example.com",
      "upload:resume_or_cv=outputs/cvs/job-1.docx"
    ]);
    expect(result.actionLog.some((entry) => entry.actionType === "submit" && entry.status === "done")).toBe(false);
  });

  it("tries approved aliases when the browser cannot fill the canonical field target", async () => {
    const draft = {
      ...sampleDraft({
        canAutoSubmit: false,
        submitRequiresApproval: true
      }),
      answers: [
        { field: "name", value: "Sample Candidate", needsApproval: false },
        { field: "email", value: "sample@example.com", needsApproval: false },
        {
          field: "notice_period",
          value: "30 days",
          needsApproval: false,
          aliases: ["When can you join?"]
        },
        { field: "final_submit", value: "Prepared only.", needsApproval: true }
      ]
    };
    const plan = createBrowserApplyPlan({
      draft,
      job: sampleJob(),
      cvPath: "outputs/cvs/job-1.docx"
    });
    const controller = new AliasOnlyBrowserController({
      ...passSnapshot(),
      fields: [
        { label: "Full name", name: "name", required: true, type: "text" },
        { label: "Email", name: "email", required: true, type: "text" },
        { label: "When can you join?", name: "joining_date", required: true, type: "text" },
        { label: "Resume", name: "resume_or_cv", required: true, type: "file" }
      ]
    }, "notice_period", "When can you join?");

    const result = await executeBrowserApplyPlan(plan, controller);

    expect(result.status).toBe("paused");
    expect(result.preflight.status).toBe("pass");
    expect(controller.events).toContain("fill:When can you join?=30 days");
    expect(result.actionLog.some((entry) => entry.actionId.endsWith("fill-notice-period") && entry.note === "Filled When can you join?.")).toBe(true);
  });

  it("submits through a browser controller only when policy allows it", async () => {
    const draft = sampleDraft({
      canAutoSubmit: true,
      submitRequiresApproval: false
    });
    const plan = createBrowserApplyPlan({
      draft,
      job: sampleJob(),
      cvPath: "outputs/cvs/job-1.docx"
    });
    const controller = new FakeBrowserController(passSnapshot());

    const result = await executeBrowserApplyPlan(plan, controller);

    expect(result.status).toBe("submitted");
    expect(result.preflight.status).toBe("pass");
    expect(result.receipt.status).toBe("submitted");
    expect(result.receipt.confirmationText).toBe("Application received by fake browser.");
    expect(controller.events).toContain("submit");
    expect(controller.events).toContain("receipt");
  });

  it("stops before filling when the visible browser page does not match the plan", async () => {
    const draft = sampleDraft({
      canAutoSubmit: true,
      submitRequiresApproval: false
    });
    const plan = createBrowserApplyPlan({
      draft,
      job: sampleJob(),
      cvPath: "outputs/cvs/job-1.docx"
    });
    const controller = new FakeBrowserController({
      ...passSnapshot(),
      pageText: "OtherCo is hiring Account Executive. Apply now.",
      title: "Account Executive - OtherCo",
      visibleCompany: "OtherCo",
      visibleRole: "Account Executive"
    });

    const result = await executeBrowserApplyPlan(plan, controller);

    expect(result.status).toBe("paused");
    expect(result.preflight.status).toBe("pause");
    expect(result.preflight.reasons.join(" ")).toContain("does not match expected company");
    expect(controller.events).toEqual(["open:https://example.com/apply"]);
    expect(result.actionLog.some((entry) => entry.actionType === "fill_field" && entry.status === "done")).toBe(false);
  });

  it("wraps a Playwright-like page as a policy-aware browser controller", async () => {
    const draft = sampleDraft({
      canAutoSubmit: true,
      submitRequiresApproval: false
    });
    const plan = createBrowserApplyPlan({
      draft,
      job: sampleJob(),
      cvPath: "outputs/cvs/job-1.docx"
    });
    const page = new FakePlaywrightPage(passSnapshot());
    const controller = createPlaywrightBrowserApplyController(page);

    const result = await executeBrowserApplyPlan(plan, controller);

    expect(result.status).toBe("submitted");
    expect(result.receipt.status).toBe("submitted");
    expect(page.events[0]).toBe("goto:https://example.com/apply");
    expect(page.events.some((event) => event.startsWith("fill:"))).toBe(true);
    expect(page.events.some((event) => event.startsWith("files:"))).toBe(true);
    expect(page.events.some((event) => event.startsWith("click:"))).toBe(true);
    expect(page.events).toContain("evaluate");
  });
});

function sampleDraft(input: {
  canAutoSubmit: boolean;
  pauseReasons?: ApplicationDraft["pauseReasons"];
  submitRequiresApproval: boolean;
}): ApplicationDraft {
  return {
    jobId: "job-1",
    cvVariantId: "cv-1",
    answers: [
      {
        field: "name",
        value: "Sample Candidate",
        needsApproval: false
      },
      {
        field: "email",
        value: "sample@example.com",
        needsApproval: false
      },
      {
        field: "final_submit",
        value: "Prepared only.",
        needsApproval: input.submitRequiresApproval
      }
    ],
    submitRequiresApproval: input.submitRequiresApproval,
    canAutoSubmit: input.canAutoSubmit,
    applyMode: input.submitRequiresApproval ? "review" : "daily",
    pauseReasons: input.pauseReasons ?? []
  };
}

function sampleJob(): JobRecord {
  return {
    id: "job-1",
    source: {
      id: "manual",
      kind: "manual",
      name: "Manual"
    },
    company: "Example",
    title: "Example Role",
    url: "https://example.com/apply",
    description: "Example role",
    workMode: "remote",
    discoveredAt: "2026-07-06T00:00:00.000Z",
    liveState: "live"
  };
}

function passSnapshot(): BrowserPageSnapshot {
  return {
    applyControls: ["Submit application"],
    fields: [
      { label: "Full name", name: "name", required: true, type: "text" },
      { label: "Email", name: "email", required: true, type: "text" },
      { label: "Resume", name: "resume_or_cv", required: true, type: "file" }
    ],
    finalUrl: "https://example.com/apply",
    pageText: "Example is hiring for Example Role. Apply now.",
    title: "Example Role - Example",
    visibleCompany: "Example",
    visibleRole: "Example Role"
  };
}

class FakeBrowserController implements BrowserApplyController {
  public readonly events: string[] = [];

  constructor(private readonly page: BrowserPageSnapshot) {}

  async openUrl(url: string): Promise<BrowserPageSnapshot> {
    this.events.push(`open:${url}`);
    return this.page;
  }

  async snapshot(): Promise<BrowserPageSnapshot> {
    this.events.push("snapshot");
    return this.page;
  }

  async fillField(target: string, value: string): Promise<void> {
    this.events.push(`fill:${target}=${value}`);
  }

  async uploadFile(target: string, filePath: string): Promise<void> {
    this.events.push(`upload:${target}=${filePath}`);
  }

  async submit(): Promise<void> {
    this.events.push("submit");
  }

  async captureReceipt(): Promise<{ confirmationText: string; confirmationUrl: string }> {
    this.events.push("receipt");
    return {
      confirmationText: "Application received by fake browser.",
      confirmationUrl: "https://example.com/confirmation"
    };
  }
}

class AliasOnlyBrowserController extends FakeBrowserController {
  constructor(
    page: BrowserPageSnapshot,
    private readonly blockedTarget: string,
    private readonly acceptedAlias: string
  ) {
    super(page);
  }

  override async fillField(target: string, value: string): Promise<void> {
    if (target === this.blockedTarget) {
      this.events.push(`fill-failed:${target}`);
      throw new Error(`No field matched ${target}`);
    }
    if (target === this.acceptedAlias || target === "name" || target === "email") {
      this.events.push(`fill:${target}=${value}`);
      return;
    }
    throw new Error(`Unexpected fill target ${target}`);
  }
}

class FakePlaywrightPage implements PlaywrightLikePage {
  public readonly events: string[] = [];
  private currentUrl: string;

  constructor(private readonly page: BrowserPageSnapshot) {
    this.currentUrl = page.finalUrl ?? "about:blank";
  }

  async evaluate<T = unknown>(_pageFunction: string): Promise<T> {
    this.events.push("evaluate");
    return this.page as T;
  }

  async goto(url: string): Promise<unknown> {
    this.events.push(`goto:${url}`);
    this.currentUrl = url;
    return undefined;
  }

  locator(selector: string): PlaywrightLikeLocator {
    return new FakePlaywrightLocator(selector, this.events);
  }

  async title(): Promise<string> {
    this.events.push("title");
    return this.page.title ?? "";
  }

  url(): string {
    return this.currentUrl;
  }
}

class FakePlaywrightLocator implements PlaywrightLikeLocator {
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
