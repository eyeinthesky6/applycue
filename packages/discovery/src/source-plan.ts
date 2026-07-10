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
  const boardLocations = boardSearchLocations(profile, location);
  const primaryBoardLocation = boardLocations[0] ?? location;
  const industry = primary(profile.preferences.targetIndustries, "");
  const jobBoardDefaults = profile.sourceSettings.jobBoardDefaults;
  const templateSuggestions = boardLocations.flatMap((boardLocation) =>
    buildTemplateSuggestions(profile, generatedAt, { role, industry, location: boardLocation })
  );
  const atsSuggestions = buildAtsSearchSuggestions(profile, generatedAt, { industry, locations: boardLocations, role });
  const jobSpySuggestions = buildJobSpySuggestions(profile, generatedAt, {
    industry,
    jobBoardDefaults,
    locations: boardLocations,
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
      query: `${quotedTerms([role, industry, primaryBoardLocation]).join(" ")} site:linkedin.com/jobs`,
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
    createSuggestion({
      generatedAt,
      kind: "email_alert",
      label: "User inbox job leads",
      priority: 0.9,
      provider: "user_email",
      query: buildEmailLeadQuery(role, industry, boardLocations),
      reason: "Searches the user's own mailbox through native agent connectors such as Codex, Claude, Hermes, or similar after the first run; if no connector is available, use browser control only with user permission. Imports real job links into the queue and leaves all sending user-confirmed.",
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
  const explicitGeoTerms = uniqueNonEmpty([
    ...profile.searchSettings.searchAreas,
    ...profile.searchSettings.searchCountries,
    ...profile.searchSettings.remoteRegions,
    profile.currentLocation ?? "",
    profile.currentCountry ?? ""
  ]);
  const hasExplicitGeoConstraint = explicitGeoTerms.some((term) => !isGenericRemoteLocation(term));
  const preferredLocationTerms = uniqueNonEmpty([
    ...profile.preferences.preferredLocations,
    ...profile.preferences.extraLocations
  ]).filter((term) => !hasExplicitGeoConstraint || !isGenericRemoteLocation(term));
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
    ...preferredLocationTerms,
    profile.currentLocation ?? "",
    profile.currentCountry ?? "",
    ...(remoteAllowed && !hasExplicitGeoConstraint ? ["Remote"] : []),
    ...profile.searchSettings.remoteRegions
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
      targetIndustries: uniqueNonEmpty(profile.preferences.targetIndustries),
      industryEvidenceMode: profile.matchSettings.allowAdjacentIndustries ? "soft" : "hard",
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
      "Use title filters only for explicit no-go terms and obvious wrong role families; ambiguous title fit should reach ranking or agent review.",
      "Use location filters as search guidance first; ask-before locations require user confirmation before application.",
      "Use content filters for prioritization and pause decisions, not for inventing CV claims.",
      "When industry evidence mode is soft, keep strong role/location matches with missing industry metadata for ranking; still block explicit excluded industries and hard required keywords.",
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

function isGenericRemoteLocation(term: string): boolean {
  const normalized = normalizeComparable(term);
  return normalized === "remote" ||
    normalized === "work from home" ||
    normalized === "wfh" ||
    normalized === "anywhere" ||
    normalized === "worldwide" ||
    normalized === "global";
}

function buildAtsSearchSuggestions(
  profile: UserProfile,
  generatedAt: string,
  input: {
    industry: string;
    locations: string[];
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
  const locations = input.locations.length > 0 ? input.locations : [""];
  const includeLocationInLabel = locations.length > 1;

  return providers.flatMap((provider) =>
    locations.flatMap((location) =>
      queries.map((query, index) =>
        createSuggestion({
          generatedAt,
          kind: "ats",
          label: atsSearchLabel(provider.name, query, location, index, includeLocationInLabel),
          priority: provider.priority - index * 0.015,
          provider: provider.provider,
          query: `${provider.siteQuery} ${quotedTerms([query, location]).join(" ")}`,
          reason: `${provider.reason} Query variant and search area come from the generated search profile. Use this to find concrete company board URLs before adding company sources.`,
          requiresBrowser: true,
          requiresLogin: false
        })
      )
    )
  );
}

function buildJobSpySuggestions(
  profile: UserProfile,
  generatedAt: string,
  input: {
    industry: string;
    jobBoardDefaults: UserProfile["sourceSettings"]["jobBoardDefaults"];
    locations: string[];
    role: string;
  }
): SourceSuggestion[] {
  const totalBudget = jobBoardQueryLimit(profile);
  const locations = input.locations.length > 0 ? input.locations : ["remote"];
  const queryStrings = buildSearchQueries(profile, input, totalBudget);
  const pairs = buildLocationQueryPairs(queryStrings, locations, totalBudget);
  const includeLocationInLabel = locations.length > 1;

  return pairs.map(({ location, query, queryIndex }) => {
    const marketDefaults = jobSpyMarketDefaults(input.jobBoardDefaults, location);
    return createSuggestion({
      generatedAt,
      kind: "job_board",
      label: jobSpySearchLabel(query, location, queryIndex, includeLocationInLabel),
      priority: 0.87 - queryIndex * 0.02,
      provider: "jobspy",
      query,
      reason: "JobSpy can search approved public job boards through a local optional Python bridge without an API key.",
      options: {
        siteNames: marketDefaults.siteNames,
        location,
        resultsWanted: input.jobBoardDefaults?.resultsWanted ?? 25,
        hoursOld: input.jobBoardDefaults?.hoursOld ?? freshnessHours(profile),
        jobType: "fulltime",
        ...(marketDefaults.countryIndeed ? { countryIndeed: marketDefaults.countryIndeed } : {}),
        descriptionFormat: "markdown"
      }
    });
  });
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
  const industries = uniqueNonEmpty([input.industry, ...profile.preferences.targetIndustries]).slice(0, industryQueryLimit(profile));
  const primaryIndustry = industries[0] ?? "";
  const secondaryIndustries = industries.slice(1);
  const anchoredIndustryQueries = primaryIndustry
    ? anchoredRoleTerms.map((role) => `${role} ${primaryIndustry}`)
    : [];
  const anchoredSecondaryIndustryQueries = secondaryIndustries.flatMap((industry) =>
    anchoredRoleTerms.slice(0, 2).map((role) => `${role} ${industry}`)
  );
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
    ...anchoredSecondaryIndustryQueries,
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

function freshnessHours(profile: UserProfile): number {
  const days = profile.searchSettings.freshnessDays;
  const safeDays = typeof days === "number" && Number.isFinite(days) && days > 0 ? days : 30;
  return Math.max(24, Math.floor(safeDays * 24));
}

function atsDirectoryLimit(profile: UserProfile): number {
  if (profile.matchSettings.range === "tight") return 10;
  if (profile.matchSettings.range === "wide") return 50;
  return 25;
}

function industryQueryLimit(profile: UserProfile): number {
  if (profile.matchSettings.range === "tight") return 2;
  if (profile.matchSettings.range === "wide") return 5;
  return 3;
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

function boardSearchLocations(profile: UserProfile, fallback: string): string[] {
  const explicitSearchAreas = uniqueNonEmpty(profile.searchSettings.searchAreas)
    .filter((value) => !isGenericRemoteLocation(value));
  const remoteRegions = profile.searchSettings.remoteRegions.flatMap(remoteRegionSearchTerms);
  const preferredLocations = uniqueNonEmpty([
    ...profile.preferences.extraLocations,
    ...profile.preferences.preferredLocations
  ]).filter((value) => !isGenericRemoteLocation(value));
  const countryLocations = uniqueNonEmpty(profile.searchSettings.searchCountries)
    .filter((value) => !isGenericRemoteLocation(value));
  const profileLocations = uniqueNonEmpty([
    profile.currentLocation ?? "",
    profile.currentCountry ?? ""
  ]).filter((value) => !isGenericRemoteLocation(value));

  const candidates = explicitSearchAreas.length > 0
    ? explicitSearchAreas
    : [
        ...preferredLocations,
        ...countryLocations,
        ...remoteRegions,
        ...profileLocations,
        fallback
      ];
  const locations = uniqueNonEmpty(candidates).slice(0, sourceLocationLimit(profile));
  return locations.length > 0 ? locations : [fallback].filter((value) => !isGenericRemoteLocation(value));
}

function sourceLocationLimit(profile: UserProfile): number {
  if (profile.matchSettings.range === "tight") return 2;
  if (profile.matchSettings.range === "wide") return 6;
  return 4;
}

function remoteRegionSearchTerms(region: string): string[] {
  const trimmed = region.trim();
  if (!trimmed || isGenericRemoteLocation(trimmed)) return [];
  if (normalizeComparable(trimmed).startsWith("remote ")) return [trimmed];
  return [`Remote ${trimmed}`];
}

function buildLocationQueryPairs(
  queries: string[],
  locations: string[],
  limit: number
): Array<{ location: string; query: string; queryIndex: number }> {
  const pairs: Array<{ location: string; query: string; queryIndex: number }> = [];
  for (let queryIndex = 0; queryIndex < queries.length; queryIndex += 1) {
    const query = queries[queryIndex];
    if (!query) continue;
    for (const location of locations) {
      pairs.push({ location, query, queryIndex });
      if (pairs.length >= limit) return pairs;
    }
  }
  return pairs;
}

function jobSpySearchLabel(query: string, location: string, queryIndex: number, includeLocation: boolean): string {
  const base = queryIndex === 0 ? "JobSpy board search" : `JobSpy targeted search - ${query}`;
  return includeLocation ? `${base} - ${location}` : base;
}

function atsSearchLabel(providerName: string, query: string, location: string, index: number, includeLocation: boolean): string {
  const base = index === 0 ? `Public ATS search - ${providerName}` : `Public ATS search - ${providerName} - ${query}`;
  return includeLocation && location ? `${base} - ${location}` : base;
}

function jobSpyMarketDefaults(
  defaults: UserProfile["sourceSettings"]["jobBoardDefaults"],
  location: string
): { siteNames: string[]; countryIndeed?: string } {
  const market = countryMarketFromLocation(location);
  const configuredSites = nonEmptyArray(defaults?.siteNames) ?? ["indeed", "google"];
  const configuredCountry = defaults?.countryIndeed?.trim();
  const effectiveMarket = market ?? countryMarketFromLocation(configuredCountry ?? "");
  const siteNames = configuredSites.filter((site) => isSiteAllowedInMarket(site, effectiveMarket));
  const countryIndeed = market
    ? countryIndeedForMarket(market, configuredCountry)
    : configuredCountry;
  return {
    siteNames: siteNames.length > 0 ? siteNames : ["indeed", "google"],
    ...(countryIndeed ? { countryIndeed } : {})
  };
}

function isSiteAllowedInMarket(site: string, market?: string): boolean {
  const normalized = normalizeComparable(site);
  if (normalized === "naukri") return market === "india";
  return true;
}

function countryIndeedForMarket(market: string, configuredCountry?: string): string | undefined {
  if (configuredCountry && countryMarketFromLocation(configuredCountry) === market) return configuredCountry;
  const countryByMarket: Record<string, string> = {
    australia: "australia",
    canada: "canada",
    germany: "germany",
    india: "india",
    singapore: "singapore",
    "united arab emirates": "united arab emirates",
    "united kingdom": "united kingdom",
    "united states": "united states"
  };
  return countryByMarket[market];
}

function countryMarketFromLocation(value: string): string | undefined {
  const normalized = normalizeComparable(value);
  if (!normalized) return undefined;
  if (/\bindia\b|\bin\b/.test(normalized)) return "india";
  if (/\bunited states\b|\busa\b|\bus\b|\bamerica\b/.test(normalized)) return "united states";
  if (/\bunited kingdom\b|\buk\b|\bgb\b|\bgreat britain\b/.test(normalized)) return "united kingdom";
  if (/\baustralia\b|\bau\b/.test(normalized)) return "australia";
  if (/\bcanada\b|\bca\b/.test(normalized)) return "canada";
  if (/\bsingapore\b|\bsg\b/.test(normalized)) return "singapore";
  if (/\bgermany\b|\bde\b/.test(normalized)) return "germany";
  if (/\bunited arab emirates\b|\buae\b|\bdubai\b|\babu dhabi\b/.test(normalized)) return "united arab emirates";
  return undefined;
}

function buildEmailLeadQuery(role: string, industry: string, locations: string[]): string {
  const roleContext = uniqueNonEmpty([role, industry]).slice(0, 2);
  const locationTerms = locations.slice(0, 3);
  const optionalContext = [
    ...roleContext.map((term) => `"${term}"`),
    ...(locationTerms.length > 0 ? [`(${locationTerms.map((term) => `"${term}"`).join(" OR ")})`] : [])
  ];
  return [
    "newer_than:30d",
    "(job OR jobs OR opening OR hiring OR careers OR opportunity OR recruiter OR shortlisted OR \"job alert\")",
    ...optionalContext
  ].join(" ");
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
