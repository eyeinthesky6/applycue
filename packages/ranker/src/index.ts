import type { GateResult, JobRecord, RankedJob, RankComponent, RelaxStep, UserProfile } from "@applycue/core";

export function evaluateHardGates(job: JobRecord, profile: UserProfile): GateResult[] {
  const prefs = profile.preferences;
  const jobLocation = job.location;
  const haystack = `${job.company} ${job.title} ${job.description}`.toLowerCase();
  const blockedCompany = prefs.blockedCompanyNames.some((company) =>
    job.company.toLowerCase().includes(company.toLowerCase())
  );
  const currentCompany =
    Boolean(profile.currentCompany) &&
    job.company.toLowerCase().includes(profile.currentCompany!.toLowerCase());
  const pastEmployer =
    profile.applyToPastEmployers === false &&
    profile.pastEmployers.some((item) => job.company.toLowerCase().includes(item.company.toLowerCase()));
  const noGoRole = prefs.noGoRoleTerms.some((term) => haystack.includes(term.toLowerCase()));
  const excludedIndustry = prefs.excludedIndustries.some((term) => haystack.includes(term.toLowerCase()));
  const excludedKeyword = prefs.excludedKeywords.some((term) => haystack.includes(term.toLowerCase()));
  const workModeOk = prefs.acceptableWorkModes.includes(job.workMode) || job.workMode === "unknown";
  const remoteOk = !prefs.remoteOnly || job.workMode === "remote" || job.workMode === "unknown";
  const seniorityOk =
    !job.seniority ||
    job.seniority === "unknown" ||
    prefs.acceptableSeniorities.length === 0 ||
    prefs.acceptableSeniorities.includes(job.seniority);
  const employmentTypeOk =
    !job.employmentType ||
    job.employmentType === "unknown" ||
    prefs.employmentTypes.length === 0 ||
    prefs.employmentTypes.includes(job.employmentType);
  const companyStageOk =
    !job.companyStage ||
    job.companyStage === "unknown" ||
    prefs.companyStages.length === 0 ||
    prefs.companyStages.includes(job.companyStage);
  const workAuthOk =
    prefs.workAuthorizationCountries.length === 0 ||
    !jobLocation ||
    prefs.workAuthorizationCountries.some((country) => locationMatchesCountry(jobLocation, country)) ||
    (job.workMode === "remote" && remoteLocationCouldIncludeAuthorizedCountry(jobLocation, prefs.workAuthorizationCountries));

  return [
    {
      id: "live",
      passed: job.liveState !== "closed",
      reason: job.liveState === "closed" ? "Job appears closed." : "Job is not known to be closed."
    },
    {
      id: "blocked-company",
      passed: !blockedCompany && !currentCompany && !pastEmployer,
      reason: blockedCompany
        ? "Company is blocked by user preference."
        : currentCompany
          ? "Company is the user's current employer."
          : pastEmployer
            ? "Company is a past employer and user has not allowed applying there."
            : "Company is not blocked."
    },
    {
      id: "no-go-role",
      passed: !noGoRole,
      reason: noGoRole ? "Role matches a user-defined no-go term." : "No no-go role term matched."
    },
    {
      id: "excluded-industry",
      passed: !excludedIndustry,
      reason: excludedIndustry ? "Role matches an excluded industry." : "No excluded industry matched."
    },
    {
      id: "excluded-keyword",
      passed: !excludedKeyword,
      reason: excludedKeyword ? "Role contains an excluded keyword." : "No excluded keyword matched."
    },
    {
      id: "work-mode",
      passed: workModeOk && remoteOk,
      reason: workModeOk && remoteOk ? "Work mode is acceptable." : "Work mode conflicts with preferences."
    },
    {
      id: "seniority",
      passed: seniorityOk,
      reason: seniorityOk ? "Seniority is acceptable." : "Seniority conflicts with preferences."
    },
    {
      id: "employment-type",
      passed: employmentTypeOk,
      reason: employmentTypeOk ? "Employment type is acceptable." : "Employment type conflicts with preferences."
    },
    {
      id: "company-stage",
      passed: companyStageOk,
      reason: companyStageOk ? "Company stage is acceptable." : "Company stage conflicts with preferences."
    },
    {
      id: "work-authorization",
      passed: workAuthOk,
      reason: workAuthOk ? "Work authorization does not block this role." : "Location may conflict with work authorization."
    }
  ];
}

