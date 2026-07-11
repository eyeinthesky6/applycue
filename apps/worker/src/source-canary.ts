import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JobRecord } from "@applycue/core";
import {
  discoverJobsFromAtsDirectories,
  discoverJobsFromCompanyPages,
  discoverJobsFromJobBoards,
  parseAtsCompanySources,
  parseAtsDirectorySources,
  parseJobBoardSources,
  type FetchJson,
  type FetchText,
  type JobHiveRunner,
  type JobSpyRunner
} from "@applycue/discovery";
import { getApplyCueProfileConfigPath, loadApplyCueConfig } from "@applycue/profile";

export type SourceCanaryItemStatus = "pass" | "warn" | "fail" | "skipped";
export type SourceCanaryStatus = Exclude<SourceCanaryItemStatus, "skipped">;

export interface SourceCanaryOptions {
  applyCueHome?: string;
  atsDirectoryFetchJson?: FetchJson;
  atsDirectoryFetchText?: FetchText;
  companyPageFetchJson?: FetchJson;
  companyPageFetchText?: FetchText;
  configPath?: string;
  generatedAt?: string;
  includeDisabled?: boolean;
  includeJobSpy?: boolean;
  jobHiveRunner?: JobHiveRunner;
  includeAtsDirectory?: boolean;
  jobBoardFetchJson?: FetchJson;
  jobSpyLimit?: number;
  jobSpyRunner?: JobSpyRunner;
  profileKey?: string;
  workspaceRoot?: string;
  writeFiles?: boolean;
}

export interface SourceCanaryCompleteness {
  company: number;
  description: number;
  location: number;
  postedAt: number;
  title: number;
  url: number;
}

export interface SourceCanaryItem {
  completedAt: string;
  completeness: SourceCanaryCompleteness;
  durationMs: number;
  enabled: boolean;
  fetchedJobs: number;
  id: string;
  kind: "company_page" | "job_board" | "ats_directory";
  knownPostedAtJobs: number;
  label: string;
  closedJobs: number;
  provider: string;
  reason: string;
  staleKnownJobs: number;
  startedAt: string;
  status: SourceCanaryItemStatus;
  unknownPostedAtJobs: number;
}

export interface SourceCanaryReport {
  configPath: string;
  counts: {
    configuredPublicSources: number;
    excludedInteractiveSources: number;
    failed: number;
    healthy: number;
    parsedPublicSources: number;
    skipped: number;
    unparsedPublicSources: number;
    warned: number;
  };
  freshnessDays: number;
  generatedAt: string;
  id: string;
  notes: string[];
  paths: {
    jsonReport: string;
    latestJson: string;
    latestMarkdown: string;
    markdownReport: string;
  };
  profileId: string;
  sources: SourceCanaryItem[];
  status: SourceCanaryStatus;
  summary: string;
}

