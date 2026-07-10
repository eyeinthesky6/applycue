import type {
  ApplicationRecord,
  ApplicationStatus,
  JobRecord,
  JobSource,
  OutcomeEvent,
  PendingQuestion,
  ProgressApplicationItem,
  ProgressJobDecisionItem,
  ProgressSnapshot,
  ProgressSourceOutcomeSummary,
  ProgressSourceScorecardSummary,
  ScanHistoryEntry
} from "@applycue/core";

export function createApplicationRecord(input: {
  id: string;
  jobId: string;
  cvVariantId?: string;
  status?: ApplicationStatus;
  note?: string;
}): ApplicationRecord {
  const now = new Date().toISOString();
  const record: ApplicationRecord = {
    id: input.id,
    jobId: input.jobId,
    status: input.status ?? "found",
    notes: input.note ? [input.note] : [],
    createdAt: now,
    updatedAt: now
  };

  if (input.cvVariantId) record.cvVariantId = input.cvVariantId;

  return record;
}

export function transitionApplication(
  record: ApplicationRecord,
  status: ApplicationStatus,
  note?: string
): ApplicationRecord {
  return {
    ...record,
    status,
    notes: note ? [...record.notes, note] : record.notes,
    updatedAt: new Date().toISOString()
  };
}

const APPLICATION_STATUSES: ApplicationStatus[] = [
  "found",
  "shortlisted",
  "cv_ready",
  "prepared",
  "submitted",
  "confirmation_received",
  "reply_received",
  "interview",
  "offer",
  "accepted",
  "rejected",
  "archived"
];

const OUTCOME_EVENT_TYPES = new Set<OutcomeEvent["type"]>([
  "submitted",
  "confirmation",
  "reply",
  "interview",
  "offer",
  "rejection",
  "withdrawn",
  "user_feedback"
]);

function countByStatus<TStatus extends string>(statuses: TStatus[], values: TStatus[]): Record<TStatus, number> {
  const counts = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<TStatus, number>;
  for (const value of values) counts[value] += 1;
  return counts;
}

export function parseOutcomeEventsJsonLines(content: string): OutcomeEvent[] {
  const events: OutcomeEvent[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (isOutcomeEvent(parsed)) events.push(parsed);
    } catch {
      // Ignore malformed rows. The agent can repair the source event file without breaking a run.
    }
  }
  return events;
}

export function buildSourceOutcomeSummary(input: {
  applications: ApplicationRecord[];
  eventPath?: string;
  jobs: JobRecord[];
  outcomeEvents?: OutcomeEvent[];
  scanHistoryEntries?: ScanHistoryEntry[];
}): ProgressSourceOutcomeSummary {
  const jobsById = new Map(input.jobs.map((job) => [job.id, job]));
  const rollups = new Map<string, ApplicationOutcomeRollup>();
  const preparedApplicationIds = new Set<string>();

  for (const entry of input.scanHistoryEntries ?? []) {
    if (!entry.applicationId) continue;
    const source = sourceFromScanHistory(entry);
    ensureApplicationRollup(rollups, entry.applicationId, source);
    if (entry.status === "prepared") preparedApplicationIds.add(entry.applicationId);
  }

  for (const application of input.applications) {
    const job = jobsById.get(application.jobId);
    const source = job ? sourceFromJob(job) : rollups.get(application.id)?.source ?? unknownSource();
    const rollup = ensureApplicationRollup(rollups, application.id, source);
    const stage = stageFromApplicationStatus(application.status);
    if (stage >= 1) preparedApplicationIds.add(application.id);
    applyStage(rollup, stage, stage >= 2 ? application.updatedAt : undefined);
    if (application.status === "rejected" || application.status === "archived") rollup.rejected = true;
  }

  for (const event of input.outcomeEvents ?? []) {
    const rollup = ensureApplicationRollup(
      rollups,
      event.applicationId,
      rollups.get(event.applicationId)?.source ?? unknownSource()
    );
    applyStage(rollup, stageFromOutcomeEvent(event.type), event.occurredAt);
    if (event.type === "rejection" || event.type === "withdrawn") rollup.rejected = true;
  }

  const buckets = new Map<string, SourceOutcomeBucket>();
  for (const [applicationId, rollup] of rollups) {
    const bucket = ensureSourceOutcomeBucket(buckets, rollup.source);
    bucket.trackedApplications += 1;
    if (preparedApplicationIds.has(applicationId) || rollup.stage >= 1) bucket.preparedApplications += 1;
    if (rollup.stage >= 2) bucket.submitted += 1;
    if (rollup.stage >= 3) bucket.replies += 1;
    if (rollup.stage >= 4) bucket.interviews += 1;
    if (rollup.stage >= 5) bucket.offers += 1;
    if (rollup.rejected) bucket.rejections += 1;
    if (rollup.stage >= 3) bucket.positiveOutcomes += 1;
    if (rollup.lastOutcomeAt && (!bucket.lastOutcomeAt || rollup.lastOutcomeAt > bucket.lastOutcomeAt)) {
      bucket.lastOutcomeAt = rollup.lastOutcomeAt;
    }
  }

  const sources = [...buckets.values()]
    .map((bucket) => toSourceOutcomeItem(bucket))
    .sort(compareSourceOutcomeItems);
  const summary: ProgressSourceOutcomeSummary = {
    trackedApplications: rollups.size,
    outcomeEvents: input.outcomeEvents?.length ?? 0,
    preparedApplications: sumSourceOutcomeField(sources, "preparedApplications"),
    submitted: sumSourceOutcomeField(sources, "submitted"),
    replies: sumSourceOutcomeField(sources, "replies"),
    interviews: sumSourceOutcomeField(sources, "interviews"),
    offers: sumSourceOutcomeField(sources, "offers"),
    rejections: sumSourceOutcomeField(sources, "rejections"),
    positiveOutcomes: sumSourceOutcomeField(sources, "positiveOutcomes"),
    sources
  };
  if (input.eventPath) summary.eventPath = input.eventPath;
  return summary;
}

export function buildSourceScorecardSummary(input: {
  applications: ApplicationRecord[];
  fetchedJobs: JobRecord[];
  filteredJobs?: JobRecord[];
  jobs: JobRecord[];
  keptJobs: JobRecord[];
  outcomeEvents?: OutcomeEvent[];
  scanHistoryEntries?: ScanHistoryEntry[];
}): ProgressSourceScorecardSummary {
  const buckets = new Map<string, SourceScorecardBucket>();
  for (const job of input.fetchedJobs) ensureSourceScorecardBucket(buckets, sourceFromJob(job)).fetchedJobs += 1;
  for (const job of input.keptJobs) ensureSourceScorecardBucket(buckets, sourceFromJob(job)).keptJobs += 1;
  for (const job of input.filteredJobs ?? []) {
    ensureSourceScorecardBucket(buckets, sourceFromJob(job)).filteredJobs += 1;
  }

  const sourceOutcomes = buildSourceOutcomeSummary({
    applications: input.applications,
    jobs: input.jobs,
    outcomeEvents: input.outcomeEvents ?? [],
    ...(input.scanHistoryEntries ? { scanHistoryEntries: input.scanHistoryEntries } : {})
  });
  for (const source of sourceOutcomes.sources) {
    const bucket = ensureSourceScorecardBucket(buckets, source);
    bucket.preparedApplications = source.preparedApplications;
    bucket.submitted = source.submitted;
    bucket.replies = source.replies;
    bucket.interviews = source.interviews;
    bucket.offers = source.offers;
    bucket.rejections = source.rejections;
    bucket.positiveOutcomes = source.positiveOutcomes;
    if (source.lastOutcomeAt) bucket.lastOutcomeAt = source.lastOutcomeAt;
  }

  const sources = [...buckets.values()]
    .map(toSourceScorecardItem)
    .sort(compareSourceScorecardItems);

  return {
    fetchedJobs: sumSourceScorecardField(sources, "fetchedJobs"),
    keptJobs: sumSourceScorecardField(sources, "keptJobs"),
    filteredJobs: sumSourceScorecardField(sources, "filteredJobs"),
    preparedApplications: sumSourceScorecardField(sources, "preparedApplications"),
    submitted: sumSourceScorecardField(sources, "submitted"),
    replies: sumSourceScorecardField(sources, "replies"),
    interviews: sumSourceScorecardField(sources, "interviews"),
    offers: sumSourceScorecardField(sources, "offers"),
    rejections: sumSourceScorecardField(sources, "rejections"),
    positiveOutcomes: sumSourceScorecardField(sources, "positiveOutcomes"),
    sources
  };
}

interface SourceIdentity {
  sourceId: string;
  sourceName: string;
  sourceKind: JobSource["kind"];
}

interface ApplicationOutcomeRollup {
  source: SourceIdentity;
  stage: number;
  rejected: boolean;
  lastOutcomeAt?: string;
}

interface SourceOutcomeBucket extends SourceIdentity {
  trackedApplications: number;
  preparedApplications: number;
  submitted: number;
  replies: number;
  interviews: number;
  offers: number;
  rejections: number;
  positiveOutcomes: number;
  lastOutcomeAt?: string;
}

interface SourceScorecardBucket extends SourceIdentity {
  fetchedJobs: number;
  keptJobs: number;
  filteredJobs: number;
  preparedApplications: number;
  submitted: number;
  replies: number;
  interviews: number;
  offers: number;
  rejections: number;
  positiveOutcomes: number;
  lastOutcomeAt?: string;
}

function isOutcomeEvent(value: unknown): value is OutcomeEvent {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" &&
    typeof record.applicationId === "string" &&
    typeof record.type === "string" &&
    OUTCOME_EVENT_TYPES.has(record.type as OutcomeEvent["type"]) &&
    typeof record.note === "string" &&
    typeof record.occurredAt === "string";
}

function ensureApplicationRollup(
  rollups: Map<string, ApplicationOutcomeRollup>,
  applicationId: string,
  source: SourceIdentity
): ApplicationOutcomeRollup {
  const existing = rollups.get(applicationId);
  if (existing) {
    if (existing.source.sourceKind === "unknown" && source.sourceKind !== "unknown") existing.source = source;
    return existing;
  }
  const rollup: ApplicationOutcomeRollup = {
    source,
    stage: 0,
    rejected: false
  };
  rollups.set(applicationId, rollup);
  return rollup;
}

