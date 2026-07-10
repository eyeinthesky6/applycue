import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type {
  ApplicationRecord,
  ApplyMode,
  JobRecord,
  JobSource,
  ProgressScanHistoryRepostCluster,
  ProgressScanHistorySummary,
  ScanHistoryEntry,
  ScanHistoryStatus
} from "@applycue/core";

export interface ScanHistorySkippedJob {
  job: JobRecord;
  status: Extract<ScanHistoryStatus, "prepared" | "closed">;
}

export type JobDedupeReason = "same_url" | "same_company_similar_role";

export interface JobDedupeSkippedJob {
  duplicateOf: JobRecord;
  job: JobRecord;
  reason: JobDedupeReason;
}

export interface JobDedupeResult {
  jobs: JobRecord[];
  skipped: JobDedupeSkippedJob[];
  summary: {
    inputJobs: number;
    keptJobs: number;
    skippedByReason: Record<JobDedupeReason, number>;
    skippedJobs: number;
  };
}

export interface ScanHistoryFilterResult {
  jobs: JobRecord[];
  skipped: ScanHistorySkippedJob[];
  summary: ProgressScanHistorySummary;
}

export interface ScanHistoryFilterOptions {
  historyPath?: string;
  mode: ApplyMode;
  repostWindowDays?: number;
  skipSourceKinds?: JobSource["kind"][];
}

const DEFAULT_SKIP_SOURCE_KINDS: JobSource["kind"][] = [
  "company_site",
  "ats",
  "job_board",
  "social_post",
  "community_post",
  "newsletter",
  "recruiter_message",
  "email_alert",
  "unknown"
];

const DEFAULT_REPOST_WINDOW_DAYS = 90;

const ROLE_STOPWORDS = new Set([
  "junior", "mid", "middle", "senior", "staff", "principal", "lead", "head",
  "chief", "associate", "intern", "entry", "level", "remote", "hybrid",
  "onsite", "contract", "contractor", "freelance", "fulltime", "parttime",
  "permanent", "temporary", "internship", "role", "position", "opportunity",
  "team", "based", "bangalore", "bengaluru", "mumbai", "delhi", "hyderabad",
  "pune", "chennai", "gurugram", "gurgaon", "noida", "india", "apac",
  "emea", "europe", "americas", "with", "from", "into", "over"
]);

const SHORT_ROLE_TOKENS = new Set(["api", "sre", "sdk", "crm", "erp", "ux", "ui"]);

const BASELINE_ROLE_TOKENS = new Set([
  "software", "engineer", "developer", "manager", "architect", "analyst",
  "designer", "consultant", "specialist", "platform", "systems", "services",
  "backend", "frontend", "full", "stack", "fullstack", "product"
]);

export async function readScanHistoryEntries(filePath: string): Promise<ScanHistoryEntry[]> {
  let content = "";
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    return [];
  }

  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseScanHistoryLine)
    .filter((entry): entry is ScanHistoryEntry => Boolean(entry));
}

export async function appendScanHistoryEntries(filePath: string, entries: ScanHistoryEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
}

export function filterJobsByScanHistory(
  jobs: JobRecord[],
  entries: ScanHistoryEntry[],
  options: ScanHistoryFilterOptions
): ScanHistoryFilterResult {
  const skippableSourceKinds = new Set(options.skipSourceKinds ?? DEFAULT_SKIP_SOURCE_KINDS);
  const shouldSkip = options.mode !== "review";
  const repostWindowDays = options.repostWindowDays ?? DEFAULT_REPOST_WINDOW_DAYS;
  const observedEntries = buildScanHistoryEntries(jobs, []);
  const reposts = detectScanHistoryReposts([...entries, ...observedEntries], repostWindowDays);
  const latestStatusByKey = buildLatestBlockingStatusByKey(entries);
  const preparedEntriesByCompany = buildPreparedEntriesByCompany(entries);
  const kept: JobRecord[] = [];
  const skipped: ScanHistorySkippedJob[] = [];

  for (const job of jobs) {
    const status = latestStatusByKey.get(scanHistoryKeyForJob(job)) ?? findPreparedSimilarRoleStatus(job, preparedEntriesByCompany);
    if (shouldSkip && status && skippableSourceKinds.has(job.source.kind)) {
      skipped.push({ job, status });
      continue;
    }
    kept.push(job);
  }

  return {
    jobs: kept,
    skipped,
    summary: {
      ...(options.historyPath ? { historyPath: options.historyPath } : {}),
      inputJobs: jobs.length,
      keptJobs: kept.length,
      mode: options.mode,
      recordedJobs: 0,
      repostClusters: reposts.length,
      repostWindowDays,
      repostedJobs: uniqueRepostedUrlCount(reposts),
      skippedClosed: skipped.filter((item) => item.status === "closed").length,
      skippedJobs: skipped.length,
      skippedPrepared: skipped.filter((item) => item.status === "prepared").length,
      topReposts: reposts.slice(0, 3)
    }
  };
}

