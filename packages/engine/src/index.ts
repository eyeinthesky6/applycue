import { access, appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createApplicationDraft, createBrowserApplyPlan } from "@applycue/apply-assistant";
import type {
  ApplicationDraft,
  ApplicationRecord,
  BrowserApplyPlan,
  CvVariant,
  GeneratedFileManifest,
  JobLiveState,
  JobRecord,
  OutcomeEvent,
  PendingQuestion,
  ProgressApplicationItem,
  ProgressCvQualitySummary,
  ProgressFunnelHealthSummary,
  ProgressFunnelPressureItem,
  ProgressJobDecisionItem,
  ProgressLivePreflightSummary,
  ProgressScanHistorySummary,
  ProgressSnapshot,
  ProgressSourceOutcomeSummary,
  ProgressSourceScorecardSummary,
  ProgressSourceQualitySummary,
  RankedJob,
  ReconciliationReport,
  RunManifest,
  ScanHistoryEntry,
  SourcePlan,
  UserProfile
} from "@applycue/core";
import { generateJobSpecificCv, renderStandardAtsDocx, type CvGenerationResult } from "@applycue/cv-tailor";
import {
  createSourcePlan,
  discoverJobsFromAtsDirectories,
  discoverJobsFromJobBoards,
  discoverJobsFromCompanyPages,
  discoverJobsFromPath,
  filterJobsBySearchProfile,
  filterJobsByScanHistory,
  buildScanHistoryEntries,
  getVerifiedLiveState,
  appendScanHistoryEntries,
  parseAtsDirectorySources,
  parseJobBoardSources,
  readScanHistoryEntries,
  type ApprovedSource,
  type AtsDirectorySourceConfig,
  type AtsCompanySourceConfig,
  type FetchJson,
  type JobLivenessVerifier,
  type JobBoardSourceConfig,
  type JobSpyRunner
} from "@applycue/discovery";
import { normalizeJob, type RawJobInput } from "@applycue/normalizer";
import { createProfile, getApplyCueProfileConfigPath, loadApplyCueConfig } from "@applycue/profile";
import { buildAmbiguityPrompts, rankJobs } from "@applycue/ranker";
import {
  buildSourceScorecardSummary,
  buildSourceOutcomeSummary,
  buildProgressSnapshot,
  createApplicationRecord,
  parseOutcomeEventsJsonLines,
  renderProgressChatSummaryMarkdown,
  renderProgressDashboardHtml
} from "@applycue/tracker";

export * from "./source-approval.js";
export * from "./application-answer-approval.js";

export interface SampleBatchResult {
  applications: ApplicationRecord[];
  browserPlans: BrowserApplyPlan[];
  cvDocxs: Array<{ cvVariantId: string; docx: Buffer }>;
  cvHtmls: Array<{ cvVariantId: string; html: string }>;
  cvMarkdowns: Array<{ cvVariantId: string; markdown: string }>;
  cvVariants: CvVariant[];
  drafts: ApplicationDraft[];
  jobs: JobRecord[];
  jobDecisions: ProgressJobDecisionItem[];
  manifest: RunManifest;
  outputRoot: string;
  pendingQuestions: PendingQuestion[];
  profile: UserProfile;
  progressItems: ProgressApplicationItem[];
  reconciliationReports: ReconciliationReport[];
  scanHistory?: ProgressScanHistorySummary;
  sourceOutcomes?: ProgressSourceOutcomeSummary;
  sourcePlan: SourcePlan;
  sourceScorecards?: ProgressSourceScorecardSummary;
  sourceQuality?: ProgressSourceQualitySummary;
  funnelHealth?: ProgressFunnelHealthSummary;
}

export interface ProgressOutputOverlay {
  livePreflight?: ProgressLivePreflightSummary;
  nextActions?: string[];
  notes?: string[];
  pendingQuestions?: number;
}

export interface RunSampleBatchOptions {
  workspaceRoot?: string;
  writeFiles?: boolean;
}

export interface RunBatchOptions extends RunSampleBatchOptions {
  jobs: JobRecord[];
  kind?: RunManifest["kind"];
  livenessVerifier?: JobLivenessVerifier;
  notes?: string[];
  outputRoot?: string;
  outcomeEvents?: OutcomeEvent[];
  outcomeEventsPath?: string;
  profile: UserProfile;
  runId: string;
  scanHistoryEntries?: ScanHistoryEntry[];
  scanHistory?: ProgressScanHistorySummary;
  scanHistoryPath?: string;
  sourceScorecardJobs?: {
    fetchedJobs: JobRecord[];
    filteredJobs?: JobRecord[];
    keptJobs: JobRecord[];
  };
  sourcePlan?: SourcePlan;
  sourceQuality?: ProgressSourceQualitySummary;
}

export interface RunLocalBatchOptions extends RunSampleBatchOptions {
  applyCueHome?: string;
  atsDirectoryFetchJson?: FetchJson;
  companyPageFetchJson?: FetchJson;
  configPath?: string;
  generatedSourceExpansion?: boolean;
  jobBoardFetchJson?: FetchJson;
  jobSpyRunner?: JobSpyRunner;
  jobsPath?: string;
  livenessVerifier?: JobLivenessVerifier;
  profileKey?: string;
  scanHistoryPath?: string;
}

export interface RecordOutcomeEventOptions {
  applicationId: string;
  applyCueHome?: string;
  configPath?: string;
  id?: string;
  note?: string;
  occurredAt?: string;
  profileKey?: string;
  type: OutcomeEvent["type"];
  workspaceRoot?: string;
}

export interface RecordOutcomeEventResult {
  configPath: string;
  event: OutcomeEvent;
  outcomesPath: string;
}

interface SkippedReconciliation {
  issueMessages: string[];
  jobId: string;
  status: ReconciliationReport["status"];
}

const RUN_ID = "sample-run-001";
const NOW = "2026-07-06T00:00:00.000Z";

export async function runSampleBatch(options: RunSampleBatchOptions = {}): Promise<SampleBatchResult> {
  return runBatch({
    ...options,
    profile: createSampleProfile(),
    jobs: createSampleJobs(),
    runId: RUN_ID,
    kind: "sample_batch",
    notes: [
      "First-build sample run only.",
      "No browser submit was attempted.",
      "All CV variants use standard_ats_v1."
    ]
  });
}

