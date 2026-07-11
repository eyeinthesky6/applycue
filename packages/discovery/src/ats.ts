import type { Compensation, EmploymentType, JobRecord, JobSource, WorkMode } from "@applycue/core";
import { normalizeJob, type RawJobInput } from "@applycue/normalizer";
import { mapWithConcurrency } from "./concurrency.js";

export type AtsProviderId =
  "greenhouse" |
  "lever" |
  "ashby" |
  "workable" |
  "smartrecruiters" |
  "bamboohr" |
  "breezy" |
  "recruitee" |
  "pinpoint" |
  "workday" |
  "personio" |
  "rippling";

export interface AtsCompanySourceConfig {
  id?: string;
  company: string;
  provider?: AtsProviderId;
  careersUrl?: string;
  apiUrl?: string;
  boardToken?: string;
  enabled?: boolean;
}

export function parseAtsCompanySources(value: unknown): AtsCompanySourceConfig[] {
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

function parseAtsProvider(value: unknown): AtsProviderId | undefined {
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

export interface DiscoverCompanyPagesOptions {
  concurrency?: number;
  fetchJson?: FetchJson;
  fetchText?: FetchText;
  onWarning?: (message: string) => void;
}

export type FetchJson = (url: string, options?: FetchJsonOptions) => Promise<unknown>;
export type FetchText = (url: string, options?: FetchJsonOptions) => Promise<string>;
type FetchRedirect = "error" | "follow" | "manual";

export interface FetchJsonOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  redirect?: FetchRedirect;
  method?: "GET" | "POST";
  body?: string;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_SOURCE_CONCURRENCY = 6;
const DEFAULT_DETAIL_CONCURRENCY = 6;

export async function discoverJobsFromCompanyPages(
  sources: AtsCompanySourceConfig[],
  options: DiscoverCompanyPagesOptions = {}
): Promise<JobRecord[]> {
  const fetchJson = options.fetchJson ?? defaultFetchJson;
  const fetchText = options.fetchText ?? defaultFetchText;
  const enabledSources = sources.filter((source) => source.enabled !== false);
  const jobGroups = await mapWithConcurrency(
    enabledSources,
    options.concurrency ?? DEFAULT_SOURCE_CONCURRENCY,
    async (source) => {
      try {
        return await discoverJobsFromCompanyPage(source, fetchJson, fetchText);
      } catch (error) {
        options.onWarning?.(`${source.company}: ${error instanceof Error ? error.message : String(error)}`);
        return [];
      }
    }
  );
  return uniqueJobsById(jobGroups.flat());
}

export async function discoverJobsFromCompanyPage(
  source: AtsCompanySourceConfig,
  fetchJson: FetchJson = defaultFetchJson,
  fetchText: FetchText = defaultFetchText
): Promise<JobRecord[]> {
  const provider = source.provider ?? inferAtsProvider(source);
  if (!provider) throw new Error("could not infer ATS provider");

  if (provider === "greenhouse") return discoverGreenhouseJobs(source, fetchJson);
  if (provider === "lever") return discoverLeverJobs(source, fetchJson);
  if (provider === "ashby") return discoverAshbyJobs(source, fetchJson);
  if (provider === "workable") return discoverWorkableJobs(source, fetchText);
  if (provider === "smartrecruiters") return discoverSmartRecruitersJobs(source, fetchJson);
  if (provider === "bamboohr") return discoverBambooHrJobs(source, fetchJson);
  if (provider === "breezy") return discoverBreezyJobs(source, fetchJson);
  if (provider === "recruitee") return discoverRecruiteeJobs(source, fetchJson);
  if (provider === "pinpoint") return discoverPinpointJobs(source, fetchJson);
  if (provider === "workday") return discoverWorkdayJobs(source, fetchJson);
  if (provider === "rippling") return discoverRipplingJobs(source, fetchJson);
  return discoverPersonioJobs(source, fetchText);
}

function inferAtsProvider(source: AtsCompanySourceConfig): AtsProviderId | undefined {
  const value = `${source.apiUrl ?? ""} ${source.careersUrl ?? ""}`.toLowerCase();
  if (value.includes("greenhouse.io")) return "greenhouse";
  if (value.includes("lever.co")) return "lever";
  if (value.includes("ashbyhq.com")) return "ashby";
  if (value.includes("apply.workable.com")) return "workable";
  if (value.includes("smartrecruiters.com")) return "smartrecruiters";
  if (value.includes("bamboohr.com")) return "bamboohr";
  if (value.includes("breezy.hr")) return "breezy";
  if (value.includes("recruitee.com")) return "recruitee";
  if (value.includes("pinpointhq.com")) return "pinpoint";
  if (value.includes("myworkdayjobs.com")) return "workday";
  if (value.includes(".jobs.personio.")) return "personio";
  if (value.includes("ats.rippling.com") || value.includes("api.rippling.com/platform/api/ats/v1/board/")) return "rippling";
  return undefined;
}

async function discoverGreenhouseJobs(source: AtsCompanySourceConfig, fetchJson: FetchJson): Promise<JobRecord[]> {
  const apiUrl = resolveGreenhouseApiUrl(source);
  const payload = await fetchJson(apiUrl);
  const jobs = asArray((payload as { jobs?: unknown[] })?.jobs);
  return jobs.map((job) => normalizeJob(toGreenhouseRawJob(job, source)));
}

function resolveGreenhouseApiUrl(source: AtsCompanySourceConfig): string {
  if (source.apiUrl) return source.apiUrl;
  const token = source.boardToken ?? firstPathSegment(source.careersUrl);
  if (!token) throw new Error("missing Greenhouse board token or careersUrl");
  return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`;
}

function toGreenhouseRawJob(job: unknown, source: AtsCompanySourceConfig): RawJobInput {
  const item = asRecord(job);
  const jobSource = createAtsJobSource(source, "greenhouse");
  const postedAt = firstDateString(item, ["first_published", "published_at", "created_at", "updated_at"]);
  return {
    source: jobSource,
    company: source.company,
    title: stringValue(item.title) || "Untitled Greenhouse role",
    url: stringValue(item.absolute_url) || jobSource.url || "",
    description: htmlToText(stringValue(item.content)),
    location: stringValue(asRecord(item.location).name),
    workMode: inferWorkMode(stringValue(asRecord(item.location).name)),
    liveState: "live",
    ...(postedAt ? { postedAt } : {})
  };
}

async function discoverLeverJobs(source: AtsCompanySourceConfig, fetchJson: FetchJson): Promise<JobRecord[]> {
  const apiUrl = resolveLeverApiUrl(source);
  const payload = await fetchJson(apiUrl, { headers: { accept: "application/json" } });
  const jobs = asArray(payload);
  return jobs.map((job) => normalizeJob(toLeverRawJob(job, source)));
}

function resolveLeverApiUrl(source: AtsCompanySourceConfig): string {
  if (source.apiUrl) return source.apiUrl;
  const token = source.boardToken ?? firstPathSegment(source.careersUrl);
  if (!token) throw new Error("missing Lever site name or careersUrl");
  const host = source.careersUrl?.toLowerCase().includes("jobs.eu.lever.co") ? "api.eu.lever.co" : "api.lever.co";
  return `https://${host}/v0/postings/${encodeURIComponent(token)}?mode=json`;
}

function toLeverRawJob(job: unknown, source: AtsCompanySourceConfig): RawJobInput {
  const item = asRecord(job);
  const categories = asRecord(item.categories);
  const location = stringValue(categories.location);
  const jobSource = createAtsJobSource(source, "lever");
  const employmentType = parseEmploymentType(stringValue(categories.commitment));
  const postedAt = firstDateString(item, ["createdAt", "created_at", "updatedAt", "updated_at"]);
  return {
    source: jobSource,
    company: source.company,
    title: stringValue(item.text) || "Untitled Lever role",
    url: stringValue(item.hostedUrl) || stringValue(item.applyUrl) || jobSource.url || "",
    description: htmlToText(stringValue(item.descriptionPlain) || stringValue(item.description)),
    location,
    workMode: inferWorkMode(location),
    liveState: "live",
    ...(employmentType ? { employmentType } : {}),
    ...(postedAt ? { postedAt } : {})
  };
}

async function discoverAshbyJobs(source: AtsCompanySourceConfig, fetchJson: FetchJson): Promise<JobRecord[]> {
  const apiUrl = resolveAshbyApiUrl(source);
  const payload = await fetchJson(apiUrl);
  const jobs = asArray((payload as { jobs?: unknown[] })?.jobs);
  return jobs.map((job) => normalizeJob(toAshbyRawJob(job, source)));
}

function resolveAshbyApiUrl(source: AtsCompanySourceConfig): string {
  if (source.apiUrl) return source.apiUrl;
  const token = source.boardToken ?? firstPathSegment(source.careersUrl);
  if (!token) throw new Error("missing Ashby job board name or careersUrl");
  return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=true`;
}

function toAshbyRawJob(job: unknown, source: AtsCompanySourceConfig): RawJobInput {
  const item = asRecord(job);
  const location = formatAshbyLocation(item);
  const workplaceType = stringValue(item.workplaceType);
  const isRemote = item.isRemote === true;
  const workMode = inferWorkMode(workplaceType || location, isRemote);
  const jobSource = createAtsJobSource(source, "ashby");
  const employmentType = parseEmploymentType(stringValue(item.employmentType));
  const compensation = parseAshbyCompensation(item.compensation);
  const postedAt = firstDateString(item, ["publishedDate", "publishedAt", "createdAt", "updatedAt"]);
  const raw: RawJobInput = {
    source: jobSource,
    company: source.company,
    title: stringValue(item.title) || "Untitled Ashby role",
    url: stringValue(item.jobUrl) || stringValue(item.applyUrl) || jobSource.url || "",
    description: htmlToText(stringValue(item.descriptionPlain) || stringValue(item.descriptionHtml)),
    workMode,
    liveState: "live",
    ...(employmentType ? { employmentType } : {}),
    ...(compensation ? { compensation } : {}),
    ...(postedAt ? { postedAt } : {})
  };
  if (location) raw.location = location;
  return raw;
}

interface WorkableFeedJob {
  title: string;
  location: string;
  employmentType?: EmploymentType;
  publicUrl: string;
  detailMarkdownUrl: string;
}

async function discoverWorkableJobs(source: AtsCompanySourceConfig, fetchText: FetchText): Promise<JobRecord[]> {
  const feedUrl = resolveWorkableFeedUrl(source);
  const feed = await fetchText(feedUrl, { headers: { accept: "text/markdown,text/plain,*/*" } });
  const rows = parseWorkableMarkdownFeed(feed);
  const jobs = await mapWithConcurrency(
    rows,
    DEFAULT_DETAIL_CONCURRENCY,
    async (row) => normalizeJob(toWorkableRawJob(row, source, await fetchOptionalText(row.detailMarkdownUrl, fetchText)))
  );
  return jobs;
}

function resolveWorkableFeedUrl(source: AtsCompanySourceConfig): string {
  if (source.apiUrl) return assertHttpsHost(source.apiUrl, ["apply.workable.com"], "Workable API URL");
  const token = source.boardToken ?? firstPathSegment(source.careersUrl);
  if (!token) throw new Error("missing Workable board token or careersUrl");
  return assertHttpsHost(`https://apply.workable.com/${encodeURIComponent(token)}/jobs.md`, ["apply.workable.com"], "Workable feed URL");
}

function parseWorkableMarkdownFeed(value: string): WorkableFeedJob[] {
  const jobs: WorkableFeedJob[] = [];
  for (const line of value.split(/\r?\n/)) {
    if (!line.startsWith("|") || !line.includes("[View]")) continue;
    const columns = line.split("|").map((column) => column.trim());
    const title = columns[1] ?? "";
    if (!title || title.toLowerCase() === "title") continue;
    const location = columns[3] ?? "";
    const employmentType = parseEmploymentType(columns[4]);
    const urlMatch = line.match(/\[View\]\(([^)]+)\)/);
    const rawUrl = urlMatch?.[1]?.trim();
    if (!rawUrl) continue;
    const detailMarkdownUrl = assertHttpsHost(rawUrl.endsWith(".md") ? rawUrl : `${rawUrl}.md`, ["apply.workable.com"], "Workable job URL");
    const publicUrl = detailMarkdownUrl.endsWith(".md") ? detailMarkdownUrl.slice(0, -3) : detailMarkdownUrl;
    jobs.push({
      title,
      location,
      publicUrl,
      detailMarkdownUrl,
      ...(employmentType ? { employmentType } : {})
    });
  }
  return jobs;
}

function toWorkableRawJob(job: WorkableFeedJob, source: AtsCompanySourceConfig, descriptionMarkdown: string): RawJobInput {
  return {
    source: createAtsJobSource(source, "workable"),
    company: source.company,
    title: job.title,
    url: job.publicUrl,
    description: markdownToText(descriptionMarkdown) || job.title,
    location: job.location,
    workMode: inferWorkMode(job.location),
    liveState: "live",
    ...(job.employmentType ? { employmentType: job.employmentType } : {})
  };
}

const SMARTRECRUITERS_PAGE_SIZE = 100;
const SMARTRECRUITERS_MAX_PAGES = 10;

async function discoverSmartRecruitersJobs(source: AtsCompanySourceConfig, fetchJson: FetchJson): Promise<JobRecord[]> {
  const slug = resolveSmartRecruitersSlug(source);
  const rows: unknown[] = [];
  for (let page = 0; page < SMARTRECRUITERS_MAX_PAGES; page += 1) {
    const url = buildSmartRecruitersListUrl(slug, page * SMARTRECRUITERS_PAGE_SIZE);
    const payload = await fetchJson(url);
    const items = asArray(asRecord(payload).content);
    rows.push(...items);
    if (items.length < SMARTRECRUITERS_PAGE_SIZE) break;
  }

  const jobs = await mapWithConcurrency(rows, DEFAULT_DETAIL_CONCURRENCY, async (job) => {
    const detail = await fetchOptionalJson(resolveSmartRecruitersDetailUrl(job, slug), fetchJson);
    return normalizeJob(toSmartRecruitersRawJob(job, detail, source, slug));
  });
  return jobs;
}

function resolveSmartRecruitersSlug(source: AtsCompanySourceConfig): string {
  if (source.boardToken) return source.boardToken;
  const rawUrl = source.careersUrl ?? source.apiUrl;
  if (!rawUrl) throw new Error("missing SmartRecruiters company slug or careersUrl");
  const parsed = safeUrl(rawUrl);
  if (!parsed || parsed.protocol !== "https:") throw new Error(`invalid SmartRecruiters URL: ${rawUrl}`);
  if (parsed.hostname === "api.smartrecruiters.com") {
    const parts = parsed.pathname.split("/").filter(Boolean);
    const companyIndex = parts.indexOf("companies");
    const slug = companyIndex >= 0 ? parts[companyIndex + 1] : undefined;
    if (slug) return slug;
  }
  if (parsed.hostname === "careers.smartrecruiters.com" || parsed.hostname === "jobs.smartrecruiters.com") {
    const slug = parsed.pathname.split("/").filter(Boolean)[0];
    if (slug) return slug;
  }
  throw new Error("could not derive SmartRecruiters company slug");
}

function buildSmartRecruitersListUrl(slug: string, offset: number): string {
  return assertHttpsHost(
    `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings?limit=${SMARTRECRUITERS_PAGE_SIZE}&offset=${offset}&status=PUBLIC`,
    ["api.smartrecruiters.com"],
    "SmartRecruiters postings URL"
  );
}

function resolveSmartRecruitersDetailUrl(job: unknown, slug: string): string {
  const item = asRecord(job);
  const ref = stringValue(item.ref);
  if (ref) return assertHttpsHost(ref, ["api.smartrecruiters.com"], "SmartRecruiters posting ref");
  const id = stringValue(item.id);
  if (!id) throw new Error("missing SmartRecruiters posting id");
  return assertHttpsHost(
    `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings/${encodeURIComponent(id)}`,
    ["api.smartrecruiters.com"],
    "SmartRecruiters posting URL"
  );
}

function toSmartRecruitersRawJob(job: unknown, detail: unknown, source: AtsCompanySourceConfig, slug: string): RawJobInput {
  const item = asRecord(job);
  const detailRecord = asRecord(detail);
  const location = formatSmartRecruitersLocation(asRecord(item.location));
  const employmentType = parseEmploymentType(stringValue(item.typeOfEmployment) || stringValue(detailRecord.typeOfEmployment));
  const url = publicSmartRecruitersUrl(item, slug);
  const postedAt = firstDateString({ ...detailRecord, ...item }, ["releasedDate", "postingDate", "createdOn", "updatedOn"]);
  const raw: RawJobInput = {
    source: createAtsJobSource(source, "smartrecruiters"),
    company: source.company,
    title: stringValue(item.name) || stringValue(detailRecord.name) || "Untitled SmartRecruiters role",
    url,
    description: smartRecruitersDescription(detailRecord) || stringValue(item.name) || "",
    workMode: inferWorkMode(location, asRecord(item.location).remote === true),
    liveState: "live",
    ...(employmentType ? { employmentType } : {}),
    ...(postedAt ? { postedAt } : {})
  };
  if (location) raw.location = location;
  return raw;
}

function formatSmartRecruitersLocation(location: Record<string, unknown>): string {
  const fullLocation = stringValue(location.fullLocation);
  const parts = fullLocation ? [fullLocation] : [
    stringValue(location.city),
    stringValue(location.region),
    stringValue(location.country)
  ].filter(Boolean);
  if (location.remote === true) parts.push("Remote");
  return [...new Set(parts)].join(", ");
}

function publicSmartRecruitersUrl(item: Record<string, unknown>, slug: string): string {
  const ref = stringValue(item.ref);
  const parsedRef = safeUrl(ref);
  if (parsedRef?.protocol === "https:" && parsedRef.hostname === "api.smartrecruiters.com") {
    const rest = parsedRef.pathname.replace(/^\/v1\/companies\//, "");
    if (rest && rest !== parsedRef.pathname) return `https://jobs.smartrecruiters.com/${rest}`;
  }
  const id = stringValue(item.id);
  const title = slugify(stringValue(item.name));
  return id ? `https://jobs.smartrecruiters.com/${encodeURIComponent(slug)}/${encodeURIComponent(id)}-${title}` : `https://jobs.smartrecruiters.com/${encodeURIComponent(slug)}`;
}

function smartRecruitersDescription(detail: Record<string, unknown>): string {
  const direct = htmlToText(stringValue(detail.description));
  if (direct) return direct;
  const sections = asRecord(asRecord(detail.jobAd).sections);
  const parts = [
    sections.companyDescription,
    sections.jobDescription,
    sections.qualifications,
    sections.additionalInformation
  ].map(asRecord).map((section) => htmlToText(stringValue(section.text))).filter(Boolean);
  return parts.join("\n\n");
}

const BAMBOOHR_HOST_RE = /^[a-z0-9][a-z0-9-]*\.bamboohr\.com$/;

async function discoverBambooHrJobs(source: AtsCompanySourceConfig, fetchJson: FetchJson): Promise<JobRecord[]> {
  const origin = resolveBambooHrOrigin(source);
  const payload = await fetchJson(assertBambooHrUrl(`${origin}/careers/list`, "BambooHR careers list URL"), {
    headers: { accept: "application/json" },
    redirect: "error"
  });
  const rows = asArray(asRecord(payload).result);
  return rows.flatMap((job) => {
    const raw = toBambooHrRawJob(job, source, origin);
    return raw ? [normalizeJob(raw)] : [];
  });
}

function resolveBambooHrOrigin(source: AtsCompanySourceConfig): string {
  if (source.boardToken) return assertBambooHrUrl(`https://${source.boardToken}.bamboohr.com`, "BambooHR board token");
  const rawUrl = source.apiUrl ?? source.careersUrl;
  if (!rawUrl) throw new Error("missing BambooHR tenant URL or board token");
  const parsed = safeUrl(rawUrl);
  if (!parsed || parsed.protocol !== "https:" || !BAMBOOHR_HOST_RE.test(parsed.hostname)) {
    throw new Error("BambooHR URL must use HTTPS on <tenant>.bamboohr.com");
  }
  return `https://${parsed.hostname}`;
}

function toBambooHrRawJob(job: unknown, source: AtsCompanySourceConfig, origin: string): RawJobInput | undefined {
  const item = asRecord(job);
  const id = scalarString(item.id);
  const title = stringValue(item.jobOpeningName) || stringValue(item.postingTitle) || stringValue(item.title);
  if (!id || !title) return undefined;

  const location = formatBambooHrLocation(item);
  const employmentType = parseEmploymentType(stringValue(item.employmentStatusLabel) || stringValue(item.employmentType));
  const description = bambooHrDescription(item, title, location);
  const rawUrl = stringValue(item.jobOpeningShareUrl) || stringValue(item.url);
  const postedAt = firstDateString(item, ["datePosted", "postedAt", "createdDate", "postingDate"]);

  return {
    source: createAtsJobSource(source, "bamboohr"),
    company: source.company,
    title,
    url: bambooHrJobUrl(rawUrl, origin, id),
    description,
    workMode: inferWorkMode(location, isTruthy(item.isRemote)),
    liveState: "live",
    ...(location ? { location } : {}),
    ...(employmentType ? { employmentType } : {}),
    ...(postedAt ? { postedAt } : {})
  };
}

function formatBambooHrLocation(item: Record<string, unknown>): string {
  const location = asRecord(item.location);
  const parts = [
    stringValue(location.city),
    stringValue(location.state),
    stringValue(location.country),
    isTruthy(item.isRemote) ? "Remote" : ""
  ].filter(Boolean);
  return [...new Set(parts)].join(", ");
}

function bambooHrDescription(item: Record<string, unknown>, title: string, location: string): string {
  const direct = htmlToText(
    stringValue(item.description) ||
    stringValue(item.jobDescription) ||
    stringValue(item.jobOpeningDescription) ||
    stringValue(item.jobOpeningBrief)
  );
  if (direct) return direct;

  return [
    title,
    stringValue(item.departmentLabel),
    stringValue(item.employmentStatusLabel),
    location
  ].filter(Boolean).join(" · ");
}

function bambooHrJobUrl(rawUrl: string, origin: string, id: string): string {
  if (rawUrl) {
    try {
      return assertBambooHrUrl(rawUrl, "BambooHR job URL");
    } catch {
      // Fall back to the canonical tenant URL below.
    }
  }
  return assertBambooHrUrl(`${origin}/careers/${encodeURIComponent(id)}`, "BambooHR job URL");
}

function assertBambooHrUrl(rawUrl: string, label: string): string {
  const parsed = safeUrl(rawUrl);
  if (!parsed || parsed.protocol !== "https:" || !BAMBOOHR_HOST_RE.test(parsed.hostname)) {
    throw new Error(`${label} must use HTTPS on <tenant>.bamboohr.com`);
  }
  return parsed.href;
}

const BREEZY_HOST_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.breezy\.hr$/;

async function discoverBreezyJobs(source: AtsCompanySourceConfig, fetchJson: FetchJson): Promise<JobRecord[]> {
  const origin = resolveBreezyOrigin(source);
  const payload = await fetchJson(assertBreezyUrl(`${origin}/json`, "Breezy JSON feed URL"), {
    headers: { accept: "application/json" },
    redirect: "error"
  });
  return asArray(payload).flatMap((job) => {
    const raw = toBreezyRawJob(job, source, origin);
    return raw ? [normalizeJob(raw)] : [];
  });
}

function resolveBreezyOrigin(source: AtsCompanySourceConfig): string {
  if (source.boardToken) return assertBreezyUrl(`https://${source.boardToken}.breezy.hr`, "Breezy board token");
  const rawUrl = source.apiUrl ?? source.careersUrl;
  if (!rawUrl) throw new Error("missing Breezy tenant URL or board token");
  const parsed = safeUrl(rawUrl);
  if (!parsed || parsed.protocol !== "https:" || !BREEZY_HOST_RE.test(parsed.hostname)) {
    throw new Error("Breezy URL must use HTTPS on <tenant>.breezy.hr");
  }
  return `https://${parsed.hostname}`;
}

function toBreezyRawJob(job: unknown, source: AtsCompanySourceConfig, origin: string): RawJobInput | undefined {
  const item = asRecord(job);
  const title = stringValue(item.name) || stringValue(item.title);
  if (!title) return undefined;

  const rawUrl = stringValue(item.url);
  const url = breezyJobUrl(rawUrl, origin);
  if (!url) return undefined;

  const location = formatBreezyLocation(item);
  const description = breezyDescription(item, title, location);
  const postedAt = firstDateString(item, ["creation_date", "published_at", "created_at", "updated_at"]);

  return {
    source: createAtsJobSource(source, "breezy"),
    company: source.company,
    title,
    url,
    description,
    workMode: inferWorkMode(location, isTruthy(asRecord(item.location).is_remote) || isTruthy(item.is_remote)),
    liveState: "live",
    ...(location ? { location } : {}),
    ...(postedAt ? { postedAt } : {})
  };
}

function formatBreezyLocation(item: Record<string, unknown>): string {
  const location = asRecord(item.location);
  const named = stringValue(location.name);
  const parts = named ? [named] : [
    stringValue(location.city),
    stringValue(location.state),
    stringValue(asRecord(location.country).name) || stringValue(location.country)
  ].filter(Boolean);
  const isRemote = isTruthy(location.is_remote) || isTruthy(item.is_remote);
  if (isRemote && !parts.join(" ").toLowerCase().includes("remote")) parts.push("Remote");
  return [...new Set(parts)].join(", ");
}

function breezyDescription(item: Record<string, unknown>, title: string, location: string): string {
  const direct = htmlToText(
    stringValue(item.description) ||
    stringValue(item.description_text) ||
    stringValue(item.summary)
  );
  if (direct) return direct;

  return [
    title,
    stringValue(item.department),
    stringValue(item.type),
    location
  ].filter(Boolean).join(" · ");
}

function breezyJobUrl(rawUrl: string, origin: string): string {
  if (!rawUrl) return "";
  const parsed = safeUrl(rawUrl);
  if (!parsed || parsed.protocol !== "https:" || !BREEZY_HOST_RE.test(parsed.hostname)) return "";
  const originUrl = safeUrl(origin);
  if (originUrl && parsed.hostname !== originUrl.hostname) return "";
  return parsed.href;
}

function assertBreezyUrl(rawUrl: string, label: string): string {
  const parsed = safeUrl(rawUrl);
  if (!parsed || parsed.protocol !== "https:" || !BREEZY_HOST_RE.test(parsed.hostname)) {
    throw new Error(`${label} must use HTTPS on <tenant>.breezy.hr`);
  }
  return parsed.href;
}

const RECRUITEE_HOST_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.recruitee\.com$/;

async function discoverRecruiteeJobs(source: AtsCompanySourceConfig, fetchJson: FetchJson): Promise<JobRecord[]> {
  const apiUrl = resolveRecruiteeApiUrl(source);
  const payload = await fetchJson(apiUrl, {
    headers: { accept: "application/json" },
    redirect: "error"
  });
  return asArray(asRecord(payload).offers).flatMap((job) => {
    const raw = toRecruiteeRawJob(job, source);
    return raw ? [normalizeJob(raw)] : [];
  });
}

function resolveRecruiteeApiUrl(source: AtsCompanySourceConfig): string {
  if (source.boardToken) {
    return assertRecruiteeApiUrl(`https://${source.boardToken}.recruitee.com/api/offers/`, "Recruitee board token");
  }

  const rawUrl = source.apiUrl ?? source.careersUrl;
  if (!rawUrl) throw new Error("missing Recruitee tenant URL or board token");
  const parsed = safeUrl(rawUrl);
  if (!parsed || parsed.protocol !== "https:" || !RECRUITEE_HOST_RE.test(parsed.hostname)) {
    throw new Error("Recruitee URL must use HTTPS on <tenant>.recruitee.com");
  }
  return assertRecruiteeApiUrl(`https://${parsed.hostname}/api/offers/`, "Recruitee offers API URL");
}

function toRecruiteeRawJob(job: unknown, source: AtsCompanySourceConfig): RawJobInput | undefined {
  const item = asRecord(job);
  const title = stringValue(item.title) || stringValue(item.name);
  const url = httpsUrl(stringValue(item.careers_url) || stringValue(item.url));
  if (!title || !url) return undefined;

  const location = formatRecruiteeLocation(item);
  const description = recruiteeDescription(item, title, location);
  const employmentType = parseEmploymentType(
    stringValue(item.employment_type) ||
    stringValue(item.employmentType) ||
    stringValue(item.type)
  );
  const postedAt = firstDateString(item, ["created_at", "published_at", "updated_at"]);

  return {
    source: createAtsJobSource(source, "recruitee"),
    company: source.company,
    title,
    url,
    description,
    workMode: inferWorkMode(location, isTruthy(item.remote)),
    liveState: "live",
    ...(location ? { location } : {}),
    ...(employmentType ? { employmentType } : {}),
    ...(postedAt ? { postedAt } : {})
  };
}

function formatRecruiteeLocation(item: Record<string, unknown>): string {
  const explicit = stringValue(item.location);
  if (explicit) return explicit;
  const parts = [
    stringValue(item.city),
    stringValue(item.state),
    stringValue(item.country),
    isTruthy(item.remote) ? "Remote" : ""
  ].filter(Boolean);
  return [...new Set(parts)].join(", ");
}

function recruiteeDescription(item: Record<string, unknown>, title: string, location: string): string {
  const direct = htmlToText(
    stringValue(item.description) ||
    stringValue(item.requirements) ||
    stringValue(item.about) ||
    stringValue(item.summary)
  );
  if (direct) return direct;
  return [
    title,
    stringValue(item.department),
    stringValue(item.employment_type) || stringValue(item.type),
    location
  ].filter(Boolean).join(" · ");
}

function assertRecruiteeApiUrl(rawUrl: string, label: string): string {
  const parsed = safeUrl(rawUrl);
  if (!parsed || parsed.protocol !== "https:" || !RECRUITEE_HOST_RE.test(parsed.hostname)) {
    throw new Error(`${label} must use HTTPS on <tenant>.recruitee.com`);
  }
  return parsed.href;
}

function httpsUrl(rawUrl: string): string {
  const parsed = safeUrl(rawUrl);
  return parsed?.protocol === "https:" ? parsed.href : "";
}

const PINPOINT_HOST_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.pinpointhq\.com$/;

async function discoverPinpointJobs(source: AtsCompanySourceConfig, fetchJson: FetchJson): Promise<JobRecord[]> {
  const apiUrl = resolvePinpointApiUrl(source);
  const payload = await fetchJson(apiUrl, {
    headers: { accept: "application/json" },
    redirect: "error"
  });
  return asArray(asRecord(payload).data).flatMap((job) => {
    const raw = toPinpointRawJob(job, source);
    return raw ? [normalizeJob(raw)] : [];
  });
}

function resolvePinpointApiUrl(source: AtsCompanySourceConfig): string {
  if (source.boardToken) {
    return assertPinpointUrl(`https://${source.boardToken}.pinpointhq.com/postings.json`, "Pinpoint board token");
  }
  const rawUrl = source.apiUrl ?? source.careersUrl;
  if (!rawUrl) throw new Error("missing Pinpoint tenant URL or board token");
  const parsed = safeUrl(rawUrl);
  if (!parsed || parsed.protocol !== "https:" || !PINPOINT_HOST_RE.test(parsed.hostname)) {
    throw new Error("Pinpoint URL must use HTTPS on <tenant>.pinpointhq.com");
  }
  return assertPinpointUrl(`https://${parsed.hostname}/postings.json`, "Pinpoint postings feed URL");
}

function toPinpointRawJob(job: unknown, source: AtsCompanySourceConfig): RawJobInput | undefined {
  const item = asRecord(job);
  const title = stringValue(item.title) || stringValue(item.name);
  const url = pinpointJobUrl(item);
  if (!title || !url) return undefined;

  const location = formatPinpointLocation(item);
  const description = pinpointDescription(item, title, location);
  const employmentType = parseEmploymentType(
    stringValue(item.employment_type) ||
    stringValue(item.employmentType) ||
    stringValue(item.type)
  );
  const postedAt = firstDateString(item, ["created_at", "published_at", "updated_at", "date_posted"]);

  return {
    source: createAtsJobSource(source, "pinpoint"),
    company: source.company,
    title,
    url,
    description,
    workMode: inferWorkMode(location, isTruthy(item.remote) || isTruthy(asRecord(item.location).remote)),
    liveState: "live",
    ...(location ? { location } : {}),
    ...(employmentType ? { employmentType } : {}),
    ...(postedAt ? { postedAt } : {})
  };
}

function pinpointJobUrl(item: Record<string, unknown>): string {
  const direct = httpsUrl(stringValue(item.url));
  if (direct) return direct;
  return "";
}

function formatPinpointLocation(item: Record<string, unknown>): string {
  const location = asRecord(item.location);
  const named = stringValue(location.name);
  if (named) return named;
  const parts = [
    stringValue(location.city),
    stringValue(location.province) || stringValue(location.state),
    stringValue(location.country)
  ].filter(Boolean);
  if ((isTruthy(item.remote) || isTruthy(location.remote)) && !parts.join(" ").toLowerCase().includes("remote")) {
    parts.push("Remote");
  }
  return [...new Set(parts)].join(", ");
}

function pinpointDescription(item: Record<string, unknown>, title: string, location: string): string {
  const job = asRecord(item.job);
  const direct = htmlToText(
    stringValue(item.description) ||
    stringValue(item.summary) ||
    stringValue(job.description)
  );
  if (direct) return direct;
  return [
    title,
    stringValue(asRecord(item.job).department) || stringValue(item.department),
    stringValue(asRecord(item.job).division) || stringValue(item.division),
    location
  ].filter(Boolean).join(" · ");
}

function assertPinpointUrl(rawUrl: string, label: string): string {
  const parsed = safeUrl(rawUrl);
  if (!parsed || parsed.protocol !== "https:" || !PINPOINT_HOST_RE.test(parsed.hostname)) {
    throw new Error(`${label} must use HTTPS on <tenant>.pinpointhq.com`);
  }
  return parsed.href;
}

const PERSONIO_HOST_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.jobs\.personio\.(?:de|com)$/;

async function discoverPersonioJobs(source: AtsCompanySourceConfig, fetchText: FetchText): Promise<JobRecord[]> {
  const feedUrl = resolvePersonioFeedUrl(source);
  const parsed = safeUrl(feedUrl);
  if (!parsed) throw new Error("invalid Personio feed URL");
  const feed = await fetchText(feedUrl, {
    headers: { accept: "application/xml,text/xml,text/plain,*/*" },
    redirect: "error"
  });
  return parsePersonioXml(feed, source.company, parsed.hostname).map((raw) => normalizeJob(raw));
}

function resolvePersonioFeedUrl(source: AtsCompanySourceConfig): string {
  const rawUrl = source.apiUrl ?? source.careersUrl;
  if (!rawUrl) throw new Error("missing Personio tenant URL");
  const parsed = safeUrl(rawUrl);
  if (!parsed || parsed.protocol !== "https:" || !PERSONIO_HOST_RE.test(parsed.hostname)) {
    throw new Error("Personio URL must use HTTPS on <tenant>.jobs.personio.(de|com)");
  }
  return assertPersonioUrl(`https://${parsed.hostname}/xml`, "Personio XML feed URL");
}

function parsePersonioXml(xml: string, company: string, host: string): RawJobInput[] {
  if (!xml) return [];
  const jobs: RawJobInput[] = [];
  const blocks = xml.match(/<position\b[^>]*>[\s\S]*?<\/position>/gi) ?? [];
  for (const block of blocks) {
    const scalar = block.replace(/<jobDescriptions\b[^>]*>[\s\S]*?<\/jobDescriptions>/gi, "");
    const title = personioTagText(scalar, "name");
    const id = personioTagText(scalar, "id");
    if (!title || !/^\d+$/.test(id)) continue;

    const location = formatPersonioLocation(scalar);
    const employmentType = parseEmploymentType(
      personioTagText(scalar, "employmentType") ||
      personioTagText(scalar, "schedule") ||
      personioTagText(scalar, "jobType")
    );
    const postedAt = personioPostedAt(scalar);

    jobs.push({
      source: createAtsJobSource({ company, careersUrl: `https://${host}` }, "personio"),
      company,
      title,
      url: assertPersonioUrl(`https://${host}/job/${encodeURIComponent(id)}`, "Personio job URL"),
      description: personioDescription(block, title, location),
      workMode: inferWorkMode(location),
      liveState: "live",
      ...(location ? { location } : {}),
      ...(employmentType ? { employmentType } : {}),
      ...(postedAt ? { postedAt } : {})
    });
  }
  return jobs;
}

function personioPostedAt(block: string): string | undefined {
  return dateString(
    personioTagText(block, "recruitingStartDate") ||
    personioTagText(block, "createdAt") ||
    personioTagText(block, "updatedAt")
  );
}

function formatPersonioLocation(block: string): string {
  const offices: string[] = [];
  const seen = new Set<string>();
  for (const match of block.matchAll(/<office\b[^>]*>([\s\S]*?)<\/office>/gi)) {
    const office = extractPersonioText(match[1] ?? "");
    if (office && !seen.has(office.toLowerCase())) {
      seen.add(office.toLowerCase());
      offices.push(office);
    }
  }
  return offices.join(", ");
}

function personioDescription(block: string, title: string, location: string): string {
  const parts: string[] = [];
  for (const match of block.matchAll(/<jobDescription\b[^>]*>[\s\S]*?<\/jobDescription>/gi)) {
    const value = personioTagText(match[0] ?? "", "value");
    const text = htmlToText(value);
    if (text) parts.push(text);
  }
  const direct = [...new Set(parts)].join("\n\n");
  if (direct) return direct;
  return [title, location].filter(Boolean).join(" · ");
}

function personioTagText(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? extractPersonioText(match[1] ?? "") : "";
}

function extractPersonioText(value: string): string {
  const cdata = value.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return decodeXmlEntities(cdata ? cdata[1] ?? "" : value).trim();
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, code: string) => fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code: string) => fromCodePoint(parseInt(code, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function fromCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

function assertPersonioUrl(rawUrl: string, label: string): string {
  const parsed = safeUrl(rawUrl);
  if (!parsed || parsed.protocol !== "https:" || !PERSONIO_HOST_RE.test(parsed.hostname)) {
    throw new Error(`${label} must use HTTPS on <tenant>.jobs.personio.(de|com)`);
  }
  return parsed.href;
}

const WORKDAY_PAGE_SIZE = 20;
const WORKDAY_MAX_PAGES = 50;
const WORKDAY_HOST_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.wd[a-z0-9-]*\.myworkdayjobs\.com$/;

interface WorkdayEndpoint {
  apiUrl: string;
  host: string;
  jobBaseUrl: string;
  origin: string;
  site: string;
}

async function discoverWorkdayJobs(source: AtsCompanySourceConfig, fetchJson: FetchJson): Promise<JobRecord[]> {
  const endpoint = resolveWorkdayEndpoint(source);
  const rows: unknown[] = [];
  for (let page = 0; page < WORKDAY_MAX_PAGES; page += 1) {
    const payload = await fetchJson(endpoint.apiUrl, {
      method: "POST",
      redirect: "error",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        limit: WORKDAY_PAGE_SIZE,
        offset: page * WORKDAY_PAGE_SIZE,
        searchText: "",
        appliedFacets: {}
      })
    });
    const postings = asArray(asRecord(payload).jobPostings);
    rows.push(...postings);
    if (postings.length < WORKDAY_PAGE_SIZE) break;
  }

  return rows.flatMap((job) => {
    const raw = toWorkdayRawJob(job, source, endpoint);
    return raw ? [normalizeJob(raw)] : [];
  });
}

function resolveWorkdayEndpoint(source: AtsCompanySourceConfig): WorkdayEndpoint {
  if (source.apiUrl) {
    return parseWorkdayApiUrl(source.apiUrl);
  }

  const rawUrl = source.careersUrl;
  if (!rawUrl) throw new Error("missing Workday careersUrl or apiUrl");
  const parsed = safeUrl(rawUrl);
  if (!parsed || parsed.protocol !== "https:" || !WORKDAY_HOST_RE.test(parsed.hostname)) {
    throw new Error("Workday URL must use HTTPS on <tenant>.<wd-instance>.myworkdayjobs.com");
  }

  const tenant = parsed.hostname.split(".")[0] ?? "";
  const pathSegments = parsed.pathname.split("/").filter(Boolean);
  const site = source.boardToken || pathSegments.find((segment) => !isLocaleSegment(segment));
  if (!tenant || !site) throw new Error("could not derive Workday tenant and site from careersUrl");
  return buildWorkdayEndpoint(parsed.hostname, tenant, site);
}

function parseWorkdayApiUrl(rawUrl: string): WorkdayEndpoint {
  const parsed = safeUrl(rawUrl);
  if (!parsed || parsed.protocol !== "https:" || !WORKDAY_HOST_RE.test(parsed.hostname)) {
    throw new Error("Workday API URL must use HTTPS on <tenant>.<wd-instance>.myworkdayjobs.com");
  }
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments[0] !== "wday" || segments[1] !== "cxs" || segments[4] !== "jobs") {
    throw new Error("Workday API URL must use /wday/cxs/<tenant>/<site>/jobs");
  }
  const tenant = segments[2] ?? "";
  const site = segments[3] ?? "";
  if (!tenant || !site) throw new Error("could not derive Workday tenant and site from apiUrl");
  return {
    ...buildWorkdayEndpoint(parsed.hostname, tenant, site),
    apiUrl: parsed.href
  };
}

