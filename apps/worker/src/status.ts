import type { ProgressFreshnessSummary, ProgressScanHistorySummary, ProgressSourceOutcomeSummary, ProgressSourceQualitySummary, RunManifest } from "@applycue/core";
import { getApplyCueProfileConfigPath, getApplyCueProfileDir } from "@applycue/profile";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { BrowserApplyUatReport, BrowserApplyUatStatus } from "./browser-uat.js";
import type { LiveBrowserPreflightReport, LiveBrowserPreflightStatus } from "./live-preflight.js";
import type { UatReport, UatStatus } from "./uat.js";

export type ApplyCueStatusKind = "needs_setup" | "needs_profile" | "needs_run" | "needs_uat" | "warning" | "blocked" | "ready";

export interface ApplyCueStatusOptions {
  applyCueHome?: string;
  env?: NodeJS.ProcessEnv;
  profileKey?: string;
}

export interface ApplyCueConfigStatus {
  exists: boolean;
  hasBaseCv: boolean;
  hasTargetRoles: boolean;
  hasUserIdentity: boolean;
  readError?: string;
}

export interface ApplyCueLatestUatStatus {
  status: UatStatus;
  summary: string;
  checks: Array<{
    id: string;
    label: string;
    status: UatStatus;
    detail: string;
  }>;
  counts: UatReport["counts"];
  generatedAt: string;
}

export interface ApplyCueLatestBrowserUatStatus {
  status: BrowserApplyUatStatus;
  summary: string;
  resultStatus?: BrowserApplyUatReport["resultStatus"];
  generatedAt: string;
}

export interface ApplyCueLatestLivePreflightStatus {
  status: LiveBrowserPreflightStatus;
  summary: string;
  approvalCommand?: string;
  answerPromptCount?: number;
  reusableAnswerPromptCount?: number;
  oneOffAnswerPromptCount?: number;
  answerQuestions?: string[];
  selectedCompany?: string;
  selectedRoleTitle?: string;
  checkedUrl?: string;
  generatedAt: string;
  isCurrent: boolean;
}

export interface ApplyCueLatestRunStatus {
  id: string;
  kind: RunManifest["kind"];
  applications: number;
  browserPlanSourceIds: string[];
  cvs: number;
  jobs: number;
  profileId: string;
  sourceCodeWriteCount: number;
  freshness?: ProgressFreshnessSummary;
  scanHistory?: ProgressScanHistorySummary;
  sourceOutcomes?: ProgressSourceOutcomeSummary;
  sourceQuality?: ProgressSourceQualitySummary;
}

export interface ApplyCueStatusReport {
  agentHandoff: ApplyCueAgentHandoff;
  generatedAt: string;
  status: ApplyCueStatusKind;
  config: ApplyCueConfigStatus;
  missing: string[];
  nextAction: string;
  paths: {
    config: string;
    liveAnswerApprovalTemplate: string;
    dashboard: string;
    browserUatReport: string;
    liveAnswerPrompts: string;
    liveAnswerPromptsHtml: string;
    liveAnswerPromptsMarkdown: string;
    livePreflightReport: string;
    manifest?: string;
    profile: string;
    summary: string;
    uatReport: string;
  };
  summaryExcerpt: string[];
  latestBrowserUat?: ApplyCueLatestBrowserUatStatus;
  latestLivePreflight?: ApplyCueLatestLivePreflightStatus;
  latestRun?: ApplyCueLatestRunStatus;
  latestUat?: ApplyCueLatestUatStatus;
}

export interface ApplyCueAgentHandoff {
  headline: string;
  commandCenter: string[];
  readyQueue: string[];
  needsAttention: string[];
  nextSteps: string[];
  evidence: string[];
}

interface MinimalApplyCueConfig {
  baseCvs?: Array<{ path?: unknown }>;
  preferences?: {
    targetRoleTerms?: unknown;
  };
  profile?: {
    baseCvPath?: unknown;
    email?: unknown;
    name?: unknown;
    phone?: unknown;
  };
}

