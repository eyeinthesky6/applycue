#!/usr/bin/env node

/**
 * ApplyCue browser dashboard.
 *
 * The Markdown tracker remains the source of truth. This service only reads it,
 * resolves its full-JD/review/CV/job links, and records stage-aware user
 * actions for the operating agent. Actions never change tracker state or
 * search preferences automatically.
 */

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { parseTrackerRow, resolveColumns } from './tracker-parse.mjs';
import { reviewFreshnessForRow } from './review-evidence.mjs';
import { latestCvBundleManifest } from './cv-bundle.mjs';
import { appendJobAction, readJobFeedbackStates } from './job-feedback.mjs';
import { highStakesPackStatusForJob } from './high-stakes-pack.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = 4173;
const LOOPBACK_HOST = '127.0.0.1';
const ALLOWED_FILE_ROOTS = ['reports', 'output', 'jds'];

function trackerPath(root) {
  const inData = join(root, 'data', 'applications.md');
  if (existsSync(inData)) return inData;
  const atRoot = join(root, 'applications.md');
  return existsSync(atRoot) ? atRoot : inData;
}

function normalizeReportNumber(value) {
  return String(value || '').trim().replace(/^0+(?=\d)/, '');
}

function parseMarkdownLink(value) {
  const match = String(value || '').match(/\[([^\]]+)\]\(([^)]+)\)/);
  return match ? { label: match[1], target: match[2] } : null;
}

function safeRepoRelative(root, target) {
  const rel = relative(root, resolve(target));
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return '';
  return rel.split(sep).join('/');
}

function resolveTrackerFile(root, tracker, link) {
  if (!link || /^https?:\/\//i.test(link)) return '';
  const fromTracker = resolve(dirname(tracker), link);
  const legacy = resolve(root, link);
  const candidate = existsSync(fromTracker) ? fromTracker : legacy;
  return safeRepoRelative(root, candidate);
}

function loadPdfIndex(root) {
  const indexPath = join(root, 'data', 'pdf-index.tsv');
  const byReport = new Map();
  if (!existsSync(indexPath)) return byReport;
  for (const line of readFileSync(indexPath, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [report, pdf] = line.split('\t');
    if (report && pdf) byReport.set(normalizeReportNumber(report), pdf);
  }
  return byReport;
}

function extractJobUrl(root, reportPath) {
  if (!reportPath) return '';
  const fullPath = resolve(root, reportPath);
  if (!existsSync(fullPath)) return '';
  const header = readFileSync(fullPath, 'utf8').slice(0, 3000);
  return header.match(/^\*\*URL:\*\*\s*(https?:\/\/\S+)/im)?.[1] || '';
}

function exactJobKey(company, title) {
  return `${String(company || '').trim().toLowerCase()}\u0000${String(title || '').trim().toLowerCase()}`;
}

function loadUniqueScanUrls(root) {
  const historyPath = join(root, 'data', 'scan-history.tsv');
  const urlsByJob = new Map();
  if (!existsSync(historyPath)) return new Map();
  const lines = readFileSync(historyPath, 'utf8').split(/\r?\n/).filter(Boolean);
  const header = lines[0]?.split('\t').map((value) => value.trim().toLowerCase()) || [];
  const urlIndex = header.indexOf('url');
  const titleIndex = header.indexOf('title');
  const companyIndex = header.indexOf('company');
  if (urlIndex < 0 || titleIndex < 0 || companyIndex < 0) return new Map();
  for (const line of lines.slice(1)) {
    const fields = line.split('\t');
    const url = fields[urlIndex]?.trim();
    const company = fields[companyIndex]?.trim();
    const title = fields[titleIndex]?.trim();
    if (!/^https?:\/\//i.test(url || '') || !company || !title) continue;
    const key = exactJobKey(company, title);
    if (!urlsByJob.has(key)) urlsByJob.set(key, new Set());
    urlsByJob.get(key).add(url);
  }
  return new Map([...urlsByJob].flatMap(([key, urls]) => urls.size === 1 ? [[key, [...urls][0]]] : []));
}

function countScanned(root) {
  const historyPath = join(root, 'data', 'scan-history.tsv');
  if (!existsSync(historyPath)) return 0;
  const unique = new Set();
  for (const line of readFileSync(historyPath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields = line.split('\t');
    if (/^(url|date|first_seen)$/i.test(fields[0]?.trim())) continue;
    const key = fields.find((field) => /^https?:\/\//i.test(field.trim()))?.trim() || line.trim();
    unique.add(key);
  }
  return unique.size;
}

function loadAttemptMetrics(root, currentJobIds) {
  const path = join(root, 'data', 'application-attempts.jsonl');
  const latestByAttempt = new Map();
  const latestByJob = new Map();
  if (!existsSync(path)) return { attempted: 0, unresolved: 0, latestByJob };
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event?.attemptId && currentJobIds.has(String(event.jobId))) {
        const merged = { ...(latestByAttempt.get(String(event.attemptId)) || {}), ...event };
        latestByAttempt.set(String(event.attemptId), merged);
        latestByJob.set(String(event.jobId), merged);
      }
    } catch {
      // Keep the dashboard usable while the agent repairs a malformed line.
    }
  }
  return {
    attempted: latestByAttempt.size,
    unresolved: [...latestByAttempt.values()].filter((event) => ['started', 'unknown'].includes(event.outcome)).length,
    latestByJob,
  };
}

function loadLatestPreflights(root, currentJobIds) {
  const path = join(root, 'data', 'application-preflights.jsonl');
  const latestByJob = new Map();
  if (!existsSync(path)) return latestByJob;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const receipt = JSON.parse(line);
      if (receipt?.id && currentJobIds.has(String(receipt.jobId))) latestByJob.set(String(receipt.jobId), receipt);
    } catch {
      // Keep the dashboard usable while the agent repairs a malformed line.
    }
  }
  return latestByJob;
}

