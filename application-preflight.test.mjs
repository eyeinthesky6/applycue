import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applicationAnswersFingerprint,
  approveApplicationAnswer,
  assertCurrentApplicationPreflight,
  latestApplicationPreflight,
  readApprovedApplicationAnswers,
  recordApplicationPreflight,
  revokeApplicationAnswer,
  validateAttemptPreflightLink,
} from './application-preflight.mjs';

const root = mkdtempSync(join(tmpdir(), 'applycue-preflight-'));
const time = new Date('2026-07-14T10:00:00.000Z');
const now = () => new Date(time);
const verified = {
  reviewVerifier: () => ({ state: 'current', effectiveDecision: 'apply', row: { company: 'Acme', role: 'Product Lead' } }),
  bundleVerifier: async (_root, _jobId, { selectedPath }) => ({
    selectedArtifact: { kind: 'pdf', path: selectedPath, sha256: 'a'.repeat(64) },
    manifest: {
      bundleFingerprint: 'b'.repeat(64), reviewReceiptId: 'review-1', jdContentFingerprint: 'c'.repeat(64),
    },
  }),
  now,
};

try {
  mkdirSync(join(root, 'config'), { recursive: true });
  writeFileSync(join(root, 'config', 'profile.yml'), [
    'candidate:',
    '  full_name: Jane Smith',
    '  email: jane@example.com',
    '',
  ].join('\n'));

  assert.throws(() => approveApplicationAnswer(root, {
    field: 'notice_period', value: 'Immediate', approvedByUser: false,
  }, { now }), /approval/i);
  assert.throws(() => approveApplicationAnswer(root, {
    field: 'passport number', value: 'P123', aliases: ['Travel ID'], approvedByUser: true,
  }, { now }), /cannot be stored/i);

  const approved = approveApplicationAnswer(root, {
    field: 'notice_period', value: 'Immediate', aliases: ['When can you join?'],
    sourceRef: 'chat:confirmed', actor: 'codex', approvedByUser: true,
  }, { now });
  assert.equal(approved.field, 'notice_period');
  assert.equal(readApprovedApplicationAnswers(root).length, 1);
  assert.equal(applicationAnswersFingerprint(root).length, 64);
  assert.throws(() => approveApplicationAnswer(root, {
    field: 'notice_period', value: '30 days', actor: 'codex', approvedByUser: true,
  }, { now }), /--replace/i);

  const ready = await recordApplicationPreflight(root, {
    jobId: '7', company: 'Acme', title: 'Product Lead', url: 'https://jobs.example/7',
    visibleUrl: 'https://apply.example/7', visibleCompany: 'Acme', visibleTitle: 'Lead, Product',
    cvPath: 'output/acme-product-lead.pdf', pageStage: 'application_form', liveness: 'active',
    identityConfirmedByAgent: true, allVisibleFieldsCaptured: true, inspectionOnly: true,
    actor: 'codex', tool: 'chrome', evidenceRefs: ['chrome:snapshot-7'],
    fields: [
      { field: 'full_name', label: 'Full name', type: 'text', required: 'yes', resolution: 'profile', sourceRef: 'candidate.full_name' },
      { field: 'joining', label: 'When can you join?', type: 'text', required: 'yes', resolution: 'approved_answer', sourceRef: 'notice_period' },
      { field: 'resume', label: 'Resume', type: 'file', required: 'yes', resolution: 'selected_cv' },
      { field: 'motivation', label: 'Why this role?', type: 'textarea', required: 'unknown', resolution: 'agent_draft' },
      { field: 'salary', label: 'Expected salary', type: 'text', required: 'yes', resolution: 'user_confirmed_once', sourceRef: 'chat:application-7' },
    ],
  }, verified);
  assert.equal(ready.status, 'ready');
  assert.equal(ready.fields.find((field) => field.field === 'joining').resolved, true);
  assert.equal(latestApplicationPreflight(root, '7').id, ready.id);
  const checked = await assertCurrentApplicationPreflight(root, {
    jobId: '7', company: 'Acme', title: 'Product Lead', url: 'https://jobs.example/7',
    cvPath: 'output/acme-product-lead.pdf',
  }, verified);
  assert.equal(checked.id, ready.id);
  assert.deepEqual(validateAttemptPreflightLink({
    jobId: '7', company: 'Acme', title: 'Product Lead', url: 'https://jobs.example/7',
    cvSha256: ready.cvSha256, preflightAnswersFingerprint: ready.answersFingerprint,
    createdAt: '2026-07-14T10:01:00.000Z',
  }, ready), []);
  assert.match(validateAttemptPreflightLink({
    jobId: '7', company: 'Acme', title: 'Product Lead', url: 'https://jobs.example/wrong',
    cvSha256: ready.cvSha256, preflightAnswersFingerprint: ready.answersFingerprint,
    createdAt: '2026-07-14T10:01:00.000Z',
  }, ready).join(' '), /URL differs/i);

  const paused = await recordApplicationPreflight(root, {
    jobId: '8', company: 'Acme', title: 'Product Lead', url: 'https://jobs.example/8',
    cvPath: 'output/acme-product-lead.pdf', pageStage: 'job_page', liveness: 'active',
    identityConfirmedByAgent: true, allVisibleFieldsCaptured: true, inspectionOnly: true,
    actor: 'codex', tool: 'chrome', evidenceRefs: ['chrome:snapshot-8'],
    fields: [{ field: 'visa', label: 'Visa sponsorship', type: 'text', required: 'yes', resolution: 'agent_draft' }],
  }, verified);
  assert.equal(paused.status, 'pause');
  assert.match(paused.reasons.join(' '), /not an application form/i);
  assert.match(paused.reasons.join(' '), /cannot be answered from agent inference/i);
  await assert.rejects(() => assertCurrentApplicationPreflight(root, {
    jobId: '8', company: 'Acme', title: 'Product Lead', url: 'https://jobs.example/8',
    cvPath: 'output/acme-product-lead.pdf',
  }, verified), /paused/i);

  await assert.rejects(() => assertCurrentApplicationPreflight(root, {
    jobId: '7', company: 'Acme', title: 'Product Lead', url: 'https://jobs.example/7',
    cvPath: 'output/acme-product-lead.pdf',
  }, { ...verified, now: () => new Date('2026-07-14T10:31:00.000Z') }), /older than 30 minutes/i);

  approveApplicationAnswer(root, {
    field: 'notice_period', value: '30 days', aliases: ['When can you join?'], actor: 'codex',
    approvedByUser: true, replaceExisting: true,
  }, { now });
  await assert.rejects(() => assertCurrentApplicationPreflight(root, {
    jobId: '7', company: 'Acme', title: 'Product Lead', url: 'https://jobs.example/7',
    cvPath: 'output/acme-product-lead.pdf',
  }, verified), /answers changed/i);

  const revoked = revokeApplicationAnswer(root, { field: 'notice_period', actor: 'codex', approvedByUser: true }, { now });
  assert.equal(revoked.action, 'revoke');
  assert.equal(readApprovedApplicationAnswers(root).length, 0);
  console.log('application-preflight tests passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
