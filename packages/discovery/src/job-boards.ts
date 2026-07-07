import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Compensation, EmploymentType, JobRecord, JobSource, WorkMode } from "@applycue/core";
import { normalizeJob, type RawJobInput } from "@applycue/normalizer";
import type { FetchJson, FetchJsonOptions } from "./ats.js";

export type JobBoardProviderId =
  "jobspy" |
  "remotive" |
  "remoteok" |
  "workingnomads" |
  "jobicy" |
  "himalayas" |
  "themuse";

export interface JobBoardSourceConfig {
  id?: string;
  label: string;
  provider: JobBoardProviderId;
  query?: string;
  enabled?: boolean;
  credentialRequired?: boolean;
  credentialRef?: {
    owner?: string;
    kind?: string;
    ref?: string;
    provider?: string;
  };
  options?: Record<string, unknown>;
}

export interface DiscoverJobBoardsOptions {
  fetchJson?: FetchJson;
  jobSpyRunner?: JobSpyRunner;
  onWarning?: (message: string) => void;
}

export interface JobSpyRunRequest {
  site_name?: string[];
  search_term?: string;
  google_search_term?: string;
  location?: string;
  distance?: number;
  job_type?: string;
  is_remote?: boolean;
  easy_apply?: boolean;
  offset?: number;
  hours_old?: number;
  results_wanted?: number;
  country_indeed?: string;
  description_format?: "markdown" | "html" | "plain";
  linkedin_fetch_description?: boolean;
  linkedin_company_ids?: number[];
  verbose?: number;
}

export type JobSpyRunner = (request: JobSpyRunRequest) => Promise<unknown[]>;

const DEFAULT_TIMEOUT_MS = 20_000;
const HIMALAYAS_API_URL = "https://himalayas.app/jobs/api";
const JOBICY_API_URL = "https://jobicy.com/api/v2/remote-jobs";
const REMOTIVE_API_URL = "https://remotive.com/api/remote-jobs";
const REMOTEOK_API_URL = "https://remoteok.com/api";
const THEMUSE_API_URL = "https://www.themuse.com/api/public/jobs";
const WORKING_NOMADS_API_URL = "https://www.workingnomads.com/api/exposed_jobs/";
const JOBSPY_PYTHON = String.raw`
import json
import sys

try:
    from jobspy import scrape_jobs
except Exception as exc:
    print(json.dumps({"error": "python-jobspy is not installed or could not be imported: " + str(exc)}), file=sys.stderr)
    sys.exit(2)

payload = json.load(sys.stdin)

try:
    jobs = scrape_jobs(**payload)
    jobs = jobs.where(jobs.notnull(), None)
    print(jobs.to_json(orient="records", date_format="iso"))
except Exception as exc:
    print(json.dumps({"error": str(exc)}), file=sys.stderr)
    sys.exit(1)
`;

export function parseJobBoardSources(value: unknown): JobBoardSourceConfig[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): JobBoardSourceConfig[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const provider = parseProvider(record.provider);
    if (!provider) return [];
    const label = stringValue(record.label) ?? stringValue(record.name) ?? stringValue(record.id) ?? provider;
    const source: JobBoardSourceConfig = { label, provider };
    const id = stringValue(record.id);
    const query = stringValue(record.query) ?? stringValue(record.searchTerm) ?? stringValue(record.search);
    if (id) source.id = id;
    if (query) source.query = query;
    if (typeof record.enabled === "boolean") source.enabled = record.enabled;
    if (typeof record.credentialRequired === "boolean") source.credentialRequired = record.credentialRequired;
    const credentialRef = parseCredentialRef(record.credentialRef);
    if (credentialRef) source.credentialRef = credentialRef;
    const options = parseOptions(record.options);
    if (options) source.options = options;
    return [source];
  });
}

