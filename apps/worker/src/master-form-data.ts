import type { ApplicationAnswer, ApplicationDraft } from "@applycue/core";
import { runLocalOrSampleBatch, type SampleBatchResult } from "@applycue/engine";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SetupApplyCueOptions } from "./setup.js";

export type MasterFormDataStatus = "confirmed" | "needs_confirmation";

export interface MasterFormDataField {
  field: string;
  value: string;
  aliases: string[];
  sourceRefs: string[];
  needsApproval: boolean;
  usedInJobIds: string[];
}

export interface MasterFormDataReport {
  id: "applycue-master-form-data";
  status: MasterFormDataStatus;
  generatedAt: string;
  confirmedAt?: string;
  fieldsHash: string;
  fieldCount: number;
  fields: MasterFormDataField[];
  paths: {
    canonicalJson: string;
    markdownPreview: string;
  };
  confirmationCommand: string;
  summary: string;
  notes: string[];
}

export interface MasterFormDataOptions extends SetupApplyCueOptions {
  batch?: MasterFormDataBatch;
  confirm?: boolean;
}

type MasterFormDataBatch = Pick<SampleBatchResult, "drafts" | "outputRoot"> & Partial<Pick<SampleBatchResult, "profile">>;

export async function runMasterFormData(options: MasterFormDataOptions = {}): Promise<MasterFormDataReport> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const batch = options.batch ?? await runLocalOrSampleBatch({
    workspaceRoot,
    requireRecordedJobDecisions: true,
    ...(options.applyCueHome ? { applyCueHome: options.applyCueHome } : {}),
    ...(typeof options.freshnessDays === "number" ? { freshnessDays: options.freshnessDays } : {}),
    ...(typeof options.generatedSourceExpansion === "boolean" ? { generatedSourceExpansion: options.generatedSourceExpansion } : {}),
    ...(typeof options.includeOlderPosts === "boolean" ? { includeOlderPosts: options.includeOlderPosts } : {}),
    ...(options.profileKey ? { profileKey: options.profileKey } : {}),
    ...(typeof options.targetRankingQueue === "number" ? { targetRankingQueue: options.targetRankingQueue } : {}),
    writeFiles: true
  });
  return writeMasterFormDataReport(batch, {
    confirm: Boolean(options.confirm),
    confirmationCommand: buildFormDataConfirmationCommand(options),
    ...(options.profileKey ? { profileKey: options.profileKey } : {})
  });
}

