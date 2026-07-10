import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatApplyCueStatus, readApplyCueStatus } from "./status.js";

describe("readApplyCueStatus", () => {
  it("reports missing setup without mutating the user store", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "applycue-status-empty-"));
    const applyCueHome = path.join(workspace, "applycue-home");

    const report = await readApplyCueStatus({ applyCueHome, env: {} });

    expect(report.status).toBe("needs_setup");
    expect(report.config.exists).toBe(false);
    expect(report.missing).toContain("profile config");
    expect(report.agentHandoff.headline).toContain("Setup has not started");
    expect(report.agentHandoff.commandCenter).toEqual(["pnpm setup-applycue", "pnpm status"]);
    expect(report.agentHandoff.needsAttention).toContain("Missing or not proven: profile config");
    expect(formatApplyCueStatus(report)).toContain("ApplyCue status: NEEDS SETUP");
  });

  it("summarizes a ready profile from existing UAT and run artifacts", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "applycue-status-ready-"));
    const applyCueHome = path.join(workspace, "applycue-home");
    const profileDir = path.join(applyCueHome, "profiles", "default");
    const runsDir = path.join(profileDir, "outputs", "runs");
    const dashboardPath = path.join(profileDir, "outputs", "dashboard", "latest.html");
    const summaryPath = path.join(runsDir, "latest-summary.md");
    const manifestPath = path.join(runsDir, "status-run.json");
    const uatReportPath = path.join(runsDir, "uat-report.json");
    await mkdir(path.join(profileDir, "outputs", "dashboard"), { recursive: true });
    await mkdir(runsDir, { recursive: true });

    await writeFile(
      path.join(profileDir, "applycue.json"),
      JSON.stringify({
        profile: {
          name: "Status Candidate",
          email: "status@example.com",
          baseCvPath: "assets/base-cvs/status.md"
        },
        preferences: {
          targetRoleTerms: ["head of product"]
        }
      }),
      "utf8"
    );
    await writeFile(dashboardPath, "<html><title>ApplyCue</title></html>", "utf8");
    await writeFile(summaryPath, "# ApplyCue Run Summary\n\n- Jobs prepared today: 2\n- CVs ready: 2\n", "utf8");
    await writeFile(
      manifestPath,
      JSON.stringify({
        id: "status-run",
        kind: "daily_batch",
        startedAt: "2026-07-06T00:00:00.000Z",
        completedAt: "2026-07-06T00:01:00.000Z",
        profileId: "status-candidate",
        jobIds: ["job-1", "job-2", "job-3"],
        cvVariantIds: ["cv-1", "cv-2"],
        applicationIds: ["app-1", "app-2"],
        generatedFiles: [],
        sourceCodeWriteCount: 0,
        notes: [],
        sourceQuality: {
          inputJobs: 40,
          keptJobs: 8,
          filteredJobs: 32,
          byReason: {
            title: 20,
            industry: 0,
            location: 10,
            content: 2
          }
        },
        scanHistory: {
          inputJobs: 8,
          keptJobs: 7,
          mode: "review",
          recordedJobs: 8,
          repostClusters: 1,
          repostWindowDays: 90,
          repostedJobs: 2,
          skippedClosed: 0,
          skippedJobs: 1,
          skippedPrepared: 1,
          topReposts: []
        },
        sourceOutcomes: {
          trackedApplications: 2,
          outcomeEvents: 1,
          preparedApplications: 2,
          submitted: 0,
          replies: 1,
          interviews: 0,
          offers: 0,
          rejections: 0,
          positiveOutcomes: 1,
          sources: []
        }
      }),
      "utf8"
    );
    await writeFile(
      uatReportPath,
      JSON.stringify({
        id: "applycue-local-uat",
        status: "pass",
        generatedAt: "2026-07-06T00:02:00.000Z",
        checks: [
          {
            id: "chat-summary",
            label: "Chat Summary Written",
            status: "pass",
            detail: summaryPath
          }
        ],
        counts: {
          applications: 2,
          browserPlans: 2,
          browserReceipts: 2,
          cvs: 2,
          jobs: 3,
          reconciliationBlocked: 0,
          reconciliationNeedsConfirmation: 0,
          reconciliationPassed: 2
        },
        paths: {
          dashboard: dashboardPath,
          manifest: manifestPath,
          markdownReport: path.join(runsDir, "uat-report.md"),
          profile: profileDir,
          report: uatReportPath,
          summary: summaryPath
        },
        summary: "UAT passed: found 3 job(s), generated 2 CV(s), prepared 2 application draft(s), and created 2 browser plan(s)."
      }),
      "utf8"
    );

    const report = await readApplyCueStatus({ applyCueHome, env: {} });
    const formatted = formatApplyCueStatus(report);

    expect(report.status).toBe("ready");
    expect(report.nextAction).toBe("Review and confirm master form data, then run apply-route for a prepared application and follow its browser/email/DM/API/manual handoff under the user's policy.");
    expect(report.agentHandoff.headline).toBe("Ready for review: 2 application draft(s), 2 CV(s), UAT pass.");
    expect(report.agentHandoff.commandCenter).toEqual(["pnpm form-data", "pnpm apply-route", "pnpm browser-live-preflight", "pnpm status"]);
    expect(report.agentHandoff.readyQueue).toEqual([
      "2 prepared application(s); open the summary for role details."
    ]);
    expect(report.agentHandoff.nextSteps).toEqual([
      "Review and confirm master form data, then run apply-route for a prepared application and follow its browser/email/DM/API/manual handoff under the user's policy."
    ]);
    expect(report.agentHandoff.evidence).toContain(`Dashboard: ${dashboardPath}`);
    expect(report.config.hasBaseCv).toBe(true);
    expect(report.latestRun?.jobs).toBe(3);
    expect(report.latestRun?.sourceQuality?.keptJobs).toBe(8);
    expect(report.latestUat?.status).toBe("pass");
    expect(report.summaryExcerpt[0]).toBe("# ApplyCue Run Summary");
    expect(formatted).toContain("ApplyCue status: READY");
    expect(formatted).toContain("Agent handoff:");
    expect(formatted).toContain("Agent command center:");
    expect(formatted).toContain("- pnpm browser-live-preflight");
    expect(formatted).toContain("Ready: 2 prepared application(s); open the summary for role details.");
    expect(formatted).toContain("Source quality: 8 kept of 40 found.");
    expect(formatted).toContain("Review and confirm master form data");
  });

  it("extracts prepared queue, watch items, and next actions from the chat summary", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "applycue-status-handoff-"));
    const applyCueHome = path.join(workspace, "applycue-home");
    const profileDir = path.join(applyCueHome, "profiles", "default");
    const runsDir = path.join(profileDir, "outputs", "runs");
    const dashboardPath = path.join(profileDir, "outputs", "dashboard", "latest.html");
    const summaryPath = path.join(runsDir, "latest-summary.md");
    const manifestPath = path.join(runsDir, "status-run.json");
    const uatReportPath = path.join(runsDir, "uat-report.json");
    await mkdir(path.join(profileDir, "outputs", "dashboard"), { recursive: true });
    await mkdir(runsDir, { recursive: true });

    await writeFile(
      path.join(profileDir, "applycue.json"),
      JSON.stringify({
        profile: {
          name: "Handoff Candidate",
          email: "handoff@example.com",
          baseCvPath: "assets/base-cvs/handoff.md"
        },
        preferences: {
          targetRoleTerms: ["vp product"]
        }
      }),
      "utf8"
    );
    await writeFile(dashboardPath, "<html><title>ApplyCue</title></html>", "utf8");
    await writeFile(
      summaryPath,
      `# ApplyCue Run Summary

## Prepared Queue

1. Fintech Co - VP Product
   - Status: Prepared
   - Next: Review and approve before submit.

2. SaaS Co - Head of Product
   - Status: Prepared
   - Next: Review and approve before submit.

## Skipped Or Watch

- Legacy Co - Business Development Manager: Watch. Role is adjacent only. Next: Keep for later.
- Closed Co - Head of Product: Skip. Posting closed. Next: Do not apply.

## Next Actions

- Review generated CVs before enabling submit.
- Run browser preflight on approved applications.
`,
      "utf8"
    );
    await writeFile(
      manifestPath,
      JSON.stringify({
        id: "status-run",
        kind: "daily_batch",
        startedAt: "2026-07-06T00:00:00.000Z",
        completedAt: "2026-07-06T00:01:00.000Z",
        profileId: "handoff-candidate",
        jobIds: ["job-1", "job-2"],
        cvVariantIds: ["cv-1", "cv-2"],
        applicationIds: ["app-1", "app-2"],
        generatedFiles: [],
        sourceCodeWriteCount: 0,
        notes: []
      }),
      "utf8"
    );
    await writeFile(
      uatReportPath,
      JSON.stringify({
        id: "applycue-local-uat",
        status: "pass",
        generatedAt: "2026-07-06T00:02:00.000Z",
        checks: [],
        counts: {
          applications: 2,
          browserPlans: 2,
          browserReceipts: 2,
          cvs: 2,
          jobs: 2,
          reconciliationBlocked: 0,
          reconciliationNeedsConfirmation: 0,
          reconciliationPassed: 2
        },
        paths: {
          dashboard: dashboardPath,
          manifest: manifestPath,
          markdownReport: path.join(runsDir, "uat-report.md"),
          profile: profileDir,
          report: uatReportPath,
          summary: summaryPath
        },
        summary: "UAT passed."
      }),
      "utf8"
    );

    const report = await readApplyCueStatus({ applyCueHome, env: {} });
    const formatted = formatApplyCueStatus(report);

    expect(report.agentHandoff.readyQueue).toEqual([
      "Fintech Co - VP Product",
      "SaaS Co - Head of Product"
    ]);
    expect(report.agentHandoff.needsAttention).toEqual([
      "Legacy Co - Business Development Manager: Watch. Role is adjacent only. Next: Keep for later.",
      "Closed Co - Head of Product: Skip. Posting closed. Next: Do not apply."
    ]);
    expect(report.agentHandoff.nextSteps).toEqual([
      "Review generated CVs before enabling submit.",
      "Run browser preflight on approved applications."
    ]);
    expect(report.agentHandoff.commandCenter).toEqual(["pnpm form-data", "pnpm apply-route", "pnpm browser-live-preflight", "pnpm status"]);
    expect(formatted).toContain("Ready: Fintech Co - VP Product");
    expect(formatted).toContain("Needs attention: Legacy Co - Business Development Manager");
    expect(formatted).toContain("Next: Run browser preflight on approved applications.");
  });

  it("surfaces live preflight answer prompts in the agent handoff", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "applycue-status-live-prompts-"));
    const applyCueHome = path.join(workspace, "applycue-home");
    const profileDir = path.join(applyCueHome, "profiles", "default");
    const runsDir = path.join(profileDir, "outputs", "runs");
    const dashboardPath = path.join(profileDir, "outputs", "dashboard", "latest.html");
    const livePreflightDir = path.join(profileDir, "outputs", "live-preflight");
    const summaryPath = path.join(runsDir, "latest-summary.md");
    const manifestPath = path.join(runsDir, "status-run.json");
    const uatReportPath = path.join(runsDir, "uat-report.json");
    const liveReportPath = path.join(livePreflightDir, "live-preflight-report.json");
    const liveAnswerApprovalTemplatePath = path.join(livePreflightDir, "live-answer-approval-template.json");
    const liveAnswerPromptsHtmlPath = path.join(livePreflightDir, "live-answer-prompts.html");
    const liveAnswerPromptsMarkdownPath = path.join(livePreflightDir, "live-answer-prompts.md");
    await mkdir(path.join(profileDir, "outputs", "dashboard"), { recursive: true });
    await mkdir(runsDir, { recursive: true });
    await mkdir(livePreflightDir, { recursive: true });

    await writeFile(
      path.join(profileDir, "applycue.json"),
      JSON.stringify({
        profile: {
          name: "Live Prompt Candidate",
          email: "live@example.com",
          baseCvPath: "assets/base-cvs/live.md"
        },
        preferences: {
          targetRoleTerms: ["vp product"]
        }
      }),
      "utf8"
    );
    await writeFile(dashboardPath, "<html><title>ApplyCue</title></html>", "utf8");
    await writeFile(summaryPath, "# ApplyCue Run Summary\n\n## Prepared Queue\n\n1. Easyship - Senior Product Manager\n", "utf8");
    await writeFile(
      manifestPath,
      JSON.stringify({
        id: "status-run",
        kind: "daily_batch",
        startedAt: "2026-07-06T00:00:00.000Z",
        completedAt: "2026-07-06T00:01:00.000Z",
        profileId: "live-prompt-candidate",
        jobIds: ["job-1"],
        cvVariantIds: ["cv-1"],
        applicationIds: ["app-1"],
        generatedFiles: [
          {
            id: "plan-1-json-file",
            kind: "browser_plan_json",
            path: "outputs/browser-plans/plan-1.json",
            sourceIds: ["plan-1", "job-1"],
            createdAt: "2026-07-06T00:01:00.000Z"
          }
        ],
        sourceCodeWriteCount: 0,
        notes: []
      }),
      "utf8"
    );
    await writeFile(
      uatReportPath,
      JSON.stringify({
        id: "applycue-local-uat",
        status: "pass",
        generatedAt: "2026-07-06T00:02:00.000Z",
        checks: [],
        counts: {
          applications: 1,
          browserPlans: 1,
          browserReceipts: 1,
          cvs: 1,
          jobs: 1,
          reconciliationBlocked: 0,
          reconciliationNeedsConfirmation: 0,
          reconciliationPassed: 1
        },
        paths: {
          dashboard: dashboardPath,
          manifest: manifestPath,
          markdownReport: path.join(runsDir, "uat-report.md"),
          profile: profileDir,
          report: uatReportPath,
          summary: summaryPath
        },
        summary: "UAT passed."
      }),
      "utf8"
    );
    await writeFile(
      liveReportPath,
      JSON.stringify({
        id: "applycue-live-browser-preflight",
        status: "pause",
        generatedAt: "2026-07-06T00:03:00.000Z",
        selectedPlanId: "plan-1",
        selectedJobId: "job-1",
        selectedCompany: "Easyship",
        selectedRoleTitle: "Senior Product Manager",
        checkedUrl: "https://example.com/apply",
        answerPrompts: [
          {
            id: "answer-prompt-notice-period",
            field: "notice_period",
            question: "What is your notice period?",
            kind: "sensitive_required_field",
            canSaveAsReusable: true,
            requiresExplicitUserApproval: true,
            suggestedDryRunCommand: "pnpm approve-answers -- --dry-run --field \"notice_period\" --value \"<approved answer>\"",
            note: "Ask the user once."
          },
          {
            id: "answer-prompt-unlabeled-field",
            field: "unlabeled_field",
            question: "Unlabeled field",
            kind: "missing_required_field",
            canSaveAsReusable: false,
            requiresExplicitUserApproval: true,
            note: "Ask for this application only."
          }
        ],
        checks: [],
        paths: {
          answerPrompts: path.join(livePreflightDir, "live-answer-prompts.json"),
          answerPromptsHtml: liveAnswerPromptsHtmlPath,
          answerPromptsMarkdown: liveAnswerPromptsMarkdownPath,
          markdownReport: path.join(livePreflightDir, "live-preflight-report.md"),
          preflight: path.join(livePreflightDir, "live-preflight-result.json"),
          report: liveReportPath,
          snapshot: path.join(livePreflightDir, "live-page-snapshot.json")
        },
        summary: "Live browser preflight paused for Easyship: missing notice period."
      }),
      "utf8"
    );

    const report = await readApplyCueStatus({ applyCueHome, env: {} });
    const formatted = formatApplyCueStatus(report);

    expect(report.latestLivePreflight?.isCurrent).toBe(true);
    expect(report.latestLivePreflight?.answerPromptCount).toBe(2);
    expect(report.latestLivePreflight?.reusableAnswerPromptCount).toBe(1);
    expect(report.latestLivePreflight?.oneOffAnswerPromptCount).toBe(1);
    expect(report.latestLivePreflight?.answerQuestions).toEqual([
      "What is your notice period?",
      "One required field on the page had no visible label; inspect it before answering."
    ]);
    expect(report.latestLivePreflight?.approvalCommand).toContain("pnpm approve-answers -- --from-live");
    expect(report.latestLivePreflight?.approvalCommand).toContain("--set notice_period=");
    expect(report.nextAction).toContain("Ask the 2 live preflight answer prompt");
    expect(report.nextAction).toContain("--from-live");
    expect(report.agentHandoff.nextSteps).toHaveLength(1);
    expect(report.agentHandoff.nextSteps[0]).toContain("Ask the 2 live preflight answer prompt");
    expect(report.agentHandoff.nextSteps[0]).toContain("--from-live");
    expect(report.agentHandoff.commandCenter).toEqual([
      'pnpm approve-answers -- --from-live --set notice_period="<approved answer>" --dry-run',
      'pnpm approve-answers -- --from-live --set notice_period="<approved answer>"',
      "pnpm browser-live-preflight",
      "pnpm status"
    ]);
    expect(report.agentHandoff.needsAttention[0]).toBe(
      "Live preflight paused for Easyship - Senior Product Manager: 2 answer prompt(s) need review before filling the form."
    );
    expect(report.agentHandoff.evidence).toContain(`Live answer review page: ${liveAnswerPromptsHtmlPath}`);
    expect(report.agentHandoff.evidence).toContain(`Live answer prompts: ${liveAnswerPromptsMarkdownPath}`);
    expect(report.agentHandoff.evidence).toContain(`Live answer approval template: ${liveAnswerApprovalTemplatePath}`);
    expect(formatted).toContain("Live answer prompts: 2 question(s), 1 reusable with approval, 1 one-off.");
    expect(formatted).toContain("- Ask: What is your notice period?");
    expect(formatted).toContain("- Ask: One required field on the page had no visible label; inspect it before answering.");
    expect(formatted).toContain("Approval command: pnpm approve-answers -- --from-live");
    expect(formatted).toContain('pnpm approve-answers -- --from-live --set notice_period="<approved answer>" --dry-run');
    expect(formatted).toContain(`Answer review page: ${liveAnswerPromptsHtmlPath}`);
    expect(formatted).toContain(`Answer approval template: ${liveAnswerApprovalTemplatePath}`);
    expect(formatted).toContain("Ask the 2 live preflight answer prompt");
    expect(formatted).toContain("Next: Ask the 2 live preflight answer prompt");
  });

  it("routes a current passing live preflight to controlled live apply", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "applycue-status-live-pass-"));
    const applyCueHome = path.join(workspace, "applycue-home");
    const profileDir = path.join(applyCueHome, "profiles", "default");
    const runsDir = path.join(profileDir, "outputs", "runs");
    const dashboardPath = path.join(profileDir, "outputs", "dashboard", "latest.html");
    const livePreflightDir = path.join(profileDir, "outputs", "live-preflight");
    const summaryPath = path.join(runsDir, "latest-summary.md");
    const manifestPath = path.join(runsDir, "status-run.json");
    const uatReportPath = path.join(runsDir, "uat-report.json");
    const liveReportPath = path.join(livePreflightDir, "live-preflight-report.json");
    await mkdir(path.join(profileDir, "outputs", "dashboard"), { recursive: true });
    await mkdir(runsDir, { recursive: true });
    await mkdir(livePreflightDir, { recursive: true });

    await writeFile(
      path.join(profileDir, "applycue.json"),
      JSON.stringify({
        profile: {
          name: "Live Pass Candidate",
          email: "live-pass@example.com",
          baseCvPath: "assets/base-cvs/live-pass.md"
        },
        preferences: {
          targetRoleTerms: ["vp product"]
        }
      }),
      "utf8"
    );
    await writeFile(dashboardPath, "<html><title>ApplyCue</title></html>", "utf8");
    await writeFile(
      summaryPath,
      "# ApplyCue Run Summary\n\n## Prepared Queue\n\n1. Current Co - VP Product\n\n## Next Actions\n\n- Review generated CVs before enabling submit.",
      "utf8"
    );
    await writeFile(
      manifestPath,
      JSON.stringify({
        id: "status-run",
        kind: "daily_batch",
        startedAt: "2026-07-06T00:00:00.000Z",
        completedAt: "2026-07-06T00:01:00.000Z",
        profileId: "live-pass-candidate",
        jobIds: ["current-job"],
        cvVariantIds: ["current-cv"],
        applicationIds: ["current-app"],
        generatedFiles: [
          {
            id: "current-plan-json-file",
            kind: "browser_plan_json",
            path: "outputs/browser-plans/current-plan.json",
            sourceIds: ["current-plan", "current-job"],
            createdAt: "2026-07-06T00:01:00.000Z"
          }
        ],
        sourceCodeWriteCount: 0,
        notes: []
      }),
      "utf8"
    );
    await writeFile(
      uatReportPath,
      JSON.stringify({
        id: "applycue-local-uat",
        status: "pass",
        generatedAt: "2026-07-06T00:02:00.000Z",
        checks: [],
        counts: {
          applications: 1,
          browserPlans: 1,
          browserReceipts: 1,
          cvs: 1,
          jobs: 1,
          reconciliationBlocked: 0,
          reconciliationNeedsConfirmation: 0,
          reconciliationPassed: 1
        },
        paths: {
          dashboard: dashboardPath,
          manifest: manifestPath,
          markdownReport: path.join(runsDir, "uat-report.md"),
          profile: profileDir,
          report: uatReportPath,
          summary: summaryPath
        },
        summary: "UAT passed."
      }),
      "utf8"
    );
    await writeFile(
      liveReportPath,
      JSON.stringify({
        id: "applycue-live-browser-preflight",
        status: "pass",
        generatedAt: "2026-07-06T00:03:00.000Z",
        selectedPlanId: "current-plan",
        selectedJobId: "current-job",
        selectedCompany: "Current Co",
        selectedRoleTitle: "VP Product",
        checkedUrl: "https://example.com/apply",
        answerPrompts: [],
        checks: [],
        paths: {
          answerApprovalTemplate: path.join(livePreflightDir, "live-answer-approval-template.json"),
          answerPrompts: path.join(livePreflightDir, "live-answer-prompts.json"),
          answerPromptsHtml: path.join(livePreflightDir, "live-answer-prompts.html"),
          answerPromptsMarkdown: path.join(livePreflightDir, "live-answer-prompts.md"),
          markdownReport: path.join(livePreflightDir, "live-preflight-report.md"),
          preflight: path.join(livePreflightDir, "live-preflight-result.json"),
          report: liveReportPath,
          snapshot: path.join(livePreflightDir, "live-page-snapshot.json")
        },
        summary: "Live browser preflight passed for Current Co - VP Product."
      }),
      "utf8"
    );

    const report = await readApplyCueStatus({ applyCueHome, env: {} });
    const formatted = formatApplyCueStatus(report);

    expect(report.latestLivePreflight?.isCurrent).toBe(true);
    expect(report.agentHandoff.commandCenter).toEqual([
      "pnpm form-data",
      "pnpm browser-live-apply",
      "pnpm browser-live-preflight",
      "pnpm status"
    ]);
    expect(report.agentHandoff.nextSteps[0]).toBe("Confirm master form data if needed, then run controlled live apply to fill/upload in review mode and pause before final submit.");
    expect(report.nextAction).toBe("Confirm master form data if needed, then run controlled live apply to fill/upload in review mode and pause before final submit.");
    expect(formatted).toContain("- pnpm browser-live-apply");
  });

  it("does not route stale live preflight prompts when the prepared browser plan changed", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "applycue-status-stale-live-prompts-"));
    const applyCueHome = path.join(workspace, "applycue-home");
    const profileDir = path.join(applyCueHome, "profiles", "default");
    const runsDir = path.join(profileDir, "outputs", "runs");
    const dashboardPath = path.join(profileDir, "outputs", "dashboard", "latest.html");
    const livePreflightDir = path.join(profileDir, "outputs", "live-preflight");
    const summaryPath = path.join(runsDir, "latest-summary.md");
    const manifestPath = path.join(runsDir, "status-run.json");
    const uatReportPath = path.join(runsDir, "uat-report.json");
    const liveReportPath = path.join(livePreflightDir, "live-preflight-report.json");
    await mkdir(path.join(profileDir, "outputs", "dashboard"), { recursive: true });
    await mkdir(runsDir, { recursive: true });
    await mkdir(livePreflightDir, { recursive: true });

    await writeFile(
      path.join(profileDir, "applycue.json"),
      JSON.stringify({
        profile: {
          name: "Stale Prompt Candidate",
          email: "stale@example.com",
          baseCvPath: "assets/base-cvs/stale.md"
        },
        preferences: {
          targetRoleTerms: ["vp product"]
        }
      }),
      "utf8"
    );
    await writeFile(dashboardPath, "<html><title>ApplyCue</title></html>", "utf8");
    await writeFile(
      summaryPath,
      [
        "# ApplyCue Run Summary",
        "",
        "## Prepared Queue",
        "",
        "1. Current Co - VP Product",
        "",
        "## Next Actions",
        "",
        "- Review generated CVs before enabling submit."
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      manifestPath,
      JSON.stringify({
        id: "status-run",
        kind: "daily_batch",
        startedAt: "2026-07-06T00:00:00.000Z",
        completedAt: "2026-07-06T00:01:00.000Z",
        profileId: "stale-prompt-candidate",
        jobIds: ["current-job"],
        cvVariantIds: ["current-cv"],
        applicationIds: ["current-app"],
        generatedFiles: [
          {
            id: "current-plan-json-file",
            kind: "browser_plan_json",
            path: "outputs/browser-plans/current-plan.json",
            sourceIds: ["current-plan", "current-job"],
            createdAt: "2026-07-06T00:01:00.000Z"
          }
        ],
        sourceCodeWriteCount: 0,
        notes: []
      }),
      "utf8"
    );
    await writeFile(
      uatReportPath,
      JSON.stringify({
        id: "applycue-local-uat",
        status: "pass",
        generatedAt: "2026-07-06T00:02:00.000Z",
        checks: [],
        counts: {
          applications: 1,
          browserPlans: 1,
          browserReceipts: 1,
          cvs: 1,
          jobs: 1,
          reconciliationBlocked: 0,
          reconciliationNeedsConfirmation: 0,
          reconciliationPassed: 1
        },
        paths: {
          dashboard: dashboardPath,
          manifest: manifestPath,
          markdownReport: path.join(runsDir, "uat-report.md"),
          profile: profileDir,
          report: uatReportPath,
          summary: summaryPath
        },
        summary: "UAT passed."
      }),
      "utf8"
    );
    await writeFile(
      liveReportPath,
      JSON.stringify({
        id: "applycue-live-browser-preflight",
        status: "pause",
        generatedAt: "2026-07-06T00:03:00.000Z",
        selectedPlanId: "old-plan",
        selectedJobId: "old-job",
        selectedCompany: "Old Co",
        selectedRoleTitle: "Old Role",
        checkedUrl: "https://example.com/old-apply",
        answerPrompts: [
          {
            id: "answer-prompt-notice-period",
            field: "notice_period",
            question: "What is your notice period?",
            kind: "sensitive_required_field",
            canSaveAsReusable: true,
            requiresExplicitUserApproval: true,
            note: "Ask the user once."
          }
        ],
        checks: [],
        paths: {
          answerApprovalTemplate: path.join(livePreflightDir, "live-answer-approval-template.json"),
          answerPrompts: path.join(livePreflightDir, "live-answer-prompts.json"),
          answerPromptsHtml: path.join(livePreflightDir, "live-answer-prompts.html"),
          answerPromptsMarkdown: path.join(livePreflightDir, "live-answer-prompts.md"),
          markdownReport: path.join(livePreflightDir, "live-preflight-report.md"),
          preflight: path.join(livePreflightDir, "live-preflight-result.json"),
          report: liveReportPath,
          snapshot: path.join(livePreflightDir, "live-page-snapshot.json")
        },
        summary: "Live browser preflight paused for Old Co: missing notice period."
      }),
      "utf8"
    );

    const report = await readApplyCueStatus({ applyCueHome, env: {} });
    const formatted = formatApplyCueStatus(report);

    expect(report.latestLivePreflight?.isCurrent).toBe(false);
    expect(report.agentHandoff.commandCenter).toEqual(["pnpm form-data", "pnpm apply-route", "pnpm browser-live-preflight", "pnpm status"]);
    expect(report.agentHandoff.nextSteps).toEqual(["Review generated CVs before enabling submit."]);
    expect(report.agentHandoff.needsAttention).toEqual([]);
    expect(report.nextAction).toBe("Review and confirm master form data, then run apply-route for a prepared application and follow its browser/email/DM/API/manual handoff under the user's policy.");
    expect(formatted).toContain("Live preflight: stale - previous PAUSE for Old Co - Old Role no longer matches the current prepared browser plans.");
    expect(formatted).not.toContain("Live answer prompts: 1 question");
    expect(formatted).not.toContain("Answer review page:");
    expect(formatted).not.toContain("Ask the 1 live preflight answer prompt");
  });
});
