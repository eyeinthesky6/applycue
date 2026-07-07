import type { JobSource, SourcePlan, SourceSuggestion, UserProfile } from "@applycue/core";

export interface SourcePlanInput {
  approvedSources?: ApprovedSource[];
  generatedAt?: string;
}

export interface ApprovedSource {
  id?: string;
  kind: JobSource["kind"];
  label: string;
  url?: string;
  query?: string;
}

const DEFAULT_GENERATED_AT = "2026-07-06T00:00:00.000Z";

export function createSourcePlan(profile: UserProfile, input: SourcePlanInput = {}): SourcePlan {
  const generatedAt = input.generatedAt ?? DEFAULT_GENERATED_AT;
  const searchProfile = buildSearchProfile(profile);
  const existing = new Map<string, ApprovedSource>();
  for (const source of input.approvedSources ?? []) {
    existing.set(sourceKey(source), source);
  }

  const rawSuggestions = buildSystemSuggestions(profile, generatedAt);
  const suggestions = rawSuggestions.map((suggestion) => {
    const duplicate = existing.get(sourceKey(suggestion));
    return duplicate
      ? {
          ...suggestion,
          duplicateOf: duplicate.id ?? sourceKey(duplicate),
          reason: `${suggestion.reason} Already covered by approved source: ${duplicate.label}.`
        }
      : suggestion;
  });

  return {
    id: `${profile.id}-source-plan-${generatedAt.slice(0, 10)}`,
    profileId: profile.id,
    generatedAt,
    status: "generated_for_review",
    generatedFrom: {
      targetRoleTerms: profile.preferences.targetRoleTerms,
      targetIndustries: profile.preferences.targetIndustries,
      preferredLocations: profile.preferences.preferredLocations,
      extraLocations: profile.preferences.extraLocations,
      preferredCompanyNames: profile.preferences.preferredCompanyNames
    },
    searchProfile,
    suggestions,
    notes: [
      "Generated suggestions are review artifacts, not active scan config.",
      "The search profile is a reviewable filter plan for adapters and ranking; it is generated from user settings, not hardcoded markets.",
      "Approve useful sources by adding them to user/agent editable config.",
      "Do not hand-edit this generated file; regenerate it from profile and preferences."
    ]
  };
}

function buildSystemSuggestions(profile: UserProfile, generatedAt: string): SourceSuggestion[] {
  const role = primary(profile.preferences.targetRoleTerms, profile.currentDesignation ?? "target role");
  const location = primary(
    [...profile.preferences.preferredLocations, ...profile.preferences.extraLocations, profile.currentLocation, profile.currentCountry],
    "remote"
  );
  const boardLocation = boardSearchLocation(profile, location);
  const industry = primary(profile.preferences.targetIndustries, "");
  const jobBoardDefaults = profile.sourceSettings.jobBoardDefaults;
  const jobSpySiteNames = nonEmptyArray(jobBoardDefaults?.siteNames) ?? ["indeed", "google"];
  const templateSuggestions = buildTemplateSuggestions(profile, generatedAt, { role, industry, location: boardLocation });
  const atsSuggestions = buildAtsSearchSuggestions(profile, generatedAt, { industry, location: boardLocation, role });
  const jobSpySuggestions = buildJobSpySuggestions(profile, generatedAt, {
    industry,
    jobBoardDefaults,
    jobSpySiteNames,
    location: boardLocation,
    role
  });
  const suggestions: SourceSuggestion[] = [
    buildAtsDirectorySuggestion(profile, generatedAt, role),
    ...atsSuggestions,
    ...jobSpySuggestions,
    createSuggestion({
      generatedAt,
      kind: "job_board",
      label: "The Muse job board",
      priority: 0.73,
      provider: "themuse",
      query: role,
      reason: "The Muse has a public no-key jobs API. ApplyCue filters the broad feed locally before ranking.",
      options: {
        limit: 50,
        pageLimit: 3
      }
    }),
    createSuggestion({
      generatedAt,
      kind: "job_board",
      label: "LinkedIn jobs search",
      priority: 0.86,
      query: `${quotedTerms([role, industry, boardLocation]).join(" ")} site:linkedin.com/jobs`,
      reason: "LinkedIn has high breadth, but should run through user-approved browser or connector access.",
      requiresBrowser: true,
      requiresLogin: true
    }),
    createSuggestion({
      generatedAt,
      kind: "social_post",
      label: "LinkedIn hiring posts",
      priority: 0.74,
      query: `${quotedTerms(["we are hiring", role, industry]).join(" ")} site:linkedin.com/posts`,
      reason: "Hiring posts can surface roles before they are cleanly indexed on boards.",
      requiresBrowser: true,
      requiresLogin: true
    }),
    ...templateSuggestions
  ];

  if (profile.preferences.acceptableWorkModes.includes("remote") || profile.preferences.remoteOnly) {
    suggestions.push(
      createSuggestion({
        generatedAt,
        kind: "job_board",
        label: "Remotive remote search",
        priority: 0.76,
        provider: "remotive",
        query: role,
        reason: "Remotive has a public no-key remote jobs API. Use it under Remotive attribution and request-frequency terms.",
        options: {
          limit: 25
        }
      })
    );
    suggestions.push(...buildPublicRemoteBoardSuggestions(generatedAt, role));
  }

  suggestions.push(
    createSuggestion({
      generatedAt,
      kind: "manual",
      label: "Manual job import fallback",
      priority: 0.25,
      reason: "Manual import is useful for pasted JDs and edge cases, but it is not the primary discovery lane."
    })
  );

  for (const company of profile.preferences.preferredCompanyNames.slice(0, 10)) {
    suggestions.push(
      createSuggestion({
        generatedAt,
        kind: "company_site",
        label: `${company} careers search`,
        priority: 0.84,
        company,
        query: `"${company}" careers "${role}"`,
        reason: `Preferred company from user preferences. Confirm the careers URL before activating.`
      })
    );
  }

  return dedupeSuggestions(suggestions);
}

