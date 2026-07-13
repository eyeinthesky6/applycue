#!/usr/bin/env node

/**
 * ApplyCue browser dashboard.
 *
 * The Markdown tracker remains the source of truth. This service only reads it,
 * resolves its report/PDF/job links, and records user fit feedback for the
 * operating agent. Feedback never changes search preferences automatically.
 */

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { parseTrackerRow, resolveColumns } from './tracker-parse.mjs';

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

function loadFeedback(root) {
  const feedbackPath = join(root, 'data', 'job-feedback.jsonl');
  const latestByJob = new Map();
  if (!existsSync(feedbackPath)) return latestByJob;
  for (const line of readFileSync(feedbackPath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (record?.jobId) latestByJob.set(String(record.jobId), record);
    } catch {
      // A malformed historical line must not prevent the dashboard from loading.
    }
  }
  return latestByJob;
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

function loadAttemptMetrics(root) {
  const path = join(root, 'data', 'application-attempts.jsonl');
  const latestByAttempt = new Map();
  if (!existsSync(path)) return { attempted: 0, unresolved: 0 };
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event?.attemptId) latestByAttempt.set(String(event.attemptId), event);
    } catch {
      // Keep the dashboard usable while the agent repairs a malformed line.
    }
  }
  return {
    attempted: latestByAttempt.size,
    unresolved: [...latestByAttempt.values()].filter((event) => ['started', 'unknown'].includes(event.outcome)).length
  };
}

function statusGroup(status) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'evaluated') return 'pending';
  if (['applied', 'responded', 'interview', 'offer'].includes(value)) return 'active';
  if (value === 'rejected') return 'rejected';
  if (['discarded', 'skip'].includes(value)) return 'skipped';
  return 'other';
}