export async function runLocalOrSampleBatch(options: RunLocalBatchOptions = {}): Promise<SampleBatchResult> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const configPath = await resolveConfigPath(options, workspaceRoot);
  if (!configPath) return runSampleBatch(options);
  if (!(await fileExists(configPath))) return runSampleBatch(options);

  const loaded = await loadApplyCueConfig(configPath);
  const configuredJobsPath = typeof loaded.config.sources?.localJobsPath === "string"
    ? loaded.config.sources.localJobsPath.trim()
    : "";
  const jobsPath = options.jobsPath
    ? path.resolve(options.jobsPath)
    : configuredJobsPath
      ? path.resolve(loaded.configDir, configuredJobsPath)
      : "";
  const localJobs = jobsPath && (await fileExists(jobsPath)) ? await discoverJobsFromPath(jobsPath) : [];
  const companyPages = parseCompanyPageSources(loaded.config.sources?.companyPages);
  const atsDirectorySources = parseAtsDirectorySources(loaded.config.sources?.searches);
  const approvedSourceInput: {
    companyPages: AtsCompanySourceConfig[];
    localJobsPath?: string;
    sourceConfig?: {
      searches?: unknown[];
      jobBoards?: unknown[];
      communities?: unknown[];
      newsletters?: unknown[];
      loggedInBrowserSources?: unknown[];
    };
  } = {
    companyPages,
    localJobsPath: configuredJobsPath
  };
  if (loaded.config.sources) approvedSourceInput.sourceConfig = loaded.config.sources;
  const sourcePlan = createSourcePlan(loaded.profile, {
    approvedSources: buildApprovedSources(approvedSourceInput)
  });
  const sourceWarnings: string[] = [];
  const jobBoardSources = parseJobBoardSources(loaded.config.sources?.jobBoards);
  const companyPageJobs = await discoverJobsFromCompanyPages(companyPages, {
    ...(options.companyPageFetchJson ? { fetchJson: options.companyPageFetchJson } : {}),
    onWarning: (message) => sourceWarnings.push(message)
  });
  const atsDirectoryJobs = await discoverJobsFromAtsDirectories(atsDirectorySources, {
    ...(options.atsDirectoryFetchJson ?? options.companyPageFetchJson ? { fetchJson: options.atsDirectoryFetchJson ?? options.companyPageFetchJson } : {}),
    onWarning: (message) => sourceWarnings.push(message)
  });
  const jobBoardJobs = await discoverJobsFromJobBoards(jobBoardSources, {
    ...(options.jobBoardFetchJson ? { fetchJson: options.jobBoardFetchJson } : {}),
    ...(options.jobSpyRunner ? { jobSpyRunner: options.jobSpyRunner } : {}),
    onWarning: (message) => sourceWarnings.push(message)
  });
  let discoveredJobsBeforeDemoGuard = uniqueJobsById([...localJobs, ...companyPageJobs, ...atsDirectoryJobs, ...jobBoardJobs]);
  let demoGuard = filterDevelopmentDemoJobs(discoveredJobsBeforeDemoGuard, {
    enabled: isExternalUserConfigPath(configPath, workspaceRoot)
  });
  let discoveredJobs = demoGuard.jobs;
  let sourceQuality = filterJobsBySearchProfile(discoveredJobs, sourcePlan.searchProfile);
  const expansionSources = generatedPublicJobBoardExpansionSources(sourcePlan, loaded.profile, jobBoardSources);
  let expansionAttempted = false;
  let expansionJobs: JobRecord[] = [];
  if (shouldRunGeneratedSourceExpansion(loaded.profile, sourceQuality.summary.keptJobs, expansionEnabled(options), expansionSources)) {
    expansionAttempted = true;
    expansionJobs = await discoverJobsFromJobBoards(expansionSources, {
      ...(options.jobBoardFetchJson ? { fetchJson: options.jobBoardFetchJson } : {}),
      ...(options.jobSpyRunner ? { jobSpyRunner: options.jobSpyRunner } : {}),
      onWarning: (message) => sourceWarnings.push(`Expansion source warning: ${message}`)
    });
    discoveredJobsBeforeDemoGuard = uniqueJobsById([...discoveredJobsBeforeDemoGuard, ...expansionJobs]);
    demoGuard = filterDevelopmentDemoJobs(discoveredJobsBeforeDemoGuard, {
      enabled: isExternalUserConfigPath(configPath, workspaceRoot)
    });
    discoveredJobs = demoGuard.jobs;
    sourceQuality = filterJobsBySearchProfile(discoveredJobs, sourcePlan.searchProfile);
  }
  const scanHistoryPath = options.scanHistoryPath ?? path.join(loaded.configDir, "data", "local", "scan-history.jsonl");
  const scanHistoryEntries = await readScanHistoryEntries(scanHistoryPath);
  const scanHistory = filterJobsByScanHistory(sourceQuality.jobs, scanHistoryEntries, {
    historyPath: scanHistoryPath,
    mode: loaded.profile.applySettings.mode
  });
  const outcomeEventsPath = path.join(loaded.configDir, "data", "local", "outcomes.jsonl");
  const outcomeEvents = await readOutcomeEventsIfExists(outcomeEventsPath);
  const jobs = scanHistory.jobs;
  return runBatch({
    workspaceRoot,
    outputRoot: loaded.configDir,
    profile: loaded.profile,
    jobs,
    runId: "local-first-build",
    kind: "daily_batch",
    outcomeEvents,
    outcomeEventsPath,
    sourcePlan,
    scanHistoryEntries,
    scanHistory: scanHistory.summary,
    scanHistoryPath,
    sourceScorecardJobs: {
      fetchedJobs: discoveredJobs,
      filteredJobs: sourceQuality.filtered.map((item) => item.job),
      keptJobs: sourceQuality.jobs
    },
    sourceQuality: sourceQuality.summary,
    ...(options.livenessVerifier ? { livenessVerifier: options.livenessVerifier } : {}),
    notes: [
      `Loaded profile config: ${path.relative(workspaceRoot, loaded.configPath)}`,
      jobsPath
        ? localJobs.length > 0
          ? `Loaded jobs from: ${path.relative(workspaceRoot, jobsPath)}`
          : `No local job path found at: ${path.relative(workspaceRoot, jobsPath)}`
        : "No manual local job file configured; using approved source connectors only.",
      `Loaded ${companyPageJobs.length} job(s) from ${companyPages.filter((source) => source.enabled !== false).length} company/ATS source(s).`,
      `Loaded ${atsDirectoryJobs.length} job(s) from ${atsDirectorySources.filter((source) => source.enabled !== false).length} reverse ATS source(s).`,
      `Loaded ${jobBoardJobs.length} job(s) from ${jobBoardSources.filter((source) => source.enabled !== false).length} job-board source(s).`,
      ...(expansionAttempted
        ? [
            expansionJobs.length > 0
              ? `Transient source expansion ran ${expansionSources.length} generated public job-board source(s) and found ${expansionJobs.length} extra job(s); no user config was edited.`
              : `Transient source expansion had ${expansionSources.length} generated public job-board source(s) available but did not run or found no extra jobs.`
          ]
        : []),
      ...(demoGuard.skippedJobs > 0
        ? [`Skipped ${demoGuard.skippedJobs} development/demo job(s) from this real user run.`]
        : []),
      sourceQuality.summary.filteredJobs > 0
        ? `Source quality kept ${sourceQuality.summary.keptJobs} of ${sourceQuality.summary.inputJobs} discovered job(s); filtered ${sourceQuality.summary.filteredJobs} (${formatSourceQualityReasons(sourceQuality.summary.byReason)}).`
        : `Source quality kept all ${sourceQuality.summary.keptJobs} discovered job(s).`,
      scanHistory.summary.skippedJobs > 0
        ? `Scan history kept ${scanHistory.summary.keptJobs} of ${scanHistory.summary.inputJobs} post-filter job(s); skipped ${scanHistory.summary.skippedJobs} already handled job(s).`
        : scanHistory.summary.mode === "review"
          ? `Scan history kept all ${scanHistory.summary.keptJobs} post-filter job(s); review mode does not hide previously prepared jobs.`
          : `Scan history kept all ${scanHistory.summary.keptJobs} post-filter job(s).`,
      `Generated ${sourcePlan.suggestions.length} source suggestion(s) for review.`,
      ...sourceWarnings.map((warning) => `Source warning: ${warning}`),
      "No browser submit was attempted.",
      "All CV variants use standard_ats_v1."
    ],
    ...(typeof options.writeFiles === "boolean" ? { writeFiles: options.writeFiles } : {})
  });
}

export async function recordOutcomeEvent(options: RecordOutcomeEventOptions): Promise<RecordOutcomeEventResult> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const configPath = await resolveConfigPath(options, workspaceRoot);
  if (!configPath || !(await fileExists(configPath))) {
    throw new Error("ApplyCue profile config was not found. Run setup before recording outcomes.");
  }
  const loaded = await loadApplyCueConfig(configPath);
  const outcomesDir = path.join(loaded.configDir, "data", "local");
  const outcomesPath = path.join(outcomesDir, "outcomes.jsonl");
  const occurredAt = options.occurredAt ?? new Date().toISOString();
  const event: OutcomeEvent = {
    id: options.id ?? createOutcomeEventId(options.applicationId, options.type, occurredAt),
    applicationId: options.applicationId,
    type: options.type,
    note: options.note ?? "",
    occurredAt
  };

  await mkdir(outcomesDir, { recursive: true });
  await appendFile(outcomesPath, `${JSON.stringify(event)}\n`, "utf8");

  return {
    configPath: loaded.configPath,
    event,
    outcomesPath
  };
}