function buildAtsDirectorySuggestion(profile: UserProfile, generatedAt: string, role: string): SourceSuggestion {
  return createSuggestion({
    generatedAt,
    kind: "ats",
    label: "Reverse ATS directory scan",
    priority: 0.93,
    provider: "ats_directory",
    query: role,
    reason: "Scans public ATS company directories, then lets ApplyCue filter titles and locations before CV work. This expands beyond a fixed company list without requiring login.",
    options: {
      providers: ["greenhouse", "lever", "ashby"],
      limitPerProvider: atsDirectoryLimit(profile),
      batchSize: 8,
      sample: "spread"
    }
  });
}

function buildSearchProfile(profile: UserProfile): SourcePlan["searchProfile"] {
  const remoteAllowed = profile.preferences.remoteOnly || profile.preferences.acceptableWorkModes.includes("remote");
  const titlePositive = uniqueNonEmpty(profile.preferences.targetRoleTerms);
  const titleNegative = uniqueNonEmpty([
    ...profile.preferences.noGoRoleTerms,
    ...profile.preferences.excludedKeywords,
    ...adjacentOnlyRoleTerms(profile)
  ]);
  const seniorityBoost = uniqueNonEmpty([
    ...profile.preferences.targetSeniorities.flatMap(senioritySearchTerms),
    ...profile.preferences.acceptableSeniorities.flatMap(senioritySearchTerms)
  ]);
  const alwaysAllowLocations = uniqueNonEmpty([
    ...profile.preferences.preferredLocations,
    ...profile.preferences.extraLocations,
    profile.currentLocation ?? "",
    profile.currentCountry ?? "",
    ...(remoteAllowed ? ["Remote", ...profile.searchSettings.remoteRegions] : [])
  ]);
  const allowLocations = uniqueNonEmpty([
    ...profile.searchSettings.searchAreas,
    ...profile.searchSettings.searchCountries,
    ...profile.searchSettings.remoteRegions,
    ...alwaysAllowLocations
  ]);
  const contentNegative = uniqueNonEmpty([
    ...profile.preferences.excludedIndustries,
    ...profile.preferences.excludedKeywords,
    ...profile.preferences.noGoRoleTerms
  ]);

  return {
    titleFilter: {
      positive: titlePositive,
      negative: titleNegative,
      seniorityBoost
    },
    locationFilter: {
      alwaysAllow: alwaysAllowLocations,
      allow: allowLocations,
      askBefore: uniqueNonEmpty(profile.preferences.askBeforeLocations),
      block: []
    },
    contentFilter: {
      required: uniqueNonEmpty(profile.preferences.requiredKeywords),
      positive: uniqueNonEmpty([...profile.preferences.targetIndustries, ...profile.preferences.niceToHaveKeywords]),
      negative: contentNegative
    },
    sourceHints: {
      preferredCompanies: uniqueNonEmpty(profile.preferences.preferredCompanyNames),
      blockedCompanies: uniqueNonEmpty(profile.preferences.blockedCompanyNames),
      trustedPortals: uniqueNonEmpty(profile.sourceSettings.trustedPortals),
      askBeforePortals: uniqueNonEmpty(profile.sourceSettings.askBeforePortals),
      blockedPortals: uniqueNonEmpty(profile.sourceSettings.blockedPortals),
      fraudSignalTerms: uniqueNonEmpty(profile.sourceSettings.fraudSignalTerms)
    },
    notes: [
      "Use title filters before expensive evaluation so weak roles do not crowd the batch.",
      "Use location filters as search guidance first; ask-before locations require user confirmation before application.",
      "Use content filters for prioritization and pause decisions, not for inventing CV claims.",
      "Adjacent role terms are stored for optional exploration but are not default source-query or title-filter positives."
    ]
  };
}