function statusGroup(status) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'evaluated') return 'pending';
  if (['applied', 'responded', 'interview', 'offer'].includes(value)) return 'active';
  if (value === 'rejected') return 'rejected';
  if (['discarded', 'skip'].includes(value)) return 'skipped';
  return 'other';
}

function decisionLabel(decision, reviewState = '') {
  if (decision === 'pending' && ['missing', 'stale'].includes(reviewState)) return 'Pending re-review';
  return ({ apply: 'Apply', watch: 'Watch', skip: 'Skip', pending: 'Pending review' })[decision] || 'Pending review';
}

function originLabel(origin) {
  if (origin === 'legacy_import') return 'Imported history';
  if (origin === 'mail_import') return 'Imported from email';
  if (origin === 'legacy_unknown') return 'Earlier history';
  return '';
}

function queueGroup(row) {
  if (row.origin !== 'current') return 'history';
  const lifecycle = statusGroup(row.status);
  if (['active', 'rejected'].includes(lifecycle)) return lifecycle;
  if (row.decision === 'pending' && ['missing', 'stale'].includes(row.reviewState)) return 'pending';
  if (row.decision === 'apply') return 'shortlisted';
  if (row.decision === 'watch') return 'watch';
  if (row.decision === 'skip' || lifecycle === 'skipped') return 'skipped';
  return 'pending';
}

function numericRank(job) {
  return /^\d+$/.test(String(job?.rank || '')) ? Number(job.rank) : Number.MAX_SAFE_INTEGER;
}

function highStakesQueuePriority(job) {
  return job?.feedback?.highStakes && ['shortlisted', 'pending', 'watch'].includes(job.group) ? 0 : 1;
}

export function compareDashboardQueue(a, b) {
  return highStakesQueuePriority(a) - highStakesQueuePriority(b)
    || numericRank(a) - numericRank(b)
    || String(b?.date || '').localeCompare(String(a?.date || ''))
    || Number(b?.id || 0) - Number(a?.id || 0);
}

