#!/usr/bin/env node

/**
 * Durable application-attempt receipts.
 *
 * The external agent still controls the browser. This tiny ledger prevents a
 * second submit when the browser outcome was uncertain and proves whether an
 * application was only prepared, attempted, or confirmed.
 */

import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertCurrentCvBundle } from './cv-bundle.mjs';
import { assertCurrentReview } from './review-evidence.mjs';
import {
  assertCurrentApplicationPreflight,
  canonicalApplicationUrl,
  normalizedApplicationIdentity,
} from './application-preflight.mjs';
import { assertDashboardApplyApproval, assertNoBlockingJobActions } from './job-feedback.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUTCOMES = new Set(['confirmed', 'unknown', 'failed', 'abandoned']);

function ledgerPath(root) {
  return process.env.APPLYCUE_ATTEMPTS || resolve(root, 'data', 'application-attempts.jsonl');
}

export function readAttemptEvents(root = ROOT) {
  const path = ledgerPath(root);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function appendEvent(root, event) {
  const path = ledgerPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(event)}\n`, { flag: 'a', encoding: 'utf8' });
  return event;
}

export function latestAttemptForJob(root, jobId) {
  const events = readAttemptEvents(root).filter((event) => String(event.jobId) === String(jobId));
  if (!events.length) return null;
  const attemptId = events.at(-1).attemptId;
  return events.filter((event) => event.attemptId === attemptId).at(-1) || null;
}

export function canonicalJobUrl(value) {
  return canonicalApplicationUrl(value);
}

export function latestAttemptForUrl(root, value) {
  const wanted = canonicalJobUrl(value);
  const events = readAttemptEvents(root).filter((event) => {
    try { return canonicalJobUrl(event.url) === wanted; } catch { return false; }
  });
  if (!events.length) return null;
  const attemptId = events.at(-1).attemptId;
  return events.filter((event) => event.attemptId === attemptId).at(-1) || null;
}

function normalizedIdentity(value) {
  return normalizedApplicationIdentity(value);
}

export async function startApplicationAttempt(root, {
  jobId, company, title, url, cvPath, approvedByUser, approvalReceiptId = '', override = false,
}, {
  reviewVerifier = assertCurrentReview, bundleVerifier = assertCurrentCvBundle,
  preflightVerifier = assertCurrentApplicationPreflight,
} = {}) {
  if (!/^\d+$/.test(String(jobId || '')) || !company || !title || !/^https?:\/\//i.test(String(url || ''))) {
    throw new Error('jobId, company, title, and an http(s) application URL are required');
  }
  if (!approvedByUser && !approvalReceiptId) throw new Error('Named user approval is required before an application attempt starts');
  if (!cvPath) throw new Error('The exact approved CV upload path is required before an application attempt starts');
  const review = reviewVerifier(root, jobId);
  if (review?.row && (normalizedIdentity(review.row.company) !== normalizedIdentity(company) || normalizedIdentity(review.row.role) !== normalizedIdentity(title))) {
    throw new Error('Application company/title does not match the current reviewed tracker job');
  }
  const bundle = await bundleVerifier(root, jobId, { selectedPath: cvPath });
  if (!bundle?.selectedArtifact?.sha256 || !bundle?.manifest?.bundleFingerprint) {
    throw new Error('The selected CV is not bound to a current verified bundle');
  }
  assertNoBlockingJobActions(root, jobId, bundle.manifest.bundleFingerprint);
  const previous = latestAttemptForJob(root, jobId) || latestAttemptForUrl(root, url);
  if (!override && previous && ['started', 'unknown', 'confirmed'].includes(previous.outcome)) {
    throw new Error(`This exact job already has a ${previous.outcome} attempt; reconcile it before retrying`);
  }
  const preflight = await preflightVerifier(root, { jobId, company, title, url, cvPath }, {
    reviewVerifier: () => review,
    bundleVerifier: async () => bundle,
  });
  if (!preflight?.id || preflight.status !== 'ready') {
    throw new Error('A current ready live-form preflight is required before an application attempt starts');
  }
  if (readAttemptEvents(root).some((event) => event.outcome === 'started' && event.preflightReceiptId === preflight.id)) {
    throw new Error('This live-form preflight was already used; inspect the current form again before retrying');
  }
  let dashboardApproval = null;
  if (approvalReceiptId) {
    if (readAttemptEvents(root).some((event) => event.outcome === 'started' && event.dashboardApprovalReceiptId === approvalReceiptId)) {
      throw new Error('This dashboard apply approval was already used');
    }
    dashboardApproval = assertDashboardApplyApproval(root, {
      receiptId: approvalReceiptId,
      jobId,
      company,
      title,
      cvPath: bundle.selectedArtifact.path,
      cvBundleFingerprint: bundle.manifest.bundleFingerprint,
      preflightReceiptId: preflight.id,
    });
  }
  return appendEvent(root, {
    id: randomUUID(), attemptId: randomUUID(), jobId: String(jobId), company: String(company),
    title: String(title), url: String(url), outcome: 'started', approvedByUser: true,
    approvalSource: dashboardApproval ? 'dashboard' : 'chat',
    ...(dashboardApproval ? { dashboardApprovalReceiptId: dashboardApproval.id } : {}),
    cvPath: bundle.selectedArtifact.path,
    cvKind: bundle.selectedArtifact.kind,
    cvSha256: bundle.selectedArtifact.sha256,
    cvBundleFingerprint: bundle.manifest.bundleFingerprint,
    reviewReceiptId: bundle.manifest.reviewReceiptId,
    jdContentFingerprint: bundle.manifest.jdContentFingerprint,
    preflightReceiptId: preflight.id,
    preflightAnswersFingerprint: preflight.answersFingerprint,
    preflightExpiresAt: preflight.expiresAt,
    createdAt: new Date().toISOString()
  });
}

function updateTrackerStatus(root, { jobId, status, company, title }) {
  try {
    const stdout = execFileSync(process.execPath, [
      resolve(root, 'tracker.mjs'), 'status', '--num', String(jobId), '--status', status,
      '--company', String(company), '--title', String(title),
    ], { cwd: root, env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(stdout.trim());
  } catch (error) {
    const detail = String(error?.stderr || '').trim() || error.message;
    throw new Error(`Tracker reconciliation failed: ${detail}`);
  }
}

export async function finishApplicationAttempt(root, { attemptId, outcome, evidence = '' }, {
  trackerUpdater = updateTrackerStatus,
} = {}) {
  if (!attemptId || !OUTCOMES.has(outcome)) throw new Error(`outcome must be one of: ${[...OUTCOMES].join(', ')}`);
  const events = readAttemptEvents(root);
  const start = events.find((event) => event.attemptId === attemptId && event.outcome === 'started');
  if (!start) throw new Error(`Unknown application attempt: ${attemptId}`);
  const alreadyFinished = events.find((event) => event.attemptId === attemptId && event.outcome !== 'started');
  if (alreadyFinished) throw new Error(`Application attempt is already ${alreadyFinished.outcome}`);

  // Only confirmed submission changes the canonical lifecycle. Unknown, failed,
  // and abandoned attempts remain visible through the attempt ledger without
  // pretending the application was accepted or changing the agent's decision.
  let tracker = null;
  const firstConfirmedApplication = outcome === 'confirmed'
    && !events.some((event) => event.outcome === 'confirmed');
  if (outcome === 'confirmed') {
    tracker = await trackerUpdater(root, {
      jobId: start.jobId, status: 'Applied', company: start.company, title: start.title,
    });
  }

  try {
    return appendEvent(root, {
      id: randomUUID(), attemptId, jobId: start.jobId, company: start.company, title: start.title,
      url: start.url, outcome, firstConfirmedApplication,
      ...(evidence ? { evidence: String(evidence).slice(0, 2000) } : {}),
      ...(tracker ? {
        trackerStatus: tracker.status,
        trackerPreviousStatus: tracker.previousStatus,
        trackerChanged: Boolean(tracker.changed),
      } : {}),
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    // The tracker command already uses atomic replace + DB transaction. If the
    // final ledger append fails, restore the prior lifecycle before surfacing
    // the error so the two product records do not knowingly diverge.
    if (tracker?.changed && tracker.previousStatus) {
      try {
        await trackerUpdater(root, {
          jobId: start.jobId, status: tracker.previousStatus, company: start.company, title: start.title,
        });
      } catch (rollbackError) {
        throw new Error(`Application outcome was not recorded and tracker rollback failed: ${rollbackError.message}; original error: ${error.message}`);
      }
    }
    throw error;
  }
}

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.slice(3).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || '';
}

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const command = process.argv[2];
  if (command === 'start') {
    print(await startApplicationAttempt(ROOT, {
      jobId: option('job'), company: option('company'), title: option('title'), url: option('url'),
      cvPath: option('cv'),
      approvedByUser: process.argv.includes('--approved-by-user'), approvalReceiptId: option('approval-receipt'),
      override: process.argv.includes('--override')
    }));
    return;
  }
  if (command === 'finish') {
    print(await finishApplicationAttempt(ROOT, { attemptId: option('attempt'), outcome: option('outcome'), evidence: option('evidence') }));
    return;
  }
  if (command === 'check') {
    print(option('url') ? latestAttemptForUrl(ROOT, option('url')) : latestAttemptForJob(ROOT, option('job')));
    return;
  }
  console.error('Usage:\n  node application-attempt.mjs start --job=N --company=... --title=... --url=https://... --cv=output/verified.pdf (--approved-by-user | --approval-receipt=ID)\n  node application-attempt.mjs finish --attempt=ID --outcome=confirmed|unknown|failed|abandoned [--evidence=...]\n  node application-attempt.mjs check --job=N|--url=https://...');
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