function adjacentOnlyRoleTerms(profile: UserProfile): string[] {
  const targetTerms = new Set(profile.preferences.targetRoleTerms.map((term) => normalizeComparable(term)));
  return profile.preferences.adjacentRoleTerms.filter((term) => {
    const normalized = normalizeComparable(term);
    return normalized && !targetTerms.has(normalized);
  });
}

function buildAtsSearchSuggestions(
  profile: UserProfile,
  generatedAt: string,
  input: {
    industry: string;
    location: string;
    role: string;
  }
): SourceSuggestion[] {
  const providers = [
    {
      name: "Greenhouse",
      provider: "greenhouse",
      priority: 0.92,
      siteQuery: "site:job-boards.greenhouse.io OR site:boards.greenhouse.io",
      reason: "Greenhouse is a structured public ATS source."
    },
    {
      name: "Ashby",
      provider: "ashby",
      priority: 0.9,
      siteQuery: "site:jobs.ashbyhq.com",
      reason: "Ashby public boards often expose full descriptions and compensation data."
    },
    {
      name: "Lever",
      provider: "lever",
      priority: 0.88,
      siteQuery: "site:jobs.lever.co",
      reason: "Lever public postings are structured and suitable for company-source discovery."
    },
    {
      name: "Workable",
      provider: "workable",
      priority: 0.86,
      siteQuery: "site:apply.workable.com",
      reason: "Workable public feeds are common company ATS sources and need no login."
    },
    {
      name: "SmartRecruiters",
      provider: "smartrecruiters",
      priority: 0.84,
      siteQuery: "site:jobs.smartrecruiters.com OR site:careers.smartrecruiters.com",
      reason: "SmartRecruiters public postings expose structured company jobs without credentials."
    },
    {
      name: "BambooHR",
      provider: "bamboohr",
      priority: 0.82,
      siteQuery: "site:bamboohr.com/careers",
      reason: "BambooHR tenant careers pages expose public role lists without credentials."
    },
    {
      name: "Breezy",
      provider: "breezy",
      priority: 0.8,
      siteQuery: "site:breezy.hr",
      reason: "Breezy public tenant feeds expose company roles as structured JSON without credentials."
    },
    {
      name: "Recruitee",
      provider: "recruitee",
      priority: 0.78,
      siteQuery: "site:recruitee.com",
      reason: "Recruitee public tenant offers APIs expose company roles without credentials."
    },
    {
      name: "Pinpoint",
      provider: "pinpoint",
      priority: 0.76,
      siteQuery: "site:pinpointhq.com",
      reason: "Pinpoint public tenant feeds expose active company postings without credentials."
    },
    {
      name: "Workday",
      provider: "workday",
      priority: 0.74,
      siteQuery: "site:myworkdayjobs.com",
      reason: "Workday public tenant CXS endpoints expose company jobs without credentials."
    },
    {
      name: "Personio",
      provider: "personio",
      priority: 0.72,
      siteQuery: "site:jobs.personio.de OR site:jobs.personio.com",
      reason: "Personio public XML feeds expose company roles without credentials."
    },
    {
      name: "Rippling",
      provider: "rippling",
      priority: 0.7,
      siteQuery: "site:ats.rippling.com",
      reason: "Rippling public board APIs expose company roles from ats.rippling.com boards without credentials."
    }
  ];
  const queries = buildSearchQueries(profile, input, 3);

  return providers.flatMap((provider) =>
    queries.map((query, index) =>
      createSuggestion({
        generatedAt,
        kind: "ats",
        label: index === 0 ? `Public ATS search - ${provider.name}` : `Public ATS search - ${provider.name} - ${query}`,
        priority: provider.priority - index * 0.015,
        provider: provider.provider,
        query: `${provider.siteQuery} ${quotedTerms([query, input.location]).join(" ")}`,
        reason: `${provider.reason} Query variant comes from the generated search profile.`
      })
    )
  );
}

