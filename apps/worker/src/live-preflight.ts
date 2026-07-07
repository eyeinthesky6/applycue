import {
  createPlaywrightBrowserApplyController,
  formatBrowserApplyPreflight,
  preflightBrowserApplyPlanFromSnapshot,
  type BrowserApplyPreflightResult,
  type BrowserPageSnapshot,
  type PlaywrightLikePage
} from "@applycue/browser-agent";
import type { BrowserApplyPlan, ProgressLivePreflightSummary } from "@applycue/core";
import { runLocalOrSampleBatch, writeProgressDashboardAndSummary, type SampleBatchResult } from "@applycue/engine";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SetupApplyCueOptions } from "./setup.js";

export type LiveBrowserPreflightStatus = "pass" | "pause" | "fail" | "skipped";

export interface LiveBrowserPreflightCheck {
  id: string;
  label: string;
  status: LiveBrowserPreflightStatus;
  detail: string;
}

export interface LiveBrowserPreflightReport {
  id: string;
  status: LiveBrowserPreflightStatus;
  generatedAt: string;
  selectedPlanId?: string;
  selectedJobId?: string;
  selectedCompany?: string;
  selectedRoleTitle?: string;
  checkedUrl?: string;
  answerPrompts?: LiveBrowserAnswerPrompt[];
  checks: LiveBrowserPreflightCheck[];
  paths: {
    answerApprovalTemplate: string;
    answerPrompts: string;
    answerPromptsHtml: string;
    answerPromptsMarkdown: string;
    markdownReport: string;
    preflight: string;
    report: string;
    snapshot: string;
  };
  summary: string;
}

export interface LiveBrowserAnswerPrompt {
  id: string;
  field: string;
  question: string;
  kind: "sensitive_required_field" | "missing_required_field";
  canSaveAsReusable: boolean;
  requiresExplicitUserApproval: boolean;
  suggestedDryRunCommand?: string;
  note: string;
}

export interface LiveAnswerApprovalTemplate {
  id: "applycue-live-answer-approval-template";
  generatedAt: string;
  selectedPlanId?: string;
  selectedJobId?: string;
  selectedCompany?: string;
  selectedRoleTitle?: string;
  checkedUrl?: string;
  sourceRef: string;
  instructions: string;
  reusableAnswers: LiveAnswerApprovalTemplateItem[];
  oneOffAnswers: LiveAnswerApprovalTemplateItem[];
}

export interface LiveAnswerApprovalTemplateItem {
  aliases?: string[];
  approveForReuse: boolean;
  field: string;
  note: string;
  question: string;
  sourceRef: string;
  value: string;
}

export interface LiveBrowserPreflightOptions extends SetupApplyCueOptions {
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

export async function runLiveBrowserPreflight(
  options: LiveBrowserPreflightOptions = {}
): Promise<LiveBrowserPreflightReport> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const batch = options.batch ?? await runLocalOrSampleBatch({
    workspaceRoot,
    ...(options.applyCueHome ? { applyCueHome: options.applyCueHome } : {}),
    ...(options.profileKey ? { profileKey: options.profileKey } : {}),
    writeFiles: true
  });
  const outputDir = path.join(batch.outputRoot, "outputs", "live-preflight");
  const paths = livePreflightPaths(outputDir);
  await mkdir(outputDir, { recursive: true });

  const selectedPlan = selectLivePreflightPlan(batch.browserPlans, options);
  if (!selectedPlan) {
    return writeLivePreflightReport(batch, {
      id: "applycue-live-browser-preflight",
      status: "fail",
      generatedAt: new Date().toISOString(),
      checks: [{
        id: "browser-plan",
        label: "Browser Plan Available",
        status: "fail",
        detail: "No browser apply plan matched the live preflight request."
      }],
      paths,
      summary: "Live browser preflight failed: no matching browser plan was available."
    });
  }

  const playwright = options.playwright ?? await loadOptionalPlaywright(options.importPlaywright ?? dynamicImport);
  if (!playwright) {
    return writeLivePreflightReport(batch, {
      id: "applycue-live-browser-preflight",
      status: "skipped",
      generatedAt: new Date().toISOString(),
      selectedPlanId: selectedPlan.id,
      selectedJobId: selectedPlan.jobId,
      ...(selectedPlan.company ? { selectedCompany: selectedPlan.company } : {}),
      ...(selectedPlan.roleTitle ? { selectedRoleTitle: selectedPlan.roleTitle } : {}),
      checkedUrl: selectedPlan.url,
      checks: [{
        id: "playwright-available",
        label: "Browser Tool Available",
        status: "skipped",
        detail: "The browser tool is not installed, so no live page was opened."
      }],
      paths,
      summary: "Live browser preflight skipped: browser tooling is not installed."
    });
  }

