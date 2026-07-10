import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  ApplicationAnswer,
  ApprovedSourceConfigEntry,
  ApplySettings,
  BaseCvSource,
  MatchSettings,
  ProfileLink,
  ProfileFact,
  ProofItem,
  SearchSettings,
  SourceSettings,
  UserAsset,
  UserPreferences,
  UserProfile,
  WorkHistoryItem
} from "@applycue/core";

export interface ApplyCueProfileConfig {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  links?: Array<ProfileLink | string>;
  headline?: string | null;
  baseCvPath?: string | null;
  activeBaseCvId?: string | null;
  currentCompany?: string | null;
  currentDesignation?: string | null;
  currentLevel?: UserProfile["currentLevel"] | null;
  totalExperienceYears?: number | null;
  currentCountry?: string | null;
  currentLocation?: string | null;
  pastEmployers?: WorkHistoryItem[];
  applyToPastEmployers?: boolean | null;
}

export interface ApplyCueConfig {
  profile?: ApplyCueProfileConfig;
  preferences?: Partial<UserPreferences>;
  matchSettings?: Partial<MatchSettings>;
  searchSettings?: Partial<SearchSettings>;
  sourceSettings?: Partial<SourceSettings>;
  applySettings?: Partial<ApplySettings>;
  assets?: UserAsset[];
  baseCvs?: BaseCvSource[];
  proofBank?: ProofItem[];
  facts?: ProfileFact[];
  applicationAnswers?: ApplicationAnswer[];
  targetBaseCvs?: UserProfile["targetBaseCvs"];
  sources?: {
    localJobsPath?: string | null;
    searches?: ApprovedSourceConfigEntry[];
    jobBoards?: ApprovedSourceConfigEntry[];
    companyPages?: unknown[];
    communities?: ApprovedSourceConfigEntry[];
    newsletters?: ApprovedSourceConfigEntry[];
    loggedInBrowserSources?: ApprovedSourceConfigEntry[];
  };
}

export interface LoadedApplyCueConfig {
  config: ApplyCueConfig;
  configDir: string;
  configPath: string;
  profile: UserProfile;
}

export interface ApplyCueStorageOptions {
  applyCueHome?: string;
  env?: NodeJS.ProcessEnv;
  profileKey?: string;
}

export function getApplyCueHome(options: ApplyCueStorageOptions = {}): string {
  const configuredHome = nonEmptyString(options.applyCueHome) ?? nonEmptyString(options.env?.APPLYCUE_HOME);
  return configuredHome ? path.resolve(configuredHome) : path.join(os.homedir(), ".applycue");
}

export function getApplyCueProfileDir(options: ApplyCueStorageOptions = {}): string {
  const profileKey = nonEmptyString(options.profileKey) ?? nonEmptyString(options.env?.APPLYCUE_PROFILE) ?? "default";
  return path.join(getApplyCueHome(options), "profiles", profileKey);
}

export function getApplyCueProfileConfigPath(options: ApplyCueStorageOptions = {}): string {
  const configuredPath = nonEmptyString(options.env?.APPLYCUE_CONFIG);
  return configuredPath ? path.resolve(configuredPath) : path.join(getApplyCueProfileDir(options), "applycue.json");
}

export function createDefaultPreferences(): UserPreferences {
  return {
    targetRoleTerms: [],
    adjacentRoleTerms: [],
    targetIndustries: [],
    excludedIndustries: [],
    preferredLocations: [],
    extraLocations: [],
    askBeforeLocations: [],
    acceptableWorkModes: ["remote", "hybrid", "onsite", "unknown"],
    targetSeniorities: [],
    acceptableSeniorities: [],
    companySeniorityOverrides: [],
    employmentTypes: ["full_time"],
    companyStages: [],
    preferredCompanyNames: [],
    blockedCompanyNames: [],
    noGoRoleTerms: [],
    requiredKeywords: [],
    niceToHaveKeywords: [],
    excludedKeywords: [],
    workAuthorizationCountries: [],
    preferredTimezones: []
  };
}

export function createDefaultMatchSettings(): MatchSettings {
  return {
    range: "normal",
    widenIfFewerThan: 20,
    relaxOrder: ["source", "title", "industry", "location", "recency", "minimum_fit"],
    minimumFitFloor: 0.55,
    allowAdjacentTitles: true,
    allowAdjacentIndustries: true,
    seniorityGateMode: "off"
  };
}