function buildJobSpySuggestions(
  profile: UserProfile,
  generatedAt: string,
  input: {
    industry: string;
    jobBoardDefaults: UserProfile["sourceSettings"]["jobBoardDefaults"];
    jobSpySiteNames: string[];
    location: string;
    role: string;
  }
): SourceSuggestion[] {
  const queryStrings = buildSearchQueries(profile, input, jobBoardQueryLimit(profile));

  return queryStrings.map((query, index) =>
    createSuggestion({
      generatedAt,
      kind: "job_board",
      label: index === 0 ? "JobSpy board search" : `JobSpy targeted search - ${query}`,
      priority: 0.87 - index * 0.02,
      provider: "jobspy",
      query,
      reason: "JobSpy can search approved public job boards through a local optional Python bridge without an API key.",
      options: {
        siteNames: input.jobSpySiteNames,
        location: input.location,
        resultsWanted: input.jobBoardDefaults?.resultsWanted ?? 25,
        hoursOld: input.jobBoardDefaults?.hoursOld ?? 72,
        jobType: "fulltime",
        ...(input.jobBoardDefaults?.countryIndeed ? { countryIndeed: input.jobBoardDefaults.countryIndeed } : {}),
        descriptionFormat: "markdown"
      }
    })
  );
}

function buildPublicRemoteBoardSuggestions(generatedAt: string, role: string): SourceSuggestion[] {
  const providers = [
    {
      provider: "remoteok",
      label: "RemoteOK remote board",
      priority: 0.72,
      reason: "RemoteOK exposes a public no-key remote jobs feed. ApplyCue filters it locally before ranking."
    },
    {
      provider: "workingnomads",
      label: "Working Nomads remote board",
      priority: 0.7,
      reason: "Working Nomads exposes a public no-key remote jobs feed. ApplyCue filters it locally before ranking."
    },
    {
      provider: "jobicy",
      label: "Jobicy remote board",
      priority: 0.68,
      reason: "Jobicy exposes a public no-key remote jobs API. ApplyCue filters it locally before ranking."
    },
    {
      provider: "himalayas",
      label: "Himalayas remote board",
      priority: 0.66,
      reason: "Himalayas exposes a public no-key remote jobs API. ApplyCue filters it locally before ranking."
    }
  ];
  return providers.map((provider) =>
    createSuggestion({
      generatedAt,
      kind: "job_board",
      label: provider.label,
      priority: provider.priority,
      provider: provider.provider,
      query: role,
      reason: provider.reason,
      options: {
        limit: 50
      }
    })
  );
}

function buildSearchQueries(
  profile: UserProfile,
  input: { role: string; industry: string },
  maxQueries: number
): string[] {
  const targetRoleTerms = uniqueNonEmpty([input.role, ...profile.preferences.targetRoleTerms.slice(1)]);
  const anchoredRoleTerms = targetRoleTerms.filter(isAnchoredSearchRoleTerm);
  const broadRoleTerms = targetRoleTerms.filter((term) => !isAnchoredSearchRoleTerm(term));
  const industries = uniqueNonEmpty([input.industry, ...profile.preferences.targetIndustries]).slice(0, 2);
  const primaryIndustry = industries[0] ?? "";
  const anchoredIndustryQueries = primaryIndustry
    ? anchoredRoleTerms.map((role) => `${role} ${primaryIndustry}`)
    : [];
  const seniorityVariants = seniorRoleSearchVariants(profile);
  const seniorityIndustryQueries = primaryIndustry
    ? seniorityVariants.map((role) => `${role} ${primaryIndustry}`)
    : [];
  const broadIndustryQueries = primaryIndustry
    ? broadRoleTerms.map((role) => `${role} ${primaryIndustry}`)
    : [];
  const queries = [
    ...interleave(anchoredRoleTerms, anchoredIndustryQueries),
    ...interleave(seniorityVariants, seniorityIndustryQueries),
    ...broadRoleTerms,
    ...broadIndustryQueries
  ];
  return uniqueNonEmpty(queries).slice(0, maxQueries);
}

