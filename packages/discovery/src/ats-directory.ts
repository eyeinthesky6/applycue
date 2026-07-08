import type { JobRecord } from "@applycue/core";
import {
  discoverJobsFromCompanyPage,
  type AtsCompanySourceConfig,
  type AtsProviderId,
  type FetchJson,
  type FetchJsonOptions
} from "./ats.js";

export type AtsDirectoryProviderId = "ats_directory";

export interface AtsDirectorySourceConfig {
  id?: string;
  label: string;
  provider: AtsDirectoryProviderId;
  query?: string;
  enabled?: boolean;
  options?: Record<string, unknown>;
}

export interface DiscoverAtsDirectoriesOptions {
  fetchJson?: FetchJson;
  onWarning?: (message: string) => void;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DATASET_BASE = "https://raw.githubusercontent.com/Feashliaa/job-board-aggregator/main/data";
const SLUG_RE = /^[A-Za-z0-9._-]+$/;
type DirectoryAtsProviderId = Extract<AtsProviderId, "greenhouse" | "lever" | "ashby">;
const DEFAULT_DIRECTORY_PROVIDERS: DirectoryAtsProviderId[] = ["greenhouse", "lever", "ashby"];

const DIRECTORY_SOURCES: Record<DirectoryAtsProviderId, {
  datasetUrl: string;
  toCompanySource: (slug: string, source: AtsDirectorySourceConfig) => AtsCompanySourceConfig | undefined;
}> = {
  greenhouse: {
    datasetUrl: `${DATASET_BASE}/greenhouse_companies.json`,
    toCompanySource: (slug, source) =>
      companySourceOnHost({
        careersUrl: `https://job-boards.greenhouse.io/${slug}`,
        expectedHost: "job-boards.greenhouse.io",
        provider: "greenhouse",
        slug,
        source
      })
  },
  lever: {
    datasetUrl: `${DATASET_BASE}/lever_companies.json`,
    toCompanySource: (slug, source) =>
      companySourceOnHost({
        careersUrl: `https://jobs.lever.co/${slug}`,
        expectedHost: "jobs.lever.co",
        provider: "lever",
        slug,
        source
      })
  },
  ashby: {
    datasetUrl: `${DATASET_BASE}/ashby_companies.json`,
    toCompanySource: (slug, source) =>
      companySourceOnHost({
        careersUrl: `https://jobs.ashbyhq.com/${slug}`,
        expectedHost: "jobs.ashbyhq.com",
        provider: "ashby",
        slug,
        source
      })
  }
};

export function parseAtsDirectorySources(value: unknown): AtsDirectorySourceConfig[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): AtsDirectorySourceConfig[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (record.provider !== "ats_directory") return [];
    const label = stringValue(record.label) ?? stringValue(record.name) ?? stringValue(record.id) ?? "Reverse ATS directory";
    const source: AtsDirectorySourceConfig = { label, provider: "ats_directory" };
    const id = stringValue(record.id);
    const query = stringValue(record.query);
    const options = parseOptions(record.options);
    if (id) source.id = id;
    if (query) source.query = query;
    if (typeof record.enabled === "boolean") source.enabled = record.enabled;
    if (options) source.options = options;
    return [source];
  });
}

export async function discoverJobsFromAtsDirectories(
  sources: AtsDirectorySourceConfig[],
  options: DiscoverAtsDirectoriesOptions = {}
): Promise<JobRecord[]> {
  const fetchJson = options.fetchJson ?? defaultFetchJson;
  const jobGroups = await Promise.all(
    sources
      .filter((source) => source.enabled !== false)
      .map(async (source) => {
        try {
          return await discoverJobsFromAtsDirectory(source, fetchJson);
        } catch (error) {
          options.onWarning?.(`${source.label}: ${error instanceof Error ? error.message : String(error)}`);
          return [];
        }
      })
  );
  return uniqueJobsById(jobGroups.flat());
}

