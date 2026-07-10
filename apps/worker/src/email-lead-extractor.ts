import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getApplyCueProfileConfigPath, loadApplyCueConfig } from "@applycue/profile";
import { importEmailLeads, type ImportEmailLeadsReport } from "./email-leads.js";

export interface ExtractEmailLeadsOptions {
  applyCueHome?: string;
  configPath?: string;
  importDryRun?: boolean;
  importLeads?: boolean;
  inputPath: string;
  now?: string;
  outputPath?: string;
  profileKey?: string;
  workspaceRoot?: string;
}

export interface ExtractedEmailLead {
  body: string;
  company: string;
  from?: string;
  location?: string;
  messageId?: string;
  postedAt?: string;
  sourceName: string;
  subject?: string;
  threadId?: string;
  title: string;
  url: string;
  workMode?: string;
}

export interface ExtractEmailLeadsReport {
  configPath: string;
  extractedCount: number;
  importReport?: ImportEmailLeadsReport;
  inputMessageCount: number;
  inputPath: string;
  outputPath: string;
  skipped: Array<{
    reason: string;
    subject?: string;
    detail?: string;
  }>;
  skippedCount: number;
}

interface ConnectorEmailMessage {
  body?: unknown;
  date?: unknown;
  display_url?: unknown;
  email_ts?: unknown;
  from?: unknown;
  from_?: unknown;
  id?: unknown;
  labels?: unknown;
  messageId?: unknown;
  message_id?: unknown;
  raw?: unknown;
  snippet?: unknown;
  subject?: unknown;
  text?: unknown;
  threadId?: unknown;
  thread_id?: unknown;
}

interface MarkdownLink {
  href: string;
  index: number;
  label: string;
  url: string;
}

interface LeadCandidate {
  body: string;
  company?: string;
  from?: string;
  location?: string;
  messageId?: string;
  postedAt?: string;
  sourceName: string;
  subject?: string;
  threadId?: string;
  title?: string;
  url: string;
  workMode?: string;
}

export async function extractEmailLeads(options: ExtractEmailLeadsOptions): Promise<ExtractEmailLeadsReport> {
  const configPath = await resolveConfigPath(options);
  const loaded = await loadApplyCueConfig(configPath);
  const inputPath = path.resolve(options.inputPath);
  const messages = parseConnectorMessages(await readFile(inputPath, "utf8"));
  const outputPath = path.resolve(
    options.outputPath ?? defaultOutputPath(loaded.configDir, options.now ?? new Date().toISOString())
  );
  const skipped: ExtractEmailLeadsReport["skipped"] = [];
  const leads = dedupeLeads(messages.flatMap((message) => extractMessageLeads(message, skipped)));

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, leads.map((lead) => JSON.stringify(lead)).join("\n") + (leads.length > 0 ? "\n" : ""), "utf8");

  const importReport = options.importLeads
    ? await importEmailLeads({
        activateLocalJobsPath: true,
        configPath,
        inputPath: outputPath,
        ...(options.applyCueHome ? { applyCueHome: options.applyCueHome } : {}),
        ...(options.importDryRun !== undefined ? { dryRun: options.importDryRun } : {}),
        ...(options.profileKey ? { profileKey: options.profileKey } : {}),
        workspaceRoot: options.workspaceRoot ?? process.cwd()
      })
    : undefined;

  return {
    configPath,
    extractedCount: leads.length,
    ...(importReport ? { importReport } : {}),
    inputMessageCount: messages.length,
    inputPath,
    outputPath,
    skipped,
    skippedCount: skipped.length
  };
}

async function resolveConfigPath(options: ExtractEmailLeadsOptions): Promise<string> {
  if (options.configPath) return Promise.resolve(path.resolve(options.configPath));
  return getApplyCueProfileConfigPath({
    env: process.env,
    ...(options.applyCueHome ? { applyCueHome: options.applyCueHome } : {}),
    ...(options.profileKey ? { profileKey: options.profileKey } : {})
  });
}

