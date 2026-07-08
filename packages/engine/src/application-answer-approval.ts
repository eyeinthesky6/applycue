import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ApplicationAnswer } from "@applycue/core";
import { getApplyCueProfileConfigPath, type ApplyCueConfig } from "@applycue/profile";

export interface ApplicationAnswerInput {
  aliases?: string[];
  field: string;
  id?: string;
  needsApproval?: boolean;
  sourceRef?: string;
  value: string;
}

export interface ApproveApplicationAnswersOptions {
  answers: ApplicationAnswerInput[];
  applyCueHome?: string;
  approvedAt?: string;
  configPath?: string;
  dryRun?: boolean;
  profileKey?: string;
  replaceExisting?: boolean;
  workspaceRoot?: string;
}

export interface ApplicationAnswerApprovalUpdate {
  field: string;
  id: string;
  reason: string;
  status: "added" | "updated" | "skipped";
}

export interface ApproveApplicationAnswersResult {
  addedCount: number;
  configPath: string;
  dryRun: boolean;
  skippedCount: number;
  updatedCount: number;
  updates: ApplicationAnswerApprovalUpdate[];
}

type MutableConfig = ApplyCueConfig & {
  applicationAnswers?: ApplicationAnswer[];
};

export async function approveApplicationAnswers(
  options: ApproveApplicationAnswersOptions
): Promise<ApproveApplicationAnswersResult> {
  if (options.answers.length === 0) {
    throw new Error("Pass at least one approved application answer.");
  }

  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const configPath = await resolveWritableConfigPath(options, workspaceRoot);
  if (!configPath) {
    throw new Error("No ApplyCue config found. Create a user profile config before approving application answers.");
  }

  const config = JSON.parse(await readFile(configPath, "utf8")) as MutableConfig;
  config.applicationAnswers ??= [];
  const approvedAt = options.approvedAt ?? new Date().toISOString();
  const updates: ApplicationAnswerApprovalUpdate[] = [];

  for (const input of options.answers) {
    updates.push(approveSingleApplicationAnswer({
      answers: config.applicationAnswers,
      approvedAt,
      input,
      replaceExisting: options.replaceExisting ?? false
    }));
  }

  const addedCount = updates.filter((update) => update.status === "added").length;
  const updatedCount = updates.filter((update) => update.status === "updated").length;
  if (!options.dryRun && addedCount + updatedCount > 0) {
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  }

  return {
    addedCount,
    configPath,
    dryRun: options.dryRun ?? false,
    skippedCount: updates.length - addedCount - updatedCount,
    updatedCount,
    updates
  };
}

function approveSingleApplicationAnswer(input: {
  answers: ApplicationAnswer[];
  approvedAt: string;
  input: ApplicationAnswerInput;
  replaceExisting: boolean;
}): ApplicationAnswerApprovalUpdate {
  const field = cleanString(input.input.field);
  const value = cleanString(input.input.value);

  if (!field || !value) {
    return {
      field: field || "unknown",
      id: cleanString(input.input.id) ?? "answer-unknown",
      status: "skipped",
      reason: "Application answer needs both field and value."
    };
  }

  const id = cleanString(input.input.id) ?? `answer-${slugify(field)}`;

  if (isBlockedSecretField(field)) {
    return {
      field,
      id,
      status: "skipped",
      reason: "This looks like a password, token, payment, or private ID field and must not be stored as a reusable answer."
    };
  }

  const nextAnswer = createAnswer(input.input, field, value, id, input.approvedAt);
  const existingIndex = input.answers.findIndex((answer) =>
    normalizeComparable(answer.id) === normalizeComparable(id) ||
    normalizeComparable(answer.field) === normalizeComparable(field)
  );

  if (existingIndex === -1) {
    input.answers.push(nextAnswer);
    return {
      field,
      id,
      status: "added",
      reason: "Accepted into editable user config."
    };
  }

  const existing = input.answers[existingIndex];
  if (!existing) {
    input.answers.push(nextAnswer);
    return {
      field,
      id,
      status: "added",
      reason: "Accepted into editable user config."
    };
  }

  const sameValue = existing.value.trim() === value;
  if (!sameValue && existing.approvedByUser === true && !input.replaceExisting) {
    return {
      field,
      id: existing.id,
      status: "skipped",
      reason: "Editable config already has a different approved answer for this field. Use --replace to update it."
    };
  }

  input.answers[existingIndex] = mergeAnswer(existing, nextAnswer);
  return {
    field,
    id: existing.id,
    status: "updated",
    reason: sameValue
      ? "Existing approved answer was updated with aliases or metadata."
      : "Existing answer was replaced after explicit approval."
  };
}

function createAnswer(
  input: ApplicationAnswerInput,
  field: string,
  value: string,
  id: string,
  createdAt: string
): ApplicationAnswer {
  const answer: ApplicationAnswer = {
    id,
    field,
    value,
    approvedByUser: true,
    createdAt
  };
  const aliases = uniqueValues(input.aliases ?? []);
  if (aliases.length > 0) answer.aliases = aliases;
  if (input.needsApproval === true) answer.needsApproval = true;
  const sourceRef = cleanString(input.sourceRef);
  if (sourceRef) answer.sourceRef = sourceRef;
  return answer;
}

function mergeAnswer(existing: ApplicationAnswer, nextAnswer: ApplicationAnswer): ApplicationAnswer {
  const merged: ApplicationAnswer = {
    ...existing,
    field: nextAnswer.field,
    value: nextAnswer.value,
    approvedByUser: true,
    createdAt: existing.createdAt || nextAnswer.createdAt
  };
  const aliases = uniqueValues([...(existing.aliases ?? []), ...(nextAnswer.aliases ?? [])]);
  if (aliases.length > 0) merged.aliases = aliases;
  if (nextAnswer.needsApproval === true) merged.needsApproval = true;
  if (nextAnswer.sourceRef) merged.sourceRef = nextAnswer.sourceRef;
  return merged;
}

async function resolveWritableConfigPath(
  options: Pick<ApproveApplicationAnswersOptions, "applyCueHome" | "configPath" | "profileKey">,
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

function cleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "answer";
}

function isBlockedSecretField(field: string): boolean {
  return /password|otp|one[-\s]?time|token|secret|cookie|session|credit\s*card|card\s*number|cvv|bank\s*account|passport|national\s*id|\bssn\b|social\s*security/i
    .test(field);
}