export async function writeMasterFormDataReport(
  batch: MasterFormDataBatch,
  options: { confirm?: boolean; confirmationCommand?: string; profileKey?: string } = {}
): Promise<MasterFormDataReport> {
  const paths = masterFormDataPaths(batch.outputRoot);
  await mkdir(path.dirname(paths.canonicalJson), { recursive: true });
  await mkdir(path.dirname(paths.markdownPreview), { recursive: true });

  const fields = collectMasterFormFields(batch.drafts, batch.profile?.applicationAnswers ?? []);
  const fieldsHash = hashFields(fields);
  const existing = await readExistingMasterFormData(paths.canonicalJson);
  const generatedAt = new Date().toISOString();
  const confirmedAt = options.confirm
    ? generatedAt
    : existing?.status === "confirmed" && existing.fieldsHash === fieldsHash
      ? existing.confirmedAt
      : undefined;
  const status: MasterFormDataStatus = confirmedAt ? "confirmed" : "needs_confirmation";
  const report: MasterFormDataReport = {
    id: "applycue-master-form-data",
    status,
    generatedAt,
    ...(confirmedAt ? { confirmedAt } : {}),
    fieldsHash,
    fieldCount: fields.length,
    fields,
    paths,
    confirmationCommand: options.confirmationCommand ?? buildFormDataConfirmationCommand({
      ...(options.profileKey ? { profileKey: options.profileKey } : {})
    }),
    summary: status === "confirmed"
      ? `Master form data confirmed with ${fields.length} reusable field(s).`
      : `Master form data needs user confirmation for ${fields.length} field(s).`,
    notes: [
      "This is the shared portal-form data snapshot. Browser portal applications should use these values unless a live form asks a new question.",
      "Email and DM sending stay agent-managed through connectors or browser control; ApplyCue does not send them."
    ]
  };

  await writeFile(paths.canonicalJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(paths.markdownPreview, renderMasterFormDataMarkdown(report), "utf8");
  return report;
}

function buildFormDataConfirmationCommand(options: {
  freshnessDays?: number;
  generatedSourceExpansion?: boolean;
  includeOlderPosts?: boolean;
  profileKey?: string;
  targetRankingQueue?: number;
}): string {
  const args = ["pnpm", "applycue:form-data", "--", "--confirm"];
  if (options.profileKey) args.push("--profile", quoteCommandValue(options.profileKey));
  if (options.generatedSourceExpansion) args.push("--more-results");
  if (typeof options.targetRankingQueue === "number") args.push("--target-ranking-queue", String(options.targetRankingQueue));
  if (typeof options.freshnessDays === "number") args.push("--freshness-days", String(options.freshnessDays));
  if (options.includeOlderPosts) args.push("--include-older-posts");
  return args.join(" ");
}

function quoteCommandValue(value: string): string {
  return /^[A-Za-z0-9._-]+$/.test(value) ? value : JSON.stringify(value);
}

export async function isMasterFormDataConfirmed(
  batch: MasterFormDataBatch
): Promise<{ confirmed: boolean; report: MasterFormDataReport }> {
  const report = await writeMasterFormDataReport(batch, { confirm: false });
  return {
    confirmed: report.status === "confirmed",
    report
  };
}

function collectMasterFormFields(drafts: ApplicationDraft[], approvedAnswers: ApplicationAnswer[]): MasterFormDataField[] {
  const byField = new Map<string, MasterFormDataField>();
  for (const draft of drafts) {
    for (const answer of draft.answers) {
      if (answer.field === "final_submit") continue;
      const key = answer.field.trim();
      const value = answer.value.trim();
      if (!key || !value) continue;
      upsertMasterFormField(byField, {
        aliases: answer.aliases ?? [],
        field: key,
        jobId: draft.jobId,
        needsApproval: answer.needsApproval,
        ...(answer.sourceRef ? { sourceRef: answer.sourceRef } : {}),
        value
      });
    }
  }
  for (const answer of approvedAnswers) {
    if (answer.approvedByUser !== true) continue;
    const key = answer.field.trim();
    const value = answer.value.trim();
    if (!key || !value) continue;
    upsertMasterFormField(byField, {
      aliases: answer.aliases ?? [],
      field: key,
      needsApproval: answer.needsApproval ?? false,
      ...((answer.sourceRef ?? answer.id) ? { sourceRef: answer.sourceRef ?? answer.id } : {}),
      value
    });
  }
  return [...byField.values()].sort((left, right) => left.field.localeCompare(right.field));
}

function upsertMasterFormField(
  byField: Map<string, MasterFormDataField>,
  input: {
    aliases: string[];
    field: string;
    jobId?: string;
    needsApproval: boolean;
    sourceRef?: string;
    value: string;
  }
): void {
  const existing = byField.get(input.field);
  if (!existing) {
    byField.set(input.field, {
      field: input.field,
      value: input.value,
      aliases: uniqueValues(input.aliases),
      sourceRefs: uniqueValues(input.sourceRef ? [input.sourceRef] : []),
      needsApproval: input.needsApproval,
      usedInJobIds: uniqueValues(input.jobId ? [input.jobId] : [])
    });
    return;
  }
  existing.aliases = uniqueValues([...existing.aliases, ...input.aliases]);
  existing.sourceRefs = uniqueValues([...existing.sourceRefs, ...(input.sourceRef ? [input.sourceRef] : [])]);
  existing.needsApproval = existing.needsApproval || input.needsApproval;
  existing.usedInJobIds = uniqueValues([...existing.usedInJobIds, ...(input.jobId ? [input.jobId] : [])]);
  if (existing.value !== input.value && !existing.value.includes(input.value)) {
    existing.sourceRefs = uniqueValues([...existing.sourceRefs, `conflict:${input.jobId ?? "approved-answer"}`]);
  }
}

function hashFields(fields: MasterFormDataField[]): string {
  const stable = fields.map((field) => ({
    field: field.field,
    value: field.value,
    aliases: [...field.aliases].sort(),
    sourceRefs: [...field.sourceRefs].sort(),
    needsApproval: field.needsApproval
  }));
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

async function readExistingMasterFormData(filePath: string): Promise<MasterFormDataReport | undefined> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Partial<MasterFormDataReport>;
    if (parsed.id !== "applycue-master-form-data") return undefined;
    if (parsed.status !== "confirmed") return undefined;
    if (typeof parsed.fieldsHash !== "string") return undefined;
    return parsed as MasterFormDataReport;
  } catch {
    return undefined;
  }
}

function masterFormDataPaths(outputRoot: string): MasterFormDataReport["paths"] {
  return {
    canonicalJson: path.join(outputRoot, "data", "local", "master-form-data.json"),
    markdownPreview: path.join(outputRoot, "outputs", "form-data", "master-form-data.md")
  };
}

function renderMasterFormDataMarkdown(report: MasterFormDataReport): string {
  const lines = [
    "# ApplyCue Master Form Data",
    "",
    `Status: ${report.status}`,
    `Summary: ${report.summary}`,
    `Fields hash: ${report.fieldsHash}`,
    "",
    "## Confirm In Chat",
    "",
    "Show these values to the user before portal applications. If approved, the agent runs:",
    "",
    `\`${report.confirmationCommand}\``,
    "",
    "## Fields",
    "",
    "| Field | Value | Aliases | Needs Approval | Source |",
    "| --- | --- | --- | --- | --- |",
    ...report.fields.map((field) =>
      `| ${escapeTable(field.field)} | ${escapeTable(field.value)} | ${escapeTable(field.aliases.join(", ") || "-")} | ${field.needsApproval ? "yes" : "no"} | ${escapeTable(field.sourceRefs.join(", ") || "profile/draft")} |`
    ),
    "",
    "## Notes",
    "",
    ...report.notes.map((note) => `- ${note}`)
  ];
  return `${lines.join("\n")}\n`;
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
