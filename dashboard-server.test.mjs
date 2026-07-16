import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Script } from 'node:vm';
import { compareDashboardQueue, createDashboardServer, readDashboardData, renderDashboardHtml } from './dashboard-server.mjs';
import { captureFullJd, recordReviewReceipt } from './review-evidence.mjs';
import { resolveJobAction } from './job-feedback.mjs';

const root = mkdtempSync(join(tmpdir(), 'applycue-dashboard-'));
try {
  mkdirSync(join(root, 'data'), { recursive: true });
  mkdirSync(join(root, 'reports'), { recursive: true });
  mkdirSync(join(root, 'output'), { recursive: true });
  writeFileSync(join(root, 'data', 'applications.md'), [
    '| # | Date | Company | Role | Location | Score | Status | Decision | Rank | Confidence | Origin | PDF | Report | Notes |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    '| 7 | 2026-07-13 | Acme | Product Lead | Bengaluru | N/A | Evaluated | apply | 1 | high | current | ✅ | [007](../reports/007-acme.md) | Strong fit |',
    '| 8 | 2026-07-12 | Beta | PM | Remote | N/A | SKIP | skip | — | medium | current | ❌ | [008](../reports/008-beta.md) | Wrong level |',
    '| 9 | 2026-06-01 | Legacy Co | Director | Mumbai | 4.8/5 | Evaluated | apply | — | unknown | legacy_import | ❌ | — | Old imported row |'
  ].join('\n'));
  writeFileSync(join(root, 'data', 'scan-history.tsv'), [
    'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation',
    'https://jobs.example/1\t2026-07-13\ttest\tProduct Lead\tAcme\tadded\tBengaluru',
    'https://jobs.example/2\t2026-07-13\ttest\tPM\tBeta\tadded\tRemote'
    ,'https://jobs.example/3\t2026-06-01\ttest\tDirector\tLegacy Co\tadded\tMumbai'
  ].join('\n') + '\n');
  mkdirSync(join(root, 'config'), { recursive: true });
  mkdirSync(join(root, 'modes'), { recursive: true });
  const confirmedProfile = 'preferences:\n  target_roles: [Product Lead]\n';
  writeFileSync(join(root, 'config', 'profile.yml'), confirmedProfile);
  writeFileSync(join(root, 'modes', '_profile.md'), '# Confirmed preferences\n');
  writeFileSync(join(root, 'cv.md'), '# Candidate\n\nProduct leadership evidence.\n');
  writeFileSync(join(root, 'reports', '007-acme.md'), '# Acme report\n\n**URL:** https://jobs.example/acme\n**Decision:** apply\n**Rank:** 1\n**Confidence:** high\n\n## Review receipt\n\n- **Preference basis:** Product leadership.\n');
  writeFileSync(join(root, 'reports', '008-beta.md'), '# Beta report\n\n**URL:** https://jobs.example/2\n**Decision:** skip\n**Rank:** —\n**Confidence:** medium\n\n## Review receipt\n\n- **Preference basis:** Product leadership.\n');
  const reviewEvidence = new Map();
  for (const job of [
    { jobId: '7', sourceUrl: 'https://jobs.example/acme' },
    { jobId: '8', sourceUrl: 'https://jobs.example/2' },
  ]) {
    const capture = captureFullJd(root, {
      ...job, actorName: 'codex', liveState: 'live', method: 'agent_browser', confirmedComplete: true,
      description: `Complete visible job description for tracker job ${job.jobId}. `.repeat(12),
    });
    const receipt = recordReviewReceipt(root, { jobId: job.jobId, jdPath: capture.path, actorName: 'codex' });
    reviewEvidence.set(job.jobId, { capture, receipt });
  }
  writeFileSync(join(root, 'output', 'acme.pdf'), '%PDF-test');
  writeFileSync(join(root, 'output', 'acme.docx'), 'DOCX-test');
  const writeBundleIndex = (bundleFingerprint) => {
    const { capture, receipt } = reviewEvidence.get('7');
    const manifest = {
      jobId: '7', bundleFingerprint, jdPath: capture.path, reviewReceiptId: receipt.id,
      jdContentFingerprint: receipt.jobContentFingerprint,
      artifacts: { pdf: { path: 'output/acme.pdf' }, docx: { path: 'output/acme.docx' } },
    };
    writeFileSync(join(root, 'data', 'pdf-index.tsv'), `# report\tpdf\thtml\tformat\tdate\tbundle_json\n007\toutput/acme.pdf\t\ta4\t2026-07-14\t${JSON.stringify(manifest)}\n`);
  };
  writeBundleIndex('bundle-7');
  writeFileSync(join(root, 'data', 'application-attempts.jsonl'), [
    JSON.stringify({ attemptId: 'a1', jobId: '7', outcome: 'started' }),
    JSON.stringify({ attemptId: 'a1', jobId: '7', outcome: 'unknown' }),
    JSON.stringify({ attemptId: 'old1', jobId: '9', outcome: 'confirmed' })
  ].join('\n') + '\n');
  writeFileSync(join(root, 'data', 'application-preflights.jsonl'), JSON.stringify({
    id: 'p7', jobId: '7', status: 'ready', createdAt: '2026-07-14T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z', reasons: [], cvPath: 'output/acme.pdf', cvBundleFingerprint: 'bundle-7',
  }) + '\n');

  const data = readDashboardData(root);
  assert.deepEqual(data.metrics, { scanned: 3, reviewed: 2, shortlisted: 1, applied: 0, rejected: 0, skipped: 1, historical: 1, attempted: 1, unresolved: 1 });
  assert.equal(data.jobs[0].jobUrl, 'https://jobs.example/acme');
  assert.equal(data.jobs[1].jobUrl, 'https://jobs.example/2');
  assert.equal(data.jobs[0].reportPath, 'reports/007-acme.md');
  assert.equal(data.jobs[0].pdfPath, 'output/acme.pdf');
  assert.equal(data.jobs[0].docxPath, 'output/acme.docx');
  assert.match(data.jobs[0].jdPath, /^jds\//);
  assert.equal(data.jobs[0].cvBundleFingerprint, 'bundle-7');
  assert.equal(data.jobs[0].decision, 'apply');
  assert.equal(data.jobs[0].rank, '1');
  assert.equal(data.jobs[0].confidence, 'high');
  assert.equal(data.jobs[0].originLabel, '');
  assert.equal(data.jobs[0].attempt.outcome, 'unknown');
  assert.equal(data.jobs[0].attempt.attemptId, 'a1');
  assert.equal(data.jobs[0].preflight.status, 'ready');
  assert.equal(data.jobs[0].highStakesPack.state, 'not_required');
  assert.equal(data.jobs[2].group, 'history');
  assert.equal(data.jobs[2].originLabel, 'Imported history');
  assert.ok(compareDashboardQueue(
    { id: '10', date: '2026-07-14', rank: '—', group: 'pending', feedback: { highStakes: true } },
    { id: '7', date: '2026-07-13', rank: '1', group: 'shortlisted', feedback: { highStakes: false } },
  ) < 0, 'a viable high-stakes role should precede a standard ranked role');
  assert.ok(compareDashboardQueue(
    { id: '8', date: '2026-07-14', rank: '—', group: 'skipped', feedback: { highStakes: true } },
    { id: '7', date: '2026-07-13', rank: '1', group: 'shortlisted', feedback: { highStakes: false } },
  ) > 0, 'high stakes should not revive a skipped role');
  writeFileSync(join(root, 'config', 'profile.yml'), 'preferences:\n  target_roles: [Chief Product Officer]\n');
  const staleData = readDashboardData(root);
  assert.equal(staleData.jobs[0].decision, 'pending');
  assert.equal(staleData.jobs[0].rank, '—');
  assert.equal(staleData.jobs[0].reviewState, 'stale');
  assert.equal(staleData.jobs[1].group, 'pending');
  assert.equal(staleData.metrics.shortlisted, 0);
  assert.equal(staleData.metrics.skipped, 0);
  writeFileSync(join(root, 'config', 'profile.yml'), confirmedProfile);
  const renderedHtml = renderDashboardHtml(data);
  assert.match(renderedHtml, /Job search, without the noise/);
  assert.match(renderedHtml, /Imported history/);
  assert.match(renderedHtml, /const attemptMeta=/);
  assert.match(renderedHtml, /const preflightMeta=/);
  assert.match(renderedHtml, /"preflight":\{"id":"p7","status":"ready"/);
  assert.match(renderedHtml, /"outcome":"unknown"/);
  assert.match(renderedHtml, /High stakes, then rank/);
  assert.match(renderedHtml, /Approve &amp; apply/);
  assert.match(renderedHtml, /Saved full JD/);
  assert.match(renderedHtml, /Tailored DOCX/);
  assert.match(renderedHtml, /Request CV change/);
  assert.doesNotMatch(renderedHtml, /data-sentiment=/);
  assert.doesNotMatch(renderedHtml, /Highest score/);
  const newUserHtml = renderDashboardHtml({ ...data, metrics: { ...data.metrics, historical: 0 }, jobs: data.jobs.filter((job) => job.origin === 'current') });
  assert.doesNotMatch(newUserHtml, /<option value="history">/);
  assert.doesNotMatch(newUserHtml, /"originLabel":"Imported history"/);
  for (const match of renderedHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    assert.doesNotThrow(() => new Script(match[1], { filename: 'dashboard-inline.js' }));
  }

  const server = createDashboardServer({ root });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await fetch(`${base}/api/state`)).status, 200);
    const diagnostics = [];
    const originalConsoleError = console.error;
    console.error = (...args) => diagnostics.push(args.map(String).join(' '));
    try {
      const malformedResponse = await fetch(`${base}/api/job-action`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jobId":',
      });
      assert.equal(malformedResponse.status, 400);
      assert.deepEqual(await malformedResponse.json(), { error: 'Could not process this dashboard request.' });
      assert.ok(diagnostics.some((line) => /dashboard request failed/i.test(line)));
    } finally {
      console.error = originalConsoleError;
    }
    const feedbackResponse = await fetch(`${base}/api/job-action`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: '7', action: 'request_cv_change', note: 'Emphasize logistics products.' })
    });
    assert.equal(feedbackResponse.status, 201);
    const record = JSON.parse(readFileSync(join(root, 'data', 'job-feedback.jsonl'), 'utf8').trim().split(/\r?\n/)[0]);
    assert.equal(record.action, 'request_cv_change');
    assert.equal(record.cvBundleFingerprint, 'bundle-7');

    const highStakesResponse = await fetch(`${base}/api/job-action`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: '8', action: 'mark_high_stakes' }),
    });
    assert.equal(highStakesResponse.status, 201);
    let liveState = await (await fetch(`${base}/api/state`)).json();
    assert.equal(liveState.jobs.find((job) => job.id === '8').feedback.highStakes, true);
    assert.equal(liveState.jobs.find((job) => job.id === '8').highStakesPack.state, 'missing');
    const highStakesHtml = await (await fetch(base)).text();
    assert.match(highStakesHtml, /High stakes/);
    assert.match(highStakesHtml, /Return to standard/);
    assert.match(highStakesHtml, /const campaignMeta=/);
    assert.match(highStakesHtml, /"highStakesPack":\{"state":"missing"/);
    assert.equal((await fetch(`${base}/api/job-action`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: '8', action: 'mark_standard' }),
    })).status, 201);
    liveState = await (await fetch(`${base}/api/state`)).json();
    assert.equal(liveState.jobs.find((job) => job.id === '8').feedback.highStakes, false);

    assert.equal((await fetch(`${base}/api/job-action`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: '7', action: 'approve_apply' }),
    })).status, 400);
    resolveJobAction(root, { eventId: record.id, actorName: 'codex', bundleFingerprint: 'bundle-8' });
    writeBundleIndex('bundle-8');
    writeFileSync(join(root, 'data', 'application-preflights.jsonl'), JSON.stringify({
      id: 'p8', jobId: '7', status: 'ready', createdAt: '2026-07-14T00:10:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z', reasons: [], cvPath: 'output/acme.pdf', cvBundleFingerprint: 'bundle-8',
    }) + '\n');
    const approvalResponse = await fetch(`${base}/api/job-action`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId: '7', action: 'approve_apply' }),
    });
    assert.equal(approvalResponse.status, 201);
    const approval = await approvalResponse.json();
    assert.equal(approval.action, 'approve_apply');
    assert.equal(approval.preflightReceiptId, 'p8');
    assert.equal(approval.approvedByUser, true);
    assert.equal((await fetch(`${base}/file?path=${encodeURIComponent('reports/007-acme.md')}`)).status, 200);
    assert.equal((await fetch(`${base}/file?path=${encodeURIComponent(data.jobs[0].jdPath)}`)).status, 200);
    assert.equal((await fetch(`${base}/file?path=${encodeURIComponent('output/acme.docx')}`)).status, 200);
    assert.equal((await fetch(`${base}/file?path=${encodeURIComponent('../cv.md')}`)).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  console.log('dashboard-server tests passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
