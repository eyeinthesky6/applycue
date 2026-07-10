import {
  createPlaywrightBrowserApplyController,
  executeBrowserApplyPlan,
  type BrowserPlanExecutionResult,
  type PlaywrightLikePage
} from "@applycue/browser-agent";
import type { BrowserApplyAction, BrowserApplyPlan } from "@applycue/core";
import { runLocalOrSampleBatch, type SampleBatchResult } from "@applycue/engine";
import { access, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { SetupApplyCueOptions } from "./setup.js";

export type BrowserApplyUatStatus = "pass" | "skipped" | "fail";

export interface BrowserApplyUatCheck {
  id: string;
  label: string;
  status: BrowserApplyUatStatus;
  detail: string;
}

export interface BrowserApplyUatReport {
  id: string;
  status: BrowserApplyUatStatus;
  generatedAt: string;
  selectedPlanId?: string;
  selectedJobId?: string;
  resultStatus?: BrowserPlanExecutionResult["status"];
  checks: BrowserApplyUatCheck[];
  paths: {
    form: string;
    markdownReport: string;
    plan: string;
    receipt: string;
    report: string;
  };
  summary: string;
}

export interface BrowserApplyUatOptions extends SetupApplyCueOptions {
  batch?: Pick<SampleBatchResult, "browserPlans" | "outputRoot">;
  importPlaywright?: DynamicImport;
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

export async function runBrowserApplyUat(options: BrowserApplyUatOptions = {}): Promise<BrowserApplyUatReport> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const batch = options.batch ?? await runLocalOrSampleBatch({
    workspaceRoot,
    ...(options.applyCueHome ? { applyCueHome: options.applyCueHome } : {}),
    ...(typeof options.freshnessDays === "number" ? { freshnessDays: options.freshnessDays } : {}),
    ...(typeof options.generatedSourceExpansion === "boolean" ? { generatedSourceExpansion: options.generatedSourceExpansion } : {}),
    ...(typeof options.includeOlderPosts === "boolean" ? { includeOlderPosts: options.includeOlderPosts } : {}),
    ...(options.profileKey ? { profileKey: options.profileKey } : {}),
    ...(typeof options.targetRankingQueue === "number" ? { targetRankingQueue: options.targetRankingQueue } : {}),
    writeFiles: true
  });
  const outputDir = path.join(batch.outputRoot, "outputs", "browser-uat");
  const reportPaths = browserUatPaths(outputDir, "browser-uat");
  await mkdir(outputDir, { recursive: true });

  const selectedPlan = selectBrowserPlan(batch.browserPlans);
  if (!selectedPlan) {
    return writeReport({
      id: "applycue-browser-uat",
      status: "fail",
      generatedAt: new Date().toISOString(),
      checks: [{
        id: "browser-plan",
        label: "Browser Plan Available",
        status: "fail",
        detail: "No browser apply plan was available to test."
      }],
      paths: reportPaths,
      summary: "Browser UAT failed: no browser apply plan was available."
    });
  }

  const playwright = options.playwright ?? await loadOptionalPlaywright(options.importPlaywright ?? dynamicImport);
  if (!playwright) {
    return writeReport({
      id: "applycue-browser-uat",
      status: "skipped",
      generatedAt: new Date().toISOString(),
      selectedPlanId: selectedPlan.id,
      selectedJobId: selectedPlan.jobId,
      checks: [{
        id: "playwright-available",
        label: "Playwright Available",
        status: "skipped",
        detail: "Playwright is not installed in this repo, so no real local browser was launched."
      }],
      paths: reportPaths,
      summary: "Browser UAT skipped: Playwright is not installed. Policy dry-runs still run through normal UAT."
    });
  }

  const planId = safeFileSegment(selectedPlan.id);
  const paths = browserUatPaths(outputDir, planId);
  const formUrl = pathToFileURL(paths.form).href;
  const preparation = await prepareLocalReviewPlan(selectedPlan, {
    formUrl,
    outputRoot: batch.outputRoot
  });
  if (preparation.status === "fail") {
    return writeReport({
      id: "applycue-browser-uat",
      status: "fail",
      generatedAt: new Date().toISOString(),
      selectedPlanId: selectedPlan.id,
      selectedJobId: selectedPlan.jobId,
      checks: preparation.checks,
      paths,
      summary: "Browser UAT failed before launch: the selected plan was not safe to execute locally."
    });
  }

  await writeFile(paths.form, renderLocalApplicationForm(preparation.plan), "utf8");
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
    await writeFile(paths.receipt, `${JSON.stringify(result.receipt, null, 2)}\n`, "utf8");
    return writeReport(buildExecutionReport({
      checks: preparation.checks,
      paths,
      plan: preparation.plan,
      result,
      selectedPlan
    }));
  } catch (error) {
    return writeReport({
      id: "applycue-browser-uat",
      status: "fail",
      generatedAt: new Date().toISOString(),
      selectedPlanId: selectedPlan.id,
      selectedJobId: selectedPlan.jobId,
      checks: [
        ...preparation.checks,
        {
          id: "browser-launch-or-run",
          label: "Browser Launch And Run",
          status: "fail",
          detail: error instanceof Error ? error.message : String(error)
        }
      ],
      paths,
      summary: "Browser UAT failed while launching or running the local browser proof."
    });
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

function buildExecutionReport(input: {
  checks: BrowserApplyUatCheck[];
  paths: BrowserApplyUatReport["paths"];
  plan: BrowserApplyPlan;
  result: BrowserPlanExecutionResult;
  selectedPlan: BrowserApplyPlan;
}): BrowserApplyUatReport {
  const uploadDone = input.result.actionLog.some((entry) => entry.actionType === "upload_file" && entry.status === "done");
  const submitDone = input.result.actionLog.some((entry) => entry.actionType === "submit" && entry.status === "done");
  const checks: BrowserApplyUatCheck[] = [
    ...input.checks,
    {
      id: "browser-preflight",
      label: "Browser Preflight",
      status: input.result.preflight.status === "pass" ? "pass" : "fail",
      detail: input.result.preflight.reasons.length > 0
        ? input.result.preflight.reasons.join("; ")
        : "Visible local page matched the selected company/role and required fields."
    },
    {
      id: "browser-fill-upload",
      label: "Browser Fill And Upload",
      status: uploadDone ? "pass" : "fail",
      detail: uploadDone
        ? "The browser filled planned fields and uploaded the generated DOCX artifact."
        : "The browser did not complete the planned DOCX upload."
    },
    {
      id: "review-gate",
      label: "Review Gate",
      status: input.result.status === "paused" && !submitDone ? "pass" : "fail",
      detail: input.result.status === "paused" && !submitDone
        ? "The local browser proof paused before submit as required."
        : "The local browser proof did not stop at the review gate."
    }
  ];
  const status = checks.some((check) => check.status === "fail") ? "fail" : "pass";
  return {
    id: "applycue-browser-uat",
    status,
    generatedAt: new Date().toISOString(),
    selectedPlanId: input.selectedPlan.id,
    selectedJobId: input.selectedPlan.jobId,
    resultStatus: input.result.status,
    checks,
    paths: input.paths,
    summary: status === "pass"
      ? `Browser UAT passed: opened a safe local form for ${input.selectedPlan.company ?? "the selected company"}, filled fields, uploaded the generated DOCX, and paused before submit.`
      : "Browser UAT failed: the safe local browser proof did not complete all required checks."
  };
}

async function prepareLocalReviewPlan(
  plan: BrowserApplyPlan,
  options: { formUrl: string; outputRoot: string }
): Promise<{ checks: BrowserApplyUatCheck[]; plan: BrowserApplyPlan; status: "pass" } | { checks: BrowserApplyUatCheck[]; status: "fail" }> {
  const checks: BrowserApplyUatCheck[] = [
    {
      id: "browser-plan",
      label: "Browser Plan Available",
      status: "pass",
      detail: `Selected ${plan.id}.`
    }
  ];
  const uploadActions = plan.actions.filter((action) => action.type === "upload_file");
  if (uploadActions.length === 0) {
    return {
      status: "fail",
      checks: [
        ...checks,
        {
          id: "docx-upload",
          label: "DOCX Upload Artifact",
          status: "fail",
          detail: "The selected plan has no upload action."
        }
      ]
    };
  }

  const resolvedActions: BrowserApplyAction[] = [];
  for (const action of plan.actions) {
    if (action.type === "open_url") {
      resolvedActions.push({
        ...action,
        target: options.formUrl,
        value: options.formUrl
      });
    } else if (action.type === "upload_file") {
      const resolved = resolveUserStorePath(action.value, options.outputRoot);
      if (!resolved.toLowerCase().endsWith(".docx")) {
        return {
          status: "fail",
          checks: [
            ...checks,
            {
              id: "docx-upload",
              label: "DOCX Upload Artifact",
              status: "fail",
              detail: `Upload action must point to DOCX, got ${action.value ?? "missing value"}.`
            }
          ]
        };
      }
      if (!await fileExists(resolved)) {
        return {
          status: "fail",
          checks: [
            ...checks,
            {
              id: "docx-upload",
              label: "DOCX Upload Artifact",
              status: "fail",
              detail: `Generated DOCX was not found: ${resolved}.`
            }
          ]
        };
      }
      resolvedActions.push({
        ...action,
        value: resolved
      });
    } else if (action.type !== "submit" && action.type !== "capture_receipt") {
      resolvedActions.push(action);
    }
  }

  if (!resolvedActions.some((action) => action.type === "pause")) {
    resolvedActions.push({
      id: `${plan.id}-browser-uat-pause`,
      type: "pause",
      label: "Pause before final submit",
      value: "browser_uat_review_gate",
      pauseReason: "user_approval_required",
      requiresApproval: true
    });
  }

  const safePlan: BrowserApplyPlan = {
    ...plan,
    id: `${plan.id}-browser-uat`,
    url: options.formUrl,
    applyMode: "review",
    canSubmit: false,
    submitRequiresApproval: true,
    pauseReasons: uniquePauseReasons([...plan.pauseReasons, "user_approval_required"]),
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
        detail: `${uploadActions.length} DOCX upload action(s) resolved under the active user store.`
      },
      {
        id: "safe-review-copy",
        label: "Safe Review Copy",
        status: "pass",
        detail: "The UAT plan copy is forced to review mode and cannot submit."
      }
    ],
    plan: safePlan
  };
}