function defaultOutputPath(configDir: string, now: string): string {
  const day = now.slice(0, 10).replace(/[^0-9-]/g, "") || "today";
  return path.join(configDir, "assets", "inbox-leads", `email-leads-extracted-${day}.jsonl`);
}

function parseConnectorMessages(content: string): ConnectorEmailMessage[] {
  const parsed = parseJsonOrJsonl(content);
  return collectMessages(parsed);
}

function parseJsonOrJsonl(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return trimmed.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as unknown);
    }
  }
  return trimmed.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as unknown);
}

function collectMessages(value: unknown): ConnectorEmailMessage[] {
  if (Array.isArray(value)) return value.flatMap(collectMessages);
  if (!isRecord(value)) return [];
  for (const key of ["emails", "messages", "results", "items", "data"]) {
    const nested = value[key];
    if (Array.isArray(nested)) return collectMessages(nested);
  }
  if (looksLikeEmailMessage(value)) return [value as ConnectorEmailMessage];
  return [];
}

function looksLikeEmailMessage(value: Record<string, unknown>): boolean {
  return Boolean(value.subject || value.body || value.snippet || value.from || value.from_ || value.id || value.messageId);
}

function extractMessageLeads(
  message: ConnectorEmailMessage,
  skipped: ExtractEmailLeadsReport["skipped"]
): ExtractedEmailLead[] {
  const subject = stringValue(message.subject);
  const body = stringValue(message.body) ?? stringValue(message.text) ?? stringValue(message.snippet) ?? "";
  const snippet = stringValue(message.snippet) ?? "";
  const from = stringValue(message.from_) ?? stringValue(message.from);
  const messageId = stringValue(message.messageId) ?? stringValue(message.message_id) ?? stringValue(message.id);
  const threadId = stringValue(message.threadId) ?? stringValue(message.thread_id);
  const postedAt = normalizeDate(stringValue(message.email_ts) ?? stringValue(message.date));
  const sourceName = inferSourceName(from);
  const links = markdownLinks(body);
  const leads: ExtractedEmailLead[] = [];

  for (const link of links) {
    const normalizedUrl = unwrapTrackingUrl(link.url);
    if (!isLikelyJobUrl(normalizedUrl)) continue;
    const parsed = parseLeadFromLink(link, normalizedUrl, body, subject);
    if (!parsed.title || !parsed.company) {
      skipped.push({
        reason: "missing_company_or_title",
        ...(subject ? { subject } : {}),
        detail: link.label.slice(0, 120)
      });
      continue;
    }
    if (isTrainingOrCourse(parsed.title, parsed.company, normalizedUrl)) continue;
    const candidate: LeadCandidate = {
      body: leadBody({
        body,
        link,
        ...(snippet ? { snippet } : {}),
        ...(subject ? { subject } : {})
      }),
      company: parsed.company,
      ...(from ? { from } : {}),
      ...(parsed.location ? { location: parsed.location } : {}),
      ...(messageId ? { messageId } : {}),
      ...(postedAt ? { postedAt } : {}),
      sourceName,
      ...(subject ? { subject } : {}),
      ...(threadId ? { threadId } : {}),
      title: parsed.title,
      url: normalizedUrl,
      ...(parsed.workMode ? { workMode: parsed.workMode } : {})
    };
    const normalized = normalizeCandidate(candidate);
    if (normalized) leads.push(normalized);
  }

  if (leads.length === 0 && subject) {
    const subjectLead = leadFromSubject(message, body, sourceName);
    if (subjectLead) leads.push(subjectLead);
  }

  return leads;
}

