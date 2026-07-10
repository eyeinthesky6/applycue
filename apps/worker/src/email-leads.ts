import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ApplyCueConfig } from "@applycue/profile";
import { getApplyCueProfileConfigPath, loadApplyCueConfig } from "@applycue/profile";

export interface ImportEmailLeadsOptions {
  activateLocalJobsPath?: boolean;
  applyCueHome?: string;
  configPath?: string;
  dryRun?: boolean;
  inputPath: string;
  outputPath?: string;
  profileKey?: string;
  workspaceRoot?: string;
}

export interface ImportEmailLeadsReport {
  activatedLocalJobsPath: boolean;
  configPath: string;
  importedCount: number;
  outputPath: string;
  skippedCount: number;
  skipped: Array<{
    index: number;
    reason: string;
    subject?: string;
  }>;
}

interface EmailLeadInput {
  applyUrl?: unknown;
  body?: unknown;
  company?: unknown;
  date?: unknown;
  description?: unknown;
  from?: unknown;
  jobUrl?: unknown;
  link?: unknown;
  links?: unknown;
  location?: unknown;
  messageId?: unknown;
  postedAt?: unknown;
  snippet?: unknown;
  sourceName?: unknown;
  subject?: unknown;
  threadId?: unknown;
  title?: unknown;
  url?: unknown;
  workMode?: unknown;
}

interface ImportedLocalJob {
  company: string;
  title: string;
  url: string;
  description: string;
  location?: string;
  postedAt?: string;
  source: {
    id: string;
    kind: "email_alert";
    name: string;
    url?: string;
  };
  workMode?: string;
}

export async function importEmailLeads(options: ImportEmailLeadsOptions): Promise<ImportEmailLeadsReport> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const configPath = await resolveConfigPath(options);
  const loaded = await loadApplyCueConfig(configPath);
  const rawInputs = parseEmailLeadInputs(await readFile(path.resolve(options.inputPath), "utf8"));
  const targetPath = await resolveEmailLeadOutputPath({
    configDir: loaded.configDir,
    ...(loaded.config.sources?.localJobsPath !== undefined
      ? { configuredLocalJobsPath: loaded.config.sources.localJobsPath }
      : {}),
    ...(options.outputPath ? { outputPath: options.outputPath } : {})
  });
  const existingKeys = await readExistingImportKeys(targetPath);
  const fraudTerms = loaded.profile.sourceSettings.fraudSignalTerms;
  const imported: ImportedLocalJob[] = [];
  const skipped: ImportEmailLeadsReport["skipped"] = [];

  rawInputs.forEach((lead, index) => {
    const normalized = toImportedLocalJob(lead, index, fraudTerms);
    if ("reason" in normalized) {
      skipped.push({
        index,
        reason: normalized.reason,
        ...(normalized.subject ? { subject: normalized.subject } : {})
      });
      return;
    }
    const key = importKey(normalized);
    if (existingKeys.has(key)) {
      skipped.push({
        index,
        reason: "duplicate_email_job",
        ...(normalized.description ? { subject: firstLine(normalized.description) } : {})
      });
      return;
    }
    existingKeys.add(key);
    imported.push(normalized);
  });

  const shouldActivateLocalJobsPath =
    options.activateLocalJobsPath !== false &&
    !loaded.config.sources?.localJobsPath &&
    targetPath.startsWith(loaded.configDir);

  if (!options.dryRun) {
    await mkdir(path.dirname(targetPath), { recursive: true });
    if (imported.length > 0) {
      await appendFile(targetPath, imported.map((job) => JSON.stringify(job)).join("\n") + "\n", "utf8");
    }
    if (shouldActivateLocalJobsPath) {
      await activateLocalJobsDirectory(configPath, loaded.config, path.dirname(targetPath), loaded.configDir);
    }
  }

  return {
    activatedLocalJobsPath: Boolean(shouldActivateLocalJobsPath && !options.dryRun),
    configPath,
    importedCount: imported.length,
    outputPath: targetPath,
    skippedCount: skipped.length,
    skipped
  };
}