export function readDashboardData(root = ROOT) {
  const tracker = trackerPath(root);
  const lines = existsSync(tracker) ? readFileSync(tracker, 'utf8').split(/\r?\n/) : [];
  const columns = resolveColumns(lines);
  const pdfByReport = loadPdfIndex(root);
  const feedbackByJob = loadFeedback(root);
  const uniqueScanUrls = loadUniqueScanUrls(root);
  const jobs = lines
    .map((line) => parseTrackerRow(line, columns))
    .filter(Boolean)
    .map((row) => {
      const reportLink = parseMarkdownLink(row.report);
      const reportPath = resolveTrackerFile(root, tracker, reportLink?.target || '');
      const reportNumber = normalizeReportNumber(reportLink?.label || '');
      const pdfPath = safeRepoRelative(root, resolve(root, pdfByReport.get(reportNumber) || ''));
      const feedback = feedbackByJob.get(String(row.num));
      return {
        id: String(row.num),
        date: row.date,
        company: row.company,
        title: row.role,
        location: row.location || '',
        score: row.score,
        status: row.status,
        group: statusGroup(row.status),
        notes: row.notes,
        reportPath,
        pdfPath: pdfPath && existsSync(resolve(root, pdfPath)) ? pdfPath : '',
        jobUrl: extractJobUrl(root, reportPath) || uniqueScanUrls.get(exactJobKey(row.company, row.role)) || '',
        feedback: feedback ? {
          sentiment: feedback.sentiment,
          status: feedback.status,
          reason: feedback.reason || ''
        } : null
      };
    });

  const attemptMetrics = loadAttemptMetrics(root);
  const metrics = {
    scanned: countScanned(root),
    reviewed: jobs.length,
    shortlisted: jobs.filter((job) => ['pending', 'active'].includes(job.group)).length,
    applied: jobs.filter((job) => job.group === 'active').length,
    rejected: jobs.filter((job) => job.group === 'rejected').length,
    skipped: jobs.filter((job) => job.group === 'skipped').length,
    ...attemptMetrics
  };

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
    .metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin:20px 0; }
    .metric { background:rgba(255,255,255,.86); border:1px solid var(--line); border-radius:16px; padding:15px; box-shadow:0 6px 20px rgba(23,32,37,.035); }
    .metric strong { display:block; font-size:26px; letter-spacing:-.04em; }
    .metric span { color:var(--muted); font-size:12px; }
    .toolbar { display:grid; grid-template-columns:minmax(220px,1fr) 180px 180px; gap:10px; padding:12px; border:1px solid var(--line); border-radius:16px; background:rgba(255,255,255,.76); position:sticky; top:10px; z-index:2; backdrop-filter:blur(12px); }
    input,select { width:100%; border:1px solid #ccd7d9; background:white; color:var(--ink); border-radius:10px; padding:10px 12px; font:inherit; }
    .count { color:var(--muted); font-size:13px; margin:15px 2px 10px; }
    .jobs { display:grid; gap:10px; }
    .job { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:18px; background:var(--panel); border:1px solid var(--line); border-radius:18px; padding:18px; box-shadow:var(--shadow); }
    .job h2 { margin:0; font-size:18px; letter-spacing:-.02em; }
    .company { color:var(--brand2); font-weight:750; }
    .meta { display:flex; flex-wrap:wrap; gap:7px; color:var(--muted); font-size:12px; margin:8px 0; }
    .pill { border:1px solid var(--line); border-radius:999px; padding:3px 8px; background:var(--wash); }
    .notes { color:#435158; font-size:13px; line-height:1.45; margin-top:8px; }
    .links { display:flex; flex-wrap:wrap; gap:9px; margin-top:12px; }
    a { color:var(--brand2); font-weight:680; font-size:13px; text-decoration:none; }
    a:hover { text-decoration:underline; }
    .fit { display:flex; gap:7px; align-items:start; }
    button { border:1px solid var(--line); background:#fff; border-radius:11px; padding:8px 10px; cursor:pointer; font-size:16px; }
    button:hover,button.selected { border-color:#70aaa4; background:#eaf7f5; }
    button.down.selected { border-color:#e4a09a; background:#fff0ee; }
    .feedback { color:var(--muted); font-size:11px; margin-top:7px; text-align:right; max-width:150px; }
    .empty { padding:48px 20px; text-align:center; color:var(--muted); border:1px dashed #bfcdd0; border-radius:18px; background:rgba(255,255,255,.62); }
    @media (max-width:900px) { .metrics{grid-template-columns:repeat(3,1fr)} .toolbar{grid-template-columns:1fr 1fr}.toolbar input{grid-column:1/-1} }
    @media (max-width:620px) { main{width:min(100% - 20px,1180px);padding-top:22px} header{display:block}.stamp{text-align:left;margin-top:12px}.metrics{grid-template-columns:repeat(2,1fr)}.toolbar{grid-template-columns:1fr}.toolbar input{grid-column:auto}.job{grid-template-columns:1fr}.fit{justify-content:flex-start}.feedback{text-align:left} }
  </style>
</head>
<body>
<main>
  <header><div><div class="eyebrow">ApplyCue</div><h1>Job search, without the noise.</h1><p class="sub">The agent reviews full job descriptions. This page shows the resulting queue and records your feedback for the next tuning conversation.</p></div><div class="stamp" id="stamp"></div></header>
  ${staticNote}
  <section class="metrics" id="metrics"></section>
  <section class="toolbar"><input id="search" type="search" placeholder="Search company, role, location"><select id="status"><option value="all">All stages</option><option value="pending">Ready to review</option><option value="active">Applied / active</option><option value="rejected">Rejected</option><option value="skipped">Skipped</option></select><select id="sort"><option value="newest">Newest first</option><option value="score">Highest score</option><option value="company">Company A–Z</option></select></section>
  <div class="count" id="count"></div><section class="jobs" id="jobs"></section>
</main>
<script>
let state=${safeData};
const staticSnapshot=${staticSnapshot ? 'true' : 'false'};
const esc=(value)=>String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fileUrl=(path)=>'/file?path='+encodeURIComponent(path);
function metrics(){const labels={scanned:'Scanned',reviewed:'Agent reviewed',shortlisted:'Shortlisted',attempted:'Attempted',applied:'Applied / active',unresolved:'Unresolved attempts',rejected:'Rejected',skipped:'Skipped'};document.querySelector('#metrics').innerHTML=Object.entries(labels).map(([key,label])=>'<article class="metric"><strong>'+esc(state.metrics[key])+'</strong><span>'+label+'</span></article>').join('');}
function render(){
  metrics(); document.querySelector('#stamp').textContent='Updated '+new Date(state.generatedAt).toLocaleString();
  const q=document.querySelector('#search').value.trim().toLowerCase(), group=document.querySelector('#status').value, sort=document.querySelector('#sort').value;
  let jobs=state.jobs.filter(j=>(group==='all'||j.group===group)&&(!q||[j.company,j.title,j.location,j.notes].join(' ').toLowerCase().includes(q)));
  jobs.sort((a,b)=>sort==='score'?(parseFloat(b.score)||0)-(parseFloat(a.score)||0):sort==='company'?a.company.localeCompare(b.company):String(b.date).localeCompare(String(a.date))||Number(b.id)-Number(a.id));
  document.querySelector('#count').textContent=jobs.length+' role'+(jobs.length===1?'':'s')+' shown';
  document.querySelector('#jobs').innerHTML=jobs.length?jobs.map(j=>{
    const links=[j.jobUrl&&'<a href="'+esc(j.jobUrl)+'" target="_blank" rel="noreferrer">Job posting ↗</a>',j.reportPath&&'<a href="'+fileUrl(j.reportPath)+'" target="_blank">Review report</a>',j.pdfPath&&'<a href="'+fileUrl(j.pdfPath)+'" target="_blank">Tailored CV</a>'].filter(Boolean).join('');
    const feedback=j.feedback?'<div class="feedback">'+(j.feedback.reason?esc(j.feedback.reason):j.feedback.status==='needs_reason'?'Reason needed — the agent will ask':'Feedback saved')+'</div>':'';
    return '<article class="job"><div><h2><span class="company">'+esc(j.company)+'</span> · '+esc(j.title)+'</h2><div class="meta"><span class="pill">'+esc(j.status)+'</span><span class="pill">'+esc(j.score||'No score')+'</span>'+(j.location?'<span class="pill">'+esc(j.location)+'</span>':'')+'<span>'+esc(j.date)+'</span></div>'+(j.notes?'<div class="notes">'+esc(j.notes)+'</div>':'')+'<div class="links">'+links+'</div></div><div><div class="fit" aria-label="Fit feedback"><button title="This fits" data-job="'+esc(j.id)+'" data-sentiment="up" class="'+(j.feedback?.sentiment==='up'?'selected':'')+'">👍</button><button title="This does not fit" data-job="'+esc(j.id)+'" data-sentiment="down" class="down '+(j.feedback?.sentiment==='down'?'selected':'')+'">👎</button></div>'+feedback+'</div></article>';
  }).join(''):'<div class="empty">'+(state.jobs.length?'No roles match these filters.':'No roles yet. The agent will add them after the first search.')+'</div>';
}
async function feedback(id,sentiment){
  if(staticSnapshot){alert('Run npm run dashboard to record feedback.');return;}
  const job=state.jobs.find(j=>j.id===id); let reason='';
  if(sentiment==='down') reason=prompt('What does not fit? Leave blank if you want the agent to ask in chat.')||'';
  const response=await fetch('/api/job-feedback',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jobId:id,company:job.company,title:job.title,sentiment,reason})});
  if(!response.ok){alert('Could not save feedback.');return;} await refresh();
}
async function refresh(){if(staticSnapshot)return;const response=await fetch('/api/state');if(response.ok){state=await response.json();render();}}
document.addEventListener('click',(event)=>{
  const button=event.target.closest('button[data-job][data-sentiment]');
  if(button) feedback(button.dataset.job,button.dataset.sentiment);
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

function appendFeedback(root, input) {
  const sentiment = input?.sentiment;
  if (!['up', 'down'].includes(sentiment)) throw new Error('sentiment must be up or down');
  const jobId = String(input?.jobId || '').trim();
  const company = String(input?.company || '').trim().slice(0, 200);
  const title = String(input?.title || '').trim().slice(0, 240);
  const reason = String(input?.reason || '').trim().slice(0, 1000);
  if (!/^\d+$/.test(jobId) || !company || !title) throw new Error('jobId, company, and title are required');
  const record = {
    id: randomUUID(), jobId, company, title, sentiment,
    status: sentiment === 'down' && !reason ? 'needs_reason' : 'captured',
    ...(reason ? { reason } : {}), actor: 'dashboard', createdAt: new Date().toISOString()
  };
  const outputPath = join(root, 'data', 'job-feedback.jsonl');
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(record)}\n`, { flag: 'a', encoding: 'utf8' });
  return record;
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
      if (request.method === 'POST' && url.pathname === '/api/job-feedback') {
        const record = appendFeedback(root, await readJsonBody(request));
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
      response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
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