export function rankJob(job: JobRecord, profile: UserProfile): RankedJob {
  const gates = evaluateHardGates(job, profile);
  const gatePass = gates.every((gate) => gate.passed);
  const components = scoreComponents(job, profile);
  const weighted = weightedPriority(components);
  const priority = gatePass ? capPriorityByRoleFit(weighted, components) : 0;
  const canAutoApply =
    profile.applySettings.mode !== "review" &&
    priority >= profile.applySettings.minimumFitToApply;
  const reviewFloor = Math.max(0.5, profile.matchSettings.minimumFitFloor);
  const decision = canAutoApply
    ? "apply"
    : priority >= reviewFloor
      ? "review"
      : priority > 0
        ? "watch"
        : "skip";

  return {
    job,
    decision,
    priority,
    gates,
    components,
    reasons: components
      .filter((component) => component.score >= 0.5)
      .slice(0, 3)
      .map((component) => component.reason),
    nextStep: decision
  };
}

export function buildRelaxPlan(profile: UserProfile, qualifiedCount: number): RelaxStep[] {
  if (qualifiedCount >= profile.matchSettings.widenIfFewerThan) return [];

  return profile.matchSettings.relaxOrder.map((area) => {
    switch (area) {
      case "source":
        return {
          area,
          action: "Scan more approved sources before changing the match.",
          needsUserReview: false
        };
      case "title":
        return {
          area,
          action: profile.matchSettings.allowAdjacentTitles
            ? "Include adjacent role titles that still match the user's target work."
            : "Ask before adding adjacent role titles.",
          needsUserReview: !profile.matchSettings.allowAdjacentTitles
        };
      case "industry":
        return {
          area,
          action: profile.matchSettings.allowAdjacentIndustries
            ? "Include adjacent industries while keeping blocked companies out."
            : "Ask before adding adjacent industries.",
          needsUserReview: !profile.matchSettings.allowAdjacentIndustries
        };
      case "location":
        return {
          area,
          action: "Add extra locations first; ask before relocation or locations marked ask-before.",
          needsUserReview: profile.preferences.askBeforeLocations.length > 0 || profile.preferences.allowRelocation !== true
        };
      case "work_mode":
        return {
          area,
          action: "Widen work mode only inside acceptable work modes.",
          needsUserReview: Boolean(profile.preferences.remoteOnly)
        };
      case "recency":
        return {
          area,
          action: "Look back further in time for still-live roles.",
          needsUserReview: false
        };
      case "minimum_fit":
        return {
          area,
          action: `Lower minimum fit down to ${profile.matchSettings.minimumFitFloor}, but never below the user's floor.`,
          needsUserReview: false
        };
    }
  });
}

function scoreComponents(job: JobRecord, profile: UserProfile): RankComponent[] {
  const jobText = `${job.title} ${job.company} ${job.description}`.toLowerCase();
  const roleObjectiveFit = roleScore(job, profile);
  const industryFit = alternativeTermScore(jobText, profile.preferences.targetIndustries);
  const companyFit = companyScore(job, profile);
  const keywordFit = termCoverage(jobText, [
    ...profile.preferences.requiredKeywords,
    ...profile.preferences.niceToHaveKeywords
  ]);
  const proofStrength = proofCoverage(jobText, profile);
  const locationFit = locationScore(job, profile);
  const sourceConfidence = job.source.kind === "manual" ? 0.7 : job.source.kind === "unknown" ? 0.4 : 0.8;

  return [
    {
      id: "role-objective-fit",
      score: roleObjectiveFit,
      reason: roleObjectiveFit > 0 ? "Role title or description matches target role terms." : "Target role terms did not match strongly."
    },
    {
      id: "industry-fit",
      score: industryFit,
      reason: industryFit > 0 ? "Role matches target industry terms." : "Industry fit is not obvious from the job text."
    },
    {
      id: "company-fit",
      score: companyFit,
      reason: companyFit > 0.5 ? "Company matches preferred company or stage settings." : "Company is not a named preferred target."
    },
    {
      id: "keyword-fit",
      score: keywordFit,
      reason: keywordFit > 0.5 ? "Role includes preferred keywords." : "Preferred keyword match is limited."
    },
    {
      id: "proof-strength",
      score: proofStrength,
      reason: proofStrength > 0 ? "Profile proof bank has evidence related to this role." : "No strong proof-bank match found yet."
    },
    {
      id: "location-fit",
      score: locationFit,
      reason: locationFit > 0.5 ? "Location or work mode fits preferences." : "Location fit needs review."
    },
    {
      id: "source-confidence",
      score: sourceConfidence,
      reason: "Source confidence is based on source type until richer verification exists."
    }
  ];
}

function capPriorityByRoleFit(weighted: number, components: RankComponent[]): number {
  const roleFit = components.find((component) => component.id === "role-objective-fit")?.score ?? 0;
  if (roleFit < 0.5) return roundScore(Math.min(weighted, 0.49));
  if (roleFit < 0.7) return roundScore(Math.min(weighted, 0.69));
  return roundScore(weighted);
}