export async function discoverJobsFromJobBoards(
  sources: JobBoardSourceConfig[],
  options: DiscoverJobBoardsOptions = {}
): Promise<JobRecord[]> {
  const fetchJson = options.fetchJson ?? defaultFetchJson;
  const jobSpyRunner = options.jobSpyRunner ?? runJobSpyPython;
  const jobGroups = await Promise.all(
    sources
      .filter((source) => source.enabled !== false)
      .map(async (source) => {
        try {
          validateCredentialPolicy(source);
          if (source.provider === "jobspy") return await discoverJobSpyJobs(source, jobSpyRunner);
          if (source.provider === "remotive") return await discoverRemotiveJobs(source, fetchJson);
          if (source.provider === "remoteok") return await discoverRemoteOkJobs(source, fetchJson);
          if (source.provider === "workingnomads") return await discoverWorkingNomadsJobs(source, fetchJson);
          if (source.provider === "jobicy") return await discoverJobicyJobs(source, fetchJson);
          if (source.provider === "himalayas") return await discoverHimalayasJobs(source, fetchJson);
          return await discoverTheMuseJobs(source, fetchJson);
        } catch (error) {
          options.onWarning?.(`${source.label}: ${error instanceof Error ? error.message : String(error)}`);
          return [];
        }
      })
  );
  return uniqueJobsById(jobGroups.flat());
}

export async function discoverJobSpyJobs(source: JobBoardSourceConfig, runner: JobSpyRunner): Promise<JobRecord[]> {
  const request = toJobSpyRequest(source);
  const rows = await runner(request);
  return rows.map((row) => normalizeJob(toJobSpyRawJob(row, source)));
}

export async function discoverRemotiveJobs(source: JobBoardSourceConfig, fetchJson: FetchJson = defaultFetchJson): Promise<JobRecord[]> {
  const url = buildRemotiveUrl(source);
  const payload = await fetchJson(url);
  const jobs = asArray(asRecord(payload).jobs);
  return jobs.map((job) => normalizeJob(toRemotiveRawJob(job, source)));
}

export async function discoverRemoteOkJobs(source: JobBoardSourceConfig, fetchJson: FetchJson = defaultFetchJson): Promise<JobRecord[]> {
  const payload = await fetchJson(REMOTEOK_API_URL, {
    headers: { "user-agent": "ApplyCue local job discovery" }
  });
  return asArray(payload)
    .slice(1)
    .filter((item) => isRecordWithUrl(item, "url"))
    .map((job) => normalizeJob(toRemoteOkRawJob(job, source)))
    .slice(0, sourceLimit(source));
}

export async function discoverWorkingNomadsJobs(source: JobBoardSourceConfig, fetchJson: FetchJson = defaultFetchJson): Promise<JobRecord[]> {
  const payload = await fetchJson(WORKING_NOMADS_API_URL);
  return asArray(payload)
    .filter((item) => isRecordWithUrl(item, "url"))
    .map((job) => normalizeJob(toWorkingNomadsRawJob(job, source)))
    .slice(0, sourceLimit(source));
}

export async function discoverJobicyJobs(source: JobBoardSourceConfig, fetchJson: FetchJson = defaultFetchJson): Promise<JobRecord[]> {
  const payload = await fetchJson(buildJobicyUrl(source));
  return asArray(asRecord(payload).jobs)
    .filter((item) => isRecordWithUrl(item, "url"))
    .map((job) => normalizeJob(toJobicyRawJob(job, source)))
    .slice(0, sourceLimit(source));
}

export async function discoverHimalayasJobs(source: JobBoardSourceConfig, fetchJson: FetchJson = defaultFetchJson): Promise<JobRecord[]> {
  const payload = await fetchJson(buildHimalayasUrl(source));
  return asArray(asRecord(payload).jobs)
    .filter((item) => isRecordWithAnyUrl(item, ["applicationLink", "guid", "url"]))
    .map((job) => normalizeJob(toHimalayasRawJob(job, source)))
    .slice(0, sourceLimit(source));
}

