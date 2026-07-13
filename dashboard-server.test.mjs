import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Script } from 'node:vm';
import { createDashboardServer, readDashboardData, renderDashboardHtml } from './dashboard-server.mjs';

const root = mkdtempSync(join(tmpdir(), 'applycue-dashboard-'));
try {
  mkdirSync(join(root, 'data'), { recursive: true });
  mkdirSync(join(root, 'reports'), { recursive: true });
  mkdirSync(join(root, 'output'), { recursive: true });
  writeFileSync(join(root, 'data', 'applications.md'), [
    '| # | Date | Company | Role | Location | Score | Status | PDF | Report | Notes |',
    '|---|---|---|---|---|---|---|---|---|---|',
    '| 7 | 2026-07-13 | Acme | Product Lead | Bengaluru | 4.6/5 | Evaluated | ✅ | [007](../reports/007-acme.md) | Strong fit |',
    '| 8 | 2026-07-12 | Beta | PM | Remote | 3.0/5 | SKIP | ❌ | — | Wrong level |'
  ].join('\n'));
  writeFileSync(join(root, 'data', 'scan-history.tsv'), [
    'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation',
    'https://jobs.example/1\t2026-07-13\ttest\tProduct Lead\tAcme\tadded\tBengaluru',
    'https://jobs.example/2\t2026-07-13\ttest\tPM\tBeta\tadded\tRemote'
  ].join('\n') + '\n');
  writeFileSync(join(root, 'reports', '007-acme.md'), '**URL:** https://jobs.example/acme\n# Acme report\n');
  writeFileSync(join(root, 'output', 'acme.pdf'), '%PDF-test');
  writeFileSync(join(root, 'data', 'pdf-index.tsv'), '# report\tpdf\n007\toutput/acme.pdf\n');
  writeFileSync(join(root, 'data', 'application-attempts.jsonl'), [
    JSON.stringify({ attemptId: 'a1', jobId: '7', outcome: 'started' }),
    JSON.stringify({ attemptId: 'a1', jobId: '7', outcome: 'unknown' })
  ].join('\n') + '\n');

  const data = readDashboardData(root);
  assert.deepEqual(data.metrics, { scanned: 2, reviewed: 2, shortlisted: 1, applied: 0, rejected: 0, skipped: 1, attempted: 1, unresolved: 1 });
  assert.equal(data.jobs[0].jobUrl, 'https://jobs.example/acme');
  assert.equal(data.jobs[1].jobUrl, 'https://jobs.example/2');
  assert.equal(data.jobs[0].reportPath, 'reports/007-acme.md');
  assert.equal(data.jobs[0].pdfPath, 'output/acme.pdf');
  const renderedHtml = renderDashboardHtml(data);
  assert.match(renderedHtml, /Job search, without the noise/);
  for (const match of renderedHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    assert.doesNotThrow(() => new Script(match[1], { filename: 'dashboard-inline.js' }));
  }

  const server = createDashboardServer({ root });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await fetch(`${base}/api/state`)).status, 200);
    const feedbackResponse = await fetch(`${base}/api/job-feedback`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: '7', company: 'Acme', title: 'Product Lead', sentiment: 'down', reason: '' })
    });
    assert.equal(feedbackResponse.status, 201);
    const record = JSON.parse(readFileSync(join(root, 'data', 'job-feedback.jsonl'), 'utf8'));
    assert.equal(record.status, 'needs_reason');
    assert.equal((await fetch(`${base}/file?path=${encodeURIComponent('reports/007-acme.md')}`)).status, 200);
    assert.equal((await fetch(`${base}/file?path=${encodeURIComponent('../cv.md')}`)).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  console.log('dashboard-server tests passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