export async function readApplyCueStatus(options: ApplyCueStatusOptions = {}): Promise<ApplyCueStatusReport> {
  const storageOptions = {
    env: options.env ?? process.env,
    ...(options.applyCueHome ? { applyCueHome: options.applyCueHome } : {}),
    ...(options.profileKey ? { profileKey: options.profileKey } : {})
  };
  const profileDir = getApplyCueProfileDir(storageOptions);
  const configPath = getApplyCueProfileConfigPath(storageOptions);
  const runsDir = path.join(profileDir, "outputs", "runs");
  const dashboardPath = path.join(profileDir, "outputs", "dashboard", "latest.html");
  const summaryPath = path.join(runsDir, "latest-summary.md");
  const uatReportPath = path.join(runsDir, "uat-report.json");
  const browserUatReportPath = path.join(profileDir, "outputs", "browser-uat", "browser-uat-report.json");
  const livePreflightDir = path.join(profileDir, "outputs", "live-preflight");
  const livePreflightReportPath = path.join(livePreflightDir, "live-preflight-report.json");
  const liveAnswerApprovalTemplatePath = path.join(livePreflightDir, "live-answer-approval-template.json");
  const liveAnswerPromptsPath = path.join(livePreflightDir, "live-answer-prompts.json");
  const liveAnswerPromptsHtmlPath = path.join(livePreflightDir, "live-answer-prompts.html");
  const liveAnswerPromptsMarkdownPath = path.join(livePreflightDir, "live-answer-prompts.md");

  const config = await readConfigStatus(configPath);
  const latestUat = await readLatestUat(uatReportPath);
  const latestBrowserUat = await readLatestBrowserUat(browserUatReportPath);
  const latestLivePreflight = await readLatestLivePreflight(livePreflightReportPath);
  const manifestPath = await resolveManifestPath(runsDir, latestUat?.paths.manifest);
  const latestRun = manifestPath ? await readLatestRun(manifestPath) : undefined;
  const currentLivePreflight = isLivePreflightCurrent(latestLivePreflight, latestRun)
    ? latestLivePreflight
    : undefined;
  const summaryContent = await readSummary(summaryPath);
  const summaryExcerpt = getSummaryExcerpt(summaryContent);

  const missing = buildMissingList({
    config,
    dashboardExists: await fileExists(dashboardPath),
    latestRun,
    latestUat,
    summaryExists: summaryExcerpt.length > 0
  });
  const status = determineStatus(config, latestUat, latestRun, summaryExcerpt.length > 0);
  const paths = {
    config: configPath,
    dashboard: dashboardPath,
    browserUatReport: browserUatReportPath,
    liveAnswerApprovalTemplate: liveAnswerApprovalTemplatePath,
    liveAnswerPrompts: liveAnswerPromptsPath,
    liveAnswerPromptsHtml: liveAnswerPromptsHtmlPath,
    liveAnswerPromptsMarkdown: liveAnswerPromptsMarkdownPath,
    livePreflightReport: livePreflightReportPath,
    ...(manifestPath ? { manifest: manifestPath } : {}),
    profile: profileDir,
    summary: summaryPath,
    uatReport: uatReportPath
  };
  const report: ApplyCueStatusReport = {
    agentHandoff: buildAgentHandoff({
      latestRun,
      latestBrowserUat,
      latestLivePreflight: currentLivePreflight,
      latestUat,
      missing,
      paths,
      status,
      summaryContent
    }),
    generatedAt: new Date().toISOString(),
    status,
    config,
    missing,
    nextAction: nextActionFor(status, missing, currentLivePreflight, latestBrowserUat),
    paths,
    summaryExcerpt
  };
  if (latestRun) report.latestRun = latestRun;
  if (latestBrowserUat) {
    report.latestBrowserUat = {
      status: latestBrowserUat.status,
      summary: latestBrowserUat.summary,
      ...(latestBrowserUat.resultStatus ? { resultStatus: latestBrowserUat.resultStatus } : {}),
      generatedAt: latestBrowserUat.generatedAt
    };
  }
  if (latestLivePreflight) {
    const promptSummary = summarizeLiveAnswerPrompts(latestLivePreflight);
    report.latestLivePreflight = {
      status: latestLivePreflight.status,
      summary: latestLivePreflight.summary,
      ...promptSummary,
      ...(latestLivePreflight.selectedCompany ? { selectedCompany: latestLivePreflight.selectedCompany } : {}),
      ...(latestLivePreflight.selectedRoleTitle ? { selectedRoleTitle: latestLivePreflight.selectedRoleTitle } : {}),
      ...(latestLivePreflight.checkedUrl ? { checkedUrl: latestLivePreflight.checkedUrl } : {}),
      generatedAt: latestLivePreflight.generatedAt,
      isCurrent: Boolean(currentLivePreflight)
    };
  }
  if (latestUat) {
    report.latestUat = {
      status: latestUat.status,
      summary: latestUat.summary,
      checks: latestUat.checks,
      counts: latestUat.counts,
      generatedAt: latestUat.generatedAt
    };
  }
  return report;
}