export function createDefaultSearchSettings(): SearchSettings {
  return {
    searchCountries: [],
    searchAreas: [],
    remoteRegions: [],
    agentMayExpandSearchArea: true,
    informUserOnSearchAreaChange: true,
    freshnessDays: 30,
    includeUnknownPostDates: true,
    standardHoursOnly: true,
    preferredShifts: ["standard"],
    askBeforeShifts: ["night", "rotational", "weekend"]
  };
}

export function createDefaultSourceSettings(): SourceSettings {
  return {
    allowLoggedInBrowserAccess: false,
    defaultPortalApplyPolicy: "ask",
    trustedPortals: [],
    askBeforePortals: [],
    blockedPortals: [],
    fraudSignalTerms: [
      "payment required",
      "registration fee",
      "training fee",
      "deposit",
      "crypto wallet",
      "processing fee",
      "job placement fee",
      "paid registration",
      "pay to apply",
      "refundable deposit",
      "profile database",
      "resume database",
      "candidate database",
      "candidate data bank",
      "document before interview"
    ]
  };
}

export function createDefaultApplySettings(): ApplySettings {
  return {
    mode: "daily",
    applicationsPerDay: 20,
    minimumFitToApply: 0.75,
    allowedSourceKinds: [
      "company_site",
      "ats",
      "job_board",
      "social_post",
      "community_post",
      "newsletter",
      "recruiter_message",
      "email_alert",
      "manual"
    ],
    messagePolicy: "draft_only",
    pauseReasons: [
      "missing_required_answer",
      "sensitive_personal_data",
      "unsupported_cv_claim",
      "work_authorization",
      "compensation",
      "relocation",
      "platform_rule"
    ],
    trackEmailReplies: false,
    allowRecruiterDmDrafts: true
  };
}

