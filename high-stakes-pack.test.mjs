import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { recordCvBundle } from './cv-bundle.mjs';
import { formatApplyCueCvFrontmatter, renderAtsDocx } from './generate-docx.mjs';
import {
  checkHighStakesPack, highStakesPackStatusForJob, recordHighStakesPack,
} from './high-stakes-pack.mjs';
import { appendJobAction } from './job-feedback.mjs';
import { captureFullJd, recordReviewReceipt } from './review-evidence.mjs';

const root = mkdtempSync(join(tmpdir(), 'applycue-high-stakes-pack-'));
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
    description: 'Acme needs a Product Director to own strategy, customer discovery, delivery, team development, and measurable outcomes. '.repeat(8),
  });
  const review = recordReviewReceipt(root, { jobId: '1', jdPath: capture.path, actorName: 'codex' });
  const metadata = {
    schemaVersion: 'applycue-cv-source-v1',
    jobId: '1', company: 'Acme', role: 'Product Director', jobUrl: 'https://jobs.example.com/acme/1',
    decision: 'apply', reviewReceiptId: review.id, decisionContextFingerprint: review.decisionContextFingerprint,
    jdContentFingerprint: review.jobContentFingerprint,
  };
  const markdown = `${formatApplyCueCvFrontmatter(metadata)}# Jane Doe

## Professional Summary

Product and operations leader who turns customer problems into measurable product outcomes.

## Core Competencies

Product strategy | Customer discovery | Team leadership

## Work Experience

### Example Co — Product Lead

- Led cross-functional product delivery with measurable commercial outcomes.
`;
  const html = `<!doctype html><html><head><title>Jane Doe - Acme Product Director CV</title>
<meta name="applycue-job-id" content="1"><meta name="applycue-company" content="Acme">
<meta name="applycue-role" content="Product Director"><meta name="applycue-job-url" content="https://jobs.example.com/acme/1">
<meta name="applycue-decision" content="apply"><meta name="applycue-review-receipt" content="${review.id}">
<meta name="applycue-decision-context" content="${review.decisionContextFingerprint}">
<meta name="applycue-jd-content" content="${review.jobContentFingerprint}"></head><body>
<h1>Jane Doe</h1><h2>Professional Summary</h2><p>Product and operations leader who turns customer problems into measurable product outcomes.</p>
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
  await recordCvBundle(root, {
    jobId: '1', md: 'output/acme/cv.md', html: 'output/acme/cv.html', pdf: 'output/acme/cv.pdf',
    docx: 'output/acme/cv.docx', actorName: 'codex',
  });

  const pack = `# High-stakes campaign: Acme — Product Director

**Tracker job:** 1
**Company:** Acme
**Role:** Product Director

## Campaign thesis

Lead with customer-backed product choices, operating discipline, and measurable delivery outcomes.

## Perception risks and objections

The scope may look broad; connect it to repeated product ownership and accountable execution.

## Evidence used

Use only confirmed product strategy, customer discovery, leadership, and commercial outcome evidence.

## Narrative choices

Present one coherent product-leadership spine rather than a list of unrelated responsibilities.

## Application messages

The motivation note should explain why Acme's product mandate is the right next operating challenge.

## Verification needed

No material facts remain unconfirmed.

## Consistency impact

The role CV is consistent with the approved evidence and does not require a public-profile change.
`;
  write('output/acme/campaign-pack.md', pack);
  write('output/acme/application-narrative.md', '# Application narrative\n\nAcme needs product leadership that joins customer discovery to disciplined execution and measurable outcomes. This candidate brings that combination across strategy, delivery, and team leadership.\n');

  await assert.rejects(() => recordHighStakesPack(root, {
    jobId: '1', packPath: 'output/acme/campaign-pack.md', actorName: 'codex',
  }), /not marked high stakes/i);
  appendJobAction(root, { jobId: '1', company: 'Acme', title: 'Product Director', action: 'mark_high_stakes' });

  const options = {
    jobId: '1', packPath: 'output/acme/campaign-pack.md',
    applicationNarrativePath: 'output/acme/application-narrative.md', actorName: 'codex',
  };
  const receipt = await recordHighStakesPack(root, options);
  assert.equal(receipt.unchanged, false);
  assert.equal(receipt.artifacts.pack.sha256.length, 64);
  assert.equal((await recordHighStakesPack(root, options)).unchanged, true);
  const current = await checkHighStakesPack(root, '1');
  assert.equal(current.state, 'current');
  assert.equal(current.paths.pack, 'output/acme/campaign-pack.md');
  assert.equal(current.paths.applicationNarrative, 'output/acme/application-narrative.md');

  write('output/acme/campaign-pack.md', `${pack}\nChanged after receipt.\n`);
  const stale = highStakesPackStatusForJob(root, '1');
  assert.equal(stale.state, 'stale');
  assert.match(stale.issues.join(' '), /pack artifact changed/i);
  write('output/acme/campaign-pack.md', pack);

  write('output/acme/wrong-pack.md', pack.replace('**Company:** Acme', '**Company:** Other Co'));
  await assert.rejects(() => recordHighStakesPack(root, { ...options, packPath: 'output/acme/wrong-pack.md' }), /company must exactly match/i);

  appendJobAction(root, { jobId: '1', company: 'Acme', title: 'Product Director', action: 'mark_standard' });
  assert.equal(highStakesPackStatusForJob(root, '1').state, 'not_required');

  console.log('high-stakes-pack tests passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
