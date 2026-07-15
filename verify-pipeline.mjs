#!/usr/bin/env node
/**
 * verify-pipeline.mjs — Health check for ApplyCue pipeline integrity
 *
 * Checks:
 * 1. All statuses are canonical (per states.yml)
 * 2. No duplicate company+role entries
 * 3. All report links point to existing files
 * 4. Legacy score cells remain readable (X.XX/5, N/A, DUP, or em dash)
 * 5. All rows have proper pipe-delimited format
 * 6. No pending TSVs in tracker-additions/ (only in merged/ or archived/)
 * 7. states.yml canonical IDs for cross-system consistency
 *
 * Run: node ApplyCue/verify-pipeline.mjs
 */

import { readFileSync, readdirSync, existsSync, mkdirSync, unlinkSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CONFIDENCES, DECISIONS, ORIGINS, parseTrackerRow, resolveColumns } from './tracker-parse.mjs';
import { cvBundleFreshnessForJob } from './cv-bundle.mjs';
import { reviewFreshnessForRow } from './review-evidence.mjs';
import { validateAttemptPreflightLink } from './application-preflight.mjs';
import { assertNoBlockingJobActions } from './job-feedback.mjs';

const APPLYCUE = dirname(fileURLToPath(import.meta.url));
// Support both layouts: data/applications.md (boilerplate) and applications.md (original).
// APPLYCUE_TRACKER overrides the path (used by tests and non-standard layouts).
const APPS_FILE = process.env.APPLYCUE_TRACKER
  ? process.env.APPLYCUE_TRACKER
  : existsSync(join(APPLYCUE, 'data/applications.md'))
    ? join(APPLYCUE, 'data/applications.md')
    : join(APPLYCUE, 'applications.md');
const ADDITIONS_DIR = join(APPLYCUE, 'batch/tracker-additions');
const REPORTS_DIR = join(APPLYCUE, 'reports');
const STATES_FILE = existsSync(join(APPLYCUE, 'templates/states.yml'))
  ? join(APPLYCUE, 'templates/states.yml')
  : join(APPLYCUE, 'states.yml');

// Ensure required directories exist (fresh setup)
mkdirSync(join(APPLYCUE, 'data'), { recursive: true });
mkdirSync(REPORTS_DIR, { recursive: true });

const CANONICAL_STATUSES = [
  'evaluated', 'applied', 'responded', 'interview',
  'offer', 'rejected', 'discarded', 'skip',
];

const ALIASES = {
  'evaluada': 'evaluated', 'condicional': 'evaluated', 'hold': 'evaluated', 'evaluar': 'evaluated', 'verificar': 'evaluated',
  'aplicado': 'applied', 'enviada': 'applied', 'aplicada': 'applied', 'applied': 'applied', 'sent': 'applied',
  'respondido': 'responded',
  'entrevista': 'interview',
  'oferta': 'offer',
  'rechazado': 'rejected', 'rechazada': 'rejected',
  'descartado': 'discarded', 'descartada': 'discarded', 'cerrada': 'discarded', 'cancelada': 'discarded',
  'no aplicar': 'skip', 'no_aplicar': 'skip', 'monitor': 'skip', 'geo blocker': 'skip',
};

let errors = 0;
let warnings = 0;

function error(msg) { console.log(`❌ ${msg}`); errors++; }
function warn(msg) { console.log(`⚠️  ${msg}`); warnings++; }
function ok(msg) { console.log(`✅ ${msg}`); }

// --- Read applications.md ---
if (!existsSync(APPS_FILE)) {
  console.log('\n📊 No applications.md found. This is normal for a fresh setup.');
  console.log('   The file will be created when you evaluate your first offer.\n');
  process.exit(0);
}
const content = readFileSync(APPS_FILE, 'utf-8');
const lines = content.split('\n');

// Shared header-name mapping keeps every reader on the same tracker contract.
const COLMAP = resolveColumns(lines);
const MAX_IDX = Math.max(...Object.values(COLMAP));

const entries = lines.map((line) => parseTrackerRow(line, COLMAP)).filter(Boolean);

console.log(`\n📊 Checking ${entries.length} entries in applications.md\n`);

