import type { JobRecord, JobSource, SourcePlanSearchProfile } from "@applycue/core";

export type SourceQualityFilterReason = "title" | "location" | "content";

export interface SourceQualityFilteredJob {
  detail: string;
  job: JobRecord;
  reason: SourceQualityFilterReason;
}

export interface SourceQualityFilterSummary {
  inputJobs: number;
  keptJobs: number;
  filteredJobs: number;
  byReason: Record<SourceQualityFilterReason, number>;
}

export interface SourceQualityFilterResult {
  filtered: SourceQualityFilteredJob[];
  jobs: JobRecord[];
  summary: SourceQualityFilterSummary;
}

export interface SourceQualityFilterOptions {
  sourceKinds?: JobSource["kind"][];
}

const DEFAULT_FILTERED_SOURCE_KINDS: JobSource["kind"][] = [
  "ats",
  "job_board",
  "social_post",
  "community_post",
  "newsletter",
  "email_alert",
  "unknown"
];

export function filterJobsBySearchProfile(
  jobs: JobRecord[],
  searchProfile: SourcePlanSearchProfile,
  options: SourceQualityFilterOptions = {}
): SourceQualityFilterResult {
  const sourceKinds = new Set(options.sourceKinds ?? DEFAULT_FILTERED_SOURCE_KINDS);
  const kept: JobRecord[] = [];
  const filtered: SourceQualityFilteredJob[] = [];

  for (const job of jobs) {
    if (!sourceKinds.has(job.source.kind)) {
      kept.push(job);
      continue;
    }

    const titleCheck = checkTitle(job, searchProfile);
    if (!titleCheck.passed) {
      filtered.push({
        job,
        reason: "title",
        detail: titleCheck.detail
      });
      continue;
    }

    const locationCheck = checkLocation(job, searchProfile);
    if (!locationCheck.passed) {
      filtered.push({
        job,
        reason: "location",
        detail: locationCheck.detail
      });
      continue;
    }

    const contentCheck = checkContent(job, searchProfile);
    if (!contentCheck.passed) {
      filtered.push({
        job,
        reason: "content",
        detail: contentCheck.detail
      });
      continue;
    }

    kept.push(job);
  }

  return {
    filtered,
    jobs: kept,
    summary: {
      inputJobs: jobs.length,
      keptJobs: kept.length,
      filteredJobs: filtered.length,
      byReason: {
        title: filtered.filter((item) => item.reason === "title").length,
        location: filtered.filter((item) => item.reason === "location").length,
        content: filtered.filter((item) => item.reason === "content").length
      }
    }
  };
}

function checkTitle(
  job: JobRecord,
  searchProfile: SourcePlanSearchProfile
): { detail: string; passed: boolean } {
  const title = job.title;
  const positive = searchProfile.titleFilter.positive;
  const negative = searchProfile.titleFilter.negative;
  const hasPositive = positive.length === 0 || positive.some((term) => termMatches(title, term));
  const hasNegative = negative.some((term) => termMatches(title, term));
  if (hasNegative) {
    return {
      passed: false,
      detail: "Title matched a blocked title term."
    };
  }
  if (!hasPositive) {
    return {
      passed: false,
      detail: "Title did not match target or adjacent role terms."
    };
  }
  return {
    passed: true,
    detail: "Title matches the generated search profile."
  };
}

function checkLocation(
  job: JobRecord,
  searchProfile: SourcePlanSearchProfile
): { detail: string; passed: boolean } {
  const location = job.location?.trim();
  if (!location) {
    return {
      passed: true,
      detail: "Location is missing, so it is left for ranking/policy."
    };
  }

  const alwaysAllow = searchProfile.locationFilter.alwaysAllow;
  const allow = searchProfile.locationFilter.allow;
  const block = searchProfile.locationFilter.block;
  if (alwaysAllow.some((term) => locationContainsTerm(location, term))) {
    return {
      passed: true,
      detail: "Location matched an always-allowed location."
    };
  }
  if (block.some((term) => locationContainsTerm(location, term))) {
    return {
      passed: false,
      detail: "Location matched a blocked location term."
    };
  }
  if (allow.length === 0 || allow.some((term) => locationContainsTerm(location, term))) {
    return {
      passed: true,
      detail: "Location matched the generated search profile."
    };
  }
  if (job.workMode === "remote" && remoteLocationCouldIncludeAllowedRegion(location, allow)) {
    return {
      passed: true,
      detail: "Remote region can include an allowed search region."
    };
  }
  return {
    passed: false,
    detail: "Location did not match allowed search areas."
  };
}

