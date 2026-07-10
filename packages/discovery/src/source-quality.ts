import type { JobRecord, JobSource, SourcePlanSearchProfile } from "@applycue/core";

export type SourceQualityFilterReason = "title" | "industry" | "location" | "content";

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
  examplesByReason: Record<SourceQualityFilterReason, string[]>;
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

    const industryCheck = checkIndustry(job, searchProfile);
    if (!industryCheck.passed) {
      filtered.push({
        job,
        reason: "industry",
        detail: industryCheck.detail
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
        industry: filtered.filter((item) => item.reason === "industry").length,
        location: filtered.filter((item) => item.reason === "location").length,
        content: filtered.filter((item) => item.reason === "content").length
      },
      examplesByReason: buildFilteredExamples(filtered)
    }
  };
}

function buildFilteredExamples(filtered: SourceQualityFilteredJob[]): Record<SourceQualityFilterReason, string[]> {
  return {
    title: examplesForReason(filtered, "title"),
    industry: examplesForReason(filtered, "industry"),
    location: examplesForReason(filtered, "location"),
    content: examplesForReason(filtered, "content")
  };
}

function examplesForReason(filtered: SourceQualityFilteredJob[], reason: SourceQualityFilterReason): string[] {
  const examples: string[] = [];
  const seen = new Set<string>();
  for (const item of filtered) {
    if (item.reason !== reason) continue;
    const example = formatFilteredExample(item);
    const key = example.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    examples.push(example);
    if (examples.length >= 5) break;
  }
  return examples;
}

function formatFilteredExample(item: SourceQualityFilteredJob): string {
  const location = item.job.location ? `, ${item.job.location}` : "";
  const sourceName = item.job.source.name ? ` via ${item.job.source.name}` : "";
  return `${item.job.company} - ${item.job.title}${location}${sourceName}: ${item.detail}`;
}

function checkTitle(
  job: JobRecord,
  searchProfile: SourcePlanSearchProfile
): { detail: string; passed: boolean } {
  const title = job.title;
  const positive = searchProfile.titleFilter.positive;
  const negative = searchProfile.titleFilter.negative;
  const hasNegative = negative.some((term) => termMatches(title, term));
  if (hasNegative) {
    return {
      passed: false,
      detail: "Title matched a blocked title term."
    };
  }

  if (positive.length === 0) {
    return {
      passed: true,
      detail: "No target title filter is configured."
    };
  }

  if (positive.some((term) => termMatches(title, term))) {
    return {
      passed: true,
      detail: "Title matches the generated search profile."
    };
  }

  if (titleMatchesSeniorityBoostedRole(title, searchProfile.titleFilter)) {
    return {
      passed: true,
      detail: "Title matches a senior target role variant."
    };
  }

  if (titleMatchesTargetRoleAnchor(title, searchProfile.titleFilter)) {
    return {
      passed: true,
      detail: "Title has a target role anchor; exact fit is left for ranking."
    };
  }

  if (jobTextMatchesTargetRole(job, searchProfile.titleFilter)) {
    return {
      passed: true,
      detail: "Job text mentions target role terms; title fit is left for ranking."
    };
  }

  if (titleLooksClearlyOutsideTargetLane(title, searchProfile.titleFilter)) {
    return {
      passed: false,
      detail: "Title matched an obvious non-target role family."
    };
  }

  return {
    passed: true,
    detail: "Title is ambiguous, so it is left for ranking instead of hard-blocked."
  };
}

function checkIndustry(
  job: JobRecord,
  searchProfile: SourcePlanSearchProfile
): { detail: string; passed: boolean } {
  const targetIndustries = searchProfile.contentFilter.targetIndustries;
  if (targetIndustries.length === 0) {
    return {
      passed: true,
      detail: "No target industry filter is configured."
    };
  }

  const jobText = [job.company, job.title, job.description].filter(Boolean).join(" ");
  const allowedSignals = industrySignals(targetIndustries);
  if (allowedSignals.some((term) => textContainsTerm(jobText, term))) {
    return {
      passed: true,
      detail: "Job matched target industry signals."
    };
  }

  if (searchProfile.contentFilter.industryEvidenceMode === "soft" && shouldKeepMissingIndustryEvidence(job, searchProfile)) {
    return {
      passed: true,
      detail: "Industry evidence is missing or weak; strong role/location fit is left for ranking."
    };
  }

  return {
    passed: false,
    detail: "Job did not show target industry signals."
  };
}

function shouldKeepMissingIndustryEvidence(job: JobRecord, searchProfile: SourcePlanSearchProfile): boolean {
  if (!titleLooksLikeStrongTargetRole(job.title, searchProfile.titleFilter)) return false;
  if (hasExplicitNonTargetIndustryEvidence(job)) return false;
  return isSparseIndustryEvidence(job.description) || sourceOftenHasThinDescriptions(job.source.kind);
}

