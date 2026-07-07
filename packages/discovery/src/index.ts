import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { CompanyStage, EmploymentType, JobRecord, JobSource, Seniority, WorkMode } from "@applycue/core";
import { normalizeJob, type RawJobInput } from "@applycue/normalizer";

export * from "./ats.js";
export * from "./ats-directory.js";
export * from "./job-boards.js";
export * from "./liveness.js";
export * from "./scan-history.js";
export * from "./source-plan.js";
export * from "./source-quality.js";

export interface DiscoverySource {
  id: string;
  name: string;
  discover(): Promise<JobRecord[]>;
}

export class StaticDiscoverySource implements DiscoverySource {
  constructor(
    public readonly id: string,
    public readonly name: string,
    private readonly jobs: JobRecord[]
  ) {}

  async discover(): Promise<JobRecord[]> {
    return this.jobs;
  }
}

export interface LocalJobFileSourceOptions {
  filePath: string;
  source?: JobSource;
}

export class LocalJobFileDiscoverySource implements DiscoverySource {
  public readonly id = "local-job-file";
  public readonly name = "Local job file or directory";

  constructor(private readonly options: LocalJobFileSourceOptions) {}

  async discover(): Promise<JobRecord[]> {
    return discoverJobsFromPath(this.options.filePath, this.options.source);
  }
}

type LocalRawJob = Partial<Omit<RawJobInput, "source">> & { source?: JobSource };

const SUPPORTED_JOB_FILE_EXTENSIONS = new Set([".json", ".jsonl", ".md", ".markdown", ".txt"]);

export async function discoverJobsFromPath(inputPath: string, fallbackSource = createLocalFileSource(inputPath)): Promise<JobRecord[]> {
  const stats = await stat(inputPath);
  if (stats.isDirectory()) return discoverJobsFromDirectory(inputPath, fallbackSource);
  return discoverJobsFromFile(inputPath, fallbackSource);
}

export async function discoverJobsFromDirectory(
  directoryPath: string,
  fallbackSource = createLocalFileSource(directoryPath)
): Promise<JobRecord[]> {
  const files = await listSupportedJobFiles(directoryPath);
  const jobGroups = await Promise.all(
    files.map((filePath) =>
      discoverJobsFromFile(filePath, fallbackSource.id === "local-file" ? createLocalFileSource(filePath) : fallbackSource)
    )
  );
  return uniqueJobsById(jobGroups.flat());
}

export async function discoverJobsFromFile(filePath: string, fallbackSource = createLocalFileSource(filePath)): Promise<JobRecord[]> {
  const content = await readFile(filePath, "utf8");
  return parseLocalJobRows(content, filePath, fallbackSource).map((row) => normalizeJob(toRawJobInput(row, filePath, fallbackSource)));
}

function parseLocalJobRows(content: string, filePath: string, fallbackSource: JobSource): LocalRawJob[] {
  const trimmed = content.trim();
  if (!trimmed) return [];
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".md" || extension === ".markdown" || extension === ".txt") {
    return [parseManualJobDocument(content, fallbackSource)];
  }
  if (trimmed.startsWith("[")) {
    return JSON.parse(trimmed) as LocalRawJob[];
  }
  if (trimmed.startsWith("{")) {
    if (path.extname(filePath).toLowerCase() === ".jsonl") return parseJsonLines(trimmed);
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed.jobs)) return parsed.jobs as LocalRawJob[];
    if (Array.isArray(parsed.results)) return parsed.results as LocalRawJob[];
    return [parsed as LocalRawJob];
  }
  return parseJsonLines(trimmed);
}

function parseJsonLines(value: string): LocalRawJob[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LocalRawJob);
}

async function listSupportedJobFiles(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const paths = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith("."))
      .map(async (entry) => {
        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) return listSupportedJobFiles(entryPath);
        if (entry.isFile() && SUPPORTED_JOB_FILE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) return [entryPath];
        return [];
      })
  );
  return paths.flat().sort((a, b) => a.localeCompare(b));
}