function markdownLinks(body: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  for (const match of body.matchAll(/\[([\s\S]*?)\]\((https?:\/\/[^\s)]+)\)/g)) {
    const label = normalizeWhitespace(stripMarkdown(match[1] ?? ""));
    const url = cleanUrl(match[2] ?? "");
    if (!label || !url) continue;
    links.push({
      href: url,
      index: match.index ?? 0,
      label,
      url
    });
  }
  for (const match of body.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = normalizeWhitespace(stripHtml(stripMarkdown(match[2] ?? "")));
    const url = cleanUrl(match[1] ?? "");
    if (!label || !url) continue;
    links.push({
      href: url,
      index: match.index ?? 0,
      label,
      url
    });
  }
  return dedupeMarkdownLinks(links).sort((left, right) => left.index - right.index);
}

function parseLeadFromLink(
  link: MarkdownLink,
  normalizedUrl: string,
  body: string,
  subject?: string
): { company?: string; location?: string; title?: string; workMode?: string } {
  const labelParts = link.label.split(/\n+/).map(cleanTextPart).filter(Boolean);
  const compactLabel = cleanTextPart(link.label);
  const fromIimJobs = parseIimJobsLabel(labelParts);
  if (fromIimJobs.title && fromIimJobs.company) return fromIimJobs;
  const fromNaukriLabel = parseNaukriLabel(labelParts);
  if (fromNaukriLabel.title && fromNaukriLabel.company) return fromNaukriLabel;
  const fromContext = parseContextBeforeLink(body, link.index);
  if (fromContext.title && fromContext.company) return fromContext;
  const fromSubject = parseSubject(subject ?? "");
  if (fromSubject.title && fromSubject.company && !isGenericLinkLabel(compactLabel)) {
    return {
      ...fromSubject,
      title: fromSubject.title,
      company: fromSubject.company
    };
  }
  return {};
}

function parseIimJobsLabel(parts: string[]): { company?: string; location?: string; title?: string; workMode?: string } {
  const title = cleanTitle(parts[0] ?? "");
  const companyLine = parts.find((part, index) => index > 0 && part.includes("·"));
  if (!title || !companyLine) return {};
  const segments = companyLine.split("·").map(cleanTextPart).filter(Boolean);
  const company = segments[0];
  const location = segments.filter((segment) => !/\b\d+\s*[-+]\s*\d+\s*yrs?\b/i.test(segment)).slice(1).join(" · ");
  const workMode = workModeFromText(`${title} ${companyLine}`);
  return {
    ...(company ? { company } : {}),
    ...(location ? { location } : {}),
    title,
    ...(workMode ? { workMode } : {})
  };
}

function parseNaukriLabel(parts: string[]): { company?: string; location?: string; title?: string; workMode?: string } {
  if (parts.length < 2) return {};
  const title = cleanTitle(parts[0] ?? "");
  if (!title || isGenericLinkLabel(title)) return {};
  const company = parts.slice(1).find((part) => isLikelyCompanyLine(part));
  const titleIndex = parts.findIndex((part) => cleanTitle(part) === title);
  const afterTitle = titleIndex >= 0 ? parts.slice(titleIndex + 1) : parts.slice(1);
  const location = afterTitle.find((part) => isLikelyLocationLine(part));
  const workMode = workModeFromText(parts.join(" "));
  return {
    ...(company ? { company } : {}),
    ...(location ? { location } : {}),
    title,
    ...(workMode ? { workMode } : {})
  };
}

function parseContextBeforeLink(body: string, linkIndex: number): { company?: string; location?: string; title?: string; workMode?: string } {
  const context = body.slice(Math.max(0, linkIndex - 700), linkIndex);
  const lines = context.split(/\r?\n/).map(cleanTextPart).filter(Boolean);
  const useful = lines.filter((line) => !isBoilerplateLine(line));
  for (let index = useful.length - 1; index >= 0; index -= 1) {
    const line = useful[index] ?? "";
    const companyTitle = parseCompanyDashTitle(line);
    if (companyTitle) {
      const location = nearbyLocation(useful, index);
      const workMode = workModeFromText(useful.slice(index).join(" "));
      return {
        company: companyTitle.company,
        ...(location ? { location } : {}),
        title: companyTitle.title,
        ...(workMode ? { workMode } : {})
      };
    }
    if (looksLikeJobTitle(line)) {
      const company = previousCompanyLine(useful, index);
      if (company) {
        const location = nearbyLocation(useful, index);
        const workMode = workModeFromText(useful.slice(index).join(" "));
        return {
          company,
          ...(location ? { location } : {}),
          title: cleanTitle(line),
          ...(workMode ? { workMode } : {})
        };
      }
    }
  }
  return {};
}