function titleLooksLikeStrongTargetRole(
  title: string,
  titleFilter: SourcePlanSearchProfile["titleFilter"]
): boolean {
  if (titleFilter.positive.some((term) => termMatches(title, term))) return true;
  if (titleMatchesSeniorityBoostedRole(title, titleFilter)) return true;
  const titleTokens = tokenSet(title);
  const anchors = roleAnchorTokens(titleFilter.positive);
  const hasRoleAnchor = anchors.some((token) => titleTokens.has(token));
  const hasSeniorSignal = hasAnyToken(titleTokens, [
    "chief",
    "director",
    "head",
    "lead",
    "owner",
    "principal",
    "vp"
  ]);
  return hasRoleAnchor && hasSeniorSignal;
}

function isSparseIndustryEvidence(description: string | undefined): boolean {
  const normalized = normalizeText(description ?? "");
  if (!normalized) return true;
  if (normalized.length < 450) return true;
  const tokens = tokenSet(normalized);
  const domainSignalCount = [...tokens].filter((token) => NON_TARGET_INDUSTRY_TOKENS.has(token)).length;
  return domainSignalCount === 0;
}

function sourceOftenHasThinDescriptions(kind: JobSource["kind"]): boolean {
  return kind === "email_alert" || kind === "newsletter" || kind === "social_post" || kind === "community_post";
}

