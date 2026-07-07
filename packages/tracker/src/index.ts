import type {
  ApplicationRecord,
  ApplicationStatus,
  JobRecord,
  JobSource,
  OutcomeEvent,
  ProgressApplicationItem,
  ProgressJobDecisionItem,
  ProgressSnapshot,
  ProgressSourceOutcomeSummary,
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

function sumSourceOutcomeField(
  sources: ProgressSourceOutcomeSummary["sources"],
  field: "preparedApplications" | "submitted" | "replies" | "interviews" | "offers" | "rejections" | "positiveOutcomes"
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
  cvQuality?: ProgressSnapshot["cvQuality"];
  jobDecisions?: ProgressJobDecisionItem[];
  livePreflight?: ProgressSnapshot["livePreflight"];
  scanHistory?: ProgressSnapshot["scanHistory"];
  sourceOutcomes?: ProgressSnapshot["sourceOutcomes"];
  sourceQuality?: ProgressSnapshot["sourceQuality"];
}): ProgressSnapshot {
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
    pendingQuestions: input.pendingQuestions ?? 0,
    nextActions: input.nextActions ?? [],
    notes: input.notes ?? [],
    ...(input.cvQuality ? { cvQuality: input.cvQuality } : {}),
    jobDecisions: input.jobDecisions ?? [],
    ...(input.livePreflight ? { livePreflight: input.livePreflight } : {}),
    ...(input.scanHistory ? { scanHistory: input.scanHistory } : {}),
    ...(input.sourceOutcomes ? { sourceOutcomes: input.sourceOutcomes } : {}),
    ...(input.sourceQuality ? { sourceQuality: input.sourceQuality } : {})
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
            <span class="chip ${sourceQuality.byReason.location > 0 ? "chip-warn" : "chip-ok"}">${sourceQuality.byReason.location} location</span>
            <span class="chip ${sourceQuality.byReason.content > 0 ? "chip-warn" : "chip-ok"}">${sourceQuality.byReason.content} content</span>
          </div>
        </div>
      </div>
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
  const reconciliationPath = renderArtifactLink(item.reconciliationPath, "Reconciliation", "../reconciliation");
  const browserPlanPath = renderArtifactLink(item.browserPlanPath, "Browser plan", "../browser-plans");
  const browserReceiptPath = renderArtifactLink(item.browserReceiptPath, "Receipt", "../browser-receipts");
  const reconciliationStatus = item.reconciliationStatus ?? "unknown";
  const browserReceiptStatus = item.browserReceiptStatus ?? "unknown";

  return `<article class="application-card">
    <header>
      <div>
        <p class="eyebrow">${escapeHtml(item.status)}</p>
        <h3>${escapeHtml(item.company)} - ${escapeHtml(item.title)}</h3>
      </div>
      <span class="badge ${statusBadgeClass(reconciliationStatus)}">${escapeHtml(humanizeIdentifier(reconciliationStatus))}</span>
    </header>
    <p class="next-step">${escapeHtml(item.nextStep)}</p>
    <div class="artifact-row">${cvDocxPath}${cvHtmlPath}${cvPath}${reconciliationPath}${browserPlanPath}${browserReceiptPath}</div>
    <dl class="compact-grid">
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

export function renderProgressDashboardHtml(snapshot: ProgressSnapshot): string {
  const meta = renderMeta(snapshot);
  const applicationItems = renderApplicationItems(snapshot.items);
  const jobDecisions = renderJobDecisions(snapshot.jobDecisions ?? []);
  const statusCards = renderStatusCards(snapshot);
  const scanHistory = renderScanHistory(snapshot);
  const sourceOutcomes = renderSourceOutcomes(snapshot);
  const sourceQuality = renderSourceQuality(snapshot);
  const cvQuality = renderCvQuality(snapshot);
  const livePreflight = renderLivePreflight(snapshot);
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
  const diagnosticBlocks = [livePreflight, sourceQuality, cvQuality, scanHistory, sourceOutcomes].filter(Boolean).join("");
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
  const sourceQuality = snapshot.sourceQuality
    ? [
        "## Source Quality",
        "",
        `- Found before filtering: ${snapshot.sourceQuality.inputJobs}`,
        `- Kept for ranking: ${snapshot.sourceQuality.keptJobs}`,
        `- Skipped before CV work: ${snapshot.sourceQuality.filteredJobs}`,
        `- Skip reasons: ${snapshot.sourceQuality.byReason.title} title, ${snapshot.sourceQuality.byReason.location} location, ${snapshot.sourceQuality.byReason.content} content`,
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

${livePreflight}${sourceQuality}${cvQuality}${scanHistory}${sourceOutcomes}## Prepared Queue

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

function renderPreparedSummaryItem(item: ProgressApplicationItem, index: number): string {
  const lines = [
    `${index}. ${escapeMarkdownLine(item.company)} - ${escapeMarkdownLine(item.title)}`,
    `   - Status: ${escapeMarkdownLine(humanizeIdentifier(item.status))}`,
    `   - Next: ${escapeMarkdownLine(item.nextStep)}`,
    `   - CV: ${item.cvDocxPath ? escapeMarkdownLine(item.cvDocxPath) : "missing"}`,
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

function escapeMarkdownLine(value: string): string {
  return value.replaceAll("\r", " ").replaceAll("\n", " ").replaceAll("|", "/").trim();
}