function parseManualJobDocument(content: string, fallbackSource: JobSource): LocalRawJob {
  const frontMatter = splitFrontMatter(content);
  if (frontMatter) {
    return withOptionalDescription({
      ...frontMatter.metadata,
      source: fallbackSource
    }, frontMatter.body.trim() || frontMatter.metadata.description);
  }

  const leadingMetadata = splitLeadingMetadata(content);
  return withOptionalDescription({
    ...leadingMetadata.metadata,
    source: fallbackSource
  }, leadingMetadata.body.trim() || leadingMetadata.metadata.description);
}

function splitFrontMatter(content: string): { metadata: LocalRawJob; body: string } | undefined {
  const match = content.match(/^\s*---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return undefined;
  return {
    metadata: parseMetadataBlock(match[1] ?? ""),
    body: match[2] ?? ""
  };
}

function splitLeadingMetadata(content: string): { metadata: LocalRawJob; body: string } {
  const lines = content.split(/\r?\n/);
  const metadataLines: string[] = [];
  let bodyStart = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (metadataLines.length > 0) bodyStart += 1;
      break;
    }
    if (!isRecognizedMetadataLine(trimmed)) break;
    metadataLines.push(line);
    bodyStart += 1;
  }

  const body = metadataLines.length > 0 ? lines.slice(bodyStart).join("\n") : content;
  return {
    metadata: parseMetadataBlock(metadataLines.join("\n")),
    body
  };
}

function isRecognizedMetadataLine(line: string): boolean {
  const match = line.match(/^([A-Za-z][A-Za-z0-9 _-]{0,40}):\s*(.*)$/);
  if (!match) return false;
  return fieldNameFromKey(match[1] ?? "") !== undefined;
}

function parseMetadataBlock(block: string): LocalRawJob {
  const raw: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z][A-Za-z0-9 _-]{0,40}):\s*(.*)$/);
    if (!match) continue;
    const fieldName = fieldNameFromKey(match[1] ?? "");
    if (!fieldName) continue;
    raw[fieldName] = stripWrappingQuotes(match[2] ?? "");
  }

  const output: LocalRawJob = {};
  if (raw.company) output.company = raw.company;
  if (raw.title) output.title = raw.title;
  if (raw.url) output.url = raw.url;
  if (raw.description) output.description = raw.description;
  if (raw.location) output.location = raw.location;
  const workMode = parseWorkMode(raw.workMode);
  if (workMode) output.workMode = workMode;
  const seniority = parseSeniority(raw.seniority);
  if (seniority) output.seniority = seniority;
  const employmentType = parseEmploymentType(raw.employmentType);
  if (employmentType) output.employmentType = employmentType;
  const companyStage = parseCompanyStage(raw.companyStage);
  if (companyStage) output.companyStage = companyStage;
  const liveState = parseLiveState(raw.liveState);
  if (liveState) output.liveState = liveState;
  return output;
}

function withOptionalDescription(row: LocalRawJob, description?: string): LocalRawJob {
  const trimmed = description?.trim();
  return trimmed ? { ...row, description: trimmed } : row;
}

function fieldNameFromKey(key: string): keyof Omit<RawJobInput, "source"> | undefined {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const aliases: Record<string, keyof Omit<RawJobInput, "source">> = {
    company: "company",
    companyname: "company",
    employer: "company",
    organization: "company",
    title: "title",
    role: "title",
    jobtitle: "title",
    position: "title",
    url: "url",
    link: "url",
    joburl: "url",
    applyurl: "url",
    description: "description",
    jd: "description",
    jobdescription: "description",
    location: "location",
    workmode: "workMode",
    worktype: "workMode",
    seniority: "seniority",
    level: "seniority",
    employmenttype: "employmentType",
    employment: "employmentType",
    type: "employmentType",
    companystage: "companyStage",
    stage: "companyStage",
    livestate: "liveState",
    live: "liveState",
    jobstatus: "liveState",
    postingstatus: "liveState"
  };
  return aliases[normalized];
}