function weightedPriority(components: RankComponent[]): number {
  const weights: Record<string, number> = {
    "role-objective-fit": 0.46,
    "industry-fit": 0.08,
    "company-fit": 0.05,
    "keyword-fit": 0.1,
    "proof-strength": 0.16,
    "location-fit": 0.1,
    "source-confidence": 0.05
  };
  const totalWeight = components.reduce((sum, component) => sum + (weights[component.id] ?? 0), 0);
  if (totalWeight <= 0) return 0;
  return components.reduce((sum, component) => sum + component.score * (weights[component.id] ?? 0), 0) / totalWeight;
}

function termCoverage(text: string, terms: string[]): number {
  if (terms.length === 0) return 0.5;
  const matches = terms.filter((term) => text.includes(term.toLowerCase())).length;
  return roundScore(matches / terms.length);
}

function roleScore(job: JobRecord, profile: UserProfile): number {
  const title = job.title;
  const fullText = `${job.title} ${job.company} ${job.description}`;
  const targetScore = roleTermScore(title, fullText, profile.preferences.targetRoleTerms);
  const targetTitleScore = roleTermScore(title, title, profile.preferences.targetRoleTerms);
  const adjacentScore = profile.matchSettings.allowAdjacentTitles
    ? roleTermScore(title, fullText, profile.preferences.adjacentRoleTerms) * 0.75
    : 0;
  const adjacentTitleScore = profile.matchSettings.allowAdjacentTitles
    ? roleTermScore(title, title, profile.preferences.adjacentRoleTerms) * 0.75
    : 0;
  const targetAnchors = roleAnchorTokens(profile.preferences.targetRoleTerms);
  const allAnchors = roleAnchorTokens([...profile.preferences.targetRoleTerms, ...profile.preferences.adjacentRoleTerms]);
  const titleTokens = tokenSet(title);
  const titleHasTargetAnchor = targetAnchors.length === 0 || targetAnchors.some((token) => titleTokens.has(token));
  const titleHasAnyAnchor = allAnchors.length === 0 || allAnchors.some((token) => titleTokens.has(token));

  if (targetTitleScore >= 0.7) return roundScore(Math.max(targetScore, adjacentScore));

  const descriptionOnlyTargetScore = titleHasTargetAnchor ? targetScore : Math.min(targetScore, 0.49);
  if (adjacentTitleScore >= 0.7) {
    const adjacentOnlyCap = titleHasTargetAnchor ? adjacentScore : Math.min(adjacentScore, 0.49);
    return roundScore(Math.max(descriptionOnlyTargetScore, adjacentOnlyCap));
  }

  const adjacentDescriptionScore = titleHasTargetAnchor ? adjacentScore : Math.min(adjacentScore, 0.49);
  const score = Math.max(descriptionOnlyTargetScore, adjacentDescriptionScore);
  const titleAnchoredScore = titleHasAnyAnchor ? score : Math.min(score, 0.4);
  if (isTechnicalProductTitleForProductLeadership(title, profile)) {
    return roundScore(Math.min(titleAnchoredScore, 0.49));
  }
  return roundScore(titleAnchoredScore);
}

function roleTermScore(title: string, fullText: string, terms: string[]): number {
  const cleanedTerms = terms.map((term) => term.trim()).filter(Boolean);
  if (cleanedTerms.length === 0) return 0.5;
  const titleScore = Math.max(...cleanedTerms.map((term) => singleTermScore(title, term)));
  const fullTextScore = Math.max(...cleanedTerms.map((term) => singleTermScore(fullText, term)));
  return roundScore(Math.max(titleScore, fullTextScore * 0.7));
}

function roleAnchorTokens(terms: string[]): string[] {
  const generic = new Set([
    "a",
    "and",
    "chief",
    "director",
    "executive",
    "head",
    "lead",
    "leader",
    "manager",
    "management",
    "of",
    "officer",
    "principal",
    "senior",
    "sr",
    "strategy",
    "the",
    "vp"
  ]);
  return [...new Set(terms.flatMap((term) => normalizeText(term).split(" ")).filter((token) => token && !generic.has(token)))];
}

function isTechnicalProductTitleForProductLeadership(title: string, profile: UserProfile): boolean {
  const targetText = normalizeText([
    ...profile.preferences.targetRoleTerms,
    ...profile.preferences.adjacentRoleTerms
  ].join(" "));
  if (!targetText.includes("product")) return false;
  const tokens = tokenSet(title);
  if (!tokens.has("product")) return false;
  const technicalTokens = ["engineer", "engineering", "developer", "architect", "software", "qa", "quality", "data"];
  if (!technicalTokens.some((token) => tokens.has(token))) return false;
  const leadershipTokens = ["manager", "management", "director", "head", "vp", "vice", "president", "chief", "owner", "lead"];
  return !leadershipTokens.some((token) => tokens.has(token));
}

