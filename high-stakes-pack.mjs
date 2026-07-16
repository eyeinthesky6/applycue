#!/usr/bin/env node

/**
 * Fingerprint-bound receipts for agent-authored high-stakes campaign packs.
 *
 * The external agent still researches, judges, and writes the pack. This file
 * only proves which current review, CV bundle, candidate positioning, and
 * output files the pack was prepared against. It is additive: application
 * preflight and submission do not depend on this ledger.
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync, mkdirSync, readFileSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cvBundleFreshnessForJob, latestCvBundleManifest } from './cv-bundle.mjs';
import { readJobFeedbackEvents, summarizeJobFeedback } from './job-feedback.mjs';
import { reviewFreshnessForJob } from './review-evidence.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
export const HIGH_STAKES_PACK_SCHEMA = 'applycue-high-stakes-pack-v1';

const REQUIRED_PACK_SECTIONS = Object.freeze([
  ['perception risk', /^(?:#{2,3})\s+.*(?:perception risk|objection)/im],
  ['evidence used', /^(?:#{2,3})\s+.*evidence used/im],
  ['narrative choice', /^(?:#{2,3})\s+.*narrative choice/im],
  ['verification needed', /^(?:#{2,3})\s+.*verification needed/im],
  ['consistency impact', /^(?:#{2,3})\s+.*consistency impact/im],
]);

function normalizedText(value) {
  return String(value ?? '').normalize('NFKC').replace(/\r\n?/g, '\n').trim();
}

function identity(value) {
  return normalizedText(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

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

function repoRelative(root, target) {
  const rel = relative(root, resolve(target));
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return '';
  return rel.split(sep).join('/');
}

function ledgerPath(root, explicitPath = '') {
  return explicitPath ? resolve(root, explicitPath) : join(root, 'data', 'high-stakes-packs.jsonl');
}

function outputArtifact(root, value, label, required = false) {
  const supplied = normalizedText(value);
  if (!supplied) {
    if (required) throw new Error(`${label} path is required`);
    return null;
  }
  const full = resolve(root, supplied);
  const path = repoRelative(root, full);
  if (!path || !path.startsWith('output/') || !path.toLowerCase().endsWith('.md')) {
    throw new Error(`${label} must be a Markdown file under output/`);
  }
  if (!existsSync(full) || !statSync(full).isFile()) throw new Error(`${label} does not exist: ${path}`);
  const buffer = readFileSync(full);
  const text = normalizedText(buffer.toString('utf8'));
  if (text.length < 80) throw new Error(`${label} is too short to be a useful artifact`);
  return { path, full, text, sha256: sha256(buffer), size: buffer.length };
}

function fileRecord(artifact) {
  return artifact ? { path: artifact.path, sha256: artifact.sha256, size: artifact.size } : null;
}

function packIdentity(text) {
  const field = (name) => normalizedText(text).match(new RegExp(`^\\*\\*${name}:\\*\\*\\s*(.+?)\\s*$`, 'im'))?.[1]?.trim() || '';
  return { jobId: field('Tracker job'), company: field('Company'), role: field('Role') };
}

function validatePackContract(pack, expected) {
  const declared = packIdentity(pack.text);
  if (String(declared.jobId) !== String(expected.jobId)) throw new Error(`Campaign pack must declare **Tracker job:** ${expected.jobId}`);
  if (identity(declared.company) !== identity(expected.company)) throw new Error(`Campaign pack company must exactly match ${expected.company}`);
  if (identity(declared.role) !== identity(expected.role)) throw new Error(`Campaign pack role must exactly match ${expected.role}`);
  const missing = REQUIRED_PACK_SECTIONS.filter(([, pattern]) => !pattern.test(pack.text)).map(([name]) => name);
  if (missing.length) throw new Error(`Campaign pack is missing required section(s): ${missing.join(', ')}`);
}

function candidatePositioning(root) {
  const path = 'candidate-positioning.md';
  const full = join(root, path);
  if (!existsSync(full)) return { path, present: false, sha256: sha256('missing') };
  return { path, present: true, sha256: sha256(normalizedText(readFileSync(full, 'utf8'))) };
}

function receiptFingerprint(receipt) {
  return stableHash({
    schemaVersion: receipt.schemaVersion,
    jobId: receipt.jobId,
    company: receipt.company,
    role: receipt.role,
    reviewReceiptId: receipt.reviewReceiptId,
    decisionContextFingerprint: receipt.decisionContextFingerprint,
    jdContentFingerprint: receipt.jdContentFingerprint,
    cvBundleFingerprint: receipt.cvBundleFingerprint,
    candidatePositioning: receipt.candidatePositioning,
    artifacts: receipt.artifacts,
  });
}

export function readHighStakesPackReceipts(root = ROOT, explicitPath = '') {
  const path = ledgerPath(root, explicitPath);
  if (!existsSync(path)) return [];
  const receipts = [];
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const receipt = JSON.parse(line);
      if (receipt && typeof receipt === 'object') receipts.push(receipt);
    } catch {
      // Preserve usable history while a malformed local line is repaired.
    }
  }
  return receipts;
}

export function latestHighStakesPackReceipt(root = ROOT, jobId, explicitPath = '') {
  return readHighStakesPackReceipts(root, explicitPath)
    .filter((receipt) => receipt?.schemaVersion === HIGH_STAKES_PACK_SCHEMA && String(receipt.jobId) === String(jobId))
    .at(-1) || null;
}

function safeReceiptPaths(root, receipt) {
  const paths = {};
  for (const [kind, artifact] of Object.entries(receipt?.artifacts || {})) {
    if (!artifact?.path) continue;
    try {
      const current = outputArtifact(root, artifact.path, kind);
      if (current) paths[kind] = current.path;
    } catch {
      // The issue list explains a missing or invalid artifact; do not expose it.
    }
  }
  return paths;
}

export function highStakesPackStatusForJob(root = ROOT, jobId, options = {}) {
  const feedback = summarizeJobFeedback(readJobFeedbackEvents(root), jobId);
  const highStakes = options.highStakes ?? feedback.highStakes;
  if (!highStakes) return { state: 'not_required', issues: [], receipt: null, paths: {} };

  const receipt = latestHighStakesPackReceipt(root, jobId, options.ledgerPath);
  if (!receipt) return { state: 'missing', issues: ['No recorded high-stakes campaign pack'], receipt: null, paths: {} };

  const issues = [];
  const review = reviewFreshnessForJob(root, jobId);
  const bundle = latestCvBundleManifest(root, jobId);
  const positioning = candidatePositioning(root);
  if (review.state !== 'current' || review.effectiveDecision !== 'apply' || !review.receipt) issues.push('Current apply review is missing or stale');
  if (!bundle) issues.push('Current verified CV bundle is missing');
  if (receipt.reviewReceiptId !== review.receipt?.id) issues.push('Review receipt changed after campaign preparation');
  if (receipt.decisionContextFingerprint !== review.receipt?.decisionContextFingerprint) issues.push('Review decision context changed after campaign preparation');
  if (receipt.jdContentFingerprint !== review.receipt?.jobContentFingerprint) issues.push('Full JD changed after campaign preparation');
  if (receipt.cvBundleFingerprint !== bundle?.bundleFingerprint) issues.push('CV bundle changed after campaign preparation');
  if (receipt.candidatePositioning?.sha256 !== positioning.sha256 || receipt.candidatePositioning?.present !== positioning.present) {
    issues.push('Candidate positioning changed after campaign preparation');
  }
  if (receipt.packFingerprint !== receiptFingerprint(receipt)) issues.push('Campaign pack receipt contents changed');
  for (const [kind, artifact] of Object.entries(receipt.artifacts || {})) {
    try {
      const current = outputArtifact(root, artifact?.path, kind, kind === 'pack');
      if (!current || current.sha256 !== artifact.sha256 || current.size !== artifact.size) issues.push(`${kind} artifact changed`);
    } catch (error) { issues.push(error.message); }
  }
  if (!receipt.artifacts?.pack) issues.push('Campaign pack artifact is missing from the receipt');
  return {
    state: issues.length ? 'stale' : 'current',
    issues: [...new Set(issues)],
    receipt,
    paths: safeReceiptPaths(root, receipt),
  };
}

export async function recordHighStakesPack(root = ROOT, options = {}) {
  const jobId = normalizedText(options.jobId);
  const actorName = normalizedText(options.actorName);
  if (!/^\d+$/.test(jobId)) throw new Error('record needs a numeric tracker job id');
  if (!actorName) throw new Error('record needs an actor name such as codex or claude');
  const feedback = summarizeJobFeedback(readJobFeedbackEvents(root), jobId);
  if (!feedback.highStakes) throw new Error(`Job #${jobId} is not marked high stakes`);
  const review = reviewFreshnessForJob(root, jobId);
  if (review.state !== 'current' || review.effectiveDecision !== 'apply' || !review.receipt) {
    throw new Error(`Job #${jobId} needs a current apply review before recording a campaign pack`);
  }
  const cv = await cvBundleFreshnessForJob(root, jobId);
  if (cv.state !== 'current' || !cv.manifest) {
    throw new Error(`Job #${jobId} needs a current verified CV bundle before recording a campaign pack: ${cv.issues.join('; ')}`);
  }
  const pack = outputArtifact(root, options.packPath, 'pack', true);
  validatePackContract(pack, { jobId, company: review.row.company, role: review.row.role });
  const applicationNarrative = outputArtifact(root, options.applicationNarrativePath, 'applicationNarrative');
  const profileChangePlan = outputArtifact(root, options.profileChangePlanPath, 'profileChangePlan');
  const receipt = {
    schemaVersion: HIGH_STAKES_PACK_SCHEMA,
    id: randomUUID(),
    jobId,
    company: review.row.company,
    role: review.row.role,
    reviewReceiptId: review.receipt.id,
    decisionContextFingerprint: review.receipt.decisionContextFingerprint,
    jdContentFingerprint: review.receipt.jobContentFingerprint,
    cvBundleFingerprint: cv.manifest.bundleFingerprint,
    candidatePositioning: candidatePositioning(root),
    artifacts: {
      pack: fileRecord(pack),
      ...(applicationNarrative ? { applicationNarrative: fileRecord(applicationNarrative) } : {}),
      ...(profileChangePlan ? { profileChangePlan: fileRecord(profileChangePlan) } : {}),
    },
    actorName,
    createdAt: options.createdAt || new Date().toISOString(),
  };
  receipt.packFingerprint = receiptFingerprint(receipt);
  const prior = latestHighStakesPackReceipt(root, jobId, options.ledgerPath);
  if (prior?.packFingerprint === receipt.packFingerprint) return { ...prior, unchanged: true };
  const path = ledgerPath(root, options.ledgerPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(receipt)}\n`, { flag: 'a', encoding: 'utf8' });
  return { ...receipt, unchanged: false };
}

export async function checkHighStakesPack(root = ROOT, jobId, options = {}) {
  const status = highStakesPackStatusForJob(root, jobId, options);
  if (status.state !== 'current') return status;
  const cv = await cvBundleFreshnessForJob(root, jobId);
  if (cv.state === 'current') return status;
  return { ...status, state: 'stale', issues: [...new Set([...status.issues, ...cv.issues])] };
}

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.slice(3).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || '';
}

function usage() {
  console.error('Usage:\n  node high-stakes-pack.mjs record --job=N --pack=output/.../campaign-pack.md --actor=codex [--application-narrative=output/...md] [--profile-change-plan=output/...md]\n  node high-stakes-pack.mjs check --job=N');
}

async function main() {
  const command = process.argv[2];
  if (command === 'record') {
    console.log(JSON.stringify(await recordHighStakesPack(ROOT, {
      jobId: option('job'), packPath: option('pack'), actorName: option('actor'),
      applicationNarrativePath: option('application-narrative'), profileChangePlanPath: option('profile-change-plan'),
    }), null, 2));
    return;
  }
  if (command === 'check') {
    const result = await checkHighStakesPack(ROOT, option('job'));
    console.log(JSON.stringify(result, null, 2));
    if (result.state !== 'current') process.exitCode = 1;
    return;
  }
  usage();
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