function buildWorkdayEndpoint(host: string, tenant: string, site: string): WorkdayEndpoint {
  const origin = `https://${host}`;
  const encodedTenant = encodeURIComponent(tenant);
  const encodedSite = encodeURIComponent(site);
  return {
    apiUrl: `${origin}/wday/cxs/${encodedTenant}/${encodedSite}/jobs`,
    host,
    jobBaseUrl: `${origin}/${encodedSite}`,
    origin,
    site
  };
}

function toWorkdayRawJob(job: unknown, source: AtsCompanySourceConfig, endpoint: WorkdayEndpoint): RawJobInput | undefined {
  const item = asRecord(job);
  const title = stringValue(item.title);
  const url = workdayJobUrl(stringValue(item.externalPath), endpoint);
  if (!title || !url) return undefined;

  const location = formatWorkdayLocation(item);
  const employmentType = parseEmploymentType(
    stringValue(item.timeType) ||
    stringValue(item.workerSubType) ||
    stringValue(item.jobType)
  );
  const postedAt = firstDateString(item, ["postedOn", "postedOnDate", "startDate", "createdAt", "updatedAt"]);

  return {
    source: createAtsJobSource(source, "workday"),
    company: source.company,
    title,
    url,
    description: workdayDescription(item, title, location),
    workMode: inferWorkMode(location),
    liveState: "live",
    ...(location ? { location } : {}),
    ...(employmentType ? { employmentType } : {}),
    ...(postedAt ? { postedAt } : {})
  };
}

