import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finishApplicationAttempt, latestAttemptForJob, latestAttemptForUrl, startApplicationAttempt } from './application-attempt.mjs';

const root = mkdtempSync(join(tmpdir(), 'applycue-attempt-'));
try {
  assert.throws(() => startApplicationAttempt(root, { jobId: '1', company: 'Acme', title: 'PM', url: 'https://jobs.example/1' }), /approval/i);
  const started = startApplicationAttempt(root, { jobId: '1', company: 'Acme', title: 'PM', url: 'https://jobs.example/1', approvedByUser: true });
  assert.equal(latestAttemptForJob(root, '1').outcome, 'started');
  const unknown = finishApplicationAttempt(root, { attemptId: started.attemptId, outcome: 'unknown', evidence: 'Browser closed after submit click' });
  assert.equal(unknown.outcome, 'unknown');
  assert.throws(() => startApplicationAttempt(root, { jobId: '1', company: 'Acme', title: 'PM', url: 'https://jobs.example/1', approvedByUser: true }), /reconcile/i);
  assert.equal(latestAttemptForUrl(root, 'https://JOBS.example/1/#details').outcome, 'unknown');
  assert.throws(() => startApplicationAttempt(root, { jobId: '2', company: 'Acme', title: 'PM', url: 'https://jobs.example/1/', approvedByUser: true }), /exact job/i);
  const otherPosting = startApplicationAttempt(root, { jobId: '3', company: 'Acme', title: 'PM', url: 'https://jobs.example/2', approvedByUser: true });
  assert.equal(otherPosting.outcome, 'started');
  assert.throws(() => finishApplicationAttempt(root, { attemptId: started.attemptId, outcome: 'confirmed' }), /already unknown/i);
  console.log('application-attempt tests passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