export function formatApplyCueStatus(report: ApplyCueStatusReport): string {
  const lines = [
    `ApplyCue status: ${labelStatus(report.status)}`,
    `Profile: ${report.paths.profile}`,
    `Config: ${report.config.exists ? "found" : "missing"} (${report.paths.config})`
  ];

  if (report.latestUat) {
    lines.push(`UAT: ${report.latestUat.status.toUpperCase()} - ${report.latestUat.summary}`);
  } else {
    lines.push("UAT: not run yet.");
  }
  if (report.latestBrowserUat) {
    lines.push(`Browser UAT: ${report.latestBrowserUat.status.toUpperCase()} - ${report.latestBrowserUat.summary}`);
  } else {
    lines.push("Browser UAT: not run yet.");
  }
  if (report.latestLivePreflight && !report.latestLivePreflight.isCurrent) {
    const label = [report.latestLivePreflight.selectedCompany, report.latestLivePreflight.selectedRoleTitle]
      .filter(Boolean)
      .join(" - ") || "selected application";
    lines.push(
      `Live preflight: stale - previous ${report.latestLivePreflight.status.toUpperCase()} for ${label} no longer matches the current prepared browser plans.`
    );
  } else if (report.latestLivePreflight) {
    lines.push(`Live preflight: ${report.latestLivePreflight.status.toUpperCase()} - ${report.latestLivePreflight.summary}`);
    if ((report.latestLivePreflight.answerPromptCount ?? 0) > 0) {
      lines.push(
        `Live answer prompts: ${report.latestLivePreflight.answerPromptCount} question(s), ` +
        `${report.latestLivePreflight.reusableAnswerPromptCount ?? 0} reusable with approval, ` +
        `${report.latestLivePreflight.oneOffAnswerPromptCount ?? 0} one-off.`
      );
      for (const question of report.latestLivePreflight.answerQuestions ?? []) {
        lines.push(`- Ask: ${question}`);
      }
      if (report.latestLivePreflight.approvalCommand) {
        lines.push(`Approval command: ${report.latestLivePreflight.approvalCommand}`);
      }
    }
  } else {
    lines.push("Live preflight: not run yet.");
  }

  if (report.latestRun) {
    lines.push(
      `Latest run: ${report.latestRun.jobs} job(s), ${report.latestRun.cvs} CV(s), ${report.latestRun.applications} application draft(s).`
    );
    if (report.latestRun.sourceQuality) {
      lines.push(
        `Source quality: ${report.latestRun.sourceQuality.keptJobs} kept of ${report.latestRun.sourceQuality.inputJobs} found.`
      );
    }
    if (report.latestRun.freshness) {
      lines.push(
        `Freshness: ${report.latestRun.freshness.keptJobs} kept in ${report.latestRun.freshness.windowDays} day(s), ${report.latestRun.freshness.filteredOldJobs} older known post(s) held back.`
      );
    }
    if (report.latestRun.scanHistory) {
      lines.push(
        `Scan history: ${report.latestRun.scanHistory.skippedJobs} repeat(s) skipped, ${report.latestRun.scanHistory.repostClusters} repost signal(s).`
      );
    }
    if (report.latestRun.sourceOutcomes) {
      lines.push(
        `Source learning: ${report.latestRun.sourceOutcomes.replies} repl${report.latestRun.sourceOutcomes.replies === 1 ? "y" : "ies"}, ${report.latestRun.sourceOutcomes.interviews} interview(s), ${report.latestRun.sourceOutcomes.offers} offer(s).`
      );
    }
  } else {
    lines.push("Latest run: no manifest found.");
  }

  if (report.missing.length > 0) {
    lines.push(`Missing or not proven: ${report.missing.join(", ")}.`);
  }
  lines.push("");
  lines.push("Agent handoff:");
  lines.push(`- ${report.agentHandoff.headline}`);
  if (report.agentHandoff.commandCenter.length > 0) {
    lines.push("Agent command center:");
    for (const command of report.agentHandoff.commandCenter.slice(0, 6)) {
      lines.push(`- ${command}`);
    }
  }
  for (const item of report.agentHandoff.readyQueue.slice(0, 5)) {
    lines.push(`- Ready: ${item}`);
  }
  for (const item of report.agentHandoff.needsAttention.slice(0, 5)) {
    lines.push(`- Needs attention: ${item}`);
  }
  for (const item of report.agentHandoff.nextSteps.slice(0, 5)) {
    lines.push(`- Next: ${item}`);
  }
  lines.push(`Dashboard: ${report.paths.dashboard}`);
  lines.push(`Summary: ${report.paths.summary}`);
  if (report.latestLivePreflight?.status === "pause" && report.latestLivePreflight.isCurrent) {
    lines.push(`Answer review page: ${report.paths.liveAnswerPromptsHtml}`);
    lines.push(`Answer prompts: ${report.paths.liveAnswerPromptsMarkdown}`);
    lines.push(`Answer approval template: ${report.paths.liveAnswerApprovalTemplate}`);
  }
  lines.push(`Next: ${report.nextAction}`);

  if (report.summaryExcerpt.length > 0) {
    lines.push("", "Latest summary excerpt:", ...report.summaryExcerpt.map((line) => `  ${line}`));
  }

  return lines.join("\n");
}

