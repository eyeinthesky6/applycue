import type { JobRecord } from "@applycue/core";
import {
  discoverJobsFromCompanyPage,
  type AtsCompanySourceConfig,
  type AtsProviderId,
  type FetchJson,
  type FetchJsonOptions,
  type FetchText
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
  fetchText?: FetchText;
  onWarning?: (message: string) => void;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const JOBHIVE_DATASET_BASE = "https://storage.stapply.ai/jobhive/v1";
const SLUG_RE = /^[A-Za-z0-9._-]+$/;
type DirectoryAtsProviderId = AtsProviderId;
const DEFAULT_DIRECTORY_PROVIDERS: DirectoryAtsProviderId[] = ["greenhouse", "lever", "ashby"];

const DIRECTORY_SOURCES = Object.fromEntries(
  ([
    "greenhouse",
    "lever",
    "ashby",
    "workable",
    "smartrecruiters",
    "bamboohr",
    "breezy",
    "recruitee",
    "pinpoint",
    "workday",
    "personio",
    "rippling"
  ] satisfies DirectoryAtsProviderId[]).map((provider) => [
    provider,
    { datasetUrl: `${JOBHIVE_DATASET_BASE}/${provider}/companies.csv` }
  ])
) as Record<DirectoryAtsProviderId, { datasetUrl: string }>;

interface DirectoryCompany {
  name: string;
  slug: string;
  url: string;
}

export function parseAtsDirectorySources(value: unknown): AtsDirectorySourceConfig[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): AtsDirectorySourceConfig[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (record.provider !== "ats_directory") return [];
    const label = stringValue(record.label) ?? stringValue(record.name) ?? stringValue(record.id) ?? "JobHive ATS directory";
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
  const fetchText = options.fetchText ?? defaultFetchText;
  const jobGroups = await Promise.all(
    sources
      .filter((source) => source.enabled !== false)
      .map(async (source) => {
        try {
          return await discoverJobsFromAtsDirectory(source, fetchJson, fetchText);
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
  fetchJson: FetchJson = defaultFetchJson,
  fetchText: FetchText = defaultFetchText
): Promise<JobRecord[]> {
  const providers = directoryProviders(source);
  const limit = limitPerProvider(source);
  const batchSize = directoryBatchSize(source);
  const jobs: JobRecord[] = [];

  for (const provider of providers) {
    const directory = DIRECTORY_SOURCES[provider];
    const payload = await fetchText(directory.datasetUrl, { timeoutMs: 30_000 });
    const entries = parseDirectoryCsv(payload);
    const selectedEntries = sampleDirectoryEntries(entries, limit, sampleStrategy(source));
    const companySources = selectedEntries
      .map((entry) => toCompanySource(entry, provider, source))
      .filter((entry): entry is AtsCompanySourceConfig => Boolean(entry));
    jobs.push(...await discoverCompanySourcesInBatches(companySources, fetchJson, fetchText, batchSize));
  }

  return uniqueJobsById(jobs);
}

async function discoverCompanySourcesInBatches(
  sources: AtsCompanySourceConfig[],
  fetchJson: FetchJson,
  fetchText: FetchText,
  batchSize: number
): Promise<JobRecord[]> {
  const jobs: JobRecord[] = [];
  for (let index = 0; index < sources.length; index += batchSize) {
    const batch = sources.slice(index, index + batchSize);
    const groups = await Promise.all(
      batch.map(async (source) => {
        try {
          return await discoverJobsFromCompanyPage(source, fetchJson, fetchText);
        } catch {
          return [];
        }
      })
    );
    jobs.push(...groups.flat());
  }
  return jobs;
}

function toCompanySource(
  entry: DirectoryCompany,
  provider: DirectoryAtsProviderId,
  source: AtsDirectorySourceConfig
): AtsCompanySourceConfig | undefined {
  if (!SLUG_RE.test(entry.slug)) return undefined;
  let url: URL;
  try {
    url = new URL(entry.url);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || !isExpectedAtsHost(provider, url.hostname)) return undefined;
  const companySource: AtsCompanySourceConfig = {
    company: entry.name || slugToCompanyName(entry.slug),
    provider,
    careersUrl: url.href,
    enabled: true
  };
  if (source.id) companySource.id = `${source.id}-${provider}-${slugify(entry.slug)}`;
  return companySource;
}

function isExpectedAtsHost(provider: DirectoryAtsProviderId, hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (provider === "greenhouse") return host === "job-boards.greenhouse.io" || host === "boards.greenhouse.io";
  if (provider === "lever") return host === "jobs.lever.co";
  if (provider === "ashby") return host === "jobs.ashbyhq.com";
  if (provider === "workable") return host === "apply.workable.com";
  if (provider === "smartrecruiters") return host.endsWith(".smartrecruiters.com");
  if (provider === "bamboohr") return host.endsWith(".bamboohr.com");
  if (provider === "breezy") return host.endsWith(".breezy.hr");
  if (provider === "recruitee") return host.endsWith(".recruitee.com");
  if (provider === "pinpoint") return host.endsWith(".pinpointhq.com");
  if (provider === "workday") return host.endsWith(".myworkdayjobs.com");
  if (provider === "personio") return host.includes(".jobs.personio.");
  return host === "ats.rippling.com";
}

function directoryProviders(source: AtsDirectorySourceConfig): DirectoryAtsProviderId[] {
  const configured = stringArray(source.options?.providers)
    .map((provider) => parseAtsProvider(provider))
    .filter((provider): provider is DirectoryAtsProviderId => Boolean(provider));
  return unique(configured.length > 0 ? configured : DEFAULT_DIRECTORY_PROVIDERS);
}

function parseAtsProvider(value?: string): DirectoryAtsProviderId | undefined {
  return value && value in DIRECTORY_SOURCES ? value as DirectoryAtsProviderId : undefined;
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

function sampleDirectoryEntries(
  entries: DirectoryCompany[],
  limit: number,
  strategy: "prefix" | "spread"
): DirectoryCompany[] {
  const bySlug = new Map(entries.filter((entry) => SLUG_RE.test(entry.slug)).map((entry) => [entry.slug, entry]));
  const safeEntries = [...bySlug.values()];
  if (safeEntries.length <= limit || strategy === "prefix") return safeEntries.slice(0, limit);
  const selected: DirectoryCompany[] = [];
  for (let index = 0; index < limit; index += 1) {
    const entry = safeEntries[Math.floor((index * safeEntries.length) / limit)] ?? safeEntries[index];
    if (entry) selected.push(entry);
  }
  return [...new Map(selected.map((entry) => [entry.slug, entry])).values()];
}

function parseDirectoryCsv(value: string): DirectoryCompany[] {
  const rows = parseCsvRows(value);
  const header = rows.shift()?.map((column) => column.trim().toLowerCase()) ?? [];
  const nameIndex = header.indexOf("name");
  const slugIndex = header.indexOf("slug");
  const urlIndex = header.indexOf("url");
  if (nameIndex < 0 || slugIndex < 0 || urlIndex < 0) throw new Error("JobHive company CSV is missing name, slug, or url");
  return rows.flatMap((row): DirectoryCompany[] => {
    const name = row[nameIndex]?.trim() ?? "";
    const slug = row[slugIndex]?.trim() ?? "";
    const url = row[urlIndex]?.trim() ?? "";
    return slug && url ? [{ name, slug, url }] : [];
  });
}

function parseCsvRows(value: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] ?? "";
    const next = value[index + 1] ?? "";
    if (char === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
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

async function defaultFetchText(url: string, options: FetchJsonOptions = {}): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/csv, text/plain;q=0.9",
        ...(options.headers ?? {})
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} while fetching ${url}`);
    return response.text();
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