function toRawJobInput(row: LocalRawJob, filePath: string, fallbackSource: JobSource): RawJobInput {
  const description = row.description?.trim() ?? "";
  const liveState = parseLiveState(row.liveState);
  return {
    source: row.source ?? fallbackSource,
    company: row.company?.trim() || "Unknown company",
    title: row.title?.trim() || inferTitle(description, filePath),
    url: row.url?.trim() || pathToFileURL(filePath).href,
    description,
    ...(row.location ? { location: row.location } : {}),
    ...(row.workMode ? { workMode: row.workMode } : {}),
    ...(row.seniority ? { seniority: row.seniority } : {}),
    ...(row.employmentType ? { employmentType: row.employmentType } : {}),
    ...(row.companyStage ? { companyStage: row.companyStage } : {}),
    ...(liveState ? { liveState } : {})
  };
}

function inferTitle(description: string, filePath: string): string {
  const heading = description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("# ") || line.startsWith("## "));
  if (heading) return heading.replace(/^#+\s*/, "").trim();
  return `Untitled role from ${path.basename(filePath)}`;
}

function uniqueJobsById(jobs: JobRecord[]): JobRecord[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (seen.has(job.id)) return false;
    seen.add(job.id);
    return true;
  });
}

function stripWrappingQuotes(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "").trim();
}

function normalizeEnumValue(value?: string): string | undefined {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return normalized || undefined;
}

function parseWorkMode(value?: string): WorkMode | undefined {
  const normalized = normalizeEnumValue(value);
  if (!normalized) return undefined;
  const aliases: Record<string, WorkMode> = {
    remote: "remote",
    wfh: "remote",
    work_from_home: "remote",
    hybrid: "hybrid",
    onsite: "onsite",
    on_site: "onsite",
    office: "onsite",
    unknown: "unknown"
  };
  return aliases[normalized];
}

function parseSeniority(value?: string): Seniority | undefined {
  const normalized = normalizeEnumValue(value);
  if (!normalized) return undefined;
  const aliases: Record<string, Seniority> = {
    intern: "intern",
    internship: "intern",
    junior: "junior",
    mid: "mid",
    middle: "mid",
    senior: "senior",
    lead: "lead",
    manager: "manager",
    director: "director",
    vp: "vp",
    vice_president: "vp",
    c_level: "c_level",
    csuite: "c_level",
    c_suite: "c_level",
    founder: "founder",
    unknown: "unknown"
  };
  return aliases[normalized];
}

function parseEmploymentType(value?: string): EmploymentType | undefined {
  const normalized = normalizeEnumValue(value);
  if (!normalized) return undefined;
  const aliases: Record<string, EmploymentType> = {
    full_time: "full_time",
    fulltime: "full_time",
    permanent: "full_time",
    part_time: "part_time",
    parttime: "part_time",
    contract: "contract",
    consulting: "consulting",
    fractional: "fractional",
    internship: "internship",
    intern: "internship",
    unknown: "unknown"
  };
  return aliases[normalized];
}

function parseCompanyStage(value?: string): CompanyStage | undefined {
  const normalized = normalizeEnumValue(value);
  if (!normalized) return undefined;
  const aliases: Record<string, CompanyStage> = {
    startup: "startup",
    start_up: "startup",
    scaleup: "scaleup",
    scale_up: "scaleup",
    mid_market: "mid_market",
    midmarket: "mid_market",
    enterprise: "enterprise",
    public_company: "public_company",
    public: "public_company",
    agency: "agency",
    nonprofit: "nonprofit",
    non_profit: "nonprofit",
    unknown: "unknown"
  };
  return aliases[normalized];
}

function parseLiveState(value?: string): RawJobInput["liveState"] | undefined {
  const normalized = normalizeEnumValue(value);
  if (!normalized) return undefined;
  const aliases: Record<string, NonNullable<RawJobInput["liveState"]>> = {
    live: "live",
    active: "live",
    open: "live",
    current: "live",
    closed: "closed",
    expired: "closed",
    inactive: "closed",
    filled: "closed",
    unknown: "unknown"
  };
  return aliases[normalized];
}

function createLocalFileSource(inputPath?: string): JobSource {
  return {
    id: "local-file",
    kind: "manual",
    name: "Local job file",
    ...(inputPath ? { url: pathToFileURL(inputPath).href } : {})
  };
}