  let browser: PlaywrightBrowser | undefined;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();
    const controller = createPlaywrightBrowserApplyController(page);
    const snapshot = await controller.openUrl(selectedPlan.url);
    const resolvedSnapshot = snapshot ?? await controller.snapshot();
    const preflight = preflightBrowserApplyPlanFromSnapshot(selectedPlan, resolvedSnapshot, {
      ...(selectedPlan.company ? { expectedCompany: selectedPlan.company } : {}),
      ...(selectedPlan.roleTitle ? { expectedRole: selectedPlan.roleTitle } : {})
    });
    await writeFile(paths.snapshot, `${JSON.stringify(resolvedSnapshot, null, 2)}\n`, "utf8");
    await writeFile(paths.preflight, `${JSON.stringify(preflight, null, 2)}\n`, "utf8");
    return writeLivePreflightReport(batch, buildPreflightReport({
      paths,
      plan: selectedPlan,
      preflight,
      snapshot: resolvedSnapshot
    }));
  } catch (error) {
    return writeLivePreflightReport(batch, {
      id: "applycue-live-browser-preflight",
      status: "fail",
      generatedAt: new Date().toISOString(),
      selectedPlanId: selectedPlan.id,
      selectedJobId: selectedPlan.jobId,
      ...(selectedPlan.company ? { selectedCompany: selectedPlan.company } : {}),
      ...(selectedPlan.roleTitle ? { selectedRoleTitle: selectedPlan.roleTitle } : {}),
      checkedUrl: selectedPlan.url,
      checks: [
        {
          id: "browser-plan",
          label: "Browser Plan Available",
          status: "pass",
          detail: `Selected ${selectedPlan.id}.`
        },
        {
          id: "live-page-open",
          label: "Live Page Open",
          status: "fail",
          detail: error instanceof Error ? error.message : String(error)
        }
      ],
      paths,
      summary: "Live browser preflight failed while opening or inspecting the page. No fields were filled."
    });
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

function buildPreflightReport(input: {
  paths: LiveBrowserPreflightReport["paths"];
  plan: BrowserApplyPlan;
  preflight: BrowserApplyPreflightResult;
  snapshot: BrowserPageSnapshot;
}): LiveBrowserPreflightReport {
  const status = input.preflight.status;
  const answerPrompts = buildAnswerPrompts(input.preflight);
  const checks: LiveBrowserPreflightCheck[] = [
    {
      id: "browser-plan",
      label: "Browser Plan Available",
      status: "pass",
      detail: `Selected ${input.plan.id}.`
    },
    {
      id: "live-page-open",
      label: "Live Page Open",
      status: "pass",
      detail: input.snapshot.finalUrl ?? input.plan.url
    },
    {
      id: "preflight",
      label: "ApplyCue Preflight",
      status,
      detail: input.preflight.reasons.length > 0
        ? input.preflight.reasons.join("; ")
        : "Live page passed liveness, company/role, required-field, and sensitive-field checks."
    },
    {
      id: "no-fill-submit",
      label: "No Fill Or Submit",
      status: "pass",
      detail: "Live preflight only opened and inspected the page. It did not fill fields, upload files, or submit."
    }
  ];
  return {
    id: "applycue-live-browser-preflight",
    status,
    generatedAt: new Date().toISOString(),
    selectedPlanId: input.plan.id,
    selectedJobId: input.plan.jobId,
    ...(input.plan.company ? { selectedCompany: input.plan.company } : {}),
    ...(input.plan.roleTitle ? { selectedRoleTitle: input.plan.roleTitle } : {}),
    checkedUrl: input.snapshot.finalUrl ?? input.plan.url,
    checks,
    paths: input.paths,
    answerPrompts,
    summary: summaryForPreflight(input.plan, status, input.preflight)
  };
}

function summaryForPreflight(
  plan: BrowserApplyPlan,
  status: BrowserApplyPreflightResult["status"],
  preflight: BrowserApplyPreflightResult
): string {
  const label = `${plan.company ?? "selected company"} - ${plan.roleTitle ?? "selected role"}`;
  if (status === "pass") {
    return `Live browser preflight passed for ${label}. The page can move to controlled fill/upload under ApplyCue policy.`;
  }
  if (status === "pause") {
    return `Live browser preflight paused for ${label}: ${preflight.reasons.join("; ")}`;
  }
  return `Live browser preflight failed for ${label}: ${preflight.reasons.join("; ")}`;
}

function selectLivePreflightPlan(
  plans: BrowserApplyPlan[],
  options: Pick<LiveBrowserPreflightOptions, "jobId" | "planId">
): BrowserApplyPlan | undefined {
  if (options.planId) return plans.find((plan) => plan.id === options.planId);
  if (options.jobId) return plans.find((plan) => plan.jobId === options.jobId);
  return plans.find((plan) => isPreferredLiveUrl(plan.url)) ??
    plans.find((plan) => !/example\.com/i.test(plan.url)) ??
    plans[0];
}

function isPreferredLiveUrl(url: string): boolean {
  return /greenhouse\.io|jobs\.lever\.co|ashbyhq\.com|apply\.workable\.com|smartrecruiters\.com|bamboohr\.com|breezy\.hr|recruitee\.com|pinpointhq\.com|workdayjobs\.com|myworkdayjobs\.com|jobs\.personio\.(de|com)|ats\.rippling\.com/i.test(url);
}

async function loadOptionalPlaywright(importer: DynamicImport): Promise<PlaywrightModule | undefined> {
  for (const packageName of ["playwright", "playwright-core"]) {
    try {
      const candidate = await importer(packageName);
      if (isPlaywrightModule(candidate)) return candidate;
    } catch {
      // Optional dependency. Missing browser tooling should skip live preflight, not break normal UAT.
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

function livePreflightPaths(outputDir: string): LiveBrowserPreflightReport["paths"] {
  return {
    answerApprovalTemplate: path.join(outputDir, "live-answer-approval-template.json"),
    answerPrompts: path.join(outputDir, "live-answer-prompts.json"),
    answerPromptsHtml: path.join(outputDir, "live-answer-prompts.html"),
    answerPromptsMarkdown: path.join(outputDir, "live-answer-prompts.md"),
    markdownReport: path.join(outputDir, "live-preflight-report.md"),
    preflight: path.join(outputDir, "live-preflight-result.json"),
    report: path.join(outputDir, "live-preflight-report.json"),
    snapshot: path.join(outputDir, "live-page-snapshot.json")
  };
}

async function writeReport(report: LiveBrowserPreflightReport): Promise<LiveBrowserPreflightReport> {
  await mkdir(path.dirname(report.paths.report), { recursive: true });
  await writeFile(report.paths.answerApprovalTemplate, `${JSON.stringify(buildAnswerApprovalTemplate(report), null, 2)}\n`, "utf8");
  await writeFile(report.paths.answerPrompts, `${JSON.stringify(report.answerPrompts ?? [], null, 2)}\n`, "utf8");
  await writeFile(report.paths.answerPromptsHtml, renderAnswerPromptsHtml(report), "utf8");
  await writeFile(report.paths.answerPromptsMarkdown, renderAnswerPromptsMarkdown(report), "utf8");
  await writeFile(report.paths.report, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(report.paths.markdownReport, renderMarkdownReport(report), "utf8");
  return report;
}

async function writeLivePreflightReport(
  batch: Pick<SampleBatchResult, "browserPlans" | "outputRoot">,
  report: LiveBrowserPreflightReport
): Promise<LiveBrowserPreflightReport> {
  const written = await writeReport(report);
  if (hasProgressBatchData(batch)) {
    await writeProgressDashboardAndSummary(batch.outputRoot, batch, {
      livePreflight: progressLivePreflightFromReport(written),
      nextActions: livePreflightNextActions(written),
      notes: [`Live preflight: ${written.summary}`]
    });
  }
  return written;
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

function progressLivePreflightFromReport(report: LiveBrowserPreflightReport): ProgressLivePreflightSummary {
  const prompts = report.answerPrompts ?? [];
  return {
    status: report.status,
    summary: report.summary,
    answerPromptCount: prompts.length,
    reusableAnswerPromptCount: prompts.filter((prompt) => prompt.canSaveAsReusable).length,
    oneOffAnswerPromptCount: prompts.filter((prompt) => !prompt.canSaveAsReusable).length,
    questions: prompts.map((prompt) => questionForProgress(prompt)),
    ...(report.selectedCompany ? { selectedCompany: report.selectedCompany } : {}),
    ...(report.selectedRoleTitle ? { selectedRoleTitle: report.selectedRoleTitle } : {}),
    ...(report.checkedUrl ? { checkedUrl: report.checkedUrl } : {}),
    paths: {
      answerPromptsHtml: report.paths.answerPromptsHtml,
      answerPromptsMarkdown: report.paths.answerPromptsMarkdown,
      approvalTemplate: report.paths.answerApprovalTemplate,
      report: report.paths.report
    }
  };
}

function livePreflightNextActions(report: LiveBrowserPreflightReport): string[] {
  const label = [report.selectedCompany, report.selectedRoleTitle].filter(Boolean).join(" - ") || "selected application";
  if (report.status === "pass") {
    return [`Live preflight passed for ${label}; continue with controlled fill/upload under ApplyCue policy.`];
  }
  if (report.status === "pause") {
    const promptCount = report.answerPrompts?.length ?? 0;
    if (promptCount > 0) {
      return [`Ask the ${promptCount} live form question(s), save only approved reusable answers, then rerun live preflight before filling the portal.`];
    }
    return [`Review live preflight pause reasons for ${label} before filling the portal.`];
  }
  if (report.status === "skipped") {
    return ["Verify browser tooling, then rerun live preflight before filling a real portal form."];
  }
  return [`Fix live preflight failure for ${label} before filling a real portal form.`];
}

function questionForProgress(prompt: LiveBrowserAnswerPrompt): string {
  if (prompt.question === "Unlabeled field") {
    return "One required field on the page had no visible label; inspect it before answering.";
  }
  return prompt.question;
}

function renderMarkdownReport(report: LiveBrowserPreflightReport): string {
  const checks = report.checks
    .map((check) => `| ${check.label} | ${check.status.toUpperCase()} | ${check.detail.replace(/\|/g, "/")} |`)
    .join("\n");
  return `# ApplyCue Live Browser Preflight Report

Status: ${report.status.toUpperCase()}

${report.summary}

## Selected Plan

- Plan: ${report.selectedPlanId ?? "none"}
- Job: ${report.selectedJobId ?? "none"}
- Company: ${report.selectedCompany ?? "unknown"}
- Role: ${report.selectedRoleTitle ?? "unknown"}
- URL: ${report.checkedUrl ?? "not opened"}

## Checks

| Check | Status | Detail |
| --- | --- | --- |
${checks}

## Artifacts

- Snapshot: ${report.paths.snapshot}
- Preflight JSON: ${report.paths.preflight}
- Answer review page: ${report.paths.answerPromptsHtml}
- Answer prompts: ${report.paths.answerPromptsMarkdown}
- Approval template: ${report.paths.answerApprovalTemplate}
- JSON report: ${report.paths.report}
`;
}

function buildAnswerApprovalTemplate(report: LiveBrowserPreflightReport): LiveAnswerApprovalTemplate {
  const sourceRef = `live-preflight:${report.selectedPlanId ?? report.selectedJobId ?? "unknown"}`;
  const prompts = report.answerPrompts ?? [];
  const toTemplateItem = (prompt: LiveBrowserAnswerPrompt): LiveAnswerApprovalTemplateItem => {
    const item: LiveAnswerApprovalTemplateItem = {
      approveForReuse: false,
      field: prompt.field,
      note: prompt.canSaveAsReusable
        ? "Fill value and set approveForReuse to true only after the user explicitly approves reuse."
        : "Use only for this application. Do not set approveForReuse to true.",
      question: prompt.question,
      sourceRef,
      value: ""
    };
    if (prompt.canSaveAsReusable) item.aliases = [prompt.question];
    return item;
  };
  const template: LiveAnswerApprovalTemplate = {
    id: "applycue-live-answer-approval-template",
    generatedAt: report.generatedAt,
    ...(report.selectedPlanId ? { selectedPlanId: report.selectedPlanId } : {}),
    ...(report.selectedJobId ? { selectedJobId: report.selectedJobId } : {}),
    ...(report.selectedCompany ? { selectedCompany: report.selectedCompany } : {}),
    ...(report.selectedRoleTitle ? { selectedRoleTitle: report.selectedRoleTitle } : {}),
    ...(report.checkedUrl ? { checkedUrl: report.checkedUrl } : {}),
    sourceRef,
    instructions: "For reusable answers only: fill value, set approveForReuse to true after explicit user approval, then run pnpm approve-answers -- --from-file <this-file> --dry-run before saving. One-off answers are included for form review only and are ignored by reusable answer approval.",
    reusableAnswers: prompts.filter((prompt) => prompt.canSaveAsReusable).map(toTemplateItem),
    oneOffAnswers: prompts.filter((prompt) => !prompt.canSaveAsReusable).map(toTemplateItem)
  };
  return template;
}

function buildAnswerPrompts(preflight: BrowserApplyPreflightResult): LiveBrowserAnswerPrompt[] {
  const sensitive = preflight.sensitiveFields.map((field) =>
    createAnswerPrompt(field.label || field.name, "sensitive_required_field")
  );
  const missing = preflight.missingRequiredFields.map((field) =>
    createAnswerPrompt(field.label || field.name, "missing_required_field")
  );
  return dedupeAnswerPrompts([...sensitive, ...missing]);
}

function createAnswerPrompt(question: string, kind: LiveBrowserAnswerPrompt["kind"]): LiveBrowserAnswerPrompt {
  const cleanedQuestion = cleanQuestion(question);
  const field = inferAnswerField(cleanedQuestion);
  const canSaveAsReusable = cleanedQuestion !== "Unlabeled field" && !isBlockedReusableField(cleanedQuestion);
  const prompt: LiveBrowserAnswerPrompt = {
    id: `answer-prompt-${slugify(field || cleanedQuestion)}`,
    field,
    question: cleanedQuestion,
    kind,
    canSaveAsReusable,
    requiresExplicitUserApproval: true,
    note: canSaveAsReusable
      ? "Ask the user once. If they approve reuse, save it with approve-answers and rerun the batch/preflight."
      : "Ask the user for this application only. Do not save it as a reusable answer."
  };
  if (canSaveAsReusable) {
    prompt.suggestedDryRunCommand = [
      "pnpm approve-answers -- --dry-run",
      `--field ${quoteCliArg(field)}`,
      "--value \"<approved answer>\"",
      `--alias ${quoteCliArg(cleanedQuestion)}`
    ].join(" ");
  }
  return prompt;
}

function dedupeAnswerPrompts(prompts: LiveBrowserAnswerPrompt[]): LiveBrowserAnswerPrompt[] {
  const seen = new Set<string>();
  const output: LiveBrowserAnswerPrompt[] = [];
  for (const prompt of prompts) {
    const key = `${prompt.field}::${prompt.question.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(prompt);
  }
  return output;
}

function inferAnswerField(question: string): string {
  const normalized = question.toLowerCase();
  if (/notice\s+period|when\s+can\s+you\s+join|availability\s+to\s+join|joining/.test(normalized)) return "notice_period";
  if (/current\s+(salary|compensation|ctc)|present\s+(salary|compensation|ctc)/.test(normalized)) return "current_salary";
  if (/(desired|expected)\s+(salary|compensation|ctc)|salary\s+expectation/.test(normalized)) return "expected_salary";
  if (/years?.*(pm|product\s+manager|product\s+management)|pm\s+experience/.test(normalized)) return "product_management_years";
  if (/insurance|insurtech/.test(normalized)) return "insurance_or_insurtech_experience";
  if (/bangalore|bengaluru|office|onsite|on-site/.test(normalized)) return "office_location_availability";
  if (/11\s*am|8\s*pm|shift|working\s+hours|ist/.test(normalized)) return "working_hours_availability";
  if (/work\s*authori[sz]ation|right\s+to\s+work/.test(normalized)) return "work_authorization";
  if (/visa|sponsor/.test(normalized)) return "visa_sponsorship";
  return slugify(question).replace(/-/g, "_") || "application_answer";
}

function renderAnswerPromptsMarkdown(report: LiveBrowserPreflightReport): string {
  const prompts = report.answerPrompts ?? [];
  const chatPrompt = renderChatPromptMarkdown(report, prompts);
  const approveCommand = renderApproveAnswersSetCommand(prompts);
  const promptLines = prompts.length > 0
    ? prompts.map((prompt, index) => renderAnswerPrompt(prompt, index + 1)).join("\n\n")
    : "No reusable answer prompts were generated.";
  return `# ApplyCue Live Answer Prompts

Status: ${report.status.toUpperCase()}

${report.summary}

Ask these in chat before filling the live form. Save only answers the user explicitly approves for reuse.

${chatPrompt}

After the user answers, save only reusable answers they explicitly approve. Remove any \`--set\` line the user did not approve:

\`\`\`powershell
${approveCommand}
\`\`\`

Dry-run first by adding \`--dry-run\`, then rerun without it.

Fallback approval template:

\`\`\`text
${report.paths.answerApprovalTemplate}
\`\`\`

## Detailed Prompt Records

${promptLines}
`;
}

function renderApproveAnswersSetCommand(prompts: LiveBrowserAnswerPrompt[]): string {
  const reusablePrompts = prompts.filter((prompt) => prompt.canSaveAsReusable);
  if (reusablePrompts.length === 0) {
    return "pnpm approve-answers -- --from-live --dry-run";
  }
  const lines = ["pnpm approve-answers -- --from-live `"];
  lines.push(
    ...reusablePrompts.map((prompt, index) => {
      const suffix = index === reusablePrompts.length - 1 ? "" : " `";
      return `  --set ${quoteCliArg(`${prompt.field}=<approved answer>`)}${suffix}`;
    })
  );
  return lines.join("\n");
}

function renderChatPromptMarkdown(report: LiveBrowserPreflightReport, prompts: LiveBrowserAnswerPrompt[]): string {
  if (prompts.length === 0) {
    return `## Copy This To Chat

No application-form answers are needed from the user. Review the preflight report before filling the page.`;
  }
  const reusable = prompts.filter((prompt) => prompt.canSaveAsReusable);
  const oneOff = prompts.filter((prompt) => !prompt.canSaveAsReusable);
  const reusableLines = reusable.length > 0
    ? reusable.map((prompt, index) => `${index + 1}. ${prompt.question}`).join("\n")
    : "None.";
  const oneOffLines = oneOff.length > 0
    ? oneOff.map((prompt, index) => `${index + 1}. ${oneOffQuestionForChat(prompt)}`).join("\n")
    : "None.";
  return `## Copy This To Chat

I paused before filling this application form. It is for:

- Company: ${report.selectedCompany ?? "selected company"}
- Role: ${report.selectedRoleTitle ?? "selected role"}
- Page: ${report.checkedUrl ?? "not opened"}

I need a few answers before I can continue.

### Reusable With Your Approval

These can be saved for future applications only if you explicitly approve reuse:

${reusableLines}

### Use Once For This Application

These should not be saved as reusable profile facts:

${oneOffLines}

Please answer in the same order and tell me which reusable answers I may save for future forms.`;
}

function oneOffQuestionForChat(prompt: LiveBrowserAnswerPrompt): string {
  if (prompt.question === "Unlabeled field") {
    return "One required field on the page had no visible label. I need to inspect that field manually and use the answer only for this application.";
  }
  return prompt.question;
}

function renderAnswerPromptsHtml(report: LiveBrowserPreflightReport): string {
  const prompts = report.answerPrompts ?? [];
  const reusableCount = prompts.filter((prompt) => prompt.canSaveAsReusable).length;
  const oneOffCount = prompts.length - reusableCount;
  const chatPrompt = renderChatPromptHtml(report, prompts);
  const approveCommand = escapeHtml(renderApproveAnswersSetCommand(prompts));
  const promptRows = prompts.length > 0
    ? prompts.map((prompt, index) => renderAnswerPromptHtml(prompt, index + 1)).join("\n")
    : `<div class="empty-state">
        <h2>No answers needed</h2>
        <p>The live form did not expose reusable or blocking answer prompts in this preflight.</p>
      </div>`;
  const checks = report.checks
    .map((check) => `<tr>
        <td>${escapeHtml(check.label)}</td>
        <td><span class="pill tone-${escapeHtml(check.status)}">${escapeHtml(check.status.toUpperCase())}</span></td>
        <td>${escapeHtml(check.detail)}</td>
      </tr>`)
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ApplyCue Live Answer Review</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f8fb;
      --surface: #ffffff;
      --ink: #142033;
      --muted: #617085;
      --line: #d9e0ea;
      --blue: #315fbc;
      --green: #247a4d;
      --amber: #9a6500;
      --red: #b33a3a;
      --slate: #42526a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: Arial, Helvetica, sans-serif;
      line-height: 1.45;
    }
    main {
      width: min(1180px, calc(100% - 40px));
      margin: 0 auto;
      padding: 28px 0 44px;
    }
    header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 20px;
      align-items: start;
      border-bottom: 1px solid var(--line);
      padding-bottom: 22px;
      margin-bottom: 24px;
    }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 30px; line-height: 1.15; letter-spacing: 0; }
    h2 { font-size: 18px; margin-bottom: 12px; }
    h3 { font-size: 16px; }
    .subtitle { color: var(--muted); margin-top: 8px; max-width: 860px; }
    .summary {
      margin-top: 14px;
      color: var(--ink);
      max-width: 920px;
    }
    .status {
      min-width: 210px;
      border: 1px solid var(--line);
      background: var(--surface);
      padding: 14px;
      border-radius: 8px;
    }
    .status span { display: block; color: var(--muted); font-size: 12px; text-transform: uppercase; }
    .status strong { display: block; margin-top: 4px; font-size: 24px; }
    .meta {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 1px;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--line);
      margin-bottom: 24px;
    }
    .metric {
      background: var(--surface);
      padding: 14px;
      min-height: 86px;
    }
    .metric span { color: var(--muted); font-size: 12px; text-transform: uppercase; }
    .metric strong { display: block; font-size: 25px; margin-top: 6px; }
    .section {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 18px;
      margin-bottom: 18px;
    }
    .chat-copy {
      background: #f9fbff;
      border: 1px solid var(--line);
      border-left: 4px solid var(--blue);
      border-radius: 8px;
      padding: 16px;
      white-space: pre-wrap;
    }
    .prompt-list {
      display: grid;
      gap: 12px;
    }
    .prompt {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) minmax(230px, 0.45fr);
      gap: 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      background: #fbfcfe;
    }
    .index {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: #e7edf7;
      color: var(--blue);
      font-weight: 700;
    }
    .question { font-size: 17px; font-weight: 700; }
    .details {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }
    .command {
      margin-top: 12px;
      padding: 10px;
      background: #111827;
      color: #f7fafc;
      border-radius: 6px;
      font-family: Consolas, "Courier New", monospace;
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .note { color: var(--muted); font-size: 13px; }
    .side-note {
      border-left: 3px solid var(--blue);
      padding-left: 12px;
      color: var(--muted);
      font-size: 14px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 3px 9px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      background: #eef2f8;
      color: var(--slate);
      white-space: nowrap;
    }
    .tone-pass { background: #e6f4ed; color: var(--green); }
    .tone-pause { background: #fff4da; color: var(--amber); }
    .tone-fail { background: #fde8e8; color: var(--red); }
    .tone-skipped { background: #eef2f8; color: var(--slate); }
    .muted { color: var(--muted); }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 10px 8px;
      text-align: left;
      vertical-align: top;
    }
    th { color: var(--muted); font-size: 12px; text-transform: uppercase; }
    .artifact-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    code {
      font-family: Consolas, "Courier New", monospace;
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .empty-state {
      border: 1px dashed var(--line);
      border-radius: 8px;
      padding: 24px;
      background: #fbfcfe;
    }
    @media (max-width: 860px) {
      main { width: min(100% - 24px, 1180px); }
      header { grid-template-columns: 1fr; }
      .meta { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .prompt { grid-template-columns: 36px minmax(0, 1fr); }
      .prompt aside { grid-column: 2; }
      .artifact-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 520px) {
      h1 { font-size: 24px; }
      .meta { grid-template-columns: 1fr; }
      .prompt { grid-template-columns: 1fr; }
      .prompt aside { grid-column: auto; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>ApplyCue Live Answer Review</h1>
        <p class="subtitle">Generated ${escapeHtml(report.generatedAt)} after opening the live application page. ApplyCue did not fill fields, upload files, or submit.</p>
        <p class="summary">${escapeHtml(report.summary)}</p>
      </div>
      <div class="status">
        <span>Preflight status</span>
        <strong>${escapeHtml(report.status.toUpperCase())}</strong>
      </div>
    </header>

    <section class="meta" aria-label="Preflight metrics">
      <div class="metric"><span>Prompts</span><strong>${prompts.length}</strong></div>
      <div class="metric"><span>Reusable</span><strong>${reusableCount}</strong></div>
      <div class="metric"><span>One-off</span><strong>${oneOffCount}</strong></div>
      <div class="metric"><span>Checks</span><strong>${report.checks.length}</strong></div>
    </section>

    <section class="section">
      <h2>Copy This To Chat</h2>
      <div class="chat-copy">${chatPrompt}</div>
    </section>

    <section class="section">
      <h2>Save Approved Answers</h2>
      <p class="note">After the user answers, keep only reusable answers they explicitly approve. Add <code>--dry-run</code> first, then rerun without it.</p>
      <div class="command">${approveCommand}</div>
      <p class="note">The JSON approval template remains available as fallback evidence; do not edit generated files unless a file review is easier.</p>
    </section>

    <section class="section">
      <h2>Questions To Ask</h2>
      <div class="prompt-list">
        ${promptRows}
      </div>
    </section>

    <section class="section">
      <h2>Preflight Checks</h2>
      <table>
        <thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead>
        <tbody>${checks}</tbody>
      </table>
    </section>

    <section class="section">
      <h2>Artifacts</h2>
      <div class="artifact-grid">
        <div><p class="muted">Plan</p><code>${escapeHtml(report.selectedPlanId ?? "none")}</code></div>
        <div><p class="muted">Job</p><code>${escapeHtml(report.selectedJobId ?? "none")}</code></div>
        <div><p class="muted">Company</p><code>${escapeHtml(report.selectedCompany ?? "unknown")}</code></div>
        <div><p class="muted">Role</p><code>${escapeHtml(report.selectedRoleTitle ?? "unknown")}</code></div>
        <div><p class="muted">URL</p><code>${escapeHtml(report.checkedUrl ?? "not opened")}</code></div>
        <div><p class="muted">Approval template</p><code>${escapeHtml(report.paths.answerApprovalTemplate)}</code></div>
        <div><p class="muted">Markdown prompts</p><code>${escapeHtml(report.paths.answerPromptsMarkdown)}</code></div>
        <div><p class="muted">JSON prompts</p><code>${escapeHtml(report.paths.answerPrompts)}</code></div>
        <div><p class="muted">Preflight report</p><code>${escapeHtml(report.paths.report)}</code></div>
      </div>
    </section>
  </main>
</body>
</html>
`;
}

function renderChatPromptHtml(report: LiveBrowserPreflightReport, prompts: LiveBrowserAnswerPrompt[]): string {
  return escapeHtml(renderChatPromptPlainText(report, prompts));
}

function renderChatPromptPlainText(report: LiveBrowserPreflightReport, prompts: LiveBrowserAnswerPrompt[]): string {
  if (prompts.length === 0) {
    return "No application-form answers are needed from the user. Review the preflight report before filling the page.";
  }
  const reusable = prompts.filter((prompt) => prompt.canSaveAsReusable);
  const oneOff = prompts.filter((prompt) => !prompt.canSaveAsReusable);
  const reusableLines = reusable.length > 0
    ? reusable.map((prompt, index) => `${index + 1}. ${prompt.question}`).join("\n")
    : "None.";
  const oneOffLines = oneOff.length > 0
    ? oneOff.map((prompt, index) => `${index + 1}. ${oneOffQuestionForChat(prompt)}`).join("\n")
    : "None.";
  return [
    "I paused before filling this application form.",
    "",
    `Company: ${report.selectedCompany ?? "selected company"}`,
    `Role: ${report.selectedRoleTitle ?? "selected role"}`,
    `Page: ${report.checkedUrl ?? "not opened"}`,
    "",
    "I need a few answers before I can continue.",
    "",
    "Reusable with your approval:",
    reusableLines,
    "",
    "Use once for this application:",
    oneOffLines,
    "",
    "Please answer in the same order and tell me which reusable answers I may save for future forms."
  ].join("\n");
}

function renderAnswerPromptHtml(prompt: LiveBrowserAnswerPrompt, index: number): string {
  const command = prompt.suggestedDryRunCommand
    ? `<div class="command">${escapeHtml(prompt.suggestedDryRunCommand)}</div>`
    : "";
  return `<article class="prompt">
    <div class="index">${index}</div>
    <div>
      <p class="question">${escapeHtml(prompt.question)}</p>
      <div class="details">
        <span class="pill">${escapeHtml(prompt.field)}</span>
        <span class="pill">${escapeHtml(formatPromptKind(prompt.kind))}</span>
        <span class="pill ${prompt.canSaveAsReusable ? "tone-pass" : "tone-skipped"}">${prompt.canSaveAsReusable ? "Reusable with approval" : "Use once only"}</span>
      </div>
      ${command}
    </div>
    <aside class="side-note">
      <p>${escapeHtml(prompt.note)}</p>
    </aside>
  </article>`;
}

function renderAnswerPrompt(prompt: LiveBrowserAnswerPrompt, index: number): string {
  const command = prompt.suggestedDryRunCommand
    ? `\nSuggested dry-run:\n\n\`\`\`powershell\n${prompt.suggestedDryRunCommand}\n\`\`\``
    : "";
  return `## ${index}. ${prompt.question}

- Field: \`${prompt.field}\`
- Type: ${prompt.kind}
- Can save for reuse: ${prompt.canSaveAsReusable ? "yes" : "no"}
- Note: ${prompt.note}${command}`;
}

function formatPromptKind(kind: LiveBrowserAnswerPrompt["kind"]): string {
  return kind === "sensitive_required_field" ? "Sensitive field" : "Required field";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cleanQuestion(value: string): string {
  const cleaned = value.replace(/\s+/g, " ").replace(/\*+$/, "").trim();
  return cleaned || "Unlabeled field";
}

function isBlockedReusableField(question: string): boolean {
  return /password|otp|one[-\s]?time|token|secret|cookie|session|credit\s*card|card\s*number|cvv|bank\s*account|passport|national\s*id|\bssn\b|social\s*security/i
    .test(question);
}

function quoteCliArg(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "answer";
}
