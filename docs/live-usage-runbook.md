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
4. Build and confirm the coherent profile/story.
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
3. Generate and open role PDF/DOCX.
4. Resolve material claim and form-answer questions.
5. Show the final application package.
6. Get explicit approval.
7. Start `application-attempt.mjs` receipt.
8. Fill/upload/submit through the approved agent browser.
9. Record `confirmed`, `unknown`, `failed`, or `abandoned` immediately.
10. Update tracker to Applied only for confirmed success.

Never retry unknown without reconciliation and new approval.

## Feedback

Open `npm run dashboard`. Read `data/job-feedback.jsonl` for unresolved thumbs-down. Ask why, summarize the reusable lesson, and get approval before changing user config.

After a few ApplyCue applications, offer an approved mailbox pass for older confirmations and ongoing outcomes. It is useful history, not a first-run prerequisite.

## End of session

Run:

```powershell
node verify-pipeline.mjs
npm run tracker -- query --limit 20
```

Tell the user what was fetched, reviewed, shortlisted, generated, attempted, confirmed, and what exact next action remains.