export async function runSourceCanary(options: SourceCanaryOptions = {}): Promise<SourceCanaryReport> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const configPath = await resolveConfigPath(options, workspaceRoot);
  const loaded = await loadApplyCueConfig(configPath);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const freshnessDays = loaded.profile.searchSettings.freshnessDays ?? 30;
  const companySources = parseAtsCompanySources(loaded.config.sources?.companyPages);
  const jobBoardSources = parseJobBoardSources(loaded.config.sources?.jobBoards);
  const atsDirectorySources = parseAtsDirectorySources(loaded.config.sources?.searches);
  const configuredPublicSources = countArray(loaded.config.sources?.companyPages) +
    countArray(loaded.config.sources?.jobBoards) +
    countAtsDirectoryEntries(loaded.config.sources?.searches);
  const parsedPublicSources = companySources.length + jobBoardSources.length + atsDirectorySources.length;
  const excludedInteractiveSources = countEnabledEntries(loaded.config.sources?.loggedInBrowserSources);

  const companyResults = [] as SourceCanaryItem[];
  for (const [index, source] of companySources.entries()) {
    companyResults.push(await runOneSource({
      enabled: source.enabled !== false,
      freshnessDays,
      generatedAt,
      id: source.id ?? `company-page-${index + 1}`,
      kind: "company_page",
      label: source.company,
      provider: source.provider ?? "inferred",
      runDisabled: options.includeDisabled === true,
      run: async (warnings) => discoverJobsFromCompanyPages([
        options.includeDisabled === true ? { ...source, enabled: true } : source
      ], {
        concurrency: 1,
        ...(options.companyPageFetchJson ? { fetchJson: options.companyPageFetchJson } : {}),
        ...(options.companyPageFetchText ? { fetchText: options.companyPageFetchText } : {}),
        onWarning: (warning) => warnings.push(warning)
      })
    }));
  }

  const boardResults = [] as SourceCanaryItem[];
  let jobSpyCanaries = 0;
  const jobSpyLimit = options.includeJobSpy === true ? Math.max(1, Math.floor(options.jobSpyLimit ?? 1)) : 0;
  for (const [index, source] of jobBoardSources.entries()) {
    const isJobSpy = source.provider === "jobspy";
    const includeSource = !isJobSpy || jobSpyCanaries < jobSpyLimit;
    if (isJobSpy && includeSource) jobSpyCanaries += 1;
    boardResults.push(await runOneSource({
      enabled: source.enabled !== false,
      freshnessDays,
      generatedAt,
      id: source.id ?? `job-board-${index + 1}`,
      kind: "job_board",
      label: source.label,
      provider: source.provider,
      runDisabled: options.includeDisabled === true,
      ...(includeSource
        ? {}
        : { skipReason: jobSpyLimit === 0
          ? "JobSpy canary is opt-in; rerun with --include-jobspy to test one approved query."
          : `JobSpy canary limit reached (${jobSpyLimit}).` }),
      run: async (warnings) => discoverJobsFromJobBoards([
        options.includeDisabled === true ? { ...source, enabled: true } : source
      ], {
        concurrency: 1,
        ...(options.jobBoardFetchJson ? { fetchJson: options.jobBoardFetchJson } : {}),
        ...(options.jobHiveRunner ? { jobHiveRunner: options.jobHiveRunner } : {}),
        ...(options.jobSpyRunner ? { jobSpyRunner: options.jobSpyRunner } : {}),
        onWarning: (warning) => warnings.push(warning)
      })
    }));
  }

  const reverseResults = [] as SourceCanaryItem[];
  for (const [index, source] of atsDirectorySources.entries()) {
    reverseResults.push(await runOneSource({
      enabled: source.enabled !== false,
      freshnessDays,
      generatedAt,
      id: source.id ?? `ats-directory-${index + 1}`,
      kind: "ats_directory",
      label: source.label,
      provider: source.provider,
      runDisabled: options.includeDisabled === true,
      ...(options.includeAtsDirectory === true
        ? {}
        : { skipReason: "JobHive ATS directory can fan out to many company APIs; rerun with --include-ats-directory for an explicit bounded canary." }),
      run: async (warnings) => discoverJobsFromAtsDirectories([
        options.includeDisabled === true ? { ...source, enabled: true } : source
      ], {
        ...(options.atsDirectoryFetchJson ? { fetchJson: options.atsDirectoryFetchJson } : {}),
        ...(options.atsDirectoryFetchText ? { fetchText: options.atsDirectoryFetchText } : {}),
        onWarning: (warning) => warnings.push(warning)
      })
    }));
  }

  const sources = [...companyResults, ...boardResults, ...reverseResults];
  const unparsedPublicSources = Math.max(0, configuredPublicSources - parsedPublicSources);
  const counts = summarizeCounts(sources, {
    configuredPublicSources,
    excludedInteractiveSources,
    parsedPublicSources,
    unparsedPublicSources
  });
  const status = summarizeStatus(sources, unparsedPublicSources);
  const id = `source-canary-${fileSafeTimestamp(generatedAt)}`;
  const reportDir = path.join(loaded.configDir, "outputs", "source-canaries");
  const paths = {
    jsonReport: path.join(reportDir, `${id}.json`),
    latestJson: path.join(reportDir, "latest.json"),
    latestMarkdown: path.join(reportDir, "latest.md"),
    markdownReport: path.join(reportDir, `${id}.md`)
  };
  const notes = [
    "Canary checked only configured public adapters; it did not rank jobs, generate CVs, or prepare applications.",
    "Empty results are WARN because an empty search is not proof that the provider is broken.",
    "JobSpy is opt-in and defaults to one approved query to avoid turning a canary into a broad scrape.",
    ...(options.includeDisabled === true
      ? ["Disabled configured sources were probed for health only; their saved enabled state was not changed."]
      : []),
    "The JobHive ATS directory is skipped unless explicitly included because it can fan out to many company APIs.",
    ...(excludedInteractiveSources > 0
      ? [`Excluded ${excludedInteractiveSources} logged-in/browser source(s); those require a separate user-approved session.`]
      : []),
    ...(unparsedPublicSources > 0
      ? [`${unparsedPublicSources} configured public source(s) could not be parsed and need config review.`]
      : [])
  ];
  const report: SourceCanaryReport = {
    configPath: loaded.configPath,
    counts,
    freshnessDays,
    generatedAt,
    id,
    notes,
    paths,
    profileId: loaded.profile.id,
    sources,
    status,
    summary: formatSummary(status, counts)
  };

  if (options.writeFiles !== false) {
    await mkdir(reportDir, { recursive: true });
    const json = `${JSON.stringify(report, null, 2)}\n`;
    const markdown = renderSourceCanaryMarkdown(report);
    await Promise.all([
      writeFile(paths.jsonReport, json, "utf8"),
      writeFile(paths.latestJson, json, "utf8"),
      writeFile(paths.markdownReport, markdown, "utf8"),
      writeFile(paths.latestMarkdown, markdown, "utf8")
    ]);
  }

  return report;
}