export async function discoverTheMuseJobs(source: JobBoardSourceConfig, fetchJson: FetchJson = defaultFetchJson): Promise<JobRecord[]> {
  const rows: unknown[] = [];
  const limit = sourceLimit(source);
  const pageLimit = sourcePageLimit(source, 5);
  let pageCount = 1;
  for (let page = 0; page < pageCount && page < pageLimit && rows.length < limit; page += 1) {
    const payload = await fetchJson(buildTheMuseUrl(page), { redirect: "error" });
    const results = asArray(asRecord(payload).results);
    rows.push(...results);
    const reportedPageCount = numberValue(asRecord(payload).page_count);
    if (page === 0 && typeof reportedPageCount === "number" && reportedPageCount > 1) {
      pageCount = Math.min(Math.floor(reportedPageCount), pageLimit);
    }
    if (results.length === 0) break;
  }
  return rows
    .flatMap((job) => {
      const raw = toTheMuseRawJob(job, source);
      return raw ? [normalizeJob(raw)] : [];
    })
    .slice(0, limit);
}

function toJobSpyRequest(source: JobBoardSourceConfig): JobSpyRunRequest {
  const options = source.options ?? {};
  const searchTerm = source.query ?? stringValue(options.searchTerm);
  if (!searchTerm && !stringValue(options.googleSearchTerm)) {
    throw new Error("missing query or options.googleSearchTerm");
  }
  const request: JobSpyRunRequest = {};
  const siteNames = stringArray(options.siteNames);
  if (siteNames.length > 0) request.site_name = siteNames;
  if (searchTerm) request.search_term = searchTerm;
  const googleSearchTerm = stringValue(options.googleSearchTerm);
  if (googleSearchTerm) request.google_search_term = googleSearchTerm;
  const location = stringValue(options.location);
  if (location) request.location = location;
  const distance = numberValue(options.distance);
  if (typeof distance === "number") request.distance = distance;
  const jobType = stringValue(options.jobType);
  if (jobType) request.job_type = jobType;
  if (typeof options.isRemote === "boolean") request.is_remote = options.isRemote;
  if (typeof options.easyApply === "boolean") request.easy_apply = options.easyApply;
  const offset = numberValue(options.offset);
  if (typeof offset === "number") request.offset = offset;
  const hoursOld = numberValue(options.hoursOld);
  if (typeof hoursOld === "number") request.hours_old = hoursOld;
  const resultsWanted = numberValue(options.resultsWanted);
  if (typeof resultsWanted === "number") request.results_wanted = resultsWanted;
  const countryIndeed = stringValue(options.countryIndeed);
  if (countryIndeed) request.country_indeed = countryIndeed;
  const descriptionFormat = parseDescriptionFormat(options.descriptionFormat);
  if (descriptionFormat) request.description_format = descriptionFormat;
  if (typeof options.linkedinFetchDescription === "boolean") {
    request.linkedin_fetch_description = options.linkedinFetchDescription;
  }
  const linkedInCompanyIds = numberArray(options.linkedinCompanyIds);
  if (linkedInCompanyIds.length > 0) request.linkedin_company_ids = linkedInCompanyIds;
  const verbose = numberValue(options.verbose);
  request.verbose = typeof verbose === "number" ? verbose : 0;
  return request;
}

function toJobSpyRawJob(row: unknown, source: JobBoardSourceConfig): RawJobInput {
  const item = asRecord(row);
  const site = stringValue(item.site) ?? source.provider;
  const title = stringValue(item.title) || "Untitled JobSpy role";
  const company = stringValue(item.company) ?? stringValue(item.company_name) ?? "Unknown company";
  const url = stringValue(item.job_url_direct) ?? stringValue(item.job_url) ?? "";
  const location = stringValue(item.location);
  const compensation = parseCompensation({
    min: item.min_amount,
    max: item.max_amount,
    currency: item.currency,
    interval: item.interval
  });
  const employmentType = parseEmploymentType(stringValue(item.job_type));
  const raw: RawJobInput = {
    source: createJobBoardSource(source, site, url),
    company,
    title,
    url,
    description: stringValue(item.description) ?? "",
    workMode: item.is_remote === true ? "remote" : inferWorkMode(location),
    ...(location ? { location } : {}),
    ...(employmentType ? { employmentType } : {}),
    ...(compensation ? { compensation } : {})
  };
  return raw;
}