export function dedupeJobsForShortlist(jobs: JobRecord[]): JobDedupeResult {
  const kept: JobRecord[] = [];
  const skipped: JobDedupeSkippedJob[] = [];
  const keptByUrl = new Map<string, JobRecord>();
  const skippedByReason: Record<JobDedupeReason, number> = {
    same_url: 0,
    same_company_similar_role: 0
  };

  for (const job of jobs) {
    const urlKey = scanHistoryKeyForJob(job);
    const urlDuplicate = urlKey ? keptByUrl.get(urlKey) : undefined;
    if (urlDuplicate && job.source.kind !== "manual") {
      skipped.push({ duplicateOf: urlDuplicate, job, reason: "same_url" });
      skippedByReason.same_url += 1;
      continue;
    }

    const similarDuplicate = findSimilarKeptJob(job, kept);
    if (similarDuplicate && job.source.kind !== "manual") {
      skipped.push({ duplicateOf: similarDuplicate, job, reason: "same_company_similar_role" });
      skippedByReason.same_company_similar_role += 1;
      continue;
    }

    kept.push(job);
    if (urlKey && !keptByUrl.has(urlKey)) keptByUrl.set(urlKey, job);
  }

  return {
    jobs: kept,
    skipped,
    summary: {
      inputJobs: jobs.length,
      keptJobs: kept.length,
      skippedByReason,
      skippedJobs: skipped.length
    }
  };
}

export function detectScanHistoryReposts(
  entries: ScanHistoryEntry[],
  windowDays = DEFAULT_REPOST_WINDOW_DAYS
): ProgressScanHistoryRepostCluster[] {
  const valid = entries
    .map((entry) => ({ entry, seenAt: parseSeenAt(entry.firstSeenAt) ?? parseSeenAt(entry.lastSeenAt) }))
    .filter((item): item is { entry: ScanHistoryEntry; seenAt: Date } =>
      item.entry.status !== "closed" &&
      item.entry.sourceKind !== "manual" &&
      item.seenAt instanceof Date &&
      !Number.isNaN(item.seenAt.getTime()) &&
      item.entry.url.trim().length > 0 &&
      item.entry.company.trim().length > 0 &&
      item.entry.title.trim().length > 0
    );
  const byCompany = new Map<string, Array<{ entry: ScanHistoryEntry; seenAt: Date }>>();

  for (const item of valid) {
    const key = normalizeCompany(item.entry.company);
    if (!key) continue;
    const group = byCompany.get(key) ?? [];
    group.push(item);
    byCompany.set(key, group);
  }

  const clusters: ProgressScanHistoryRepostCluster[] = [];
  const seenClusterKeys = new Set<string>();
  for (const companyRows of byCompany.values()) {
    if (companyRows.length < 2) continue;
    for (const titleGroup of groupRowsBySimilarRole(companyRows)) {
      for (const cluster of clustersInWindow(titleGroup, windowDays)) {
        const key = cluster.urls.slice().sort().join("\n");
        if (seenClusterKeys.has(key)) continue;
        seenClusterKeys.add(key);
        clusters.push(cluster);
      }
    }
  }

  return clusters.sort((a, b) => {
    if (a.lastSeenAt !== b.lastSeenAt) return a.lastSeenAt < b.lastSeenAt ? 1 : -1;
    return b.appearances - a.appearances;
  });
}

