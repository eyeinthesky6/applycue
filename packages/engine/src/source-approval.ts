import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ApprovedSourceBucket,
  ApprovedSourceConfigEntry,
  ApplyCueId,
  SourcePlan,
  SourceSuggestion
} from "@applycue/core";
import { getApplyCueProfileConfigPath, type ApplyCueConfig } from "@applycue/profile";

export interface ApproveSourceSuggestionsOptions {
  applyCueHome?: string;
  configPath?: string;
  dryRun?: boolean;
  profileKey?: string;
  sourcePlanPath?: string;
  suggestionIds?: string[];
  approveAll?: boolean;
  approvedAt?: string;
  workspaceRoot?: string;
}

export interface SourceApprovalUpdate {
  suggestionId: ApplyCueId;
  label: string;
  status: "added" | "skipped";
  bucket?: ApprovedSourceBucket;
  reason: string;
}

export interface ApproveSourceSuggestionsResult {
  addedCount: number;
  configPath: string;
  dryRun: boolean;
  skippedCount: number;
  sourcePlanPath: string;
  updates: SourceApprovalUpdate[];
}

type MutableSources = {
  localJobsPath?: string | null;
  searches?: unknown[];
  jobBoards?: unknown[];
  companyPages?: unknown[];
  communities?: unknown[];
  newsletters?: unknown[];
  loggedInBrowserSources?: unknown[];
};

type MutableConfig = Omit<ApplyCueConfig, "sources"> & {
  sources?: MutableSources;
};

const SOURCE_BUCKETS: ApprovedSourceBucket[] = [
  "searches",
  "jobBoards",
  "companyPages",
  "communities",
  "newsletters",
  "loggedInBrowserSources"
];

export async function approveSourceSuggestions(
  options: ApproveSourceSuggestionsOptions = {}
): Promise<ApproveSourceSuggestionsResult> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const configPath = await resolveWritableConfigPath(options, workspaceRoot);
  if (!configPath) {
    throw new Error("No ApplyCue config found. Create a user profile config before approving sources.");
  }

  const config = JSON.parse(await readFile(configPath, "utf8")) as MutableConfig;
  const configDir = path.dirname(configPath);
  const sourcePlanPath = path.resolve(
    options.sourcePlanPath ?? path.join(configDir, "data", "local", "source-plan.generated.json")
  );
  const sourcePlan = JSON.parse(await readFile(sourcePlanPath, "utf8")) as SourcePlan;
  const selectedIds = new Set((options.suggestionIds ?? []).map((id) => id.trim()).filter(Boolean));
  if (!options.approveAll && selectedIds.size === 0) {
    throw new Error("Pass at least one source suggestion id, or use --all for an explicit bulk approval.");
  }

  const approvedAt = options.approvedAt ?? new Date().toISOString();
  const updates: SourceApprovalUpdate[] = [];
  const suggestions = sourcePlan.suggestions.filter((suggestion) =>
    options.approveAll || selectedIds.has(suggestion.id)
  );
  const missingIds = [...selectedIds].filter((id) => !sourcePlan.suggestions.some((suggestion) => suggestion.id === id));

  for (const missingId of missingIds) {
    updates.push({
      suggestionId: missingId,
      label: missingId,
      status: "skipped",
      reason: "Suggestion id was not found in the generated source plan."
    });
  }

  config.sources ??= {};
  const existingKeys = collectExistingKeys(config.sources);

  for (const suggestion of suggestions) {
    const selected = approveSuggestion({
      approvedAt,
      config,
      existingKeys,
      sourcePlan,
      suggestion
    });
    updates.push(selected);
  }

  const addedCount = updates.filter((update) => update.status === "added").length;
  if (!options.dryRun && addedCount > 0) {
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  }

  return {
    addedCount,
    configPath,
    dryRun: options.dryRun ?? false,
    skippedCount: updates.length - addedCount,
    sourcePlanPath,
    updates
  };
}