function buildRemotiveUrl(source: JobBoardSourceConfig): string {
  const url = new URL(REMOTIVE_API_URL);
  if (source.query) url.searchParams.set("search", source.query);
  const options = source.options ?? {};
  const category = stringValue(options.category);
  if (category) url.searchParams.set("category", category);
  const companyName = stringValue(options.companyName);
  if (companyName) url.searchParams.set("company_name", companyName);
  const limit = numberValue(options.limit);
  if (typeof limit === "number") url.searchParams.set("limit", String(limit));
  return url.toString();
}

function toRemotiveRawJob(job: unknown, source: JobBoardSourceConfig): RawJobInput {
  const item = asRecord(job);
  const url = stringValue(item.url) ?? "";
  const location = stringValue(item.candidate_required_location);
  const description = htmlToText(stringValue(item.description) ?? "");
  const compensation = parseSalaryText(stringValue(item.salary));
  const employmentType = parseEmploymentType(stringValue(item.job_type));
  return {
    source: createJobBoardSource(source, "remotive", url),
    company: stringValue(item.company_name) ?? "Unknown company",
    title: stringValue(item.title) ?? "Untitled Remotive role",
    url,
    description,
    workMode: "remote",
    liveState: "live",
    ...(location ? { location } : {}),
    ...(employmentType ? { employmentType } : {}),
    ...(compensation ? { compensation } : {})
  };
}

function toRemoteOkRawJob(job: unknown, source: JobBoardSourceConfig): RawJobInput {
  const item = asRecord(job);
  const url = stringValue(item.url) ?? "";
  const location = stringValue(item.location) ?? "Remote";
  const compensation = parseCompensation({
    min: item.salary_min,
    max: item.salary_max,
    currency: item.currency,
    interval: "year"
  });
  return {
    source: createJobBoardSource(source, "remoteok", url),
    company: stringValue(item.company) ?? "RemoteOK",
    title: stringValue(item.position) ?? stringValue(item.title) ?? "Untitled RemoteOK role",
    url,
    description: htmlToText(stringValue(item.description) ?? ""),
    workMode: "remote",
    liveState: "live",
    location,
    ...(compensation ? { compensation } : {})
  };
}

function toWorkingNomadsRawJob(job: unknown, source: JobBoardSourceConfig): RawJobInput {
  const item = asRecord(job);
  const url = stringValue(item.url) ?? "";
  const location = stringValue(item.location) ?? "Remote";
  const employmentType = parseEmploymentType(stringValue(item.job_type) ?? stringValue(item.type));
  return {
    source: createJobBoardSource(source, "workingnomads", url),
    company: stringValue(item.company_name) ?? stringValue(item.company) ?? "Working Nomads",
    title: stringValue(item.title) ?? "Untitled Working Nomads role",
    url,
    description: htmlToText(stringValue(item.description) ?? ""),
    workMode: "remote",
    liveState: "live",
    location,
    ...(employmentType ? { employmentType } : {})
  };
}

function buildJobicyUrl(source: JobBoardSourceConfig): string {
  const url = new URL(JOBICY_API_URL);
  url.searchParams.set("count", String(sourceLimit(source)));
  return url.toString();
}

