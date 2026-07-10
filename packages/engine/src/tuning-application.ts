import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TuningSignal } from "@applycue/core";
import { getApplyCueProfileConfigPath, type ApplyCueConfig } from "@applycue/profile";

export interface ApplyTuningSignalsOptions {
  applyAll?: boolean;
  applyCueHome?: string;
  configPath?: string;
  dryRun?: boolean;
  profileKey?: string;
  signalIds?: string[];
  tuningSignalsPath?: string;
  workspaceRoot?: string;
}

export interface ApplyTuningSignalUpdate {
  action?: TuningSignal["action"];
  configPath?: string;
  reason: string;
  signalId: string;
  status: "applied" | "skipped";
  target?: TuningSignal["target"];
  value?: string;
}

export interface ApplyTuningSignalsResult {
  appliedCount: number;
  configPath: string;
  dryRun: boolean;
  skippedCount: number;
  tuningSignalsPath: string;
  updates: ApplyTuningSignalUpdate[];
}

type MutableConfig = ApplyCueConfig & {
  preferences?: NonNullable<ApplyCueConfig["preferences"]>;
  sourceSettings?: NonNullable<ApplyCueConfig["sourceSettings"]>;
};

type MutablePreferences = NonNullable<ApplyCueConfig["preferences"]> & Record<string, unknown>;
type MutableSourceSettings = NonNullable<ApplyCueConfig["sourceSettings"]> & Record<string, unknown>;

interface ConfigRoute {
  bucket: "preferences" | "sourceSettings";
  field: string;
}

const TUNING_ORIGINS: Array<TuningSignal["origin"]> = [
  "user_feedback",
  "agent_analysis",
  "outcome_learning",
  "system_diagnostic"
];

const TUNING_TARGETS: Array<TuningSignal["target"]> = [
  "role_term",
  "title_variant",
  "industry",
  "location",
  "source",
  "seniority",
  "company",
  "keyword",
  "work_mode",
  "cv_fact",
  "apply_policy"
];

const TUNING_ACTIONS: Array<TuningSignal["action"]> = [
  "promote",
  "demote",
  "block",
  "watch",
  "ask_user",
  "keep"
];

const TUNING_STATUSES: Array<TuningSignal["status"]> = [
  "proposed",
  "approved",
  "rejected",
  "applied",
  "archived"
];

export async function applyTuningSignals(
  options: ApplyTuningSignalsOptions = {}
): Promise<ApplyTuningSignalsResult> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const configPath = await resolveWritableConfigPath(options, workspaceRoot);
  if (!configPath) {
    throw new Error("No ApplyCue config found. Create a user profile config before applying tuning.");
  }

  const selectedIds = new Set((options.signalIds ?? []).map((id) => id.trim()).filter(Boolean));
  if (!options.applyAll && selectedIds.size === 0) {
    throw new Error("Pass at least one tuning signal id, or use --all for an explicit bulk apply.");
  }

  const config = JSON.parse(await readFile(configPath, "utf8")) as MutableConfig;
  const configDir = path.dirname(configPath);
  const tuningSignalsPath = path.resolve(
    options.tuningSignalsPath ?? path.join(configDir, "data", "local", "tuning-signals.jsonl")
  );
  const signals = await readTuningSignals(tuningSignalsPath);
  const signalIds = new Set(signals.map((signal) => signal.id));
  const updates: ApplyTuningSignalUpdate[] = [];

  for (const missingId of [...selectedIds].filter((id) => !signalIds.has(id))) {
    updates.push({
      signalId: missingId,
      status: "skipped",
      reason: "Tuning signal id was not found."
    });
  }

  for (const signal of signals) {
    if (!options.applyAll && !selectedIds.has(signal.id)) continue;
    updates.push(applyOneTuningSignal(config, signal));
  }

  const appliedCount = updates.filter((update) => update.status === "applied").length;
  if (!options.dryRun && appliedCount > 0) {
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  }

  return {
    appliedCount,
    configPath,
    dryRun: options.dryRun ?? false,
    skippedCount: updates.length - appliedCount,
    tuningSignalsPath,
    updates
  };
}

