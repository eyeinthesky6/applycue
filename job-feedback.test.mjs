import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendJobAction,
  assertDashboardApplyApproval,
  assertNoBlockingJobActions,
  assertNoPendingCvChanges,
  pendingJobActions,
  readJobFeedbackStates,
  resolveJobAction,
} from './job-feedback.mjs';

const root = mkdtempSync(join(tmpdir(), 'applycue-feedback-'));
try {
  const prepare = appendJobAction(root, {
    jobId: '7', company: 'Acme', title: 'Product Lead', action: 'prepare', note: 'Please pursue this role.',
  });
  const duplicate = appendJobAction(root, {
    jobId: '7', company: 'Acme', title: 'Product Lead', action: 'prepare', note: 'Please pursue this role.',
  });
  assert.equal(duplicate.id, prepare.id);
  assert.equal(duplicate.unchanged, true);

  const change = appendJobAction(root, {
    jobId: '7', company: 'Acme', title: 'Product Lead', action: 'request_cv_change',
    note: 'Emphasize the logistics products.', cvBundleFingerprint: 'bundle-1', cvPath: 'output/acme.pdf',
  });
  assert.throws(() => assertNoPendingCvChanges(root, '7', 'bundle-1'), /logistics products/i);
  assert.throws(() => resolveJobAction(root, {
    eventId: change.id, actorName: 'codex', bundleFingerprint: 'bundle-1',
  }), /newly generated CV bundle/i);
  resolveJobAction(root, {
    eventId: change.id, actorName: 'codex', bundleFingerprint: 'bundle-2', note: 'Regenerated and verified.',
  });
  assert.throws(() => assertNoPendingCvChanges(root, '7', 'bundle-1'), /unresolved/i);
  assert.doesNotThrow(() => assertNoPendingCvChanges(root, '7', 'bundle-2'));

  const approval = appendJobAction(root, {
    jobId: '7', company: 'Acme', title: 'Product Lead', action: 'approve_apply',
    cvBundleFingerprint: 'bundle-2', cvPath: 'output/acme.pdf', preflightReceiptId: 'preflight-7',
  });
  const checked = assertDashboardApplyApproval(root, {
    receiptId: approval.id, jobId: '7', company: 'ACME', title: 'Product Lead',
    cvBundleFingerprint: 'bundle-2', cvPath: 'output/acme.pdf', preflightReceiptId: 'preflight-7',
  });
  assert.equal(checked.approvedByUser, true);
  assert.throws(() => assertDashboardApplyApproval(root, {
    receiptId: approval.id, jobId: '7', company: 'Acme', title: 'Product Lead',
    cvBundleFingerprint: 'bundle-2', cvPath: 'output/acme.docx', preflightReceiptId: 'preflight-7',
  }), /different selected CV/i);

  const states = readJobFeedbackStates(root, new Map([['7', { bundleFingerprint: 'bundle-2' }]]));
  assert.equal(states.get('7').pendingCvChanges.length, 0);
  assert.equal(states.get('7').pendingActions.some((event) => event.action === 'approve_apply'), true);
  assert.equal(pendingJobActions(root, { jobId: '7', bundleFingerprint: 'bundle-2' }).length, 2);
  appendJobAction(root, { jobId: '8', company: 'Beta', title: 'PM', action: 'ignore' });
  assert.throws(() => assertNoBlockingJobActions(root, '8', 'bundle-8'), /ignore action/i);

  const highStakes = appendJobAction(root, {
    jobId: '9', company: 'Coveted Co', title: 'Program Officer', action: 'mark_high_stakes',
  });
  let priorityState = readJobFeedbackStates(root).get('9');
  assert.equal(priorityState.highStakes, true);
  assert.equal(priorityState.priorityAction.id, highStakes.id);
  assert.equal(priorityState.pendingActions.some((event) => event.action === 'mark_high_stakes'), true);
  assert.doesNotThrow(() => assertNoBlockingJobActions(root, '9', ''));
  assert.equal(pendingJobActions(root)[0].jobId, '9');
  resolveJobAction(root, { eventId: highStakes.id, actorName: 'codex', note: 'High-stakes brief prepared.' });
  priorityState = readJobFeedbackStates(root).get('9');
  assert.equal(priorityState.highStakes, true);
  assert.equal(priorityState.pendingActions.some((event) => event.action === 'mark_high_stakes'), false);
  appendJobAction(root, {
    jobId: '9', company: 'Coveted Co', title: 'Program Officer', action: 'mark_standard',
  });
  priorityState = readJobFeedbackStates(root).get('9');
  assert.equal(priorityState.highStakes, false);
  assert.equal(priorityState.pendingActions.some((event) => event.action === 'mark_standard'), true);
  console.log('job-feedback tests passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