export function buildScanHistoryEntries(
  jobs: JobRecord[],
  applications: ApplicationRecord[],
  now = new Date().toISOString()
): ScanHistoryEntry[] {
  const applicationsByJobId = new Map(applications.map((application) => [application.jobId, application]));
  const entriesByKey = new Map<string, ScanHistoryEntry>();

  for (const job of jobs) {
    const application = applicationsByJobId.get(job.id);
    const entry: ScanHistoryEntry = {
      jobId: job.id,
      url: job.url,
      company: job.company,
      title: job.title,
      sourceId: job.source.id,
      sourceName: job.source.name,
      sourceKind: job.source.kind,
      status: scanHistoryStatusForJob(job, application),
      firstSeenAt: now,
      lastSeenAt: now,
      seenCount: 1
    };
    if (application?.id) entry.applicationId = application.id;
    if (application?.cvVariantId) entry.cvVariantId = application.cvVariantId;
    entriesByKey.set(scanHistoryKeyForJob(job), entry);
  }

  return [...entriesByKey.values()];
}

export function scanHistoryKeyForJob(job: JobRecord): string {
  return normalizeHistoryKey(job.url || job.id);
}

function scanHistoryKeyForEntry(entry: ScanHistoryEntry): string {
  return normalizeHistoryKey(entry.url || entry.jobId);
}

function scanHistoryStatusForJob(job: JobRecord, application?: ApplicationRecord): ScanHistoryStatus {
  if (job.liveState === "closed") return "closed";
  if (application?.status === "prepared" || application?.status === "submitted" || application?.status === "confirmation_received") {
    return "prepared";
  }
  return "seen";
}

function buildLatestBlockingStatusByKey(
  entries: ScanHistoryEntry[]
): Map<string, Extract<ScanHistoryStatus, "prepared" | "closed">> {
  const latestByKey = new Map<string, ScanHistoryEntry>();
  for (const entry of entries) {
    if (entry.status !== "prepared" && entry.status !== "closed") continue;
    const key = scanHistoryKeyForEntry(entry);
    const current = latestByKey.get(key);
    if (!current || entry.lastSeenAt >= current.lastSeenAt) latestByKey.set(key, entry);
  }

  return new Map(
    [...latestByKey.entries()].map(([key, entry]) => [key, entry.status as Extract<ScanHistoryStatus, "prepared" | "closed">])
  );
}

function buildPreparedEntriesByCompany(entries: ScanHistoryEntry[]): Map<string, ScanHistoryEntry[]> {
  const byCompany = new Map<string, ScanHistoryEntry[]>();
  for (const entry of entries) {
    if (entry.status !== "prepared") continue;
    const company = normalizeCompany(entry.company);
    if (!isKnownCompanyKey(company)) continue;
    const rows = byCompany.get(company) ?? [];
    rows.push(entry);
    byCompany.set(company, rows);
  }
  return byCompany;
}

function findPreparedSimilarRoleStatus(
  job: JobRecord,
  preparedEntriesByCompany: Map<string, ScanHistoryEntry[]>
): Extract<ScanHistoryStatus, "prepared"> | undefined {
  const company = normalizeCompany(job.company);
  if (!isKnownCompanyKey(company)) return undefined;
  const entries = preparedEntriesByCompany.get(company) ?? [];
  return entries.some((entry) => sameOrSimilarRole(entry.title, job.title)) ? "prepared" : undefined;
}

function findSimilarKeptJob(job: JobRecord, kept: JobRecord[]): JobRecord | undefined {
  const company = normalizeCompany(job.company);
  if (!isKnownCompanyKey(company)) return undefined;
  return kept.find((candidate) =>
    normalizeCompany(candidate.company) === company &&
    likelySamePosting(candidate, job)
  );
}

function likelySamePosting(first: JobRecord, second: JobRecord): boolean {
  if (!sameOrSimilarRole(first.title, second.title)) return false;
  if (compatibleLocation(first, second)) return true;
  if (compatibleWorkMode(first, second)) return true;
  if (crossPostedSourcePair(first.source.kind, second.source.kind)) return true;
  if (similarDescription(first.description, second.description)) return true;
  return !first.location?.trim() || !second.location?.trim() || !first.description?.trim() || !second.description?.trim();
}