function isAnchoredSearchRoleTerm(term: string): boolean {
  const normalized = normalizeComparable(term);
  return /\b(vp|vice president|head|director|chief|cpo|founder|co-founder)\b/.test(normalized);
}

function seniorRoleSearchVariants(profile: UserProfile): string[] {
  const roleAnchor = primaryRoleAnchorPhrase(profile);
  if (!roleAnchor) return [];
  const seniorities = new Set([
    ...profile.preferences.targetSeniorities,
    ...profile.preferences.acceptableSeniorities
  ]);
  if (roleAnchor !== "product") return genericSeniorRoleSearchVariants(seniorities, roleAnchor);

  const variants: string[] = [];
  if (seniorities.has("vp")) {
    variants.push("vice president product", "vice president product management");
  }
  if (seniorities.has("director")) {
    variants.push("director of product", "director of product management", "product director");
  }
  if (seniorities.has("c_level")) {
    variants.push("chief product officer");
  }
  if (profile.preferences.targetRoleTerms.some((term) => normalizeComparable(term).includes("head of product"))) {
    variants.push("head of product management");
  }
  return uniqueNonEmpty(variants);
}

function genericSeniorRoleSearchVariants(seniorities: Set<string>, roleAnchor: string): string[] {
  const variants: string[] = [];
  if (seniorities.has("vp")) {
    variants.push(`vice president ${roleAnchor}`, `vp ${roleAnchor}`);
  }
  if (seniorities.has("director")) {
    variants.push(`director of ${roleAnchor}`, `${roleAnchor} director`);
  }
  if (seniorities.has("c_level")) {
    variants.push(`chief ${roleAnchor} officer`);
  }
  return uniqueNonEmpty(variants);
}

function primaryRoleAnchorPhrase(profile: UserProfile): string {
  const generic = new Set([
    "and",
    "chief",
    "co",
    "director",
    "founder",
    "head",
    "lead",
    "management",
    "manager",
    "of",
    "officer",
    "president",
    "principal",
    "senior",
    "strategy",
    "the",
    "vice",
    "vp"
  ]);
  for (const term of profile.preferences.targetRoleTerms) {
    const tokens = normalizeComparable(term)
      .split(" ")
      .filter((token) => token.length >= 2 && !generic.has(token));
    if (tokens.length > 0) return tokens.join(" ");
  }
  return "";
}

function interleave(left: string[], right: string[]): string[] {
  const values: string[] = [];
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (leftValue) values.push(leftValue);
    if (rightValue) values.push(rightValue);
  }
  return values;
}

function jobBoardQueryLimit(profile: UserProfile): number {
  const dailyTarget = Math.max(1, Math.floor(profile.applySettings.applicationsPerDay || 1));
  if (profile.matchSettings.range === "tight") return Math.min(6, Math.max(5, dailyTarget));
  if (profile.matchSettings.range === "wide") return 12;
  return Math.min(10, Math.max(8, dailyTarget * 2));
}

function atsDirectoryLimit(profile: UserProfile): number {
  if (profile.matchSettings.range === "tight") return 10;
  if (profile.matchSettings.range === "wide") return 50;
  return 25;
}

function buildTemplateSuggestions(
  profile: UserProfile,
  generatedAt: string,
  values: { role: string; industry: string; location: string }
): SourceSuggestion[] {
  return (profile.sourceSettings.searchTemplates ?? []).flatMap((template): SourceSuggestion[] => {
    if (!template.label || !template.queryTemplate) return [];
    const input: Parameters<typeof createSuggestion>[0] = {
      generatedAt,
      kind: template.kind,
      label: template.label,
      priority: template.priority ?? 0.7,
      query: renderTemplate(template.queryTemplate, values),
      reason: template.reason ?? "Configured source template from the user's source settings."
    };
    if (template.provider) input.provider = template.provider;
    if (typeof template.requiresBrowser === "boolean") input.requiresBrowser = template.requiresBrowser;
    if (typeof template.requiresLogin === "boolean") input.requiresLogin = template.requiresLogin;
    return [createSuggestion(input)];
  });
}

