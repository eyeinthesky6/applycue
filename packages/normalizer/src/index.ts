import type {
  CompanyMarketGrade,
  CompanyStage,
  Compensation,
  EmploymentType,
  ExperienceRange,
  JobLiveState,
  JobRecord,
  JobSource,
  SeniorityEvidence,
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
  seniorityEvidence?: SeniorityEvidence;
  companyMarketGrade?: CompanyMarketGrade;
  requiredExperienceYears?: ExperienceRange;
  employmentType?: EmploymentType;
  companyStage?: CompanyStage;
  compensation?: Compensation;
  liveState?: JobLiveState;
}

export function normalizeJob(input: RawJobInput): JobRecord {
  const inferredSeniority = input.seniority ?? inferSeniorityFromTitle(input.title);
  const seniorityEvidence = input.seniorityEvidence ?? buildSeniorityEvidence(input, inferredSeniority);
  const requiredExperienceYears = input.requiredExperienceYears ?? inferRequiredExperienceYears(input.description ?? "");
  const companyMarketGrade = input.companyMarketGrade ?? inferCompanyMarketGrade(input.company, input.url);
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
  if (inferredSeniority) job.seniority = inferredSeniority;
  if (seniorityEvidence) job.seniorityEvidence = seniorityEvidence;
  if (companyMarketGrade) job.companyMarketGrade = companyMarketGrade;
  if (requiredExperienceYears) job.requiredExperienceYears = requiredExperienceYears;
  if (input.employmentType) job.employmentType = input.employmentType;
  if (input.companyStage) job.companyStage = input.companyStage;
  if (input.compensation) job.compensation = input.compensation;

  return job;
}

export function inferCompanyMarketGrade(company: string, url = ""): CompanyMarketGrade | undefined {
  const text = normalizeText(`${company} ${url}`);
  if (!text) return undefined;
  return GLOBAL_ENTERPRISE_MARKERS.some((marker) => text.includes(marker)) ? "global_enterprise" : undefined;
}

export function inferSeniorityFromTitle(title: string): Seniority | undefined {
  const normalized = normalizeText(title);
  if (!normalized) return undefined;
  if (hasAny(normalized, ["chief product officer", "chief technology officer", "chief executive officer"])) return "c_level";
  if (/\b(cpo|cto|ceo|coo|cfo|cmo)\b/.test(normalized)) return "c_level";
  if (/\bchief\b/.test(normalized)) return "c_level";
  if (/\bfounder\b|\bco founder\b/.test(normalized)) return "founder";
  if (/\bassistant vice president\b|\bassociate vice president\b|\bavp\b/.test(normalized)) return undefined;
  if (/\bvice president\b|\bvp\b|\bsvp\b|\bevp\b/.test(normalized)) return "vp";
  if (/\bdirector\b|\bhead of\b|\bhead\b/.test(normalized)) return "director";
  if (/\bprincipal\b|\blead\b|\bstaff\b/.test(normalized)) return "lead";
  if (/\bsenior\b|\bsr\b/.test(normalized)) return "senior";
  if (/\bintern\b|\binternship\b|\btrainee\b|\bgraduate trainee\b|\bnew grad\b/.test(normalized)) return "intern";
  if (/\bjunior\b|\bassociate\b|\bassistant\b|\bentry level\b/.test(normalized)) return "junior";
  if (/\bmanager\b|\bproduct owner\b/.test(normalized)) return "manager";
  return undefined;
}

export function inferRequiredExperienceYears(description: string): ExperienceRange | undefined {
  const normalized = normalizeText(description);
  if (!normalized) return undefined;

  const rangeMatch = normalized.match(/\b(\d{1,2})\s*(?:-|to)\s*(\d{1,2})\s*(?:years|yrs)\b/);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    if (Number.isFinite(min) && Number.isFinite(max)) return normalizeExperienceRange({ min, max });
  }

  const plusMatch = normalized.match(/\b(\d{1,2})\s*(?:\+|plus)\s*(?:years|yrs)\b/);
  if (plusMatch) {
    const min = Number(plusMatch[1]);
    if (Number.isFinite(min)) return { min };
  }

  const minimumMatch = normalized.match(/\b(?:minimum|min)\s*(?:of)?\s*(\d{1,2})\s*(?:years|yrs)\b/);
  if (minimumMatch) {
    const min = Number(minimumMatch[1]);
    if (Number.isFinite(min)) return { min };
  }

  return undefined;
}

function buildSeniorityEvidence(input: RawJobInput, seniority?: Seniority): SeniorityEvidence | undefined {
  if (!seniority) return undefined;
  if (input.seniority) {
    return {
      value: seniority,
      source: "explicit",
      confidence: "high",
      reason: "Seniority came from the provider or local job input."
    };
  }
  return {
    value: seniority,
    source: "title",
    confidence: seniority === "manager" || seniority === "lead" ? "medium" : "high",
    reason: "Seniority was inferred from the job title."
  };
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

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+-]+/g, " ").replace(/\s+/g, " ").trim();
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function normalizeExperienceRange(range: ExperienceRange): ExperienceRange | undefined {
  const min = typeof range.min === "number" && Number.isFinite(range.min) ? Math.max(0, Math.floor(range.min)) : undefined;
  const max = typeof range.max === "number" && Number.isFinite(range.max) ? Math.max(0, Math.floor(range.max)) : undefined;
  if (typeof min !== "number" && typeof max !== "number") return undefined;
  if (typeof min === "number" && typeof max === "number") return min <= max ? { min, max } : { min: max, max: min };
  if (typeof min === "number") return { min };
  if (typeof max === "number") return { max };
  return undefined;
}

const GLOBAL_ENTERPRISE_MARKERS = [
  "accenture",
  "adobe",
  "airbnb",
  "amazon",
  "amazon jobs",
  "apple",
  "atlassian",
  "barclays",
  "goldman sachs",
  "google",
  "ibm",
  "intuit",
  "jpmorgan",
  "mastercard",
  "meta",
  "microsoft",
  "netflix",
  "oracle",
  "paypal",
  "salesforce",
  "sap",
  "shopify",
  "stripe",
  "uber",
  "visa",
  "walmart"
];