async function readConfigStatus(configPath: string): Promise<ApplyCueConfigStatus> {
  if (!(await fileExists(configPath))) {
    return {
      exists: false,
      hasBaseCv: false,
      hasTargetRoles: false,
      hasUserIdentity: false
    };
  }
  try {
    const parsed = JSON.parse(await readFile(configPath, "utf8")) as MinimalApplyCueConfig;
    return {
      exists: true,
      hasBaseCv: hasConfiguredBaseCv(parsed),
      hasTargetRoles: hasConfiguredTargetRoles(parsed),
      hasUserIdentity: hasConfiguredIdentity(parsed)
    };
  } catch (error) {
    return {
      exists: true,
      hasBaseCv: false,
      hasTargetRoles: false,
      hasUserIdentity: false,
      readError: error instanceof Error ? error.message : String(error)
    };
  }
}

async function readLatestUat(uatReportPath: string): Promise<UatReport | undefined> {
  const parsed = await readJsonFile<unknown>(uatReportPath);
  return isUatReport(parsed) ? parsed : undefined;
}

async function readLatestBrowserUat(browserUatReportPath: string): Promise<BrowserApplyUatReport | undefined> {
  const parsed = await readJsonFile<unknown>(browserUatReportPath);
  return isBrowserUatReport(parsed) ? parsed : undefined;
}

async function readLatestLivePreflight(livePreflightReportPath: string): Promise<LiveBrowserPreflightReport | undefined> {
  const parsed = await readJsonFile<unknown>(livePreflightReportPath);
  return isLivePreflightReport(parsed) ? parsed : undefined;
}

async function readLatestRun(manifestPath: string): Promise<ApplyCueLatestRunStatus | undefined> {
  const parsed = await readJsonFile<unknown>(manifestPath);
  if (!isRunManifest(parsed)) return undefined;
  const latestRun: ApplyCueLatestRunStatus = {
    id: parsed.id,
    kind: parsed.kind,
    applications: parsed.applicationIds.length,
    browserPlanSourceIds: browserPlanSourceIds(parsed),
    cvs: parsed.cvVariantIds.length,
    jobs: parsed.jobIds.length,
    profileId: parsed.profileId,
    sourceCodeWriteCount: parsed.sourceCodeWriteCount
  };
  if (parsed.freshness) latestRun.freshness = parsed.freshness;
  if (parsed.scanHistory) latestRun.scanHistory = parsed.scanHistory;
  if (parsed.sourceOutcomes) latestRun.sourceOutcomes = parsed.sourceOutcomes;
  if (parsed.sourceQuality) latestRun.sourceQuality = parsed.sourceQuality;
  return latestRun;
}

function browserPlanSourceIds(manifest: RunManifest): string[] {
  return [
    ...new Set(
      manifest.generatedFiles
        .filter((file) => file.kind === "browser_plan_json")
        .flatMap((file) => file.sourceIds)
    )
  ];
}

function isLivePreflightCurrent(
  latestLivePreflight: LiveBrowserPreflightReport | undefined,
  latestRun: ApplyCueLatestRunStatus | undefined
): boolean {
  if (!latestLivePreflight || !latestRun) return false;
  const sourceIds = new Set(latestRun.browserPlanSourceIds);
  return Boolean(
    (latestLivePreflight.selectedPlanId && sourceIds.has(latestLivePreflight.selectedPlanId)) ||
    (latestLivePreflight.selectedJobId && sourceIds.has(latestLivePreflight.selectedJobId))
  );
}

async function resolveManifestPath(runsDir: string, reportedManifestPath?: string): Promise<string | undefined> {
  if (reportedManifestPath && await fileExists(reportedManifestPath)) return reportedManifestPath;
  return findLatestManifestPath(runsDir);
}

async function findLatestManifestPath(runsDir: string): Promise<string | undefined> {
  try {
    const entries = await readdir(runsDir, { withFileTypes: true });
    const candidates = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && entry.name !== "uat-report.json")
      .map((entry) => path.join(runsDir, entry.name));
    let latest: { path: string; mtimeMs: number } | undefined;
    for (const candidate of candidates) {
      const stats = await stat(candidate);
      if (!latest || stats.mtimeMs > latest.mtimeMs) latest = { path: candidate, mtimeMs: stats.mtimeMs };
    }
    return latest?.path;
  } catch {
    return undefined;
  }
}

async function readSummary(summaryPath: string): Promise<string> {
  try {
    return await readFile(summaryPath, "utf8");
  } catch {
    return "";
  }
}

function getSummaryExcerpt(summaryContent: string): string[] {
  return summaryContent
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(0, 18);
}