export function createProfile(input: {
  id: string;
  name?: string;
  headline?: string;
  contact?: UserProfile["contact"];
  baseCvText?: string;
  activeBaseCvId?: string;
  assets?: UserAsset[];
  baseCvSources?: BaseCvSource[];
  currentCompany?: string;
  currentDesignation?: string;
  currentLevel?: UserProfile["currentLevel"];
  totalExperienceYears?: number;
  currentCountry?: string;
  currentLocation?: string;
  pastEmployers?: WorkHistoryItem[];
  applyToPastEmployers?: boolean;
  preferences?: Partial<UserPreferences>;
  applySettings?: Partial<ApplySettings>;
  matchSettings?: Partial<MatchSettings>;
  searchSettings?: Partial<SearchSettings>;
  sourceSettings?: Partial<SourceSettings>;
  proofBank?: ProofItem[];
  facts?: ProfileFact[];
  applicationAnswers?: ApplicationAnswer[];
  targetBaseCvs?: UserProfile["targetBaseCvs"];
}): UserProfile {
  const defaults = createDefaultPreferences();
  const defaultSettings = createDefaultApplySettings();
  const defaultMatchSettings = createDefaultMatchSettings();
  const defaultSearchSettings = createDefaultSearchSettings();
  const defaultSourceSettings = createDefaultSourceSettings();
  const preferences: UserPreferences = {
    ...defaults,
    ...input.preferences,
    targetRoleTerms: input.preferences?.targetRoleTerms ?? defaults.targetRoleTerms,
    adjacentRoleTerms: input.preferences?.adjacentRoleTerms ?? defaults.adjacentRoleTerms,
    targetIndustries: input.preferences?.targetIndustries ?? defaults.targetIndustries,
    excludedIndustries: input.preferences?.excludedIndustries ?? defaults.excludedIndustries,
    preferredLocations: input.preferences?.preferredLocations ?? defaults.preferredLocations,
    extraLocations: input.preferences?.extraLocations ?? defaults.extraLocations,
    askBeforeLocations: input.preferences?.askBeforeLocations ?? defaults.askBeforeLocations,
    acceptableWorkModes: input.preferences?.acceptableWorkModes ?? defaults.acceptableWorkModes,
    targetSeniorities: input.preferences?.targetSeniorities ?? defaults.targetSeniorities,
    acceptableSeniorities: input.preferences?.acceptableSeniorities ?? defaults.acceptableSeniorities,
    employmentTypes: input.preferences?.employmentTypes ?? defaults.employmentTypes,
    companyStages: input.preferences?.companyStages ?? defaults.companyStages,
    companySeniorityOverrides: input.preferences?.companySeniorityOverrides ?? defaults.companySeniorityOverrides ?? [],
    preferredCompanyNames: input.preferences?.preferredCompanyNames ?? defaults.preferredCompanyNames,
    blockedCompanyNames: input.preferences?.blockedCompanyNames ?? defaults.blockedCompanyNames,
    noGoRoleTerms: input.preferences?.noGoRoleTerms ?? defaults.noGoRoleTerms,
    requiredKeywords: input.preferences?.requiredKeywords ?? defaults.requiredKeywords,
    niceToHaveKeywords: input.preferences?.niceToHaveKeywords ?? defaults.niceToHaveKeywords,
    excludedKeywords: input.preferences?.excludedKeywords ?? defaults.excludedKeywords,
    workAuthorizationCountries: input.preferences?.workAuthorizationCountries ?? defaults.workAuthorizationCountries,
    preferredTimezones: input.preferences?.preferredTimezones ?? defaults.preferredTimezones
  };

  const profile: UserProfile = {
    id: input.id,
    pastEmployers: input.pastEmployers ?? [],
    preferences,
    searchSettings: {
      ...defaultSearchSettings,
      ...input.searchSettings,
      searchCountries: input.searchSettings?.searchCountries ?? defaultSearchSettings.searchCountries,
      searchAreas: input.searchSettings?.searchAreas ?? defaultSearchSettings.searchAreas,
      remoteRegions: input.searchSettings?.remoteRegions ?? defaultSearchSettings.remoteRegions,
      freshnessDays: input.searchSettings?.freshnessDays ?? defaultSearchSettings.freshnessDays ?? 30,
      includeUnknownPostDates: input.searchSettings?.includeUnknownPostDates ?? defaultSearchSettings.includeUnknownPostDates ?? true,
      preferredShifts: input.searchSettings?.preferredShifts ?? defaultSearchSettings.preferredShifts,
      askBeforeShifts: input.searchSettings?.askBeforeShifts ?? defaultSearchSettings.askBeforeShifts
    },
    sourceSettings: {
      ...defaultSourceSettings,
      ...input.sourceSettings,
      trustedPortals: input.sourceSettings?.trustedPortals ?? defaultSourceSettings.trustedPortals,
      askBeforePortals: input.sourceSettings?.askBeforePortals ?? defaultSourceSettings.askBeforePortals,
      blockedPortals: input.sourceSettings?.blockedPortals ?? defaultSourceSettings.blockedPortals,
      fraudSignalTerms: input.sourceSettings?.fraudSignalTerms ?? defaultSourceSettings.fraudSignalTerms
    },
    applySettings: {
      ...defaultSettings,
      ...input.applySettings,
      allowedSourceKinds: input.applySettings?.allowedSourceKinds ?? defaultSettings.allowedSourceKinds,
      pauseReasons: input.applySettings?.pauseReasons ?? defaultSettings.pauseReasons
    },
    matchSettings: {
      ...defaultMatchSettings,
      ...input.matchSettings,
      relaxOrder: input.matchSettings?.relaxOrder ?? defaultMatchSettings.relaxOrder
    },
    proofBank: input.proofBank ?? [],
    ...(input.facts ? { facts: input.facts } : {}),
    ...(input.applicationAnswers ? { applicationAnswers: input.applicationAnswers } : {}),
    ...(input.targetBaseCvs ? { targetBaseCvs: input.targetBaseCvs } : {}),
    ...(input.baseCvSources ? { baseCvSources: input.baseCvSources } : {}),
    ...(input.assets ? { assets: input.assets } : {})
  };

  if (input.name) profile.name = input.name;
  if (input.headline) profile.headline = input.headline;
  if (input.contact) profile.contact = input.contact;
  if (input.baseCvText) profile.baseCvText = input.baseCvText;
  if (input.activeBaseCvId) profile.activeBaseCvId = input.activeBaseCvId;
  if (input.currentCompany) profile.currentCompany = input.currentCompany;
  if (input.currentDesignation) profile.currentDesignation = input.currentDesignation;
  if (input.currentLevel) profile.currentLevel = input.currentLevel;
  if (typeof input.totalExperienceYears === "number") profile.totalExperienceYears = input.totalExperienceYears;
  if (input.currentCountry) profile.currentCountry = input.currentCountry;
  if (input.currentLocation) profile.currentLocation = input.currentLocation;
  if (typeof input.applyToPastEmployers === "boolean") profile.applyToPastEmployers = input.applyToPastEmployers;

  return profile;
}