function compatibleLocation(first: JobRecord, second: JobRecord): boolean {
  const firstLocation = normalizeLocation(first.location ?? "");
  const secondLocation = normalizeLocation(second.location ?? "");
  if (!firstLocation || !secondLocation) return false;
  return firstLocation === secondLocation ||
    firstLocation.includes(secondLocation) ||
    secondLocation.includes(firstLocation);
}

function compatibleWorkMode(first: JobRecord, second: JobRecord): boolean {
  return first.workMode !== "unknown" && first.workMode === second.workMode;
}

function crossPostedSourcePair(first: JobSource["kind"], second: JobSource["kind"]): boolean {
  const sourceKinds = new Set([first, second]);
  return sourceKinds.has("job_board") && (sourceKinds.has("company_site") || sourceKinds.has("ats"));
}

function similarDescription(first: string, second: string): boolean {
  const firstTokens = contentTokens(first);
  const secondTokens = contentTokens(second);
  if (firstTokens.length < 8 || secondTokens.length < 8) return false;
  const secondSet = new Set(secondTokens);
  const overlap = new Set(firstTokens.filter((token) => secondSet.has(token))).size;
  const union = new Set([...firstTokens, ...secondTokens]).size;
  return union > 0 && overlap / union >= 0.45;
}

function contentTokens(value: string): string[] {
  return normalizeRoleText(value)
    .split(" ")
    .filter((token) => token.length > 3 && !ROLE_STOPWORDS.has(token) && !BASELINE_ROLE_TOKENS.has(token));
}

function groupRowsBySimilarRole(
  rows: Array<{ entry: ScanHistoryEntry; seenAt: Date }>
): Array<Array<{ entry: ScanHistoryEntry; seenAt: Date }>> {
  const unused = new Set(rows);
  const groups: Array<Array<{ entry: ScanHistoryEntry; seenAt: Date }>> = [];

  for (const row of rows) {
    if (!unused.has(row)) continue;
    unused.delete(row);
    const group = [row];
    for (const other of [...unused]) {
      if (sameOrSimilarRole(row.entry.title, other.entry.title)) {
        unused.delete(other);
        group.push(other);
      }
    }
    groups.push(group);
  }

  return groups;
}

function clustersInWindow(
  rows: Array<{ entry: ScanHistoryEntry; seenAt: Date }>,
  windowDays: number
): ProgressScanHistoryRepostCluster[] {
  const sorted = [...rows].sort((a, b) => a.seenAt.getTime() - b.seenAt.getTime());
  const clusters: ProgressScanHistoryRepostCluster[] = [];

  for (let start = 0; start < sorted.length; start += 1) {
    const first = sorted[start];
    if (!first) continue;
    const windowRows = sorted.filter((row) => daysBetween(first.seenAt, row.seenAt) >= 0 &&
      daysBetween(first.seenAt, row.seenAt) <= windowDays);
    const cluster = buildRepostCluster(windowRows, windowDays);
    if (cluster) clusters.push(cluster);
  }

  return clusters;
}

