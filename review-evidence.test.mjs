import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  assertCurrentReview,
  captureFullJd,
  recordReviewReceipt,
  reviewFreshnessForJob,
} from './review-evidence.mjs';
import { startApplicationAttempt } from './application-attempt.mjs';
import { recordApplicationPreflight } from './application-preflight.mjs';

const root = mkdtempSync(join(tmpdir(), 'applycue-review-evidence-'));
const write = (path, value) => {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, value, 'utf8');
};

try {
  write('config/profile.yml', 'preferences:\n  target_roles: [Product Director]\n  locations: [India]\n');
  write('modes/_profile.md', '# Confirmed profile\n\nRelocation is acceptable at the right economics.\n');
  write('cv.md', '# Candidate\n\nLed product and operations teams with measurable outcomes.\n');
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
- **Preference basis:** Product leadership in India; relocation at the right economics.
- **Reason:** Strong evidence and intent fit.
`);
  write('data/applications.md', `| # | Date | Company | Role | Score | Status | Decision | Rank | Confidence | Origin | PDF | Report | Notes |
|---|------|---------|------|-------|--------|----------|------|------------|--------|-----|--------|-------|
| 1 | 2026-07-14 | Acme | Product Director | N/A | Evaluated | apply | 1 | high | current | ✅ | [001](../reports/001-acme-product-director.md) | [AGENT: APPLY] |
`);

  const jdText = 'Acme is hiring a Product Director in India. ' +
    'The leader will own product strategy, customer discovery, roadmap decisions, cross-functional delivery, team development, operating metrics, and measurable commercial outcomes. '.repeat(3);
  assert.throws(() => captureFullJd(root, {
    jobId: '1', sourceUrl: 'https://jobs.example.com/acme/1', actorName: 'codex',
    liveState: 'live', method: 'agent_browser', confirmedComplete: false, description: jdText,
  }), /confirmedComplete/i);

  const capture = captureFullJd(root, {
    jobId: '1', sourceUrl: 'https://jobs.example.com/acme/1', actorName: 'codex',
    liveState: 'live', method: 'agent_browser', confirmedComplete: true, description: jdText,
  });
  const receipt = recordReviewReceipt(root, { jobId: '1', jdPath: capture.path, actorName: 'codex' });
  assert.equal(receipt.unchanged, false);
  assert.equal(recordReviewReceipt(root, { jobId: '1', jdPath: capture.path, actorName: 'codex' }).unchanged, true);
  assert.equal(reviewFreshnessForJob(root, '1').state, 'current');
  assert.equal(assertCurrentReview(root, '1').effectiveDecision, 'apply');
  write('candidate-positioning.md', '# Confirmed positioning\n\nProduct leader connecting customer discovery to disciplined execution.\n');
  const stalePositioning = reviewFreshnessForJob(root, '1');
  assert.equal(stalePositioning.state, 'stale');
  assert.match(stalePositioning.issues.join(' '), /candidate evidence changed/i);
  rmSync(join(root, 'candidate-positioning.md'));
  assert.equal(reviewFreshnessForJob(root, '1').state, 'current');
  const bundleVerifier = async (_root, _jobId, { selectedPath }) => ({
    selectedArtifact: { kind: 'pdf', path: selectedPath, sha256: 'a'.repeat(64) },
    manifest: { bundleFingerprint: 'b'.repeat(64), reviewReceiptId: receipt.id, jdContentFingerprint: receipt.jobContentFingerprint },
  });
  const preflight = await recordApplicationPreflight(root, {
    jobId: '1', company: 'Acme', title: 'Product Director',
    url: 'https://jobs.example.com/acme/1/apply', cvPath: 'output/acme.pdf',
    visibleCompany: 'Acme', visibleTitle: 'Director of Product',
    pageStage: 'application_form', liveness: 'active', identityConfirmedByAgent: true,
    allVisibleFieldsCaptured: true, inspectionOnly: true, actor: 'codex', tool: 'fixture-browser',
    evidenceRefs: ['fixture:visible-form'],
    fields: [
      { field: 'motivation', label: 'Why this role?', type: 'textarea', required: 'yes', resolution: 'agent_draft' },
      { field: 'resume', label: 'Resume', type: 'file', required: 'yes', resolution: 'selected_cv' },
    ],
  }, { bundleVerifier });
  assert.equal(preflight.status, 'ready');
  assert.equal((await startApplicationAttempt(root, {
    jobId: '1', company: 'Acme', title: 'Product Director',
    url: 'https://jobs.example.com/acme/1/apply', cvPath: 'output/acme.pdf', approvedByUser: true,
  }, { bundleVerifier })).outcome, 'started');

  write('config/profile.yml', 'preferences:\n  target_roles: [Chief Product Officer]\n  locations: [India]\n');
  const stalePreference = reviewFreshnessForJob(root, '1');
  assert.equal(stalePreference.state, 'stale');
  assert.equal(stalePreference.effectiveDecision, 'pending');
  assert.match(stalePreference.issues.join(' '), /preferences changed/i);
  assert.throws(() => assertCurrentReview(root, '1'), /needs a current/i);
  await assert.rejects(() => startApplicationAttempt(root, {
    jobId: '1', company: 'Acme', title: 'Product Director',
    url: 'https://jobs.example.com/acme/1/second-apply', cvPath: 'output/acme.pdf', approvedByUser: true,
  }), /current fingerprint-bound apply review/i);

  recordReviewReceipt(root, { jobId: '1', jdPath: capture.path, actorName: 'codex' });
  assert.equal(reviewFreshnessForJob(root, '1').state, 'current');
  write(capture.path, readFileSync(join(root, capture.path), 'utf8').replace('product strategy', 'portfolio strategy'));
  const staleJd = reviewFreshnessForJob(root, '1');
  assert.equal(staleJd.effectiveDecision, 'pending');
  assert.match(staleJd.issues.join(' '), /JD capture content changed/i);

  console.log('review-evidence tests passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
