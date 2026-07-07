import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { executeBrowserPlanDryRun, type BrowserPlanDryRunResult } from "@applycue/browser-agent";
import type { ProgressApplicationItem, UserProfile } from "@applycue/core";
import { runLocalOrSampleBatch, type SampleBatchResult } from "@applycue/engine";
import { buildProgressSnapshot, renderProgressChatSummaryMarkdown, renderProgressDashboardHtml } from "@applycue/tracker";
import { setupApplyCue, type SetupApplyCueOptions } from "./setup.js";

export type UatStatus = "pass" | "warn" | "fail";

export interface UatCheck {
  id: string;
  label: string;
  status: UatStatus;
  detail: string;
}

export interface UatReport {
  id: string;
  status: UatStatus;
  generatedAt: string;
  checks: UatCheck[];
  counts: {
    applications: number;
    browserPlans: number;
    browserReceipts: number;
    cvs: number;
    jobs: number;
    reconciliationBlocked: number;
    reconciliationNeedsConfirmation: number;
    reconciliationPassed: number;
  };
  paths: {
    dashboard: string;
    manifest: string;
    markdownReport: string;
    profile: string;
    report: string;
    summary: string;
  };
  summary: string;
}

export async function runApplyCueUat(options: SetupApplyCueOptions = {}): Promise<UatReport> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const setup = await setupApplyCue(options);
  const batch = await runLocalOrSampleBatch({
    workspaceRoot,
    ...(options.applyCueHome ? { applyCueHome: options.applyCueHome } : {}),
    ...(options.profileKey ? { profileKey: options.profileKey } : {}),
    writeFiles: true
  });
  const dashboardPath = path.join(batch.outputRoot, "outputs", "dashboard", "latest.html");
  const manifestPath = path.join(batch.outputRoot, "outputs", "runs", `${batch.manifest.id}.json`);
  const reportPath = path.join(batch.outputRoot, "outputs", "runs", "uat-report.json");
  const markdownReportPath = path.join(batch.outputRoot, "outputs", "runs", "uat-report.md");
  const summaryPath = path.join(batch.outputRoot, "outputs", "runs", "latest-summary.md");
  const browserDryRuns = await writeBrowserDryRunReceipts(batch);
  await writeRunViewsWithBrowserReceipts(batch, browserDryRuns, dashboardPath, summaryPath);
  const checks = await buildChecks(setup.jobSpyStatus, batch, browserDryRuns, dashboardPath, manifestPath, summaryPath);
  const status = summarizeStatus(checks);
  const counts = {
    applications: batch.applications.length,
    browserPlans: batch.browserPlans.length,
    browserReceipts: browserDryRuns.length,
    cvs: batch.cvVariants.length,
    jobs: batch.jobs.length,
    reconciliationBlocked: batch.reconciliationReports.filter((report) => report.status === "blocked").length,
    reconciliationNeedsConfirmation: batch.reconciliationReports.filter((report) => report.status === "needs_user_confirmation").length,
    reconciliationPassed: batch.reconciliationReports.filter((report) => report.status === "passed").length
  };
  const report: UatReport = {
    id: "applycue-local-uat",
    status,
    generatedAt: new Date().toISOString(),
    checks,
    counts,
    paths: {
      dashboard: dashboardPath,
      manifest: manifestPath,
      markdownReport: markdownReportPath,
      profile: setup.profileDir,
      report: reportPath,
      summary: summaryPath
    },
    summary: createSummary(status, counts)
  };

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownReportPath, renderMarkdownReport(report), "utf8");
  return report;
}

