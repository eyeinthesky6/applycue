import { access, appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createApplicationDraft, createApplyRoute, createBrowserApplyPlan } from "@applycue/apply-assistant";
import type {
  ApplicationDraft,
  ApplicationRecord,
  ApplyDecision,
  ApplyRoute,
  AtsDiagnosticReport,
  BrowserApplyPlan,
  CvVariant,
  GeneratedFileManifest,
  JobLiveState,
  JobRecord,
  OutcomeEvent,
  PendingQuestion,
  ProgressApplicationItem,
  ProgressCvQualitySummary,
  ProgressDedupeSummary,
  ProgressFreshnessSummary,
  ProgressFunnelHealthSummary,
  ProgressFunnelPressureItem,
  ProgressJobDecisionItem,
  ProgressLivePreflightSummary,
  ProgressSafetySummary,
  ProgressScanHistorySummary,
  ProgressSnapshot,
  ProgressSourceOutcomeSummary,
  ProgressSourceScorecardSummary,
  ProgressSourceQualitySummary,
  RankedJob,
  RecordedJobDecision,
  ReconciliationReport,
  RunManifest,
  ScanHistoryEntry,
  SourcePlan,
  TuningSignal,
  TuningSignalAction,
  TuningSignalOrigin,
  TuningSignalStatus,
  TuningSignalTarget,
  UserProfile
} from "@applycue/core";
import {
  createAtsDiagnosticReport,
  generateJobSpecificCv,
  renderStandardAtsDocx,
  summarizeAtsDiagnosticReports,
  type CvGenerationResult
} from "@applycue/cv-tailor";
import {
  createSourcePlan,
  discoverJobsFromAtsDirectories,
  discoverJobsFromJobBoards,
  discoverJobsFromCompanyPages,
  discoverJobsFromPath,
  dedupeJobsForShortlist,
  filterJobsBySearchProfile,
  filterJobsByScanHistory,
  buildScanHistoryEntries,
  getVerifiedLiveState,
  appendScanHistoryEntries,
  parseAtsDirectorySources,
  parseAtsCompanySources,
  parseJobBoardSources,
  readScanHistoryEntries,
  type ApprovedSource,
  type AtsDirectorySourceConfig,
  type AtsCompanySourceConfig,
  type FetchJson,
  type FetchText,
  type JobHiveRunner,
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
export * from "./tuning-application.js";

export interface SampleBatchResult {
  applications: ApplicationRecord[];
  applyRoutes: ApplyRoute[];
  atsDiagnosticReports: AtsDiagnosticReport[];
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
  freshness?: ProgressFreshnessSummary;
  scanHistory?: ProgressScanHistorySummary;
  dedupe?: ProgressDedupeSummary;
  safety?: ProgressSafetySummary;
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
  recordedJobDecisions?: RecordedJobDecision[];
  requireRecordedJobDecisions?: boolean;
  runId: string;
  scanHistoryEntries?: ScanHistoryEntry[];
  scanHistory?: ProgressScanHistorySummary;
  freshness?: ProgressFreshnessSummary;
  dedupe?: ProgressDedupeSummary;
  scanHistoryPath?: string;
  sourceScorecardJobs?: {
    fetchedJobs: JobRecord[];
    filteredJobs?: JobRecord[];
    keptJobs: JobRecord[];
  };
  sourcePlan?: SourcePlan;
  sourceQuality?: ProgressSourceQualitySummary;
  hasApprovedInboxSource?: boolean;
}

export interface RunLocalBatchOptions extends RunSampleBatchOptions {
  applyCueHome?: string;
  atsDirectoryFetchJson?: FetchJson;
  atsDirectoryFetchText?: FetchText;
  companyPageFetchJson?: FetchJson;
  companyPageFetchText?: FetchText;
  configPath?: string;
  generatedSourceExpansion?: boolean;
  includeOlderPosts?: boolean;
  freshnessDays?: number;
  jobBoardFetchJson?: FetchJson;
  jobHiveRunner?: JobHiveRunner;
  jobSpyRunner?: JobSpyRunner;
  jobsPath?: string;
  livenessVerifier?: JobLivenessVerifier;
  outputRoot?: string;
  profileKey?: string;
  requireRecordedJobDecisions?: boolean;
  runId?: string;
  scanHistoryPath?: string;
  targetRankingQueue?: number;
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

export interface RecordTuningSignalOptions {
  action: TuningSignalAction;
  applicationId?: string;
  applyCueHome?: string;
  approvedByUser?: boolean;
  confidence?: TuningSignal["confidence"];
  configPath?: string;
  createdAt?: string;
  evidenceRefs?: string[];
  id?: string;
  jobId?: string;
  origin: TuningSignalOrigin;
  profileKey?: string;
  reason: string;
  sourceId?: string;
  sourceName?: string;
  status?: TuningSignalStatus;
  target: TuningSignalTarget;
  value: string;
  workspaceRoot?: string;
}

export interface RecordTuningSignalResult {
  configPath: string;
  signal: TuningSignal;
  tuningSignalsPath: string;
}

export interface RecordJobDecisionOptions {
  actorKind?: RecordedJobDecision["actorKind"];
  actorName: string;
  applyCueHome?: string;
  configPath?: string;
  decidedAt?: string;
  decision: ApplyDecision;
  evidenceRefs?: string[];
  id?: string;
  jobId: string;
  profileKey?: string;
  reasons: string[];
  workspaceRoot?: string;
}

export interface RecordJobDecisionInput {
  decidedAt?: string;
  decision: ApplyDecision;
  evidenceRefs?: string[];
  id?: string;
  jobId: string;
  reasons: string[];
}

export interface RecordJobDecisionsOptions {
  actorKind?: RecordedJobDecision["actorKind"];
  actorName: string;
  applyCueHome?: string;
  configPath?: string;
  decisions: RecordJobDecisionInput[];
  profileKey?: string;
  workspaceRoot?: string;
}

export interface RecordJobDecisionsResult {
  configPath: string;
  decisions: RecordedJobDecision[];
  decisionsPath: string;
  recordedCount: number;
  skippedCount: number;
  sourceQueuePath: string;
}

export interface RecordJobDecisionResult {
  configPath: string;
  decision: RecordedJobDecision;
  decisionsPath: string;
  sourceQueuePath: string;
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
  const companyPages = parseAtsCompanySources(loaded.config.sources?.companyPages);
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
  const hasApprovedInboxSource = hasApprovedEmailLeadSource(loaded.config.sources);
  const sourceWarnings: string[] = [];
  const jobBoardSources = applyJobBoardFreshnessDefaults(
    parseJobBoardSources(loaded.config.sources?.jobBoards),
    loaded.profile,
    options
  );
  const companyPageJobs = await discoverJobsFromCompanyPages(companyPages, {
    ...(options.companyPageFetchJson ? { fetchJson: options.companyPageFetchJson } : {}),
    onWarning: (message) => sourceWarnings.push(message)
  });
  const atsDirectoryJobs = await discoverJobsFromAtsDirectories(atsDirectorySources, {
    ...(options.atsDirectoryFetchJson ?? options.companyPageFetchJson ? { fetchJson: options.atsDirectoryFetchJson ?? options.companyPageFetchJson } : {}),
    ...(options.atsDirectoryFetchText ?? options.companyPageFetchText ? { fetchText: options.atsDirectoryFetchText ?? options.companyPageFetchText } : {}),
    onWarning: (message) => sourceWarnings.push(message)
  });
  const jobBoardJobs = await discoverJobsFromJobBoards(jobBoardSources, {
    ...(options.jobBoardFetchJson ? { fetchJson: options.jobBoardFetchJson } : {}),
    ...(options.jobHiveRunner ? { jobHiveRunner: options.jobHiveRunner } : {}),
    ...(options.jobSpyRunner ? { jobSpyRunner: options.jobSpyRunner } : {}),
    onWarning: (message) => sourceWarnings.push(message)
  });
  let discoveredJobsBeforeDemoGuard = uniqueJobsById([...localJobs, ...companyPageJobs, ...atsDirectoryJobs, ...jobBoardJobs]);
  let demoGuard = filterDevelopmentDemoJobs(discoveredJobsBeforeDemoGuard, {
    enabled: isExternalUserConfigPath(configPath, workspaceRoot)
  });
  let discoveredJobs = demoGuard.jobs;
  let sourceQuality = filterJobsBySearchProfile(discoveredJobs, sourcePlan.searchProfile);
  const expansionSources = applyJobBoardFreshnessDefaults(
    generatedPublicJobBoardExpansionSources(sourcePlan, loaded.profile, jobBoardSources, options.targetRankingQueue),
    loaded.profile,
    options
  );
  let expansionAttempted = false;
  let expansionJobs: JobRecord[] = [];
  if (shouldRunGeneratedSourceExpansion(loaded.profile, sourceQuality.summary.keptJobs, expansionEnabled(options), expansionSources, options.targetRankingQueue)) {
    expansionAttempted = true;
    expansionJobs = await discoverJobsFromJobBoards(expansionSources, {
      ...(options.jobBoardFetchJson ? { fetchJson: options.jobBoardFetchJson } : {}),
      ...(options.jobHiveRunner ? { jobHiveRunner: options.jobHiveRunner } : {}),
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
  const freshnessOptions: Pick<RunLocalBatchOptions, "freshnessDays" | "includeOlderPosts"> = {
    includeOlderPosts: options.includeOlderPosts === true
  };
  if (typeof options.freshnessDays === "number") freshnessOptions.freshnessDays = options.freshnessDays;
  const freshness = filterJobsByFreshness(sourceQuality.jobs, loaded.profile, freshnessOptions);
  const scanHistoryPath = options.scanHistoryPath ?? path.join(loaded.configDir, "data", "local", "scan-history.jsonl");
  const scanHistoryEntries = await readScanHistoryEntries(scanHistoryPath);
  const currentRunDedupe = dedupeJobsForShortlist(freshness.jobs);
  const scanHistory = filterJobsByScanHistory(currentRunDedupe.jobs, scanHistoryEntries, {
    historyPath: scanHistoryPath,
    mode: loaded.profile.applySettings.mode
  });
  const dedupeSummary: ProgressDedupeSummary = {
    inputJobs: currentRunDedupe.summary.inputJobs,
    keptJobs: scanHistory.summary.keptJobs,
    blockedDuplicates: currentRunDedupe.summary.skippedJobs,
    sameUrl: currentRunDedupe.summary.skippedByReason.same_url,
    sameCompanySimilarRole: currentRunDedupe.summary.skippedByReason.same_company_similar_role,
    alreadyHandledRepeats: scanHistory.summary.skippedPrepared,
    totalAvoided: currentRunDedupe.summary.skippedJobs + scanHistory.summary.skippedPrepared
  };
  const outcomeEventsPath = path.join(loaded.configDir, "data", "local", "outcomes.jsonl");
  const outcomeEvents = await readOutcomeEventsIfExists(outcomeEventsPath);
  const recordedJobDecisionsPath = path.join(loaded.configDir, "data", "local", "job-decisions.jsonl");
  const recordedJobDecisions = await readRecordedJobDecisionsIfExists(recordedJobDecisionsPath);
  const jobs = scanHistory.jobs;
  return runBatch({
    workspaceRoot,
    outputRoot: options.outputRoot ?? loaded.configDir,
    profile: loaded.profile,
    recordedJobDecisions,
    requireRecordedJobDecisions: options.requireRecordedJobDecisions ?? false,
    jobs,
    runId: options.runId ?? "local-first-build",
    kind: "daily_batch",
    outcomeEvents,
    outcomeEventsPath,
    sourcePlan,
    scanHistoryEntries,
    scanHistory: scanHistory.summary,
    freshness: freshness.summary,
    dedupe: dedupeSummary,
    scanHistoryPath,
    sourceScorecardJobs: {
      fetchedJobs: discoveredJobs,
      filteredJobs: [...sourceQuality.filtered.map((item) => item.job), ...freshness.filtered],
      keptJobs: freshness.jobs
    },
    sourceQuality: sourceQuality.summary,
    hasApprovedInboxSource,
    ...(options.livenessVerifier ? { livenessVerifier: options.livenessVerifier } : {}),
    notes: [
      `Loaded profile config: ${path.relative(workspaceRoot, loaded.configPath)}`,
      jobsPath
        ? localJobs.length > 0
          ? `Loaded jobs from: ${path.relative(workspaceRoot, jobsPath)}`
          : `Local job import path configured but no supported job rows found yet: ${path.relative(workspaceRoot, jobsPath)}`
        : "No manual local job file configured; using approved source connectors only.",
      `Loaded ${companyPageJobs.length} job(s) from ${companyPages.filter((source) => source.enabled !== false).length} company/ATS source(s).`,
      `Loaded ${atsDirectoryJobs.length} job(s) from ${atsDirectorySources.filter((source) => source.enabled !== false).length} ATS directory source(s).`,
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
      formatFreshnessNote(freshness.summary),
      currentRunDedupe.summary.skippedJobs > 0
        ? `Dedupe kept ${currentRunDedupe.summary.keptJobs} of ${currentRunDedupe.summary.inputJobs} source-quality job(s); skipped ${formatDedupeReasons(currentRunDedupe.summary.skippedByReason)} duplicate(s).`
        : `Dedupe kept all ${currentRunDedupe.summary.keptJobs} source-quality job(s).`,
      scanHistory.summary.skippedJobs > 0
        ? `Scan history kept ${scanHistory.summary.keptJobs} of ${scanHistory.summary.inputJobs} post-filter job(s); skipped ${scanHistory.summary.skippedJobs} already handled job(s).`
        : scanHistory.summary.mode === "review"
          ? `Scan history kept all ${scanHistory.summary.keptJobs} post-filter job(s); review mode does not hide previously prepared jobs.`
          : `Scan history kept all ${scanHistory.summary.keptJobs} post-filter job(s).`,
      `Generated ${sourcePlan.suggestions.length} source suggestion(s) for review.`,
      options.requireRecordedJobDecisions
        ? `Preparation accepts clear system matches and requires recorded external-agent/user decisions only for ambiguity; loaded ${recordedJobDecisions.length} decision receipt(s).`
        : "Test/development mode may prepare from backend suggestions without a recorded external decision.",
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

export async function recordTuningSignal(options: RecordTuningSignalOptions): Promise<RecordTuningSignalResult> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const configPath = await resolveConfigPath(options, workspaceRoot);
  if (!configPath || !(await fileExists(configPath))) {
    throw new Error("ApplyCue profile config was not found. Run setup before recording tuning signals.");
  }
  const loaded = await loadApplyCueConfig(configPath);
  const tuningSignalsDir = path.join(loaded.configDir, "data", "local");
  const tuningSignalsPath = path.join(tuningSignalsDir, "tuning-signals.jsonl");
  const createdAt = options.createdAt ?? new Date().toISOString();
  const status = options.status ?? defaultTuningSignalStatus(options);
  const signal: TuningSignal = {
    id: options.id ?? createTuningSignalId(options.origin, options.target, options.value, createdAt),
    origin: options.origin,
    target: options.target,
    action: options.action,
    value: options.value,
    reason: options.reason,
    status,
    createdAt,
    ...(options.confidence ? { confidence: options.confidence } : {}),
    ...(options.applicationId ? { applicationId: options.applicationId } : {}),
    ...(options.jobId ? { jobId: options.jobId } : {}),
    ...(options.sourceId ? { sourceId: options.sourceId } : {}),
    ...(options.sourceName ? { sourceName: options.sourceName } : {}),
    ...(options.evidenceRefs && options.evidenceRefs.length > 0 ? { evidenceRefs: options.evidenceRefs } : {}),
    ...(typeof options.approvedByUser === "boolean" ? { approvedByUser: options.approvedByUser } : {})
  };

  await mkdir(tuningSignalsDir, { recursive: true });
  await appendFile(tuningSignalsPath, `${JSON.stringify(signal)}\n`, "utf8");

  return {
    configPath: loaded.configPath,
    signal,
    tuningSignalsPath
  };
}

export async function recordJobDecision(options: RecordJobDecisionOptions): Promise<RecordJobDecisionResult> {
  const result = await recordJobDecisions({
    ...(options.actorKind ? { actorKind: options.actorKind } : {}),
    actorName: options.actorName,
    ...(options.applyCueHome ? { applyCueHome: options.applyCueHome } : {}),
    ...(options.configPath ? { configPath: options.configPath } : {}),
    decisions: [{
      ...(options.decidedAt ? { decidedAt: options.decidedAt } : {}),
      decision: options.decision,
      ...(options.evidenceRefs ? { evidenceRefs: options.evidenceRefs } : {}),
      ...(options.id ? { id: options.id } : {}),
      jobId: options.jobId,
      reasons: options.reasons
    }],
    ...(options.profileKey ? { profileKey: options.profileKey } : {}),
    ...(options.workspaceRoot ? { workspaceRoot: options.workspaceRoot } : {})
  });
  const decision = result.decisions[0];
  if (!decision) throw new Error("ApplyCue did not resolve the requested job decision.");
  return {
    configPath: result.configPath,
    decision,
    decisionsPath: result.decisionsPath,
    sourceQueuePath: result.sourceQueuePath
  };
}

export async function recordJobDecisions(options: RecordJobDecisionsOptions): Promise<RecordJobDecisionsResult> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const configPath = await resolveConfigPath(options, workspaceRoot);
  if (!configPath || !(await fileExists(configPath))) {
    throw new Error("ApplyCue profile config was not found. Run setup before recording a job decision.");
  }
  const loaded = await loadApplyCueConfig(configPath);
  const sourceQueuePath = path.join(loaded.configDir, "outputs", "runs", "latest-job-decisions.json");
  if (!(await fileExists(sourceQueuePath))) {
    throw new Error("The ranked job decision queue was not found. Run first-build before recording a job decision.");
  }

  const queue = parseJobDecisionQueueArtifact(JSON.parse(await readFile(sourceQueuePath, "utf8")) as unknown);
  const actorName = options.actorName.trim();
  if (!actorName) throw new Error("A recorded job decision needs an actor name such as codex, claude, or user.");
  if (options.decisions.length === 0) throw new Error("A decision batch needs at least one job decision.");
  const duplicateJobIds = options.decisions
    .map((item) => item.jobId)
    .filter((jobId, index, all) => all.indexOf(jobId) !== index);
  if (duplicateJobIds.length > 0) {
    throw new Error(`A decision batch cannot contain the same job twice: ${[...new Set(duplicateJobIds)].join(", ")}`);
  }

  const queueEvidenceRef = "outputs/runs/latest-job-decisions.json";
  const decisionsDir = path.join(loaded.configDir, "data", "local");
  const decisionsPath = path.join(decisionsDir, "job-decisions.jsonl");
  const existing = await readRecordedJobDecisionsIfExists(decisionsPath);
  const latestByJobId = new Map<string, RecordedJobDecision>();
  for (const decision of existing) latestByJobId.set(decision.jobId, decision);

  const resolved: RecordedJobDecision[] = [];
  const toAppend: RecordedJobDecision[] = [];
  for (const input of options.decisions) {
    const suggested = queue.find((item) => item.jobId === input.jobId);
    if (!suggested) throw new Error(`Job ${input.jobId} was not found in the latest ranked decision queue.`);
    if (input.decision === "apply" && suggested.failedGates.length > 0) {
      throw new Error(`Cannot record apply for ${input.jobId}; hard gates failed: ${suggested.failedGates.join(" | ")}`);
    }
    const reasons = input.reasons.map((reason) => reason.trim()).filter(Boolean);
    if (reasons.length === 0) throw new Error(`Recorded job decision ${input.jobId} needs at least one reason.`);
    const evidenceRefs = [...new Set([queueEvidenceRef, ...(input.evidenceRefs ?? [])].map((item) => item.trim()).filter(Boolean))];
    const decidedAt = input.decidedAt ?? new Date().toISOString();
    const decision: RecordedJobDecision = {
      id: input.id ?? createJobDecisionId(input.jobId, input.decision, actorName, decidedAt),
      jobId: input.jobId,
      decision: input.decision,
      reasons,
      evidenceRefs,
      actorKind: options.actorKind ?? "agent",
      actorName,
      decidedAt,
      backendDecision: suggested.decision,
      backendFailedGates: suggested.failedGates
    };
    const prior = latestByJobId.get(input.jobId);
    if (prior && equivalentRecordedJobDecision(prior, decision)) {
      resolved.push(prior);
      continue;
    }
    resolved.push(decision);
    toAppend.push(decision);
    latestByJobId.set(input.jobId, decision);
  }

  if (toAppend.length > 0) {
    await mkdir(decisionsDir, { recursive: true });
    await appendFile(decisionsPath, toJsonLines(toAppend), "utf8");
  }
  return {
    configPath: loaded.configPath,
    decisions: resolved,
    decisionsPath,
    recordedCount: toAppend.length,
    skippedCount: resolved.length - toAppend.length,
    sourceQueuePath
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

function formatSourceQualityReasons(byReason: Record<"title" | "industry" | "location" | "content", number>): string {
  return [
    ["title", byReason.title],
    ["industry", byReason.industry],
    ["location", byReason.location],
    ["content", byReason.content]
  ]
    .filter((entry): entry is [string, number] => Number(entry[1]) > 0)
    .map(([reason, count]) => `${count} ${reason}`)
    .join(", ") || "0";
}

function formatDedupeReasons(byReason: Record<"same_url" | "same_company_similar_role", number>): string {
  return [
    ["same URL", byReason.same_url],
    ["same company/similar role", byReason.same_company_similar_role]
  ]
    .filter((entry): entry is [string, number] => Number(entry[1]) > 0)
    .map(([reason, count]) => `${count} ${reason}`)
    .join(", ") || "0";
}

function generatedPublicJobBoardExpansionSources(
  sourcePlan: SourcePlan,
  profile: UserProfile,
  existingSources: JobBoardSourceConfig[],
  targetRankingQueue?: number
): JobBoardSourceConfig[] {
  const existingByKey = new Map(existingSources.map((source) => [jobBoardSourceKey(source), source]));
  const emittedKeys = new Set<string>();
  const entries = sourcePlan.suggestions
    .filter((suggestion) =>
      suggestion.status === "suggested" &&
      suggestion.kind === "job_board" &&
      !suggestion.requiresBrowser &&
      !suggestion.requiresLogin &&
      Boolean(suggestion.provider) &&
      shouldUseExpansionSuggestion(suggestion, profile)
    )
    .sort((left, right) =>
      expansionSuggestionPriority(right, profile, existingSources) - expansionSuggestionPriority(left, profile, existingSources) ||
      right.priority - left.priority ||
      left.label.localeCompare(right.label)
    )
    .flatMap((suggestion) => {
      const entry = {
        id: `transient-${suggestion.id}`,
        label: `Expansion - ${suggestion.label}`,
        provider: suggestion.provider,
        query: suggestion.query,
        enabled: true,
        options: relaxedExpansionOptions(suggestion.provider, suggestion.options, targetRankingQueue)
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

function shouldUseExpansionSuggestion(suggestion: SourcePlan["suggestions"][number], profile: UserProfile): boolean {
  if (suggestion.provider === "jobspy") return true;
  if (profile.matchSettings.range === "wide") return true;
  return !hasExplicitSearchRegion(profile);
}

function expansionSuggestionPriority(
  suggestion: SourcePlan["suggestions"][number],
  profile: UserProfile,
  existingSources: JobBoardSourceConfig[]
): number {
  let priority = suggestion.provider === "jobspy" ? 10 : 0;
  const query = suggestion.query ?? "";
  if (isAlreadyApprovedSourceQuery(suggestion, existingSources)) priority += 5;
  if (queryMatchesAnyTerm(query, profile.preferences.targetIndustries)) priority += 4;
  if (queryMatchesAnyTerm(query, profile.preferences.targetRoleTerms)) priority += 2;
  return priority;
}

function isAlreadyApprovedSourceQuery(
  suggestion: SourcePlan["suggestions"][number],
  existingSources: JobBoardSourceConfig[]
): boolean {
  const suggestionQuery = normalizeComparable(suggestion.query ?? "");
  if (!suggestionQuery) return false;
  return existingSources.some((source) =>
    source.enabled !== false &&
    source.provider === suggestion.provider &&
    normalizeComparable(source.query ?? "") === suggestionQuery
  );
}

function queryMatchesAnyTerm(query: string, terms: string[]): boolean {
  const normalizedQuery = normalizeComparable(query);
  return terms.some((term) => {
    const normalizedTerm = normalizeComparable(term);
    return Boolean(normalizedTerm) && normalizedQuery.includes(normalizedTerm);
  });
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

function hasExplicitSearchRegion(profile: UserProfile): boolean {
  return [
    ...profile.searchSettings.searchCountries,
    ...profile.searchSettings.searchAreas,
    ...profile.searchSettings.remoteRegions,
    ...profile.preferences.preferredLocations,
    ...profile.preferences.extraLocations,
    profile.currentCountry ?? "",
    profile.currentLocation ?? ""
  ].some((term) => !isGenericRemoteSearchTerm(term));
}

function isGenericRemoteSearchTerm(term: string): boolean {
  const normalized = normalizeComparable(term);
  return !normalized ||
    normalized === "remote" ||
    normalized === "work from home" ||
    normalized === "wfh" ||
    normalized === "anywhere" ||
    normalized === "global" ||
    normalized === "worldwide";
}

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function shouldRunGeneratedSourceExpansion(
  profile: UserProfile,
  keptJobs: number,
  writeFiles: boolean,
  expansionSources: JobBoardSourceConfig[],
  targetRankingQueue?: number
): boolean {
  if (!writeFiles) return false;
  if (expansionSources.length === 0) return false;
  if (!profile.matchSettings.relaxOrder.includes("source")) return false;
  if (typeof targetRankingQueue === "number") return keptJobs < targetRankingQueue;
  const dailyTarget = Math.max(1, Math.floor(profile.applySettings.applicationsPerDay || 1));
  const widenTarget = Math.max(dailyTarget, Math.min(20, Math.floor(profile.matchSettings.widenIfFewerThan || dailyTarget)));
  return keptJobs < widenTarget;
}

function expansionEnabled(options: RunLocalBatchOptions): boolean {
  return (options.writeFiles ?? true) && options.generatedSourceExpansion === true;
}

function generatedSourceExpansionLimit(profile: UserProfile): number {
  const dailyTarget = Math.max(1, Math.floor(profile.applySettings.applicationsPerDay || 1));
  if (profile.matchSettings.range === "tight") return Math.min(4, Math.max(2, dailyTarget));
  if (profile.matchSettings.range === "wide") return Math.min(10, Math.max(5, dailyTarget * 2));
  return Math.min(10, Math.max(5, dailyTarget * 2));
}

function applyJobBoardFreshnessDefaults(
  sources: JobBoardSourceConfig[],
  profile: UserProfile,
  options: Pick<RunLocalBatchOptions, "freshnessDays" | "includeOlderPosts">
): JobBoardSourceConfig[] {
  const configuredHours = resolveFreshnessDays(profile, options.freshnessDays) * 24;
  return sources.map((source) => {
    if (source.provider !== "jobspy") return source;
    const currentOptions = { ...(source.options ?? {}) };
    if (options.includeOlderPosts === true) {
      delete currentOptions.hoursOld;
      const nextSource: JobBoardSourceConfig = { ...source };
      if (Object.keys(currentOptions).length > 0) nextSource.options = currentOptions;
      else delete nextSource.options;
      return nextSource;
    }
    currentOptions.hoursOld = Math.max(numberOption(currentOptions.hoursOld) ?? 0, configuredHours);
    return { ...source, options: currentOptions };
  });
}

function relaxedExpansionOptions(
  provider: unknown,
  options: Record<string, unknown> | undefined,
  targetRankingQueue?: number
): Record<string, unknown> | undefined {
  const current = { ...(options ?? {}) };
  const targetSizedLimit = typeof targetRankingQueue === "number"
    ? Math.min(100, Math.max(35, Math.ceil(targetRankingQueue / 4)))
    : 35;
  if (provider === "jobspy") {
    current.resultsWanted = Math.max(numberOption(current.resultsWanted) ?? 0, targetSizedLimit);
    current.hoursOld = Math.max(numberOption(current.hoursOld) ?? 0, 720);
  } else if (provider === "remotive" || provider === "remoteok" || provider === "workingnomads" || provider === "jobicy" || provider === "himalayas" || provider === "themuse") {
    current.limit = Math.max(numberOption(current.limit) ?? 0, Math.max(75, targetSizedLimit));
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

interface FreshnessFilterResult {
  filtered: JobRecord[];
  jobs: JobRecord[];
  summary: ProgressFreshnessSummary;
}

function filterJobsByFreshness(
  jobs: JobRecord[],
  profile: UserProfile,
  options: Pick<RunLocalBatchOptions, "freshnessDays" | "includeOlderPosts"> = {}
): FreshnessFilterResult {
  const windowDays = resolveFreshnessDays(profile, options.freshnessDays);
  const includeOlderPosts = options.includeOlderPosts === true;
  const includeUnknownPostDates = profile.searchSettings.includeUnknownPostDates !== false;
  const oldestAllowed = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const kept: JobRecord[] = [];
  const filtered: JobRecord[] = [];
  let freshKnownPostDateJobs = 0;
  let unknownPostDateJobs = 0;
  let filteredOldJobs = 0;
  let filteredUnknownPostDateJobs = 0;

  for (const job of jobs) {
    const postedAt = parseJobPostedAt(job);
    const isManual = job.source.kind === "manual";
    if (!postedAt) {
      unknownPostDateJobs += 1;
      if (includeUnknownPostDates || isManual) {
        kept.push(job);
      } else {
        filteredUnknownPostDateJobs += 1;
        filtered.push(job);
      }
      continue;
    }

    if (postedAt >= oldestAllowed) {
      freshKnownPostDateJobs += 1;
      kept.push(job);
      continue;
    }

    if (includeOlderPosts || isManual) {
      kept.push(job);
    } else {
      filteredOldJobs += 1;
      filtered.push(job);
    }
  }

  return {
    jobs: sortJobsByFreshness(kept),
    filtered,
    summary: {
      inputJobs: jobs.length,
      keptJobs: kept.length,
      filteredOldJobs,
      filteredUnknownPostDateJobs,
      freshKnownPostDateJobs,
      unknownPostDateJobs,
      windowDays,
      includeOlderPosts,
      includeUnknownPostDates,
      oldestAllowedPostedAt: oldestAllowed.toISOString()
    }
  };
}

function resolveFreshnessDays(profile: UserProfile, override?: number): number {
  const value = override ?? profile.searchSettings.freshnessDays;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.max(1, Math.floor(value)) : 30;
}

function parseJobPostedAt(job: JobRecord): Date | undefined {
  if (!job.postedAt) return undefined;
  const timestamp = Date.parse(job.postedAt);
  if (!Number.isFinite(timestamp)) return undefined;
  return new Date(timestamp);
}

function sortJobsByFreshness(jobs: JobRecord[]): JobRecord[] {
  return [...jobs].sort((left, right) => {
    const leftPosted = jobPostedAtTime(left);
    const rightPosted = jobPostedAtTime(right);
    if (rightPosted !== leftPosted) return rightPosted - leftPosted;
    const leftDiscovered = Date.parse(left.discoveredAt);
    const rightDiscovered = Date.parse(right.discoveredAt);
    if (Number.isFinite(rightDiscovered) && Number.isFinite(leftDiscovered) && rightDiscovered !== leftDiscovered) {
      return rightDiscovered - leftDiscovered;
    }
    return left.id.localeCompare(right.id);
  });
}

function jobPostedAtTime(job: JobRecord): number {
  const timestamp = Date.parse(job.postedAt ?? "");
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function formatFreshnessNote(summary: ProgressFreshnessSummary): string {
  const unknown = summary.unknownPostDateJobs > 0
    ? ` ${summary.unknownPostDateJobs} unknown-date job(s) stayed eligible.`
    : "";
  if (summary.includeOlderPosts) {
    return `Freshness kept ${summary.keptJobs} of ${summary.inputJobs} job(s); older known posts were included for this run.${unknown}`;
  }
  const filteredUnknown = summary.filteredUnknownPostDateJobs > 0
    ? ` Filtered ${summary.filteredUnknownPostDateJobs} unknown-date job(s) because unknown post dates are disabled.`
    : "";
  return `Freshness kept ${summary.keptJobs} of ${summary.inputJobs} job(s) using a ${summary.windowDays}-day window; held back ${summary.filteredOldJobs} older known post(s).${unknown}${filteredUnknown}`;
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
  const safety = buildSafetySummary(ranked);
  const pendingQuestions = buildAmbiguityPrompts(ranked, profile, {
    createdAt: NOW,
    limit: 5
  });
  const batchLimit = Math.max(1, Math.floor(profile.applySettings.applicationsPerDay || 1));
  const applyReadyJobs = ranked.filter((rankedJob) => rankedJob.decision === "apply");
  const reviewFillJobs = ranked.filter((rankedJob) => rankedJob.decision === "review");
  const candidateJobs = options.requireRecordedJobDecisions
    ? selectApprovedCandidateJobs(ranked, options.recordedJobDecisions ?? [])
    : [...applyReadyJobs, ...reviewFillJobs];
  const { cvResults, skippedReconciliations } = generatePassedCvResults(candidateJobs, profile, batchLimit);
  const jobDecisions = buildProgressJobDecisionItems(
    ranked,
    skippedReconciliations,
    options.recordedJobDecisions ?? []
  );
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
  const atsDiagnosticReports = cvResults.map((result) => {
    const job = jobs.find((item) => item.id === result.variant.jobId);
    if (!job) throw new Error(`Missing job for ATS diagnostics ${result.variant.id}`);
    return createAtsDiagnosticReport({
      cvMarkdown: result.markdown,
      job,
      profile,
      reconciliationReport: result.reconciliationReport,
      variant: result.variant
    });
  });
  const atsDiagnostics = summarizeAtsDiagnosticReports(atsDiagnosticReports);
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
    recordedJobDecisions: options.recordedJobDecisions ?? [],
    requireRecordedJobDecisions: options.requireRecordedJobDecisions === true,
    sourceScorecards,
    ...(options.sourceQuality ? { sourceQuality: options.sourceQuality } : {})
  });
  const baseFiles = buildGeneratedFileManifests(
    options.runId,
    [],
    cvVariants,
    [],
    reconciliationReports,
    applications,
    jobs,
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
  const applyRoutes = applications.map((application) => {
    const job = jobs.find((item) => item.id === application.jobId);
    const draft = drafts.find((item) => item.jobId === application.jobId);
    const browserPlan = browserPlans.find((item) => item.jobId === application.jobId);
    if (!job) throw new Error(`Missing job for apply route ${application.jobId}`);
    if (!draft) throw new Error(`Missing draft for apply route ${application.jobId}`);
    if (!browserPlan) throw new Error(`Missing browser plan for apply route ${application.jobId}`);
    return createApplyRoute({
      application,
      browserPlan,
      draft,
      job,
      profile
    });
  });
  const files = buildGeneratedFileManifests(
    options.runId,
    applyRoutes,
    cvVariants,
    atsDiagnosticReports,
    reconciliationReports,
    applications,
    jobs,
    sourcePlan,
    browserPlans
  );
  const progressItems = buildProgressApplicationItems({
    applications,
    applyRoutes,
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
    applyRouteIds: applyRoutes.map((route) => route.id),
    generatedFiles: files,
    sourceCodeWriteCount: 0,
    decisionAuthority: resolveDecisionAuthority({
      candidateJobs,
      rankedJobs: ranked,
      recordedJobDecisions: options.recordedJobDecisions ?? [],
      requireRecordedJobDecisions: options.requireRecordedJobDecisions === true
    }),
    notes: [
      ...(options.notes ?? []),
      ...(liveness ? formatLivenessVerificationNotes(liveness) : []),
      ...(skippedReconciliations.length > 0
        ? [`Skipped ${skippedReconciliations.length} candidate CV(s) because reconciliation or CV completeness did not pass.`]
        : [])
    ],
    ...(atsDiagnostics ? { atsDiagnostics } : {}),
    ...(cvQuality ? { cvQuality } : {}),
    ...(options.freshness ? { freshness: options.freshness } : {}),
    ...(scanHistory ? { scanHistory } : {}),
    ...(options.dedupe ? { dedupe: options.dedupe } : {}),
    safety,
    ...(pendingQuestions.length > 0 ? { pendingQuestions } : {}),
    sourceScorecards,
    sourceOutcomes,
    ...(options.sourceQuality ? { sourceQuality: options.sourceQuality } : {}),
    funnelHealth
  };

  if (writeFiles) {
    await writeRunOutputs(outputRoot, {
      applications,
      applyRoutes,
      atsDiagnosticReports,
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
      ...(options.freshness ? { freshness: options.freshness } : {}),
      ...(options.dedupe ? { dedupe: options.dedupe } : {}),
      safety,
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
    applyRoutes,
    atsDiagnosticReports,
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
    ...(options.freshness ? { freshness: options.freshness } : {}),
    ...(scanHistory ? { scanHistory } : {}),
    ...(options.dedupe ? { dedupe: options.dedupe } : {}),
    safety,
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

function buildSafetySummary(rankedJobs: RankedJob[]): ProgressSafetySummary {
  const fraudJobs = jobsWithFailedGate(rankedJobs, "fraud-signal");
  const blockedPortalJobs = jobsWithFailedGate(rankedJobs, "blocked-portal");
  const portalPolicyJobs = jobsWithFailedGate(rankedJobs, "portal-policy");
  const blockedJobIds = new Set([
    ...fraudJobs.map((item) => item.job.id),
    ...blockedPortalJobs.map((item) => item.job.id),
    ...portalPolicyJobs.map((item) => item.job.id)
  ]);

  return {
    checkedJobs: rankedJobs.length,
    fraudSignalBlocks: fraudJobs.length,
    blockedPortalBlocks: blockedPortalJobs.length,
    portalPolicyBlocks: portalPolicyJobs.length,
    totalSafetyBlocks: blockedJobIds.size,
    examples: [...fraudJobs, ...blockedPortalJobs, ...portalPolicyJobs]
      .slice(0, 5)
      .map((item) => `${item.job.company} - ${item.job.title}: ${failedGateReason(item, ["fraud-signal", "blocked-portal", "portal-policy"])}`)
  };
}

function jobsWithFailedGate(rankedJobs: RankedJob[], gateId: string): RankedJob[] {
  return rankedJobs.filter((rankedJob) =>
    rankedJob.gates.some((gate) => gate.id === gateId && !gate.passed)
  );
}

function failedGateReason(rankedJob: RankedJob, gateIds: string[]): string {
  const gate = rankedJob.gates.find((item) => gateIds.includes(item.id) && !item.passed);
  return gate?.reason ?? "Blocked by safety policy.";
}

function buildFunnelHealthSummary(input: {
  applications: ApplicationRecord[];
  jobDecisions: ProgressJobDecisionItem[];
  profile: UserProfile;
  rankedJobs: RankedJob[];
  recordedJobDecisions: RecordedJobDecision[];
  requireRecordedJobDecisions: boolean;
  sourceQuality?: ProgressSourceQualitySummary;
  sourceScorecards?: ProgressSourceScorecardSummary;
  hasApprovedInboxSource?: boolean;
}): ProgressFunnelHealthSummary {
  const configuredDailyTarget = Math.max(1, Math.floor(input.profile.applySettings.applicationsPerDay || 1));
  const preparedApplications = input.applications.length;
  const discoveredJobs = input.sourceQuality?.inputJobs ?? input.sourceScorecards?.fetchedJobs ?? input.rankedJobs.length;
  const keptForRanking = input.sourceQuality?.keptJobs ?? input.sourceScorecards?.keptJobs ?? input.rankedJobs.length;
  const rankedJobs = input.rankedJobs.length;
  const decisionRequiredJobIds = new Set(
    input.jobDecisions
      .filter((item) => item.failedGates.length === 0 && item.decision === "review")
      .map((item) => item.jobId)
  );
  const recordedJobIds = new Set(
    input.recordedJobDecisions
      .filter((item) => decisionRequiredJobIds.has(item.jobId))
      .map((item) => item.jobId)
  );
  const recordedDecisions = recordedJobIds.size;
  const awaitingDecisions = input.requireRecordedJobDecisions
    ? Math.max(0, decisionRequiredJobIds.size - recordedDecisions)
    : 0;
  const watchOrSkippedJobs = input.jobDecisions.filter((item) =>
    effectiveJobDecision(item) === "watch" || effectiveJobDecision(item) === "skip" || Boolean(item.skippedReason)
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
    awaitingDecisions,
    profile: input.profile,
    rankedJobs,
    hasApprovedInboxSource: input.hasApprovedInboxSource === true
  });
  const keptRate = discoveredJobs > 0 ? keptForRanking / discoveredJobs : 1;
  const tooNoisy = discoveredJobs >= Math.max(100, configuredDailyTarget * 30) && keptRate < 0.08;
  const tooManyKept = keptForRanking >= Math.max(100, configuredDailyTarget * 25);
  const status: ProgressFunnelHealthSummary["status"] = awaitingDecisions > 0 && preparedApplications < configuredDailyTarget
    ? "awaiting_decisions"
    : preparedApplications < configuredDailyTarget
      ? "low_volume"
    : tooNoisy
      ? "noisy_sources"
      : tooManyKept
        ? "high_volume"
        : "healthy";
  const message = status === "awaiting_decisions"
    ? `${awaitingDecisions} ranked job(s) await Codex, Claude, or user review; source supply is sufficient, so do not widen it yet.`
    : status === "low_volume"
    ? `Clean run prepared ${preparedApplications} of ${configuredDailyTarget}; widen only if the user asks for more results.`
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
    recordedDecisions,
    awaitingDecisions,
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
      examples: sourceQuality.examplesByReason?.[id]?.slice(0, 3) ?? []
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
  awaitingDecisions: number;
  configuredDailyTarget: number;
  discoveredJobs: number;
  dominantFilters: ProgressFunnelPressureItem[];
  dominantGateBlocks: ProgressFunnelPressureItem[];
  keptForRanking: number;
  preparedApplications: number;
  profile: UserProfile;
  rankedJobs: number;
  hasApprovedInboxSource: boolean;
}): string[] {
  const actions: string[] = [];
  const shortBy = input.configuredDailyTarget - input.preparedApplications;
  const topFilter = input.dominantFilters[0];
  const topGate = input.dominantGateBlocks[0];
  const keptRate = input.discoveredJobs > 0 ? input.keptForRanking / input.discoveredJobs : 1;

  if (input.awaitingDecisions > 0) {
    return [
      `Review the ${input.awaitingDecisions} ranked job(s) in outputs/runs/latest-job-decisions.json; each item links to its full normalized JD.`,
      "Record the reviewed batch with applycue:record-decisions --prepare so CVs, diagnostics, drafts, and routes are generated in the same step.",
      "Keep source scope unchanged until the current decision queue has been reviewed."
    ];
  }

  if (shortBy > 0) {
    if (topGate) actions.push(shortVolumeActionForGate(topGate.id, shortBy, input.profile));
    if (input.keptForRanking < input.profile.matchSettings.widenIfFewerThan) {
      actions.push("More results option: search more public job boards and company career pages in the saved country/cities before changing the match rules.");
    }
    if (topFilter) {
      actions.push(`More results option: split or tighten the search words because ${topFilter.count} result(s) were removed before CV work.`);
    }
  }

  if (input.discoveredJobs >= Math.max(100, input.configuredDailyTarget * 30) && keptRate < 0.08 && topFilter) {
    actions.push("Keep this run clean: many fetched jobs were weak matches, so tighten the role words before adding broader sources.");
  }

  if (input.keptForRanking >= Math.max(100, input.configuredDailyTarget * 25)) {
    actions.push("Too many jobs reached review; narrow the role words, blocked titles, location, or work mode before increasing automation.");
  }

  if (
    !input.hasApprovedInboxSource &&
    input.profile.applySettings.allowedSourceKinds.includes("email_alert") &&
    (input.discoveredJobs > 0 || input.preparedApplications > 0)
  ) {
    actions.push("After this first run, discover whether the current agent host exposes a ready or connectable email-read capability. If it does, ask whether to search recent job alerts and recruiter emails; use host-owned OAuth only after approval, never request credentials in chat, and continue with public sources if access is unavailable or declined.");
  }

  if (actions.length === 0) {
    actions.push("Keep hard blockers unchanged and review prepared CVs before enabling submit.");
  }

  return uniqueValues(actions).slice(0, 4);
}

function hasApprovedEmailLeadSource(sourceConfig: {
  searches?: unknown[];
  jobBoards?: unknown[];
  communities?: unknown[];
  newsletters?: unknown[];
  loggedInBrowserSources?: unknown[];
} | undefined): boolean {
  if (!sourceConfig) return false;
  return [
    ...(sourceConfig.searches ?? []),
    ...(sourceConfig.jobBoards ?? []),
    ...(sourceConfig.communities ?? []),
    ...(sourceConfig.newsletters ?? []),
    ...(sourceConfig.loggedInBrowserSources ?? [])
  ].some(isEmailLeadSource);
}

function isEmailLeadSource(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const kind = normalizeComparable(String(record.kind ?? ""));
  const provider = normalizeComparable(String(record.provider ?? ""));
  const label = normalizeComparable(String(record.label ?? ""));
  return kind === "email alert" ||
    provider === "user email" ||
    label.includes("inbox job leads") ||
    label.includes("email job leads");
}

function shortVolumeActionForGate(gateId: string, shortBy: number, profile: UserProfile): string {
  switch (gateId) {
    case "seniority":
      return `More results option: include one level lower titles at large companies, but save that as a reusable rule first.`;
    case "experience":
      return "More results option: widen the experience range only if the user changes the saved range.";
    case "work-authorization":
      return "More results option: add another country or remote region only if the user confirms work authorization there.";
    case "work-mode":
      return `More results option: include another work mode only if it is acceptable to the user. Saved modes: ${profile.preferences.acceptableWorkModes.join(", ") || "none"}.`;
    case "employment-type":
      return "More results option: include contract, consulting, or fractional roles only after user approval.";
    case "company-stage":
      return "More results option: include more company stages only after user approval.";
    case "role-family":
      return "More results option: try adjacent role titles only after the user confirms they still match the target work.";
    default:
      return `More results option: review the ${humanizeGate(gateId)} before widening this search.`;
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
    const completenessIssue = cvCompletenessBlockReason(result.markdown, profile);
    if (completenessIssue) {
      skippedReconciliations.push({
        issueMessages: [completenessIssue],
        jobId: rankedJob.job.id,
        status: "blocked"
      });
      continue;
    }
    cvResults.push(result);
    if (cvResults.length >= batchLimit) break;
  }

  return { cvResults, skippedReconciliations };
}

function cvCompletenessBlockReason(markdown: string, profile: UserProfile): string | undefined {
  const baseLength = profile.baseCvText?.trim().length ?? 0;
  if (baseLength < 3000) return undefined;
  const charCount = markdown.trim().length;
  const minimumChars = minimumGeneratedCvChars(profile);
  if (charCount >= minimumChars) return undefined;
  return `Generated CV failed completeness: ${charCount} chars below minimum ${minimumChars}.`;
}

function minimumGeneratedCvChars(profile: UserProfile): number {
  const baseLength = profile.baseCvText?.trim().length ?? 0;
  if (baseLength >= 5000) return Math.min(Math.max(4200, Math.floor(baseLength * 0.55)), 6500);
  if (baseLength >= 3000) return Math.min(Math.max(2200, Math.floor(baseLength * 0.45)), 4200);
  if (baseLength >= 1200) return Math.max(900, Math.floor(baseLength * 0.35));
  if (profile.pastEmployers.length > 0) return 900;
  return 250;
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
  applyRoutes: ApplyRoute[],
  cvVariants: CvVariant[],
  atsDiagnosticReports: AtsDiagnosticReport[],
  reports: ReconciliationReport[],
  applications: ApplicationRecord[],
  jobs: JobRecord[],
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
  const atsDiagnosticFiles = atsDiagnosticReports.map((report): GeneratedFileManifest => ({
    id: `${report.id}-json-file`,
    kind: "ats_diagnostics_json",
    path: `outputs/ats-diagnostics/${report.id}.json`,
    sourceIds: [report.id, report.cvVariantId, report.jobId],
    createdAt
  }));
  const reportFiles = reports.map((report): GeneratedFileManifest => ({
    id: `${report.id}-json-file`,
    kind: "reconciliation_json",
    path: `outputs/reconciliation/${report.id}.json`,
    sourceIds: [report.id, report.cvContentPlanId],
    createdAt
  }));
  const jdFiles = jobs.map((job): GeneratedFileManifest => ({
    id: `${runId}-${artifactFileSlug(job.id)}-job-description-file`,
    kind: "job_description_markdown",
    path: jobDescriptionFilePath(job.id),
    sourceIds: [job.id],
    createdAt
  }));
  const browserPlanFiles = browserPlans.map((plan): GeneratedFileManifest => ({
    id: `${plan.id}-json-file`,
    kind: "browser_plan_json",
    path: `outputs/browser-plans/${plan.id}.json`,
    sourceIds: [plan.id, plan.jobId, ...(plan.cvVariantId ? [plan.cvVariantId] : [])],
    createdAt
  }));
  const applyRouteFiles = applyRoutes.map((route): GeneratedFileManifest => ({
    id: `${route.id}-json-file`,
    kind: "apply_route_json",
    path: `outputs/apply-routes/${route.id}.json`,
    sourceIds: [route.id, route.applicationId, route.jobId, ...(route.artifacts.browserPlanId ? [route.artifacts.browserPlanId] : [])],
    createdAt
  }));
  return [
    ...cvFiles,
    ...cvDocxFiles,
    ...cvHtmlFiles,
    ...atsDiagnosticFiles,
    ...reportFiles,
    ...jdFiles,
    ...browserPlanFiles,
    ...applyRouteFiles,
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
      id: `${runId}-job-decisions-file`,
      kind: "job_decisions_json",
      path: "outputs/runs/latest-job-decisions.json",
      sourceIds: [runId, ...jobs.map((job) => job.id)],
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

function jobDescriptionFilePath(jobId: string): string {
  return `outputs/jds/${artifactFileSlug(jobId)}.md`;
}

function renderJobDescriptionMarkdown(job: JobRecord): string {
  const metadata = [
    ["company", job.company],
    ["title", job.title],
    ["url", job.url],
    ["source", job.source.name],
    ["sourceKind", job.source.kind],
    ["location", job.location],
    ["workMode", job.workMode],
    ["seniority", job.seniority],
    ["employmentType", job.employmentType],
    ["liveState", job.liveState],
    ["postedAt", job.postedAt],
    ["discoveredAt", job.discoveredAt]
  ]
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n");
  const compensation = job.compensation ? formatCompensationForMarkdown(job.compensation) : "";
  const description = job.description.trim() || "No job description text was available from the source.";
  const sourceLine = job.source.url ? `- Source URL: ${job.source.url}` : "";

  return `---\n${metadata}\n---\n\n# ${job.company} - ${job.title}\n\n## Source\n\n- Job URL: ${job.url}\n- Source: ${job.source.name} (${job.source.kind})\n${sourceLine ? `${sourceLine}\n` : ""}${job.location ? `- Location: ${job.location}\n` : ""}${compensation ? `- Compensation: ${compensation}\n` : ""}\n## Job Description\n\n${description}\n`;
}

function formatCompensationForMarkdown(compensation: NonNullable<JobRecord["compensation"]>): string {
  const amount = [compensation.min, compensation.max]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .map((value) => String(value))
    .join(" - ");
  const currency = compensation.currency ? `${compensation.currency} ` : "";
  const period = compensation.period && compensation.period !== "unknown" ? ` / ${compensation.period}` : "";
  return `${currency}${amount || "amount not specified"}${period}`.trim();
}

function artifactFileSlug(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "job";
  const suffix = stableShortHash(value);
  return `${slug.slice(0, 120).replace(/-$/g, "")}-${suffix}`;
}

function stableShortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0").slice(0, 7);
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
  applyRoutes: ApplyRoute[];
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
    const applyRoute = input.applyRoutes.find((item) => item.applicationId === application.id || item.jobId === application.jobId);
    const cvPath = variant ? findGeneratedFilePath(input.files, "cv_markdown", variant.id) : undefined;
    const cvDocxPath = variant ? findGeneratedFilePath(input.files, "cv_docx", variant.id) : undefined;
    const cvHtmlPath = variant ? findGeneratedFilePath(input.files, "cv_html", variant.id) : undefined;
    const jdPath = job ? findGeneratedFilePath(input.files, "job_description_markdown", job.id) : undefined;
    const atsDiagnosticsPath = variant ? findGeneratedFilePath(input.files, "ats_diagnostics_json", variant.id) : undefined;
    const reconciliationPath = report ? findGeneratedFilePath(input.files, "reconciliation_json", report.id) : undefined;
    const browserPlanPath = browserPlan ? findGeneratedFilePath(input.files, "browser_plan_json", browserPlan.id) : undefined;
    const applyRoutePath = applyRoute ? findGeneratedFilePath(input.files, "apply_route_json", applyRoute.id) : undefined;

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
      ...(applyRoutePath ? { applyRoutePath } : {}),
      ...(applyRoute ? { applyRouteStatus: applyRoute.status, applyRouteType: applyRoute.type } : {}),
      ...(browserPlanPath ? { browserPlanPath } : {}),
      ...(application.cvVariantId ? { cvVariantId: application.cvVariantId } : {}),
      ...(cvDocxPath ? { cvDocxPath } : {}),
      ...(cvHtmlPath ? { cvHtmlPath } : {}),
      ...(cvPath ? { cvPath } : {}),
      ...(jdPath ? { jdPath } : {}),
      ...(atsDiagnosticsPath ? { atsDiagnosticsPath } : {}),
      ...(reconciliationPath ? { reconciliationPath } : {}),
      ...(report ? { reconciliationStatus: report.status } : {})
    };
  });
}

function buildProgressJobDecisionItems(
  ranked: RankedJob[],
  skippedReconciliations: SkippedReconciliation[] = [],
  recordedJobDecisions: RecordedJobDecision[] = []
): ProgressJobDecisionItem[] {
  const skippedByJobId = new Map(skippedReconciliations.map((item) => [item.jobId, item]));
  const latestRecordedByJobId = new Map<string, RecordedJobDecision>();
  for (const decision of recordedJobDecisions) latestRecordedByJobId.set(decision.jobId, decision);
  return ranked.map((rankedJob) => {
    const skipped = skippedByJobId.get(rankedJob.job.id);
    const recorded = latestRecordedByJobId.get(rankedJob.job.id);
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
      url: rankedJob.job.url,
      jobDescriptionPath: jobDescriptionFilePath(rankedJob.job.id),
      descriptionExcerpt: createDescriptionExcerpt(rankedJob.job.description),
      workMode: rankedJob.job.workMode,
      discoveredAt: rankedJob.job.discoveredAt,
      liveState: rankedJob.job.liveState,
      decision: rankedJob.decision,
      priority: rankedJob.priority,
      components: rankedJob.components,
      reasons: rankedJob.reasons,
      failedGates,
      nextStep: createJobDecisionNextStep(rankedJob, failedGates, skipped, recorded)
    };
    if (rankedJob.job.location) item.location = rankedJob.job.location;
    if (rankedJob.job.seniority) item.seniority = rankedJob.job.seniority;
    if (rankedJob.job.employmentType) item.employmentType = rankedJob.job.employmentType;
    if (rankedJob.job.compensation) item.compensation = rankedJob.job.compensation;
    if (rankedJob.job.postedAt) item.postedAt = rankedJob.job.postedAt;
    if (recorded) {
      item.recordedDecision = recorded.decision;
      item.recordedReasons = recorded.reasons;
      item.decisionActorKind = recorded.actorKind;
      item.decisionActorName = recorded.actorName;
    }
    if (skipped) {
      item.reconciliationStatus = skipped.status;
      item.skippedReason = skippedReason ?? "CV reconciliation did not pass.";
    }
    return item;
  });
}

function createDescriptionExcerpt(description: string, maxLength = 1800): string {
  const normalized = description.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function createJobDecisionNextStep(
  rankedJob: RankedJob,
  failedGates: string[],
  skipped?: SkippedReconciliation,
  recorded?: RecordedJobDecision
): string {
  if (skipped?.status === "needs_user_confirmation") {
    return "Paused until the user confirms the CV positioning.";
  }
  if (skipped?.issueMessages.some((message) => message.includes("Generated CV failed completeness"))) {
    return "Skipped until the generated CV meets completeness checks.";
  }
  if (skipped) return "Skipped until CV reconciliation passes.";
  if (recorded?.decision === "apply") return "Approved by recorded external judgement and prepared under configured policy.";
  if (recorded?.decision === "review") return "Held for further external-agent or user review.";
  if (recorded?.decision === "watch") return "Kept for a later batch by recorded external judgement.";
  if (recorded?.decision === "skip") return "Skipped by recorded external judgement.";
  if (rankedJob.decision === "apply") return "Ready for application under configured policy.";
  if (rankedJob.decision === "review") return "Review and prepare before submit.";
  if (rankedJob.decision === "watch") return "Keep for later; not strong enough for today's batch.";
  if (failedGates.length > 0) return "Skipped until the blocker is resolved.";
  return "Skipped because the match is too weak for this batch.";
}

function effectiveJobDecision(item: ProgressJobDecisionItem): ApplyDecision {
  return item.recordedDecision ?? item.decision;
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
    mkdir(path.join(outputRoot, "outputs", "apply-routes"), { recursive: true }),
    mkdir(path.join(outputRoot, "outputs", "ats-diagnostics"), { recursive: true }),
    mkdir(path.join(outputRoot, "outputs", "browser-plans"), { recursive: true }),
    mkdir(path.join(outputRoot, "outputs", "cvs"), { recursive: true }),
    mkdir(path.join(outputRoot, "outputs", "dashboard"), { recursive: true }),
    mkdir(path.join(outputRoot, "outputs", "jds"), { recursive: true }),
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
    result.atsDiagnosticReports.map((report) =>
      writeFile(
        path.join(outputRoot, "outputs", "ats-diagnostics", `${report.id}.json`),
        `${JSON.stringify(report, null, 2)}\n`,
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
    result.jobs.map((job) =>
      writeFile(
        path.join(outputRoot, jobDescriptionFilePath(job.id)),
        renderJobDescriptionMarkdown(job),
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
  await Promise.all(
    result.applyRoutes.map((route) =>
      writeFile(
        path.join(outputRoot, "outputs", "apply-routes", `${route.id}.json`),
        `${JSON.stringify(route, null, 2)}\n`,
        "utf8"
      )
    )
  );

  await writeProgressDashboardAndSummary(outputRoot, result);
  await writeFile(
    path.join(outputRoot, "outputs", "runs", "latest-job-decisions.json"),
    `${JSON.stringify({
      runId: result.manifest.id,
      profileId: result.profile.id,
      generatedAt: result.manifest.completedAt,
      queueCount: result.jobDecisions.length,
      decisions: result.jobDecisions
    }, null, 2)}\n`,
    "utf8"
  );
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
    ...(result.manifest.atsDiagnostics ? { atsDiagnostics: result.manifest.atsDiagnostics } : {}),
    ...(result.manifest.cvQuality ? { cvQuality: result.manifest.cvQuality } : {}),
    ...(result.manifest.freshness ? { freshness: result.manifest.freshness } : {}),
    ...(overlay.livePreflight ? { livePreflight: overlay.livePreflight } : {}),
    ...(result.manifest.scanHistory ? { scanHistory: result.manifest.scanHistory } : {}),
    ...(result.manifest.dedupe ? { dedupe: result.manifest.dedupe } : {}),
    ...(result.manifest.safety ? { safety: result.manifest.safety } : {}),
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
  if (result.applications.length < configuredDailyTarget && result.manifest.funnelHealth?.status !== "awaiting_decisions") {
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

function equivalentRecordedJobDecision(left: RecordedJobDecision, right: RecordedJobDecision): boolean {
  return left.jobId === right.jobId &&
    left.decision === right.decision &&
    left.actorKind === right.actorKind &&
    left.actorName === right.actorName &&
    left.backendDecision === right.backendDecision &&
    JSON.stringify(left.backendFailedGates) === JSON.stringify(right.backendFailedGates) &&
    JSON.stringify(left.reasons) === JSON.stringify(right.reasons) &&
    JSON.stringify(left.evidenceRefs) === JSON.stringify(right.evidenceRefs);
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

async function readRecordedJobDecisionsIfExists(filePath: string): Promise<RecordedJobDecision[]> {
  if (!(await fileExists(filePath))) return [];
  const rows = (await readFile(filePath, "utf8")).split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
  return rows.map((row, index) => {
    let value: unknown;
    try {
      value = JSON.parse(row);
    } catch {
      throw new Error(`Invalid JSON in recorded job decisions at line ${index + 1}.`);
    }
    if (!isRecordedJobDecision(value)) {
      throw new Error(`Invalid recorded job decision contract at line ${index + 1}.`);
    }
    return value;
  });
}

function selectApprovedCandidateJobs(ranked: RankedJob[], decisions: RecordedJobDecision[]): RankedJob[] {
  const latestByJobId = new Map<string, RecordedJobDecision>();
  for (const decision of decisions) latestByJobId.set(decision.jobId, decision);
  return ranked.filter((rankedJob) => {
    const recorded = latestByJobId.get(rankedJob.job.id);
    if (!rankedJob.gates.every((gate) => gate.passed)) return false;
    if (recorded) return recorded.decision === "apply";
    return rankedJob.decision === "apply";
  });
}

function resolveDecisionAuthority(input: {
  candidateJobs: RankedJob[];
  rankedJobs: RankedJob[];
  recordedJobDecisions: RecordedJobDecision[];
  requireRecordedJobDecisions: boolean;
}): NonNullable<RunManifest["decisionAuthority"]> {
  if (!input.requireRecordedJobDecisions) return "backend_suggestion_test";

  const latestByJobId = new Map<string, RecordedJobDecision>();
  for (const decision of input.recordedJobDecisions) latestByJobId.set(decision.jobId, decision);
  const preparedFromSystem = input.candidateJobs.some((item) => item.decision === "apply");
  const preparedFromRecorded = input.candidateJobs.some((item) =>
    latestByJobId.get(item.job.id)?.decision === "apply" && item.decision !== "apply"
  );

  if (preparedFromSystem && preparedFromRecorded) return "hybrid_system_external";
  if (preparedFromRecorded) return "recorded_external";
  if (preparedFromSystem) return "system_clear";

  const unresolvedAmbiguity = input.rankedJobs.some((item) =>
    item.decision === "review" &&
    item.gates.every((gate) => gate.passed) &&
    !latestByJobId.has(item.job.id)
  );
  return unresolvedAmbiguity ? "awaiting_external" : "system_clear";
}

function isRecordedJobDecision(value: unknown): value is RecordedJobDecision {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<RecordedJobDecision>;
  return typeof item.id === "string" &&
    typeof item.jobId === "string" &&
    ["apply", "review", "watch", "skip"].includes(item.decision ?? "") &&
    Array.isArray(item.reasons) && item.reasons.every((reason) => typeof reason === "string") &&
    Array.isArray(item.evidenceRefs) && item.evidenceRefs.every((ref) => typeof ref === "string") &&
    ["agent", "user"].includes(item.actorKind ?? "") &&
    typeof item.actorName === "string" &&
    typeof item.decidedAt === "string" &&
    ["apply", "review", "watch", "skip"].includes(item.backendDecision ?? "") &&
    Array.isArray(item.backendFailedGates) && item.backendFailedGates.every((gate) => typeof gate === "string");
}

function createOutcomeEventId(applicationId: string, type: OutcomeEvent["type"], occurredAt: string): string {
  return [
    "outcome",
    applicationId,
    type,
    slugPart(occurredAt)
  ].join("-");
}

function createJobDecisionId(jobId: string, decision: ApplyDecision, actorName: string, decidedAt: string): string {
  return ["job-decision", jobId, decision, actorName, decidedAt].map(slugPart).filter(Boolean).join("-");
}

function isProgressJobDecisionItem(value: unknown): value is ProgressJobDecisionItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ProgressJobDecisionItem>;
  return typeof item.jobId === "string" &&
    typeof item.company === "string" &&
    typeof item.title === "string" &&
    typeof item.sourceName === "string" &&
    ["apply", "review", "watch", "skip"].includes(item.decision ?? "") &&
    Array.isArray(item.reasons) &&
    item.reasons.every((reason) => typeof reason === "string") &&
    Array.isArray(item.failedGates) &&
    item.failedGates.every((gate) => typeof gate === "string") &&
    typeof item.nextStep === "string";
}

function parseJobDecisionQueueArtifact(value: unknown): ProgressJobDecisionItem[] {
  const decisions = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { decisions?: unknown }).decisions)
      ? (value as { decisions: unknown[] }).decisions
      : undefined;
  if (!decisions || !decisions.every(isProgressJobDecisionItem)) {
    throw new Error("The ranked job decision queue is invalid; expected the generated queue artifact with a decisions array.");
  }
  return decisions;
}

function defaultTuningSignalStatus(options: RecordTuningSignalOptions): TuningSignalStatus {
  if (options.origin === "user_feedback" && options.approvedByUser !== false) return "approved";
  return "proposed";
}

function createTuningSignalId(
  origin: TuningSignalOrigin,
  target: TuningSignalTarget,
  value: string,
  createdAt: string
): string {
  return [
    "tuning",
    origin,
    target,
    slugPart(value),
    slugPart(createdAt)
  ].filter(Boolean).join("-");
}

function slugPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function createApplicationId(runId: string, jobId: string, fallbackIndex: number): string {
  const stableJobPart = slugPart(jobId.trim());
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