function selectBrowserPlan(plans: BrowserApplyPlan[]): BrowserApplyPlan | undefined {
  return plans.find((plan) => plan.actions.some((action) => action.type === "upload_file" && action.value?.toLowerCase().endsWith(".docx"))) ?? plans[0];
}

async function loadOptionalPlaywright(importer: DynamicImport): Promise<PlaywrightModule | undefined> {
  for (const packageName of ["playwright", "playwright-core"]) {
    try {
      const candidate = await importer(packageName);
      if (isPlaywrightModule(candidate)) return candidate;
    } catch {
      // Optional dependency. Missing Playwright should skip this proof, not break normal UAT.
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

function renderLocalApplicationForm(plan: BrowserApplyPlan): string {
  const company = escapeHtml(plan.company ?? "ApplyCue Test Company");
  const role = escapeHtml(plan.roleTitle ?? "ApplyCue Test Role");
  const fillActions = uniqueTargetActions(plan.actions.filter((action) => action.type === "fill_field"));
  const uploadActions = uniqueTargetActions(plan.actions.filter((action) => action.type === "upload_file"));
  const fieldInputs = fillActions.map(renderLocalTextField).join("\n");
  const uploadInputs = uploadActions.map(renderLocalUploadField).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${role} - ${company} | ApplyCue Browser UAT</title>
</head>
<body>
  <main>
    <p data-applycue-company>${company}</p>
    <h1 data-applycue-role>${role}</h1>
    <p>Apply now. This is a local ApplyCue browser UAT page. It is not a real job portal.</p>
    <form id="application-form">
${fieldInputs}
${uploadInputs}
      <button type="submit">Submit application</button>
    </form>
  </main>
  <script>
    document.getElementById("application-form").addEventListener("submit", (event) => {
      event.preventDefault();
      document.body.insertAdjacentHTML("beforeend", "<p>Application received in local browser UAT.</p>");
      history.replaceState(null, "", "#applycue-local-receipt");
    });
  </script>
</body>
</html>
`;
}

function renderLocalTextField(action: BrowserApplyAction): string {
  const target = action.target ?? "field";
  const id = escapeHtml(target);
  const label = escapeHtml(labelForField(target));
  const inputType = inputTypeForTarget(target);
  const autocomplete = autocompleteForTarget(target);
  return `      <label for="${id}">${label}</label>
      <input id="${id}" name="${id}" type="${inputType}"${autocomplete ? ` autocomplete="${autocomplete}"` : ""} aria-label="${label}" required>`;
}

function renderLocalUploadField(action: BrowserApplyAction): string {
  const target = action.target ?? "resume_or_cv";
  const id = escapeHtml(target);
  const label = escapeHtml(labelForField(target));
  return `      <label for="${id}">${label}</label>
      <input id="${id}" name="${id}" type="file" aria-label="${label}" required>`;
}

function uniqueTargetActions(actions: BrowserApplyAction[]): BrowserApplyAction[] {
  const seen = new Set<string>();
  const unique: BrowserApplyAction[] = [];
  for (const action of actions) {
    const target = action.target ?? "";
    if (!target || seen.has(target)) continue;
    seen.add(target);
    unique.push(action);
  }
  return unique;
}

function labelForField(target: string): string {
  const normalized = target.toLowerCase().replace(/[_-]+/g, " ");
  const labels: Record<string, string> = {
    country: "Country",
    email: "Email",
    first_name: "First name",
    last_name: "Last name",
    location: "Location",
    name: "Full name",
    phone: "Phone",
    resume_or_cv: "Resume"
  };
  return labels[target] ?? normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function inputTypeForTarget(target: string): string {
  const normalized = target.toLowerCase();
  if (normalized.includes("email")) return "email";
  if (normalized.includes("phone") || normalized.includes("mobile")) return "tel";
  return "text";
}

function autocompleteForTarget(target: string): string | undefined {
  const normalized = target.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const values: Record<string, string> = {
    country: "country-name",
    email: "email",
    firstname: "given-name",
    lastname: "family-name",
    location: "address-level2",
    name: "name",
    phone: "tel"
  };
  return values[normalized];
}

function browserUatPaths(outputDir: string, planSegment: string): BrowserApplyUatReport["paths"] {
  return {
    form: path.join(outputDir, `${planSegment}-form.html`),
    markdownReport: path.join(outputDir, "browser-uat-report.md"),
    plan: path.join(outputDir, `${planSegment}-safe-plan.json`),
    receipt: path.join(outputDir, `${planSegment}-receipt.json`),
    report: path.join(outputDir, "browser-uat-report.json")
  };
}

async function writeReport(report: BrowserApplyUatReport): Promise<BrowserApplyUatReport> {
  await mkdir(path.dirname(report.paths.report), { recursive: true });
  await writeFile(report.paths.report, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(report.paths.markdownReport, renderMarkdownReport(report), "utf8");
  return report;
}

function renderMarkdownReport(report: BrowserApplyUatReport): string {
  const checks = report.checks
    .map((check) => `| ${check.label} | ${check.status.toUpperCase()} | ${check.detail.replace(/\|/g, "/")} |`)
    .join("\n");
  return `# ApplyCue Browser UAT Report

Status: ${report.status.toUpperCase()}

${report.summary}

## Selected Plan

- Plan: ${report.selectedPlanId ?? "none"}
- Job: ${report.selectedJobId ?? "none"}
- Result: ${report.resultStatus ?? "not run"}

## Checks

| Check | Status | Detail |
| --- | --- | --- |
${checks}

## Artifacts

- Local form: ${report.paths.form}
- Safe plan: ${report.paths.plan}
- Receipt: ${report.paths.receipt}
- JSON report: ${report.paths.report}
`;
}

function resolveUserStorePath(value: string | undefined, outputRoot: string): string {
  if (!value) return "";
  if (path.isAbsolute(value)) return value;
  return path.join(outputRoot, value);
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
    .slice(0, 120) || `browser-uat-${Date.now()}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function createTempBrowserUatOutputRoot(): string {
  return path.join(os.tmpdir(), "applycue-browser-uat");
}