async function buildChecks(
  jobSpyStatus: string,
  batch: SampleBatchResult,
  browserDryRuns: BrowserPlanDryRunResult[],
  dashboardPath: string,
  manifestPath: string,
  summaryPath: string
): Promise<UatCheck[]> {
  const cvCompleteness = analyzeRenderedCvCompleteness(batch);
  const closedJobSafety = analyzeClosedJobSafety(batch);
  return [
    {
      id: "profile-loaded",
      label: "Profile Loaded",
      status: batch.profile.id ? "pass" : "fail",
      detail: batch.profile.id ? `Profile ${batch.profile.id} loaded.` : "No profile id was loaded."
    },
    {
      id: "jobspy-tool",
      label: "JobSpy Tool",
      status: jobSpyStatus === "failed" ? "warn" : "pass",
      detail: `JobSpy status: ${jobSpyStatus}.`
    },
    {
      id: "job-supply",
      label: "Job Supply",
      status: batch.jobs.length > 0 ? "pass" : "fail",
      detail: `${batch.jobs.length} job(s) discovered.`
    },
    {
      id: "closed-job-safety",
      label: "Closed Job Safety",
      status: closedJobSafety.failed.length === 0 ? "pass" : "fail",
      detail: closedJobSafety.detail
    },
    {
      id: "cv-output",
      label: "CV Output",
      status: batch.cvVariants.length > 0 ? "pass" : "fail",
      detail: `${batch.cvVariants.length} CV variant(s) generated.`
    },
    {
      id: "cv-docx-output",
      label: "DOCX Upload Artifact",
      status: hasValidDocxArtifacts(batch) ? "pass" : "fail",
      detail: `${batch.cvDocxs.length} DOCX artifact(s) generated for ${batch.cvVariants.length} CV variant(s).`
    },
    {
      id: "cv-completeness",
      label: "CV Completeness",
      status: cvCompleteness.failed.length === 0 ? "pass" : "fail",
      detail: cvCompleteness.detail
    },
    {
      id: "application-output",
      label: "Application Drafts",
      status: batch.applications.length > 0 ? "pass" : "fail",
      detail: `${batch.applications.length} application draft(s) prepared.`
    },
    {
      id: "browser-plan-output",
      label: "Browser Plans",
      status: batch.browserPlans.length === batch.applications.length && batch.browserPlans.length > 0 ? "pass" : "fail",
      detail: `${batch.browserPlans.length} browser plan(s) created for ${batch.applications.length} application draft(s).`
    },
    {
      id: "browser-plan-docx",
      label: "Browser Plans Upload DOCX",
      status: browserPlansUploadDocx(batch) ? "pass" : "fail",
      detail: "Browser upload actions must use the generated DOCX artifact, not Markdown."
    },
    {
      id: "browser-preflight",
      label: "Browser Apply Preflight",
      status: browserPlansPreflightSafely(batch, browserDryRuns) ? "pass" : "fail",
      detail: `${browserDryRuns.length} browser plan preflight check(s) passed before fill/upload/submit actions.`
    },
    {
      id: "browser-plan-dry-run",
      label: "Browser Plan Dry Run",
      status: browserPlansDryRunSafely(batch, browserDryRuns) ? "pass" : "fail",
      detail: `${browserDryRuns.length} browser receipt(s) written from local dry-run execution.`
    },
    {
      id: "truth-check",
      label: "Truth Reconciliation",
      status: batch.reconciliationReports.some((report) => report.status === "blocked") ? "fail" : "pass",
      detail: `${batch.reconciliationReports.filter((report) => report.status === "blocked").length} blocked reconciliation report(s).`
    },
    {
      id: "format",
      label: "CV Format",
      status: batch.cvVariants.every((variant) => variant.formatMode === "standard_ats_v1") ? "pass" : "fail",
      detail: "All generated CVs must use standard_ats_v1."
    },
    {
      id: "source-code-invariant",
      label: "No Source Code Writes During Run",
      status: batch.manifest.sourceCodeWriteCount === 0 ? "pass" : "fail",
      detail: `sourceCodeWriteCount=${batch.manifest.sourceCodeWriteCount}.`
    },
    {
      id: "dashboard",
      label: "Dashboard Written",
      status: await fileExists(dashboardPath) ? "pass" : "fail",
      detail: dashboardPath
    },
    {
      id: "chat-summary",
      label: "Chat Summary Written",
      status: await fileExists(summaryPath) ? "pass" : "fail",
      detail: summaryPath
    },
    {
      id: "manifest",
      label: "Run Manifest Written",
      status: await fileExists(manifestPath) ? "pass" : "fail",
      detail: manifestPath
    },
    {
      id: "source-learning",
      label: "Source Learning",
      status: batch.manifest.sourceOutcomes &&
        batch.manifest.sourceOutcomes.trackedApplications >= batch.applications.length
        ? "pass"
        : "fail",
      detail: batch.manifest.sourceOutcomes
        ? `${batch.manifest.sourceOutcomes.trackedApplications} tracked application(s), ${batch.manifest.sourceOutcomes.positiveOutcomes} positive outcome(s).`
        : "No source outcome summary was written to the manifest."
    },
    {
      id: "batch-volume",
      label: "Review Batch Volume",
      status: batch.applications.length >= configuredApplicationsPerDay(batch) ? "pass" : "warn",
      detail: `Prepared ${batch.applications.length} of configured ${batch.profile.applySettings.applicationsPerDay} per day.`
    }
  ];
}