export async function loadApplyCueConfig(configPath: string): Promise<LoadedApplyCueConfig> {
  const absoluteConfigPath = path.resolve(configPath);
  const configDir = path.dirname(absoluteConfigPath);
  const parsed = JSON.parse(await readFile(absoluteConfigPath, "utf8")) as ApplyCueConfig;
  return {
    config: parsed,
    configDir,
    configPath: absoluteConfigPath,
    profile: await createProfileFromConfig(parsed, configDir)
  };
}

export async function createProfileFromConfig(config: ApplyCueConfig, configDir = process.cwd()): Promise<UserProfile> {
  const profileConfig = config.profile ?? {};
  const activeBaseCv = selectActiveBaseCv(config.baseCvs ?? [], profileConfig.activeBaseCvId);
  const baseCvPath = nonEmptyString(activeBaseCv?.path) ?? nonEmptyString(profileConfig.baseCvPath);
  const baseCvText = baseCvPath
    ? await readFile(resolveFromConfigDir(configDir, baseCvPath), "utf8")
    : undefined;
  const facts = mergeApprovedProfileFacts(config.facts ?? [], profileConfig);
  const contact = buildContact(profileConfig);
  const name = nonEmptyString(profileConfig.name);
  const headline = nonEmptyString(profileConfig.headline);
  const currentCompany = nonEmptyString(profileConfig.currentCompany);
  const currentDesignation = nonEmptyString(profileConfig.currentDesignation);
  const totalExperienceYears =
    typeof profileConfig.totalExperienceYears === "number" ? profileConfig.totalExperienceYears : undefined;
  const currentCountry = nonEmptyString(profileConfig.currentCountry);
  const currentLocation = nonEmptyString(profileConfig.currentLocation);
  const profileInput: Parameters<typeof createProfile>[0] = {
    id: nonEmptyString(profileConfig.id) ?? "local-user",
    preferences: cleanObject<UserPreferences>(config.preferences),
    applySettings: cleanObject<ApplySettings>(config.applySettings),
    matchSettings: cleanObject<MatchSettings>(config.matchSettings),
    searchSettings: cleanObject<SearchSettings>(config.searchSettings),
    sourceSettings: cleanObject<SourceSettings>(config.sourceSettings),
    pastEmployers: profileConfig.pastEmployers ?? [],
    proofBank: config.proofBank ?? [],
    facts,
    applicationAnswers: filterApprovedApplicationAnswers(config.applicationAnswers ?? [])
  };

  if (name) profileInput.name = name;
  if (headline) profileInput.headline = headline;
  if (contact) profileInput.contact = contact;
  if (baseCvText) profileInput.baseCvText = baseCvText;
  if (activeBaseCv) profileInput.activeBaseCvId = activeBaseCv.id;
  if (config.assets) profileInput.assets = config.assets;
  if (config.baseCvs) profileInput.baseCvSources = config.baseCvs;
  if (currentCompany) profileInput.currentCompany = currentCompany;
  if (currentDesignation) profileInput.currentDesignation = currentDesignation;
  if (profileConfig.currentLevel) profileInput.currentLevel = profileConfig.currentLevel;
  if (typeof totalExperienceYears === "number") profileInput.totalExperienceYears = totalExperienceYears;
  if (currentCountry) profileInput.currentCountry = currentCountry;
  if (currentLocation) profileInput.currentLocation = currentLocation;
  if (typeof profileConfig.applyToPastEmployers === "boolean") {
    profileInput.applyToPastEmployers = profileConfig.applyToPastEmployers;
  }
  if (config.targetBaseCvs) profileInput.targetBaseCvs = config.targetBaseCvs;

  return createProfile(profileInput);
}