async function resolveConfigPath(options: ImportEmailLeadsOptions): Promise<string> {
  if (options.configPath) return path.resolve(options.configPath);
  return getApplyCueProfileConfigPath({
    env: process.env,
    ...(options.applyCueHome ? { applyCueHome: options.applyCueHome } : {}),
    ...(options.profileKey ? { profileKey: options.profileKey } : {})
  });
}

function parseEmailLeadInputs(content: string): EmailLeadInput[] {
  const trimmed = content.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) return JSON.parse(trimmed) as EmailLeadInput[];
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isRecord(parsed)) {
        for (const key of ["leads", "emails", "messages", "results", "jobs"]) {
          const value = parsed[key];
          if (Array.isArray(value)) return value as EmailLeadInput[];
        }
      }
      return [parsed as EmailLeadInput];
    } catch {
      return parseJsonLines(trimmed);
    }
  }
  return parseJsonLines(trimmed);
}

function parseJsonLines(content: string): EmailLeadInput[] {
  return content.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line) as EmailLeadInput);
}

async function resolveEmailLeadOutputPath(input: {
  configDir: string;
  configuredLocalJobsPath?: string | null;
  outputPath?: string;
}): Promise<string> {
  if (input.outputPath) return path.resolve(input.outputPath);
  const configured = input.configuredLocalJobsPath?.trim();
  if (!configured) return path.join(input.configDir, "assets", "jobs", "email-leads.jsonl");
  const resolved = path.resolve(input.configDir, configured);
  if (await isDirectory(resolved)) return path.join(resolved, "email-leads.jsonl");
  if (!path.extname(resolved)) return path.join(resolved, "email-leads.jsonl");
  return resolved;
}

async function isDirectory(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

async function readExistingImportKeys(filePath: string): Promise<Set<string>> {
  try {
    const content = await readFile(filePath, "utf8");
    const keys = new Set<string>();
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        keys.add(importKey(JSON.parse(trimmed) as ImportedLocalJob));
      } catch {
        // Existing user job files can contain hand-written rows. Ignore malformed lines here.
      }
    }
    return keys;
  } catch {
    return new Set<string>();
  }
}

function toImportedLocalJob(
  lead: EmailLeadInput,
  index: number,
  fraudTerms: readonly string[]
): ImportedLocalJob | { reason: string; subject?: string } {
  const subject = stringValue(lead.subject);
  const body = stringValue(lead.body) ?? stringValue(lead.description) ?? stringValue(lead.snippet) ?? "";
  const company = stringValue(lead.company);
  const title = stringValue(lead.title);
  const url = stringValue(lead.url) ?? stringValue(lead.jobUrl) ?? stringValue(lead.applyUrl) ?? stringValue(lead.link) ?? firstUsableUrl(lead.links) ?? firstUsableUrl(body);
  const text = [subject, body, company, title, url, stringValue(lead.from)].filter(Boolean).join(" ");
  const fraudSignal = fraudTerms.find((term) => fraudTermMatches(text, term));

  if (fraudSignal) return { reason: `fraud_signal:${fraudSignal}`, ...(subject ? { subject } : {}) };
  if (!company) return { reason: "missing_company", ...(subject ? { subject } : {}) };
  if (!title) return { reason: "missing_title", ...(subject ? { subject } : {}) };
  if (!url) return { reason: "missing_job_url", ...(subject ? { subject } : {}) };

  const description = [
    subject ? `Email subject: ${subject}` : "",
    stringValue(lead.from) ? `From: ${stringValue(lead.from)}` : "",
    stringValue(lead.messageId) ? `Message ID: ${stringValue(lead.messageId)}` : "",
    body
  ].filter(Boolean).join("\n\n");
  const sourceName = stringValue(lead.sourceName) ?? "User inbox job leads";
  const sourceUrl = gmailMessageUrl(lead);
  const job: ImportedLocalJob = {
    company,
    title,
    url,
    description,
    source: {
      id: `email-lead-${index + 1}`,
      kind: "email_alert",
      name: sourceName,
      ...(sourceUrl ? { url: sourceUrl } : {})
    }
  };
  const location = stringValue(lead.location);
  if (location) job.location = location;
  const postedAt = normalizeDate(stringValue(lead.postedAt) ?? stringValue(lead.date));
  if (postedAt) job.postedAt = postedAt;
  const workMode = normalizeWorkMode(stringValue(lead.workMode));
  if (workMode) job.workMode = workMode;
  return job;
}