function approveSuggestion(input: {
  approvedAt: string;
  config: MutableConfig;
  existingKeys: Set<string>;
  sourcePlan: SourcePlan;
  suggestion: SourceSuggestion;
}): SourceApprovalUpdate {
  const { approvedAt, config, existingKeys, sourcePlan, suggestion } = input;
  if (suggestion.status === "rejected" || suggestion.status === "archived") {
    return {
      suggestionId: suggestion.id,
      label: suggestion.label,
      status: "skipped",
      reason: `Suggestion status is ${suggestion.status}.`
    };
  }
  if (suggestion.duplicateOf) {
    return {
      suggestionId: suggestion.id,
      label: suggestion.label,
      status: "skipped",
      reason: `Already covered by approved source ${suggestion.duplicateOf}.`
    };
  }

  const route = routeSuggestion(suggestion);
  if (!route.bucket) {
    return {
      suggestionId: suggestion.id,
      label: suggestion.label,
      status: "skipped",
      reason: route.reason ?? "This source needs extra setup before it can become active config."
    };
  }

  const duplicateKey = sourceKeyFromSuggestion(suggestion);
  const suggestionIdKey = `suggestion-id::${normalizeComparable(suggestion.id)}`;
  if (existingKeys.has(duplicateKey) || existingKeys.has(suggestionIdKey)) {
    return {
      suggestionId: suggestion.id,
      label: suggestion.label,
      status: "skipped",
      bucket: route.bucket,
      reason: "Editable config already has this source."
    };
  }

  const entry = createApprovedEntry(suggestion, sourcePlan, route.bucket, approvedAt);
  ensureSourceBucket(config.sources ?? {}, route.bucket).push(entry);
  existingKeys.add(duplicateKey);
  existingKeys.add(suggestionIdKey);
  return {
    suggestionId: suggestion.id,
    label: suggestion.label,
    status: "added",
    bucket: route.bucket,
    reason: "Accepted into editable user config."
  };
}

function routeSuggestion(suggestion: SourceSuggestion): { bucket?: ApprovedSourceBucket; reason?: string } {
  if (suggestion.kind === "manual") {
    return {
      reason: "Manual import needs sources.localJobsPath or a job file path; the generated suggestion alone is not enough."
    };
  }

  if ((suggestion.kind === "ats" || suggestion.kind === "company_site") && suggestion.company && suggestion.url) {
    return { bucket: "companyPages" };
  }

  if (
    suggestion.requiresBrowser ||
    suggestion.requiresLogin ||
    suggestion.kind === "social_post" ||
    suggestion.kind === "recruiter_message"
  ) {
    return { bucket: "loggedInBrowserSources" };
  }

  if (suggestion.kind === "job_board") return { bucket: "jobBoards" };
  if (suggestion.kind === "community_post") return { bucket: "communities" };
  if (suggestion.kind === "newsletter" || suggestion.kind === "email_alert") return { bucket: "newsletters" };

  return { bucket: "searches" };
}

function createApprovedEntry(
  suggestion: SourceSuggestion,
  sourcePlan: SourcePlan,
  bucket: ApprovedSourceBucket,
  approvedAt: string
): unknown {
  const base = createBaseEntry(suggestion, sourcePlan, approvedAt);
  if (bucket !== "companyPages") return base;

  const companyPage: Record<string, unknown> = {
    id: base.id,
    company: suggestion.company ?? suggestion.label,
    enabled: true,
    origin: suggestion.origin,
    status: "active",
    kind: suggestion.kind,
    label: suggestion.label,
    approvedAt,
    sourceSuggestionId: suggestion.id,
    sourcePlanId: sourcePlan.id
  };
  if (suggestion.provider) companyPage.provider = suggestion.provider;
  if (suggestion.url) companyPage.careersUrl = suggestion.url;
  if (suggestion.query) companyPage.query = suggestion.query;
  if (suggestion.options) companyPage.options = suggestion.options;
  if (suggestion.requiresBrowser !== undefined) companyPage.requiresBrowser = suggestion.requiresBrowser;
  if (suggestion.requiresLogin !== undefined) companyPage.requiresLogin = suggestion.requiresLogin;
  return companyPage;
}