async function writeBrowserDryRunReceipts(batch: SampleBatchResult): Promise<BrowserPlanDryRunResult[]> {
  const receiptDir = path.join(batch.outputRoot, "outputs", "browser-receipts");
  await mkdir(receiptDir, { recursive: true });
  const results = batch.browserPlans.map((plan) => executeBrowserPlanDryRun(plan));
  await Promise.all(
    results.map((result) =>
      writeFile(
        path.join(receiptDir, `${result.receipt.id}.json`),
        `${JSON.stringify(result.receipt, null, 2)}\n`,
        "utf8"
      )
    )
  );
  return results;
}

async function writeRunViewsWithBrowserReceipts(
  batch: SampleBatchResult,
  browserDryRuns: BrowserPlanDryRunResult[],
  dashboardPath: string,
  summaryPath: string
): Promise<void> {
  const progressItems = attachBrowserReceipts(batch.progressItems, browserDryRuns);
  const snapshot = buildProgressSnapshot({
    id: "sample-dashboard",
    periodStart: "2026-07-06",
    periodEnd: "2026-07-06",
    applications: batch.applications,
    items: progressItems,
    jobDecisions: batch.jobDecisions,
    pendingQuestions: 0,
    nextActions: buildUatProgressNextActions(batch),
    notes: [
      ...batch.manifest.notes,
      `Browser dry-run receipts visible in dashboard and summary: ${browserDryRuns.length}.`
    ],
    outputRoot: batch.outputRoot,
    profileId: batch.profile.id,
    runId: batch.manifest.id,
    ...(batch.manifest.cvQuality ? { cvQuality: batch.manifest.cvQuality } : {}),
    ...(batch.manifest.scanHistory ? { scanHistory: batch.manifest.scanHistory } : {}),
    ...(batch.manifest.sourceOutcomes ? { sourceOutcomes: batch.manifest.sourceOutcomes } : {}),
    ...(batch.manifest.sourceQuality ? { sourceQuality: batch.manifest.sourceQuality } : {})
  });
  const dashboard = renderProgressDashboardHtml(snapshot);
  const summary = renderProgressChatSummaryMarkdown(snapshot);
  await writeFile(dashboardPath, dashboard, "utf8");
  await writeFile(summaryPath, summary, "utf8");
}

function attachBrowserReceipts(
  items: ProgressApplicationItem[],
  browserDryRuns: BrowserPlanDryRunResult[]
): ProgressApplicationItem[] {
  const receiptByJobId = new Map(browserDryRuns.map((result) => [result.receipt.jobId, result.receipt]));
  return items.map((item) => {
    const receipt = receiptByJobId.get(item.jobId);
    if (!receipt) return item;
    return {
      ...item,
      browserReceiptPath: `outputs/browser-receipts/${receipt.id}.json`,
      browserReceiptStatus: receipt.status
    };
  });
}

