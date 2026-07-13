#!/usr/bin/env node

/**
 * Durable application-attempt receipts.
 *
 * The external agent still controls the browser. This tiny ledger prevents a
 * second submit when the browser outcome was uncertain and proves whether an
 * application was only prepared, attempted, or confirmed.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  const url = new URL(String(value || ''));
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  return url.href;
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

export function startApplicationAttempt(root, { jobId, company, title, url, approvedByUser, override = false }) {
  if (!/^\d+$/.test(String(jobId || '')) || !company || !title || !/^https?:\/\//i.test(String(url || ''))) {
    throw new Error('jobId, company, title, and an http(s) application URL are required');
  }
  if (!approvedByUser) throw new Error('Named user approval is required before an application attempt starts');
  const previous = latestAttemptForJob(root, jobId) || latestAttemptForUrl(root, url);
  if (!override && previous && ['started', 'unknown', 'confirmed'].includes(previous.outcome)) {
    throw new Error(`This exact job already has a ${previous.outcome} attempt; reconcile it before retrying`);
  }
  return appendEvent(root, {
    id: randomUUID(), attemptId: randomUUID(), jobId: String(jobId), company: String(company),
    title: String(title), url: String(url), outcome: 'started', approvedByUser: true,
    createdAt: new Date().toISOString()
  });
}

export function finishApplicationAttempt(root, { attemptId, outcome, evidence = '' }) {
  if (!attemptId || !OUTCOMES.has(outcome)) throw new Error(`outcome must be one of: ${[...OUTCOMES].join(', ')}`);
  const start = readAttemptEvents(root).find((event) => event.attemptId === attemptId && event.outcome === 'started');
  if (!start) throw new Error(`Unknown application attempt: ${attemptId}`);
  const alreadyFinished = readAttemptEvents(root).find((event) => event.attemptId === attemptId && event.outcome !== 'started');
  if (alreadyFinished) throw new Error(`Application attempt is already ${alreadyFinished.outcome}`);
  return appendEvent(root, {
    id: randomUUID(), attemptId, jobId: start.jobId, company: start.company, title: start.title,
    url: start.url, outcome, ...(evidence ? { evidence: String(evidence).slice(0, 2000) } : {}),
    createdAt: new Date().toISOString()
  });
}

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.slice(3).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || '';
}

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}

function main() {
  const command = process.argv[2];
  if (command === 'start') {
    print(startApplicationAttempt(ROOT, {
      jobId: option('job'), company: option('company'), title: option('title'), url: option('url'),
      approvedByUser: process.argv.includes('--approved-by-user'), override: process.argv.includes('--override')
    }));
    return;
  }
  if (command === 'finish') {
    print(finishApplicationAttempt(ROOT, { attemptId: option('attempt'), outcome: option('outcome'), evidence: option('evidence') }));
    return;
  }
  if (command === 'check') {
    print(option('url') ? latestAttemptForUrl(ROOT, option('url')) : latestAttemptForJob(ROOT, option('job')));
    return;
  }
  console.error('Usage:\n  node application-attempt.mjs start --job=N --company=... --title=... --url=https://... --approved-by-user\n  node application-attempt.mjs finish --attempt=ID --outcome=confirmed|unknown|failed|abandoned [--evidence=...]\n  node application-attempt.mjs check --job=N|--url=https://...');
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(error.message); process.exit(1); }
}