function ensureSourceOutcomeBucket(
  buckets: Map<string, SourceOutcomeBucket>,
  source: SourceIdentity
): SourceOutcomeBucket {
  const key = `${source.sourceKind}:${source.sourceId}`;
  const existing = buckets.get(key);
  if (existing) return existing;
  const bucket: SourceOutcomeBucket = {
    ...source,
    trackedApplications: 0,
    preparedApplications: 0,
    submitted: 0,
    replies: 0,
    interviews: 0,
    offers: 0,
    rejections: 0,
    positiveOutcomes: 0
  };
  buckets.set(key, bucket);
  return bucket;
}

function ensureSourceScorecardBucket(
  buckets: Map<string, SourceScorecardBucket>,
  source: SourceIdentity
): SourceScorecardBucket {
  const key = sourceIdentityKey(source);
  const existing = buckets.get(key);
  if (existing) return existing;
  const bucket: SourceScorecardBucket = {
    ...source,
    fetchedJobs: 0,
    keptJobs: 0,
    filteredJobs: 0,
    preparedApplications: 0,
    submitted: 0,
    replies: 0,
    interviews: 0,
    offers: 0,
    rejections: 0,
    positiveOutcomes: 0
  };
  buckets.set(key, bucket);
  return bucket;
}

function sourceFromJob(job: JobRecord): SourceIdentity {
  return {
    sourceId: job.source.id,
    sourceName: job.source.name,
    sourceKind: job.source.kind
  };
}

function sourceFromScanHistory(entry: ScanHistoryEntry): SourceIdentity {
  return {
    sourceId: entry.sourceId,
    sourceName: entry.sourceName,
    sourceKind: entry.sourceKind
  };
}

function unknownSource(): SourceIdentity {
  return {
    sourceId: "unknown-source",
    sourceName: "Unknown source",
    sourceKind: "unknown"
  };
}

function applyStage(rollup: ApplicationOutcomeRollup, stage: number, occurredAt?: string): void {
  if (stage > rollup.stage) rollup.stage = stage;
  if (occurredAt && (!rollup.lastOutcomeAt || occurredAt > rollup.lastOutcomeAt)) {
    rollup.lastOutcomeAt = occurredAt;
  }
}

function stageFromApplicationStatus(status: ApplicationStatus): number {
  if (status === "prepared") return 1;
  if (status === "submitted" || status === "confirmation_received" || status === "rejected" || status === "archived") return 2;
  if (status === "reply_received") return 3;
  if (status === "interview") return 4;
  if (status === "offer" || status === "accepted") return 5;
  return 0;
}

function stageFromOutcomeEvent(type: OutcomeEvent["type"]): number {
  if (type === "submitted" || type === "confirmation" || type === "rejection" || type === "withdrawn") return 2;
  if (type === "reply") return 3;
  if (type === "interview") return 4;
  if (type === "offer") return 5;
  return 0;
}

function toSourceOutcomeItem(bucket: SourceOutcomeBucket): ProgressSourceOutcomeSummary["sources"][number] {
  const item: ProgressSourceOutcomeSummary["sources"][number] = {
    sourceId: bucket.sourceId,
    sourceName: bucket.sourceName,
    sourceKind: bucket.sourceKind,
    trackedApplications: bucket.trackedApplications,
    preparedApplications: bucket.preparedApplications,
    submitted: bucket.submitted,
    replies: bucket.replies,
    interviews: bucket.interviews,
    offers: bucket.offers,
    rejections: bucket.rejections,
    positiveOutcomes: bucket.positiveOutcomes
  };
  if (bucket.lastOutcomeAt) item.lastOutcomeAt = bucket.lastOutcomeAt;
  return item;
}

function toSourceScorecardItem(bucket: SourceScorecardBucket): ProgressSourceScorecardSummary["sources"][number] {
  const item: ProgressSourceScorecardSummary["sources"][number] = {
    sourceId: bucket.sourceId,
    sourceName: bucket.sourceName,
    sourceKind: bucket.sourceKind,
    fetchedJobs: bucket.fetchedJobs,
    keptJobs: bucket.keptJobs,
    filteredJobs: bucket.filteredJobs,
    preparedApplications: bucket.preparedApplications,
    submitted: bucket.submitted,
    replies: bucket.replies,
    interviews: bucket.interviews,
    offers: bucket.offers,
    rejections: bucket.rejections,
    positiveOutcomes: bucket.positiveOutcomes,
    precision: bucket.fetchedJobs > 0 ? roundRatio(bucket.keptJobs / bucket.fetchedJobs) : 0,
    yield: bucket.fetchedJobs > 0 ? roundRatio(bucket.preparedApplications / bucket.fetchedJobs) : 0
  };
  if (bucket.lastOutcomeAt) item.lastOutcomeAt = bucket.lastOutcomeAt;
  return item;
}

function compareSourceOutcomeItems(
  left: ProgressSourceOutcomeSummary["sources"][number],
  right: ProgressSourceOutcomeSummary["sources"][number]
): number {
  return right.positiveOutcomes - left.positiveOutcomes ||
    right.offers - left.offers ||
    right.interviews - left.interviews ||
    right.replies - left.replies ||
    right.submitted - left.submitted ||
    right.preparedApplications - left.preparedApplications ||
    left.sourceName.localeCompare(right.sourceName);
}

function compareSourceScorecardItems(
  left: ProgressSourceScorecardSummary["sources"][number],
  right: ProgressSourceScorecardSummary["sources"][number]
): number {
  return right.positiveOutcomes - left.positiveOutcomes ||
    right.offers - left.offers ||
    right.interviews - left.interviews ||
    right.replies - left.replies ||
    right.preparedApplications - left.preparedApplications ||
    right.yield - left.yield ||
    right.precision - left.precision ||
    right.fetchedJobs - left.fetchedJobs ||
    left.sourceName.localeCompare(right.sourceName);
}

function sourceIdentityKey(source: SourceIdentity): string {
  return `${source.sourceKind}:${source.sourceId}`;
}

function roundRatio(value: number): number {
  return Math.round(value * 100) / 100;
}

function sumSourceOutcomeField(
  sources: ProgressSourceOutcomeSummary["sources"],
  field: "preparedApplications" | "submitted" | "replies" | "interviews" | "offers" | "rejections" | "positiveOutcomes"
): number {
  return sources.reduce((sum, source) => sum + source[field], 0);
}

function sumSourceScorecardField(
  sources: ProgressSourceScorecardSummary["sources"],
  field:
    | "fetchedJobs"
    | "keptJobs"
    | "filteredJobs"
    | "preparedApplications"
    | "submitted"
    | "replies"
    | "interviews"
    | "offers"
    | "rejections"
    | "positiveOutcomes"
): number {
  return sources.reduce((sum, source) => sum + source[field], 0);
}