function filterApprovedApplicationAnswers(answers: ApplicationAnswer[]): ApplicationAnswer[] {
  return answers
    .map((answer) => {
      const field = nonEmptyString(answer.field);
      const value = nonEmptyString(answer.value);
      if (!field || !value || answer.approvedByUser !== true) return undefined;
      const output: ApplicationAnswer = {
        id: nonEmptyString(answer.id) ?? `application-answer-${slugify(field)}`,
        field,
        value,
        approvedByUser: true,
        createdAt: nonEmptyString(answer.createdAt) ?? new Date().toISOString()
      };
      const aliases = uniqueValues((answer.aliases ?? []).map(nonEmptyString).filter((item): item is string => Boolean(item)));
      if (aliases.length > 0) output.aliases = aliases;
      if (answer.needsApproval === true) output.needsApproval = true;
      const sourceRef = nonEmptyString(answer.sourceRef);
      if (sourceRef) output.sourceRef = sourceRef;
      return output;
    })
    .filter((answer): answer is ApplicationAnswer => Boolean(answer));
}

function buildContact(profileConfig: ApplyCueProfileConfig): UserProfile["contact"] | undefined {
  const email = nonEmptyString(profileConfig.email);
  const phone = nonEmptyString(profileConfig.phone);
  const location = nonEmptyString(profileConfig.location);
  const links = parseLinks(profileConfig.links ?? []);
  const contact: NonNullable<UserProfile["contact"]> = {};
  if (email) contact.email = email;
  if (phone) contact.phone = phone;
  if (location) contact.location = location;
  if (links.length > 0) contact.links = links;
  return Object.keys(contact).length > 0 ? contact : undefined;
}

function selectActiveBaseCv(baseCvs: BaseCvSource[], requestedId?: string | null): BaseCvSource | undefined {
  const requested = nonEmptyString(requestedId);
  if (requested) return baseCvs.find((baseCv) => baseCv.id === requested);
  return baseCvs.find((baseCv) => baseCv.status === "active") ?? baseCvs[0];
}

function parseLinks(links: Array<ProfileLink | string>): ProfileLink[] {
  return links
    .map((link) => {
      if (typeof link === "string") {
        return nonEmptyString(link) ? { label: "Link", url: link } : undefined;
      }
      return nonEmptyString(link.url)
        ? {
            label: nonEmptyString(link.label) ?? "Link",
            url: link.url
          }
        : undefined;
    })
    .filter((link): link is ProfileLink => Boolean(link));
}

function mergeApprovedProfileFacts(
  configuredFacts: ProfileFact[],
  profileConfig: ApplyCueProfileConfig
): ProfileFact[] {
  const now = new Date().toISOString();
  const generatedFacts: ProfileFact[] = [];
  const currentDesignation = nonEmptyString(profileConfig.currentDesignation);
  const currentCompany = nonEmptyString(profileConfig.currentCompany);
  const currentLocation = nonEmptyString(profileConfig.currentLocation) ?? nonEmptyString(profileConfig.location);

  if (currentDesignation) {
    generatedFacts.push({
      id: "profile-current-designation",
      statement: `Current designation is ${currentDesignation}.`,
      category: "role",
      sourceKind: "user_confirmed",
      sensitivity: "major",
      approvedByUser: true,
      sourceRef: "profile-config",
      createdAt: now
    });
  }
  if (currentCompany) {
    generatedFacts.push({
      id: "profile-current-company",
      statement: `Current company is ${currentCompany}.`,
      category: "company",
      sourceKind: "user_confirmed",
      sensitivity: "major",
      approvedByUser: true,
      sourceRef: "profile-config",
      createdAt: now
    });
  }
  if (currentLocation) {
    generatedFacts.push({
      id: "profile-current-location",
      statement: `Current location is ${currentLocation}.`,
      category: "location",
      sourceKind: "user_confirmed",
      sensitivity: "major",
      approvedByUser: true,
      sourceRef: "profile-config",
      createdAt: now
    });
  }

  const configuredKeys = new Set(configuredFacts.map((fact) => fact.id));
  return [...configuredFacts, ...generatedFacts.filter((fact) => !configuredKeys.has(fact.id))];
}

function cleanObject<T extends object>(value?: Partial<T>): Partial<T> {
  if (!value) return {};
  const cleaned: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (rawValue === null || typeof rawValue === "undefined" || rawValue === "") continue;
    cleaned[key] = rawValue;
  }
  return cleaned as Partial<T>;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function resolveFromConfigDir(configDir: string, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(configDir, value);
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "answer";
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