function toJobicyRawJob(job: unknown, source: JobBoardSourceConfig): RawJobInput {
  const item = asRecord(job);
  const url = stringValue(item.url) ?? "";
  const location = stringValue(item.jobGeo);
  const compensation = parseCompensation({
    min: item.annualSalaryMin,
    max: item.annualSalaryMax,
    currency: stringValue(item.salaryCurrency) ?? "USD",
    interval: "year"
  });
  return {
    source: createJobBoardSource(source, "jobicy", url),
    company: stringValue(item.companyName) ?? "Jobicy",
    title: stringValue(item.jobTitle) ?? stringValue(item.title) ?? "Untitled Jobicy role",
    url,
    description: htmlToText(stringValue(item.jobDescription) ?? stringValue(item.description) ?? ""),
    workMode: "remote",
    liveState: "live",
    ...(location ? { location } : {}),
    ...(compensation ? { compensation } : {})
  };
}

function buildHimalayasUrl(source: JobBoardSourceConfig): string {
  const url = new URL(HIMALAYAS_API_URL);
  url.searchParams.set("limit", String(sourceLimit(source)));
  return url.toString();
}

function toHimalayasRawJob(job: unknown, source: JobBoardSourceConfig): RawJobInput {
  const item = asRecord(job);
  const url = stringValue(item.applicationLink) ?? stringValue(item.guid) ?? stringValue(item.url) ?? "";
  const location = locationRestrictions(item.locationRestrictions);
  return {
    source: createJobBoardSource(source, "himalayas", url),
    company: stringValue(item.companyName) ?? stringValue(item.company) ?? "Himalayas",
    title: stringValue(item.title) ?? "Untitled Himalayas role",
    url,
    description: htmlToText(stringValue(item.description) ?? ""),
    workMode: "remote",
    liveState: "live",
    ...(location ? { location } : {})
  };
}

function buildTheMuseUrl(page: number): string {
  const url = new URL(THEMUSE_API_URL);
  url.searchParams.set("page", String(Math.max(0, Math.floor(page))));
  return assertTheMuseUrl(url.toString(), "The Muse jobs API URL");
}

function toTheMuseRawJob(job: unknown, source: JobBoardSourceConfig): RawJobInput | undefined {
  const item = asRecord(job);
  const title = stringValue(item.name) ?? stringValue(item.title);
  const url = theMuseJobUrl(item);
  if (!title || !url) return undefined;

  const location = formatTheMuseLocations(item);
  const employmentType = parseEmploymentType(stringValue(asRecord(item.type).name) ?? stringValue(item.type));
  const compensation = parseSalaryText(stringValue(item.salary));

  return {
    source: createJobBoardSource(source, "themuse", url),
    company: stringValue(asRecord(item.company).name) ?? "The Muse",
    title,
    url,
    description: htmlToText(stringValue(item.contents) ?? stringValue(item.description) ?? title),
    workMode: inferWorkMode(location),
    liveState: "live",
    ...(location ? { location } : {}),
    ...(employmentType ? { employmentType } : {}),
    ...(compensation ? { compensation } : {})
  };
}

function theMuseJobUrl(item: Record<string, unknown>): string {
  const refUrl = stringValue(asRecord(item.refs).landing_page) ?? stringValue(item.url);
  if (!refUrl) return "";
  try {
    return assertTheMuseUrl(refUrl, "The Muse job URL");
  } catch {
    return "";
  }
}

function formatTheMuseLocations(item: Record<string, unknown>): string {
  const locations = asArray(item.locations).map((location) => stringValue(asRecord(location).name)).filter(Boolean);
  return [...new Set(locations)].join(", ");
}

function assertTheMuseUrl(rawUrl: string, label: string): string {
  const parsed = safeUrl(rawUrl);
  if (!parsed || parsed.protocol !== "https:" || parsed.hostname !== "www.themuse.com") {
    throw new Error(`${label} must use HTTPS on www.themuse.com`);
  }
  return parsed.href;
}

async function runJobSpyPython(request: JobSpyRunRequest): Promise<unknown[]> {
  const pythonCommand = resolveJobSpyPythonCommand();
  const result = await runProcess(pythonCommand, ["-c", JOBSPY_PYTHON], JSON.stringify(request));
  const parsed = JSON.parse(result.stdout.trim() || "[]") as unknown;
  if (!Array.isArray(parsed)) throw new Error("JobSpy runner returned non-array JSON");
  return parsed;
}