function buildUatProgressNextActions(batch: SampleBatchResult): string[] {
  const configuredDailyTarget = configuredApplicationsPerDay(batch);
  const actions = ["Review generated CVs, reconciliation reports, and browser receipts before enabling submit."];
  if (batch.applications.length < configuredDailyTarget) {
    actions.unshift(
      `Daily target short by ${configuredDailyTarget - batch.applications.length}; add or approve more sources, or widen search before increasing automation.`
    );
  }
  return actions;
}

function configuredApplicationsPerDay(batch: SampleBatchResult): number {
  return Math.max(1, Math.floor(batch.profile.applySettings.applicationsPerDay || 1));
}

function hasValidDocxArtifacts(batch: SampleBatchResult): boolean {
  return batch.cvDocxs.length === batch.cvVariants.length &&
    batch.cvDocxs.length > 0 &&
    batch.cvDocxs.every((item) => item.docx.subarray(0, 2).toString("utf8") === "PK");
}

interface ClosedJobSafetyAudit {
  detail: string;
  failed: string[];
}

function analyzeClosedJobSafety(batch: SampleBatchResult): ClosedJobSafetyAudit {
  const closedJobIds = new Set(batch.jobs.filter((job) => job.liveState === "closed").map((job) => job.id));
  if (closedJobIds.size === 0) {
    return {
      detail: "No closed jobs were present in this run.",
      failed: []
    };
  }

  const failed = [
    ...batch.cvVariants.filter((variant) => closedJobIds.has(variant.jobId)).map((variant) => `cv:${variant.jobId}`),
    ...batch.drafts.filter((draft) => closedJobIds.has(draft.jobId)).map((draft) => `draft:${draft.jobId}`),
    ...batch.applications.filter((application) => closedJobIds.has(application.jobId)).map((application) => `application:${application.jobId}`),
    ...batch.browserPlans.filter((plan) => closedJobIds.has(plan.jobId)).map((plan) => `browser:${plan.jobId}`)
  ];

  return {
    detail: failed.length > 0
      ? `Closed jobs reached preparation artifacts: ${failed.slice(0, 5).join(", ")}.`
      : `${closedJobIds.size} closed job(s) stayed out of CV, application, and browser preparation.`,
    failed
  };
}

interface RenderedCvCompletenessAudit {
  detail: string;
  failed: Array<{
    cvVariantId: string;
    missing: string[];
  }>;
}

function analyzeRenderedCvCompleteness(batch: SampleBatchResult): RenderedCvCompletenessAudit {
  if (batch.cvMarkdowns.length === 0) {
    return {
      detail: "No rendered CV Markdown artifacts were available to inspect.",
      failed: [{ cvVariantId: "none", missing: ["rendered CV markdown"] }]
    };
  }

  const summaries = batch.cvMarkdowns.map((item) => {
    const missing = missingRenderedCvItems(item.markdown, batch.profile);
    const employerBulletCounts = countEmployerSectionBullets(item.markdown);
    return {
      cvVariantId: item.cvVariantId,
      charCount: item.markdown.trim().length,
      bulletCount: countMarkdownBullets(item.markdown),
      employerHeadingCount: countEmployerHeadings(item.markdown),
      minEmployerBullets: employerBulletCounts.length > 0 ? Math.min(...employerBulletCounts) : 0,
      missing
    };
  });
  const failed = summaries
    .filter((summary) => summary.missing.length > 0)
    .map((summary) => ({
      cvVariantId: summary.cvVariantId,
      missing: summary.missing
    }));

  if (failed.length > 0) {
    return {
      detail: `Failed ${failed.length} of ${summaries.length}: ${failed
        .slice(0, 3)
        .map((item) => `${item.cvVariantId} missing ${item.missing.join(", ")}`)
        .join("; ")}.`,
      failed
    };
  }

  const minimumChars = Math.min(...summaries.map((summary) => summary.charCount));
  const minimumBullets = Math.min(...summaries.map((summary) => summary.bulletCount));
  const employerCount = Math.min(...summaries.map((summary) => summary.employerHeadingCount));
  const minEmployerBullets = Math.min(...summaries.map((summary) => summary.minEmployerBullets));
  const baseChars = batch.profile.baseCvText?.trim().length ?? 0;
  const baseRatio = baseChars > 0 ? Math.round((minimumChars / baseChars) * 100) : undefined;
  const baseRatioText = baseRatio ? `, ${baseRatio}% of base CV` : "";
  return {
    detail: `All ${summaries.length} CV(s) include identity, contact when configured, required sections, enough content, named employer structure, no near-duplicate bullets, and role-specific substance. Minimum: ${minimumChars} chars${baseRatioText}, ${minimumBullets} bullets, ${employerCount} employer heading(s), ${minEmployerBullets} bullet(s) in the thinnest employer section.`,
    failed: []
  };
}

