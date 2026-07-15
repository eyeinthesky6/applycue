#!/usr/bin/env node

/**
 * Reusable application answers and live-form preflight receipts.
 *
 * The external agent inspects the browser and owns semantic judgment. This
 * helper stores only user-approved reusable values and checks objective handoff
 * facts before the existing application-attempt owner is allowed to start.
 */

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import yaml from 'js-yaml';
import { assertCurrentCvBundle } from './cv-bundle.mjs';
import { assertCurrentReview } from './review-evidence.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PREFLIGHT_MAX_AGE_MS = 30 * 60_000;
const PAGE_STAGES = new Set(['application_form', 'job_page', 'closed', 'confirmation', 'unknown']);
const LIVENESS_STATES = new Set(['active', 'closed', 'unknown']);
const FIELD_TYPES = new Set(['text', 'textarea', 'select', 'radio', 'checkbox', 'number', 'file', 'unknown']);
const RESOLUTIONS = new Set(['profile', 'approved_answer', 'user_confirmed_once', 'agent_draft', 'selected_cv', 'approved_file', 'missing']);

function answerLedgerPath(root) {
  return process.env.APPLYCUE_APPLICATION_ANSWERS || resolve(root, 'data', 'application-answers.jsonl');
}

function preflightLedgerPath(root) {
  return process.env.APPLYCUE_APPLICATION_PREFLIGHTS || resolve(root, 'data', 'application-preflights.jsonl');
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch { throw new Error(`Invalid JSONL record at ${path}:${index + 1}`); }
  });
}