function leadFromSubject(message: ConnectorEmailMessage, body: string, sourceName: string): ExtractedEmailLead | undefined {
  const subject = stringValue(message.subject);
  if (!subject) return undefined;
  const parsed = parseSubject(subject);
  if (!parsed.title || !parsed.company) return undefined;
  const url = firstLikelyUrl(body);
  if (!url) return undefined;
  const from = stringValue(message.from_) ?? stringValue(message.from);
  const messageId = stringValue(message.messageId) ?? stringValue(message.message_id) ?? stringValue(message.id);
  return {
    body: leadBody({ body, subject }),
    company: parsed.company,
    ...(from ? { from } : {}),
    ...(messageId ? { messageId } : {}),
    sourceName,
    subject,
    title: parsed.title,
    url
  };
}

function parseSubject(subject: string): { company?: string; title?: string } {
  const cleaned = cleanTextPart(subject);
  const atMatch = cleaned.match(/^(.+?)\s+at\s+(.+?)(?:\s*:|\s+-|\s*\||$)/i);
  if (atMatch) {
    return {
      title: cleanTitle(atMatch[1] ?? ""),
      company: cleanCompany(atMatch[2] ?? "")
    };
  }
  const hiringMatch = cleaned.match(/^(.+?)\s+is hiring\s+(?:for\s+)?(.+?)(?:\s*\.|\s*:|\s+-|$)/i);
  if (hiringMatch) {
    return {
      company: cleanCompany(hiringMatch[1] ?? ""),
      title: cleanTitle(hiringMatch[2] ?? "")
    };
  }
  return {};
}

function parseCompanyDashTitle(line: string): { company: string; title: string } | undefined {
  const normalized = cleanTextPart(line);
  const withYearsRemoved = normalized.replace(/\(\s*\d+\s*[-+]\s*\d+\s*yrs?\s*\)/gi, "").trim();
  const match = withYearsRemoved.match(/^(.{2,80}?)\s+-\s+(.{4,160})$/);
  if (!match) return undefined;
  const company = cleanCompany(match[1] ?? "");
  const title = cleanTitle(match[2] ?? "");
  if (!company || !title || looksLikeJobTitle(company) || !looksLikeJobTitle(title)) return undefined;
  return { company, title };
}

function previousCompanyLine(lines: string[], titleIndex: number): string | undefined {
  for (let index = titleIndex - 1; index >= Math.max(0, titleIndex - 4); index -= 1) {
    const line = lines[index] ?? "";
    if (isLikelyCompanyLine(line)) return cleanCompany(line);
  }
  return undefined;
}

function nearbyLocation(lines: string[], titleIndex: number): string | undefined {
  for (const line of lines.slice(titleIndex + 1, titleIndex + 5)) {
    if (isLikelyLocationLine(line)) return line;
  }
  return undefined;
}

function normalizeCandidate(candidate: LeadCandidate): ExtractedEmailLead | undefined {
  const company = cleanCompany(candidate.company ?? "");
  const title = cleanTitle(candidate.title ?? "");
  if (!company || !title || !candidate.url || isGenericLinkLabel(title)) return undefined;
  return {
    body: candidate.body,
    company,
    ...(candidate.from ? { from: candidate.from } : {}),
    ...(candidate.location ? { location: cleanTextPart(candidate.location) } : {}),
    ...(candidate.messageId ? { messageId: candidate.messageId } : {}),
    ...(candidate.postedAt ? { postedAt: candidate.postedAt } : {}),
    sourceName: candidate.sourceName,
    ...(candidate.subject ? { subject: candidate.subject } : {}),
    ...(candidate.threadId ? { threadId: candidate.threadId } : {}),
    title,
    url: candidate.url,
    ...(candidate.workMode ? { workMode: candidate.workMode } : {})
  };
}