export function resolveJobSpyPythonCommand(): string {
  const explicitPython = process.env.APPLYCUE_PYTHON?.trim();
  if (explicitPython) return explicitPython;
  const applyCueHome = process.env.APPLYCUE_HOME?.trim() || join(homedir(), ".applycue");
  const localPython =
    process.platform === "win32"
      ? join(applyCueHome, "tools", "jobspy-venv", "Scripts", "python.exe")
      : join(applyCueHome, "tools", "jobspy-venv", "bin", "python");
  if (existsSync(localPython)) return localPython;
  return "python";
}

function runProcess(command: string, args: string[], stdin: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      reject(new Error(`could not start Python for JobSpy: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || `JobSpy runner exited with code ${code ?? "unknown"}`));
    });
    child.stdin.end(stdin);
  });
}

async function defaultFetchJson(url: string, options: FetchJsonOptions = {}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const requestInit: RequestInit = {
      headers: {
        accept: "application/json",
        ...(options.headers ?? {})
      },
      signal: controller.signal
    };
    if (options.redirect) requestInit.redirect = options.redirect;
    const response = await fetch(url, requestInit);
    if (!response.ok) throw new Error(`HTTP ${response.status} while fetching ${url}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function validateCredentialPolicy(source: JobBoardSourceConfig): void {
  if (!source.credentialRequired) return;
  if (source.credentialRef?.owner !== "user") {
    throw new Error("provider credentials must be user-owned; no shared ApplyCue or developer key is allowed");
  }
  if (!source.credentialRef.ref) {
    throw new Error("provider credential reference is missing");
  }
}

function createJobBoardSource(source: JobBoardSourceConfig, site: string, url?: string): JobSource {
  const idParts = [source.id ?? source.label, source.provider, site].filter(Boolean).join("-");
  return {
    id: slugify(idParts),
    kind: "job_board",
    name: `${source.label} (${site})`,
    ...(url ? { url } : {})
  };
}

function parseProvider(value: unknown): JobBoardProviderId | undefined {
  if (
    value === "jobspy" ||
    value === "remotive" ||
    value === "remoteok" ||
    value === "workingnomads" ||
    value === "jobicy" ||
    value === "himalayas" ||
    value === "themuse"
  ) return value;
  return undefined;
}

function parseCredentialRef(value: unknown): JobBoardSourceConfig["credentialRef"] | undefined {
  const record = asRecord(value);
  const owner = stringValue(record.owner);
  const kind = stringValue(record.kind);
  const ref = stringValue(record.ref);
  const provider = stringValue(record.provider);
  if (!owner && !kind && !ref && !provider) return undefined;
  const credentialRef: NonNullable<JobBoardSourceConfig["credentialRef"]> = {};
  if (owner) credentialRef.owner = owner;
  if (kind) credentialRef.kind = kind;
  if (ref) credentialRef.ref = ref;
  if (provider) credentialRef.provider = provider;
  return credentialRef;
}

function parseOptions(value: unknown): Record<string, unknown> | undefined {
  const record = asRecord(value);
  return Object.keys(record).length > 0 ? record : undefined;
}

function parseDescriptionFormat(value: unknown): JobSpyRunRequest["description_format"] | undefined {
  if (value === "markdown" || value === "html" || value === "plain") return value;
  return undefined;
}

function sourceLimit(source: JobBoardSourceConfig): number {
  const options = source.options ?? {};
  const limit = numberValue(options.limit) ?? numberValue(options.count) ?? numberValue(options.resultsWanted) ?? 50;
  return Math.max(1, Math.min(100, Math.floor(limit)));
}

function sourcePageLimit(source: JobBoardSourceConfig, fallback: number): number {
  const options = source.options ?? {};
  const pageLimit = numberValue(options.pageLimit) ?? numberValue(options.maxPages) ?? fallback;
  return Math.max(1, Math.min(25, Math.floor(pageLimit)));
}

function isRecordWithUrl(value: unknown, field: string): boolean {
  const url = stringValue(asRecord(value)[field]);
  return Boolean(url && /^https?:\/\//i.test(url));
}

function isRecordWithAnyUrl(value: unknown, fields: string[]): boolean {
  return fields.some((field) => isRecordWithUrl(value, field));
}

function locationRestrictions(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const parts = value.map(stringValue).filter((item): item is string => Boolean(item));
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function inferWorkMode(value?: string): WorkMode {
  const normalized = value?.toLowerCase() ?? "";
  if (normalized.includes("remote")) return "remote";
  if (normalized.includes("hybrid")) return "hybrid";
  if (normalized.includes("office") || normalized.includes("onsite") || normalized.includes("on-site")) return "onsite";
  return "unknown";
}

function parseEmploymentType(value?: string): EmploymentType | undefined {
  const normalized = value?.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (!normalized) return undefined;
  const aliases: Record<string, EmploymentType> = {
    fulltime: "full_time",
    full_time: "full_time",
    full_time_permanent: "full_time",
    permanent: "full_time",
    parttime: "part_time",
    part_time: "part_time",
    contract: "contract",
    contractor: "contract",
    consulting: "consulting",
    freelance: "contract",
    fractional: "fractional",
    internship: "internship",
    intern: "internship"
  };
  return aliases[normalized];
}

function parseCompensation(input: { min?: unknown; max?: unknown; currency?: unknown; interval?: unknown }): Compensation | undefined {
  const compensation: Compensation = {};
  const min = numberValue(input.min);
  const max = numberValue(input.max);
  const currency = stringValue(input.currency);
  const period = parseCompensationPeriod(stringValue(input.interval));
  if (typeof min === "number") compensation.min = min;
  if (typeof max === "number") compensation.max = max;
  if (currency) compensation.currency = currency;
  if (period) compensation.period = period;
  return Object.keys(compensation).length > 0 ? compensation : undefined;
}

function parseSalaryText(value?: string): Compensation | undefined {
  if (!value) return undefined;
  const currency = value.includes("$") ? "USD" : value.includes("£") ? "GBP" : value.includes("€") ? "EUR" : undefined;
  const amounts = [...value.matchAll(/(?:[$£€]\s*)?(\d[\d,]*(?:\.\d+)?)(?:\s*k)?/gi)].map((match) => {
    const raw = (match[1] ?? "").replace(/,/g, "");
    const amount = Number(raw);
    if (!Number.isFinite(amount)) return undefined;
    return /\bk\b/i.test(match[0]) ? amount * 1000 : amount;
  }).filter((amount): amount is number => typeof amount === "number");
  if (amounts.length === 0 && !currency) return undefined;
  const compensation: Compensation = {};
  if (typeof amounts[0] === "number") compensation.min = amounts[0];
  if (typeof amounts[1] === "number") compensation.max = amounts[1];
  if (currency) compensation.currency = currency;
  if (/\b(hour|hourly)\b/i.test(value)) compensation.period = "hour";
  else if (/\b(month|monthly)\b/i.test(value)) compensation.period = "month";
  else compensation.period = "year";
  return compensation;
}

function parseCompensationPeriod(value?: string): Compensation["period"] | undefined {
  const normalized = value?.toLowerCase() ?? "";
  if (normalized.includes("year")) return "year";
  if (normalized.includes("month")) return "month";
  if (normalized.includes("hour")) return "hour";
  return undefined;
}

function htmlToText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(stringValue).filter((item): item is string => Boolean(item));
}

function numberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map(numberValue).filter((item): item is number => typeof item === "number");
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "job-board";
}

function safeUrl(rawUrl: string): URL | undefined {
  try {
    return rawUrl ? new URL(rawUrl) : undefined;
  } catch {
    return undefined;
  }
}

function uniqueJobsById(jobs: JobRecord[]): JobRecord[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (seen.has(job.id)) return false;
    seen.add(job.id);
    return true;
  });
}
