import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  assertCurrentCvBundle, cvBundleFreshnessForJob, recordCvBundle,
} from './cv-bundle.mjs';
import { formatApplyCueCvFrontmatter, renderAtsDocx } from './generate-docx.mjs';
import { captureFullJd, recordReviewReceipt } from './review-evidence.mjs';

const root = mkdtempSync(join(tmpdir(), 'applycue-cv-bundle-'));
const write = (path, value) => {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, value);
};

try {
  write('config/profile.yml', 'preferences:\n  target_roles: [Product Director]\n  locations: [India]\n');
  write('modes/_profile.md', '# Confirmed profile\n\nIndia product leadership.\n');
  write('cv.md', '# Jane Doe\n\nApproved product leadership evidence.\n');
  write('reports/001-acme-product-director.md', `# Evaluation: Acme — Product Director

**Date:** 2026-07-14
**URL:** https://jobs.example.com/acme/1
**Decision:** apply
**Rank:** 1
**Confidence:** high

## Review receipt

- **Strengths:** Product leadership.
- **Gaps:** None material.
- **Unknowns:** Compensation.
- **Preference basis:** Product leadership in India.
- **Reason:** Strong evidence and intent fit.
`);
  write('data/applications.md', `| # | Date | Company | Role | Score | Status | Decision | Rank | Confidence | Origin | PDF | Report | Notes |
|---|------|---------|------|-------|--------|----------|------|------------|--------|-----|--------|-------|
| 1 | 2026-07-14 | Acme | Product Director | N/A | Evaluated | apply | 1 | high | current | ✅ | [001](../reports/001-acme-product-director.md) | [AGENT: APPLY] |
`);
  const capture = captureFullJd(root, {
    jobId: '1', sourceUrl: 'https://jobs.example.com/acme/1', actorName: 'codex', liveState: 'live',
    method: 'agent_browser', confirmedComplete: true,
    description: 'Acme needs a Product Director to own product strategy, customer discovery, roadmap decisions, cross-functional delivery, team development, operating metrics, and measurable commercial outcomes. '.repeat(7),
  });
  const receipt = recordReviewReceipt(root, { jobId: '1', jdPath: capture.path, actorName: 'codex' });
  const metadata = {
    schemaVersion: 'applycue-cv-source-v1',
    jobId: '1', company: 'Acme', role: 'Product Director', jobUrl: 'https://jobs.example.com/acme/1',
    decision: 'apply', reviewReceiptId: receipt.id,
    decisionContextFingerprint: receipt.decisionContextFingerprint,
    jdContentFingerprint: receipt.jobContentFingerprint,
  };
  const markdown = `${formatApplyCueCvFrontmatter(metadata)}# Jane Doe

## Professional Summary

Product and operations leader who turns customer problems into measurable product outcomes and repeatable delivery systems.

## Core Competencies

Product strategy | Customer discovery | Team leadership

## Work Experience

### Example Co — Product Lead

- Led cross-functional product delivery with measurable commercial outcomes.
`;
  const html = `<!doctype html><html><head><title>Jane Doe - Acme Product Director CV</title>
<meta name="applycue-job-id" content="1"><meta name="applycue-company" content="Acme">
<meta name="applycue-role" content="Product Director"><meta name="applycue-job-url" content="https://jobs.example.com/acme/1">
<meta name="applycue-decision" content="apply"><meta name="applycue-review-receipt" content="${receipt.id}">
<meta name="applycue-decision-context" content="${receipt.decisionContextFingerprint}">
<meta name="applycue-jd-content" content="${receipt.jobContentFingerprint}"></head><body>
<h1>Jane Doe</h1><h2>Professional Summary</h2><p>Product and operations leader who turns customer problems into measurable product outcomes and repeatable delivery systems.</p>
<h2>Core Competencies</h2><p>Product strategy | Customer discovery | Team leadership</p></body></html>`;
  const pdf = Buffer.concat([
    Buffer.from('%PDF-1.7\n1 0 obj << /Title (Jane Doe - Acme Product Director CV) /Type /Page >> endobj\n'),
    Buffer.alloc(1_200, 32), Buffer.from('\n%%EOF\n'),
  ]);
  write('output/acme/cv.md', markdown);
  write('output/acme/cv.html', html);
  write('output/acme/cv.pdf', pdf);
  write('output/acme/cv.docx', await renderAtsDocx(markdown));
  write('data/pdf-index.tsv', '# report\tpdf\thtml\tformat\tdate — legacy compatible\n001\toutput/acme/cv.pdf\toutput/acme/cv.html\ta4\t2026-07-14\n');

  const options = {
    jobId: '1', md: 'output/acme/cv.md', html: 'output/acme/cv.html', pdf: 'output/acme/cv.pdf',
    docx: 'output/acme/cv.docx', actorName: 'codex',
  };
  const bundle = await recordCvBundle(root, options);
  assert.equal(bundle.unchanged, false);
  assert.equal(bundle.artifacts.pdf.sha256.length, 64);
  assert.equal(bundle.artifacts.docx.entries > 5, true);
  assert.equal((await recordCvBundle(root, options)).unchanged, true);
  const current = await cvBundleFreshnessForJob(root, '1', { selectedPath: 'output/acme/cv.pdf' });
  assert.equal(current.state, 'current');
  assert.equal(current.selectedArtifact.kind, 'pdf');
  assert.equal((await assertCurrentCvBundle(root, '1', { selectedPath: 'output/acme/cv.docx' })).state, 'current');
  await assert.rejects(() => assertCurrentCvBundle(root, '1', { selectedPath: 'output/acme/cv.md' }), /selected upload/i);

  write('output/acme/cv.pdf', Buffer.concat([pdf, Buffer.from('changed')]));
  const changedPdf = await cvBundleFreshnessForJob(root, '1');
  assert.equal(changedPdf.state, 'stale');
  assert.match(changedPdf.issues.join(' '), /PDF artifact changed/i);
  write('output/acme/cv.pdf', pdf);

  write('output/acme/cv.docx', await renderAtsDocx('# Jane Doe\n\n## Professional Summary\n\nGeneric unrelated document with no job metadata.'));
  await assert.rejects(() => recordCvBundle(root, options), /DOCX metadata/i);
  write('output/acme/cv.docx', await renderAtsDocx(markdown));

  write('config/profile.yml', 'preferences:\n  target_roles: [Chief Product Officer]\n  locations: [India]\n');
  const staleReview = await cvBundleFreshnessForJob(root, '1');
  assert.equal(staleReview.state, 'stale');
  assert.match(staleReview.issues.join(' '), /current apply review|preferences changed/i);

  write('data/pdf-index.tsv', '# report\tpdf\thtml\tformat\tdate — legacy row\n001\toutput/acme/cv.pdf\toutput/acme/cv.html\ta4\t2026-07-14\n');
  assert.equal((await cvBundleFreshnessForJob(root, '1')).state, 'stale');

  console.log('cv-bundle tests passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