function checkContent(
  job: JobRecord,
  searchProfile: SourcePlanSearchProfile
): { detail: string; passed: boolean } {
  const description = job.description?.trim();
  if (!description) {
    return {
      passed: true,
      detail: "Description is missing, so content filtering is skipped."
    };
  }

  const required = searchProfile.contentFilter.required;
  const negative = searchProfile.contentFilter.negative;
  if (negative.some((term) => textContainsTerm(description, term))) {
    return {
      passed: false,
      detail: "Description matched a blocked content term."
    };
  }
  const missingRequired = required.filter((term) => !textContainsTerm(description, term));
  if (missingRequired.length > 0) {
    return {
      passed: false,
      detail: `Description missed required content term(s): ${missingRequired.join(", ")}.`
    };
  }
  return {
    passed: true,
    detail: "Content does not violate generated search filters."
  };
}

function termMatches(text: string, term: string): boolean {
  const normalizedText = normalizeText(text);
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;
  if (normalizedText.includes(normalizedTerm)) return true;
  return termVariants(normalizedTerm).some((variant) => {
    if (normalizedText.includes(variant)) return true;
    const tokens = variant.split(" ").filter(Boolean);
    return tokens.length > 1 && tokens.every((token) => tokenSet(normalizedText).has(token));
  });
}

function termVariants(normalizedTerm: string): string[] {
  const variants = new Set([normalizedTerm]);
  if (normalizedTerm.includes("management")) variants.add(normalizedTerm.replace(/\bmanagement\b/g, "manager"));
  if (normalizedTerm.includes("manager")) variants.add(normalizedTerm.replace(/\bmanager\b/g, "management"));
  return [...variants];
}

function textContainsTerm(text: string, term: string): boolean {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;
  if (normalizedTerm.length <= 3) return tokenSet(text).has(normalizedTerm);
  return normalizeText(text).includes(normalizedTerm);
}

function locationContainsTerm(location: string, term: string): boolean {
  return countryAliases(term).some((alias) => textContainsTerm(location, alias));
}

function countryAliases(term: string): string[] {
  const normalized = normalizeText(term);
  const aliasesByCountry: Record<string, string[]> = {
    india: ["india", "in", "ind"],
    singapore: ["singapore", "sg", "sgp"],
    germany: ["germany", "de", "deu"],
    australia: ["australia", "au", "aus"],
    "united kingdom": ["united kingdom", "uk", "gb", "gbr", "great britain", "britain"],
    "united states": ["united states", "us", "usa", "united states of america"],
    "united arab emirates": ["united arab emirates", "uae", "ae", "are"]
  };
  return aliasesByCountry[normalized] ?? [term];
}

function remoteLocationCouldIncludeAllowedRegion(location: string, allowedTerms: string[]): boolean {
  const normalizedLocation = normalizeText(location);
  if (["anywhere", "global", "worldwide"].some((term) => normalizedLocation.includes(term))) return true;
  const allowedRegions = allowedTerms.flatMap(countryRegions);
  return allowedRegions.some((region) => normalizedLocation.includes(region));
}

function countryRegions(country: string): string[] {
  const normalized = normalizeText(country);
  const regionsByCountry: Record<string, string[]> = {
    india: ["asia", "apac", "asia pacific"],
    singapore: ["asia", "apac", "asia pacific"],
    australia: ["apac", "asia pacific", "oceania"],
    germany: ["europe"],
    "united kingdom": ["europe"],
    "united states": ["north america", "americas"],
    "united arab emirates": ["middle east", "emea", "uae"]
  };
  return regionsByCountry[normalized] ?? [];
}

function tokenSet(text: string): Set<string> {
  return new Set(normalizeText(text).split(" ").filter(Boolean));
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