function createSuggestion(input: {
  generatedAt: string;
  kind: JobSource["kind"];
  label: string;
  reason: string;
  priority: number;
  company?: string;
  provider?: string;
  query?: string;
  url?: string;
  options?: Record<string, unknown>;
  requiresBrowser?: boolean;
  requiresLogin?: boolean;
}): SourceSuggestion {
  const id = `system-${slugify(input.label)}-${slugify(input.query ?? input.url ?? input.company ?? input.kind)}`;
  const suggestion: SourceSuggestion = {
    id,
    origin: "system_generated",
    status: "suggested",
    kind: input.kind,
    label: input.label,
    reason: input.reason,
    priority: input.priority,
    createdAt: input.generatedAt,
    requiresConfirmation: true
  };
  if (input.company) suggestion.company = input.company;
  if (input.provider) suggestion.provider = input.provider;
  if (input.query) suggestion.query = input.query;
  if (input.url) suggestion.url = input.url;
  if (input.options) suggestion.options = input.options;
  if (typeof input.requiresBrowser === "boolean") suggestion.requiresBrowser = input.requiresBrowser;
  if (typeof input.requiresLogin === "boolean") suggestion.requiresLogin = input.requiresLogin;
  return suggestion;
}

function dedupeSuggestions(suggestions: SourceSuggestion[]): SourceSuggestion[] {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = sourceKey(suggestion);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourceKey(source: { kind: JobSource["kind"]; url?: string; query?: string; label?: string }): string {
  if (source.kind === "manual") {
    return [source.kind, normalizeComparable(source.label)].join("::");
  }
  return [
    source.kind,
    normalizeComparable(source.url),
    normalizeComparable(source.query),
    normalizeComparable(source.label)
  ].join("::");
}

function primary(values: Array<string | undefined>, fallback: string): string {
  return values.map((value) => value?.trim()).find((value): value is string => Boolean(value)) ?? fallback;
}

function nonEmptyArray(values?: string[]): string[] | undefined {
  const cleaned = values?.map((value) => value.trim()).filter(Boolean) ?? [];
  return cleaned.length > 0 ? cleaned : undefined;
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      if (!value) return false;
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function renderTemplate(template: string, values: { role: string; industry: string; location: string }): string {
  return template
    .replaceAll("{role}", values.role)
    .replaceAll("{industry}", values.industry)
    .replaceAll("{location}", values.location);
}

function boardSearchLocation(profile: UserProfile, fallback: string): string {
  const candidates = [
    ...profile.searchSettings.searchAreas,
    ...profile.preferences.preferredLocations,
    ...profile.preferences.extraLocations,
    profile.currentLocation,
    profile.currentCountry
  ];
  return (
    candidates
      .map((value) => value?.trim())
      .find((value): value is string => typeof value === "string" && value.length > 0 && !isGenericRemoteLocation(value)) ??
    fallback
  );
}

function isGenericRemoteLocation(value: string): boolean {
  return ["remote", "work from home", "wfh"].includes(value.toLowerCase());
}

function quotedTerms(values: string[]): string[] {
  return uniqueNonEmpty(values).map((value) => `"${value}"`);
}

function senioritySearchTerms(value: string): string[] {
  switch (value) {
    case "lead":
      return ["Lead"];
    case "manager":
      return ["Manager"];
    case "director":
      return ["Director"];
    case "vp":
      return ["VP", "Vice President"];
    case "c_level":
      return ["Chief", "C-level", "CXO"];
    case "founder":
      return ["Founder", "Co-founder"];
    case "senior":
      return ["Senior", "Principal"];
    case "mid":
      return ["Mid-level"];
    case "junior":
      return ["Junior"];
    case "intern":
      return ["Intern"];
    default:
      return [];
  }
}

function normalizeComparable(value?: string): string {
  return value?.toLowerCase().replace(/\s+/g, " ").trim() ?? "";
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "source";
}
