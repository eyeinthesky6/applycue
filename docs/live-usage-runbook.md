# ApplyCue Live Usage Runbook

## Start

```powershell
node doctor.mjs --json
```

The agent greets the user, reads existing user files, and asks only for missing material information.

## New candidate

1. Preserve the supplied CV exactly.
2. Extract contact and history already present.
3. Ask for approved local/public portfolio sources.
4. Build and confirm the coherent profile/story. When a reusable career spine or role-family projections add value, save confirmed `candidate-positioning.md`; do not force it for every user.
5. Confirm search intent, hard constraints, current employer, past-employer policy, and pace.
6. Run a baseline scan before rewriting the base CV.

The current checkout supports one active candidate safely. Until V1 external multi-profile storage lands, use a separate checkout/user directory for another real candidate; never mix their user layers.

## Search day

1. Run configured sources without silent widening.
2. Show fetched and loss counts.
3. Hydrate viable full JDs in the approved browser.
4. Let the agent review all viable candidates and record `apply`, `watch`, or `skip`.
5. If starved/noisy, audit a sample and propose one reusable change for approval.
6. Prepare the first five genuine matches, or fewer when fewer fit.

## Application session

For each named role:

1. Recheck liveness and exact company/role/URL.
2. Skip current employer; ask for past employer.
3. Generate role Markdown/HTML/PDF/DOCX, record the bundle, and open the PDF/DOCX.
4. Inspect every currently visible form field without filling. Resolve material claim and form-answer questions; save reusable values only after explicit user approval.
5. Run `review-evidence.mjs check`; stale inputs return the role to pending re-review.
6. Run `cv-bundle.mjs check --job=N --cv=<selected PDF or DOCX>`; use only the exact verified upload.
   If the role is high stakes, write the adaptive campaign pack beside the CV, then run `high-stakes-pack.mjs record` and `check`. Its absence is visible but does not replace the existing application gates.
7. Record `application-preflight.mjs record` from the host browser's structural field snapshot. It must return `ready`; a changed answer/review/CV or a receipt older than 30 minutes needs a fresh inspection.
8. Show the final application package.
9. Get explicit approval.
10. Start `application-attempt.mjs` with that `--cv` path; the receipt binds its hash, current preflight, and approved-answer fingerprint.
11. Fill/upload/submit through the approved agent browser.
12. Record `confirmed`, `unknown`, `failed`, or `abandoned` immediately.
13. For confirmed success, verify the finish result says `trackerStatus: Applied`; do not perform a second manual tracker edit. Other outcomes remain visible attempt evidence.

Never retry unknown without reconciliation and new approval.

## Feedback

Open `npm run dashboard`, then run `node job-feedback.mjs pending` after the user finishes reviewing. Process `prepare`, `inspect_form`, `ignore`, and CV-change receipts through the existing owners. For high-stakes roles, investigate `Campaign pack missing/stale` and use the pack links when current. A CV-change request needs a regenerated verified bundle before resolution. A dashboard `approve_apply` receipt may replace chat approval only for its exact CV and preflight. Any reusable tuning still needs an explained diff and user approval before changing config.

After a few ApplyCue applications, offer an approved mailbox pass for older confirmations and ongoing outcomes. It is useful history, not a first-run prerequisite.

## End of session

Run:

```powershell
node verify-pipeline.mjs
npm run tracker -- query --limit 20
```

Tell the user what was fetched, reviewed, shortlisted, generated, attempted, confirmed, and what exact next action remains.