function applyOneTuningSignal(config: MutableConfig, signal: TuningSignal): ApplyTuningSignalUpdate {
  const base = createBaseUpdate(signal);
  if (signal.status !== "approved") {
    return {
      ...base,
      status: "skipped",
      reason: `Signal status is ${signal.status}; only approved tuning can update editable config.`
    };
  }

  const value = cleanString(signal.value);
  if (!value) {
    return {
      ...base,
      status: "skipped",
      reason: "Signal value is empty."
    };
  }

  const route = routeTuningSignal(signal);
  if (!route) {
    return {
      ...base,
      status: "skipped",
      reason: "This tuning target/action is kept for agent judgment; no safe config field exists yet."
    };
  }

  const owner = route.bucket === "preferences" ? ensurePreferences(config) : ensureSourceSettings(config);
  const list = ensureStringArray(owner, route.field);
  if (!addUniqueString(list, value)) {
    return {
      ...base,
      configPath: `${route.bucket}.${route.field}`,
      status: "skipped",
      reason: "Editable config already contains this value."
    };
  }

  return {
    ...base,
    configPath: `${route.bucket}.${route.field}`,
    status: "applied",
    reason: "Approved tuning was written into editable user config."
  };
}

function routeTuningSignal(signal: TuningSignal): ConfigRoute | undefined {
  const target = signal.target;
  const action = signal.action;

  if (target === "role_term" || target === "title_variant") {
    if (action === "promote" || action === "keep") return { bucket: "preferences", field: "targetRoleTerms" };
    if (action === "demote" || action === "watch") return { bucket: "preferences", field: "adjacentRoleTerms" };
    if (action === "block") return { bucket: "preferences", field: "noGoRoleTerms" };
    return undefined;
  }

  if (target === "industry") {
    if (action === "promote" || action === "keep") return { bucket: "preferences", field: "targetIndustries" };
    if (action === "block") return { bucket: "preferences", field: "excludedIndustries" };
    return undefined;
  }

  if (target === "location") {
    if (action === "promote" || action === "keep") return { bucket: "preferences", field: "preferredLocations" };
    if (action === "watch" || action === "ask_user") return { bucket: "preferences", field: "askBeforeLocations" };
    return undefined;
  }

  if (target === "source") {
    if (action === "promote" || action === "keep") return { bucket: "sourceSettings", field: "trustedPortals" };
    if (action === "demote" || action === "watch" || action === "ask_user") {
      return { bucket: "sourceSettings", field: "askBeforePortals" };
    }
    if (action === "block") return { bucket: "sourceSettings", field: "blockedPortals" };
    return undefined;
  }

  if (target === "keyword") {
    if (action === "promote" || action === "keep") return { bucket: "preferences", field: "niceToHaveKeywords" };
    if (action === "block") return { bucket: "preferences", field: "excludedKeywords" };
    return undefined;
  }

  return undefined;
}

function createBaseUpdate(signal: TuningSignal): ApplyTuningSignalUpdate {
  return {
    signalId: signal.id,
    target: signal.target,
    action: signal.action,
    value: signal.value,
    status: "skipped",
    reason: ""
  };
}

function ensurePreferences(config: MutableConfig): MutablePreferences {
  config.preferences ??= {};
  return config.preferences as MutablePreferences;
}

function ensureSourceSettings(config: MutableConfig): MutableSourceSettings {
  config.sourceSettings ??= {};
  return config.sourceSettings as MutableSourceSettings;
}

function ensureStringArray(owner: Record<string, unknown>, field: string): string[] {
  const value = owner[field];
  if (Array.isArray(value)) return value as string[];
  const next: string[] = [];
  owner[field] = next;
  return next;
}

function addUniqueString(list: string[], value: string): boolean {
  const normalized = normalizeComparable(value);
  if (list.some((item) => typeof item === "string" && normalizeComparable(item) === normalized)) return false;
  list.push(value);
  return true;
}

async function readTuningSignals(filePath: string): Promise<TuningSignal[]> {
  if (!(await fileExists(filePath))) return [];
  return (await readFile(filePath, "utf8"))
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line): TuningSignal[] => {
      try {
        const parsed = JSON.parse(line) as unknown;
        return isTuningSignal(parsed) ? [parsed] : [];
      } catch {
        return [];
      }
    });
}

function isTuningSignal(value: unknown): value is TuningSignal {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" &&
    TUNING_ORIGINS.includes(record.origin as TuningSignal["origin"]) &&
    TUNING_TARGETS.includes(record.target as TuningSignal["target"]) &&
    TUNING_ACTIONS.includes(record.action as TuningSignal["action"]) &&
    typeof record.value === "string" &&
    typeof record.reason === "string" &&
    TUNING_STATUSES.includes(record.status as TuningSignal["status"]) &&
    typeof record.createdAt === "string";
}

async function resolveWritableConfigPath(
  options: ApplyTuningSignalsOptions,
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

function cleanString(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