function buildRepostCluster(
  rows: Array<{ entry: ScanHistoryEntry; seenAt: Date }>,
  windowDays: number
): ProgressScanHistoryRepostCluster | undefined {
  const byUrl = new Map<string, { entry: ScanHistoryEntry; seenAt: Date }>();
  for (const row of rows) {
    const key = normalizeHistoryKey(row.entry.url);
    const current = byUrl.get(key);
    if (!current || row.seenAt < current.seenAt) byUrl.set(key, row);
  }
  const deduped = [...byUrl.values()];
  if (deduped.length < 2) return undefined;

  const sorted = deduped.sort((a, b) => a.seenAt.getTime() - b.seenAt.getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return undefined;
  const daysSpan = daysBetween(first.seenAt, last.seenAt);
  if (daysSpan > windowDays) return undefined;

  return {
    company: last.entry.company,
    role: last.entry.title,
    appearances: sorted.length,
    firstSeenAt: first.entry.firstSeenAt,
    lastSeenAt: last.entry.firstSeenAt,
    daysSpan,
    urls: sorted.map((row) => row.entry.url)
  };
}

function sameOrSimilarRole(first: string, second: string): boolean {
  if (normalizeRoleText(first) === normalizeRoleText(second)) return true;
  const firstRoleKey = canonicalRoleKey(first);
  const secondRoleKey = canonicalRoleKey(second);
  if (firstRoleKey && firstRoleKey === secondRoleKey) return true;
  const firstTokens = [...new Set(roleTokens(first))];
  const secondTokens = [...new Set(roleTokens(second))];
  if (firstTokens.length === 0 || secondTokens.length === 0) return false;
  const secondSet = new Set(secondTokens);
  const overlap = firstTokens.filter((token) => secondSet.has(token));
  if (overlap.length < 2) return false;
  if (overlap.every((token) => BASELINE_ROLE_TOKENS.has(token))) return false;
  const union = new Set([...firstTokens, ...secondTokens]).size;
  return overlap.length / union >= 0.6;
}

function roleTokens(role: string): string[] {
  return normalizeRoleText(role)
    .split(" ")
    .filter((token) => (token.length > 3 || SHORT_ROLE_TOKENS.has(token)) && !ROLE_STOPWORDS.has(token));
}

function canonicalRoleKey(role: string): string {
  return roleTokens(role)
    .filter((token) => !["of", "and", "the"].includes(token))
    .join(" ");
}

function normalizeRoleText(role: string): string {
  return role.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeCompany(company: string): string {
  return company.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeLocation(location: string): string {
  return location.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function isKnownCompanyKey(company: string): boolean {
  return Boolean(company) &&
    company !== "unknown" &&
    company !== "unknown company" &&
    company !== "confidential" &&
    company !== "stealth";
}

function parseSeenAt(value: string): Date | undefined {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function daysBetween(first: Date, second: Date): number {
  return Math.round((second.getTime() - first.getTime()) / 86_400_000);
}

function uniqueRepostedUrlCount(clusters: ProgressScanHistoryRepostCluster[]): number {
  return new Set(clusters.flatMap((cluster) => cluster.urls.map(normalizeHistoryKey))).size;
}

function normalizeHistoryKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    url.hash = "";
    url.searchParams.sort();
    const pathname = url.pathname.replace(/\/+$/g, "");
    return `${url.protocol}//${url.hostname.toLowerCase()}${pathname}${url.search}`.toLowerCase();
  } catch {
    return trimmed.toLowerCase().replace(/\s+/g, " ");
  }
}

function parseScanHistoryLine(line: string): ScanHistoryEntry | undefined {
  try {
    const parsed = JSON.parse(line) as unknown;
    return coerceScanHistoryEntry(parsed);
  } catch {
    return undefined;
  }
}

function coerceScanHistoryEntry(value: unknown): ScanHistoryEntry | undefined {
  if (!isObject(value)) return undefined;
  const status = value.status;
  if (status !== "seen" && status !== "prepared" && status !== "closed") return undefined;
  if (!isJobSourceKind(value.sourceKind)) return undefined;

  const jobId = requiredString(value.jobId);
  const url = requiredString(value.url);
  const company = requiredString(value.company);
  const title = requiredString(value.title);
  const sourceId = requiredString(value.sourceId);
  const sourceName = requiredString(value.sourceName);
  const firstSeenAt = requiredString(value.firstSeenAt);
  const lastSeenAt = requiredString(value.lastSeenAt);
  if (!jobId || !url || !company || !title || !sourceId || !sourceName || !firstSeenAt || !lastSeenAt) {
    return undefined;
  }
  const seenCount = typeof value.seenCount === "number" && Number.isFinite(value.seenCount)
    ? Math.max(1, Math.floor(value.seenCount))
    : 1;

  const entry: ScanHistoryEntry = {
    jobId,
    url,
    company,
    title,
    sourceId,
    sourceName,
    sourceKind: value.sourceKind,
    status,
    firstSeenAt,
    lastSeenAt,
    seenCount
  };
  if (typeof value.applicationId === "string" && value.applicationId.trim()) entry.applicationId = value.applicationId;
  if (typeof value.cvVariantId === "string" && value.cvVariantId.trim()) entry.cvVariantId = value.cvVariantId;
  return entry;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isJobSourceKind(value: unknown): value is JobSource["kind"] {
  return value === "company_site" ||
    value === "ats" ||
    value === "job_board" ||
    value === "social_post" ||
    value === "community_post" ||
    value === "newsletter" ||
    value === "recruiter_message" ||
    value === "email_alert" ||
    value === "manual" ||
    value === "unknown";
}