// --- Check 1: Canonical statuses ---
let badStatuses = 0;
for (const e of entries) {
  const clean = e.status.replace(/\*\*/g, '').trim().toLowerCase();
  // Strip trailing dates
  const statusOnly = clean.replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();

  if (!CANONICAL_STATUSES.includes(statusOnly) && !ALIASES[statusOnly]) {
    error(`#${e.num}: Non-canonical status "${e.status}"`);
    badStatuses++;
  }

  // Check for markdown bold in status
  if (e.status.includes('**')) {
    error(`#${e.num}: Status contains markdown bold: "${e.status}"`);
    badStatuses++;
  }

  // Check for dates in status
  if (/\d{4}-\d{2}-\d{2}/.test(e.status)) {
    error(`#${e.num}: Status contains date: "${e.status}" — dates go in date column`);
    badStatuses++;
  }
}
if (badStatuses === 0) ok('All statuses are canonical');

// Decision is semantic; Status is application lifecycle. Evaluated alone must
// never be treated as shortlisted. Origin is provenance and only non-current
// rows are labelled in the dashboard.
let badMetadata = 0;
if (COLMAP.decision == null || COLMAP.rank == null || COLMAP.confidence == null || COLMAP.origin == null) {
  warn('Tracker predates Decision/Rank/Confidence/Origin metadata; run `node tracker.mjs migrate-metadata` and classify current/imported IDs before relying on dashboard counts');
} else {
  for (const e of entries) {
    const parts = e.raw.split('|').map((value) => value.trim().toLowerCase());
    const rawDecision = parts[COLMAP.decision] || '';
    const rawRank = parts[COLMAP.rank] || '';
    const rawConfidence = parts[COLMAP.confidence] || '';
    const rawOrigin = parts[COLMAP.origin] || '';
    if (!DECISIONS.includes(rawDecision)) { error(`#${e.num}: Invalid decision "${rawDecision}"`); badMetadata++; }
    if (rawRank !== '—' && !/^[1-9]\d*$/.test(rawRank)) { error(`#${e.num}: Rank must be a positive integer or —`); badMetadata++; }
    if (!CONFIDENCES.includes(rawConfidence)) { error(`#${e.num}: Invalid confidence "${rawConfidence}"`); badMetadata++; }
    if (!ORIGINS.includes(rawOrigin)) { error(`#${e.num}: Invalid origin "${rawOrigin}"`); badMetadata++; }
    if (rawOrigin === 'current' && rawDecision === 'apply' && rawRank === '—') {
      warn(`#${e.num}: Current apply decision is waiting for an explicit cross-role agent rank`);
    }
  }
}
if (badMetadata === 0 && COLMAP.decision != null && COLMAP.rank != null && COLMAP.confidence != null && COLMAP.origin != null) ok('All review metadata is canonical');

// A stored semantic decision is effective only while its deterministic review
// inputs still match the fingerprint-bound receipt.
let badReviewReceipts = 0;
const completedApplicationStatuses = new Set(['applied', 'responded', 'interview', 'offer', 'rejected']);
for (const entry of entries.filter((item) => item.origin === 'current' && item.decision !== 'pending' && !completedApplicationStatuses.has(item.status.toLowerCase()))) {
  const review = reviewFreshnessForRow(APPLYCUE, entry, { trackerPath: APPS_FILE });
  if (review.state !== 'current') {
    error(`#${entry.num}: Review is ${review.state}; effective decision is pending (${review.issues.join('; ')})`);
    badReviewReceipts++;
  }
}
if (badReviewReceipts === 0) ok('All current final decisions have fresh full-JD review receipts');