function alternativeTermScore(text: string, terms: string[]): number {
  const cleanedTerms = terms.map((term) => term.trim()).filter(Boolean);
  if (cleanedTerms.length === 0) return 0.5;
  return roundScore(Math.max(...cleanedTerms.map((term) => singleTermScore(text, term))));
}

function singleTermScore(text: string, term: string): number {
  const normalizedText = normalizeText(text);
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return 0;
  if (normalizedText.includes(normalizedTerm)) return 1;
  const termTokens = normalizedTerm.split(" ").filter(Boolean);
  if (termTokens.length === 0) return 0;
  const textTokens = tokenSet(text);
  const matched = termTokens.filter((token) => textTokens.has(token)).length;
  return roundScore(matched / termTokens.length);
}

function proofCoverage(text: string, profile: UserProfile): number {
  if (profile.proofBank.length === 0) return 0.25;
  return roundScore(
    Math.max(...profile.proofBank.map((item) => termCoverage(text, item.tags)))
  );
}

function companyScore(job: JobRecord, profile: UserProfile): number {
  if (profile.preferences.preferredCompanyNames.some((company) => job.company.toLowerCase().includes(company.toLowerCase()))) {
    return 1;
  }
  if (job.companyStage && profile.preferences.companyStages.includes(job.companyStage)) {
    return 0.8;
  }
  if (profile.preferences.preferredCompanyNames.length === 0 && !job.companyStage) return 0.5;
  return profile.preferences.preferredCompanyNames.length === 0 && profile.preferences.companyStages.length === 0 ? 0.5 : 0.25;
}

function locationScore(job: JobRecord, profile: UserProfile): number {
  if (job.workMode === "remote") return 1;
  if (!job.location || profile.preferences.preferredLocations.length === 0) return 0.5;
  return profile.preferences.preferredLocations.some((location) => locationMatchesPreference(job.location!, location))
    ? 1
    : 0;
}

function roundScore(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

const COUNTRY_ALIASES: Record<string, string[]> = {
  india: ["in", "ind"],
  "united states": ["us", "usa", "united states of america"],
  "united kingdom": ["uk", "gb", "gbr", "great britain", "britain"],
  singapore: ["sg", "sgp"],
  germany: ["de", "deu"],
  australia: ["au", "aus"],
  "united arab emirates": ["ae", "are", "uae"]
};

const COUNTRY_LOCATION_ALIASES: Record<string, string[]> = {
  india: [
    "ahmedabad",
    "bangalore",
    "bengaluru",
    "chennai",
    "delhi",
    "delhi ncr",
    "gurgaon",
    "gurugram",
    "hyderabad",
    "mumbai",
    "noida",
    "pune",
    "karnataka",
    "maharashtra",
    "haryana",
    "gujarat",
    "uttar pradesh",
    "telangana",
    "tamil nadu",
    "ka",
    "mh",
    "hr",
    "gj",
    "up",
    "ts",
    "tn",
    "dl"
  ]
};

function locationMatchesCountry(location: string, country: string): boolean {
  const aliases = countryAliases(country);
  return aliases.some((alias) => textContainsAlias(location, alias));
}

function remoteLocationCouldIncludeAuthorizedCountry(location: string, countries: string[]): boolean {
  const normalized = normalizeText(location);
  if (!normalized) return true;
  if (["anywhere", "global", "worldwide"].some((term) => normalized.includes(term))) return true;
  return countries.some((country) => countryRegions(country).some((region) => normalized.includes(region)));
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
    "united arab emirates": ["middle east", "emea"]
  };
  return regionsByCountry[normalized] ?? [];
}

function locationMatchesPreference(location: string, preference: string): boolean {
  if (textContainsAlias(location, preference)) return true;
  return locationMatchesCountry(location, preference);
}

function countryAliases(country: string): string[] {
  const normalized = normalizeText(country);
  if (!normalized) return [];
  return [normalized, ...(COUNTRY_ALIASES[normalized] ?? []), ...(COUNTRY_LOCATION_ALIASES[normalized] ?? [])];
}

function textContainsAlias(text: string, alias: string): boolean {
  const normalizedAlias = normalizeText(alias);
  if (!normalizedAlias) return false;
  if (normalizedAlias.length === 2) {
    return hasRegionCodeToken(text, normalizedAlias);
  }
  if (normalizedAlias.length === 3) {
    return tokenSet(text).has(normalizedAlias);
  }
  return normalizeText(text).includes(normalizedAlias);
}

function hasRegionCodeToken(text: string, code: string): boolean {
  if (code.length !== 2) return false;
  return text.split(/[^A-Za-z0-9]+/).some((token) => token === code.toUpperCase());
}

function tokenSet(text: string): Set<string> {
  return new Set(normalizeText(text).split(" ").filter(Boolean));
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