function workdayJobUrl(externalPath: string, endpoint: WorkdayEndpoint): string {
  if (!externalPath) return "";
  const path = externalPath.startsWith("/") ? externalPath : `/${externalPath}`;
  const sitePrefix = `/${endpoint.site}/`;
  const rawUrl = path.startsWith(sitePrefix) ? `${endpoint.origin}${path}` : `${endpoint.jobBaseUrl}${path}`;
  const parsed = safeUrl(rawUrl);
  if (!parsed || parsed.protocol !== "https:" || parsed.hostname !== endpoint.host) return "";
  return parsed.href;
}

function formatWorkdayLocation(item: Record<string, unknown>): string {
  const explicit = stringValue(item.locationsText) || stringValue(item.location);
  if (explicit) return explicit;
  const locations = asArray(item.locations).map((location) => {
    const record = asRecord(location);
    return stringValue(record.descriptor) || stringValue(record.name);
  });
  return [...new Set(locations.filter(Boolean))].join(", ");
}

function workdayDescription(item: Record<string, unknown>, title: string, location: string): string {
  const direct = htmlToText(
    stringValue(item.description) ||
    stringValue(item.jobDescription) ||
    stringValue(item.externalDescription)
  );
  if (direct) return direct;

  const fields = asArray(item.bulletFields).flatMap((field) => {
    const record = asRecord(field);
    return stringValue(record.text) || stringValue(record.label) || stringValue(field);
  });
  return [
    title,
    location,
    stringValue(item.postedOn),
    stringValue(item.timeType),
    stringValue(item.workerSubType),
    ...fields
  ].filter(Boolean).join(" · ");
}

