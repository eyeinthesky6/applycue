import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finishApplicationAttempt, latestAttemptForJob, latestAttemptForUrl, startApplicationAttempt } from './application-attempt.mjs';
import { appendJobAction, resolveJobAction } from './job-feedback.mjs';

const root = mkdtempSync(join(tmpdir(), 'applycue-attempt-'));
try {
  await assert.rejects(() => startApplicationAttempt(root, { jobId: '1', company: 'Acme', title: 'PM', url: 'https://jobs.example/1' }), /approval/i);
  await assert.rejects(() => startApplicationAttempt(root, {
    jobId: '1', company: 'Acme', title: 'PM', url: 'https://jobs.example/1', cvPath: 'output/acme.pdf', approvedByUser: true,
  }), /tracker|review/i);
  const verified = {
    reviewVerifier: () => ({ state: 'current', effectiveDecision: 'apply', row: { company: 'Acme', role: 'PM' } }),
    bundleVerifier: async (_root, _jobId, { selectedPath }) => ({
      selectedArtifact: { kind: 'pdf', path: selectedPath, sha256: 'a'.repeat(64) },
      manifest: {
        bundleFingerprint: 'b'.repeat(64), reviewReceiptId: 'review-1', jdContentFingerprint: 'c'.repeat(64),
      },
    }),
    preflightVerifier: async (_root, { jobId }) => ({
      id: `preflight-${jobId}`, status: 'ready', answersFingerprint: 'd'.repeat(64), expiresAt: '2099-01-01T00:00:00.000Z',
    }),
  };
  const started = await startApplicationAttempt(root, {
    jobId: '1', company: 'Acme', title: 'PM', url: 'https://jobs.example/1', cvPath: 'output/acme.pdf', approvedByUser: true,
  }, verified);
  assert.equal(started.cvPath, 'output/acme.pdf');
  assert.equal(started.cvSha256, 'a'.repeat(64));
  assert.equal(started.cvBundleFingerprint, 'b'.repeat(64));
  assert.equal(started.preflightReceiptId, 'preflight-1');
  await assert.rejects(() => startApplicationAttempt(root, {
    jobId: '9', company: 'Acme', title: 'PM', url: 'https://jobs.example/9', cvPath: 'output/acme-9.pdf', approvedByUser: true,
  }, { ...verified, preflightVerifier: async () => null }), /ready live-form preflight/i);
  assert.equal(latestAttemptForJob(root, '1').outcome, 'started');
  const unknown = await finishApplicationAttempt(root, { attemptId: started.attemptId, outcome: 'unknown', evidence: 'Browser closed after submit click' });
  assert.equal(unknown.outcome, 'unknown');
  await assert.rejects(() => startApplicationAttempt(root, {
    jobId: '1', company: 'Acme', title: 'PM', url: 'https://jobs.example/1', cvPath: 'output/acme.pdf', approvedByUser: true,
  }, verified), /reconcile/i);
  assert.equal(latestAttemptForUrl(root, 'https://JOBS.example/1/#details').outcome, 'unknown');
  await assert.rejects(() => startApplicationAttempt(root, {
    jobId: '2', company: 'Acme', title: 'PM', url: 'https://jobs.example/1/', cvPath: 'output/acme-2.pdf', approvedByUser: true,
  }, verified), /exact job/i);
  const otherPosting = await startApplicationAttempt(root, {
    jobId: '3', company: 'Acme', title: 'PM', url: 'https://jobs.example/2', cvPath: 'output/acme-3.pdf', approvedByUser: true,
  }, verified);
  assert.equal(otherPosting.outcome, 'started');
  const trackerCalls = [];
  const confirmed = await finishApplicationAttempt(root, { attemptId: otherPosting.attemptId, outcome: 'confirmed', evidence: 'Application received' }, {
    trackerUpdater: async (_root, input) => {
      trackerCalls.push(input);
      return { jobId: '3', previousStatus: 'Evaluated', status: 'Applied', changed: true };
    },
  });
  assert.equal(confirmed.outcome, 'confirmed');
  assert.equal(confirmed.trackerStatus, 'Applied');
  assert.equal(confirmed.trackerPreviousStatus, 'Evaluated');
  assert.equal(confirmed.trackerChanged, true);
  assert.deepEqual(trackerCalls, [{ jobId: '3', status: 'Applied', company: 'Acme', title: 'PM' }]);
  const blockedPosting = await startApplicationAttempt(root, {
    jobId: '4', company: 'Acme', title: 'PM', url: 'https://jobs.example/4', cvPath: 'output/acme-4.pdf', approvedByUser: true,
  }, verified);
  await assert.rejects(() => finishApplicationAttempt(root, { attemptId: blockedPosting.attemptId, outcome: 'confirmed' }, {
    trackerUpdater: async () => { throw new Error('tracker identity drift'); },
  }), /identity drift/i);
  assert.equal(latestAttemptForJob(root, '4').outcome, 'started');
  const failedPosting = await startApplicationAttempt(root, {
    jobId: '5', company: 'Acme', title: 'PM', url: 'https://jobs.example/5', cvPath: 'output/acme-5.pdf', approvedByUser: true,
  }, verified);
  await finishApplicationAttempt(root, { attemptId: failedPosting.attemptId, outcome: 'failed', evidence: 'Form rejected input' });
  await assert.rejects(() => startApplicationAttempt(root, {
    jobId: '5', company: 'Acme', title: 'PM', url: 'https://jobs.example/5', cvPath: 'output/acme-5.pdf', approvedByUser: true, override: true,
  }, verified), /preflight was already used/i);
  const dashboardApproval = appendJobAction(root, {
    jobId: '6', company: 'Acme', title: 'PM', action: 'approve_apply',
    cvBundleFingerprint: 'b'.repeat(64), cvPath: 'output/acme-6.pdf', preflightReceiptId: 'preflight-6',
  });
  const dashboardStarted = await startApplicationAttempt(root, {
    jobId: '6', company: 'Acme', title: 'PM', url: 'https://jobs.example/6', cvPath: 'output/acme-6.pdf',
    approvalReceiptId: dashboardApproval.id,
  }, verified);
  assert.equal(dashboardStarted.approvalSource, 'dashboard');
  assert.equal(dashboardStarted.dashboardApprovalReceiptId, dashboardApproval.id);

  const cvChange = appendJobAction(root, {
    jobId: '7', company: 'Acme', title: 'PM', action: 'request_cv_change', note: 'Correct the product emphasis.',
    cvBundleFingerprint: 'b'.repeat(64), cvPath: 'output/acme-7.pdf',
  });
  await assert.rejects(() => startApplicationAttempt(root, {
    jobId: '7', company: 'Acme', title: 'PM', url: 'https://jobs.example/7', cvPath: 'output/acme-7.pdf', approvedByUser: true,
  }, verified), /user-requested CV changes/i);
  resolveJobAction(root, { eventId: cvChange.id, actorName: 'codex', bundleFingerprint: 'e'.repeat(64) });
  await assert.rejects(() => startApplicationAttempt(root, {
    jobId: '7', company: 'Acme', title: 'PM', url: 'https://jobs.example/7', cvPath: 'output/acme-7.pdf', approvedByUser: true,
  }, verified), /user-requested CV changes/i);
  const revised = await startApplicationAttempt(root, {
    jobId: '7', company: 'Acme', title: 'PM', url: 'https://jobs.example/7', cvPath: 'output/acme-7.pdf', approvedByUser: true,
  }, {
    ...verified,
    bundleVerifier: async (_root, _jobId, { selectedPath }) => ({
      selectedArtifact: { kind: 'pdf', path: selectedPath, sha256: 'f'.repeat(64) },
      manifest: { bundleFingerprint: 'e'.repeat(64), reviewReceiptId: 'review-7', jdContentFingerprint: 'c'.repeat(64) },
    }),
  });
  assert.equal(revised.cvBundleFingerprint, 'e'.repeat(64));
  await assert.rejects(() => finishApplicationAttempt(root, { attemptId: started.attemptId, outcome: 'confirmed' }), /already unknown/i);
  console.log('application-attempt tests passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