function hasExplicitNonTargetIndustryEvidence(job: JobRecord): boolean {
  const text = normalizeText([job.company, job.title, job.description].filter(Boolean).join(" "));
  if (!text) return false;
  const tokens = tokenSet(text);
  return [...NON_TARGET_INDUSTRY_TOKENS].some((token) => tokens.has(token));
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
  const askBefore = searchProfile.locationFilter.askBefore;
  const block = searchProfile.locationFilter.block;
  if (block.some((term) => locationContainsTerm(location, term))) {
    return {
      passed: false,
      detail: "Location matched a blocked location term."
    };
  }
  if (askBefore.some((term) => locationContainsTerm(location, term))) {
    return {
      passed: false,
      detail: "Location matched an ask-before location term."
    };
  }
  if (alwaysAllow.some((term) => locationContainsTerm(location, term))) {
    return {
      passed: true,
      detail: "Location matched an always-allowed location."
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

function titleMatchesSeniorityBoostedRole(
  title: string,
  titleFilter: SourcePlanSearchProfile["titleFilter"]
): boolean {
  const boostTerms = titleFilter.seniorityBoost.filter(Boolean);
  if (boostTerms.length === 0) return false;
  const normalizedTitle = normalizeText(title);
  const hasSeniority = boostTerms.some((term) => termMatches(normalizedTitle, term));
  if (!hasSeniority) return false;
  const titleTokens = tokenSet(normalizedTitle);
  const anchorTokens = roleAnchorTokens(titleFilter.positive);
  return anchorTokens.some((token) => titleTokens.has(token));
}

function titleMatchesTargetRoleAnchor(
  title: string,
  titleFilter: SourcePlanSearchProfile["titleFilter"]
): boolean {
  const titleTokens = tokenSet(title);
  const anchorTokens = roleAnchorTokens(titleFilter.positive);
  return anchorTokens.some((token) => titleTokens.has(token));
}

function jobTextMatchesTargetRole(
  job: JobRecord,
  titleFilter: SourcePlanSearchProfile["titleFilter"]
): boolean {
  const jobText = [job.title, job.description].filter(Boolean).join(" ");
  return titleFilter.positive.some((term) => termMatches(jobText, term));
}

function titleLooksClearlyOutsideTargetLane(
  title: string,
  titleFilter: SourcePlanSearchProfile["titleFilter"]
): boolean {
  const targetAnchors = roleAnchorTokens(titleFilter.positive);
  const titleTokens = tokenSet(title);
  if (targetAnchors.some((token) => titleTokens.has(token))) return false;

  const normalizedTargets = normalizeText(titleFilter.positive.join(" "));
  if (normalizedTargets.includes("product")) {
    return hasAnyToken(titleTokens, [
      "account",
      "analyst",
      "backend",
      "bpo",
      "consultant",
      "customer",
      "developer",
      "engineering",
      "engineer",
      "frontend",
      "hr",
      "intern",
      "qa",
      "recruiter",
      "sales",
      "software",
      "support",
      "trainee"
    ]);
  }

  return false;
}

function roleAnchorTokens(positiveTerms: string[]): string[] {
  const blocked = new Set([
    "and",
    "chief",
    "co",
    "director",
    "founder",
    "head",
    "lead",
    "manager",
    "management",
    "mid",
    "officer",
    "of",
    "president",
    "principal",
    "senior",
    "the",
    "vice",
    "vp"
  ]);
  const anchors = new Set<string>();
  for (const term of positiveTerms) {
    for (const token of normalizeText(term).split(" ")) {
      if (token.length >= 3 && !blocked.has(token)) anchors.add(token);
    }
  }
  return [...anchors];
}

function termVariants(normalizedTerm: string): string[] {
  const variants = new Set([normalizedTerm]);
  if (normalizedTerm.includes("management")) variants.add(normalizedTerm.replace(/\bmanagement\b/g, "manager"));
  if (normalizedTerm.includes("manager")) variants.add(normalizedTerm.replace(/\bmanager\b/g, "management"));
  return [...variants];
}

function industrySignals(targetIndustries: string[]): string[] {
  const signals = new Set<string>();
  for (const industry of targetIndustries) {
    const normalized = normalizeText(industry);
    if (!normalized) continue;
    signals.add(industry);
    signals.add(normalized);
    for (const alias of INDUSTRY_ALIASES[normalized] ?? []) {
      signals.add(alias);
    }
  }
  return [...signals];
}

const INDUSTRY_ALIASES: Record<string, string[]> = {
  bfsi: [
    "bank",
    "banking",
    "card",
    "cards",
    "capital markets",
    "credit",
    "financial services",
    "fintech",
    "insurance",
    "lending",
    "payments",
    "wealth management"
  ],
  banking: ["bank", "digital banking", "fintech", "neobank", "payments", "retail banking", "wealth management"],
  "digital banking": ["bank", "banking", "credit card", "digital bank", "fintech", "neobank", "savings account"],
  "enterprise software": [
    "b2b software",
    "cloud platform",
    "enterprise platform",
    "saas",
    "software",
    "software platform",
    "subscription software",
    "workflow automation"
  ],
  "financial services": [
    "asset management",
    "bank",
    "banking",
    "capital markets",
    "credit",
    "fintech",
    "insurance",
    "lending",
    "payments",
    "wealth"
  ],
  fintech: [
    "asset management",
    "bank",
    "banking",
    "capital markets",
    "card",
    "cards",
    "credit",
    "crypto",
    "cryptocurrency",
    "digital assets",
    "digital banking",
    "emi",
    "finance",
    "financial services",
    "gateway",
    "insurance",
    "insurtech",
    "lending",
    "loan",
    "loans",
    "merchant",
    "nbfc",
    "payment",
    "payments",
    "upi",
    "wealth management"
  ],
  lending: ["credit", "emi", "fintech", "loan", "loans", "nbfc", "repayment", "underwriting"],
  payments: ["acquirer", "acquiring", "card", "cards", "checkout", "fintech", "gateway", "merchant", "payment", "pos", "upi"],
  saas: [
    "api",
    "b2b",
    "cloud platform",
    "enterprise software",
    "saas",
    "software",
    "software platform",
    "subscription software",
    "workflow automation"
  ]
};

const NON_TARGET_INDUSTRY_TOKENS = new Set([
  "automobile",
  "automotive",
  "bpo",
  "construction",
  "fashion",
  "fmcg",
  "gaming",
  "grocery",
  "hospitality",
  "hotel",
  "jewellery",
  "jewelry",
  "logistics",
  "manufacturing",
  "merchandising",
  "pharma",
  "pharmaceutical",
  "estate",
  "restaurant",
  "retail",
  "rhino",
  "sports"
]);

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
    india: [
      "india",
      "in",
      "ind",
      "ahmedabad",
      "bangalore",
      "bengaluru",
      "chennai",
      "delhi",
      "gurgaon",
      "gurugram",
      "hyderabad",
      "kolkata",
      "mumbai",
      "ncr",
      "new delhi",
      "noida",
      "pune"
    ],
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
  if (["anywhere", "global", "worldwide"].some((term) => normalizedLocation.includes(term))) {
    return allowedTerms.map(normalizeText).some((term) => ["remote", "anywhere", "global", "worldwide"].includes(term));
  }
  const allowedRegions = allowedTerms.flatMap(explicitRemoteRegionAliases);
  return allowedRegions.some((region) => normalizedLocation.includes(region));
}

function explicitRemoteRegionAliases(term: string): string[] {
  const normalized = normalizeText(term);
  const regions: string[] = [];
  if (normalized.includes("apac") || normalized.includes("asia pacific")) regions.push("apac", "asia pacific", "asia");
  if (normalized === "asia" || normalized.includes("remote asia")) regions.push("asia");
  if (normalized.includes("europe")) regions.push("europe");
  if (normalized.includes("emea")) regions.push("emea", "europe", "middle east", "africa");
  if (normalized.includes("americas")) regions.push("americas", "north america", "south america");
  if (normalized.includes("north america")) regions.push("north america");
  if (normalized.includes("oceania")) regions.push("oceania");
  if (normalized.includes("middle east")) regions.push("middle east");
  return [...new Set(regions)];
}

function tokenSet(text: string): Set<string> {
  return new Set(normalizeText(text).split(" ").filter(Boolean));
}

function hasAnyToken(tokens: Set<string>, expected: string[]): boolean {
  return expected.some((token) => tokens.has(token));
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