async function runOneSource(input: {
  enabled: boolean;
  freshnessDays: number;
  generatedAt: string;
  id: string;
  kind: SourceCanaryItem["kind"];
  label: string;
  provider: string;
  run: (warnings: string[]) => Promise<JobRecord[]>;
  runDisabled?: boolean;
  skipReason?: string;
}): Promise<SourceCanaryItem> {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  if ((!input.enabled && input.runDisabled !== true) || input.skipReason) {
    return emptyItem(input, {
      completedAt: startedAt,
      durationMs: 0,
      reason: input.skipReason ?? "Source is disabled in config.",
      status: "skipped"
    });
  }

  const warnings: string[] = [];
  try {
    const jobs = await input.run(warnings);
    const completedAt = new Date().toISOString();
    const metrics = analyzeJobs(jobs, input.freshnessDays, input.generatedAt);
    if (warnings.length > 0) {
      return itemWithMetrics(input, metrics, {
        completedAt,
        durationMs: Date.now() - startedMs,
        reason: warnings.join(" | "),
        status: "fail"
      });
    }
    if (jobs.length === 0) {
      return itemWithMetrics(input, metrics, {
        completedAt,
        durationMs: Date.now() - startedMs,
        reason: "Provider responded without an error but returned no jobs.",
        status: "warn"
      });
    }
    const staleReason = metrics.knownPostedAtJobs > 0 && metrics.staleKnownJobs === metrics.knownPostedAtJobs
      ? "All jobs with known post dates are outside the configured freshness window."
      : undefined;
    const closedReason = metrics.closedJobs > 0
      ? `${metrics.closedJobs} returned job(s) are explicitly marked closed.`
      : undefined;
    const reason = [staleReason, closedReason].filter(Boolean).join(" ");
    return itemWithMetrics(input, metrics, {
      completedAt,
      durationMs: Date.now() - startedMs,
      reason: reason || `Fetched ${jobs.length} normalized job(s).`,
      status: reason ? "warn" : "pass"
    });
  } catch (error) {
    return emptyItem(input, {
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      reason: error instanceof Error ? error.message : String(error),
      status: "fail"
    });
  }
}

function analyzeJobs(jobs: JobRecord[], freshnessDays: number, generatedAt: string) {
  const cutoff = Date.parse(generatedAt) - freshnessDays * 24 * 60 * 60 * 1_000;
  const knownDates = jobs.flatMap((job) => {
    const timestamp = job.postedAt ? Date.parse(job.postedAt) : Number.NaN;
    return Number.isFinite(timestamp) ? [timestamp] : [];
  });
  return {
    completeness: {
      company: jobs.filter((job) => Boolean(job.company.trim())).length,
      description: jobs.filter((job) => Boolean(job.description.trim())).length,
      location: jobs.filter((job) => Boolean(job.location?.trim())).length,
      postedAt: knownDates.length,
      title: jobs.filter((job) => Boolean(job.title.trim())).length,
      url: jobs.filter((job) => isHttpUrl(job.url)).length
    },
    fetchedJobs: jobs.length,
    knownPostedAtJobs: knownDates.length,
    closedJobs: jobs.filter((job) => job.liveState === "closed").length,
    staleKnownJobs: knownDates.filter((timestamp) => timestamp < cutoff).length,
    unknownPostedAtJobs: jobs.length - knownDates.length
  };
}

function itemWithMetrics(
  input: Parameters<typeof runOneSource>[0],
  metrics: ReturnType<typeof analyzeJobs>,
  result: Pick<SourceCanaryItem, "completedAt" | "durationMs" | "reason" | "status">
): SourceCanaryItem {
  return {
    ...baseItem(input),
    ...metrics,
    ...result
  };
}