function missingRenderedCvItems(markdown: string, profile: UserProfile): string[] {
  const missing: string[] = [];
  const trimmed = markdown.trim();
  const minimumChars = minimumRenderedCvChars(profile);
  const expectedEmployerHeadings = expectedEmployerHeadingCount(profile);
  const bulletCount = countMarkdownBullets(markdown);
  const minimumBullets = expectedEmployerHeadings > 0 ? Math.max(12, expectedEmployerHeadings * 2) : 1;

  if (trimmed.length < minimumChars) missing.push(`at least ${minimumChars} characters`);
  if (profile.name && !containsText(trimmed, profile.name)) missing.push("candidate name");
  if (profile.contact?.email && !containsText(trimmed, profile.contact.email)) missing.push("email");
  if (profile.contact?.phone && !containsText(trimmed, profile.contact.phone)) missing.push("phone");
  if (!/^## Summary\b/m.test(markdown)) missing.push("summary section");
  if (!/^## Core Skills\b/m.test(markdown)) missing.push("core skills section");
  if (!/^## Experience\b/m.test(markdown)) missing.push("experience section");
  if (bulletCount < minimumBullets) missing.push(`at least ${minimumBullets} bullets`);
  const missingEmployerNames = missingConfiguredEmployerNames(markdown, profile);
  if (missingEmployerNames.length > 0) {
    missing.push(`configured employer name(s): ${missingEmployerNames.slice(0, 3).join(", ")}`);
  }
  if (expectedEmployerHeadings > 0 && countEmployerHeadings(markdown) < expectedEmployerHeadings) {
    missing.push(`${expectedEmployerHeadings} employer heading(s)`);
  }
  if (expectedEmployerHeadings > 0 && countEmployerSectionsWithoutBullets(markdown) > 0) {
    missing.push("non-empty employer sections");
  }
  if (expectedEmployerHeadings > 0 && countEmployerSectionsBelowBulletMinimum(markdown, 2) > 0) {
    missing.push("at least 2 bullets in every employer section");
  }
  const duplicateBulletCount = countNearDuplicateBullets(markdown);
  if (duplicateBulletCount > 0) {
    missing.push(`no near-duplicate bullets (${duplicateBulletCount} found)`);
  }
  if (hasBaseCvSection(profile.baseCvText, /^awards\b/i) && !/^## Awards\b/m.test(markdown)) {
    missing.push("awards section from base CV");
  }
  if (hasBaseCvSection(profile.baseCvText, /^education\b/i) && !/^## Education\b/m.test(markdown)) {
    missing.push("education section from base CV");
  }
  if (/^## CV Status\b/m.test(markdown)) missing.push("passed CV without status pause section");

  return missing;
}

function minimumRenderedCvChars(profile: UserProfile): number {
  const baseLength = profile.baseCvText?.trim().length ?? 0;
  if (baseLength >= 5000) return Math.min(Math.max(4200, Math.floor(baseLength * 0.55)), 6500);
  if (baseLength >= 3000) return Math.min(Math.max(2200, Math.floor(baseLength * 0.45)), 4200);
  if (baseLength >= 1200) return Math.max(900, Math.floor(baseLength * 0.35));
  if (profile.pastEmployers.length > 0) return 900;
  return 250;
}

function expectedEmployerHeadingCount(profile: UserProfile): number {
  return profile.pastEmployers.length;
}

function hasBaseCvSection(baseCvText: string | undefined, matcher: RegExp): boolean {
  if (!baseCvText) return false;
  return baseCvText
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .some((line) => matcher.test(line));
}

function countMarkdownBullets(markdown: string): number {
  return markdown.split(/\r\n|\n|\r/).filter((line) => /^-\s+\S/.test(line)).length;
}

function countEmployerHeadings(markdown: string): number {
  return getMarkdownSectionLines(markdown, "Experience").filter((line) => /^###\s+\S/.test(line)).length;
}

function missingConfiguredEmployerNames(markdown: string, profile: UserProfile): string[] {
  const experience = getMarkdownSectionLines(markdown, "Experience").join("\n").toLowerCase();
  return profile.pastEmployers
    .map((employer) => employer.company?.trim())
    .filter((company): company is string => Boolean(company))
    .filter((company) => !experience.includes(company.toLowerCase()));
}

function countEmployerSectionBullets(markdown: string): number[] {
  const experienceBody = getMarkdownSectionLines(markdown, "Experience").join("\n");
  return experienceBody
    .split(/^###\s+/m)
    .slice(1)
    .map((section) => section.split(/\r\n|\n|\r/).filter((line) => /^-\s+\S/.test(line)).length);
}

function countEmployerSectionsWithoutBullets(markdown: string): number {
  return countEmployerSectionBullets(markdown).filter((count) => count === 0).length;
}

function countEmployerSectionsBelowBulletMinimum(markdown: string, minimumBullets: number): number {
  return countEmployerSectionBullets(markdown).filter((count) => count < minimumBullets).length;
}

function countNearDuplicateBullets(markdown: string): number {
  const bullets = markdown
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim().match(/^-\s+(.+)$/)?.[1]?.trim())
    .filter((line): line is string => Boolean(line));
  let duplicateCount = 0;
  const accepted: string[] = [];
  for (const bullet of bullets) {
    if (accepted.some((existing) => textValuesAreSimilar(existing, bullet))) {
      duplicateCount += 1;
    } else {
      accepted.push(bullet);
    }
  }
  return duplicateCount;
}

function textValuesAreSimilar(left: string, right: string): boolean {
  const leftText = normalizeAuditText(left);
  const rightText = normalizeAuditText(right);
  if (!leftText || !rightText) return false;
  if (leftText === rightText) return true;
  if (leftText.length > 40 && rightText.length > 40 && (leftText.includes(rightText) || rightText.includes(leftText))) {
    return true;
  }
  const leftTokens = uniqueAuditTokens(leftText);
  const rightTokens = uniqueAuditTokens(rightText);
  if (leftTokens.length < 5 || rightTokens.length < 5) return false;
  if (auditLeadTokensAreSimilar(leftTokens, rightTokens)) return true;
  const rightSet = new Set(rightTokens);
  const common = leftTokens.filter((token) => rightSet.has(token)).length;
  const overlap = common / Math.min(leftTokens.length, rightTokens.length);
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const jaccard = common / union;
  return overlap >= 0.75 || jaccard >= 0.62;
}

function auditLeadTokensAreSimilar(leftTokens: string[], rightTokens: string[]): boolean {
  const leftLead = semanticAuditLeadTokens(leftTokens);
  const rightLead = semanticAuditLeadTokens(rightTokens);
  if (leftLead.length < 8 || rightLead.length < 8) return false;
  const rightSet = new Set(rightLead);
  const common = leftLead.filter((token) => rightSet.has(token)).length;
  return common / Math.min(leftLead.length, rightLead.length) >= 0.8;
}

function semanticAuditLeadTokens(tokens: string[]): string[] {
  return tokens.filter((token) => !/\d/.test(token)).slice(0, 10);
}

function uniqueAuditTokens(value: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const token of significantAuditTokens(value)) {
    if (seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}

function significantAuditTokens(value: string): string[] {
  const stop = new Set(["and", "or", "the", "for", "with", "to", "of", "in", "a", "an"]);
  return normalizeAuditText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !stop.has(token))
    .map(canonicalAuditToken);
}

function normalizeAuditText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function canonicalAuditToken(token: string): string {
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

function containsText(text: string, expected: string): boolean {
  return text.toLowerCase().includes(expected.trim().toLowerCase());
}

function getMarkdownSectionLines(markdown: string, heading: string): string[] {
  const lines = markdown.split(/\r\n|\n|\r/);
  const startIndex = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (startIndex === -1) return [];
  const endIndex = lines.findIndex((line, index) => index > startIndex && /^##\s+\S/.test(line));
  return lines.slice(startIndex + 1, endIndex === -1 ? lines.length : endIndex);
}

function browserPlansUploadDocx(batch: SampleBatchResult): boolean {
  return batch.browserPlans.length > 0 &&
    batch.browserPlans.every((plan) => {
      const uploadActions = plan.actions.filter((action) => action.type === "upload_file");
      return uploadActions.length > 0 &&
        uploadActions.every((action) => action.value?.toLowerCase().endsWith(".docx")) &&
        Boolean(plan.cvPath?.toLowerCase().endsWith(".docx"));
    });
}

function browserPlansPreflightSafely(batch: SampleBatchResult, results: BrowserPlanDryRunResult[]): boolean {
  return results.length === batch.browserPlans.length &&
    results.length > 0 &&
    results.every((result) => result.preflight.status === "pass");
}

function browserPlansDryRunSafely(batch: SampleBatchResult, results: BrowserPlanDryRunResult[]): boolean {
  return results.length === batch.browserPlans.length &&
    results.length > 0 &&
    results.every((result) => result.status === "paused" || result.status === "submitted") &&
    results.every((result) => result.actionLog.some((entry) => entry.actionType === "upload_file" && entry.status === "done")) &&
    batch.browserPlans.every((plan, index) => {
      const result = results[index];
      if (!result) return false;
      if (plan.canSubmit) return result.receipt.status === "submitted";
      return result.receipt.status === "paused";
    });
}

function summarizeStatus(checks: UatCheck[]): UatStatus {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "warn")) return "warn";
  return "pass";
}

function createSummary(status: UatStatus, counts: UatReport["counts"]): string {
  if (status === "pass") {
    return `UAT passed: found ${counts.jobs} job(s), generated ${counts.cvs} CV(s), prepared ${counts.applications} application draft(s), and created ${counts.browserPlans} browser plan(s).`;
  }
  if (status === "warn") {
    return `UAT is usable with warnings: found ${counts.jobs} job(s), generated ${counts.cvs} CV(s), prepared ${counts.applications} application draft(s), and created ${counts.browserPlans} browser plan(s).`;
  }
  return `UAT failed: found ${counts.jobs} job(s), generated ${counts.cvs} CV(s), prepared ${counts.applications} application draft(s), and created ${counts.browserPlans} browser plan(s).`;
}

function renderMarkdownReport(report: UatReport): string {
  const checks = report.checks
    .map((check) => `| ${check.label} | ${check.status.toUpperCase()} | ${check.detail.replace(/\|/g, "/")} |`)
    .join("\n");
  return `# ApplyCue UAT Report

Status: ${report.status.toUpperCase()}

${report.summary}

## Counts

- Jobs found: ${report.counts.jobs}
- CVs generated: ${report.counts.cvs}
- Application drafts: ${report.counts.applications}
- Browser plans: ${report.counts.browserPlans}
- Browser dry-run receipts: ${report.counts.browserReceipts}
- Reconciliation passed: ${report.counts.reconciliationPassed}
- Reconciliation needs confirmation: ${report.counts.reconciliationNeedsConfirmation}
- Reconciliation blocked: ${report.counts.reconciliationBlocked}

## Checks

| Check | Status | Detail |
| --- | --- | --- |
${checks}

## Paths

- Dashboard: ${report.paths.dashboard}
- Summary: ${report.paths.summary}
- Manifest: ${report.paths.manifest}
- JSON report: ${report.paths.report}
`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