// A current row that claims its CV is prepared must point to one complete,
// fingerprint-bound MD/HTML/PDF/DOCX bundle. Shortlisted rows without a CV yet
// may remain in preparation; application-attempt.mjs enforces the bundle gate.
let badCvBundles = 0;
for (const entry of entries.filter((item) =>
  item.origin === 'current' && item.decision === 'apply' && item.pdf.includes('✅') &&
  !completedApplicationStatuses.has(item.status.toLowerCase()))) {
  const bundle = await cvBundleFreshnessForJob(APPLYCUE, entry.num, { trackerPath: APPS_FILE });
  if (bundle.state !== 'current') {
    error(`#${entry.num}: Prepared CV bundle is ${bundle.state} (${bundle.issues.join('; ')})`);
    badCvBundles++;
  } else {
    try {
      assertNoBlockingJobActions(APPLYCUE, entry.num, bundle.manifest.bundleFingerprint);
    } catch (feedbackError) {
      error(feedbackError.message);
      badCvBundles++;
    }
  }
}
if (badCvBundles === 0) ok('All current prepared apply decisions have verified CV bundles and no unresolved user stop/change actions');

// Attempt receipts and tracker lifecycle must agree for the same current job.
// Unknown/failed/abandoned attempts never prove an application was accepted;
// confirmed attempts must be reflected in the canonical lifecycle.
let badAttemptReconciliation = 0;
const attemptsPath = join(APPLYCUE, 'data', 'application-attempts.jsonl');
const latestAttemptById = new Map();
const startedAttemptById = new Map();
if (existsSync(attemptsPath)) {
  for (const line of readFileSync(attemptsPath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event?.attemptId && event?.jobId) {
        latestAttemptById.set(String(event.attemptId), event);
        if (event.outcome === 'started') startedAttemptById.set(String(event.attemptId), event);
      }
    } catch {
      error('Application attempt ledger contains malformed JSON');
      badAttemptReconciliation++;
    }
  }
}

const preflightsById = new Map();
const preflightsPath = join(APPLYCUE, 'data', 'application-preflights.jsonl');
if (existsSync(preflightsPath)) {
  for (const line of readFileSync(preflightsPath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const receipt = JSON.parse(line);
      if (receipt?.id) preflightsById.set(String(receipt.id), receipt);
    } catch {
      error('Application preflight ledger contains malformed JSON');
      badAttemptReconciliation++;
    }
  }
}
for (const start of startedAttemptById.values()) {
  const preflight = preflightsById.get(String(start.preflightReceiptId || ''));
  if (!preflight) {
    error(`#${start.jobId}: Application attempt ${start.attemptId} has no matching preflight receipt`);
    badAttemptReconciliation++;
    continue;
  }
  const preflightIssues = validateAttemptPreflightLink(start, preflight);
  if (preflightIssues.length > 0) {
    error(`#${start.jobId}: Application attempt ${start.attemptId} disagrees with its live-form preflight (${preflightIssues.join('; ')})`);
    badAttemptReconciliation++;
  }
}
const latestAttemptByJob = new Map();
for (const event of latestAttemptById.values()) latestAttemptByJob.set(String(event.jobId), event);
for (const entry of entries.filter((item) => item.origin === 'current')) {
  const attempt = latestAttemptByJob.get(String(entry.num));
  if (!attempt) continue;
  const lifecycleComplete = completedApplicationStatuses.has(entry.status.toLowerCase());
  if (attempt.outcome === 'confirmed' && !lifecycleComplete) {
    error(`#${entry.num}: Confirmed application attempt disagrees with tracker status "${entry.status}"`);
    badAttemptReconciliation++;
  }
  if (['started', 'unknown', 'failed', 'abandoned'].includes(attempt.outcome) && lifecycleComplete) {
    error(`#${entry.num}: ${attempt.outcome} application attempt cannot support tracker status "${entry.status}"`);
    badAttemptReconciliation++;
  }
}
if (badAttemptReconciliation === 0) ok('Application attempts agree with tracker lifecycle');