function dedupeLeads(leads: ExtractedEmailLead[]): ExtractedEmailLead[] {
  const seen = new Set<string>();
  const deduped: ExtractedEmailLead[] = [];
  for (const lead of leads) {
    const key = [lead.company, lead.title, stripTrackingParams(lead.url)].map(normalizeComparable).join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(lead);
  }
  return deduped;
}

function unwrapTrackingUrl(url: string): string {
  const cleaned = cleanUrl(url);
  try {
    const parsed = new URL(cleaned);
    const redirect = parsed.searchParams.get("redirect");
    if (redirect?.startsWith("http")) return stripTrackingParams(cleanUrl(redirect));
  } catch {
    // Fall through to encoded URL extraction.
  }
  const encodedTarget = cleaned.match(/https?:%2F%2F[^/]+/i)?.[0];
  if (encodedTarget) {
    try {
      return stripTrackingParams(cleanUrl(decodeURIComponent(encodedTarget)));
    } catch {
      return stripTrackingParams(cleaned);
    }
  }
  return stripTrackingParams(cleaned);
}

function stripTrackingParams(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^utm_/i.test(key) || ["ref", "src", "xp", "utm", "campaign"].includes(key.toLowerCase())) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function firstLikelyUrl(body: string): string | undefined {
  return markdownLinks(body).map((link) => unwrapTrackingUrl(link.url)).find(isLikelyJobUrl);
}

function isLikelyJobUrl(url: string): boolean {
  const normalized = url.toLowerCase();
  if (!normalized.startsWith("http")) return false;
  if ([
    "unsubscribe",
    "preferences",
    "privacy",
    "terms",
    "facebook.com",
    "twitter.com",
    "instagram.com",
    "google play",
    "onelink.me",
    "/course/",
    "jobfeed",
    "recommendedjobs",
    "profile?"
  ].some((blocked) => normalized.includes(blocked))) return false;
  return [
    "iimjobs.com/j/",
    "iimjobs.com/one-click-apply",
    "naukri.com/jd/job-listings",
    "naukri.com/aurus/job-listings",
    "linkedin.com/jobs",
    "greenhouse.io",
    "lever.co",
    "myworkdayjobs.com",
    "ashbyhq.com",
    "smartrecruiters.com",
    "workable.com",
    "jobs.",
    "/careers",
    "/jobs",
    "/job/"
  ].some((allowed) => normalized.includes(allowed));
}

function isGenericLinkLabel(value: string): boolean {
  const normalized = normalizeComparable(value);
  return !normalized ||
    [
      "apply",
      "apply now",
      "view apply",
      "view more",
      "browse more jobs",
      "see all matching jobs",
      "view all recommendations",
      "company logo"
    ].includes(normalized);
}

function isTrainingOrCourse(title: string, company: string, url: string): boolean {
  const text = normalizeComparable(`${title} ${company} ${url}`);
  return /\b(course|programme|program|mba|certification|learning|batch)\b/.test(text);
}

function isLikelyCompanyLine(value: string): boolean {
  const normalized = cleanTextPart(value);
  if (!normalized || normalized.length < 2 || normalized.length > 90) return false;
  if (isBoilerplateLine(normalized) || looksLikeRoleLine(normalized) || isLikelyLocationLine(normalized)) return false;
  if (/^\d+(?:\.\d+)?$/.test(normalized)) return false;
  if (/\b(not disclosed|lacs?|yrs?|vacanc|apply|urgent hiring)\b/i.test(normalized)) return false;
  return /[a-z]/i.test(normalized);
}