function buildAgentHandoff(input: {
  latestBrowserUat: BrowserApplyUatReport | undefined;
  latestLivePreflight: LiveBrowserPreflightReport | undefined;
  latestRun: ApplyCueLatestRunStatus | undefined;
  latestUat: UatReport | undefined;
  missing: string[];
  paths: ApplyCueStatusReport["paths"];
  status: ApplyCueStatusKind;
  summaryContent: string;
}): ApplyCueAgentHandoff {
  const parsed = parseRunSummaryForHandoff(input.summaryContent);
  const headline = buildHandoffHeadline(input.status, input.latestUat, input.latestRun, input.missing);
  const readyQueue = parsed.readyQueue.length > 0
    ? parsed.readyQueue
    : input.latestRun?.applications
      ? [`${input.latestRun.applications} prepared application(s); open the summary for role details.`]
      : [];
  const needsAttention = [
    ...input.missing.map((item) => `Missing or not proven: ${item}`),
    ...browserUatAttention(input.latestBrowserUat),
    ...livePreflightAttention(input.latestLivePreflight),
    ...parsed.needsAttention
  ];
  const browserSteps = browserUatNextSteps(input.latestBrowserUat);
  const liveSteps = livePreflightNextSteps(input.latestLivePreflight);
  const safetySteps = [...browserSteps, ...liveSteps];
  const nextSteps = [
    ...safetySteps,
    ...(parsed.nextSteps.length > 0
      ? parsed.nextSteps
      : safetySteps.length > 0
        ? []
        : [nextActionFor(input.status, input.missing, input.latestLivePreflight, input.latestBrowserUat)])
  ];
  const commandCenter = buildCommandCenter(input);
  const evidence = [
    `Profile: ${input.paths.profile}`,
    `Config: ${input.paths.config}`,
    `Dashboard: ${input.paths.dashboard}`,
    `Summary: ${input.paths.summary}`,
    `UAT report: ${input.paths.uatReport}`,
    `Browser UAT report: ${input.paths.browserUatReport}`,
    `Live preflight report: ${input.paths.livePreflightReport}`,
    `Live answer approval template: ${input.paths.liveAnswerApprovalTemplate}`,
    `Live answer review page: ${input.paths.liveAnswerPromptsHtml}`,
    `Live answer prompts: ${input.paths.liveAnswerPromptsMarkdown}`,
    ...(input.paths.manifest ? [`Manifest: ${input.paths.manifest}`] : [])
  ];
  return {
    headline,
    commandCenter,
    readyQueue,
    needsAttention,
    nextSteps,
    evidence
  };
}

function livePreflightAttention(latestLivePreflight: LiveBrowserPreflightReport | undefined): string[] {
  if (!latestLivePreflight) return [];
  if (latestLivePreflight.status === "pass") return [];
  const label = livePreflightLabel(latestLivePreflight);
  if (latestLivePreflight.status === "pause") {
    const promptCount = latestLivePreflight.answerPrompts?.length ?? 0;
    if (promptCount > 0) {
      return [`Live preflight paused for ${label}: ${promptCount} answer prompt(s) need review before filling the form.`];
    }
    return [`Live preflight paused for ${label}: review pause reasons before filling the form.`];
  }
  if (latestLivePreflight.status === "skipped") {
    return [`Live preflight skipped for ${label}: browser tooling or page access was not available.`];
  }
  return [`Live preflight failed for ${label}: fix this before filling real portal forms.`];
}

function livePreflightLabel(latestLivePreflight: LiveBrowserPreflightReport): string {
  const company = latestLivePreflight.selectedCompany ?? "selected company";
  const role = latestLivePreflight.selectedRoleTitle ?? "selected role";
  return `${company} - ${role}`;
}

function livePreflightNextSteps(latestLivePreflight: LiveBrowserPreflightReport | undefined): string[] {
  if (!latestLivePreflight) return [];
  if (latestLivePreflight.status === "pass") {
    return ["Confirm master form data if needed, then run controlled live apply to fill/upload in review mode and pause before final submit."];
  }
  if (latestLivePreflight.status === "skipped") {
    return ["Run live browser preflight after browser tooling is available before filling real portal forms."];
  }
  if (latestLivePreflight.status === "pause") {
    const promptCount = latestLivePreflight.answerPrompts?.length ?? 0;
    return [
      promptCount > 0
        ? `Ask the ${promptCount} live preflight answer prompt(s), save approved reusable answers with ${approvalCommandPreview(latestLivePreflight)}, then rerun the batch/preflight.`
        : "Review the live preflight pause reasons before filling the real portal form."
    ];
  }
  return ["Fix live browser preflight failure before filling real portal forms."];
}

function summarizeLiveAnswerPrompts(latestLivePreflight: LiveBrowserPreflightReport): Pick<
  ApplyCueLatestLivePreflightStatus,
  "approvalCommand" | "answerPromptCount" | "reusableAnswerPromptCount" | "oneOffAnswerPromptCount" | "answerQuestions"
> {
  const prompts = latestLivePreflight.answerPrompts ?? [];
  const reusable = prompts.filter((prompt) => prompt.canSaveAsReusable).length;
  const summary: Pick<
    ApplyCueLatestLivePreflightStatus,
    "approvalCommand" | "answerPromptCount" | "reusableAnswerPromptCount" | "oneOffAnswerPromptCount" | "answerQuestions"
  > = {
    approvalCommand: approvalCommandPreview(latestLivePreflight),
    answerPromptCount: prompts.length,
    reusableAnswerPromptCount: reusable,
    oneOffAnswerPromptCount: prompts.length - reusable,
    answerQuestions: prompts.slice(0, 5).map(displayLiveAnswerQuestion)
  };
  return summary;
}