async function activateLocalJobsDirectory(
  configPath: string,
  config: ApplyCueConfig,
  directoryPath: string,
  configDir: string
): Promise<void> {
  config.sources ??= {};
  config.sources.localJobsPath = slashPath(path.relative(configDir, directoryPath));
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstUsableUrl(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value.map(firstUsableUrl).find(Boolean);
  }
  const text = typeof value === "string" ? value : "";
  const matches = [...text.matchAll(/https?:\/\/[^\s<>"')]+/g)].map((match) => cleanUrl(match[0] ?? ""));
  return matches.find((url) => isLikelyJobUrl(url));
}

function cleanUrl(value: string): string {
  return value.replace(/[.,;:!?]+$/g, "");
}

function isLikelyJobUrl(url: string): boolean {
  const normalized = url.toLowerCase();
  if (!normalized.startsWith("http")) return false;
  return ![
    "unsubscribe",
    "preferences",
    "privacy",
    "terms",
    "mail.google.com",
    "accounts.google.com"
  ].some((blocked) => normalized.includes(blocked));
}

function fraudTermMatches(text: string, term: string): boolean {
  const normalizedTerm = normalizeComparable(term);
  if (!normalizedTerm) return false;
  const normalizedText = normalizeComparable(text);
  if (normalizedTerm === "deposit") {
    return /\b(pay|payment|fee|registration|training|security|refundable|required|before)\b.{0,40}\bdeposit\b/.test(normalizedText) ||
      /\bdeposit\b.{0,40}\b(pay|payment|fee|registration|training|security|refundable|required|before)\b/.test(normalizedText);
  }
  if (normalizedTerm === "payment required") {
    return /\b(payment|required|pay|fee)\b.{0,40}\b(payment|required|pay|fee)\b/.test(normalizedText);
  }
  if (normalizedTerm === "profile database") {
    return /\b(profile|resume|cv|candidate)\b.{0,80}\b(database|data bank|db|registration|register|pool)\b/.test(normalizedText) ||
      /\b(database|data bank|db|registration|register|pool)\b.{0,80}\b(profile|resume|cv|candidate)\b/.test(normalizedText);
  }
  if (normalizedTerm === "document before interview") {
    return /\b(aadhaar|aadhar|pan|passport|bank statement|salary slip|uan|pf)\b.{0,100}\b(before|prior|pre interview|shortlist|shortlisted|call|discussion|interview)\b/.test(normalizedText) ||
      /\b(before|prior|pre interview|shortlist|shortlisted|call|discussion|interview)\b.{0,100}\b(aadhaar|aadhar|pan|passport|bank statement|salary slip|uan|pf)\b/.test(normalizedText);
  }
  return normalizedText.includes(normalizedTerm);
}

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeDate(value?: string): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function normalizeWorkMode(value?: string): string | undefined {
  const normalized = normalizeComparable(value ?? "");
  if (!normalized) return undefined;
  if (["remote", "wfh", "work from home"].includes(normalized)) return "remote";
  if (normalized === "hybrid") return "hybrid";
  if (["onsite", "on site", "office"].includes(normalized)) return "onsite";
  return undefined;
}

function gmailMessageUrl(lead: EmailLeadInput): string | undefined {
  const messageId = stringValue(lead.messageId);
  return messageId ? `gmail:message:${messageId}` : undefined;
}

function importKey(job: ImportedLocalJob): string {
  return [job.company, job.title, job.url].map(normalizeComparable).join("|");
}

function firstLine(value: string): string {
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? value.slice(0, 80);
}

function slashPath(value: string): string {
  return value.split(path.sep).join("/");
}
