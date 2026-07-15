#!/usr/bin/env node

/**
 * Durable full-JD captures and fingerprint-bound agent review receipts.
 *
 * Semantic judgment remains with Codex/Claude. This module only proves which
 * deterministic inputs were used and makes an old decision ineffective when
 * the JD, confirmed preferences, candidate evidence, report, or tracker review
 * metadata changes.
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync, mkdirSync, readFileSync, renameSync, writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import yaml from 'js-yaml';
import { parseTrackerRow, resolveColumns } from './tracker-parse.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
export const REVIEW_PROTOCOL_VERSION = 'applycue-agent-review-v1';
export const JD_CAPTURE_SCHEMA = 'applycue-jd-capture-v1';
export const REVIEW_RECEIPT_SCHEMA = 'applycue-review-receipt-v1';

const PREFERENCE_SOURCES = Object.freeze([
  ['config/profile.yml', 'yaml'],
  ['modes/_profile.md', 'text'],
  ['modes/_custom.md', 'text'],
]);
const EVIDENCE_SOURCES = Object.freeze([
  ['cv.md', 'text'],
  ['article-digest.md', 'text'],
]);
const LIVE_STATES = new Set(['live', 'closed', 'unknown']);
const CAPTURE_METHODS = new Set(['agent_browser', 'static_fetch', 'provider_api', 'user_supplied']);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function stableHash(value) {
  return sha256(stableJson(value));
}

function normalizedText(value) {
  return String(value ?? '').normalize('NFKC').replace(/\r\n?/g, '\n').trim();
}

function normalizedExactText(value) {
  return normalizedText(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function canonicalUrl(value) {
  const url = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('The JD source URL must use http or https');
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  return url.href;
}

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'job';
}

function repoRelative(root, target) {
  const rel = relative(root, resolve(target));
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return '';
  return rel.split(sep).join('/');
}

function resolveRepoPath(root, value, allowedRoot) {
  const target = resolve(root, String(value || ''));
  const rel = repoRelative(root, target);
  if (!rel || (allowedRoot && rel !== allowedRoot && !rel.startsWith(`${allowedRoot}/`))) {
    throw new Error(`Path must stay under ${allowedRoot || 'the ApplyCue root'}: ${value}`);
  }
  return { full: target, relative: rel };
}

function trackerPath(root) {
  const preferred = join(root, 'data', 'applications.md');
  if (existsSync(preferred)) return preferred;
  const legacy = join(root, 'applications.md');
  return existsSync(legacy) ? legacy : preferred;
}

function parseMarkdownLink(value) {
  return String(value || '').match(/\[[^\]]+\]\(([^)]+)\)/)?.[1] || '';
}

function trackerContext(root, jobId, explicitTrackerPath = '') {
  const path = explicitTrackerPath ? resolve(explicitTrackerPath) : trackerPath(root);
  if (!existsSync(path)) throw new Error('The application tracker does not exist; record the reviewed job first');
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const columns = resolveColumns(lines);
  const row = lines.map((line) => parseTrackerRow(line, columns)).find((item) => item?.num === Number(jobId));
  if (!row) throw new Error(`Tracker job #${jobId} was not found`);
  const reportLink = parseMarkdownLink(row.report);
  let reportPath = '';
  if (reportLink) {
    const fromTracker = resolve(dirname(path), reportLink);
    const fromRoot = resolve(root, reportLink);
    const candidate = existsSync(fromTracker) ? fromTracker : fromRoot;
    reportPath = repoRelative(root, candidate);
  }
  return { path, row, reportPath };
}

function reportHeader(value, field) {
  return normalizedText(value).match(new RegExp(`^\\*\\*${field}:\\*\\*\\s*(.+?)\\s*$`, 'im'))?.[1]?.trim() || '';
}

function readInputBundle(root, definitions, kind) {
  const files = definitions.map(([path, format]) => {
    const full = join(root, path);
    if (!existsSync(full)) return { path, present: false, sha256: sha256('missing') };
    const raw = normalizedText(readFileSync(full, 'utf8'));
    let canonical = raw;
    if (format === 'yaml') {
      try { canonical = stableJson(yaml.load(raw) ?? null); }
      catch (error) { throw new Error(`Cannot fingerprint invalid ${path}: ${error.message}`); }
    }
    return { path, present: true, sha256: sha256(canonical) };
  });
  return { kind, files, fingerprint: stableHash({ kind, files }) };
}

export function currentDecisionInputs(root = ROOT) {
  const preferences = readInputBundle(root, PREFERENCE_SOURCES, 'confirmed-preferences');
  const evidence = readInputBundle(root, EVIDENCE_SOURCES, 'candidate-evidence');
  return { preferences, evidence };
}

export function parseJdCaptureFile(path) {
  const raw = readFileSync(path, 'utf8');
  const match = raw.match(/^<!-- applycue-jd-capture\n([\s\S]*?)\n-->\n/);
  const marker = '\n<!-- applycue-jd-content -->\n';
  const markerAt = raw.indexOf(marker);
  if (!match || markerAt < 0) throw new Error(`Invalid ApplyCue JD capture: ${path}`);
  let metadata;
  try { metadata = JSON.parse(match[1]); }
  catch { throw new Error(`Invalid ApplyCue JD capture metadata: ${path}`); }
  if (metadata.schemaVersion !== JD_CAPTURE_SCHEMA) throw new Error(`Unsupported JD capture schema: ${metadata.schemaVersion || 'missing'}`);
  const description = normalizedText(raw.slice(markerAt + marker.length));
  const expected = jobContentFingerprint({
    company: metadata.company,
    role: metadata.role,
    sourceUrl: metadata.sourceUrl,
    description,
  });
  if (expected !== metadata.jobContentFingerprint) throw new Error(`JD capture content changed without a new capture: ${path}`);
  return { metadata, description, artifactFingerprint: sha256(normalizedText(raw)) };
}

export function jobContentFingerprint({ company, role, sourceUrl, description }) {
  return stableHash({
    company: normalizedExactText(company),
    role: normalizedExactText(role),
    sourceUrl: canonicalUrl(sourceUrl),
    description: normalizedExactText(description),
  });
}

export function captureFullJd(root = ROOT, options = {}) {
  const jobId = String(options.jobId || '').trim();
  if (!/^\d+$/.test(jobId)) throw new Error('capture needs a numeric tracker job id');
  if (options.confirmedComplete !== true) throw new Error('capture needs confirmedComplete: true after the full visible JD was expanded and read');
  const context = trackerContext(root, jobId, options.trackerPath);
  const company = normalizedText(options.company || context.row.company);
  const role = normalizedText(options.role || context.row.role);
  if (normalizedExactText(company) !== normalizedExactText(context.row.company) || normalizedExactText(role) !== normalizedExactText(context.row.role)) {
    throw new Error('The captured company/role must match the tracker row');
  }
  const report = context.reportPath && existsSync(join(root, context.reportPath))
    ? readFileSync(join(root, context.reportPath), 'utf8') : '';
  const sourceUrl = canonicalUrl(options.sourceUrl || reportHeader(report, 'URL'));
  const finalUrl = options.finalUrl ? canonicalUrl(options.finalUrl) : '';
  const liveState = String(options.liveState || '').trim().toLowerCase();
  const method = String(options.method || '').trim().toLowerCase();
  if (!LIVE_STATES.has(liveState)) throw new Error('liveState must be live, closed, or unknown');
  if (!CAPTURE_METHODS.has(method)) throw new Error(`method must be one of: ${[...CAPTURE_METHODS].join(', ')}`);
  const actorName = normalizedText(options.actorName);
  if (!actorName) throw new Error('capture needs an actor name such as codex or claude');
  const description = normalizedText(options.description);
  const minimumChars = liveState === 'closed' ? 20 : 200;
  if (description.length < minimumChars) throw new Error(`Full JD capture has only ${description.length} characters; capture the expanded description, not a preview`);
  const capturedAt = options.capturedAt || new Date().toISOString();
  if (!Number.isFinite(Date.parse(capturedAt))) throw new Error('capturedAt must be an ISO date/time');
  const fingerprint = jobContentFingerprint({ company, role, sourceUrl, description });
  const metadata = {
    schemaVersion: JD_CAPTURE_SCHEMA,
    jobId,
    company,
    role,
    sourceUrl,
    ...(finalUrl ? { finalUrl } : {}),
    capturedAt,
    actorName,
    liveState,
    method,
    confirmedComplete: true,
    jobContentFingerprint: fingerprint,
  };
  const fileName = `${jobId.padStart(3, '0')}-${slug(company)}-${slug(role)}-${fingerprint.slice(0, 12)}.md`;
  const target = join(root, 'jds', fileName);
  const rendered = `<!-- applycue-jd-capture\n${JSON.stringify(metadata, null, 2)}\n-->\n# Full JD: ${company} — ${role}\n\nSource: ${sourceUrl}\nCaptured: ${capturedAt}\nState: ${liveState}\n\n<!-- applycue-jd-content -->\n${description}\n`;
  mkdirSync(dirname(target), { recursive: true });
  if (!existsSync(target) || readFileSync(target, 'utf8') !== rendered) {
    const temp = `${target}.${randomUUID()}.tmp`;
    writeFileSync(temp, rendered, 'utf8');
    renameSync(temp, target);
  }
  const parsed = parseJdCaptureFile(target);
  return { path: repoRelative(root, target), ...metadata, artifactFingerprint: parsed.artifactFingerprint };
}

function receiptsPath(root, explicit = '') {
  return explicit ? resolve(explicit) : (process.env.APPLYCUE_REVIEW_RECEIPTS || join(root, 'data', 'review-receipts.jsonl'));
}

export function readReviewReceipts(root = ROOT, explicitPath = '') {
  const path = receiptsPath(root, explicitPath);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

export function latestReviewReceipt(root, jobId, explicitPath = '') {
  return readReviewReceipts(root, explicitPath).filter((item) => String(item.jobId) === String(jobId)).at(-1) || null;
}

function resolvedReport(root, context, explicitPath = '') {
  const rel = explicitPath ? resolveRepoPath(root, explicitPath, 'reports').relative : context.reportPath;
  if (!rel || !existsSync(join(root, rel))) throw new Error(`Review report for tracker job #${context.row.num} was not found`);
  return { path: rel, content: normalizedText(readFileSync(join(root, rel), 'utf8')) };
}

function validateReportAgainstTracker(report, row) {
  const decision = reportHeader(report, 'Decision').toLowerCase();
  const rank = reportHeader(report, 'Rank');
  const confidence = reportHeader(report, 'Confidence').toLowerCase();
  if (decision !== row.decision) throw new Error(`Report Decision ${decision || 'missing'} does not match tracker ${row.decision}`);
  if ((rank || '—') !== row.rank) throw new Error(`Report Rank ${rank || 'missing'} does not match tracker ${row.rank}`);
  if (confidence !== row.confidence) throw new Error(`Report Confidence ${confidence || 'missing'} does not match tracker ${row.confidence}`);
  if (!/^## Review receipt\s*$/im.test(report) || !/\*\*Preference basis:\*\*\s*\S/im.test(report)) {
    throw new Error('Report needs a Review receipt with a non-empty Preference basis');
  }
}

function computeDecisionContext(receipt) {
  return stableHash({
    reviewProtocolVersion: receipt.reviewProtocolVersion,
    jobId: receipt.jobId,
    decision: receipt.decision,
    rank: receipt.rank,
    confidence: receipt.confidence,
    jdPath: receipt.jdPath,
    jobContentFingerprint: receipt.jobContentFingerprint,
    jdArtifactFingerprint: receipt.jdArtifactFingerprint,
    preferenceFingerprint: receipt.preferenceFingerprint,
    candidateEvidenceFingerprint: receipt.candidateEvidenceFingerprint,
    reportPath: receipt.reportPath,
    reportFingerprint: receipt.reportFingerprint,
  });
}

export function recordReviewReceipt(root = ROOT, options = {}) {
  const jobId = String(options.jobId || '').trim();
  if (!/^\d+$/.test(jobId)) throw new Error('record needs a numeric tracker job id');
  const actorName = normalizedText(options.actorName);
  if (!actorName) throw new Error('record needs an actor name such as codex or claude');
  const context = trackerContext(root, jobId, options.trackerPath);
  if (context.row.origin !== 'current') throw new Error('Only a current ApplyCue review can receive a new decision receipt');
  if (context.row.decision === 'pending') throw new Error('A pending tracker row has no final agent decision to bind');
  if (context.row.decision === 'apply' && context.row.rank === '—') throw new Error('An apply decision needs an explicit rank before it can be bound');
  if (!['high', 'medium', 'low'].includes(context.row.confidence)) throw new Error('A new decision receipt needs high, medium, or low confidence');
  const jd = resolveRepoPath(root, options.jdPath, 'jds');
  if (!existsSync(jd.full)) throw new Error(`JD capture was not found: ${jd.relative}`);
  const capture = parseJdCaptureFile(jd.full);
  if (String(capture.metadata.jobId) !== jobId) throw new Error('JD capture belongs to a different tracker job');
  if (normalizedExactText(capture.metadata.company) !== normalizedExactText(context.row.company) || normalizedExactText(capture.metadata.role) !== normalizedExactText(context.row.role)) {
    throw new Error('JD capture company/role no longer matches the tracker row');
  }
  if (capture.metadata.confirmedComplete !== true || capture.metadata.liveState !== 'live') {
    throw new Error('A final decision requires a confirmed-complete live JD capture');
  }
  const report = resolvedReport(root, context, options.reportPath);
  validateReportAgainstTracker(report.content, context.row);
  if (canonicalUrl(reportHeader(report.content, 'URL')) !== canonicalUrl(capture.metadata.sourceUrl)) {
    throw new Error('Report URL does not match the captured full JD source URL');
  }
  const { preferences, evidence } = currentDecisionInputs(root);
  if (!preferences.files.some((file) => file.present)) throw new Error('No confirmed preference file exists; complete setup before recording a decision');
  if (!evidence.files.find((file) => file.path === 'cv.md')?.present) throw new Error('cv.md is missing; a decision cannot be bound without the candidate baseline');
  const receipt = {
    schemaVersion: REVIEW_RECEIPT_SCHEMA,
    id: randomUUID(),
    jobId,
    actorName,
    recordedAt: options.recordedAt || new Date().toISOString(),
    reviewProtocolVersion: REVIEW_PROTOCOL_VERSION,
    decision: context.row.decision,
    rank: context.row.rank,
    confidence: context.row.confidence,
    jdPath: jd.relative,
    jobContentFingerprint: capture.metadata.jobContentFingerprint,
    jdArtifactFingerprint: capture.artifactFingerprint,
    preferenceFingerprint: preferences.fingerprint,
    preferenceSources: preferences.files,
    candidateEvidenceFingerprint: evidence.fingerprint,
    candidateEvidenceSources: evidence.files,
    reportPath: report.path,
    reportFingerprint: sha256(report.content),
  };
  receipt.decisionContextFingerprint = computeDecisionContext(receipt);
  const prior = latestReviewReceipt(root, jobId, options.receiptsPath);
  if (prior?.decisionContextFingerprint === receipt.decisionContextFingerprint) return { ...prior, unchanged: true };
  const path = receiptsPath(root, options.receiptsPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(receipt)}\n`, { flag: 'a', encoding: 'utf8' });
  return { ...receipt, unchanged: false };
}

export function reviewFreshnessForRow(root = ROOT, row, options = {}) {
  if (!row) return { state: 'missing', effectiveDecision: 'pending', effectiveRank: '—', issues: ['Tracker row is missing'] };
  if (row.origin !== 'current') return { state: 'not_required', effectiveDecision: row.decision, effectiveRank: row.rank, issues: [] };
  if (row.decision === 'pending') return { state: 'pending', effectiveDecision: 'pending', effectiveRank: '—', issues: [] };
  const receipt = latestReviewReceipt(root, row.num, options.receiptsPath);
  if (!receipt) return { state: 'missing', effectiveDecision: 'pending', effectiveRank: '—', issues: ['No fingerprint-bound review receipt'] };
  const issues = [];
  if (receipt.schemaVersion !== REVIEW_RECEIPT_SCHEMA) issues.push('Unsupported review receipt schema');
  if (receipt.reviewProtocolVersion !== REVIEW_PROTOCOL_VERSION) issues.push('Review protocol changed');
  if (receipt.decision !== row.decision) issues.push('Tracker decision changed');
  if (receipt.rank !== row.rank) issues.push('Tracker rank changed');
  if (receipt.confidence !== row.confidence) issues.push('Tracker confidence changed');
  let context;
  try { context = trackerContext(root, row.num, options.trackerPath); }
  catch (error) { issues.push(error.message); }
  if (context) {
    try {
      const report = resolvedReport(root, context);
      if (report.path !== receipt.reportPath) issues.push('Tracker report link changed');
      if (sha256(report.content) !== receipt.reportFingerprint) issues.push('Review report changed');
      validateReportAgainstTracker(report.content, row);
    } catch (error) { issues.push(error.message); }
  }
  try {
    const jd = resolveRepoPath(root, receipt.jdPath, 'jds');
    if (!existsSync(jd.full)) issues.push('Full JD capture is missing');
    else {
      const capture = parseJdCaptureFile(jd.full);
      if (capture.metadata.jobContentFingerprint !== receipt.jobContentFingerprint) issues.push('Full JD content changed');
      if (capture.artifactFingerprint !== receipt.jdArtifactFingerprint) issues.push('Full JD capture changed');
    }
  } catch (error) { issues.push(error.message); }
  try {
    const { preferences, evidence } = currentDecisionInputs(root);
    if (preferences.fingerprint !== receipt.preferenceFingerprint) issues.push('Confirmed preferences changed');
    if (evidence.fingerprint !== receipt.candidateEvidenceFingerprint) issues.push('Candidate evidence changed');
  } catch (error) { issues.push(error.message); }
  if (issues.length === 0 && computeDecisionContext(receipt) !== receipt.decisionContextFingerprint) {
    issues.push('Review receipt contents changed');
  }
  return {
    state: issues.length ? 'stale' : 'current',
    effectiveDecision: issues.length ? 'pending' : row.decision,
    effectiveRank: issues.length ? '—' : row.rank,
    issues: [...new Set(issues)],
    receipt,
  };
}

export function reviewFreshnessForJob(root = ROOT, jobId, options = {}) {
  const context = trackerContext(root, jobId, options.trackerPath);
  return { row: context.row, ...reviewFreshnessForRow(root, context.row, options) };
}

export function assertCurrentReview(root = ROOT, jobId, options = {}) {
  const result = reviewFreshnessForJob(root, jobId, options);
  if (result.state !== 'current' || result.effectiveDecision !== 'apply') {
    const detail = result.issues?.join('; ') || `effective decision is ${result.effectiveDecision}`;
    throw new Error(`Job #${jobId} needs a current fingerprint-bound apply review before application: ${detail}`);
  }
  return result;
}

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.slice(3).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || '';
}

function usage() {
  console.error('Usage:\n  node review-evidence.mjs capture --job=N --input=full-jd.txt --url=https://... --actor=codex --live-state=live --method=agent_browser --confirmed-complete\n  node review-evidence.mjs record --job=N --jd=jds/capture.md --actor=codex\n  node review-evidence.mjs check --job=N [--json]');
}

function main() {
  const command = process.argv[2];
  if (command === 'capture') {
    const input = option('input');
    if (!input || !existsSync(resolve(input))) throw new Error('capture needs --input=<full-JD text or Markdown file>');
    const result = captureFullJd(ROOT, {
      jobId: option('job'), sourceUrl: option('url'), finalUrl: option('final-url'),
      actorName: option('actor'), liveState: option('live-state'), method: option('method'),
      confirmedComplete: process.argv.includes('--confirmed-complete'),
      description: readFileSync(resolve(input), 'utf8'),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === 'record') {
    const result = recordReviewReceipt(ROOT, {
      jobId: option('job'), jdPath: option('jd'), reportPath: option('report'), actorName: option('actor'),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === 'check') {
    const result = reviewFreshnessForJob(ROOT, option('job'));
    console.log(JSON.stringify(result, null, 2));
    if (result.state !== 'current' && result.state !== 'pending' && result.state !== 'not_required') process.exitCode = 2;
    return;
  }
  usage();
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(error.message); process.exit(1); }
}
