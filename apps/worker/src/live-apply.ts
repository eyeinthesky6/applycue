import {
  createPlaywrightBrowserApplyController,
  executeBrowserApplyPlan,
  type BrowserPlanExecutionResult,
  type PlaywrightLikePage
} from "@applycue/browser-agent";
import type { ApplicationReceipt, BrowserApplyAction, BrowserApplyPlan } from "@applycue/core";
import { runLocalOrSampleBatch, writeProgressDashboardAndSummary, type SampleBatchResult } from "@applycue/engine";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LiveBrowserPreflightReport } from "./live-preflight.js";
import type { SetupApplyCueOptions } from "./setup.js";

export type LiveBrowserApplyStatus = "pass" | "fail" | "skipped";

export interface LiveBrowserApplyCheck {
  id: string;
  label: string;
  status: LiveBrowserApplyStatus;
  detail: string;
}

export interface LiveBrowserApplyReport {
  id: string;
  status: LiveBrowserApplyStatus;
  generatedAt: string;
  selectedPlanId?: string;
  selectedJobId?: string;
  selectedCompany?: string;
  selectedRoleTitle?: string;
  checkedUrl?: string;
  allowSubmit: boolean;
  forcedReviewMode: boolean;
  resultStatus?: BrowserPlanExecutionResult["status"];
  receiptStatus?: ApplicationReceipt["status"];
  checks: LiveBrowserApplyCheck[];
  paths: {
    markdownReport: string;
    plan: string;
    receipt: string;
    report: string;
  };
  summary: string;
}

export interface LiveBrowserApplyOptions extends SetupApplyCueOptions {
  allowSubmit?: boolean;
  batch?: Pick<SampleBatchResult, "browserPlans" | "outputRoot">;
  importPlaywright?: DynamicImport;
  jobId?: string;
  planId?: string;
  playwright?: PlaywrightModule;
}

interface PlaywrightBrowser {
  close(): Promise<unknown>;
  newPage(): Promise<PlaywrightLikePage>;
}

interface PlaywrightModule {
  chromium: {
    launch(options?: { headless?: boolean }): Promise<PlaywrightBrowser>;
  };
}

type DynamicImport = (specifier: string) => Promise<unknown>;

const dynamicImport: DynamicImport = new Function("specifier", "return import(specifier)") as DynamicImport;