function displayLiveAnswerQuestion(prompt: NonNullable<LiveBrowserPreflightReport["answerPrompts"]>[number]): string {
  if (prompt.question === "Unlabeled field") {
    return "One required field on the page had no visible label; inspect it before answering.";
  }
  return prompt.question;
}

function approvalCommandPreview(latestLivePreflight: LiveBrowserPreflightReport): string {
  return approvalCommand(latestLivePreflight, 3);
}

function approvalCommand(latestLivePreflight: LiveBrowserPreflightReport, maxFields = Number.POSITIVE_INFINITY): string {
  const reusableFields = (latestLivePreflight.answerPrompts ?? [])
    .filter((prompt) => prompt.canSaveAsReusable)
    .map((prompt) => prompt.field)
    .filter(Boolean);
  const visibleFields = Number.isFinite(maxFields) ? reusableFields.slice(0, maxFields) : reusableFields;
  const sets = visibleFields.map((field) => `--set ${field}="<approved answer>"`);
  const suffix = Number.isFinite(maxFields) && reusableFields.length > maxFields ? " ..." : "";
  return `pnpm approve-answers -- --from-live ${sets.join(" ")}${suffix}`.trim();
}

function buildCommandCenter(input: {
  latestBrowserUat: BrowserApplyUatReport | undefined;
  latestLivePreflight: LiveBrowserPreflightReport | undefined;
  status: ApplyCueStatusKind;
}): string[] {
  if (input.status === "needs_setup" || input.status === "needs_profile") {
    return ["pnpm setup-applycue", "pnpm status"];
  }
  if (input.status === "needs_run") {
    return ["pnpm first-build", "pnpm uat", "pnpm status"];
  }
  if (input.status === "needs_uat") {
    return ["pnpm uat", "pnpm browser-uat", "pnpm status"];
  }
  if (input.status === "blocked") {
    return ["pnpm uat", "pnpm status"];
  }
  if (input.status === "warning" && input.latestBrowserUat && input.latestBrowserUat.status !== "pass") {
    return ["pnpm browser-uat", "pnpm status"];
  }
  if (input.status === "warning") {
    return ["pnpm form-data", "pnpm apply-route", "pnpm uat", "pnpm status"];
  }
  if (input.latestBrowserUat && input.latestBrowserUat.status !== "pass") {
    return ["pnpm browser-uat", "pnpm status"];
  }
  if (input.latestLivePreflight && input.latestLivePreflight.status !== "pass") {
    return livePreflightCommandCenter(input.latestLivePreflight);
  }
  if (input.latestLivePreflight?.status === "pass") {
    return ["pnpm form-data", "pnpm browser-live-apply", "pnpm browser-live-preflight", "pnpm status"];
  }
  return ["pnpm form-data", "pnpm apply-route", "pnpm browser-live-preflight", "pnpm status"];
}

function livePreflightCommandCenter(latestLivePreflight: LiveBrowserPreflightReport): string[] {
  if (latestLivePreflight.status === "skipped") {
    return ["pnpm browser-live-preflight", "pnpm status"];
  }
  if (latestLivePreflight.status === "pause") {
    const promptCount = latestLivePreflight.answerPrompts?.length ?? 0;
    const reusablePromptCount = latestLivePreflight.answerPrompts?.filter((prompt) => prompt.canSaveAsReusable).length ?? 0;
    if (promptCount > 0 && reusablePromptCount > 0) {
      const command = approvalCommand(latestLivePreflight);
      return [`${command} --dry-run`, command, "pnpm browser-live-preflight", "pnpm status"];
    }
    return ["pnpm browser-live-preflight", "pnpm status"];
  }
  return ["pnpm browser-live-preflight", "pnpm status"];
}

function browserUatAttention(latestBrowserUat: BrowserApplyUatReport | undefined): string[] {
  if (!latestBrowserUat) return [];
  if (latestBrowserUat.status === "pass") return [];
  return [`Browser UAT ${latestBrowserUat.status}: ${latestBrowserUat.summary}`];
}

function browserUatNextSteps(latestBrowserUat: BrowserApplyUatReport | undefined): string[] {
  if (!latestBrowserUat || latestBrowserUat.status === "pass") return [];
  if (latestBrowserUat.status === "skipped") {
    return ["Install or verify optional browser tooling, then rerun browser UAT before live portal application testing."];
  }
  return ["Fix browser UAT before live portal application testing."];
}