function isLocaleSegment(value: string): boolean {
  return /^[a-z]{2}(?:-[A-Z]{2})?$/.test(value);
}

const RIPPLING_CAREERS_HOST = "ats.rippling.com";
const RIPPLING_API_HOST = "api.rippling.com";
const RIPPLING_SLUG_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;

async function discoverRipplingJobs(source: AtsCompanySourceConfig, fetchJson: FetchJson): Promise<JobRecord[]> {
  const apiUrl = resolveRipplingApiUrl(source);
  const payload = await fetchJson(apiUrl, {
    headers: { accept: "application/json" },
    redirect: "error"
  });
  return asArray(payload).flatMap((job) => {
    const raw = toRipplingRawJob(job, source);
    return raw ? [normalizeJob(raw)] : [];
  });
}

function resolveRipplingApiUrl(source: AtsCompanySourceConfig): string {
  if (source.apiUrl) {
    const parsed = safeUrl(source.apiUrl);
    if (
      !parsed ||
      parsed.protocol !== "https:" ||
      parsed.hostname !== RIPPLING_API_HOST ||
      !/^\/platform\/api\/ats\/v1\/board\/[^/]+\/jobs\/?$/.test(parsed.pathname)
    ) {
      throw new Error("Rippling API URL must use HTTPS on api.rippling.com/platform/api/ats/v1/board/<slug>/jobs");
    }
    return parsed.href;
  }

  const slug = source.boardToken || ripplingSlugFromCareersUrl(source.careersUrl);
  if (!slug || !RIPPLING_SLUG_RE.test(slug)) throw new Error("missing or unsafe Rippling board slug");
  return `https://${RIPPLING_API_HOST}/platform/api/ats/v1/board/${encodeURIComponent(slug)}/jobs`;
}