// --- Check 2: Duplicates ---
const companyRoleMap = new Map();
let dupes = 0;
for (const e of entries) {
  const key = e.company.toLowerCase().replace(/[^a-z0-9]/g, '') + '::' +
    e.role.toLowerCase().replace(/[^a-z0-9 ]/g, '');
  if (!companyRoleMap.has(key)) companyRoleMap.set(key, []);
  companyRoleMap.get(key).push(e);
}
for (const [key, group] of companyRoleMap) {
  if (group.length > 1) {
    warn(`Possible duplicates: ${group.map(e => `#${e.num}`).join(', ')} (${group[0].company} — ${group[0].role})`);
    dupes++;
  }
}
if (dupes === 0) ok('No exact duplicates found');

// --- Check 3: Report links ---
// Markdown links resolve relative to the file that contains them, so report
// links must resolve against the tracker's own directory (see #760). For the
// transition we also accept legacy root-relative links: try the tracker dir
// first, then fall back to the repo root before flagging a link broken.
const TRACKER_DIR = dirname(APPS_FILE);
let brokenReports = 0;
for (const e of entries) {
  const match = e.report.match(/\]\(([^)]+)\)/);
  if (!match) continue;
  const link = match[1];
  if (!existsSync(join(TRACKER_DIR, link)) && !existsSync(join(APPLYCUE, link))) {
    error(`#${e.num}: Report not found: ${link}`);
    brokenReports++;
  }
}
if (brokenReports === 0) ok('All report links valid');

// --- Check 4: Legacy score format ---
let badScores = 0;
for (const e of entries) {
  const s = e.score.replace(/\*\*/g, '').trim();
  if (!/^\d+\.?\d*\/5$/.test(s) && s !== 'N/A' && s !== 'DUP' && s !== '—') {
    error(`#${e.num}: Invalid legacy score format: "${e.score}"`);
    badScores++;
  }
}
if (badScores === 0) ok('All legacy score cells readable');

// --- Check 5: Row format ---
let badRows = 0;
for (const line of lines) {
  if (!line.startsWith('|')) continue;
  if (line.includes('---') || line.includes('Empresa')) continue;
  const parts = line.split('|');
  if (parts.length <= MAX_IDX) {
    error(`Row with too few columns (need ${MAX_IDX} data cols): ${line.substring(0, 80)}...`);
    badRows++;
  }
}
if (badRows === 0) ok('All rows properly formatted');

// --- Check 6: Pending TSVs ---
let pendingTsvs = 0;
if (existsSync(ADDITIONS_DIR)) {
  const files = readdirSync(ADDITIONS_DIR).filter(f => f.endsWith('.tsv'));
  pendingTsvs = files.length;
  if (pendingTsvs > 0) {
    warn(`${pendingTsvs} pending TSVs in tracker-additions/ (not merged)`);
  }
}
if (pendingTsvs === 0) ok('No pending TSVs');

// --- Check 7: Bold in scores ---
let boldScores = 0;
for (const e of entries) {
  if (e.score.includes('**')) {
    warn(`#${e.num}: Score has markdown bold: "${e.score}"`);
    boldScores++;
  }
}
if (boldScores === 0) ok('No bold in scores');

// --- Check 8: Stale report-number sentinels (GC) ---
// reserve-report-num.mjs drops NNN-RESERVED.md files in reports/ when a
// number is claimed.  If the process crashed before writing the real report
// and deleting the sentinel it will linger.  Sentinels older than 4 h are
// stale; remove them here so they don't skew the next slot allocation.
const SENTINEL_MAX_AGE_MS = 4 * 60 * 60 * 1000;
let staleSentinels = 0;
if (existsSync(REPORTS_DIR)) {
  const now = Date.now();
  for (const name of readdirSync(REPORTS_DIR)) {
    if (!name.endsWith('-RESERVED.md')) continue;
    const full = join(REPORTS_DIR, name);
    try {
      const { mtimeMs } = statSync(full);
      if (now - mtimeMs > SENTINEL_MAX_AGE_MS) {
        unlinkSync(full);
        warn(`Removed stale reservation sentinel: ${name}`);
        staleSentinels++;
      }
    } catch {
      // Already gone between readdir and stat — fine.
    }
  }
}
if (staleSentinels === 0) ok('No stale reservation sentinels');

// --- Summary ---
console.log('\n' + '='.repeat(50));
console.log(`📊 Pipeline Health: ${errors} errors, ${warnings} warnings`);
if (errors === 0 && warnings === 0) {
  console.log('🟢 Pipeline is clean!');
} else if (errors === 0) {
  console.log('🟡 Pipeline OK with warnings');
} else {
  console.log('🔴 Pipeline has errors — fix before proceeding');
}

process.exit(errors > 0 ? 1 : 0);
