import type {
  CompanyStage,
  Compensation,
  EmploymentType,
  JobLiveState,
  JobRecord,
  JobSource,
  Seniority,
  WorkMode
} from "@applycue/core";

export interface RawJobInput {
  source: JobSource;
  company: string;
  title: string;
  url: string;
  description?: string;
  location?: string;
  workMode?: WorkMode;
  seniority?: Seniority;
  employmentType?: EmploymentType;
  companyStage?: CompanyStage;
  compensation?: Compensation;
  liveState?: JobLiveState;
}

export function normalizeJob(input: RawJobInput): JobRecord {
  const job: JobRecord = {
    id: stableJobId(input.company, input.title, input.url),
    source: input.source,
    company: input.company.trim(),
    title: input.title.trim(),
    url: input.url.trim(),
    description: input.description?.trim() ?? "",
    workMode: input.workMode ?? "unknown",
    discoveredAt: new Date().toISOString(),
    liveState: input.liveState ?? inferLiveState(input)
  };

  if (input.location?.trim()) job.location = input.location.trim();
  if (input.seniority) job.seniority = input.seniority;
  if (input.employmentType) job.employmentType = input.employmentType;
  if (input.companyStage) job.companyStage = input.companyStage;
  if (input.compensation) job.compensation = input.compensation;

  return job;
}

function inferLiveState(input: RawJobInput): JobLiveState {
  const text = `${input.title} ${input.description ?? ""}`.toLowerCase();
  const closedSignals = [
    "no longer accepting applications",
    "job no longer available",
    "no longer available",
    "no longer open",
    "position has been filled",
    "this job has expired",
    "job has expired",
    "job has been closed",
    "posting has closed",
    "application deadline has passed",
    "not accepting applications"
  ];
  return closedSignals.some((signal) => text.includes(signal)) ? "closed" : "unknown";
}

export function stableJobId(company: string, title: string, url: string): string {
  return [company, title, url]
    .join(" ")
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160);
}