function appendJsonl(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value)}\n`, { flag: 'a', encoding: 'utf8' });
  return value;
}

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function unique(values) {
  return [...new Set((values || []).map(clean).filter(Boolean))];
}

export function canonicalApplicationUrl(value) {
  const url = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Application URL must use http(s)');
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  return url.href;
}

export function normalizedApplicationIdentity(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function canonicalField(value) {
  return clean(value).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100);
}

function comparableField(value) {
  return canonicalField(value).replace(/_/g, '');
}

function isBlockedReusableField(value) {
  return /password|passcode|\botp\b|one[-\s]?time|token|secret|cookie|session|credit\s*card|card\s*number|\bcvv\b|bank\s*account|passport|national\s*id|identity\s*(document|number)|driver.?s?\s*licen[cs]e|tax\s*id|\bssn\b|social\s*security|aadhaa?r|\bpan\s*(number|card)?\b/i.test(value);
}

function isSensitiveFormField(value) {
  return /work\s*authori[sz]|right\s*to\s*work|visa|sponsor|relocat|salary|compensation|\bctc\b|gender|race|ethnic|disab|veteran|background\s*check|criminal|self[-\s]?identif|marital|religion|sexual\s*orientation|date\s*of\s*birth|\bage\b|passport|national\s*id|aadhaa?r|\bpan\b/i.test(value);
}

export function readApprovedApplicationAnswers(root = ROOT) {
  const byField = new Map();
  for (const event of readJsonl(answerLedgerPath(root))) {
    if (!event?.field) continue;
    if (event.action === 'revoke') byField.delete(event.field);
    else if (event.action === 'approve') byField.set(event.field, event);
  }
  return [...byField.values()].sort((left, right) => left.field.localeCompare(right.field));
}

export function applicationAnswersFingerprint(root = ROOT) {
  const stable = readApprovedApplicationAnswers(root).map((answer) => ({
    field: answer.field,
    valueSha256: answer.valueSha256,
    aliases: [...(answer.aliases || [])].sort(),
  }));
  return hash(stableJson(stable));
}

function findApprovedAnswer(answers, field, label = '') {
  const wanted = new Set([field, label].map(comparableField).filter(Boolean));
  return answers.find((answer) => [answer.field, ...(answer.aliases || [])]
    .map(comparableField).some((candidate) => wanted.has(candidate)));
}

export function approveApplicationAnswer(root, {
  field, value, aliases = [], actor = 'agent', sourceRef = '', approvedByUser = false, replaceExisting = false,
}, { now = () => new Date() } = {}) {
  const canonical = canonicalField(field);
  const answerValue = clean(value);
  const cleanAliases = unique(aliases);
  if (!canonical || !answerValue) throw new Error('Reusable answer needs both field and value');
  if (!approvedByUser) throw new Error('Explicit user approval is required before saving a reusable answer');
  if (isBlockedReusableField([field, ...cleanAliases].join(' '))) {
    throw new Error('Passwords, OTPs, tokens, payment data, and identity-document numbers cannot be stored as reusable answers');
  }
  const existing = readApprovedApplicationAnswers(root).find((answer) => answer.field === canonical);
  if (existing && existing.value !== answerValue && !replaceExisting) {
    throw new Error('A different approved answer already exists for this field; use --replace only after the user approves the change');
  }
  return appendJsonl(answerLedgerPath(root), {
    id: randomUUID(),
    action: 'approve',
    field: canonical,
    value: answerValue,
    valueSha256: hash(answerValue),
    aliases: unique([...(existing?.aliases || []), ...cleanAliases]),
    approvedByUser: true,
    actor: clean(actor) || 'agent',
    ...(clean(sourceRef) ? { sourceRef: clean(sourceRef) } : {}),
    createdAt: now().toISOString(),
  });
}

export function revokeApplicationAnswer(root, { field, actor = 'agent', approvedByUser = false }, { now = () => new Date() } = {}) {
  const canonical = canonicalField(field);
  if (!canonical) throw new Error('Reusable answer field is required');
  if (!approvedByUser) throw new Error('Explicit user approval is required before removing a reusable answer');
  if (!readApprovedApplicationAnswers(root).some((answer) => answer.field === canonical)) {
    throw new Error(`No approved reusable answer exists for ${canonical}`);
  }
  return appendJsonl(answerLedgerPath(root), {
    id: randomUUID(), action: 'revoke', field: canonical, actor: clean(actor) || 'agent',
    approvedByUser: true, createdAt: now().toISOString(),
  });
}

function normalizeRequired(value) {
  if (value === true || value === 'yes') return 'yes';
  if (value === false || value === 'no') return 'no';
  return 'unknown';
}

function readProfile(root) {
  const path = resolve(root, 'config', 'profile.yml');
  if (!existsSync(path)) return null;
  try { return yaml.load(readFileSync(path, 'utf8')) || {}; }
  catch { return null; }
}

function valueAtPath(value, dotPath) {
  return clean(dotPath).split('.').filter(Boolean).reduce((current, key) => current?.[key], value);
}

function normalizeFieldEvidence(input, index, context) {
  const field = canonicalField(input?.field || input?.name || input?.label || `unlabelled_${index + 1}`);
  const label = clean(input?.label || input?.name || field);
  const type = FIELD_TYPES.has(input?.type) ? input.type : 'unknown';
  const required = normalizeRequired(input?.required);
  const resolution = RESOLUTIONS.has(input?.resolution) ? input.resolution : 'missing';
  const sourceRef = clean(input?.sourceRef);
  const sensitive = isSensitiveFormField(`${field} ${label}`);
  const reasons = [];
  let resolved = resolution !== 'missing';

  if (!field || !label) reasons.push(`Visible field ${index + 1} has no usable identity`);
  if (resolution === 'profile') {
    const profileValue = valueAtPath(context.profile, sourceRef);
    if (profileValue === undefined || profileValue === null || clean(String(profileValue)) === '') {
      resolved = false;
      reasons.push(`${label} points to missing profile value ${sourceRef || '(none)'}`);
    }
  }
  if (resolution === 'approved_answer') {
    const answer = findApprovedAnswer(context.answers, sourceRef || field, label);
    if (!answer) {
      resolved = false;
      reasons.push(`${label} has no current user-approved reusable answer`);
    }
  }
  if (resolution === 'user_confirmed_once' && !sourceRef) {
    resolved = false;
    reasons.push(`${label} needs a user-confirmation reference for this application`);
  }
  if (resolution === 'agent_draft' && sensitive) {
    resolved = false;
    reasons.push(`${label} is sensitive and cannot be answered from agent inference`);
  }
  if (resolution === 'selected_cv' && type !== 'file') {
    resolved = false;
    reasons.push(`${label} is not a file field but was mapped to the selected CV`);
  }
  if (type === 'file' && !['selected_cv', 'approved_file', 'missing'].includes(resolution)) {
    resolved = false;
    reasons.push(`${label} needs the selected CV or another explicitly approved file`);
  }
  if ((required === 'yes' || required === 'unknown') && !resolved) {
    reasons.push(`${label} is required or may be required and remains unresolved`);
  }

  return { field, label, type, required, resolution, ...(sourceRef ? { sourceRef } : {}), sensitive, resolved, reasons };
}

function validateExpectedIdentity(review, input) {
  if (!review?.row) return;
  if (normalizedApplicationIdentity(review.row.company) !== normalizedApplicationIdentity(input.company) ||
      normalizedApplicationIdentity(review.row.role) !== normalizedApplicationIdentity(input.title)) {
    throw new Error('Preflight company/title does not match the current reviewed tracker job');
  }
}

export function readApplicationPreflights(root = ROOT) {
  return readJsonl(preflightLedgerPath(root));
}

export function latestApplicationPreflight(root, jobId) {
  return readApplicationPreflights(root).filter((receipt) => String(receipt.jobId) === String(jobId)).at(-1) || null;
}

export function validateAttemptPreflightLink(start, preflight) {
  const issues = [];
  if (!preflight) return ['matching preflight receipt is missing'];
  if (preflight.status !== 'ready') issues.push(`preflight status is ${preflight.status || 'missing'}`);
  if (String(preflight.jobId) !== String(start.jobId) ||
      normalizedApplicationIdentity(preflight.company) !== normalizedApplicationIdentity(start.company) ||
      normalizedApplicationIdentity(preflight.title) !== normalizedApplicationIdentity(start.title)) {
    issues.push('job/company/title identity differs');
  }
  try {
    if (canonicalApplicationUrl(preflight.url) !== canonicalApplicationUrl(start.url)) issues.push('application URL differs');
  } catch {
    issues.push('application URL is invalid');
  }
  const preflightTime = Date.parse(preflight.createdAt);
  const startTime = Date.parse(start.createdAt);
  const expiryTime = Date.parse(preflight.expiresAt);
  if (![preflightTime, startTime, expiryTime].every(Number.isFinite) || startTime < preflightTime || startTime > expiryTime) {
    issues.push('attempt did not start inside the preflight validity window');
  }
  if (preflight.cvSha256 !== start.cvSha256) issues.push('selected CV hash differs');
  if (preflight.answersFingerprint !== start.preflightAnswersFingerprint) issues.push('approved-answer fingerprint differs');
  return issues;
}

export async function recordApplicationPreflight(root, input, {
  reviewVerifier = assertCurrentReview, bundleVerifier = assertCurrentCvBundle, now = () => new Date(),
} = {}) {
  if (!/^\d+$/.test(String(input.jobId || '')) || !clean(input.company) || !clean(input.title)) {
    throw new Error('jobId, company, and title are required for application preflight');
  }
  const url = canonicalApplicationUrl(input.url);
  if (!clean(input.cvPath)) throw new Error('The exact selected PDF or DOCX is required for application preflight');
  const review = reviewVerifier(root, input.jobId);
  validateExpectedIdentity(review, input);
  const bundle = await bundleVerifier(root, input.jobId, { selectedPath: input.cvPath });
  if (!bundle?.selectedArtifact?.sha256 || !bundle?.manifest?.bundleFingerprint) {
    throw new Error('The selected CV is not bound to a current verified bundle');
  }

  const stage = PAGE_STAGES.has(input.pageStage) ? input.pageStage : 'unknown';
  const liveness = LIVENESS_STATES.has(input.liveness) ? input.liveness : 'unknown';
  const answers = readApprovedApplicationAnswers(root);
  const profile = readProfile(root);
  const fields = Array.isArray(input.fields)
    ? input.fields.map((field, index) => normalizeFieldEvidence(field, index, { answers, profile }))
    : [];
  const reasons = [];
  if (stage !== 'application_form') reasons.push(`Current page stage is ${stage}, not an application form`);
  if (liveness !== 'active') reasons.push(`Posting liveness is ${liveness}, not confirmed active`);
  if (input.identityConfirmedByAgent !== true) reasons.push('The agent has not confirmed the visible company and role against the selected job');
  if (!clean(input.visibleCompany) || !clean(input.visibleTitle)) reasons.push('The visible company and role were not recorded from the live page');
  if (input.allVisibleFieldsCaptured !== true) reasons.push('The agent has not confirmed that every currently visible field was captured');
  if (input.inspectionOnly !== true) reasons.push('Preflight must inspect without filling, uploading, or submitting');
  if (fields.length === 0) reasons.push('No visible application-form fields were captured');
  const fieldReasons = fields.flatMap((field) => field.reasons);
  reasons.push(...fieldReasons);
  const evidenceRefs = unique(input.evidenceRefs);
  if (evidenceRefs.length === 0) reasons.push('At least one durable browser evidence reference is required');
  const actor = clean(input.actor);
  const tool = clean(input.tool);
  if (!actor || !tool) reasons.push('The inspecting agent and browser tool must be recorded');
  const timestamp = now();
  const createdAt = timestamp.toISOString();
  const status = reasons.length === 0 ? 'ready' : 'pause';
  return appendJsonl(preflightLedgerPath(root), {
    id: randomUUID(),
    status,
    jobId: String(input.jobId),
    company: clean(input.company),
    title: clean(input.title),
    url,
    visibleUrl: clean(input.visibleUrl) ? canonicalApplicationUrl(input.visibleUrl) : url,
    visibleCompany: clean(input.visibleCompany),
    visibleTitle: clean(input.visibleTitle),
    pageStage: stage,
    liveness,
    identityConfirmedByAgent: input.identityConfirmedByAgent === true,
    allVisibleFieldsCaptured: input.allVisibleFieldsCaptured === true,
    inspectionOnly: input.inspectionOnly === true,
    actor,
    tool,
    evidenceRefs,
    fields: fields.map(({ reasons: _reasons, ...field }) => field),
    reasons,
    reviewReceiptId: bundle.manifest.reviewReceiptId,
    jdContentFingerprint: bundle.manifest.jdContentFingerprint,
    cvPath: bundle.selectedArtifact.path,
    cvKind: bundle.selectedArtifact.kind,
    cvSha256: bundle.selectedArtifact.sha256,
    cvBundleFingerprint: bundle.manifest.bundleFingerprint,
    answersFingerprint: applicationAnswersFingerprint(root),
    createdAt,
    expiresAt: new Date(timestamp.getTime() + PREFLIGHT_MAX_AGE_MS).toISOString(),
  });
}

export async function assertCurrentApplicationPreflight(root, input, {
  reviewVerifier = assertCurrentReview, bundleVerifier = assertCurrentCvBundle, now = () => new Date(),
} = {}) {
  const receipt = latestApplicationPreflight(root, input.jobId);
  if (!receipt) throw new Error('No live-form preflight exists for this job');
  if (receipt.status !== 'ready') throw new Error(`Live-form preflight is paused: ${receipt.reasons.join('; ')}`);
  const currentTime = now().getTime();
  if (!Number.isFinite(Date.parse(receipt.expiresAt)) || currentTime > Date.parse(receipt.expiresAt)) {
    throw new Error('Live-form preflight is older than 30 minutes; inspect the current form again');
  }
  if (receipt.jobId !== String(input.jobId) ||
      normalizedApplicationIdentity(receipt.company) !== normalizedApplicationIdentity(input.company) ||
      normalizedApplicationIdentity(receipt.title) !== normalizedApplicationIdentity(input.title) ||
      canonicalApplicationUrl(receipt.url) !== canonicalApplicationUrl(input.url)) {
    throw new Error('Live-form preflight belongs to a different job, company, title, or URL');
  }
  const review = reviewVerifier(root, input.jobId);
  validateExpectedIdentity(review, input);
  const bundle = await bundleVerifier(root, input.jobId, { selectedPath: input.cvPath });
  if (bundle.selectedArtifact.path !== receipt.cvPath ||
      bundle.selectedArtifact.sha256 !== receipt.cvSha256 ||
      bundle.manifest.bundleFingerprint !== receipt.cvBundleFingerprint ||
      bundle.manifest.reviewReceiptId !== receipt.reviewReceiptId ||
      bundle.manifest.jdContentFingerprint !== receipt.jdContentFingerprint) {
    throw new Error('Review, JD, or selected CV changed after live-form preflight');
  }
  if (applicationAnswersFingerprint(root) !== receipt.answersFingerprint) {
    throw new Error('Approved reusable answers changed after live-form preflight');
  }
  return receipt;
}

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.slice(3).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || '';
}

function options(name) {
  const prefix = `--${name}=`;
  return process.argv.slice(3).filter((arg) => arg.startsWith(prefix)).map((arg) => arg.slice(prefix.length));
}

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}

function readFieldsFile(value) {
  if (!value) throw new Error('--fields-file=<json> is required');
  const parsed = JSON.parse(readFileSync(resolve(ROOT, value), 'utf8'));
  return Array.isArray(parsed) ? parsed : parsed.fields;
}

async function main() {
  const command = process.argv[2];
  if (command === 'approve-answer') {
    print(approveApplicationAnswer(ROOT, {
      field: option('field'), value: option('value'), aliases: options('alias'), actor: option('actor'),
      sourceRef: option('source'), approvedByUser: process.argv.includes('--approved-by-user'),
      replaceExisting: process.argv.includes('--replace'),
    }));
    return;
  }
  if (command === 'revoke-answer') {
    print(revokeApplicationAnswer(ROOT, {
      field: option('field'), actor: option('actor'), approvedByUser: process.argv.includes('--approved-by-user'),
    }));
    return;
  }
  if (command === 'answers') {
    print({ fingerprint: applicationAnswersFingerprint(ROOT), answers: readApprovedApplicationAnswers(ROOT) });
    return;
  }
  if (command === 'record') {
    print(await recordApplicationPreflight(ROOT, {
      jobId: option('job'), company: option('company'), title: option('title'), url: option('url'), cvPath: option('cv'),
      visibleUrl: option('visible-url'), visibleCompany: option('visible-company'), visibleTitle: option('visible-title'),
      pageStage: option('stage'), liveness: option('liveness'), actor: option('actor'), tool: option('tool'),
      identityConfirmedByAgent: process.argv.includes('--identity-confirmed-by-agent'),
      allVisibleFieldsCaptured: process.argv.includes('--all-visible-fields-captured'),
      inspectionOnly: process.argv.includes('--inspection-only'), evidenceRefs: options('evidence'),
      fields: readFieldsFile(option('fields-file')),
    }));
    return;
  }
  if (command === 'check') {
    print(await assertCurrentApplicationPreflight(ROOT, {
      jobId: option('job'), company: option('company'), title: option('title'), url: option('url'), cvPath: option('cv'),
    }));
    return;
  }
  console.error('Usage:\n  node application-preflight.mjs approve-answer --field=... --value=... [--alias=...] --actor=codex --approved-by-user [--replace]\n  node application-preflight.mjs revoke-answer --field=... --actor=codex --approved-by-user\n  node application-preflight.mjs answers\n  node application-preflight.mjs record --job=N --company=... --title=... --url=https://... --visible-url=https://... --visible-company=... --visible-title=... --cv=output/verified.pdf --stage=application_form --liveness=active --actor=codex --tool=chrome --fields-file=data/application-preflight-input.json --evidence=... --identity-confirmed-by-agent --all-visible-fields-captured --inspection-only\n  node application-preflight.mjs check --job=N --company=... --title=... --url=https://... --cv=output/verified.pdf');
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