function ripplingSlugFromCareersUrl(rawUrl?: string): string {
  const parsed = safeUrl(rawUrl ?? "");
  if (!parsed || parsed.protocol !== "https:" || parsed.hostname !== RIPPLING_CAREERS_HOST) return "";
  return parsed.pathname.split("/").filter(Boolean)[0] ?? "";
}

function toRipplingRawJob(job: unknown, source: AtsCompanySourceConfig): RawJobInput | undefined {
  const item = asRecord(job);
  const title = stringValue(item.name);
  const url = ripplingJobUrl(stringValue(item.url));
  if (!title || !url) return undefined;

  const location = ripplingLocation(item.workLocation);
  const department = stringValue(asRecord(item.department).label);
  const postedAt = firstDateString(item, ["createdAt", "updatedAt", "postedAt"]);
  return {
    source: createAtsJobSource(source, "rippling"),
    company: source.company,
    title,
    url,
    description: [title, department, location].filter(Boolean).join(" · "),
    workMode: inferWorkMode(location),
    liveState: "live",
    ...(location ? { location } : {}),
    ...(postedAt ? { postedAt } : {})
  };
}

function ripplingJobUrl(rawUrl: string): string {
  const parsed = safeUrl(rawUrl);
  if (!parsed || parsed.protocol !== "https:" || parsed.hostname !== RIPPLING_CAREERS_HOST) return "";
  return parsed.href;
}

