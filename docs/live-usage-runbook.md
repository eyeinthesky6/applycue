# Live Usage Runbook

Date: 2026-07-10

Status: current real-profile operating guide.

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
  -> evidence-rich ranked queue
  -> Codex/Claude review receipt
  -> truthful role-specific CVs
  -> reusable form data preview
  -> local dashboard/summary
```

Do not submit live applications during search UAT unless the user changes the task to apply.

## Default Profile First

Run the current operator's profile first:

```powershell
pnpm applycue:status -- --profile default
pnpm applycue:first-build -- --profile default
pnpm applycue:record-decisions -- --profile default --input <reviewed-decisions.json> --prepare
pnpm applycue:form-data -- --profile default
pnpm applycue:status -- --profile default
```

Expected result:

- the first status after discovery is `NEEDS DECISIONS` when ranked jobs exist but none are approved yet
- after the agent reviews the queue and runs the atomic decision/preparation command, status can progress to `READY` once UAT evidence is current
- the engine has classified the full batch, only unresolved ambiguous rows received Codex/Claude judgement, and the prepared queue contains the best roles up to `applicationsPerDay`
- latest ranked queue reports the actual available volume; the requested target is a cap, not a guaranteed minimum
- each queue row includes the source URL/date, bounded JD excerpt, rank reasoning, hard gates, and a full normalized JD path
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
pnpm applycue:setup -- --profile <profile> --input <approved-setup.json> --base-cv <candidate-cv.docx-or-pdf-or-text> --skip-source-approval
pnpm applycue:status -- --profile <profile>
pnpm applycue:first-build -- --profile <profile>
pnpm applycue:record-decisions -- --profile <profile> --input <reviewed-decisions.json> --prepare
pnpm applycue:form-data -- --profile <profile>
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

Before asking for mailbox or job-site access, inspect the current agent host's tools. If an email connector is ready or connectable, ask only for narrow recent job-related read/search access and use the host's OAuth flow. Ask which one or two job sites the candidate already prefers before using their real Chrome session. The user logs in directly; search/inspection permission does not grant submit or messaging permission.

If either capability is unavailable or declined, continue the batch through public sources. Follow `docs/connector-capability-policy.md`; do not request credentials in chat or install an unreviewed community connector.

## Search Quality Review

After each first build, inspect:

```text
outputs\runs\latest-summary.md
outputs\runs\latest-job-decisions.json
outputs\dashboard\latest.html
```

Do not ask the user or agent to rank every job. ApplyCue classifies the full batch and automatically resolves clear rows. Codex/Claude reviews only ambiguous `review` rows needed to fill or correct the shortlist and asks the user only when a missing candidate fact could materially change a decision. When decisions are needed, write one reviewed decision JSON file under the active profile or an OS temporary directory and use `record-decisions --prepare`. Never put this user-specific import file in the repo. The command performs the canonical receipt write and safe downstream generation; it never submits, sends, confirms form data, or widens search.

Tell the user in plain language:

- total discovered
- kept after hard filters
- ranked queue count
- duplicate jobs blocked
- risky/scam/manual-review jobs blocked or held
- top role clusters
- whether results look too narrow, too broad, or good enough for review

Review the existing decision queue before calling supply too small. If the queue has pending decisions, status is `NEEDS DECISIONS`, not low volume. Only after the queue is reviewed and the prepared shortlist is genuinely short should the agent propose widening in this order:

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
pnpm applycue:browser-live-preflight -- --profile <profile> --plan-id <browser-plan-id>
pnpm applycue:browser-live-apply -- --profile <profile> --plan-id <browser-plan-id>
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

- contact details are missing before application preparation or submission; search-only review may continue without them
- the CV does not identify the user's role level or target roles
- location/work authorization makes the batch ambiguous
- results are mostly irrelevant
- the job source asks for fees, payment, private IDs, or suspicious registration
- a form asks a new reusable question
- a submit button would send a live application