function createBaseEntry(
  suggestion: SourceSuggestion,
  sourcePlan: SourcePlan,
  approvedAt: string
): ApprovedSourceConfigEntry {
  const entry: ApprovedSourceConfigEntry = {
    id: `approved-${slugify(suggestion.id)}`,
    origin: suggestion.origin,
    status: "active",
    kind: suggestion.kind,
    label: suggestion.label,
    enabled: true,
    approvedAt,
    sourceSuggestionId: suggestion.id,
    sourcePlanId: sourcePlan.id
  };
  if (suggestion.provider) entry.provider = suggestion.provider;
  if (suggestion.company) entry.company = suggestion.company;
  if (suggestion.url) entry.url = suggestion.url;
  if (suggestion.query) entry.query = suggestion.query;
  if (suggestion.options) entry.options = suggestion.options;
  if (suggestion.requiresBrowser !== undefined) entry.requiresBrowser = suggestion.requiresBrowser;
  if (suggestion.requiresLogin !== undefined) entry.requiresLogin = suggestion.requiresLogin;
  return entry;
}

function ensureSourceBucket(sources: MutableSources, bucket: ApprovedSourceBucket): unknown[] {
  const value = sources[bucket];
  if (Array.isArray(value)) return value;
  const next: unknown[] = [];
  sources[bucket] = next;
  return next;
}

function collectExistingKeys(sources: MutableSources): Set<string> {
  const keys = new Set<string>();
  if (sources.localJobsPath) {
    keys.add(sourceKey({ kind: "manual", label: "Manual job import fallback", url: sources.localJobsPath }));
  }
  for (const bucket of SOURCE_BUCKETS) {
    const entries = sources[bucket];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const record = asRecord(entry);
      const sourceSuggestionId = stringValue(record.sourceSuggestionId);
      if (sourceSuggestionId) keys.add(`suggestion-id::${normalizeComparable(sourceSuggestionId)}`);
      keys.add(sourceKeyFromRecord(record));
    }
  }
  return keys;
}

function sourceKeyFromSuggestion(suggestion: SourceSuggestion): string {
  return sourceKey({
    kind: suggestion.kind,
    label: suggestion.label,
    provider: suggestion.provider,
    company: suggestion.company,
    url: suggestion.url,
    query: suggestion.query
  });
}

function sourceKeyFromRecord(record: Record<string, unknown>): string {
  return sourceKey({
    kind: stringValue(record.kind),
    label: stringValue(record.label) || stringValue(record.name) || stringValue(record.company),
    provider: stringValue(record.provider),
    company: stringValue(record.company),
    url: stringValue(record.url) || stringValue(record.careersUrl) || stringValue(record.apiUrl),
    query: stringValue(record.query)
  });
}

function sourceKey(source: {
  kind?: unknown;
  label?: unknown;
  provider?: unknown;
  company?: unknown;
  url?: unknown;
  query?: unknown;
}): string {
  return [
    normalizeComparable(stringValue(source.kind)),
    normalizeComparable(stringValue(source.provider)),
    normalizeComparable(stringValue(source.company)),
    normalizeComparable(stringValue(source.url)),
    normalizeComparable(stringValue(source.query)),
    normalizeComparable(stringValue(source.label))
  ].join("::");
}

async function resolveWritableConfigPath(
  options: ApproveSourceSuggestionsOptions,
  workspaceRoot: string
): Promise<string | undefined> {
  const explicit = options.configPath ? path.resolve(options.configPath) : undefined;
  if (explicit) return (await fileExists(explicit)) ? explicit : undefined;

  const profileConfigPath = getApplyCueProfileConfigPath({
    env: process.env,
    ...(options.applyCueHome ? { applyCueHome: options.applyCueHome } : {}),
    ...(options.profileKey ? { profileKey: options.profileKey } : {})
  });
  if (await fileExists(profileConfigPath)) return profileConfigPath;

  const localConfigPath = path.join(workspaceRoot, "config", "applycue.local.json");
  return (await fileExists(localConfigPath)) ? localConfigPath : undefined;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "source";
}