function buildApprovedSources(input: {
  companyPages: AtsCompanySourceConfig[];
  localJobsPath?: string;
  sourceConfig?: {
    searches?: unknown[];
    jobBoards?: unknown[];
    communities?: unknown[];
    newsletters?: unknown[];
    loggedInBrowserSources?: unknown[];
  };
}): ApprovedSource[] {
  const sources: ApprovedSource[] = [];
  if (input.localJobsPath?.trim()) {
    sources.push({
      id: "approved-local-jobs-path",
      kind: "manual",
      label: "Manual job import fallback",
      url: input.localJobsPath
    });
  }
  for (const source of input.companyPages) {
    sources.push({
      id: source.id ?? `approved-company-${source.company.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      kind: "ats",
      label: source.company,
      ...(source.careersUrl ? { url: source.careersUrl } : {}),
      ...(source.apiUrl ? { url: source.apiUrl } : {})
    });
  }
  for (const bucket of ["searches", "jobBoards", "communities", "newsletters", "loggedInBrowserSources"] as const) {
    sources.push(...parseApprovedSourceEntries(input.sourceConfig?.[bucket]));
  }
  return sources;
}

function parseApprovedSourceEntries(value: unknown): ApprovedSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ApprovedSource[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (record.enabled === false || record.status === "archived") return [];
    const kind = parseJobSourceKind(record.kind);
    if (!kind) return [];
    const label = stringValue(record.label) ?? stringValue(record.name) ?? stringValue(record.company);
    if (!label) return [];
    const source: ApprovedSource = { kind, label };
    const id = stringValue(record.id) ?? stringValue(record.sourceSuggestionId);
    const url = stringValue(record.url) ?? stringValue(record.careersUrl) ?? stringValue(record.apiUrl);
    const query = stringValue(record.query);
    if (id) source.id = id;
    if (url) source.url = url;
    if (query) source.query = query;
    return [source];
  });
}

function parseJobSourceKind(value: unknown): ApprovedSource["kind"] | undefined {
  if (
    value === "company_site" ||
    value === "ats" ||
    value === "job_board" ||
    value === "social_post" ||
    value === "community_post" ||
    value === "newsletter" ||
    value === "recruiter_message" ||
    value === "email_alert" ||
    value === "manual" ||
    value === "unknown"
  ) {
    return value;
  }
  return undefined;
}

function parseCompanyPageSources(value: unknown): AtsCompanySourceConfig[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): AtsCompanySourceConfig[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const company = stringValue(record.company) ?? stringValue(record.name);
    if (!company) return [];
    const provider = parseAtsProvider(record.provider);
    const source: AtsCompanySourceConfig = { company };
    const id = stringValue(record.id);
    const careersUrl = stringValue(record.careersUrl) ?? stringValue(record.careers_url);
    const apiUrl = stringValue(record.apiUrl) ?? stringValue(record.api);
    const boardToken = stringValue(record.boardToken) ?? stringValue(record.board_token);
    if (id) source.id = id;
    if (provider) source.provider = provider;
    if (careersUrl) source.careersUrl = careersUrl;
    if (apiUrl) source.apiUrl = apiUrl;
    if (boardToken) source.boardToken = boardToken;
    if (typeof record.enabled === "boolean") source.enabled = record.enabled;
    return [source];
  });
}

function parseAtsProvider(value: unknown): AtsCompanySourceConfig["provider"] | undefined {
  if (
    value !== "greenhouse" &&
    value !== "lever" &&
    value !== "ashby" &&
    value !== "workable" &&
    value !== "smartrecruiters" &&
    value !== "bamboohr" &&
    value !== "breezy" &&
    value !== "recruitee" &&
    value !== "pinpoint" &&
    value !== "workday" &&
    value !== "personio" &&
    value !== "rippling"
  ) return undefined;
  return value;
}

function uniqueJobsById(jobs: JobRecord[]): JobRecord[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (seen.has(job.id)) return false;
    seen.add(job.id);
    return true;
  });
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function formatSourceQualityReasons(byReason: Record<"title" | "location" | "content", number>): string {
  return [
    ["title", byReason.title],
    ["location", byReason.location],
    ["content", byReason.content]
  ]
    .filter((entry): entry is [string, number] => Number(entry[1]) > 0)
    .map(([reason, count]) => `${count} ${reason}`)
    .join(", ") || "0";
}

function generatedPublicJobBoardExpansionSources(
  sourcePlan: SourcePlan,
  profile: UserProfile,
  existingSources: JobBoardSourceConfig[]
): JobBoardSourceConfig[] {
  const existingByKey = new Map(existingSources.map((source) => [jobBoardSourceKey(source), source]));
  const emittedKeys = new Set<string>();
  const entries = sourcePlan.suggestions
    .filter((suggestion) =>
      suggestion.status === "suggested" &&
      suggestion.kind === "job_board" &&
      !suggestion.requiresBrowser &&
      !suggestion.requiresLogin &&
      Boolean(suggestion.provider)
    )
    .sort((left, right) => right.priority - left.priority || left.label.localeCompare(right.label))
    .flatMap((suggestion) => {
      const entry = {
        id: `transient-${suggestion.id}`,
        label: `Expansion - ${suggestion.label}`,
        provider: suggestion.provider,
        query: suggestion.query,
        enabled: true,
        options: relaxedExpansionOptions(suggestion.provider, suggestion.options)
      };
      const parsed = parseJobBoardSources([entry]);
      return parsed.filter((source) => {
        const key = jobBoardSourceKey(source);
        const existing = existingByKey.get(key);
        if (existing && !isWiderExpansionSource(source, existing)) return false;
        const emittedKey = `${key}::${JSON.stringify(source.options ?? {})}`;
        if (emittedKeys.has(emittedKey)) return false;
        emittedKeys.add(emittedKey);
        if (!existing) existingByKey.set(key, source);
        return true;
      });
    });

  return entries.slice(0, generatedSourceExpansionLimit(profile));
}

function isWiderExpansionSource(source: JobBoardSourceConfig, existing: JobBoardSourceConfig): boolean {
  if (source.provider === "jobspy") {
    return (
      (numberOption(source.options?.resultsWanted) ?? 0) > (numberOption(existing.options?.resultsWanted) ?? 0) ||
      (numberOption(source.options?.hoursOld) ?? 0) > (numberOption(existing.options?.hoursOld) ?? 0)
    );
  }
  if (source.provider === "remotive" || source.provider === "remoteok" || source.provider === "workingnomads" || source.provider === "jobicy" || source.provider === "himalayas" || source.provider === "themuse") {
    return (numberOption(source.options?.limit) ?? 0) > (numberOption(existing.options?.limit) ?? 0);
  }
  return false;
}

function shouldRunGeneratedSourceExpansion(
  profile: UserProfile,
  keptJobs: number,
  writeFiles: boolean,
  expansionSources: JobBoardSourceConfig[]
): boolean {
  if (!writeFiles) return false;
  if (expansionSources.length === 0) return false;
  if (!profile.matchSettings.relaxOrder.includes("source")) return false;
  const dailyTarget = Math.max(1, Math.floor(profile.applySettings.applicationsPerDay || 1));
  const widenTarget = Math.max(dailyTarget, Math.min(20, Math.floor(profile.matchSettings.widenIfFewerThan || dailyTarget)));
  return keptJobs < widenTarget;
}

function expansionEnabled(options: RunLocalBatchOptions): boolean {
  return (options.writeFiles ?? true) && options.generatedSourceExpansion !== false;
}

function generatedSourceExpansionLimit(profile: UserProfile): number {
  const dailyTarget = Math.max(1, Math.floor(profile.applySettings.applicationsPerDay || 1));
  if (profile.matchSettings.range === "tight") return Math.min(4, Math.max(2, dailyTarget));
  if (profile.matchSettings.range === "wide") return Math.min(10, Math.max(5, dailyTarget * 2));
  return Math.min(10, Math.max(5, dailyTarget * 2));
}

function relaxedExpansionOptions(provider: unknown, options: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const current = { ...(options ?? {}) };
  if (provider === "jobspy") {
    current.resultsWanted = Math.max(numberOption(current.resultsWanted) ?? 0, 35);
    current.hoursOld = Math.max(numberOption(current.hoursOld) ?? 0, 336);
  } else if (provider === "remotive" || provider === "remoteok" || provider === "workingnomads" || provider === "jobicy" || provider === "himalayas" || provider === "themuse") {
    current.limit = Math.max(numberOption(current.limit) ?? 0, 75);
  }
  return Object.keys(current).length > 0 ? current : undefined;
}

function jobBoardSourceKey(source: JobBoardSourceConfig): string {
  return [
    source.provider,
    source.query?.toLowerCase() ?? "",
    String(source.options?.location ?? "").toLowerCase(),
    JSON.stringify(source.options?.siteNames ?? [])
  ].join("::");
}

function numberOption(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function runBatch(options: RunBatchOptions): Promise<SampleBatchResult> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const outputRoot = options.outputRoot ?? workspaceRoot;
  const writeFiles = options.writeFiles ?? true;
  const profile = options.profile;
  const liveness = options.livenessVerifier
    ? await verifyJobsLiveness(options.jobs, options.livenessVerifier)
    : undefined;
  const jobs = liveness?.jobs ?? options.jobs;
  const sourcePlan = options.sourcePlan ?? createSourcePlan(profile);
  const ranked = rankJobs(jobs, profile);
  const pendingQuestions = buildAmbiguityPrompts(ranked, profile, {
    createdAt: NOW,
    limit: 5
  });
  const batchLimit = Math.max(1, Math.floor(profile.applySettings.applicationsPerDay || 1));
  const applyReadyJobs = ranked.filter((rankedJob) => rankedJob.decision === "apply");
  const reviewFillJobs = ranked.filter((rankedJob) => rankedJob.decision === "review");
  const candidateJobs = [...applyReadyJobs, ...reviewFillJobs];
  const { cvResults, skippedReconciliations } = generatePassedCvResults(candidateJobs, profile, batchLimit);
  const jobDecisions = buildProgressJobDecisionItems(ranked, skippedReconciliations);
  const cvMarkdowns = cvResults.map((result) => ({
    cvVariantId: result.variant.id,
    markdown: result.markdown
  }));
  const cvHtmls = cvResults.map((result) => ({
    cvVariantId: result.variant.id,
    html: result.html
  }));
  const cvDocxs = await Promise.all(
    cvResults.map(async (result) => ({
      cvVariantId: result.variant.id,
      docx: await renderStandardAtsDocx(result.markdown)
    }))
  );
  const cvVariants = cvResults.map((result) => result.variant);
  const cvQuality = buildCvQualitySummary(profile, cvMarkdowns);
  const reconciliationReports = cvResults.map((result) => result.reconciliationReport);
  const drafts = cvVariants.map((variant) => {
    const job = jobs.find((item) => item.id === variant.jobId);
    if (!job) throw new Error(`Missing job for CV variant ${variant.id}`);
    return createApplicationDraft(job, profile, variant);
  });
  const applications = drafts.map((draft, index) =>
    createApplicationRecord({
      id: createApplicationId(options.runId, draft.jobId, index),
      jobId: draft.jobId,
      status: "prepared",
      note: `Prepared by ${options.runId} run.`,
      ...(draft.cvVariantId ? { cvVariantId: draft.cvVariantId } : {})
    })
  );
  const scanHistoryEntries = options.scanHistoryPath
    ? buildScanHistoryEntries(jobs, applications)
    : [];
  const scanHistory = options.scanHistory
    ? {
        ...options.scanHistory,
        recordedJobs: writeFiles && options.scanHistoryPath ? scanHistoryEntries.length : 0
      }
    : undefined;
  const combinedScanHistoryEntries = [...(options.scanHistoryEntries ?? []), ...scanHistoryEntries];
  const sourceOutcomes = buildSourceOutcomeSummary({
    applications,
    jobs,
    outcomeEvents: options.outcomeEvents ?? [],
    scanHistoryEntries: combinedScanHistoryEntries,
    ...(options.outcomeEventsPath ? { eventPath: options.outcomeEventsPath } : {})
  });
  const sourceScorecards = buildSourceScorecardSummary({
    applications,
    fetchedJobs: options.sourceScorecardJobs?.fetchedJobs ?? jobs,
    filteredJobs: options.sourceScorecardJobs?.filteredJobs ?? [],
    jobs,
    keptJobs: options.sourceScorecardJobs?.keptJobs ?? jobs,
    outcomeEvents: options.outcomeEvents ?? [],
    scanHistoryEntries: combinedScanHistoryEntries
  });
  const funnelHealth = buildFunnelHealthSummary({
    applications,
    jobDecisions,
    profile,
    rankedJobs: ranked,
    sourceScorecards,
    ...(options.sourceQuality ? { sourceQuality: options.sourceQuality } : {})
  });
  const baseFiles = buildGeneratedFileManifests(
    options.runId,
    cvVariants,
    reconciliationReports,
    applications,
    sourcePlan,
    []
  );
  const browserPlans = drafts.map((draft) => {
    const job = jobs.find((item) => item.id === draft.jobId);
    if (!job) throw new Error(`Missing job for browser plan ${draft.jobId}`);
    const cvPath = draft.cvVariantId ? findGeneratedFilePath(baseFiles, "cv_docx", draft.cvVariantId) : undefined;
    return createBrowserApplyPlan({
      draft,
      job,
      ...(cvPath ? { cvPath } : {})
    });
  });
  const files = buildGeneratedFileManifests(
    options.runId,
    cvVariants,
    reconciliationReports,
    applications,
    sourcePlan,
    browserPlans
  );
  const progressItems = buildProgressApplicationItems({
    applications,
    browserPlans,
    cvVariants,
    drafts,
    files,
    jobs,
    reconciliationReports
  });
  const manifest: RunManifest = {
    id: options.runId,
    kind: options.kind ?? "daily_batch",
    startedAt: NOW,
    completedAt: new Date().toISOString(),
    profileId: profile.id,
    jobIds: jobs.map((job) => job.id),
    cvVariantIds: cvVariants.map((variant) => variant.id),
    applicationIds: applications.map((application) => application.id),
    generatedFiles: files,
    sourceCodeWriteCount: 0,
    notes: [
      ...(options.notes ?? []),
      ...(liveness ? formatLivenessVerificationNotes(liveness) : []),
      ...(skippedReconciliations.length > 0
        ? [`Skipped ${skippedReconciliations.length} candidate CV(s) because reconciliation did not pass.`]
        : [])
    ],
    ...(cvQuality ? { cvQuality } : {}),
    ...(scanHistory ? { scanHistory } : {}),
    ...(pendingQuestions.length > 0 ? { pendingQuestions } : {}),
    sourceScorecards,
    sourceOutcomes,
    ...(options.sourceQuality ? { sourceQuality: options.sourceQuality } : {}),
    funnelHealth
  };

  if (writeFiles) {
    await writeRunOutputs(outputRoot, {
      applications,
      browserPlans,
      cvDocxs,
      cvHtmls,
      cvMarkdowns,
      cvVariants,
      jobDecisions,
      jobs,
      manifest,
      pendingQuestions,
      profile,
      progressItems,
      reconciliationReports,
      sourceOutcomes,
      sourcePlan,
      sourceScorecards
    });
    if (options.scanHistoryPath) {
      await appendScanHistoryEntries(options.scanHistoryPath, scanHistoryEntries);
    }
  }

  return {
    applications,
    browserPlans,
    cvDocxs,
    cvHtmls,
    cvMarkdowns,
    cvVariants,
    drafts,
    jobs,
    jobDecisions,
    manifest,
    outputRoot,
    pendingQuestions,
    profile,
    progressItems,
    reconciliationReports,
    ...(scanHistory ? { scanHistory } : {}),
    sourceOutcomes,
    sourcePlan,
    sourceScorecards,
    ...(options.sourceQuality ? { sourceQuality: options.sourceQuality } : {}),
    funnelHealth
  };
}

interface LivenessVerificationBatch {
  checkedCount: number;
  classified: Record<JobLiveState, number>;
  changedCount: number;
  jobs: JobRecord[];
  warnings: string[];
}

async function verifyJobsLiveness(
  jobs: JobRecord[],
  verifier: JobLivenessVerifier
): Promise<LivenessVerificationBatch> {
  const classified: Record<JobLiveState, number> = {
    live: 0,
    closed: 0,
    unknown: 0
  };
  let checkedCount = 0;
  let changedCount = 0;
  const warnings: string[] = [];

  const verifiedJobs = await Promise.all(
    jobs.map(async (job) => {
      if (job.liveState === "closed") return job;
      checkedCount += 1;
      try {
        const liveState = getVerifiedLiveState(await verifier(job));
        if (!liveState) return job;
        classified[liveState] += 1;
        if (liveState === job.liveState) return job;
        changedCount += 1;
        return {
          ...job,
          liveState
        };
      } catch (error) {
        warnings.push(`${job.company} - ${job.title}: ${error instanceof Error ? error.message : String(error)}`);
        return job;
      }
    })
  );

  return {
    checkedCount,
    classified,
    changedCount,
    jobs: verifiedJobs,
    warnings
  };
}

function formatLivenessVerificationNotes(result: LivenessVerificationBatch): string[] {
  return [
    `Liveness verifier checked ${result.checkedCount} job(s); updated ${result.changedCount} (${result.classified.closed} closed, ${result.classified.live} live, ${result.classified.unknown} unknown).`,
    ...result.warnings.map((warning) => `Liveness warning: ${warning}`)
  ];
}

function buildFunnelHealthSummary(input: {
  applications: ApplicationRecord[];
  jobDecisions: ProgressJobDecisionItem[];
  profile: UserProfile;
  rankedJobs: RankedJob[];
  sourceQuality?: ProgressSourceQualitySummary;
  sourceScorecards?: ProgressSourceScorecardSummary;
}): ProgressFunnelHealthSummary {
  const configuredDailyTarget = Math.max(1, Math.floor(input.profile.applySettings.applicationsPerDay || 1));
  const preparedApplications = input.applications.length;
  const discoveredJobs = input.sourceQuality?.inputJobs ?? input.sourceScorecards?.fetchedJobs ?? input.rankedJobs.length;
  const keptForRanking = input.sourceQuality?.keptJobs ?? input.sourceScorecards?.keptJobs ?? input.rankedJobs.length;
  const rankedJobs = input.rankedJobs.length;
  const watchOrSkippedJobs = input.jobDecisions.filter((item) =>
    item.decision === "watch" || item.decision === "skip" || Boolean(item.skippedReason)
  ).length;
  const dominantFilters = buildFilterPressure(input.sourceQuality).slice(0, 3);
  const dominantGateBlocks = buildGatePressure(input.jobDecisions).slice(0, 5);
  const suggestedActions = buildFunnelSuggestedActions({
    configuredDailyTarget,
    dominantFilters,
    dominantGateBlocks,
    discoveredJobs,
    keptForRanking,
    preparedApplications,
    profile: input.profile,
    rankedJobs
  });
  const keptRate = discoveredJobs > 0 ? keptForRanking / discoveredJobs : 1;
  const tooNoisy = discoveredJobs >= Math.max(100, configuredDailyTarget * 30) && keptRate < 0.08;
  const tooManyKept = keptForRanking >= Math.max(100, configuredDailyTarget * 25);
  const status: ProgressFunnelHealthSummary["status"] = preparedApplications < configuredDailyTarget
    ? "low_volume"
    : tooNoisy
      ? "noisy_sources"
      : tooManyKept
        ? "high_volume"
        : "healthy";
  const message = status === "low_volume"
    ? `Prepared ${preparedApplications} of ${configuredDailyTarget}; review the dominant blockers before widening.`
    : status === "noisy_sources"
      ? `Fetched ${discoveredJobs} jobs but only ${keptForRanking} survived source filters; source queries are broad or noisy.`
      : status === "high_volume"
        ? `Kept ${keptForRanking} jobs for ranking; tighten filters before increasing automation.`
        : `Prepared ${preparedApplications} of ${configuredDailyTarget}; funnel is within the expected range.`;

  return {
    status,
    message,
    configuredDailyTarget,
    preparedApplications,
    discoveredJobs,
    keptForRanking,
    rankedJobs,
    watchOrSkippedJobs,
    dominantFilters,
    dominantGateBlocks,
    suggestedActions
  };
}

function buildFilterPressure(sourceQuality: ProgressSourceQualitySummary | undefined): ProgressFunnelPressureItem[] {
  if (!sourceQuality) return [];
  return (Object.entries(sourceQuality.byReason) as Array<[keyof ProgressSourceQualitySummary["byReason"], number]>)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([id, count]) => ({
      id,
      label: `${humanizeIdentifier(id)} source filter`,
      count,
      examples: []
    }));
}

function buildGatePressure(jobDecisions: ProgressJobDecisionItem[]): ProgressFunnelPressureItem[] {
  const gateMap = new Map<string, { count: number; examples: Set<string> }>();
  for (const decision of jobDecisions) {
    for (const failedGate of decision.failedGates) {
      const gate = failedGateId(failedGate);
      const current = gateMap.get(gate) ?? { count: 0, examples: new Set<string>() };
      current.count += 1;
      const reason = decision.reasons.find((item) => item.toLowerCase().includes(humanizeIdentifier(gate).split(" ")[0] ?? ""));
      current.examples.add(reason ?? `${decision.company} - ${decision.title}`);
      gateMap.set(gate, current);
    }
  }

  return [...gateMap.entries()]
    .sort((left, right) => right[1].count - left[1].count)
    .map(([id, item]) => ({
      id,
      label: humanizeGate(id),
      count: item.count,
      examples: [...item.examples].slice(0, 3)
    }));
}

function failedGateId(value: string): string {
  return value.split(":")[0]?.trim() || value;
}

function buildFunnelSuggestedActions(input: {
  configuredDailyTarget: number;
  discoveredJobs: number;
  dominantFilters: ProgressFunnelPressureItem[];
  dominantGateBlocks: ProgressFunnelPressureItem[];
  keptForRanking: number;
  preparedApplications: number;
  profile: UserProfile;
  rankedJobs: number;
}): string[] {
  const actions: string[] = [];
  const shortBy = input.configuredDailyTarget - input.preparedApplications;
  const topFilter = input.dominantFilters[0];
  const topGate = input.dominantGateBlocks[0];
  const keptRate = input.discoveredJobs > 0 ? input.keptForRanking / input.discoveredJobs : 1;

  if (shortBy > 0) {
    if (topGate) actions.push(shortVolumeActionForGate(topGate.id, shortBy, input.profile));
    if (input.keptForRanking < input.profile.matchSettings.widenIfFewerThan) {
      actions.push("Scan or approve more sources before lowering match quality; current kept count is below the saved widen-if-fewer-than setting.");
    }
    if (topFilter) {
      actions.push(`Review the ${topFilter.label}; it removed ${topFilter.count} job(s) before ranking.`);
    }
  }

  if (input.discoveredJobs >= Math.max(100, input.configuredDailyTarget * 30) && keptRate < 0.08 && topFilter) {
    actions.push(`Tighten or split noisy source queries before adding more sources; ${topFilter.label} is doing most of the cleanup.`);
  }

  if (input.keptForRanking >= Math.max(100, input.configuredDailyTarget * 25)) {
    actions.push("Too many jobs reached ranking; add stricter title terms, no-go role terms, or location/work-mode rules before increasing automation.");
  }

  if (actions.length === 0) {
    actions.push("Keep hard blockers unchanged and review prepared CVs before enabling submit.");
  }

  return uniqueValues(actions).slice(0, 4);
}

function shortVolumeActionForGate(gateId: string, shortBy: number, profile: UserProfile): string {
  switch (gateId) {
    case "seniority":
      return `Daily target short by ${shortBy}; ask whether company-specific title levels should be saved, especially for large employers with flatter titles.`;
    case "experience":
      return `Daily target short by ${shortBy}; keep experience as a hard blocker unless the user changes the acceptable range.`;
    case "work-authorization":
      return `Daily target short by ${shortBy}; ask before adding countries or regions outside saved work authorization.`;
    case "work-mode":
      return `Daily target short by ${shortBy}; ask before widening beyond ${profile.preferences.acceptableWorkModes.join(", ") || "the saved work modes"}.`;
    case "employment-type":
      return `Daily target short by ${shortBy}; ask before adding employment types outside the saved preference set.`;
    case "company-stage":
      return `Daily target short by ${shortBy}; ask before adding company stages outside the saved preference set.`;
    case "role-family":
      return `Daily target short by ${shortBy}; improve source title queries before relaxing role-family matching.`;
    default:
      return `Daily target short by ${shortBy}; dominant blocker is ${humanizeGate(gateId)}.`;
  }
}

function humanizeGate(value: string): string {
  return `${humanizeIdentifier(value)} gate`;
}

function humanizeIdentifier(value: string): string {
  return value.replace(/[-_]+/g, " ");
}

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

function generatePassedCvResults(
  rankedJobs: RankedJob[],
  profile: UserProfile,
  batchLimit: number
): { cvResults: CvGenerationResult[]; skippedReconciliations: SkippedReconciliation[] } {
  const cvResults: CvGenerationResult[] = [];
  const skippedReconciliations: SkippedReconciliation[] = [];

  for (const rankedJob of rankedJobs) {
    const result = generateJobSpecificCv(rankedJob.job, profile);
    if (result.reconciliationReport.status !== "passed") {
      skippedReconciliations.push({
        issueMessages: result.reconciliationReport.issues.map((issue) => issue.message),
        jobId: rankedJob.job.id,
        status: result.reconciliationReport.status
      });
      continue;
    }
    cvResults.push(result);
    if (cvResults.length >= batchLimit) break;
  }

  return { cvResults, skippedReconciliations };
}

function createSampleProfile(): UserProfile {
  return createProfile({
    id: "sample-user",
    name: "Sample Candidate",
    headline: "AI transformation and product strategy leader",
    contact: {
      email: "sample.candidate@example.com",
      phone: "+91 99999 00000",
      location: "Delhi NCR",
      links: [
        {
          label: "LinkedIn",
          url: "https://www.linkedin.com/in/sample-candidate"
        }
      ]
    },
    currentCompany: "CurrentCo",
    currentDesignation: "Head of AI Transformation",
    currentLevel: "director",
    currentCountry: "India",
    currentLocation: "Delhi NCR",
    applyToPastEmployers: false,
    preferences: {
      targetRoleTerms: ["ai transformation", "product strategy", "head of ai"],
      adjacentRoleTerms: ["chief of staff", "ai program lead"],
      targetIndustries: ["fintech", "saas", "enterprise software"],
      preferredLocations: ["remote", "india", "delhi"],
      acceptableWorkModes: ["remote", "hybrid"],
      targetSeniorities: ["director", "vp"],
      acceptableSeniorities: ["director", "vp", "c_level"],
      employmentTypes: ["full_time"],
      companyStages: ["startup", "scaleup", "enterprise"],
      niceToHaveKeywords: ["ai", "automation", "strategy", "fintech"],
      workAuthorizationCountries: ["india"]
    },
    applySettings: {
      mode: "review",
      applicationsPerDay: 5,
      minimumFitToApply: 0.75
    },
    facts: [
      {
        id: "fact-current-designation",
        statement: "Current designation is Head of AI Transformation.",
        category: "role",
        sourceKind: "user_confirmed",
        sensitivity: "major",
        approvedByUser: true,
        sourceRef: "sample-profile",
        createdAt: NOW
      },
      {
        id: "fact-ai-transformation",
        statement: "Led AI transformation work across product and operating workflows.",
        category: "role",
        sourceKind: "base_cv",
        sensitivity: "major",
        approvedByUser: true,
        sourceRef: "sample-base-cv",
        createdAt: NOW
      },
      {
        id: "fact-fintech-strategy",
        statement: "Worked on fintech and regulated product strategy.",
        category: "industry",
        sourceKind: "base_cv",
        sensitivity: "major",
        approvedByUser: true,
        sourceRef: "sample-base-cv",
        createdAt: NOW
      }
    ],
    proofBank: [
      {
        id: "proof-ai-transformation",
        claim: "Led AI transformation work across product and operating workflows.",
        evidence: "Base CV includes AI adoption, workflow automation, and product strategy work.",
        tags: ["ai", "transformation", "automation", "product strategy"],
        kind: "work"
      },
      {
        id: "proof-fintech",
        claim: "Worked on fintech and regulated product strategy.",
        evidence: "Base CV references fintech strategy and compliance-sensitive workflows.",
        tags: ["fintech", "regulated", "strategy"],
        kind: "work"
      }
    ]
  });
}

function createSampleJobs(): JobRecord[] {
  const source = {
    id: "sample-manual",
    kind: "manual" as const,
    name: "Sample fixture"
  };
  const rawJobs: RawJobInput[] = [
    {
      source,
      company: "Example Fintech",
      title: "Head of AI Transformation",
      url: "https://example.com/jobs/head-ai-transformation",
      description: "Lead AI transformation, automation, and product strategy for fintech teams.",
      location: "Remote India",
      workMode: "remote",
      seniority: "director",
      employmentType: "full_time",
      companyStage: "scaleup"
    },
    {
      source,
      company: "SaaS Works",
      title: "Director, Product Strategy AI",
      url: "https://example.com/jobs/director-product-strategy-ai",
      description: "Own AI product strategy and automation programs for enterprise software customers.",
      location: "Delhi hybrid",
      workMode: "hybrid",
      seniority: "director",
      employmentType: "full_time",
      companyStage: "enterprise"
    },
    {
      source,
      company: "Retail Ops",
      title: "Store Operations Manager",
      url: "https://example.com/jobs/store-ops",
      description: "Manage store operations and retail staffing.",
      location: "Mumbai onsite",
      workMode: "onsite",
      seniority: "manager",
      employmentType: "full_time",
      companyStage: "enterprise"
    },
    {
      source,
      company: "CurrentCo",
      title: "VP AI Programs",
      url: "https://example.com/jobs/currentco-vp-ai",
      description: "Lead AI programs and strategy.",
      location: "Remote India",
      workMode: "remote",
      seniority: "vp",
      employmentType: "full_time",
      companyStage: "enterprise"
    },
    {
      source,
      company: "Startup Lab",
      title: "Chief of Staff, AI Products",
      url: "https://example.com/jobs/chief-of-staff-ai",
      description: "Drive product strategy, founder priorities, and AI product operations.",
      location: "Remote",
      workMode: "remote",
      seniority: "director",
      employmentType: "full_time",
      companyStage: "startup"
    }
  ];

  return rawJobs.map(normalizeJob);
}

function buildGeneratedFileManifests(
  runId: string,
  cvVariants: CvVariant[],
  reports: ReconciliationReport[],
  applications: ApplicationRecord[],
  sourcePlan: SourcePlan,
  browserPlans: BrowserApplyPlan[]
): GeneratedFileManifest[] {
  const createdAt = new Date().toISOString();
  const cvFiles = cvVariants.map((variant): GeneratedFileManifest => ({
    id: `${variant.id}-markdown-file`,
    kind: "cv_markdown",
    path: `outputs/cvs/${variant.id}.md`,
    sourceIds: [variant.id, variant.jobId],
    createdAt
  }));
  const cvDocxFiles = cvVariants.map((variant): GeneratedFileManifest => ({
    id: `${variant.id}-docx-file`,
    kind: "cv_docx",
    path: `outputs/cvs/${variant.id}.docx`,
    sourceIds: [variant.id, variant.jobId],
    createdAt
  }));
  const cvHtmlFiles = cvVariants.map((variant): GeneratedFileManifest => ({
    id: `${variant.id}-html-file`,
    kind: "cv_html",
    path: `outputs/cvs/${variant.id}.html`,
    sourceIds: [variant.id, variant.jobId],
    createdAt
  }));
  const reportFiles = reports.map((report): GeneratedFileManifest => ({
    id: `${report.id}-json-file`,
    kind: "reconciliation_json",
    path: `outputs/reconciliation/${report.id}.json`,
    sourceIds: [report.id, report.cvContentPlanId],
      createdAt
    }));
  const browserPlanFiles = browserPlans.map((plan): GeneratedFileManifest => ({
    id: `${plan.id}-json-file`,
    kind: "browser_plan_json",
    path: `outputs/browser-plans/${plan.id}.json`,
    sourceIds: [plan.id, plan.jobId, ...(plan.cvVariantId ? [plan.cvVariantId] : [])],
    createdAt
  }));
  return [
    ...cvFiles,
    ...cvDocxFiles,
    ...cvHtmlFiles,
    ...reportFiles,
    ...browserPlanFiles,
    {
      id: `${sourcePlan.id}-source-plan-file`,
      kind: "source_plan_json",
      path: "data/local/source-plan.generated.json",
      sourceIds: [sourcePlan.id],
      createdAt
    },
    {
      id: `${runId}-dashboard-file`,
      kind: "dashboard_html",
      path: "outputs/dashboard/latest.html",
      sourceIds: applications.map((application) => application.id),
      createdAt
    },
    {
      id: `${runId}-summary-file`,
      kind: "run_summary_markdown",
      path: "outputs/runs/latest-summary.md",
      sourceIds: applications.map((application) => application.id),
      createdAt
    },
    {
      id: `${runId}-run-manifest-file`,
      kind: "run_manifest",
      path: `outputs/runs/${runId}.json`,
      sourceIds: [runId],
      createdAt
    }
  ];
}

function buildCvQualitySummary(
  profile: UserProfile,
  cvMarkdowns: Array<{ cvVariantId: string; markdown: string }>
): ProgressCvQualitySummary | undefined {
  if (cvMarkdowns.length === 0) return undefined;
  const summaries = cvMarkdowns.map((item) => {
    const employerBulletCounts = countEmployerSectionBullets(item.markdown);
    return {
      chars: item.markdown.trim().length,
      bullets: countMarkdownBullets(item.markdown),
      employerHeadings: countEmployerHeadings(item.markdown),
      minimumEmployerBullets: employerBulletCounts.length > 0 ? Math.min(...employerBulletCounts) : 0
    };
  });
  const minimumCvChars = Math.min(...summaries.map((summary) => summary.chars));
  const baseCvChars = profile.baseCvText?.trim().length ?? 0;
  const output: ProgressCvQualitySummary = {
    generatedCvs: cvMarkdowns.length,
    minimumCvChars,
    minimumBullets: Math.min(...summaries.map((summary) => summary.bullets)),
    employerHeadings: Math.min(...summaries.map((summary) => summary.employerHeadings)),
    minimumEmployerBullets: Math.min(...summaries.map((summary) => summary.minimumEmployerBullets))
  };
  if (baseCvChars > 0) {
    output.baseCvChars = baseCvChars;
    output.minimumBaseCvPercent = Math.round((minimumCvChars / baseCvChars) * 100);
  }
  return output;
}

function countMarkdownBullets(markdown: string): number {
  return markdown.split(/\r\n|\n|\r/).filter((line) => /^-\s+\S/.test(line)).length;
}

function countEmployerHeadings(markdown: string): number {
  return getMarkdownSectionLines(markdown, "Experience").filter((line) => /^###\s+\S/.test(line)).length;
}

function countEmployerSectionBullets(markdown: string): number[] {
  const experienceBody = getMarkdownSectionLines(markdown, "Experience").join("\n");
  return experienceBody
    .split(/^###\s+/m)
    .slice(1)
    .map((section) => section.split(/\r\n|\n|\r/).filter((line) => /^-\s+\S/.test(line)).length);
}

function getMarkdownSectionLines(markdown: string, heading: string): string[] {
  const lines = markdown.split(/\r\n|\n|\r/);
  const startIndex = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (startIndex === -1) return [];
  const endIndex = lines.findIndex((line, index) => index > startIndex && /^##\s+\S/.test(line));
  return lines.slice(startIndex + 1, endIndex === -1 ? lines.length : endIndex);
}

function buildProgressApplicationItems(input: {
  applications: ApplicationRecord[];
  browserPlans: BrowserApplyPlan[];
  cvVariants: CvVariant[];
  drafts: ApplicationDraft[];
  files: GeneratedFileManifest[];
  jobs: JobRecord[];
  reconciliationReports: ReconciliationReport[];
}): ProgressApplicationItem[] {
  return input.applications.map((application): ProgressApplicationItem => {
    const job = input.jobs.find((item) => item.id === application.jobId);
    const draft = input.drafts.find((item) => item.jobId === application.jobId);
    const variant = input.cvVariants.find((item) => item.id === application.cvVariantId);
    const report = variant
      ? input.reconciliationReports.find((item) => item.cvContentPlanId === `${variant.jobId}-content-plan-standard-ats-v1`)
      : undefined;
    const browserPlan = input.browserPlans.find((item) => item.jobId === application.jobId);
    const cvPath = variant ? findGeneratedFilePath(input.files, "cv_markdown", variant.id) : undefined;
    const cvDocxPath = variant ? findGeneratedFilePath(input.files, "cv_docx", variant.id) : undefined;
    const cvHtmlPath = variant ? findGeneratedFilePath(input.files, "cv_html", variant.id) : undefined;
    const reconciliationPath = report ? findGeneratedFilePath(input.files, "reconciliation_json", report.id) : undefined;
    const browserPlanPath = browserPlan ? findGeneratedFilePath(input.files, "browser_plan_json", browserPlan.id) : undefined;

    return {
      applicationId: application.id,
      jobId: application.jobId,
      company: job?.company ?? "Unknown company",
      title: job?.title ?? "Unknown role",
      status: application.status,
      canAutoSubmit: draft?.canAutoSubmit ?? false,
      submitRequiresApproval: draft?.submitRequiresApproval ?? true,
      pauseReasons: draft?.pauseReasons ?? ["unknown_portal"],
      nextStep: createProgressNextStep(draft),
      ...(browserPlanPath ? { browserPlanPath } : {}),
      ...(application.cvVariantId ? { cvVariantId: application.cvVariantId } : {}),
      ...(cvDocxPath ? { cvDocxPath } : {}),
      ...(cvHtmlPath ? { cvHtmlPath } : {}),
      ...(cvPath ? { cvPath } : {}),
      ...(reconciliationPath ? { reconciliationPath } : {}),
      ...(report ? { reconciliationStatus: report.status } : {})
    };
  });
}

function buildProgressJobDecisionItems(
  ranked: RankedJob[],
  skippedReconciliations: SkippedReconciliation[] = []
): ProgressJobDecisionItem[] {
  const skippedByJobId = new Map(skippedReconciliations.map((item) => [item.jobId, item]));
  return ranked.slice(0, 50).map((rankedJob) => {
    const skipped = skippedByJobId.get(rankedJob.job.id);
    const skippedReason = skipped ? skipped.issueMessages[0] ?? "CV reconciliation did not pass." : undefined;
    const failedGates = rankedJob.gates
      .filter((gate) => !gate.passed)
      .map((gate) => `${gate.id}: ${gate.reason}`);
    if (skipped) {
      failedGates.push(`reconciliation: ${skippedReason}`);
    }
    const item: ProgressJobDecisionItem = {
      jobId: rankedJob.job.id,
      company: rankedJob.job.company,
      title: rankedJob.job.title,
      sourceName: rankedJob.job.source.name,
      decision: rankedJob.decision,
      reasons: rankedJob.reasons,
      failedGates,
      nextStep: createJobDecisionNextStep(rankedJob, failedGates, skipped)
    };
    if (rankedJob.job.location) item.location = rankedJob.job.location;
    if (skipped) {
      item.reconciliationStatus = skipped.status;
      item.skippedReason = skippedReason ?? "CV reconciliation did not pass.";
    }
    return item;
  });
}

function createJobDecisionNextStep(
  rankedJob: RankedJob,
  failedGates: string[],
  skipped?: SkippedReconciliation
): string {
  if (skipped?.status === "needs_user_confirmation") {
    return "Paused until the user confirms the CV positioning.";
  }
  if (skipped) return "Skipped until CV reconciliation passes.";
  if (rankedJob.decision === "apply") return "Ready for application under configured policy.";
  if (rankedJob.decision === "review") return "Review and prepare before submit.";
  if (rankedJob.decision === "watch") return "Keep for later; not strong enough for today's batch.";
  if (failedGates.length > 0) return "Skipped until the blocker is resolved.";
  return "Skipped because the match is too weak for this batch.";
}

function findGeneratedFilePath(
  files: GeneratedFileManifest[],
  kind: GeneratedFileManifest["kind"],
  sourceId: string
): string | undefined {
  return files.find((file) => file.kind === kind && file.sourceIds.includes(sourceId))?.path;
}

function createProgressNextStep(draft?: ApplicationDraft): string {
  if (!draft) return "Review missing application draft.";
  if (draft.pauseReasons.length > 0) return "Resolve pause reasons before submit.";
  if (draft.submitRequiresApproval) return "Review and approve before submit.";
  if (draft.canAutoSubmit) return "Ready to submit under configured policy.";
  return "Prepared for review.";
}

async function writeRunOutputs(
  outputRoot: string,
  result: Omit<SampleBatchResult, "drafts" | "outputRoot">
): Promise<void> {
  await Promise.all([
    mkdir(path.join(outputRoot, "data", "local"), { recursive: true }),
    mkdir(path.join(outputRoot, "outputs", "browser-plans"), { recursive: true }),
    mkdir(path.join(outputRoot, "outputs", "cvs"), { recursive: true }),
    mkdir(path.join(outputRoot, "outputs", "dashboard"), { recursive: true }),
    mkdir(path.join(outputRoot, "outputs", "reconciliation"), { recursive: true }),
    mkdir(path.join(outputRoot, "outputs", "runs"), { recursive: true })
  ]);

  await writeFile(
    path.join(outputRoot, "data", "local", "jobs.jsonl"),
    toJsonLines(result.jobs),
    "utf8"
  );
  await writeFile(
    path.join(outputRoot, "data", "local", "applications.jsonl"),
    toJsonLines(result.applications),
    "utf8"
  );
  await writeFile(
    path.join(outputRoot, "data", "local", "source-plan.generated.json"),
    `${JSON.stringify(result.sourcePlan, null, 2)}\n`,
    "utf8"
  );
  await Promise.all(
    result.cvDocxs.map((item) =>
      writeFile(
        path.join(outputRoot, "outputs", "cvs", `${item.cvVariantId}.docx`),
        item.docx
      )
    )
  );
  await Promise.all(
    result.cvVariants.map((variant) =>
      writeFile(
        path.join(outputRoot, "outputs", "cvs", `${variant.id}.md`),
        result.cvMarkdowns.find((item) => item.cvVariantId === variant.id)?.markdown ?? "",
        "utf8"
      )
    )
  );
  await Promise.all(
    result.cvVariants.map((variant) =>
      writeFile(
        path.join(outputRoot, "outputs", "cvs", `${variant.id}.html`),
        result.cvHtmls.find((item) => item.cvVariantId === variant.id)?.html ?? "",
        "utf8"
      )
    )
  );
  await Promise.all(
    result.reconciliationReports.map((report) =>
      writeFile(
        path.join(outputRoot, "outputs", "reconciliation", `${report.id}.json`),
        `${JSON.stringify(report, null, 2)}\n`,
        "utf8"
      )
    )
  );
  await Promise.all(
    result.browserPlans.map((plan) =>
      writeFile(
        path.join(outputRoot, "outputs", "browser-plans", `${plan.id}.json`),
        `${JSON.stringify(plan, null, 2)}\n`,
        "utf8"
      )
    )
  );

  await writeProgressDashboardAndSummary(outputRoot, result);
  await writeFile(
    path.join(outputRoot, "outputs", "runs", `${result.manifest.id}.json`),
    `${JSON.stringify(result.manifest, null, 2)}\n`,
    "utf8"
  );
}

export function buildBatchProgressSnapshot(
  result: Omit<SampleBatchResult, "drafts" | "outputRoot">,
  outputRoot: string,
  overlay: ProgressOutputOverlay = {}
): ProgressSnapshot {
  const pendingQuestionItems = result.manifest.pendingQuestions ?? result.pendingQuestions ?? [];
  return buildProgressSnapshot({
    id: "sample-dashboard",
    periodStart: "2026-07-06",
    periodEnd: "2026-07-06",
    applications: result.applications,
    items: result.progressItems,
    jobDecisions: result.jobDecisions,
    pendingQuestions: (overlay.pendingQuestions ?? 0) + pendingQuestionItems.length,
    pendingQuestionItems,
    nextActions: [...(overlay.nextActions ?? []), ...buildProgressNextActions(result)],
    notes: [...result.manifest.notes, ...(overlay.notes ?? [])],
    outputRoot,
    profileId: result.profile.id,
    runId: result.manifest.id,
    ...(result.manifest.cvQuality ? { cvQuality: result.manifest.cvQuality } : {}),
    ...(overlay.livePreflight ? { livePreflight: overlay.livePreflight } : {}),
    ...(result.manifest.scanHistory ? { scanHistory: result.manifest.scanHistory } : {}),
    ...(result.manifest.sourceScorecards ? { sourceScorecards: result.manifest.sourceScorecards } : {}),
    ...(result.manifest.sourceOutcomes ? { sourceOutcomes: result.manifest.sourceOutcomes } : {}),
    ...(result.manifest.sourceQuality ? { sourceQuality: result.manifest.sourceQuality } : {}),
    ...(result.manifest.funnelHealth ? { funnelHealth: result.manifest.funnelHealth } : {})
  });
}

export async function writeProgressDashboardAndSummary(
  outputRoot: string,
  result: Omit<SampleBatchResult, "drafts" | "outputRoot">,
  overlay: ProgressOutputOverlay = {}
): Promise<void> {
  const snapshot = buildBatchProgressSnapshot(result, outputRoot, overlay);
  const dashboard = renderProgressDashboardHtml(snapshot);
  const summary = renderProgressChatSummaryMarkdown(snapshot);
  await writeFile(path.join(outputRoot, "outputs", "dashboard", "latest.html"), dashboard, "utf8");
  await writeFile(path.join(outputRoot, "outputs", "runs", "latest-summary.md"), summary, "utf8");
}

function buildProgressNextActions(result: Omit<SampleBatchResult, "drafts" | "outputRoot">): string[] {
  const configuredDailyTarget = Math.max(1, Math.floor(result.profile.applySettings.applicationsPerDay || 1));
  const actions = [
    ...(result.manifest.funnelHealth?.suggestedActions ?? []),
    "Review generated CVs and reconciliation reports before enabling submit."
  ];
  if (result.applications.length < configuredDailyTarget) {
    const hasShortGuidance = actions.some((action) => action.toLowerCase().includes("daily target short"));
    if (!hasShortGuidance) {
      actions.unshift(
        `Daily target short by ${configuredDailyTarget - result.applications.length}; add or approve more sources, or widen search before increasing automation.`
      );
    }
  }
  return actions;
}

function toJsonLines(values: unknown[]): string {
  return `${values.map((value) => JSON.stringify(value)).join("\n")}\n`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readOutcomeEventsIfExists(filePath: string): Promise<OutcomeEvent[]> {
  if (!(await fileExists(filePath))) return [];
  return parseOutcomeEventsJsonLines(await readFile(filePath, "utf8"));
}

function createOutcomeEventId(applicationId: string, type: OutcomeEvent["type"], occurredAt: string): string {
  return [
    "outcome",
    applicationId,
    type,
    occurredAt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  ].join("-");
}

function createApplicationId(runId: string, jobId: string, fallbackIndex: number): string {
  const stableJobPart = jobId.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${runId}-application-${stableJobPart || fallbackIndex + 1}`;
}

function filterDevelopmentDemoJobs(
  jobs: JobRecord[],
  options: { enabled: boolean }
): { jobs: JobRecord[]; skippedJobs: number } {
  if (!options.enabled) {
    return {
      jobs,
      skippedJobs: 0
    };
  }

  const kept = jobs.filter((job) => !isDevelopmentDemoJob(job));
  return {
    jobs: kept,
    skippedJobs: jobs.length - kept.length
  };
}

function isDevelopmentDemoJob(job: JobRecord): boolean {
  const url = job.url.trim().toLowerCase();
  const company = job.company.trim().toLowerCase();
  if (url.includes("://example.com/") || url.includes(".example.com/")) return true;
  if (company.startsWith("example ")) return true;
  return company === "example";
}

function isExternalUserConfigPath(configPath: string, workspaceRoot: string): boolean {
  const resolvedConfigPath = path.resolve(configPath);
  const resolvedWorkspace = path.resolve(workspaceRoot);
  return !(
    resolvedConfigPath === resolvedWorkspace ||
    resolvedConfigPath.startsWith(`${resolvedWorkspace}${path.sep}`)
  );
}

async function resolveConfigPath(options: RunLocalBatchOptions, workspaceRoot: string): Promise<string | undefined> {
  if (options.configPath) return path.resolve(options.configPath);

  const storageOptions = {
    env: process.env,
    ...(options.applyCueHome ? { applyCueHome: options.applyCueHome } : {}),
    ...(options.profileKey ? { profileKey: options.profileKey } : {})
  };
  const candidates = [
    getApplyCueProfileConfigPath(storageOptions),
    path.join(workspaceRoot, "config", "applycue.local.json")
  ];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }

  return undefined;
}