function buildHandoffHeadline(
  status: ApplyCueStatusKind,
  latestUat: UatReport | undefined,
  latestRun: ApplyCueLatestRunStatus | undefined,
  missing: string[]
): string {
  if (status === "ready" && latestRun) {
    return `Ready for review: ${latestRun.applications} application draft(s), ${latestRun.cvs} CV(s), UAT ${latestUat?.status ?? "unknown"}.`;
  }
  if (status === "warning" && latestRun) {
    return `Usable with warnings: ${latestRun.applications} draft(s) prepared; address UAT warnings before increasing automation.`;
  }
  if (status === "blocked") {
    return "Blocked: fix failing UAT checks before applying or presenting the run as ready.";
  }
  if (status === "needs_profile") {
    return `Setup needs blocking profile data: ${missing.join(", ") || "profile details"}.`;
  }
  if (status === "needs_run") {
    return "Profile exists, but no current run summary is available.";
  }
  if (status === "needs_uat") {
    return "Run exists, but UAT has not proven it is safe for browser/application work.";
  }
  return "Setup has not started for this ApplyCue profile.";
}

function parseRunSummaryForHandoff(summaryContent: string): Pick<ApplyCueAgentHandoff, "readyQueue" | "needsAttention" | "nextSteps"> {
  if (!summaryContent.trim()) {
    return {
      readyQueue: [],
      needsAttention: [],
      nextSteps: []
    };
  }
  return {
    readyQueue: parsePreparedQueueItems(extractMarkdownSection(summaryContent, "Prepared Queue")),
    needsAttention: parseBulletItems(extractMarkdownSection(summaryContent, "Skipped Or Watch")),
    nextSteps: parseBulletItems(extractMarkdownSection(summaryContent, "Next Actions"))
  };
}

function extractMarkdownSection(markdown: string, heading: string): string {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (headingIndex === -1) return "";
  const nextHeadingIndex = lines.findIndex((line, index) => index > headingIndex && /^##\s+\S/.test(line.trim()));
  return lines.slice(headingIndex + 1, nextHeadingIndex === -1 ? lines.length : nextHeadingIndex).join("\n");
}

function parsePreparedQueueItems(section: string): string[] {
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.match(/^\d+\.\s+(.+)$/)?.[1]?.trim())
    .filter((item): item is string => Boolean(item))
    .slice(0, 10);
}

function parseBulletItems(section: string): string[] {
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.match(/^-\s+(.+)$/)?.[1]?.trim())
    .filter((item): item is string => Boolean(item))
    .slice(0, 10);
}

function determineStatus(
  config: ApplyCueConfigStatus,
  latestUat: UatReport | undefined,
  latestRun: ApplyCueLatestRunStatus | undefined,
  hasSummary: boolean
): ApplyCueStatusKind {
  if (!config.exists) return "needs_setup";
  if (config.readError || !config.hasBaseCv || !config.hasTargetRoles || !config.hasUserIdentity) return "needs_profile";
  if (!latestRun || !hasSummary) return "needs_run";
  if (!latestUat) return "needs_uat";
  if (latestUat.status === "fail") return "blocked";
  if (latestUat.status === "warn") return "warning";
  return "ready";
}

function buildMissingList(input: {
  config: ApplyCueConfigStatus;
  dashboardExists: boolean;
  latestRun: ApplyCueLatestRunStatus | undefined;
  latestUat: UatReport | undefined;
  summaryExists: boolean;
}): string[] {
  const missing: string[] = [];
  if (!input.config.exists) {
    missing.push("profile config");
  } else {
    if (input.config.readError) missing.push("readable profile config");
    if (!input.config.hasUserIdentity) missing.push("user identity/contact");
    if (!input.config.hasBaseCv) missing.push("base CV");
    if (!input.config.hasTargetRoles) missing.push("target roles");
  }
  if (!input.latestRun) missing.push("latest run manifest");
  if (!input.summaryExists) missing.push("chat summary");
  if (!input.dashboardExists) missing.push("dashboard");
  if (!input.latestUat) missing.push("UAT report");
  return missing;
}

function nextActionFor(
  status: ApplyCueStatusKind,
  missing: string[],
  latestLivePreflight?: LiveBrowserPreflightReport,
  latestBrowserUat?: BrowserApplyUatReport
): string {
  if (status === "needs_setup") {
    return "Set up the profile store, import the CV, collect target roles, then run the first review batch.";
  }
  if (status === "needs_profile") {
    return `Ask only for the missing blocking setup data (${missing.join(", ")}), then rerun setup in review mode.`;
  }
  if (status === "needs_run") {
    return "Run a safe review batch so the dashboard, summary, and manifest exist.";
  }
  if (status === "needs_uat") {
    return "Run UAT before live browser application testing.";
  }
  if (status === "blocked") {
    return "Fix the failing UAT checks before applying or showing the run as ready.";
  }
  if (status === "warning") {
    return "Review and confirm master form data, then run apply-route for prepared applications that passed gates; address the UAT warning before increasing automation.";
  }
  const browserAction = browserNextAction(latestBrowserUat);
  if (browserAction) return browserAction;
  const liveAction = livePreflightNextAction(latestLivePreflight);
  if (liveAction) return liveAction;
  return "Review and confirm master form data, then run apply-route for a prepared application and follow its browser/email/DM/API/manual handoff under the user's policy.";
}