export function readDashboardData(root = ROOT) {
  const tracker = trackerPath(root);
  const lines = existsSync(tracker) ? readFileSync(tracker, 'utf8').split(/\r?\n/) : [];
  const columns = resolveColumns(lines);
  const pdfByReport = loadPdfIndex(root);
  const uniqueScanUrls = loadUniqueScanUrls(root);
  const jobs = lines
    .map((line) => parseTrackerRow(line, columns))
    .filter(Boolean)
    .map((row) => {
      const reportLink = parseMarkdownLink(row.report);
      const reportPath = resolveTrackerFile(root, tracker, reportLink?.target || '');
      const reportNumber = normalizeReportNumber(reportLink?.label || '');
      const review = reviewFreshnessForRow(root, row, { trackerPath: tracker });
      const cvBundle = latestCvBundleManifest(root, row.num);
      const pdfPath = safeRepoRelative(root, resolve(root, cvBundle?.artifacts?.pdf?.path || pdfByReport.get(reportNumber) || ''));
      const docxPath = safeRepoRelative(root, resolve(root, cvBundle?.artifacts?.docx?.path || ''));
      const jdPath = safeRepoRelative(root, resolve(root, review.receipt?.jdPath || cvBundle?.jdPath || ''));
      const decision = review.effectiveDecision;
      return {
        id: String(row.num),
        date: row.date,
        company: row.company,
        title: row.role,
        location: row.location || '',
        score: row.score,
        status: row.status,
        decision,
        storedDecision: row.decision,
        decisionLabel: decisionLabel(decision, review.state),
        rank: review.effectiveRank,
        confidence: row.confidence,
        reviewState: review.state,
        reviewIssues: review.issues,
        origin: row.origin,
        originLabel: originLabel(row.origin),
        group: queueGroup({ ...row, decision, reviewState: review.state }),
        notes: row.notes,
        reportPath,
        pdfPath: pdfPath && existsSync(resolve(root, pdfPath)) ? pdfPath : '',
        docxPath: docxPath && existsSync(resolve(root, docxPath)) ? docxPath : '',
        jdPath: jdPath && existsSync(resolve(root, jdPath)) ? jdPath : '',
        jobUrl: extractJobUrl(root, reportPath) || uniqueScanUrls.get(exactJobKey(row.company, row.role)) || '',
        reviewReceiptId: review.receipt?.id || '',
        jdContentFingerprint: review.receipt?.jobContentFingerprint || '',
        cvBundleFingerprint: cvBundle?.bundleFingerprint || '',
      };
    });

  const feedbackContexts = new Map(jobs.map((job) => [job.id, { bundleFingerprint: job.cvBundleFingerprint }]));
  const feedbackByJob = readJobFeedbackStates(root, feedbackContexts);
  for (const job of jobs) {
    const feedback = feedbackByJob.get(job.id);
    job.feedback = feedback ? {
      latestAction: feedback.latestAction ? {
        id: feedback.latestAction.id,
        action: feedback.latestAction.action,
        status: feedback.latestAction.status,
        note: feedback.latestAction.note || '',
        createdAt: feedback.latestAction.createdAt,
      } : null,
      highStakes: feedback.highStakes,
      priorityAction: feedback.priorityAction ? {
        id: feedback.priorityAction.id,
        action: feedback.priorityAction.action,
        status: feedback.priorityAction.status,
        createdAt: feedback.priorityAction.createdAt,
      } : null,
      pendingActions: feedback.pendingActions.map((event) => ({
        id: event.id, action: event.action, status: event.status, note: event.note || '', createdAt: event.createdAt,
      })),
      pendingCvChanges: feedback.pendingCvChanges.map((event) => ({
        id: event.id, note: event.note || '', createdAt: event.createdAt,
      })),
      legacyFit: feedback.legacyFit ? {
        sentiment: feedback.legacyFit.sentiment,
        reason: feedback.legacyFit.reason || '',
      } : null,
    } : null;
    const campaign = highStakesPackStatusForJob(root, job.id, { highStakes: feedback?.highStakes || false });
    job.highStakesPack = { state: campaign.state, issues: campaign.issues, paths: campaign.paths };
  }

  const currentJobs = jobs.filter((job) => job.origin === 'current');
  const currentJobIds = new Set(currentJobs.map((job) => job.id));
  const { latestByJob, ...attemptMetrics } = loadAttemptMetrics(root, currentJobIds);
  const preflightByJob = loadLatestPreflights(root, currentJobIds);
  for (const job of currentJobs) {
    const attempt = latestByJob.get(job.id);
    job.attempt = attempt ? {
      attemptId: String(attempt.attemptId),
      outcome: String(attempt.outcome || ''),
      createdAt: String(attempt.createdAt || ''),
      dashboardApprovalReceiptId: String(attempt.dashboardApprovalReceiptId || ''),
    } : null;
    const preflight = preflightByJob.get(job.id);
    const preflightStatus = preflight?.status === 'ready' && Date.parse(preflight.expiresAt) < Date.now()
      ? 'expired'
      : preflight?.status;
    job.preflight = preflight ? {
      id: String(preflight.id), status: String(preflightStatus || 'pause'),
      createdAt: String(preflight.createdAt || ''), reasons: Array.isArray(preflight.reasons) ? preflight.reasons : [],
      cvPath: String(preflight.cvPath || ''), cvBundleFingerprint: String(preflight.cvBundleFingerprint || ''),
    } : null;
    if (attempt?.dashboardApprovalReceiptId && job.feedback?.pendingActions) {
      job.feedback.pendingActions = job.feedback.pendingActions.filter((event) => event.id !== attempt.dashboardApprovalReceiptId);
    }
  }
  const metrics = {
    scanned: countScanned(root),
    reviewed: currentJobs.filter((job) => job.reviewState === 'current' || ['active', 'rejected'].includes(job.group)).length,
    shortlisted: currentJobs.filter((job) => job.decision === 'apply').length,
    applied: currentJobs.filter((job) => ['applied', 'responded', 'interview', 'offer', 'rejected'].includes(String(job.status).toLowerCase())).length,
    rejected: currentJobs.filter((job) => statusGroup(job.status) === 'rejected').length,
    skipped: currentJobs.filter((job) => job.group === 'skipped').length,
    historical: jobs.length - currentJobs.length,
    ...attemptMetrics
  };

  jobs.sort(compareDashboardQueue);
  return { generatedAt: new Date().toISOString(), metrics, jobs };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderDashboardHtml(data, { staticSnapshot = false } = {}) {
  const safeData = JSON.stringify(data).replaceAll('<', '\\u003c');
  const staticNote = staticSnapshot
    ? '<div class="notice">Static snapshot. Run <code>npm run dashboard</code> to record feedback or refresh live data.</div>'
    : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ApplyCue dashboard</title>
  <style>
    :root { color-scheme: light; --ink:#172025; --muted:#66747a; --line:#dfe7e8; --panel:#fff; --wash:#f4f7f6; --brand:#0f766e; --brand2:#115e59; --danger:#b42318; --shadow:0 18px 50px rgba(23,32,37,.08); }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; background:linear-gradient(145deg,#f7faf9 0%,#eef4f2 100%); color:var(--ink); min-height:100vh; }
    main { width:min(1180px,calc(100% - 32px)); margin:0 auto; padding:36px 0 64px; }
    header { display:flex; justify-content:space-between; align-items:end; gap:24px; margin-bottom:24px; }
    h1 { margin:0; font-size:clamp(28px,5vw,46px); letter-spacing:-.045em; line-height:1; }
    .eyebrow { color:var(--brand); font-weight:750; text-transform:uppercase; letter-spacing:.14em; font-size:12px; margin-bottom:9px; }
    .sub { color:var(--muted); margin:10px 0 0; max-width:650px; }
    .stamp { color:var(--muted); font-size:12px; text-align:right; white-space:nowrap; }
    .notice { border:1px solid #b9d6d2; background:#edf9f7; color:#245e58; padding:10px 12px; border-radius:12px; margin-bottom:18px; }
    .metrics { display:grid; grid-template-columns:repeat(auto-fit,minmax(112px,1fr)); gap:8px; margin:14px 0; }
    .metric { background:rgba(255,255,255,.86); border:1px solid var(--line); border-radius:12px; padding:9px 11px; box-shadow:0 4px 14px rgba(23,32,37,.03); }
    .metric strong { display:block; font-size:20px; line-height:1.05; letter-spacing:-.035em; }
    .metric span { color:var(--muted); font-size:11px; line-height:1.2; }
    .toolbar { display:grid; grid-template-columns:minmax(220px,1fr) 180px 180px; gap:10px; padding:12px; border:1px solid var(--line); border-radius:16px; background:rgba(255,255,255,.76); position:sticky; top:10px; z-index:2; backdrop-filter:blur(12px); }
    input,select,textarea { width:100%; border:1px solid #ccd7d9; background:white; color:var(--ink); border-radius:10px; padding:10px 12px; font:inherit; }
    .count { color:var(--muted); font-size:13px; margin:15px 2px 10px; }
    .jobs { display:grid; gap:10px; }
    .job { display:grid; grid-template-columns:minmax(0,1fr) minmax(250px,310px); gap:18px; background:var(--panel); border:1px solid var(--line); border-radius:18px; padding:18px; box-shadow:var(--shadow); }
    .job h2 { margin:0; font-size:18px; letter-spacing:-.02em; }
    .company { color:var(--brand2); font-weight:750; }
    .meta { display:flex; flex-wrap:wrap; gap:7px; color:var(--muted); font-size:12px; margin:8px 0; }
    .pill { border:1px solid var(--line); border-radius:999px; padding:3px 8px; background:var(--wash); }
    .pill.decision { border-color:#b9d6d2; background:#edf9f7; color:#245e58; font-weight:700; }
    .pill.high-stakes { border-color:#e4b95e; background:#fff7df; color:#725216; font-weight:750; }
    .pill.history { border-color:#e6d5a8; background:#fff8e8; color:#725b20; }
    .notes { color:#435158; font-size:13px; line-height:1.45; margin-top:8px; }
    .links { display:flex; flex-wrap:wrap; gap:9px; margin-top:12px; }
    a { color:var(--brand2); font-weight:680; font-size:13px; text-decoration:none; }
    a:hover { text-decoration:underline; }
    .actions { border-left:1px solid var(--line); padding-left:16px; }
    .actions textarea { min-height:74px; resize:vertical; font-size:12px; line-height:1.4; }
    .action-buttons { display:flex; flex-wrap:wrap; gap:7px; margin-top:8px; }
    button { border:1px solid var(--line); background:#fff; color:var(--ink); border-radius:10px; padding:8px 10px; cursor:pointer; font-size:12px; font-weight:700; }
    button:hover { border-color:#70aaa4; background:#eaf7f5; }
    button.primary { border-color:var(--brand); background:var(--brand); color:#fff; }
    button.primary:hover { background:var(--brand2); }
    button.priority-active { border-color:#e4b95e; background:#fff7df; color:#725216; }
    button.danger { color:var(--danger); }
    button:disabled { cursor:not-allowed; opacity:.55; }
    .action-help,.feedback { color:var(--muted); font-size:11px; line-height:1.4; margin-top:7px; }
    .feedback.pending { color:#725b20; }
    .empty { padding:48px 20px; text-align:center; color:var(--muted); border:1px dashed #bfcdd0; border-radius:18px; background:rgba(255,255,255,.62); }
    @media (max-width:900px) { .toolbar{grid-template-columns:1fr 1fr}.toolbar input{grid-column:1/-1} }
    @media (max-width:620px) { main{width:min(100% - 20px,1180px);padding-top:22px} header{display:block}.stamp{text-align:left;margin-top:12px}.toolbar{grid-template-columns:1fr}.toolbar input{grid-column:auto}.job{grid-template-columns:1fr}.actions{border-left:0;border-top:1px solid var(--line);padding:14px 0 0} }
  </style>
</head>
<body>
<main>
  <header><div><div class="eyebrow">ApplyCue</div><h1>Job search, without the noise.</h1><p class="sub">Review the full job and tailored CV, then tell the agent to prepare, apply, change the CV, mark it high stakes, or ignore it.</p></div><div class="stamp" id="stamp"></div></header>
  ${staticNote}
  <section class="metrics" id="metrics"></section>
  <section class="toolbar"><input id="search" type="search" placeholder="Search company, role, location"><select id="status"><option value="all">All stages</option><option value="pending">Pending agent review</option><option value="shortlisted">Shortlisted</option><option value="watch">Watch</option><option value="active">Applied / active</option><option value="rejected">Rejected</option><option value="skipped">Skipped</option>${data.metrics.historical > 0 ? '<option value="history">Imported history</option>' : ''}</select><select id="sort"><option value="rank">High stakes, then rank</option><option value="newest">Newest first</option><option value="company">Company A–Z</option></select></section>
  <div class="count" id="count"></div><section class="jobs" id="jobs"></section>
</main>
<script>
let state=${safeData};
const staticSnapshot=${staticSnapshot ? 'true' : 'false'};
const esc=(value)=>String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fileUrl=(path)=>'/file?path='+encodeURIComponent(path);
function metrics(){const labels={scanned:'Scanned',reviewed:'Agent reviewed',shortlisted:'Shortlisted',attempted:'Attempted',applied:'Applications',unresolved:'Unresolved attempts',rejected:'Rejected',skipped:'Skipped'};if(Number(state.metrics.historical)>0)labels.historical='Imported history';document.querySelector('#metrics').innerHTML=Object.entries(labels).map(([key,label])=>'<article class="metric"><strong>'+esc(state.metrics[key])+'</strong><span>'+label+'</span></article>').join('');}
  const actionNames={prepare:'Prepare application',inspect_form:'Inspect application form',approve_apply:'Approved to apply',request_cv_change:'CV change requested',ignore:'Ignore',mark_high_stakes:'High-stakes treatment selected',mark_standard:'Standard treatment selected'};
  function actionPanel(j){
  const pending=j.feedback?.pendingActions||[], pendingCv=j.feedback?.pendingCvChanges||[];
    const summary=pending.length?'<div class="feedback pending">Waiting for agent: '+pending.map(a=>esc(actionNames[a.action]||a.action)+(a.note?' — '+esc(a.note):'')).join('<br>')+'</div>':'';
    if(['history','active','rejected'].includes(j.group))return '<div class="actions">'+summary+'<div class="action-help">No new action is needed at this stage.</div></div>';
    const priorityAction=j.feedback?.highStakes?'mark_standard':'mark_high_stakes';
    const priorityLabel=j.feedback?.highStakes?'Return to standard':'Mark high stakes';
    const priority='<button type="button" class="'+(j.feedback?.highStakes?'priority-active':'')+'" data-job="'+esc(j.id)+'" data-action="'+priorityAction+'">'+priorityLabel+'</button>';
    const note='<textarea data-note-for="'+esc(j.id)+'" aria-label="Feedback for '+esc(j.company)+' '+esc(j.title)+'" placeholder="Optional: what should change, or why ignore this role?"></textarea>';
  let primary='', secondary='';
  if(pending.some(a=>a.action==='ignore')){
    return '<div class="actions"><button type="button" disabled>Ignore requested</button><div class="action-help">The agent will remove this role from the active queue. Ask in chat if you want to reconsider it.</div>'+summary+'</div>';
  }else if(pendingCv.length){
    primary='<button type="button" disabled>CV change pending</button>';
  }else if(!j.cvBundleFingerprint){
    primary='<button type="button" class="primary" data-job="'+esc(j.id)+'" data-action="prepare">'+(j.decision==='skip'?'Reconsider':'Prepare application')+'</button>';
  }else if(j.preflight?.status==='ready'&&j.preflight.cvBundleFingerprint===j.cvBundleFingerprint&&j.decision==='apply'&&j.reviewState==='current'){
    primary='<button type="button" class="primary" data-job="'+esc(j.id)+'" data-action="approve_apply">Approve &amp; apply</button>';
    secondary='<button type="button" data-job="'+esc(j.id)+'" data-action="request_cv_change">Request CV change</button>';
  }else if(j.decision==='apply'&&j.reviewState==='current'){
    primary='<button type="button" class="primary" data-job="'+esc(j.id)+'" data-action="inspect_form">Inspect application form</button>';
    secondary='<button type="button" data-job="'+esc(j.id)+'" data-action="request_cv_change">Request CV change</button>';
  }else{
    primary='<button type="button" class="primary" data-job="'+esc(j.id)+'" data-action="prepare">Review &amp; prepare</button>';
    secondary='<button type="button" data-job="'+esc(j.id)+'" data-action="request_cv_change">Request CV change</button>';
  }
  const ignore=j.group==='skipped'?'':'<button type="button" class="danger" data-job="'+esc(j.id)+'" data-action="ignore">Ignore</button>';
  const help=j.preflight?.status==='ready'&&j.preflight.cvPath?'Approval is for this role, the current form, and '+esc(j.preflight.cvPath)+'.':'The agent will process this locally; no button submits by itself.';
    return '<div class="actions">'+note+'<div class="action-buttons">'+primary+secondary+priority+ignore+'</div><div class="action-help">'+help+'</div>'+summary+'</div>';
}
function render(){
  metrics(); document.querySelector('#stamp').textContent='Updated '+new Date(state.generatedAt).toLocaleString();
  const q=document.querySelector('#search').value.trim().toLowerCase(), group=document.querySelector('#status').value, sort=document.querySelector('#sort').value;
  let jobs=state.jobs.filter(j=>(group==='all'||j.group===group)&&(!q||[j.company,j.title,j.location,j.notes,j.decisionLabel].join(' ').toLowerCase().includes(q)));
  if(sort==='company')jobs.sort((a,b)=>a.company.localeCompare(b.company));
  else if(sort==='newest')jobs.sort((a,b)=>String(b.date).localeCompare(String(a.date))||Number(b.id)-Number(a.id));
  document.querySelector('#count').textContent=jobs.length+' role'+(jobs.length===1?'':'s')+' shown';
  document.querySelector('#jobs').innerHTML=jobs.length?jobs.map(j=>{
    const links=[j.jobUrl&&'<a href="'+esc(j.jobUrl)+'" target="_blank" rel="noreferrer">Original posting ↗</a>',j.jdPath&&'<a href="'+fileUrl(j.jdPath)+'" target="_blank">Saved full JD</a>',j.reportPath&&'<a href="'+fileUrl(j.reportPath)+'" target="_blank">Agent review</a>',j.pdfPath&&'<a href="'+fileUrl(j.pdfPath)+'" target="_blank">Tailored PDF</a>',j.docxPath&&'<a href="'+fileUrl(j.docxPath)+'" target="_blank">Tailored DOCX</a>',j.highStakesPack?.paths?.pack&&'<a href="'+fileUrl(j.highStakesPack.paths.pack)+'" target="_blank">Campaign pack</a>',j.highStakesPack?.paths?.applicationNarrative&&'<a href="'+fileUrl(j.highStakesPack.paths.applicationNarrative)+'" target="_blank">Application narrative</a>',j.highStakesPack?.paths?.profileChangePlan&&'<a href="'+fileUrl(j.highStakesPack.paths.profileChangePlan)+'" target="_blank">Profile change draft</a>'].filter(Boolean).join('');
    const reviewWarning=['missing','stale'].includes(j.reviewState)?'<div class="feedback">Re-review required: '+esc((j.reviewIssues||[]).join('; '))+'</div>':'';
    const reviewMeta=(/^\\d+$/.test(String(j.rank||''))?'<span class="pill">Rank '+esc(j.rank)+'</span>':'')+(j.confidence&&j.confidence!=='unknown'?'<span class="pill">'+esc(j.confidence)+' confidence</span>':'');
    const attemptMeta=j.attempt?.outcome?'<span class="pill">Attempt '+esc(j.attempt.outcome)+'</span>':'';
    const preflightMeta=j.preflight?.status?'<span class="pill">Form '+esc(j.preflight.status)+'</span>':'';
    const legacyScore=/^\\*?\\*?\\d+(?:\\.\\d+)?\\/5\\*?\\*?$/.test(String(j.score||'').trim())?'<span class="pill">Legacy score '+esc(j.score)+'</span>':'';
    const priorityMeta=j.feedback?.highStakes?'<span class="pill high-stakes">High stakes</span>':'';
    const campaignMeta=j.feedback?.highStakes&&j.highStakesPack?.state?'<span class="pill" title="'+esc((j.highStakesPack.issues||[]).join('; '))+'">Campaign pack '+esc(j.highStakesPack.state)+'</span>':'';
    return '<article class="job"><div><h2><span class="company">'+esc(j.company)+'</span> · '+esc(j.title)+'</h2><div class="meta"><span class="pill decision">'+esc(j.decisionLabel)+'</span>'+priorityMeta+campaignMeta+reviewMeta+'<span class="pill">'+esc(j.status)+'</span>'+preflightMeta+attemptMeta+legacyScore+(j.originLabel?'<span class="pill history">'+esc(j.originLabel)+'</span>':'')+(j.location?'<span class="pill">'+esc(j.location)+'</span>':'')+'<span>'+esc(j.date)+'</span></div>'+(j.notes?'<div class="notes">'+esc(j.notes)+'</div>':'')+'<div class="links">'+links+'</div>'+reviewWarning+'</div>'+actionPanel(j)+'</article>';
  }).join(''):'<div class="empty">'+(state.jobs.length?'No roles match these filters.':'No roles yet. The agent will add them after the first search.')+'</div>';
}
async function submitAction(id,action){
  if(staticSnapshot){alert('Open the live local dashboard to record an action.');return;}
  const note=document.querySelector('textarea[data-note-for="'+CSS.escape(id)+'"]')?.value.trim()||'';
  if(action==='request_cv_change'&&!note){alert('Please describe what should change in the tailored CV.');return;}
  if(action==='approve_apply'&&!confirm('Approve the agent to make this named application using the current CV and inspected form?'))return;
  const response=await fetch('/api/job-action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jobId:id,action,note})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok){alert(result.error||'Could not save this action.');return;} await refresh();
}
async function refresh(){if(staticSnapshot)return;const response=await fetch('/api/state');if(response.ok){state=await response.json();render();}}
document.addEventListener('click',(event)=>{
  const button=event.target.closest('button[data-job][data-action]');
  if(button) submitAction(button.dataset.job,button.dataset.action);
});
document.querySelectorAll('input,select').forEach(el=>el.addEventListener('input',render));render();if(!staticSnapshot)setInterval(refresh,30000);
</script>
</body></html>`;
}

function contentType(filePath) {
  return ({ '.pdf': 'application/pdf', '.md': 'text/markdown; charset=utf-8', '.html': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8' })[extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function allowedFile(root, requestedPath) {
  if (!requestedPath || isAbsolute(requestedPath)) return '';
  const normalized = requestedPath.replaceAll('\\', '/');
  if (!ALLOWED_FILE_ROOTS.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) return '';
  const fullPath = resolve(root, normalized);
  return safeRepoRelative(root, fullPath) && existsSync(fullPath) && statSync(fullPath).isFile() ? fullPath : '';
}

function recordDashboardAction(root, input) {
  const jobId = String(input?.jobId || '').trim();
  const action = String(input?.action || '').trim();
  if (!/^\d+$/.test(jobId)) throw new Error('A numeric jobId is required');
  const job = readDashboardData(root).jobs.find((item) => item.id === jobId);
  if (!job) throw new Error(`Dashboard job #${jobId} was not found`);
  if (job.origin !== 'current') throw new Error('Imported history is read-only');
  if (['active', 'rejected'].includes(job.group)) throw new Error('This role already has a later lifecycle state');
  if (['inspect_form', 'approve_apply'].includes(action) && (job.decision !== 'apply' || job.reviewState !== 'current')) {
    throw new Error('The agent must record a current apply review before this action');
  }
  if (['inspect_form', 'approve_apply', 'request_cv_change'].includes(action) && !job.cvBundleFingerprint) {
    throw new Error('A verified tailored CV is required before this action');
  }
  if (['inspect_form', 'approve_apply'].includes(action) && job.feedback?.pendingCvChanges?.length) {
    throw new Error('Resolve the requested CV changes before continuing');
  }
  if (['inspect_form', 'approve_apply'].includes(action) && job.feedback?.pendingActions?.some((event) => event.action === 'ignore')) {
    throw new Error('The user asked to ignore this role; process or explicitly withdraw that action first');
  }
  if (action === 'approve_apply') {
    if (job.preflight?.status !== 'ready') throw new Error('The live application form must be inspected before approval');
    if (job.preflight.cvBundleFingerprint !== job.cvBundleFingerprint || !job.preflight.cvPath) {
      throw new Error('The live-form inspection belongs to a different CV bundle');
    }
  }
  return appendJobAction(root, {
    jobId,
    company: job.company,
    title: job.title,
    action,
    note: input?.note,
    jobUrl: job.jobUrl,
    jdPath: job.jdPath,
    reviewReceiptId: job.reviewReceiptId,
    jdContentFingerprint: job.jdContentFingerprint,
    cvBundleFingerprint: job.cvBundleFingerprint,
    cvPath: action === 'approve_apply' ? job.preflight?.cvPath : (job.pdfPath || job.docxPath),
    preflightReceiptId: action === 'approve_apply' ? job.preflight?.id : '',
  });
}

async function readJsonBody(request, maxBytes = 32_000) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > maxBytes) throw new Error('request too large');
  }
  return JSON.parse(body || '{}');
}

export function createDashboardServer({ root = ROOT } = {}) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', `http://${LOOPBACK_HOST}`);
      if (request.method === 'GET' && url.pathname === '/') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        response.end(renderDashboardHtml(readDashboardData(root)));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/state') {
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        response.end(JSON.stringify(readDashboardData(root)));
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/job-action') {
        const record = recordDashboardAction(root, await readJsonBody(request));
        response.writeHead(201, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify(record));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/file') {
        const fullPath = allowedFile(root, url.searchParams.get('path') || '');
        if (!fullPath) {
          response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
          response.end('File not found');
          return;
        }
        response.writeHead(200, { 'content-type': contentType(fullPath), 'content-length': statSync(fullPath).size });
        response.end(readFileSync(fullPath));
        return;
      }
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    } catch (error) {
      const diagnostic = error instanceof Error ? (error.stack || error.message) : String(error);
      console.error('Dashboard request failed:', diagnostic);
      response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'Could not process this dashboard request.' }));
    }
  });
}

function openBrowser(url) {
  const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
}

async function main() {
  const args = process.argv.slice(2);
  const requestedPort = Number(args.find((arg) => arg.startsWith('--port='))?.split('=')[1] || DEFAULT_PORT);
  if (!Number.isInteger(requestedPort) || requestedPort < 1024 || requestedPort > 65535) throw new Error('Port must be between 1024 and 65535.');
  const server = createDashboardServer({ root: ROOT });
  server.listen(requestedPort, LOOPBACK_HOST, () => {
    const url = `http://${LOOPBACK_HOST}:${requestedPort}`;
    console.log(`ApplyCue dashboard: ${url}`);
    console.log('Press Ctrl+C to stop.');
    if (!args.includes('--no-open')) openBrowser(url);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