function isLikelyLocationLine(value: string): boolean {
  const normalized = cleanTextPart(value);
  if (!normalized || normalized.length > 120) return false;
  return /\b(remote|hybrid|bangalore|bengaluru|mumbai|delhi|gurgaon|gurugram|noida|pune|hyderabad|chennai|kolkata|india|singapore|dubai|uae|london|new york|ncr)\b/i.test(normalized);
}

function looksLikeJobTitle(value: string): boolean {
  const normalized = cleanTextPart(value);
  if (!normalized || isGenericLinkLabel(normalized) || isBoilerplateLine(normalized)) return false;
  return /\b(product|director|head|vp|vice president|avp|manager|lead|strategy|operations|portfolio|business|analytics|corporate development|payments|technology|delivery|founder|chief)\b/i.test(normalized);
}

function looksLikeRoleLine(value: string): boolean {
  const normalized = cleanTextPart(value);
  if (!normalized || isGenericLinkLabel(normalized) || isBoilerplateLine(normalized)) return false;
  return /\b(manager|director|head|vp|vice president|avp|lead|chief|founder|officer|executive|specialist|consultant|engineer|developer)\b/i.test(normalized);
}

function isBoilerplateLine(value: string): boolean {
  return /\b(get app|google play|app store|download|facebook|twitter|instagram|unsubscribe|report a problem|copyright|terms|privacy|not disclosed|vacanc|available on|scan to download|hi jai|explore these jobs|below companies|posted|apply now|view more)\b/i.test(value);
}

function workModeFromText(value: string): string | undefined {
  const normalized = normalizeComparable(value);
  if (/\b(remote|work from home|wfh)\b/.test(normalized)) return "remote";
  if (/\bhybrid\b/.test(normalized)) return "hybrid";
  if (/\bonsite|on site|office\b/.test(normalized)) return "onsite";
  return undefined;
}

function leadBody(input: { body: string; link?: MarkdownLink; snippet?: string; subject?: string }): string {
  const parts = [
    input.subject ? `Email subject: ${input.subject}` : "",
    input.snippet ? `Snippet: ${input.snippet}` : "",
    input.link ? contextAround(input.body, input.link.index, 700) : input.body.slice(0, 1200)
  ].filter(Boolean);
  return parts.join("\n\n").slice(0, 4000);
}

function contextAround(text: string, index: number, radius: number): string {
  return text.slice(Math.max(0, index - radius), Math.min(text.length, index + radius)).trim();
}

function cleanTitle(value: string): string {
  return cleanTextPart(value)
    .replace(/[☆★]/g, "")
    .replace(/\(\s*\d+\s*[-+]\s*\d+\s*yrs?\s*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCompany(value: string): string {
  return cleanTextPart(value)
    .replace(/\s+(is hiring|hiring|careers?)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTextPart(value: string): string {
  return normalizeWhitespace(value.replace(/\u034f/g, " ").replace(/\u200c/g, " "));
}

function stripMarkdown(value: string): string {
  return value.replace(/!\[.*?\]\(.*?\)/g, "").replace(/[*_`]/g, "");
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"");
}

function dedupeMarkdownLinks(links: MarkdownLink[]): MarkdownLink[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = `${link.index}|${link.label}|${link.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanUrl(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/[.,;:!?]+$/g, "");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n\s+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeDate(value?: string): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function inferSourceName(from?: string): string {
  const normalized = normalizeComparable(from ?? "");
  if (normalized.includes("iimjobs")) return "Gmail job alert - iimjobs";
  if (normalized.includes("naukri")) return "Gmail job alert - Naukri";
  if (normalized.includes("michaelpage")) return "Gmail job alert - Michael Page";
  if (normalized.includes("linkedin")) return "Gmail job alert - LinkedIn";
  return "Gmail job alert";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