function browserNextAction(latestBrowserUat: BrowserApplyUatReport | undefined): string | undefined {
  if (!latestBrowserUat || latestBrowserUat.status === "pass") return undefined;
  if (latestBrowserUat.status === "skipped") {
    return "Install or verify optional browser tooling, then rerun browser UAT before live portal application testing.";
  }
  return "Fix browser UAT before filling live portal forms.";
}

function livePreflightNextAction(latestLivePreflight: LiveBrowserPreflightReport | undefined): string | undefined {
  if (!latestLivePreflight) return undefined;
  if (latestLivePreflight.status === "pass") {
    return "Confirm master form data if needed, then run controlled live apply to fill/upload in review mode and pause before final submit.";
  }
  if (latestLivePreflight.status === "skipped") {
    return "Run live browser preflight after browser tooling is available before filling real portal forms.";
  }
  if (latestLivePreflight.status === "pause") {
    const promptCount = latestLivePreflight.answerPrompts?.length ?? 0;
    if (promptCount > 0) {
      return `Ask the ${promptCount} live preflight answer prompt(s), save approved reusable answers with ${approvalCommandPreview(latestLivePreflight)}, then rerun live preflight before filling the portal.`;
    }
    return "Review the live preflight pause reasons before filling the real portal form.";
  }
  return "Fix live browser preflight failure before filling real portal forms.";
}

function labelStatus(status: ApplyCueStatusKind): string {
  return status.replace(/_/g, " ").toUpperCase();
}

function hasConfiguredTargetRoles(config: MinimalApplyCueConfig): boolean {
  return Array.isArray(config.preferences?.targetRoleTerms) &&
    config.preferences.targetRoleTerms.some((term) => typeof term === "string" && term.trim().length > 0);
}

function hasConfiguredBaseCv(config: MinimalApplyCueConfig): boolean {
  const profileBaseCv = typeof config.profile?.baseCvPath === "string" && config.profile.baseCvPath.trim().length > 0;
  const baseCvEntry = Array.isArray(config.baseCvs) &&
    config.baseCvs.some((entry) => typeof entry.path === "string" && entry.path.trim().length > 0);
  return profileBaseCv || baseCvEntry;
}

function hasConfiguredIdentity(config: MinimalApplyCueConfig): boolean {
  const name = typeof config.profile?.name === "string" && config.profile.name.trim().length > 0;
  const email = typeof config.profile?.email === "string" && config.profile.email.trim().length > 0;
  const phone = typeof config.profile?.phone === "string" && config.profile.phone.trim().length > 0;
  return name && (email || phone);
}

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function isUatReport(value: unknown): value is UatReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<UatReport>;
  return report.id === "applycue-local-uat" &&
    isUatStatus(report.status) &&
    typeof report.summary === "string" &&
    typeof report.generatedAt === "string" &&
    Array.isArray(report.checks) &&
    Boolean(report.counts) &&
    Boolean(report.paths);
}

function isRunManifest(value: unknown): value is RunManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<RunManifest>;
  return typeof manifest.id === "string" &&
    (manifest.kind === "sample_batch" || manifest.kind === "daily_batch" || manifest.kind === "single_job") &&
    typeof manifest.profileId === "string" &&
    Array.isArray(manifest.jobIds) &&
    Array.isArray(manifest.cvVariantIds) &&
    Array.isArray(manifest.applicationIds) &&
    typeof manifest.sourceCodeWriteCount === "number";
}

function isUatStatus(value: unknown): value is UatStatus {
  return value === "pass" || value === "warn" || value === "fail";
}

function isBrowserUatReport(value: unknown): value is BrowserApplyUatReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<BrowserApplyUatReport>;
  return report.id === "applycue-browser-uat" &&
    isBrowserUatStatus(report.status) &&
    typeof report.summary === "string" &&
    typeof report.generatedAt === "string" &&
    Array.isArray(report.checks) &&
    Boolean(report.paths);
}

function isBrowserUatStatus(value: unknown): value is BrowserApplyUatStatus {
  return value === "pass" || value === "skipped" || value === "fail";
}

function isLivePreflightReport(value: unknown): value is LiveBrowserPreflightReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<LiveBrowserPreflightReport>;
  return report.id === "applycue-live-browser-preflight" &&
    isLivePreflightStatus(report.status) &&
    typeof report.summary === "string" &&
    typeof report.generatedAt === "string" &&
    Array.isArray(report.checks) &&
    Boolean(report.paths);
}

function isLivePreflightStatus(value: unknown): value is LiveBrowserPreflightStatus {
  return value === "pass" || value === "pause" || value === "fail" || value === "skipped";
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
