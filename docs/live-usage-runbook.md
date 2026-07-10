# Live Usage Runbook

Date: 2026-07-11

This runbook is for the first real multi-candidate UAT. The goal is to use ApplyCue as an agent-operated CV-to-shortlist system first, then apply only when the user explicitly asks.

## Live-Day Rule

Each person gets a separate ApplyCue profile.

```text
C:\Users\<user>\.applycue\profiles\<profile>\
```

Do not mix CVs, contact details, preferences, generated CVs, dashboards, receipts, or outcomes across people.

Use `default` only for the current operator unless the user explicitly says otherwise.

## What We Are Testing

For each candidate, prove this flow:

```text
CV + preferences
  -> profile setup
  -> clean job discovery
  -> dedupe/noise filtering
  -> ranked queue
  -> truthful role-specific CVs
  -> reusable form data preview
  -> local dashboard/summary
```

Do not submit live applications during search UAT unless the user changes the task to apply.

## Default Profile First

Run the current operator's profile first:

```powershell
pnpm applycue:status -- --profile default
pnpm applycue:first-build -- --profile default --more-results --target-ranking-queue 200
pnpm applycue:form-data -- --profile default --more-results --target-ranking-queue 200
pnpm applycue:status -- --profile default
```

Expected result:

- status is `READY`
- latest ranked queue is large enough for review, usually 200+ when available
- master form data preview is current
- dashboard and summary paths are written under `%USERPROFILE%\.applycue\profiles\default\outputs\`

If `form-data` says values need confirmation, show the preview to the user. Confirm only after the user approves:

```powershell
pnpm applycue:form-data -- --profile default --confirm --more-results --target-ranking-queue 200
```

## New Candidate Intake

When the user drops a new CV, create a profile key from the person's name, for example:

```text
anita-sharma
rahul-mehta
```

Then create or update:

```text
%USERPROFILE%\.applycue\profiles\<profile>\applycue.json
%USERPROFILE%\.applycue\profiles\<profile>\assets\base-cvs\<cv-file>
```

The repo must not store the real CV.

Minimum setup facts to collect from the CV and user chat:

- name and contact details
- current title and current company
- current country/city and search countries/cities
- target role families and titles
- preferred industries and clear no-go industries
- work mode: remote, hybrid, onsite
- employment type: full time, contract, internship, fractional
- compensation floor if the user gives it
- notice period if known
- years of total experience and relevant experience
- apply mode and applications per day
- whether past employers are allowed

Do not force a long setup form. Ask only for missing blockers and continue with reasonable defaults when the CV is enough.

## New Candidate Commands

Use this sequence for each new profile:

```powershell
pnpm applycue:setup -- --profile <profile> --skip-source-approval
pnpm applycue:status -- --profile <profile>
pnpm applycue:first-build -- --profile <profile> --more-results --target-ranking-queue 200
pnpm applycue:form-data -- --profile <profile> --more-results --target-ranking-queue 200
pnpm applycue:status -- --profile <profile>
```

Run this once per repo session, not once per candidate:

```powershell
pnpm applycue:check
```

Use browser UAT only when checking the application-fill leg for that candidate:

```powershell
pnpm applycue:browser-uat -- --profile <profile> --more-results --target-ranking-queue 200
```

## Search Quality Review

After each first build, inspect:

```text
outputs\runs\latest-summary.md
outputs\runs\latest-job-decisions.json
outputs\dashboard\latest.html
```

Tell the user in plain language:

- total discovered
- kept after hard filters
- ranked queue count
- duplicate jobs blocked
- risky/scam/manual-review jobs blocked or held
- top role clusters
- whether results look too narrow, too broad, or good enough for review

If results are too small, widen in this order:

```text
source -> title -> industry -> location -> recency -> batch strictness
```

Do not widen geography, older post dates, source scope, or applications per day without telling the user what is changing.

## Application Mode

Only switch to application mode when the user says to apply.

Application flow:

```text
selected job
  -> generated application packet
  -> apply route
  -> master form data confirmation
  -> live preflight
  -> user-approved submit or pause
  -> receipt/outcome saved
```

Commands:

```powershell
pnpm applycue:apply-route -- --profile <profile> --route-id <route-id>
pnpm applycue:browser-live-preflight -- --profile <profile> --route-id <route-id>
pnpm applycue:browser-live-apply -- --profile <profile> --route-id <route-id>
```

Never reuse a stale live preflight for a real submit. Rerun preflight on the current page before applying.

Email and DM sending are not done by the app. The agent may draft through native Codex, Claude, Hermes, or similar connectors, or browser control with user permission. Final send always needs explicit user confirmation.

## Evidence To Save

For each candidate, keep these paths in the session notes:

- profile path
- base CV asset path
- latest dashboard path
- latest summary path
- latest decision queue path
- master form data preview path
- any generated CV path used for review or application
- any receipt path if an application is submitted

## Stop Conditions

Stop and ask the user before continuing if:

- contact details are missing
- the CV does not identify the user's role level or target roles
- location/work authorization makes the batch ambiguous
- results are mostly irrelevant
- the job source asks for fees, payment, private IDs, or suspicious registration
- a form asks a new reusable question
- a submit button would send a live application