export async function runLiveBrowserApply(options: LiveBrowserApplyOptions = {}): Promise<LiveBrowserApplyReport> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const batch = options.batch ?? await runLocalOrSampleBatch({
    workspaceRoot,
    ...(options.applyCueHome ? { applyCueHome: options.applyCueHome } : {}),
    ...(options.profileKey ? { profileKey: options.profileKey } : {}),
    writeFiles: true
  });
  const outputDir = path.join(batch.outputRoot, "outputs", "live-apply");
  await mkdir(outputDir, { recursive: true });

  const preflightReport = await readLatestLivePreflightReport(batch.outputRoot);
  const selectedPlan = selectLiveApplyPlan(batch.browserPlans, options, preflightReport);
  const genericPaths = liveApplyPaths(batch.outputRoot, outputDir, "live-apply");
  if (!selectedPlan) {
    return writeLiveApplyReport(batch, {
      id: "applycue-live-browser-apply",
      status: "fail",
      generatedAt: new Date().toISOString(),
      allowSubmit: Boolean(options.allowSubmit),
      forcedReviewMode: options.allowSubmit !== true,
      checks: [{
        id: "browser-plan",
        label: "Browser Plan Available",
        status: "fail",
        detail: "No browser apply plan matched the live apply request."
      }],
      paths: genericPaths,
      summary: "Live browser apply failed: no matching browser plan was available."
    });
  }

  const paths = liveApplyPaths(batch.outputRoot, outputDir, safeFileSegment(selectedPlan.id));
  const preflightGate = validatePassedPreflight(preflightReport, selectedPlan);
  if (preflightGate.status === "fail") {
    return writeLiveApplyReport(batch, reportForPreLaunchFailure({
      allowSubmit: Boolean(options.allowSubmit),
      checks: [
        {
          id: "browser-plan",
          label: "Browser Plan Available",
          status: "pass",
          detail: `Selected ${selectedPlan.id}.`
        },
        preflightGate.check
      ],
      paths,
      plan: selectedPlan,
      summary: "Live browser apply blocked: run a current passing live preflight before filling the portal."
    }));
  }

  const preparation = await prepareLiveExecutionPlan(selectedPlan, {
    allowSubmit: Boolean(options.allowSubmit),
    outputRoot: batch.outputRoot
  });
  if (preparation.status === "fail") {
    return writeLiveApplyReport(batch, reportForPreLaunchFailure({
      allowSubmit: Boolean(options.allowSubmit),
      checks: [
        {
          id: "browser-plan",
          label: "Browser Plan Available",
          status: "pass",
          detail: `Selected ${selectedPlan.id}.`
        },
        preflightGate.check,
        ...preparation.checks
      ],
      paths,
      plan: selectedPlan,
      summary: "Live browser apply failed before launch: the selected plan was not safe to execute."
    }));
  }

  const playwright = options.playwright ?? await loadOptionalPlaywright(options.importPlaywright ?? dynamicImport);
  if (!playwright) {
    return writeLiveApplyReport(batch, reportForPreLaunchFailure({
      allowSubmit: Boolean(options.allowSubmit),
      checks: [
        {
          id: "browser-plan",
          label: "Browser Plan Available",
          status: "pass",
          detail: `Selected ${selectedPlan.id}.`
        },
        preflightGate.check,
        ...preparation.checks,
        {
          id: "playwright-available",
          label: "Browser Tool Available",
          status: "skipped",
          detail: "The browser tool is not installed, so the live page was not filled."
        }
      ],
      paths,
      plan: selectedPlan,
      status: "skipped",
      summary: "Live browser apply skipped: browser tooling is not installed."
    }));
  }

  await writeFile(paths.plan, `${JSON.stringify(preparation.plan, null, 2)}\n`, "utf8");

  let browser: PlaywrightBrowser | undefined;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();
    const controller = createPlaywrightBrowserApplyController(page);
    const result = await executeBrowserApplyPlan(preparation.plan, controller, {
      ...(selectedPlan.company ? { expectedCompany: selectedPlan.company } : {}),
      ...(selectedPlan.roleTitle ? { expectedRole: selectedPlan.roleTitle } : {})
    });
    await mkdir(path.dirname(paths.receipt), { recursive: true });
    await writeFile(paths.receipt, `${JSON.stringify(result.receipt, null, 2)}\n`, "utf8");
    return writeLiveApplyReport(batch, buildExecutionReport({
      allowSubmit: Boolean(options.allowSubmit),
      checks: [
        {
          id: "browser-plan",
          label: "Browser Plan Available",
          status: "pass",
          detail: `Selected ${selectedPlan.id}.`
        },
        preflightGate.check,
        ...preparation.checks
      ],
      paths,
      plan: selectedPlan,
      result
    }));
  } catch (error) {
    return writeLiveApplyReport(batch, reportForPreLaunchFailure({
      allowSubmit: Boolean(options.allowSubmit),
      checks: [
        {
          id: "browser-plan",
          label: "Browser Plan Available",
          status: "pass",
          detail: `Selected ${selectedPlan.id}.`
        },
        preflightGate.check,
        ...preparation.checks,
        {
          id: "browser-launch-or-run",
          label: "Browser Launch And Run",
          status: "fail",
          detail: error instanceof Error ? error.message : String(error)
        }
      ],
      paths,
      plan: selectedPlan,
      summary: "Live browser apply failed while launching or running the browser. No successful receipt was written."
    }));
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

function buildExecutionReport(input: {
  allowSubmit: boolean;
  checks: LiveBrowserApplyCheck[];
  paths: LiveBrowserApplyReport["paths"];
  plan: BrowserApplyPlan;
  result: BrowserPlanExecutionResult;
}): LiveBrowserApplyReport {
  const uploadDone = input.result.actionLog.some((entry) => entry.actionType === "upload_file" && entry.status === "done");
  const submitDone = input.result.actionLog.some((entry) => entry.actionType === "submit" && entry.status === "done");
  const preflightPassed = input.result.preflight.status === "pass";
  const executionChecks: LiveBrowserApplyCheck[] = [
    ...input.checks,
    {
      id: "browser-preflight",
      label: "Browser Preflight Recheck",
      status: preflightPassed ? "pass" : "fail",
      detail: input.result.preflight.reasons.length > 0
        ? input.result.preflight.reasons.join("; ")
        : "Visible live page still matched the selected company/role and required fields."
    },
    {
      id: "browser-fill-upload",
      label: "Browser Fill And Upload",
      status: uploadDone ? "pass" : "fail",
      detail: uploadDone
        ? "The browser filled planned fields and uploaded the generated DOCX artifact."
        : "The browser did not complete the planned DOCX upload."
    },
    input.allowSubmit
      ? {
          id: "submit-gate",
          label: "Submit Gate",
          status: input.result.status === "submitted" && submitDone ? "pass" : "fail",
          detail: input.result.status === "submitted" && submitDone
            ? "The browser submitted only because the plan and command both allowed it."
            : "Submit was requested, but the browser did not capture a submitted receipt."
        }
      : {
          id: "review-gate",
          label: "Review Gate",
          status: input.result.status === "paused" && !submitDone ? "pass" : "fail",
          detail: input.result.status === "paused" && !submitDone
            ? "The live browser run paused before submit as required."
            : "The live browser run did not stop at the review gate."
        }
  ];
  const status: LiveBrowserApplyStatus = executionChecks.some((check) => check.status === "fail") ? "fail" : "pass";
  return {
    id: "applycue-live-browser-apply",
    status,
    generatedAt: new Date().toISOString(),
    selectedPlanId: input.plan.id,
    selectedJobId: input.plan.jobId,
    ...(input.plan.company ? { selectedCompany: input.plan.company } : {}),
    ...(input.plan.roleTitle ? { selectedRoleTitle: input.plan.roleTitle } : {}),
    checkedUrl: input.plan.url,
    allowSubmit: input.allowSubmit,
    forcedReviewMode: !input.allowSubmit,
    resultStatus: input.result.status,
    receiptStatus: input.result.receipt.status,
    checks: executionChecks,
    paths: input.paths,
    summary: status === "pass"
      ? summaryForSuccessfulExecution(input.plan, input.allowSubmit, input.result)
      : "Live browser apply failed: the controlled browser execution did not complete all required checks."
  };
}

function summaryForSuccessfulExecution(
  plan: BrowserApplyPlan,
  allowSubmit: boolean,
  result: BrowserPlanExecutionResult
): string {
  const label = `${plan.company ?? "selected company"} - ${plan.roleTitle ?? "selected role"}`;
  if (allowSubmit && result.status === "submitted") {
    return `Live browser apply submitted ${label} and captured a receipt under ApplyCue policy.`;
  }
  return `Live browser apply prepared ${label}: filled planned fields, uploaded the generated DOCX, and paused before submit.`;
}

function reportForPreLaunchFailure(input: {
  allowSubmit: boolean;
  checks: LiveBrowserApplyCheck[];
  paths: LiveBrowserApplyReport["paths"];
  plan?: BrowserApplyPlan;
  status?: LiveBrowserApplyStatus;
  summary: string;
}): LiveBrowserApplyReport {
  return {
    id: "applycue-live-browser-apply",
    status: input.status ?? "fail",
    generatedAt: new Date().toISOString(),
    ...(input.plan ? { selectedPlanId: input.plan.id, selectedJobId: input.plan.jobId } : {}),
    ...(input.plan?.company ? { selectedCompany: input.plan.company } : {}),
    ...(input.plan?.roleTitle ? { selectedRoleTitle: input.plan.roleTitle } : {}),
    ...(input.plan?.url ? { checkedUrl: input.plan.url } : {}),
    allowSubmit: input.allowSubmit,
    forcedReviewMode: !input.allowSubmit,
    checks: input.checks,
    paths: input.paths,
    summary: input.summary
  };
}

async function prepareLiveExecutionPlan(
  plan: BrowserApplyPlan,
  options: { allowSubmit: boolean; outputRoot: string }
): Promise<{ checks: LiveBrowserApplyCheck[]; plan: BrowserApplyPlan; status: "pass" } | { checks: LiveBrowserApplyCheck[]; status: "fail" }> {
  const checks: LiveBrowserApplyCheck[] = [];
  if (options.allowSubmit && (!plan.canSubmit || plan.submitRequiresApproval || plan.pauseReasons.length > 0)) {
    return {
      status: "fail",
      checks: [{
        id: "submit-policy",
        label: "Submit Policy",
        status: "fail",
        detail: "Submit was requested, but the selected plan still requires review or has pause reasons."
      }]
    };
  }

  const uploadActions = plan.actions.filter((action) => action.type === "upload_file");
  if (uploadActions.length === 0) {
    return {
      status: "fail",
      checks: [{
        id: "docx-upload",
        label: "DOCX Upload Artifact",
        status: "fail",
        detail: "The selected plan has no generated CV upload action."
      }]
    };
  }

  const resolvedActions: BrowserApplyAction[] = [];
  for (const action of plan.actions) {
    if (action.type === "upload_file") {
      const resolved = resolveUserStorePath(action.value, options.outputRoot);
      if (!resolved.toLowerCase().endsWith(".docx")) {
        return {
          status: "fail",
          checks: [{
            id: "docx-upload",
            label: "DOCX Upload Artifact",
            status: "fail",
            detail: `Upload action must point to DOCX, got ${action.value ?? "missing value"}.`
          }]
        };
      }
      if (!await fileExists(resolved)) {
        return {
          status: "fail",
          checks: [{
            id: "docx-upload",
            label: "DOCX Upload Artifact",
            status: "fail",
            detail: `Generated DOCX was not found: ${resolved}.`
          }]
        };
      }
      resolvedActions.push({
        ...action,
        value: resolved
      });
    } else if ((action.type === "submit" || action.type === "capture_receipt") && !options.allowSubmit) {
      continue;
    } else {
      resolvedActions.push(action);
    }
  }

  if (!options.allowSubmit && !resolvedActions.some((action) => action.type === "pause")) {
    resolvedActions.push({
      id: `${plan.id}-live-apply-pause`,
      type: "pause",
      label: "Pause before final submit",
      value: "live_apply_review_gate",
      pauseReason: "user_approval_required",
      requiresApproval: true
    });
  }

  const executionPlan: BrowserApplyPlan = {
    ...plan,
    id: options.allowSubmit ? plan.id : `${plan.id}-live-review`,
    applyMode: options.allowSubmit ? plan.applyMode : "review",
    canSubmit: options.allowSubmit ? plan.canSubmit : false,
    submitRequiresApproval: options.allowSubmit ? plan.submitRequiresApproval : true,
    pauseReasons: options.allowSubmit ? plan.pauseReasons : uniquePauseReasons([...plan.pauseReasons, "user_approval_required"]),
    actions: resolvedActions,
    ...(plan.cvPath ? { cvPath: resolveUserStorePath(plan.cvPath, options.outputRoot) } : {})
  };

  return {
    status: "pass",
    checks: [
      ...checks,
      {
        id: "docx-upload",
        label: "DOCX Upload Artifact",
        status: "pass",
        detail: `${uploadActions.length} generated DOCX upload action(s) resolved under the active user store.`
      },
      {
        id: options.allowSubmit ? "submit-policy" : "safe-review-copy",
        label: options.allowSubmit ? "Submit Policy" : "Safe Review Copy",
        status: "pass",
        detail: options.allowSubmit
          ? "The selected plan and command both allow submit."
          : "The live plan copy is forced to review mode and cannot submit."
      }
    ],
    plan: executionPlan
  };
}

function validatePassedPreflight(
  report: LiveBrowserPreflightReport | undefined,
  plan: BrowserApplyPlan
): { check: LiveBrowserApplyCheck; status: "pass" } | { check: LiveBrowserApplyCheck; status: "fail" } {
  if (!report) {
    return {
      status: "fail",
      check: {
        id: "live-preflight-current",
        label: "Current Live Preflight",
        status: "fail",
        detail: "No live preflight report exists. Run pnpm browser-live-preflight before filling a real portal."
      }
    };
  }
  if (report.status !== "pass") {
    return {
      status: "fail",
      check: {
        id: "live-preflight-current",
        label: "Current Live Preflight",
        status: "fail",
        detail: `Latest live preflight status is ${report.status.toUpperCase()}, not PASS.`
      }
    };
  }
  const matchesPlan = report.selectedPlanId === plan.id || report.selectedJobId === plan.jobId;
  if (!matchesPlan) {
    return {
      status: "fail",
      check: {
        id: "live-preflight-current",
        label: "Current Live Preflight",
        status: "fail",
        detail: "Latest passing live preflight does not match the selected current browser plan."
      }
    };
  }
  return {
    status: "pass",
    check: {
      id: "live-preflight-current",
      label: "Current Live Preflight",
      status: "pass",
      detail: `Latest passing live preflight matches ${plan.id}.`
    }
  };
}

function selectLiveApplyPlan(
  plans: BrowserApplyPlan[],
  options: Pick<LiveBrowserApplyOptions, "jobId" | "planId">,
  preflightReport: LiveBrowserPreflightReport | undefined
): BrowserApplyPlan | undefined {
  if (options.planId) return plans.find((plan) => plan.id === options.planId);
  if (options.jobId) return plans.find((plan) => plan.jobId === options.jobId);
  if (preflightReport?.selectedPlanId) {
    const byPlan = plans.find((plan) => plan.id === preflightReport.selectedPlanId);
    if (byPlan) return byPlan;
  }
  if (preflightReport?.selectedJobId) {
    const byJob = plans.find((plan) => plan.jobId === preflightReport.selectedJobId);
    if (byJob) return byJob;
  }
  return plans.find((plan) => isPreferredLiveUrl(plan.url)) ??
    plans.find((plan) => !/example\.com/i.test(plan.url)) ??
    plans[0];
}

function isPreferredLiveUrl(url: string): boolean {
  return /greenhouse\.io|jobs\.lever\.co|ashbyhq\.com|apply\.workable\.com|smartrecruiters\.com|bamboohr\.com|breezy\.hr|recruitee\.com|pinpointhq\.com|workdayjobs\.com|myworkdayjobs\.com|jobs\.personio\.(de|com)|ats\.rippling\.com/i.test(url);
}

async function readLatestLivePreflightReport(outputRoot: string): Promise<LiveBrowserPreflightReport | undefined> {
  const filePath = path.join(outputRoot, "outputs", "live-preflight", "live-preflight-report.json");
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    return isLiveBrowserPreflightReport(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isLiveBrowserPreflightReport(value: unknown): value is LiveBrowserPreflightReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<LiveBrowserPreflightReport>;
  return report.id === "applycue-live-browser-preflight" &&
    (report.status === "pass" || report.status === "pause" || report.status === "fail" || report.status === "skipped") &&
    typeof report.summary === "string" &&
    typeof report.generatedAt === "string";
}

async function loadOptionalPlaywright(importer: DynamicImport): Promise<PlaywrightModule | undefined> {
  for (const packageName of ["playwright", "playwright-core"]) {
    try {
      const candidate = await importer(packageName);
      if (isPlaywrightModule(candidate)) return candidate;
    } catch {
      // Optional dependency. Missing browser tooling should skip live apply, not break normal UAT.
    }
  }
  return undefined;
}

function isPlaywrightModule(value: unknown): value is PlaywrightModule {
  return typeof value === "object" &&
    value !== null &&
    "chromium" in value &&
    typeof (value as { chromium?: { launch?: unknown } }).chromium?.launch === "function";
}

function liveApplyPaths(
  outputRoot: string,
  outputDir: string,
  planSegment: string
): LiveBrowserApplyReport["paths"] {
  return {
    markdownReport: path.join(outputDir, "live-apply-report.md"),
    plan: path.join(outputDir, `${planSegment}-execution-plan.json`),
    receipt: path.join(outputRoot, "outputs", "browser-receipts", `${planSegment}-receipt.json`),
    report: path.join(outputDir, "live-apply-report.json")
  };
}

async function writeLiveApplyReport(
  batch: Pick<SampleBatchResult, "browserPlans" | "outputRoot">,
  report: LiveBrowserApplyReport
): Promise<LiveBrowserApplyReport> {
  await mkdir(path.dirname(report.paths.report), { recursive: true });
  await mkdir(path.dirname(report.paths.receipt), { recursive: true });
  await writeFile(report.paths.report, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(report.paths.markdownReport, renderMarkdownReport(report), "utf8");
  if (hasProgressBatchData(batch)) {
    await writeProgressDashboardAndSummary(batch.outputRoot, withReceiptProgress(batch, report), {
      nextActions: liveApplyNextActions(report),
      notes: [`Live apply: ${report.summary}`]
    });
  }
  return report;
}

function withReceiptProgress(batch: SampleBatchResult, report: LiveBrowserApplyReport): SampleBatchResult {
  if (!report.selectedJobId || !report.receiptStatus || report.status !== "pass") return batch;
  const receiptStatus = report.receiptStatus;
  const receiptPath = toOutputRelativePath(batch.outputRoot, report.paths.receipt);
  return {
    ...batch,
    progressItems: batch.progressItems.map((item) =>
      item.jobId === report.selectedJobId
        ? {
            ...item,
            browserReceiptPath: receiptPath,
            browserReceiptStatus: receiptStatus,
            nextStep: receiptStatus === "submitted"
              ? "Application submitted; track confirmation and replies."
              : "Review the filled live form before final submit."
          }
        : item
    )
  };
}

function liveApplyNextActions(report: LiveBrowserApplyReport): string[] {
  if (report.status === "pass" && report.receiptStatus === "paused") {
    return ["Review the filled browser form and submit only if the user approves and the page still matches."];
  }
  if (report.status === "pass" && report.receiptStatus === "submitted") {
    return ["Record the submission outcome, then monitor email for confirmation or recruiter replies."];
  }
  if (report.status === "skipped") {
    return ["Verify browser tooling, then rerun live preflight before trying live apply again."];
  }
  return ["Fix the live apply blocker, then rerun live preflight before filling the portal again."];
}

function hasProgressBatchData(
  batch: Pick<SampleBatchResult, "browserPlans" | "outputRoot">
): batch is SampleBatchResult {
  const candidate = batch as Partial<SampleBatchResult>;
  return Array.isArray(candidate.applications) &&
    Array.isArray(candidate.cvDocxs) &&
    Array.isArray(candidate.cvHtmls) &&
    Array.isArray(candidate.cvMarkdowns) &&
    Array.isArray(candidate.cvVariants) &&
    Array.isArray(candidate.jobs) &&
    Array.isArray(candidate.jobDecisions) &&
    Array.isArray(candidate.progressItems) &&
    Array.isArray(candidate.reconciliationReports) &&
    Boolean(candidate.manifest) &&
    Boolean(candidate.profile) &&
    Boolean(candidate.sourcePlan);
}

function renderMarkdownReport(report: LiveBrowserApplyReport): string {
  const checks = report.checks
    .map((check) => `| ${check.label} | ${check.status.toUpperCase()} | ${check.detail.replace(/\|/g, "/")} |`)
    .join("\n");
  return `# ApplyCue Live Browser Apply Report

Status: ${report.status.toUpperCase()}

${report.summary}

## Selected Plan

- Plan: ${report.selectedPlanId ?? "none"}
- Job: ${report.selectedJobId ?? "none"}
- Company: ${report.selectedCompany ?? "unknown"}
- Role: ${report.selectedRoleTitle ?? "unknown"}
- URL: ${report.checkedUrl ?? "not opened"}
- Submit allowed by command: ${report.allowSubmit ? "yes" : "no"}
- Forced review mode: ${report.forcedReviewMode ? "yes" : "no"}
- Result: ${report.resultStatus ?? "not run"}
- Receipt: ${report.receiptStatus ?? "not captured"}

## Checks

| Check | Status | Detail |
| --- | --- | --- |
${checks}

## Artifacts

- Execution plan: ${report.paths.plan}
- Receipt: ${report.paths.receipt}
- JSON report: ${report.paths.report}
`;
}

function resolveUserStorePath(value: string | undefined, outputRoot: string): string {
  if (!value) return "";
  if (path.isAbsolute(value)) return value;
  return path.join(outputRoot, value);
}

function toOutputRelativePath(outputRoot: string, filePath: string): string {
  const relative = path.relative(outputRoot, filePath);
  return relative.startsWith("..") ? filePath : relative.replace(/\\/g, "/");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function uniquePauseReasons(reasons: BrowserApplyPlan["pauseReasons"]): BrowserApplyPlan["pauseReasons"] {
  return [...new Set(reasons)];
}

function safeFileSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || `live-apply-${Date.now()}`;
}