export function buildProgressSnapshot(input: {
  id: string;
  periodStart: string;
  periodEnd: string;
  applications: ApplicationRecord[];
  items?: ProgressApplicationItem[];
  pendingQuestions?: number;
  nextActions?: string[];
  notes?: string[];
  outputRoot?: string;
  profileId?: string;
  runId?: string;
  generatedAt?: string;
  atsDiagnostics?: ProgressSnapshot["atsDiagnostics"];
  cvQuality?: ProgressSnapshot["cvQuality"];
  jobDecisions?: ProgressJobDecisionItem[];
  livePreflight?: ProgressSnapshot["livePreflight"];
  pendingQuestionItems?: PendingQuestion[];
  freshness?: ProgressSnapshot["freshness"];
  scanHistory?: ProgressSnapshot["scanHistory"];
  dedupe?: ProgressSnapshot["dedupe"];
  safety?: ProgressSnapshot["safety"];
  sourceScorecards?: ProgressSnapshot["sourceScorecards"];
  sourceOutcomes?: ProgressSnapshot["sourceOutcomes"];
  sourceQuality?: ProgressSnapshot["sourceQuality"];
  funnelHealth?: ProgressSnapshot["funnelHealth"];
}): ProgressSnapshot {
  const pendingQuestionItems = input.pendingQuestionItems ?? [];
  const snapshot: ProgressSnapshot = {
    id: input.id,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    applications: countByStatus(
      APPLICATION_STATUSES,
      input.applications.map((application) => application.status)
    ),
    items: input.items ?? [],
    pendingQuestions: input.pendingQuestions ?? pendingQuestionItems.length,
    nextActions: input.nextActions ?? [],
    notes: input.notes ?? [],
    ...(input.atsDiagnostics ? { atsDiagnostics: input.atsDiagnostics } : {}),
    ...(input.cvQuality ? { cvQuality: input.cvQuality } : {}),
    jobDecisions: input.jobDecisions ?? [],
    ...(input.livePreflight ? { livePreflight: input.livePreflight } : {}),
    ...(pendingQuestionItems.length > 0 ? { pendingQuestionItems } : {}),
    ...(input.freshness ? { freshness: input.freshness } : {}),
    ...(input.scanHistory ? { scanHistory: input.scanHistory } : {}),
    ...(input.dedupe ? { dedupe: input.dedupe } : {}),
    ...(input.safety ? { safety: input.safety } : {}),
    ...(input.sourceScorecards ? { sourceScorecards: input.sourceScorecards } : {}),
    ...(input.sourceOutcomes ? { sourceOutcomes: input.sourceOutcomes } : {}),
    ...(input.sourceQuality ? { sourceQuality: input.sourceQuality } : {}),
    ...(input.funnelHealth ? { funnelHealth: input.funnelHealth } : {})
  };

  if (input.outputRoot) snapshot.outputRoot = input.outputRoot;
  if (input.profileId) snapshot.profileId = input.profileId;
  if (input.runId) snapshot.runId = input.runId;

  return snapshot;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderMeta(snapshot: ProgressSnapshot): string {
  const rows: Array<[string, string] | undefined> = [
    snapshot.profileId ? ["Profile", snapshot.profileId] : undefined,
    snapshot.runId ? ["Run", snapshot.runId] : undefined,
    snapshot.outputRoot ? ["Output root", snapshot.outputRoot] : undefined
  ];
  const presentRows = rows.filter((row): row is [string, string] => Boolean(row));
  if (presentRows.length === 0) return "";
  return `<dl class="meta-grid">${presentRows
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join("")}</dl>`;
}

function renderStatusCards(snapshot: ProgressSnapshot): string {
  const total = Object.values(snapshot.applications).reduce((sum, count) => sum + Number(count), 0);
  const statusCards: Array<{ label: string; value: number; tone: string; helper: string }> = [
    {
      label: "Prepared",
      value: snapshot.applications.prepared,
      tone: "ready",
      helper: "CV and browser plan ready"
    },
    {
      label: "Submitted",
      value: snapshot.applications.submitted + snapshot.applications.confirmation_received,
      tone: "sent",
      helper: "Sent or confirmed"
    },
    {
      label: "Replies",
      value: snapshot.applications.reply_received,
      tone: "reply",
      helper: "Needs response handling"
    },
    {
      label: "Interviews",
      value: snapshot.applications.interview,
      tone: "interview",
      helper: "Prep and schedule"
    },
    {
      label: "Offers",
      value: snapshot.applications.offer + snapshot.applications.accepted,
      tone: "offer",
      helper: "Compare and negotiate"
    },
    {
      label: "Tracked",
      value: total,
      tone: "neutral",
      helper: "All application records"
    }
  ];

  return `<div class="stat-grid">${statusCards.map(renderStatCard).join("")}</div>`;
}

function renderSourceQuality(snapshot: ProgressSnapshot): string {
  if (!snapshot.sourceQuality) return "";
  const sourceQuality = snapshot.sourceQuality;
  const keptPercent = sourceQuality.inputJobs > 0
    ? Math.round((sourceQuality.keptJobs / sourceQuality.inputJobs) * 100)
    : 0;
  const cards = [
    {
      label: "Discovered",
      value: sourceQuality.inputJobs,
      tone: "neutral",
      helper: "Jobs before source filters"
    },
    {
      label: "Kept",
      value: sourceQuality.keptJobs,
      tone: "ready",
      helper: `${keptPercent}% moved to ranking`
    },
    {
      label: "Filtered",
      value: sourceQuality.filteredJobs,
      tone: sourceQuality.filteredJobs > 0 ? "watch" : "neutral",
      helper: "Removed before CV work"
    }
  ];
  return `<section>
      <div class="section-head">
        <h2>Source Quality</h2>
        <p>How many jobs survived source filters before ranking.</p>
      </div>
      <div class="source-quality-layout">
        ${cards.map(renderStatCard).join("")}
        <div class="reason-panel">
          <h3>Filtered By</h3>
          <div class="chip-row">
            <span class="chip ${sourceQuality.byReason.title > 0 ? "chip-warn" : "chip-ok"}">${sourceQuality.byReason.title} title</span>
            <span class="chip ${sourceQuality.byReason.industry > 0 ? "chip-warn" : "chip-ok"}">${sourceQuality.byReason.industry} industry</span>
            <span class="chip ${sourceQuality.byReason.location > 0 ? "chip-warn" : "chip-ok"}">${sourceQuality.byReason.location} location</span>
            <span class="chip ${sourceQuality.byReason.content > 0 ? "chip-warn" : "chip-ok"}">${sourceQuality.byReason.content} content</span>
          </div>
        </div>
      </div>
  </section>`;
}

function renderFreshness(snapshot: ProgressSnapshot): string {
  if (!snapshot.freshness) return "";
  const freshness = snapshot.freshness;
  const cards = [
    {
      label: "Checked",
      value: freshness.inputJobs,
      tone: "neutral",
      helper: "After source quality"
    },
    {
      label: "Kept",
      value: freshness.keptJobs,
      tone: "ready",
      helper: freshness.includeOlderPosts ? "Older known posts included" : `${freshness.windowDays}-day window`
    },
    {
      label: "Older Held",
      value: freshness.filteredOldJobs,
      tone: freshness.filteredOldJobs > 0 ? "watch" : "neutral",
      helper: "Known older posts"
    },
    {
      label: "Unknown Date",
      value: freshness.unknownPostDateJobs,
      tone: freshness.unknownPostDateJobs > 0 ? "watch" : "neutral",
      helper: freshness.includeUnknownPostDates ? "Eligible, ranked lower" : "Not eligible"
    }
  ];
  return `<section>
      <div class="section-head">
        <h2>Freshness</h2>
        <p>Latest known posts first. Unknown post dates are not treated as old.</p>
      </div>
      <div class="stat-grid">${cards.map(renderStatCard).join("")}</div>
  </section>`;
}

function renderDedupe(snapshot: ProgressSnapshot): string {
  if (!snapshot.dedupe) return "";
  const dedupe = snapshot.dedupe;
  const cards = [
    {
      label: "Checked",
      value: dedupe.inputJobs,
      tone: "neutral",
      helper: "After source filters"
    },
    {
      label: "Duplicates blocked",
      value: dedupe.blockedDuplicates,
      tone: dedupe.blockedDuplicates > 0 ? "watch" : "neutral",
      helper: "Same job, cross-post, or repost"
    },
    {
      label: "Repeats avoided",
      value: dedupe.alreadyHandledRepeats,
      tone: dedupe.alreadyHandledRepeats > 0 ? "watch" : "neutral",
      helper: "Already prepared earlier"
    }
  ];
  return `<section>
      <div class="section-head">
        <h2>Duplicates Blocked</h2>
        <p>Cross-posts and already handled roles kept out of the application queue.</p>
      </div>
      <div class="source-quality-layout">
        ${cards.map(renderStatCard).join("")}
        <div class="reason-panel">
          <h3>Blocked By</h3>
          <div class="chip-row">
            <span class="chip ${dedupe.sameUrl > 0 ? "chip-warn" : "chip-ok"}">${dedupe.sameUrl} same URL</span>
            <span class="chip ${dedupe.sameCompanySimilarRole > 0 ? "chip-warn" : "chip-ok"}">${dedupe.sameCompanySimilarRole} company + role</span>
            <span class="chip ${dedupe.alreadyHandledRepeats > 0 ? "chip-warn" : "chip-ok"}">${dedupe.alreadyHandledRepeats} already handled</span>
            <span class="chip chip-ok">${dedupe.keptJobs} kept</span>
          </div>
        </div>
      </div>
  </section>`;
}

function renderSafety(snapshot: ProgressSnapshot): string {
  if (!snapshot.safety) return "";
  const safety = snapshot.safety;
  const cards = [
    {
      label: "Checked",
      value: safety.checkedJobs,
      tone: "neutral",
      helper: "Ranked jobs"
    },
    {
      label: "Safety blocks",
      value: safety.totalSafetyBlocks,
      tone: safety.totalSafetyBlocks > 0 ? "watch" : "neutral",
      helper: "Fraud or blocked portal"
    },
    {
      label: "Fraud signals",
      value: safety.fraudSignalBlocks,
      tone: safety.fraudSignalBlocks > 0 ? "watch" : "neutral",
      helper: "Scam-like terms"
    }
  ];
  const examples = safety.examples.length > 0
    ? `<div class="signal-list">${safety.examples.slice(0, 5).map((example) => `<div>${escapeHtml(example)}</div>`).join("")}</div>`
    : `<p class="empty-state">No scam or blocked-portal jobs reached ranking.</p>`;
  return `<section>
      <div class="section-head">
        <h2>Safety Blocks</h2>
        <p>Risky jobs stopped before CV or application work.</p>
      </div>
      <div class="source-quality-layout">
        ${cards.map(renderStatCard).join("")}
        <div class="reason-panel">
          <h3>Blocked By</h3>
          <div class="chip-row">
            <span class="chip ${safety.fraudSignalBlocks > 0 ? "chip-warn" : "chip-ok"}">${safety.fraudSignalBlocks} fraud signal</span>
            <span class="chip ${safety.blockedPortalBlocks > 0 ? "chip-warn" : "chip-ok"}">${safety.blockedPortalBlocks} blocked portal</span>
            <span class="chip ${safety.portalPolicyBlocks > 0 ? "chip-warn" : "chip-ok"}">${safety.portalPolicyBlocks} portal policy</span>
          </div>
          ${examples}
        </div>
      </div>
  </section>`;
}

function renderFunnelHealth(snapshot: ProgressSnapshot): string {
  if (!snapshot.funnelHealth) return "";
  const health = snapshot.funnelHealth;
  const cards = [
    {
      label: "Target",
      value: health.configuredDailyTarget,
      tone: "neutral",
      helper: "Applications per day"
    },
    {
      label: "Prepared",
      value: health.preparedApplications,
      tone: health.preparedApplications >= health.configuredDailyTarget ? "ready" : "watch",
      helper: health.message
    },
    {
      label: "Kept",
      value: health.keptForRanking,
      tone: health.status === "high_volume" ? "watch" : "neutral",
      helper: `${health.discoveredJobs} discovered`
    }
  ];
  const filterItems = health.dominantFilters.length > 0
    ? health.dominantFilters
        .map((item) =>
          `<li>${escapeHtml(item.label)}: ${item.count}${item.examples[0] ? ` <small>${escapeHtml(item.examples[0])}</small>` : ""}</li>`
        )
        .join("")
    : "<li>No dominant source filter.</li>";
  const gateItems = health.dominantGateBlocks.length > 0
    ? health.dominantGateBlocks
        .map((item) => `<li>${escapeHtml(item.label)}: ${item.count}${item.examples[0] ? ` <small>${escapeHtml(item.examples[0])}</small>` : ""}</li>`)
        .join("")
    : "<li>No dominant preference blocker.</li>";
  const actionItems = health.suggestedActions.length > 0
    ? health.suggestedActions.map((action) => `<li>${escapeHtml(action)}</li>`).join("")
    : "<li>No funnel guidance generated.</li>";

  return `<section>
      <div class="section-head">
        <h2>Funnel Health</h2>
        <p>${escapeHtml(health.message)}</p>
      </div>
      <div class="source-quality-layout">
        ${cards.map(renderStatCard).join("")}
        <div class="reason-panel">
          <h3>Dominant Filters</h3>
          <ul>${filterItems}</ul>
        </div>
        <div class="reason-panel">
          <h3>Dominant Preference Gates</h3>
          <ul>${gateItems}</ul>
        </div>
        <div class="reason-panel">
          <h3>If You Want More Results</h3>
          <ul>${actionItems}</ul>
        </div>
      </div>
  </section>`;
}

function renderSourceScorecards(snapshot: ProgressSnapshot): string {
  if (!snapshot.sourceScorecards) return "";
  const scorecards = snapshot.sourceScorecards;
  const cards = [
    {
      label: "Fetched",
      value: scorecards.fetchedJobs,
      tone: "neutral",
      helper: "Jobs gathered by source"
    },
    {
      label: "Prepared",
      value: scorecards.preparedApplications,
      tone: scorecards.preparedApplications > 0 ? "ready" : "neutral",
      helper: "CV work created"
    },
    {
      label: "Positive",
      value: scorecards.positiveOutcomes,
      tone: scorecards.positiveOutcomes > 0 ? "ready" : "neutral",
      helper: "Replies, interviews, or offers"
    }
  ];

  return `<section>
      <div class="section-head">
        <h2>Source Scorecards</h2>
        <p>Which sources are worth spending future search effort on.</p>
      </div>
      <div class="source-quality-layout">
        ${cards.map(renderStatCard).join("")}
        <div class="reason-panel">
          <h3>Top Sources</h3>
          ${renderTopSourceScorecards(scorecards.sources)}
        </div>
      </div>
    </section>`;
}

function renderTopSourceScorecards(sources: ProgressSourceScorecardSummary["sources"]): string {
  if (sources.length === 0) return `<p class="empty-state">No source scorecard data yet.</p>`;
  return `<div class="signal-list">${sources
    .slice(0, 5)
    .map((source) =>
      `<div>${escapeHtml(source.sourceName)}: ${source.keptJobs}/${source.fetchedJobs} kept, ${source.preparedApplications} prepared, ${formatPercent(source.precision)} kept rate, ${source.positiveOutcomes} positive</div>`
    )
    .join("")}</div>`;
}

function renderPendingQuestions(snapshot: ProgressSnapshot): string {
  const questions = snapshot.pendingQuestionItems ?? [];
  if (questions.length === 0) return "";
  return `<section>
      <div class="section-head">
        <h2>Pending Questions</h2>
        <p>Reusable choices the agent should ask before changing saved preferences.</p>
      </div>
      <div class="signal-list">${questions
        .slice(0, 5)
        .map((question) =>
          `<div><strong>${escapeHtml(question.question)}</strong><br><span class="muted">${escapeHtml(question.reason)}</span></div>`
        )
        .join("")}</div>
    </section>`;
}

function renderCvQuality(snapshot: ProgressSnapshot): string {
  if (!snapshot.cvQuality) return "";
  const cvQuality = snapshot.cvQuality;
  const basePercent = typeof cvQuality.minimumBaseCvPercent === "number"
    ? `${cvQuality.minimumBaseCvPercent}% of base CV`
    : "No base CV ratio";
  const cards = [
    {
      label: "Generated CVs",
      value: cvQuality.generatedCvs,
      tone: cvQuality.generatedCvs > 0 ? "ready" : "watch",
      helper: "Role-specific outputs"
    },
    {
      label: "Min Size",
      value: cvQuality.minimumCvChars,
      tone: "ready",
      helper: basePercent
    },
    {
      label: "Min Bullets",
      value: cvQuality.minimumBullets,
      tone: "ready",
      helper: "Across generated CVs"
    },
    {
      label: "Employer Sections",
      value: cvQuality.employerHeadings,
      tone: "ready",
      helper: `${cvQuality.minimumEmployerBullets} min bullets per section`
    }
  ];
  return `<section>
    <div class="section-head">
      <div>
        <h2>CV Quality</h2>
        <p>Full-CV evidence before browser upload, not a score.</p>
      </div>
    </div>
    <div class="source-quality-layout">
      ${cards.map(renderStatCard).join("")}
    </div>
  </section>`;
}

function renderAtsDiagnostics(snapshot: ProgressSnapshot): string {
  if (!snapshot.atsDiagnostics) return "";
  const diagnostics = snapshot.atsDiagnostics;
  const cards = [
    {
      label: "Reports",
      value: diagnostics.reports,
      tone: diagnostics.reports > 0 ? "ready" : "neutral",
      helper: "CV/JD diagnostic files"
    },
    {
      label: "Clean",
      value: diagnostics.passed,
      tone: diagnostics.warned === 0 ? "ready" : "neutral",
      helper: "No diagnostic warnings"
    },
    {
      label: "Warnings",
      value: diagnostics.warnings,
      tone: diagnostics.warnings > 0 ? "watch" : "ready",
      helper: "Agent review only"
    },
    {
      label: "Missing Terms",
      value: diagnostics.missingSupportedTerms,
      tone: diagnostics.missingSupportedTerms > 0 ? "watch" : "ready",
      helper: "Supported JD terms absent from CV text"
    }
  ];
  const warningList = diagnostics.topWarnings.length > 0
    ? `<div class="reason-panel"><h3>Top Warnings</h3><ul>${diagnostics.topWarnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul></div>`
    : `<div class="reason-panel"><h3>Top Warnings</h3><p class="empty-state">No ATS diagnostic warnings.</p></div>`;
  return `<section>
    <div class="section-head">
      <div>
        <h2>ATS Diagnostics</h2>
        <p>Parseability and safe JD-term coverage only. Not a candidate score.</p>
      </div>
    </div>
    <div class="source-quality-layout">
      ${cards.map(renderStatCard).join("")}
      ${warningList}
    </div>
  </section>`;
}

function renderLivePreflight(snapshot: ProgressSnapshot): string {
  if (!snapshot.livePreflight) return "";
  const livePreflight = snapshot.livePreflight;
  const roleLabel = [livePreflight.selectedCompany, livePreflight.selectedRoleTitle].filter(Boolean).join(" - ") ||
    "Selected application";
  const questionList = livePreflight.questions.length > 0
    ? `<div class="signal-list">${livePreflight.questions
        .slice(0, 5)
        .map((question) => `<div>${escapeHtml(question)}</div>`)
        .join("")}</div>`
    : "";
  const artifactLinks = [
    renderArtifactLink(livePreflight.paths.answerPromptsHtml, "Answer review", "../live-preflight"),
    renderArtifactLink(livePreflight.paths.answerPromptsMarkdown, "Prompts", "../live-preflight"),
    renderArtifactLink(livePreflight.paths.report, "Report", "../live-preflight"),
    renderArtifactLink(livePreflight.paths.approvalTemplate, "Approval template", "../live-preflight")
  ].join("");
  const cards = [
    {
      label: "Questions",
      value: livePreflight.answerPromptCount,
      tone: livePreflight.answerPromptCount > 0 ? "watch" : "ready",
      helper: "Need answers before fill"
    },
    {
      label: "Reusable",
      value: livePreflight.reusableAnswerPromptCount,
      tone: livePreflight.reusableAnswerPromptCount > 0 ? "watch" : "neutral",
      helper: "Can be saved if approved"
    },
    {
      label: "One-off",
      value: livePreflight.oneOffAnswerPromptCount,
      tone: livePreflight.oneOffAnswerPromptCount > 0 ? "watch" : "neutral",
      helper: "Use only for this form"
    }
  ];
  return `<section class="live-preflight-section">
      <div class="section-head">
        <div>
          <h2>Live Preflight</h2>
          <p>${escapeHtml(roleLabel)}</p>
        </div>
        <span class="badge ${livePreflightBadgeClass(livePreflight.status)}">${escapeHtml(humanizeIdentifier(livePreflight.status))}</span>
      </div>
      <div class="source-quality-layout">
        ${cards.map(renderStatCard).join("")}
        <div class="reason-panel">
          <h3>Portal Check</h3>
          <p class="next-step">${escapeHtml(livePreflight.summary)}</p>
          ${livePreflight.checkedUrl ? `<p class="muted">${escapeHtml(livePreflight.checkedUrl)}</p>` : ""}
          <div class="artifact-row">${artifactLinks}</div>
          ${questionList}
        </div>
      </div>
    </section>`;
}

function renderScanHistory(snapshot: ProgressSnapshot): string {
  if (!snapshot.scanHistory) return "";
  const scanHistory = snapshot.scanHistory;
  const keptPercent = scanHistory.inputJobs > 0
    ? Math.round((scanHistory.keptJobs / scanHistory.inputJobs) * 100)
    : 0;
  const cards = [
    {
      label: "Checked",
      value: scanHistory.inputJobs,
      tone: "neutral",
      helper: "Jobs after source filters"
    },
    {
      label: "New / active",
      value: scanHistory.keptJobs,
      tone: "ready",
      helper: `${keptPercent}% entered ranking`
    },
    {
      label: "Repeat skips",
      value: scanHistory.skippedJobs,
      tone: scanHistory.skippedJobs > 0 ? "watch" : "neutral",
      helper: scanHistory.mode === "review" ? "Review mode repeats allowed" : "Already handled"
    }
  ];
  return `<section>
      <div class="section-head">
        <h2>Scan History</h2>
        <p>Previously prepared or closed jobs avoided before CV work.</p>
      </div>
      <div class="source-quality-layout">
        ${cards.map(renderStatCard).join("")}
        <div class="reason-panel">
          <h3>Skipped By</h3>
          <div class="chip-row">
            <span class="chip ${scanHistory.skippedPrepared > 0 ? "chip-warn" : "chip-ok"}">${scanHistory.skippedPrepared} prepared</span>
            <span class="chip ${scanHistory.skippedClosed > 0 ? "chip-warn" : "chip-ok"}">${scanHistory.skippedClosed} closed</span>
            <span class="chip ${scanHistory.repostClusters > 0 ? "chip-warn" : "chip-ok"}">${scanHistory.repostClusters} repost signals</span>
            <span class="chip chip-ok">${scanHistory.recordedJobs} recorded</span>
          </div>
          ${renderTopReposts(scanHistory.topReposts)}
        </div>
      </div>
    </section>`;
}

function renderTopReposts(reposts: NonNullable<ProgressSnapshot["scanHistory"]>["topReposts"]): string {
  if (reposts.length === 0) return "";
  return `<div class="signal-list">${reposts
    .slice(0, 3)
    .map((repost) => `<div>${escapeHtml(repost.company)} - ${escapeHtml(repost.role)}: ${repost.appearances} appearances in ${repost.daysSpan} day(s)</div>`)
    .join("")}</div>`;
}

function renderSourceOutcomes(snapshot: ProgressSnapshot): string {
  if (!snapshot.sourceOutcomes) return "";
  const sourceOutcomes = snapshot.sourceOutcomes;
  const cards = [
    {
      label: "Tracked",
      value: sourceOutcomes.trackedApplications,
      tone: "neutral",
      helper: "Applications with source context"
    },
    {
      label: "Positive",
      value: sourceOutcomes.positiveOutcomes,
      tone: sourceOutcomes.positiveOutcomes > 0 ? "ready" : "neutral",
      helper: "Replies, interviews, or offers"
    },
    {
      label: "Interviews / offers",
      value: sourceOutcomes.interviews + sourceOutcomes.offers,
      tone: sourceOutcomes.interviews + sourceOutcomes.offers > 0 ? "ready" : "neutral",
      helper: "Higher-signal outcomes"
    }
  ];
  return `<section>
      <div class="section-head">
        <h2>Source Learning</h2>
        <p>Which sources are producing useful outcomes.</p>
      </div>
      <div class="source-quality-layout">
        ${cards.map(renderStatCard).join("")}
        <div class="reason-panel">
          <h3>Top Sources</h3>
          <div class="chip-row">
            <span class="chip chip-ok">${sourceOutcomes.preparedApplications} prepared</span>
            <span class="chip ${sourceOutcomes.replies > 0 ? "chip-ok" : "chip-warn"}">${sourceOutcomes.replies} replies</span>
            <span class="chip ${sourceOutcomes.rejections > 0 ? "chip-warn" : "chip-ok"}">${sourceOutcomes.rejections} rejections</span>
            <span class="chip chip-ok">${sourceOutcomes.outcomeEvents} events</span>
          </div>
          ${renderTopSourceOutcomes(sourceOutcomes.sources)}
        </div>
      </div>
    </section>`;
}

function renderTopSourceOutcomes(sources: ProgressSourceOutcomeSummary["sources"]): string {
  if (sources.length === 0) return `<p class="empty-state">No source outcome data yet.</p>`;
  return `<div class="signal-list">${sources
    .slice(0, 5)
    .map((source) =>
      `<div>${escapeHtml(source.sourceName)}: ${source.preparedApplications} prepared, ${source.replies} replies, ${source.interviews} interviews, ${source.offers} offers</div>`
    )
    .join("")}</div>`;
}

function renderDecisionSummary(items: ProgressJobDecisionItem[]): string {
  const counts = {
    review: 0,
    apply: 0,
    watch: 0,
    skip: 0
  };
  for (const item of items) counts[item.decision] += 1;
  const cards = [
    {
      label: "Ready / review",
      value: counts.apply + counts.review,
      tone: "ready",
      helper: "Strong enough to work now"
    },
    {
      label: "Watch",
      value: counts.watch,
      tone: "watch",
      helper: "Keep, but do not spend CV effort"
    },
    {
      label: "Skipped",
      value: counts.skip,
      tone: "skip",
      helper: "Blocked or too weak"
    }
  ];
  return `<div class="stat-grid stat-grid-small">${cards.map(renderStatCard).join("")}</div>`;
}

function renderStatCard(card: { label: string; value: number; tone: string; helper: string }): string {
  return `<article class="stat-card tone-${escapeHtml(card.tone)}">
    <span>${escapeHtml(card.label)}</span>
    <strong>${card.value}</strong>
    <small>${escapeHtml(card.helper)}</small>
  </article>`;
}

function renderApplicationItems(items: ProgressApplicationItem[]): string {
  if (items.length === 0) return `<p class="empty-state">No prepared application details yet.</p>`;
  return `<div class="application-list">${items.map(renderApplicationItem).join("")}</div>`;
}

function renderApplicationItem(item: ProgressApplicationItem): string {
  const pauseReasons = item.pauseReasons.length > 0
    ? item.pauseReasons.map((reason) => `<span class="chip chip-warn">${escapeHtml(humanizeIdentifier(reason))}</span>`).join("")
    : `<span class="chip chip-ok">None</span>`;
  const cvDocxPath = renderArtifactLink(item.cvDocxPath, "Upload DOCX", "../cvs");
  const cvHtmlPath = renderArtifactLink(item.cvHtmlPath, "View CV", "../cvs");
  const cvPath = renderArtifactLink(item.cvPath, "Markdown", "../cvs");
  const jdPath = renderArtifactLink(item.jdPath, "JD", "../jds");
  const atsDiagnosticsPath = renderArtifactLink(item.atsDiagnosticsPath, "ATS diagnostics", "../ats-diagnostics");
  const reconciliationPath = renderArtifactLink(item.reconciliationPath, "Reconciliation", "../reconciliation");
  const applyRoutePath = renderArtifactLink(item.applyRoutePath, "Apply route", "../apply-routes");
  const browserPlanPath = renderArtifactLink(item.browserPlanPath, "Browser plan", "../browser-plans");
  const browserReceiptPath = renderArtifactLink(item.browserReceiptPath, "Receipt", "../browser-receipts");
  const reconciliationStatus = item.reconciliationStatus ?? "unknown";
  const browserReceiptStatus = item.browserReceiptStatus ?? "unknown";
  const applyRouteType = item.applyRouteType ? humanizeIdentifier(item.applyRouteType) : "Unknown";
  const applyRouteStatus = item.applyRouteStatus ? humanizeIdentifier(item.applyRouteStatus) : "Unknown";

  return `<article class="application-card">
    <header>
      <div>
        <p class="eyebrow">${escapeHtml(item.status)}</p>
        <h3>${escapeHtml(item.company)} - ${escapeHtml(item.title)}</h3>
      </div>
      <span class="badge ${statusBadgeClass(reconciliationStatus)}">${escapeHtml(humanizeIdentifier(reconciliationStatus))}</span>
    </header>
    <p class="next-step">${escapeHtml(item.nextStep)}</p>
    <div class="artifact-row">${jdPath}${cvDocxPath}${cvHtmlPath}${cvPath}${atsDiagnosticsPath}${reconciliationPath}${applyRoutePath}${browserPlanPath}${browserReceiptPath}</div>
    <dl class="compact-grid">
      <div><dt>Route</dt><dd>${escapeHtml(applyRouteType)} / ${escapeHtml(applyRouteStatus)}</dd></div>
      <div><dt>Auto-submit</dt><dd>${item.canAutoSubmit ? "Allowed" : "Not allowed"}</dd></div>
      <div><dt>Approval</dt><dd>${item.submitRequiresApproval ? "Required" : "Not required"}</dd></div>
      <div><dt>Receipt</dt><dd><span class="badge ${receiptBadgeClass(browserReceiptStatus)}">${escapeHtml(humanizeIdentifier(browserReceiptStatus))}</span></dd></div>
    </dl>
    <div class="chip-row" aria-label="Pause reasons">${pauseReasons}</div>
  </article>`;
}

function renderJobDecisions(items: ProgressJobDecisionItem[]): string {
  if (items.length === 0) return `<p class="empty-state">No job decision details yet.</p>`;
  return `<div class="decision-table-wrap">
    <table class="decision-table">
      <thead>
        <tr>
          <th>Decision</th>
          <th>Company</th>
          <th>Role</th>
          <th>Source</th>
          <th>Why</th>
          <th>Next step</th>
        </tr>
      </thead>
      <tbody>${items.map(renderJobDecision).join("")}</tbody>
    </table>
  </div>`;
}

function renderJobDecision(item: ProgressJobDecisionItem): string {
  const reasonItems = item.reasons.filter((reason) => !reason.startsWith("Blocked:"));
  const reasonText = reasonItems.length > 0
    ? reasonItems.slice(0, 2).join(" ")
    : "No strong match reason recorded.";
  const blockers = item.failedGates.length > 0 ? item.failedGates.slice(0, 2).join(" ") : "";
  const location = item.location ? `<span class="muted">${escapeHtml(item.location)}</span>` : "";
  const skipped = item.skippedReason ? `Skipped reason: ${item.skippedReason}` : "";
  const why = [blockers, skipped, reasonText].filter(Boolean).join(" ");

  return `<tr>
    <td><span class="badge ${decisionBadgeClass(item.decision)}">${escapeHtml(humanizeIdentifier(item.decision))}</span></td>
    <td>${escapeHtml(item.company)}</td>
    <td>${escapeHtml(item.title)} ${location}</td>
    <td>${escapeHtml(item.sourceName)}</td>
    <td>${escapeHtml(why)}</td>
    <td>${escapeHtml(item.nextStep)}</td>
  </tr>`;
}

function lastPathPart(value: string): string {
  return value.split(/[\\/]/).at(-1) ?? value;
}

function renderArtifactLink(pathValue: string | undefined, label: string, basePath: string): string {
  if (!pathValue) return `<span class="artifact-link artifact-missing">${escapeHtml(label)} missing</span>`;
  const fileName = lastPathPart(pathValue);
  return `<a class="artifact-link" href="${escapeHtml(basePath)}/${escapeHtml(fileName)}" title="${escapeHtml(pathValue)}">${escapeHtml(label)}</a>`;
}

function decisionBadgeClass(decision: string): string {
  switch (decision) {
    case "apply":
    case "review":
      return "badge-ready";
    case "watch":
      return "badge-watch";
    case "skip":
      return "badge-skip";
    default:
      return "badge-neutral";
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "passed":
    case "prepared":
    case "submitted":
    case "confirmation_received":
      return "badge-ready";
    case "needs_user_confirmation":
    case "reply_received":
      return "badge-watch";
    case "blocked":
    case "rejected":
      return "badge-skip";
    default:
      return "badge-neutral";
  }
}

function receiptBadgeClass(status: string): string {
  switch (status) {
    case "submitted":
      return "badge-ready";
    case "paused":
      return "badge-watch";
    case "failed":
      return "badge-skip";
    default:
      return "badge-neutral";
  }
}

function livePreflightBadgeClass(status: NonNullable<ProgressSnapshot["livePreflight"]>["status"]): string {
  switch (status) {
    case "pass":
      return "badge-ready";
    case "pause":
    case "skipped":
      return "badge-watch";
    case "fail":
      return "badge-skip";
    default:
      return "badge-neutral";
  }
}

function humanizeIdentifier(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part[0] ? `${part[0].toUpperCase()}${part.slice(1)}` : part)
    .join(" ");
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function renderProgressDashboardHtml(snapshot: ProgressSnapshot): string {
  const meta = renderMeta(snapshot);
  const applicationItems = renderApplicationItems(snapshot.items);
  const jobDecisions = renderJobDecisions(snapshot.jobDecisions ?? []);
  const statusCards = renderStatusCards(snapshot);
  const scanHistory = renderScanHistory(snapshot);
  const sourceOutcomes = renderSourceOutcomes(snapshot);
  const sourceScorecards = renderSourceScorecards(snapshot);
  const sourceQuality = renderSourceQuality(snapshot);
  const freshness = renderFreshness(snapshot);
  const dedupe = renderDedupe(snapshot);
  const safety = renderSafety(snapshot);
  const funnelHealth = renderFunnelHealth(snapshot);
  const cvQuality = renderCvQuality(snapshot);
  const atsDiagnostics = renderAtsDiagnostics(snapshot);
  const livePreflight = renderLivePreflight(snapshot);
  const pendingQuestions = renderPendingQuestions(snapshot);
  const decisionSummary = renderDecisionSummary(snapshot.jobDecisions ?? []);
  const actions = snapshot.nextActions.map((action) => `<li>${escapeHtml(action)}</li>`).join("");
  const notes = snapshot.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("");
  const preparedCount = snapshot.applications.prepared;
  const watchCount = (snapshot.jobDecisions ?? []).filter((item) => item.decision === "watch").length;
  const livePendingQuestions = snapshot.livePreflight?.status === "pause"
    ? snapshot.livePreflight.answerPromptCount
    : 0;
  const pendingQuestionCount = snapshot.pendingQuestions + livePendingQuestions;
  const liveStatusBadge = snapshot.livePreflight
    ? `<span class="badge ${livePreflightBadgeClass(snapshot.livePreflight.status)}">live preflight ${escapeHtml(humanizeIdentifier(snapshot.livePreflight.status))}</span>`
    : "";
  const readyToApplyCount = snapshot.items.filter((item) => item.canAutoSubmit).length;
  const submittedCount = snapshot.applications.submitted + snapshot.applications.confirmation_received;
  const cvCount = snapshot.cvQuality?.generatedCvs ?? snapshot.items.filter((item) => item.cvDocxPath || item.cvHtmlPath || item.cvPath).length;
  const heroTitle = pendingQuestionCount > 0
    ? "Review the prepared applications."
    : readyToApplyCount > 0
      ? "Applications are ready to send under policy."
      : "Today&apos;s batch is ready for review.";
  const heroDetail = snapshot.items.length > 0
    ? `${snapshot.items.length} application draft(s), ${cvCount} CV(s), ${snapshot.items.filter((item) => item.browserPlanPath).length} browser plan(s). Nothing is submitted from this dashboard.`
    : "No prepared applications yet. Run the agent batch to create the next queue.";
  const primaryAction = snapshot.livePreflight?.status === "pass"
    ? {
        label: "Ask agent to run live apply in review mode",
        detail: "Fill and upload on the live portal, then pause before final submit."
      }
    : pendingQuestionCount > 0
      ? {
          label: "Answer the open application questions",
          detail: "Resolve the paused fields before a live fill/upload step."
        }
      : {
          label: "Review prepared applications",
          detail: "Check the CV, reconciliation, browser plan, and receipt for each role."
        };
  const runWindow = `${escapeHtml(snapshot.periodStart)} to ${escapeHtml(snapshot.periodEnd)}`;
  const diagnosticBlocks = [livePreflight, pendingQuestions, funnelHealth, sourceQuality, freshness, dedupe, safety, sourceScorecards, cvQuality, atsDiagnostics, scanHistory, sourceOutcomes].filter(Boolean).join("");
  const statusLine = [
    `${preparedCount} prepared`,
    `${cvCount} CVs`,
    `${pendingQuestionCount} pending questions`,
    `${submittedCount} submitted or confirmed`
  ];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ApplyCue Progress</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f8fb;
      --surface: #ffffff;
      --surface-soft: #eef3f8;
      --surface-raised: #fbfcfe;
      --ink: #172033;
      --muted: #667387;
      --line: #d9e1ea;
      --line-strong: #b7c4d4;
      --blue: #255fd5;
      --green: #24735d;
      --amber: #936313;
      --red: #b13f3b;
      --shadow: 0 12px 28px rgba(23, 32, 51, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background: var(--bg);
      font-family: Aptos, "Segoe UI", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      line-height: 1.45;
    }
    main { max-width: 1180px; margin: 0 auto; padding: 24px; }
    main, section, .hero-copy, .run-panel, .application-card, .operator-grid > div, .advanced-panel { min-width: 0; }
    h1, h2, h3, h4, p { margin-top: 0; }
    h1 { font-size: 28px; line-height: 1.12; margin-bottom: 10px; letter-spacing: 0; }
    h2 { font-size: 16px; margin-bottom: 12px; letter-spacing: 0; }
    h3 { font-size: 15px; margin-bottom: 0; letter-spacing: 0; }
    h4 { font-size: 13px; margin-bottom: 8px; letter-spacing: 0; }
    a { color: var(--blue); text-decoration: none; }
    a:hover { text-decoration: underline; }
    ul { margin: 0; padding-left: 20px; }
    li, p, h3, dd, td, .artifact-link { overflow-wrap: anywhere; }
    .topbar {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      margin-bottom: 18px;
    }
    .brand {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .brand strong { font-size: 16px; }
    .brand span, .timestamp, .subtitle, .muted { color: var(--muted); }
    .summary-link {
      min-height: 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--line-strong);
      border-radius: 8px;
      padding: 8px 12px;
      background: var(--surface);
      font-weight: 700;
    }
    .hero-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.6fr);
      gap: 16px;
      align-items: stretch;
      margin-bottom: 16px;
    }
    .hero-copy, .action-panel, section, .advanced-panel {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    .hero-copy {
      padding: 22px;
      box-shadow: var(--shadow);
    }
    .action-panel {
      padding: 18px;
      border-color: var(--line-strong);
      box-shadow: var(--shadow);
    }
    .action-panel p { color: var(--muted); margin-bottom: 14px; }
    .primary-action {
      display: block;
      border: 1px solid var(--blue);
      border-radius: 8px;
      padding: 14px;
      background: #f1f5ff;
      color: var(--ink);
    }
    .primary-action strong { display: block; margin-bottom: 6px; color: var(--blue); }
    .primary-action span { color: var(--muted); }
    .kicker {
      color: var(--blue);
      font-size: 12px;
      font-weight: 800;
      margin-bottom: 8px;
      text-transform: uppercase;
    }
    .quick-line, .artifact-row, .chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .quick-line { margin-top: 18px; }
    section { padding: 20px; margin: 18px 0; }
    .section-head {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: baseline;
      margin-bottom: 14px;
    }
    .section-head p { color: var(--muted); margin-bottom: 0; }
    .queue-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(260px, 0.42fr);
      gap: 16px;
      align-items: start;
    }
    .meta-grid, .compact-grid {
      display: grid;
      grid-template-columns: minmax(120px, 180px) 1fr;
      gap: 8px 16px;
    }
    .meta-grid div, .compact-grid div { display: contents; }
    dt { color: var(--muted); font-weight: 700; }
    dd { margin: 0; overflow-wrap: anywhere; }
    .readiness-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 12px;
    }
    .stat-grid-small { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .stat-card, .metric-card {
      min-height: 112px;
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface-raised);
    }
    .metric-card { min-height: 94px; }
    .stat-card span, .metric-card span, .eyebrow { color: var(--muted); }
    .stat-card strong, .metric-card strong { display: block; font-size: 30px; line-height: 1; margin: 10px 0 8px; }
    .stat-card small, .metric-card small { color: var(--muted); }
    .tone-ready { border-top: 4px solid var(--green); }
    .tone-sent, .tone-reply { border-top: 4px solid var(--blue); }
    .tone-interview, .tone-offer { border-top: 4px solid var(--amber); }
    .tone-watch { border-top: 4px solid var(--amber); }
    .tone-skip { border-top: 4px solid var(--red); }
    .tone-neutral { border-top: 4px solid #7a8798; }
    .application-list { display: grid; gap: 14px; }
    .application-card {
      border: 1px solid var(--line-strong);
      border-radius: 8px;
      padding: 18px;
      background: var(--surface);
      box-shadow: 0 8px 22px rgba(23, 32, 51, 0.06);
    }
    .application-card header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 12px;
    }
    .eyebrow {
      text-transform: uppercase;
      font-size: 12px;
      font-weight: 800;
      margin-bottom: 6px;
    }
    .next-step { margin-bottom: 14px; color: var(--ink); }
    .artifact-row, .chip-row { margin: 12px 0; }
    .artifact-link, .chip, .badge {
      display: inline-flex;
      align-items: center;
      min-height: 30px;
      border-radius: 7px;
      padding: 5px 10px;
      border: 1px solid var(--line);
      background: var(--surface-soft);
      font-size: 13px;
      font-weight: 700;
      white-space: nowrap;
    }
    .artifact-missing { color: var(--muted); }
    .chip-ok, .badge-ready { color: var(--green); background: #edf8f4; border-color: #b8ded1; }
    .chip-warn, .badge-watch { color: var(--amber); background: #fff6e5; border-color: #efcf93; }
    .badge-skip { color: var(--red); background: #fff0ef; border-color: #efc1bd; }
    .badge-neutral { color: var(--muted); background: var(--surface-soft); }
    .side-panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
      background: var(--surface-raised);
    }
    .side-panel + .side-panel { margin-top: 14px; }
    .decision-table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 8px; }
    .decision-table { width: 100%; border-collapse: collapse; min-width: 960px; background: var(--surface); }
    .decision-table th, .decision-table td {
      text-align: left;
      vertical-align: top;
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
    }
    .decision-table th {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0;
      background: var(--surface-soft);
    }
    .decision-table tbody tr:last-child td { border-bottom: 0; }
    .operator-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }
    .source-quality-layout {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(220px, 1.2fr);
      gap: 12px;
      align-items: stretch;
    }
    .reason-panel {
      min-height: 112px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
      background: var(--surface);
    }
    .reason-panel h3 { margin-bottom: 12px; }
    .signal-list { margin-top: 12px; color: var(--muted); font-size: 13px; }
    .signal-list div { margin-top: 6px; overflow-wrap: anywhere; }
    .empty-state { color: var(--muted); margin-bottom: 0; }
    .advanced-panel {
      margin: 18px 0;
      background: var(--surface);
      overflow: hidden;
    }
    .advanced-panel > summary {
      min-height: 56px;
      padding: 16px 20px;
      cursor: pointer;
      font-weight: 800;
      list-style-position: inside;
      border-bottom: 1px solid transparent;
    }
    .advanced-panel > summary small {
      display: block;
      margin-top: 4px;
      color: var(--muted);
      font-weight: 500;
    }
    .advanced-panel[open] > summary { border-bottom-color: var(--line); }
    .advanced-body { padding: 0 20px 20px; }
    .advanced-body section {
      box-shadow: none;
      margin: 18px 0 0;
    }
    @media (max-width: 900px) {
      main { padding: 18px; }
      .hero-layout, .queue-layout, .operator-grid { grid-template-columns: 1fr; }
      .source-quality-layout { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .readiness-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .stat-grid, .stat-grid-small { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .application-card header, .section-head { flex-direction: column; align-items: flex-start; }
    }
    @media (max-width: 560px) {
      h1 { font-size: 24px; }
      .topbar { align-items: flex-start; flex-direction: column; }
      .source-quality-layout { grid-template-columns: 1fr; }
      .readiness-grid { grid-template-columns: 1fr; }
      .stat-grid, .stat-grid-small { grid-template-columns: 1fr; }
      .meta-grid, .compact-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <div class="topbar">
      <div class="brand">
        <strong>ApplyCue Control Room</strong>
        <span>${runWindow}</span>
      </div>
      <a class="summary-link" href="../runs/latest-summary.md">Open run summary</a>
    </div>
    <div class="hero-layout">
      <div class="hero-copy">
        <p class="kicker">CV-to-offer agent</p>
        <h1>${heroTitle}</h1>
        <p class="subtitle">${escapeHtml(heroDetail)}</p>
        <div class="quick-line">
          ${statusLine.map((item, index) => `<span class="badge ${index === 0 ? "badge-ready" : index === 2 && pendingQuestionCount > 0 ? "badge-watch" : "badge-neutral"}">${escapeHtml(item)}</span>`).join("")}
          ${liveStatusBadge}
        </div>
      </div>
      <aside class="action-panel">
        <h2>Next Safe Move</h2>
        <a class="primary-action" href="#prepared-queue">
          <strong>${escapeHtml(primaryAction.label)}</strong>
          <span>${escapeHtml(primaryAction.detail)}</span>
        </a>
      </aside>
    </div>
    <div class="readiness-grid" aria-label="Batch readiness">
      <article class="metric-card tone-ready"><span>Prepared</span><strong>${preparedCount}</strong><small>Ready for review</small></article>
      <article class="metric-card ${pendingQuestionCount > 0 ? "tone-watch" : "tone-ready"}"><span>Questions</span><strong>${pendingQuestionCount}</strong><small>${pendingQuestionCount > 0 ? "Resolve before submit" : "No open blockers"}</small></article>
      <article class="metric-card ${snapshot.livePreflight?.status === "pass" ? "tone-ready" : snapshot.livePreflight ? "tone-watch" : "tone-neutral"}"><span>Live preflight</span><strong>${snapshot.livePreflight ? humanizeIdentifier(snapshot.livePreflight.status) : "None"}</strong><small>${snapshot.livePreflight?.selectedCompany ? escapeHtml(snapshot.livePreflight.selectedCompany) : "Run before live apply"}</small></article>
      <article class="metric-card tone-ready"><span>CV proof</span><strong>${cvCount}</strong><small>${snapshot.cvQuality ? `${snapshot.cvQuality.minimumBullets} min bullets` : "Generated artifacts"}</small></article>
    </div>
    <section id="prepared-queue">
      <div class="section-head">
        <h2>Prepared Queue</h2>
        <p>Review these first. Raw scores stay hidden.</p>
      </div>
      <div class="queue-layout">
        <div>${applicationItems}</div>
        <aside>
          <div class="side-panel">
            <h3>Next Actions</h3>
            <ul>${actions || "<li>No next actions queued.</li>"}</ul>
          </div>
          ${meta ? `<div class="side-panel"><h3>Run</h3>${meta}</div>` : ""}
          <div class="side-panel">
            <h3>Operator Notes</h3>
            <ul>${notes || "<li>No notes.</li>"}</ul>
          </div>
        </aside>
      </div>
    </section>
    <details class="advanced-panel">
      <summary>
        Advanced diagnostics
        <small>Source quality, CV checks, scan history, outcomes, batch health, and decision queue.</small>
      </summary>
      <div class="advanced-body">
        ${diagnosticBlocks}
        <section>
          <div class="section-head">
            <h2>Batch Health</h2>
            <p>Application states that matter for the current run.</p>
          </div>
          ${statusCards}
        </section>
        <section>
          <div class="section-head">
            <h2>Decision Queue</h2>
            <p>Decisions and reasons drive the workflow.</p>
          </div>
          ${decisionSummary}
          ${jobDecisions}
        </section>
      </div>
    </details>
  </main>
</body>
</html>`;
}

export function renderProgressChatSummaryMarkdown(snapshot: ProgressSnapshot): string {
  const preparedCount = snapshot.applications.prepared;
  const submittedCount = snapshot.applications.submitted + snapshot.applications.confirmation_received;
  const cvReadyCount = snapshot.applications.cv_ready;
  const readyToApplyCount = snapshot.items.filter((item) => item.canAutoSubmit).length;
  const pendingQuestionItems = snapshot.pendingQuestionItems ?? [];
  const livePendingQuestions = snapshot.livePreflight?.status === "pause"
    ? snapshot.livePreflight.answerPromptCount
    : 0;
  const pendingQuestionCount = snapshot.pendingQuestions + livePendingQuestions;
  const needsAnswerCount = pendingQuestionCount +
    snapshot.items.filter((item) => item.pauseReasons.length > 0 || item.submitRequiresApproval).length;
  const watchOrSkipped = (snapshot.jobDecisions ?? [])
    .filter((item) => item.decision === "watch" || item.decision === "skip" || item.skippedReason)
    .slice(0, 10);
  const livePreflight = snapshot.livePreflight
    ? [
        "## Live Preflight",
        "",
        `- Status: ${snapshot.livePreflight.status.toUpperCase()}`,
        `- Role: ${escapeMarkdownLine([snapshot.livePreflight.selectedCompany, snapshot.livePreflight.selectedRoleTitle].filter(Boolean).join(" - ") || "selected application")}`,
        `- Questions: ${snapshot.livePreflight.answerPromptCount} (${snapshot.livePreflight.reusableAnswerPromptCount} reusable, ${snapshot.livePreflight.oneOffAnswerPromptCount} one-off)`,
        ...(snapshot.livePreflight.checkedUrl ? [`- Page: ${escapeMarkdownLine(snapshot.livePreflight.checkedUrl)}`] : []),
        ...(snapshot.livePreflight.paths.answerPromptsHtml ? [`- Answer review: ${escapeMarkdownLine(snapshot.livePreflight.paths.answerPromptsHtml)}`] : []),
        ...(snapshot.livePreflight.paths.answerPromptsMarkdown ? [`- Prompts: ${escapeMarkdownLine(snapshot.livePreflight.paths.answerPromptsMarkdown)}`] : []),
        ...(snapshot.livePreflight.paths.report ? [`- Report: ${escapeMarkdownLine(snapshot.livePreflight.paths.report)}`] : []),
        ...snapshot.livePreflight.questions.slice(0, 5).map((question) => `- Ask: ${escapeMarkdownLine(question)}`),
        ""
      ].join("\n")
    : "";
  const pendingQuestionSection = pendingQuestionItems.length > 0
    ? [
        "## Pending Questions",
        "",
        ...pendingQuestionItems.slice(0, 5).map((question) =>
          `- ${escapeMarkdownLine(question.question)} Reason: ${escapeMarkdownLine(question.reason)}`
        ),
        ""
      ].join("\n")
    : "";
  const funnelHealth = snapshot.funnelHealth
    ? [
        "## Funnel Health",
        "",
        `- Status: ${escapeMarkdownLine(snapshot.funnelHealth.status)}`,
        `- Summary: ${escapeMarkdownLine(snapshot.funnelHealth.message)}`,
        `- Daily target: ${snapshot.funnelHealth.preparedApplications}/${snapshot.funnelHealth.configuredDailyTarget}`,
        `- Jobs: ${snapshot.funnelHealth.discoveredJobs} discovered, ${snapshot.funnelHealth.keptForRanking} kept for ranking, ${snapshot.funnelHealth.watchOrSkippedJobs} watched/skipped`,
        ...snapshot.funnelHealth.dominantFilters.slice(0, 3).map((item) =>
          `- Filter: ${escapeMarkdownLine(item.label)} (${item.count})${item.examples[0] ? ` - ${escapeMarkdownLine(item.examples[0])}` : ""}`
        ),
        ...snapshot.funnelHealth.dominantGateBlocks.slice(0, 3).map((item) =>
          `- Gate: ${escapeMarkdownLine(item.label)} (${item.count})${item.examples[0] ? ` - ${escapeMarkdownLine(item.examples[0])}` : ""}`
        ),
        ...snapshot.funnelHealth.suggestedActions.slice(0, 4).map((action) => `- ${escapeMarkdownLine(action)}`),
        ""
      ].join("\n")
    : "";
  const sourceQuality = snapshot.sourceQuality
    ? [
        "## Source Quality",
        "",
        `- Found before filtering: ${snapshot.sourceQuality.inputJobs}`,
        `- Kept for ranking: ${snapshot.sourceQuality.keptJobs}`,
        `- Skipped before CV work: ${snapshot.sourceQuality.filteredJobs}`,
        `- Skip reasons: ${snapshot.sourceQuality.byReason.title} title, ${snapshot.sourceQuality.byReason.industry} industry, ${snapshot.sourceQuality.byReason.location} location, ${snapshot.sourceQuality.byReason.content} content`,
        ...sourceQualityExampleLines(snapshot.sourceQuality.examplesByReason),
        ""
      ].join("\n")
    : "";
  const freshness = snapshot.freshness
    ? [
        "## Freshness",
        "",
        `- Window: ${snapshot.freshness.windowDays} day(s)`,
        `- Kept after freshness: ${snapshot.freshness.keptJobs}/${snapshot.freshness.inputJobs}`,
        `- Fresh known post dates: ${snapshot.freshness.freshKnownPostDateJobs}`,
        `- Unknown post dates kept eligible: ${snapshot.freshness.unknownPostDateJobs}`,
        `- Older known posts held back: ${snapshot.freshness.filteredOldJobs}`,
        ...(snapshot.freshness.includeOlderPosts ? ["- Older known posts were included for this run."] : []),
        ...(snapshot.freshness.filteredUnknownPostDateJobs > 0 ? [`- Unknown-date jobs filtered: ${snapshot.freshness.filteredUnknownPostDateJobs}`] : []),
        ""
      ].join("\n")
    : "";
  const dedupe = snapshot.dedupe
    ? [
        "## Duplicates Blocked",
        "",
        `- Jobs checked after source filters: ${snapshot.dedupe.inputJobs}`,
        `- Duplicates blocked this run: ${snapshot.dedupe.blockedDuplicates}`,
        `- Same URL: ${snapshot.dedupe.sameUrl}`,
        `- Same company + similar role: ${snapshot.dedupe.sameCompanySimilarRole}`,
        `- Already handled earlier: ${snapshot.dedupe.alreadyHandledRepeats}`,
        `- Total duplicate/repeat noise avoided: ${snapshot.dedupe.totalAvoided}`,
        ""
      ].join("\n")
    : "";
  const safety = snapshot.safety
    ? [
        "## Safety Blocks",
        "",
        `- Jobs checked: ${snapshot.safety.checkedJobs}`,
        `- Total safety blocks: ${snapshot.safety.totalSafetyBlocks}`,
        `- Fraud signals: ${snapshot.safety.fraudSignalBlocks}`,
        `- Blocked portals: ${snapshot.safety.blockedPortalBlocks}`,
        `- Portal policy blocks: ${snapshot.safety.portalPolicyBlocks}`,
        ...snapshot.safety.examples.slice(0, 5).map((example) => `- Blocked: ${escapeMarkdownLine(example)}`),
        ""
      ].join("\n")
    : "";
  const sourceScorecards = snapshot.sourceScorecards
    ? [
        "## Source Scorecards",
        "",
        `- Fetched jobs: ${snapshot.sourceScorecards.fetchedJobs}`,
        `- Kept jobs: ${snapshot.sourceScorecards.keptJobs}`,
        `- Filtered jobs: ${snapshot.sourceScorecards.filteredJobs}`,
        `- Prepared applications: ${snapshot.sourceScorecards.preparedApplications}`,
        `- Positive outcomes: ${snapshot.sourceScorecards.positiveOutcomes}`,
        ...renderSourceScorecardSummaryLines(snapshot.sourceScorecards),
        ""
      ].join("\n")
    : "";
  const cvQuality = snapshot.cvQuality
    ? [
        "## CV Quality",
        "",
        `- Generated CVs: ${snapshot.cvQuality.generatedCvs}`,
        `- Minimum generated CV size: ${snapshot.cvQuality.minimumCvChars} chars${typeof snapshot.cvQuality.minimumBaseCvPercent === "number" ? ` (${snapshot.cvQuality.minimumBaseCvPercent}% of base CV)` : ""}`,
        `- Minimum bullets: ${snapshot.cvQuality.minimumBullets}`,
        `- Employer sections: ${snapshot.cvQuality.employerHeadings}`,
        `- Thinnest employer section: ${snapshot.cvQuality.minimumEmployerBullets} bullet(s)`,
        ""
      ].join("\n")
    : "";
  const atsDiagnostics = snapshot.atsDiagnostics
    ? [
        "## ATS Diagnostics",
        "",
        `- Reports: ${snapshot.atsDiagnostics.reports}`,
        `- Clean reports: ${snapshot.atsDiagnostics.passed}`,
        `- Reports with warnings: ${snapshot.atsDiagnostics.warned}`,
        `- Warnings: ${snapshot.atsDiagnostics.warnings}`,
        `- Missing supported JD terms: ${snapshot.atsDiagnostics.missingSupportedTerms}`,
        `- Unsupported mentions: ${snapshot.atsDiagnostics.unsupportedMentions}`,
        ...snapshot.atsDiagnostics.topWarnings.slice(0, 5).map((warning) => `- Warning: ${escapeMarkdownLine(warning)}`),
        ""
      ].join("\n")
    : "";
  const scanHistory = snapshot.scanHistory
    ? [
        "## Scan History",
        "",
        `- Jobs checked after source filters: ${snapshot.scanHistory.inputJobs}`,
        `- New or active for ranking: ${snapshot.scanHistory.keptJobs}`,
        `- Repeats skipped: ${snapshot.scanHistory.skippedJobs}`,
        `- Skip reasons: ${snapshot.scanHistory.skippedPrepared} prepared, ${snapshot.scanHistory.skippedClosed} closed`,
        `- Repost signals: ${snapshot.scanHistory.repostClusters} cluster(s), ${snapshot.scanHistory.repostedJobs} posting(s)`,
        `- Recorded this run: ${snapshot.scanHistory.recordedJobs}`,
        ...snapshot.scanHistory.topReposts.map((repost) =>
          `- Possible repost: ${escapeMarkdownLine(repost.company)} - ${escapeMarkdownLine(repost.role)} (${repost.appearances} appearances in ${repost.daysSpan} day(s))`
        ),
        ""
      ].join("\n")
    : "";
  const sourceOutcomes = snapshot.sourceOutcomes
    ? [
        "## Source Learning",
        "",
        `- Applications with source context: ${snapshot.sourceOutcomes.trackedApplications}`,
        `- Prepared applications tracked: ${snapshot.sourceOutcomes.preparedApplications}`,
        `- Positive outcomes: ${snapshot.sourceOutcomes.positiveOutcomes}`,
        `- Replies: ${snapshot.sourceOutcomes.replies}`,
        `- Interviews: ${snapshot.sourceOutcomes.interviews}`,
        `- Offers: ${snapshot.sourceOutcomes.offers}`,
        `- Rejections: ${snapshot.sourceOutcomes.rejections}`,
        ...renderSourceOutcomeSummaryLines(snapshot.sourceOutcomes),
        ""
      ].join("\n")
    : "";
  const preparedQueue = snapshot.items.length > 0
    ? snapshot.items.map((item, index) => renderPreparedSummaryItem(item, index + 1)).join("\n")
    : "No prepared applications yet.\n";
  const decisionQueue = watchOrSkipped.length > 0
    ? watchOrSkipped.map((item) => renderDecisionSummaryItem(item)).join("\n")
    : "No skipped or watch items recorded.\n";
  const actions = snapshot.nextActions.length > 0
    ? snapshot.nextActions.map((action) => `- ${escapeMarkdownLine(action)}`).join("\n")
    : "- No next actions queued.";
  const notes = snapshot.notes.length > 0
    ? snapshot.notes.map((note) => `- ${escapeMarkdownLine(note)}`).join("\n")
    : "- No operator notes.";

  return `# ApplyCue Run Summary

Run: ${escapeMarkdownLine(snapshot.runId ?? snapshot.id)}
Profile: ${escapeMarkdownLine(snapshot.profileId ?? "unknown")}
Period: ${escapeMarkdownLine(snapshot.periodStart)} to ${escapeMarkdownLine(snapshot.periodEnd)}

## What Happened

- Jobs prepared today: ${preparedCount}
- CVs ready: ${cvReadyCount + preparedCount + submittedCount}
- Ready to apply under policy: ${readyToApplyCount}
- Needs answer or approval: ${needsAnswerCount}
- Submitted or confirmed: ${submittedCount}
- Pending questions: ${pendingQuestionCount}

${livePreflight}${pendingQuestionSection}${funnelHealth}${sourceQuality}${freshness}${dedupe}${safety}${sourceScorecards}${cvQuality}${atsDiagnostics}${scanHistory}${sourceOutcomes}## Prepared Queue

${preparedQueue}
## Skipped Or Watch

${decisionQueue}
## Next Actions

${actions}

## Operator Notes

${notes}
`;
}

function renderSourceOutcomeSummaryLines(sourceOutcomes: ProgressSourceOutcomeSummary): string[] {
  if (sourceOutcomes.sources.length === 0) return ["- No source outcome data recorded yet."];
  return sourceOutcomes.sources.slice(0, 5).map((source) =>
    `- ${escapeMarkdownLine(source.sourceName)}: ${source.preparedApplications} prepared, ${source.replies} replies, ${source.interviews} interviews, ${source.offers} offers`
  );
}

function renderSourceScorecardSummaryLines(scorecards: ProgressSourceScorecardSummary): string[] {
  if (scorecards.sources.length === 0) return ["- No source scorecard data recorded yet."];
  return scorecards.sources.slice(0, 5).map((source) =>
    `- ${escapeMarkdownLine(source.sourceName)}: ${source.keptJobs}/${source.fetchedJobs} kept, ${source.preparedApplications} prepared, ${formatPercent(source.precision)} kept rate, ${source.positiveOutcomes} positive`
  );
}

function renderPreparedSummaryItem(item: ProgressApplicationItem, index: number): string {
  const lines = [
    `${index}. ${escapeMarkdownLine(item.company)} - ${escapeMarkdownLine(item.title)}`,
    `   - Status: ${escapeMarkdownLine(humanizeIdentifier(item.status))}`,
    `   - Next: ${escapeMarkdownLine(item.nextStep)}`,
    `   - CV: ${item.cvDocxPath ? escapeMarkdownLine(item.cvDocxPath) : "missing"}`,
    `   - ATS diagnostics: ${item.atsDiagnosticsPath ? escapeMarkdownLine(item.atsDiagnosticsPath) : "missing"}`,
    `   - Apply route: ${item.applyRoutePath ? `${escapeMarkdownLine(item.applyRoutePath)} (${escapeMarkdownLine(humanizeIdentifier(item.applyRouteType ?? "unknown"))} / ${escapeMarkdownLine(humanizeIdentifier(item.applyRouteStatus ?? "unknown"))})` : "missing"}`,
    `   - Browser plan: ${item.browserPlanPath ? escapeMarkdownLine(item.browserPlanPath) : "missing"}`,
    `   - Receipt: ${item.browserReceiptPath ? `${escapeMarkdownLine(item.browserReceiptPath)} (${escapeMarkdownLine(humanizeIdentifier(item.browserReceiptStatus ?? "unknown"))})` : "not run"}`
  ];
  if (item.reconciliationStatus) {
    lines.push(`   - Reconciliation: ${escapeMarkdownLine(humanizeIdentifier(item.reconciliationStatus))}`);
  }
  if (item.pauseReasons.length > 0) {
    lines.push(`   - Pause reasons: ${escapeMarkdownLine(item.pauseReasons.map(humanizeIdentifier).join(", "))}`);
  }
  return `${lines.join("\n")}\n`;
}

function renderDecisionSummaryItem(item: ProgressJobDecisionItem): string {
  const reasonItems = item.reasons.filter((reason) => !reason.startsWith("Blocked:"));
  const reasons = reasonItems.length > 0 ? reasonItems.slice(0, 2).join(" ") : "No strong match reason recorded.";
  const blockers = item.failedGates.length > 0 ? item.failedGates.slice(0, 2).join(" ") : "";
  const skipped = item.skippedReason ? `Skipped reason: ${item.skippedReason}` : "";
  const why = [blockers, skipped, reasons].filter(Boolean).join(" ");
  return `- ${escapeMarkdownLine(item.company)} - ${escapeMarkdownLine(item.title)}: ${escapeMarkdownLine(humanizeIdentifier(item.decision))}. ${escapeMarkdownLine(why)} Next: ${escapeMarkdownLine(item.nextStep)}`;
}

function sourceQualityExampleLines(
  examplesByReason: NonNullable<ProgressSnapshot["sourceQuality"]>["examplesByReason"] | undefined
): string[] {
  if (!examplesByReason) return [];
  const lines: string[] = [];
  for (const reason of ["title", "industry", "location", "content"] as const) {
    const examples = examplesByReason[reason] ?? [];
    if (examples.length === 0) continue;
    lines.push(`- ${capitalize(reason)} examples: ${examples.slice(0, 3).map(escapeMarkdownLine).join(" | ")}`);
  }
  return lines;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeMarkdownLine(value: string): string {
  return value.replaceAll("\r", " ").replaceAll("\n", " ").replaceAll("|", "/").trim();
}