export async function discoverJobsFromAtsDirectory(
  source: AtsDirectorySourceConfig,
  fetchJson: FetchJson = defaultFetchJson
): Promise<JobRecord[]> {
  const providers = directoryProviders(source);
  const limit = limitPerProvider(source);
  const batchSize = directoryBatchSize(source);
  const jobs: JobRecord[] = [];

  for (const provider of providers) {
    const directory = DIRECTORY_SOURCES[provider];
    const payload = await fetchJson(directory.datasetUrl, { timeoutMs: 30_000 });
    const slugs = asArray(payload).map((entry) => stringValue(entry)).filter((entry): entry is string => Boolean(entry));
    const selectedSlugs = sampleSlugs(slugs, limit, sampleStrategy(source));
    const companySources = selectedSlugs
      .map((slug) => directory.toCompanySource(slug, source))
      .filter((entry): entry is AtsCompanySourceConfig => Boolean(entry));
    jobs.push(...await discoverCompanySourcesInBatches(companySources, fetchJson, batchSize));
  }

  return uniqueJobsById(jobs);
}

async function discoverCompanySourcesInBatches(
  sources: AtsCompanySourceConfig[],
  fetchJson: FetchJson,
  batchSize: number
): Promise<JobRecord[]> {
  const jobs: JobRecord[] = [];
  for (let index = 0; index < sources.length; index += batchSize) {
    const batch = sources.slice(index, index + batchSize);
    const groups = await Promise.all(
      batch.map(async (source) => {
        try {
          return await discoverJobsFromCompanyPage(source, fetchJson);
        } catch {
          return [];
        }
      })
    );
    jobs.push(...groups.flat());
  }
  return jobs;
}

function companySourceOnHost(input: {
  careersUrl: string;
  expectedHost: string;
  provider: AtsProviderId;
  slug: string;
  source: AtsDirectorySourceConfig;
}): AtsCompanySourceConfig | undefined {
  if (!SLUG_RE.test(input.slug)) return undefined;
  let hostname = "";
  try {
    hostname = new URL(input.careersUrl).hostname;
  } catch {
    return undefined;
  }
  if (hostname !== input.expectedHost) return undefined;
  const companySource: AtsCompanySourceConfig = {
    company: slugToCompanyName(input.slug),
    provider: input.provider,
    careersUrl: input.careersUrl,
    enabled: true
  };
  if (input.source.id) companySource.id = `${input.source.id}-${input.provider}-${slugify(input.slug)}`;
  return companySource;
}

function directoryProviders(source: AtsDirectorySourceConfig): DirectoryAtsProviderId[] {
  const configured = stringArray(source.options?.providers)
    .map((provider) => parseAtsProvider(provider))
    .filter((provider): provider is DirectoryAtsProviderId => Boolean(provider));
  return unique(configured.length > 0 ? configured : DEFAULT_DIRECTORY_PROVIDERS);
}

function parseAtsProvider(value?: string): DirectoryAtsProviderId | undefined {
  if (value === "greenhouse" || value === "lever" || value === "ashby") return value;
  return undefined;
}

function limitPerProvider(source: AtsDirectorySourceConfig): number {
  const limit = numberValue(source.options?.limitPerProvider) ?? numberValue(source.options?.limit) ?? 25;
  return Math.max(1, Math.min(75, Math.floor(limit)));
}

function directoryBatchSize(source: AtsDirectorySourceConfig): number {
  const batchSize = numberValue(source.options?.batchSize) ?? 8;
  return Math.max(1, Math.min(15, Math.floor(batchSize)));
}

function sampleStrategy(source: AtsDirectorySourceConfig): "prefix" | "spread" {
  return source.options?.sample === "prefix" ? "prefix" : "spread";
}

function sampleSlugs(slugs: string[], limit: number, strategy: "prefix" | "spread"): string[] {
  const safeSlugs = unique(slugs.filter((slug) => SLUG_RE.test(slug)));
  if (safeSlugs.length <= limit || strategy === "prefix") return safeSlugs.slice(0, limit);
  const selected: string[] = [];
  for (let index = 0; index < limit; index += 1) {
    selected.push(safeSlugs[Math.floor((index * safeSlugs.length) / limit)] ?? safeSlugs[index] ?? "");
  }
  return unique(selected.filter(Boolean));
}

async function defaultFetchJson(url: string, options: FetchJsonOptions = {}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        ...(options.headers ?? {})
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} while fetching ${url}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function parseOptions(value: unknown): Record<string, unknown> | undefined {
  const record = asRecord(value);
  return Object.keys(record).length > 0 ? record : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(stringValue).filter((item): item is string => Boolean(item));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : undefined;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function slugToCompanyName(slug: string): string {
  return slug
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || slug;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ats-directory";
}

function uniqueJobsById(jobs: JobRecord[]): JobRecord[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (seen.has(job.id)) return false;
    seen.add(job.id);
    return true;
  });
}
