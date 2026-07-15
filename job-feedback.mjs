#!/usr/bin/env node

/**
 * Append-only dashboard action and CV-feedback receipts.
 *
 * The dashboard records user intent. It does not mutate the tracker, generate a
 * CV, inspect a form, or submit an application. The operating agent consumes
 * these receipts through the existing review/CV/application owners.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { latestCvBundleManifest } from './cv-bundle.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
export const JOB_ACTION_SCHEMA = 'applycue-dashboard-action-v1';
export const JOB_ACTION_RESOLUTION_SCHEMA = 'applycue-dashboard-action-resolution-v1';
export const JOB_ACTIONS = Object.freeze([
  'prepare',
  'inspect_form',
  'approve_apply',
  'request_cv_change',
  'ignore',
  'mark_high_stakes',
  'mark_standard',
]);

const ACTION_SET = new Set(JOB_ACTIONS);
const PRIORITY_ACTION_SET = new Set(['mark_high_stakes', 'mark_standard']);

function clean(value, limit = 2_000) {
  return String(value ?? '').normalize('NFKC').replace(/\r\n?/g, '\n').trim().slice(0, limit);
}

function identity(value) {
  return clean(value, 500).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function feedbackPath(root) {
  return process.env.APPLYCUE_JOB_FEEDBACK || join(root, 'data', 'job-feedback.jsonl');
}

function appendEvent(root, record) {
  const path = feedbackPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record)}\n`, { flag: 'a', encoding: 'utf8' });
  return record;
}

export function readJobFeedbackEvents(root = ROOT) {
  const path = feedbackPath(root);
  if (!existsSync(path)) return [];
  const events = [];
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event && typeof event === 'object') events.push(event);
    } catch {
      // Keep the local dashboard usable while the agent repairs a malformed
      // historical line. The verifier remains responsible for integrity claims.
    }
  }
  return events;
}

function resolutionsByAction(events) {
  const resolutions = new Map();
  for (const event of events) {
    if (event?.schemaVersion === JOB_ACTION_RESOLUTION_SCHEMA && event.resolvesEventId) {
      resolutions.set(String(event.resolvesEventId), event);
    }
  }
  return resolutions;
}

function cvRequestIsResolved(action, resolution, bundleFingerprint = '') {
  if (!resolution) return false;
  if (resolution.result === 'dismissed_by_user') return resolution.userConfirmed === true;
  if (resolution.result !== 'completed') return false;
  if (!bundleFingerprint) return Boolean(resolution.resolvedBundleFingerprint);
  return resolution.resolvedBundleFingerprint === bundleFingerprint;
}

export function summarizeJobFeedback(events, jobId, { bundleFingerprint = '' } = {}) {
  const id = String(jobId);
  const resolutions = resolutionsByAction(events);
  const actions = events.filter((event) =>
    event?.schemaVersion === JOB_ACTION_SCHEMA && String(event.jobId) === id && ACTION_SET.has(event.action));
  const priorityAction = [...actions].reverse().find((event) => PRIORITY_ACTION_SET.has(event.action)) || null;
  const legacyFit = [...events].reverse().find((event) =>
    String(event?.jobId) === id && ['up', 'down'].includes(event?.sentiment)) || null;
  const pendingActions = actions.filter((action) => {
    const resolution = resolutions.get(String(action.id));
    if (PRIORITY_ACTION_SET.has(action.action)) {
      return action.id === priorityAction?.id && !resolution;
    }
    if (action.action === 'request_cv_change') {
      return !cvRequestIsResolved(action, resolution, bundleFingerprint);
    }
    return !resolution;
  });
  const pendingCvChanges = pendingActions.filter((action) => action.action === 'request_cv_change');
  return {
    latestAction: actions.at(-1) || null,
    priorityAction,
    highStakes: priorityAction?.action === 'mark_high_stakes',
    pendingActions,
    pendingCvChanges,
    legacyFit,
  };
}

export function readJobFeedbackStates(root = ROOT, contexts = new Map()) {
  const events = readJobFeedbackEvents(root);
  const jobIds = new Set(events.map((event) => String(event?.jobId || '')).filter(Boolean));
  for (const jobId of contexts.keys()) jobIds.add(String(jobId));
  return new Map([...jobIds].map((jobId) => [jobId, summarizeJobFeedback(events, jobId, contexts.get(jobId) || {})]));
}

export function appendJobAction(root = ROOT, options = {}) {
  const action = clean(options.action, 80);
  if (!ACTION_SET.has(action)) throw new Error(`action must be one of: ${JOB_ACTIONS.join(', ')}`);
  const jobId = clean(options.jobId, 40);
  const company = clean(options.company, 200);
  const title = clean(options.title, 240);
  const note = clean(options.note);
  if (!/^\d+$/.test(jobId) || !company || !title) throw new Error('jobId, company, and title are required');
  const cvBundleFingerprint = clean(options.cvBundleFingerprint, 160);
  const cvPath = clean(options.cvPath, 500);
  const preflightReceiptId = clean(options.preflightReceiptId, 160);
  if (['inspect_form', 'approve_apply', 'request_cv_change'].includes(action) && (!cvBundleFingerprint || !cvPath)) {
    throw new Error(`${action} requires the current verified CV bundle`);
  }
  if (action === 'approve_apply' && !preflightReceiptId) {
    throw new Error('approve_apply requires the current live-form preflight');
  }
  if (action === 'request_cv_change' && !note) {
    throw new Error('Describe what should change in the tailored CV');
  }

  const existingState = summarizeJobFeedback(readJobFeedbackEvents(root), jobId, { bundleFingerprint: cvBundleFingerprint });
  const unchanged = existingState.pendingActions.find((event) =>
    event.action === action && clean(event.note) === note &&
    clean(event.cvBundleFingerprint, 160) === cvBundleFingerprint &&
    clean(event.preflightReceiptId, 160) === preflightReceiptId);
  if (unchanged) return { ...unchanged, unchanged: true };

  return appendEvent(root, {
    schemaVersion: JOB_ACTION_SCHEMA,
    id: randomUUID(),
    jobId,
    company,
    title,
    action,
    status: action === 'approve_apply' ? 'approved' : 'pending_agent',
    ...(note ? { note } : {}),
    ...(clean(options.jobUrl, 2_000) ? { jobUrl: clean(options.jobUrl, 2_000) } : {}),
    ...(clean(options.jdPath, 500) ? { jdPath: clean(options.jdPath, 500) } : {}),
    ...(clean(options.reviewReceiptId, 160) ? { reviewReceiptId: clean(options.reviewReceiptId, 160) } : {}),
    ...(clean(options.jdContentFingerprint, 160) ? { jdContentFingerprint: clean(options.jdContentFingerprint, 160) } : {}),
    ...(cvBundleFingerprint ? { cvBundleFingerprint, cvPath } : {}),
    ...(preflightReceiptId ? { preflightReceiptId } : {}),
    approvedByUser: action === 'approve_apply',
    actor: 'dashboard_user',
    createdAt: options.createdAt || new Date().toISOString(),
  });
}

export function resolveJobAction(root = ROOT, options = {}) {
  const eventId = clean(options.eventId, 160);
  const actorName = clean(options.actorName, 160);
  const result = clean(options.result || 'completed', 80);
  if (!eventId || !actorName) throw new Error('resolve needs an action id and actor name');
  if (!['completed', 'dismissed_by_user'].includes(result)) throw new Error('result must be completed or dismissed_by_user');
  const events = readJobFeedbackEvents(root);
  const action = events.find((event) => event?.schemaVersion === JOB_ACTION_SCHEMA && event.id === eventId);
  if (!action) throw new Error(`Unknown dashboard action: ${eventId}`);
  const existing = resolutionsByAction(events).get(eventId);
  if (existing) return { ...existing, unchanged: true };
  const resolvedBundleFingerprint = clean(options.bundleFingerprint, 160);
  if (action.action === 'request_cv_change' && result === 'completed') {
    if (!resolvedBundleFingerprint || resolvedBundleFingerprint === action.cvBundleFingerprint) {
      throw new Error('A CV-change request can be completed only against a newly generated CV bundle');
    }
  }
  if (result === 'dismissed_by_user' && options.userConfirmed !== true) {
    throw new Error('Dismissing a dashboard action needs explicit user confirmation');
  }
  return appendEvent(root, {
    schemaVersion: JOB_ACTION_RESOLUTION_SCHEMA,
    id: randomUUID(),
    resolvesEventId: eventId,
    jobId: String(action.jobId),
    action: action.action,
    result,
    ...(clean(options.note) ? { note: clean(options.note) } : {}),
    ...(resolvedBundleFingerprint ? { resolvedBundleFingerprint } : {}),
    ...(result === 'dismissed_by_user' ? { userConfirmed: true } : {}),
    actorName,
    createdAt: options.createdAt || new Date().toISOString(),
  });
}

export function pendingJobActions(root = ROOT, options = {}) {
  const events = readJobFeedbackEvents(root);
  const jobIds = new Set(events.map((event) => String(event?.jobId || '')).filter(Boolean));
  const selected = options.jobId ? [String(options.jobId)] : [...jobIds];
  const queued = selected.map((jobId) => {
    const currentBundle = options.bundleFingerprint || latestCvBundleManifest(root, jobId)?.bundleFingerprint || '';
    return { jobId, state: summarizeJobFeedback(events, jobId, { bundleFingerprint: currentBundle }) };
  });
  queued.sort((a, b) => Number(b.state.highStakes) - Number(a.state.highStakes));
  return queued.flatMap(({ state }) => state.pendingActions);
}

export function assertNoPendingCvChanges(root = ROOT, jobId, bundleFingerprint) {
  const state = summarizeJobFeedback(readJobFeedbackEvents(root), jobId, { bundleFingerprint });
  if (state.pendingCvChanges.length) {
    const detail = state.pendingCvChanges.map((event) => event.note || event.id).join('; ');
    throw new Error(`Job #${jobId} has unresolved user-requested CV changes: ${detail}`);
  }
  return state;
}

export function assertNoBlockingJobActions(root = ROOT, jobId, bundleFingerprint) {
  const state = assertNoPendingCvChanges(root, jobId, bundleFingerprint);
  const pendingIgnore = state.pendingActions.filter((event) => event.action === 'ignore');
  if (pendingIgnore.length) {
    throw new Error(`Job #${jobId} has an unresolved user ignore action; the agent must process it or the user must explicitly withdraw it`);
  }
  return state;
}

export function assertDashboardApplyApproval(root = ROOT, options = {}) {
  const receiptId = clean(options.receiptId, 160);
  if (!receiptId) throw new Error('Dashboard approval receipt id is required');
  const events = readJobFeedbackEvents(root);
  const action = events.find((event) => event?.schemaVersion === JOB_ACTION_SCHEMA && event.id === receiptId);
  if (!action || action.action !== 'approve_apply' || action.approvedByUser !== true) {
    throw new Error('Dashboard receipt is not a named apply approval');
  }
  if (resolutionsByAction(events).has(receiptId)) throw new Error('Dashboard apply approval was already resolved or consumed');
  if (String(action.jobId) !== String(options.jobId) || identity(action.company) !== identity(options.company) || identity(action.title) !== identity(options.title)) {
    throw new Error('Dashboard approval belongs to a different job, company, or title');
  }
  if (action.cvBundleFingerprint !== options.cvBundleFingerprint || action.preflightReceiptId !== options.preflightReceiptId) {
    throw new Error('Dashboard approval belongs to a different CV bundle or form preflight');
  }
  if (clean(action.cvPath, 500) !== clean(options.cvPath, 500)) {
    throw new Error('Dashboard approval belongs to a different selected CV upload');
  }
  assertNoPendingCvChanges(root, options.jobId, options.cvBundleFingerprint);
  return action;
}

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.slice(3).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || '';
}

function main() {
  const command = process.argv[2];
  if (command === 'pending') {
    console.log(JSON.stringify(pendingJobActions(ROOT, {
      jobId: option('job'), bundleFingerprint: option('bundle-fingerprint'),
    }), null, 2));
    return;
  }
  if (command === 'resolve') {
    console.log(JSON.stringify(resolveJobAction(ROOT, {
      eventId: option('id'), actorName: option('actor'), note: option('note'),
      result: process.argv.includes('--dismissed-by-user') ? 'dismissed_by_user' : 'completed',
      userConfirmed: process.argv.includes('--dismissed-by-user'),
      bundleFingerprint: option('bundle-fingerprint'),
    }), null, 2));
    return;
  }
  if (command === 'record') {
    console.log(JSON.stringify(appendJobAction(ROOT, {
      jobId: option('job'), company: option('company'), title: option('title'),
      action: option('action'), note: option('note'), jobUrl: option('url'),
      jdPath: option('jd'), reviewReceiptId: option('review-receipt'),
      jdContentFingerprint: option('jd-fingerprint'), cvBundleFingerprint: option('bundle-fingerprint'),
      cvPath: option('cv'), preflightReceiptId: option('preflight-receipt'),
    }), null, 2));
    return;
  }
  console.error('Usage:\n  node job-feedback.mjs record --job=N --company=... --title=... --action=ACTION [--url=...] [--note=...]\n  node job-feedback.mjs pending [--job=N] [--bundle-fingerprint=HASH]\n  node job-feedback.mjs resolve --id=ID --actor=codex [--note=...] [--bundle-fingerprint=NEW_HASH]\n  node job-feedback.mjs resolve --id=ID --actor=codex --dismissed-by-user [--note=...]');
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