function ripplingLocation(value: unknown): string {
  const record = asRecord(value);
  return stringValue(record.label) || stringValue(record.name) || stringValue(value);
}

function createAtsJobSource(source: AtsCompanySourceConfig, provider: AtsProviderId): JobSource {
  return {
    id: source.id ?? `${provider}-${slugify(source.company)}`,
    kind: "ats",
    name: `${source.company} ${provider}`,
    ...(source.careersUrl ?? source.apiUrl ? { url: source.careersUrl ?? source.apiUrl } : {})
  };
}

function firstPathSegment(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined;
  try {
    const parsed = new URL(rawUrl);
    return parsed.pathname.split("/").filter(Boolean)[0];
  } catch {
    return undefined;
  }
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
    if (options.method) requestInit.method = options.method;
    if (options.body) requestInit.body = options.body;
    const response = await fetch(url, requestInit);
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
    const requestInit: RequestInit = {
      headers: {
        accept: "text/plain,text/markdown,*/*",
        ...(options.headers ?? {})
      },
      signal: controller.signal
    };
    if (options.redirect) requestInit.redirect = options.redirect;
    if (options.method) requestInit.method = options.method;
    if (options.body) requestInit.body = options.body;
    const response = await fetch(url, requestInit);
    if (!response.ok) throw new Error(`HTTP ${response.status} while fetching ${url}`);
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOptionalText(url: string, fetchText: FetchText): Promise<string> {
  try {
    return await fetchText(url, { headers: { accept: "text/markdown,text/plain,*/*" } });
  } catch {
    return "";
  }
}

async function fetchOptionalJson(url: string, fetchJson: FetchJson): Promise<unknown> {
  try {
    return await fetchJson(url);
  } catch {
    return {};
  }
}

function formatAshbyLocation(item: Record<string, unknown>): string | undefined {
  const parts: string[] = [];
  const primary = stringValue(item.location);
  if (primary) parts.push(primary);
  for (const secondary of asArray(item.secondaryLocations)) {
    const secondaryRecord = asRecord(secondary);
    const secondaryLocation = stringValue(secondaryRecord.location);
    if (secondaryLocation) parts.push(secondaryLocation);
    const postal = asRecord(asRecord(secondaryRecord.address).postalAddress);
    for (const key of ["addressLocality", "addressRegion", "addressCountry"]) {
      const value = stringValue(postal[key]);
      if (value) parts.push(value);
    }
  }
  return [...new Set(parts)].join(" · ") || undefined;
}

function parseAshbyCompensation(value: unknown): Compensation | undefined {
  const compensation = asRecord(value);
  const components = [
    ...asArray(compensation.summaryComponents),
    ...asArray(compensation.compensationTiers).flatMap((tier) => asArray(asRecord(tier).components))
  ].map(asRecord);
  const salary = components.find((component) => stringValue(component.compensationType).toLowerCase() === "salary");
  if (!salary) return undefined;

  const min = numberValue(salary.minValue);
  const max = numberValue(salary.maxValue);
  const currency = stringValue(salary.currencyCode);
  const period = parseCompensationPeriod(stringValue(salary.interval));
  const result: Compensation = {};
  if (typeof min === "number") result.min = min;
  if (typeof max === "number") result.max = max;
  if (currency) result.currency = currency;
  if (period) result.period = period;
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseCompensationPeriod(value: string): Compensation["period"] | undefined {
  const normalized = value.trim().toUpperCase();
  if (normalized.includes("YEAR")) return "year";
  if (normalized.includes("MONTH")) return "month";
  if (normalized.includes("HOUR")) return "hour";
  return undefined;
}

function inferWorkMode(value?: string, isRemote?: boolean): WorkMode {
  if (isRemote) return "remote";
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
    full_time: "full_time",
    fulltime: "full_time",
    full_time_permanent: "full_time",
    permanent: "full_time",
    part_time: "part_time",
    parttime: "part_time",
    contract: "contract",
    contractor: "contract",
    consulting: "consulting",
    fractional: "fractional",
    internship: "internship",
    intern: "internship"
  };
  return aliases[normalized];
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

function markdownToText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
      .replace(/^\s{0,3}#{1,6}\s*/gm, "")
      .replace(/[*_>#-]+/g, " ")
      .replace(/\|/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function assertHttpsHost(rawUrl: string, allowedHosts: string[], label: string): string {
  const parsed = safeUrl(rawUrl);
  if (!parsed || parsed.protocol !== "https:" || !allowedHosts.includes(parsed.hostname)) {
    throw new Error(`${label} must use HTTPS on ${allowedHosts.join(", ")}`);
  }
  return parsed.href;
}

function safeUrl(rawUrl: string): URL | undefined {
  try {
    return rawUrl ? new URL(rawUrl) : undefined;
  } catch {
    return undefined;
  }
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

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function scalarString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function firstDateString(record: Record<string, unknown>, fields: string[]): string | undefined {
  for (const field of fields) {
    const value = record[field];
    const date = dateString(value);
    if (date) return date;
  }
  return undefined;
}

function dateString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
    return new Date(milliseconds).toISOString();
  }
  if (typeof value !== "string" || !value.trim()) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  return new Date(timestamp).toISOString();
}

function isTruthy(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || (typeof value === "string" && value.toLowerCase() === "true");
}

function numberValue(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : undefined;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company";
}

function uniqueJobsById(jobs: JobRecord[]): JobRecord[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (seen.has(job.id)) return false;
    seen.add(job.id);
    return true;
  });
}