function emptyItem(
  input: Parameters<typeof runOneSource>[0],
  result: Pick<SourceCanaryItem, "completedAt" | "durationMs" | "reason" | "status">
): SourceCanaryItem {
  return itemWithMetrics(input, {
    completeness: { company: 0, description: 0, location: 0, postedAt: 0, title: 0, url: 0 },
    fetchedJobs: 0,
    knownPostedAtJobs: 0,
    closedJobs: 0,
    staleKnownJobs: 0,
    unknownPostedAtJobs: 0
  }, result);
}

function baseItem(input: Parameters<typeof runOneSource>[0]) {
  return {
    enabled: input.enabled,
    id: input.id,
    kind: input.kind,
    label: input.label,
    provider: input.provider,
    startedAt: new Date().toISOString()
  };
}

function summarizeStatus(sources: SourceCanaryItem[], unparsedPublicSources: number): SourceCanaryStatus {
  if (sources.some((source) => source.status === "fail")) return "fail";
  if (
    sources.length === 0 ||
    unparsedPublicSources > 0 ||
    sources.some((source) => source.status === "warn" || (source.status === "skipped" && source.enabled))
  ) return "warn";
  return "pass";
}

function summarizeCounts(
  sources: SourceCanaryItem[],
  configured: Pick<SourceCanaryReport["counts"], "configuredPublicSources" | "excludedInteractiveSources" | "parsedPublicSources" | "unparsedPublicSources">
): SourceCanaryReport["counts"] {
  return {
    ...configured,
    failed: sources.filter((source) => source.status === "fail").length,
    healthy: sources.filter((source) => source.status === "pass").length,
    skipped: sources.filter((source) => source.status === "skipped").length,
    warned: sources.filter((source) => source.status === "warn").length
  };
}

function formatSummary(status: SourceCanaryStatus, counts: SourceCanaryReport["counts"]): string {
  return `${status.toUpperCase()}: ${counts.healthy} healthy, ${counts.warned} empty/stale warning, ${counts.failed} failed, ${counts.skipped} skipped across ${counts.parsedPublicSources} parsed public source(s).`;
}

export function renderSourceCanaryMarkdown(report: SourceCanaryReport): string {
  const rows = report.sources.map((source) =>
    `| ${escapeCell(source.label)} | ${escapeCell(source.provider)} | ${source.kind} | ${source.status.toUpperCase()} | ${source.fetchedJobs} | ${source.unknownPostedAtJobs} | ${source.staleKnownJobs} | ${source.durationMs} | ${escapeCell(source.reason)} |`
  );
  return [
    "# ApplyCue Source Canary",
    "",
    `Status: **${report.status.toUpperCase()}**`,
    "",
    `Generated: ${report.generatedAt}`,
    `Profile: ${report.profileId}`,
    `Freshness window: ${report.freshnessDays} day(s)`,
    "",
    report.summary,
    "",
    "| Source | Provider | Kind | Status | Jobs | Unknown date | Stale known | ms | Reason |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |",
    ...(rows.length > 0 ? rows : ["| None configured | - | - | WARN | 0 | 0 | 0 | 0 | No public adapter source is configured. |"]),
    "",
    "## Notes",
    "",
    ...report.notes.map((note) => `- ${note}`),
    ""
  ].join("\n");
}

async function resolveConfigPath(options: SourceCanaryOptions, workspaceRoot: string): Promise<string> {
  if (options.configPath) return path.resolve(options.configPath);
  const profileConfig = getApplyCueProfileConfigPath({
    env: process.env,
    ...(options.applyCueHome ? { applyCueHome: options.applyCueHome } : {}),
    ...(options.profileKey ? { profileKey: options.profileKey } : {})
  });
  if (await fileExists(profileConfig)) return profileConfig;
  const localConfig = path.join(workspaceRoot, "config", "applycue.local.json");
  if (await fileExists(localConfig)) return localConfig;
  throw new Error(`ApplyCue source canary needs an existing profile config. Checked ${profileConfig} and ${localConfig}.`);
}

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function countAtsDirectoryEntries(value: unknown): number {
  return Array.isArray(value)
    ? value.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry) && (entry as Record<string, unknown>).provider === "ats_directory").length
    : 0;
}

function countEnabledEntries(value: unknown): number {
  return Array.isArray(value)
    ? value.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry) && (entry as Record<string, unknown>).enabled !== false).length
    : 0;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function fileSafeTimestamp(value: string): string {
  return value.replace(/[:.]/g, "-");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
