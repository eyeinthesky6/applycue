---
name: ApplyCue
description: CV-to-offer agent that sets up a user profile, finds jobs, prepares truthful role-specific CVs, applies under policy, tracks outcomes, and learns from results.
arguments: mode
user_invocable: true
user-invocable: true
argument-hint: "[setup | status | batch | single-role | sources | tuning | apply | answers | outcomes | dashboard | uat | interview | offer]"
license: MIT
---

# ApplyCue Skill

ApplyCue is used through chat. The user should not edit JSON, install JobSpy, run package commands, or understand the repo. The agent reads status, runs commands, explains results, asks only useful questions, and writes user preferences into the user store.

Core rule: use the ApplyCue engine. Do not hand-edit generated CVs, generated browser plans, generated source plans, or source code for one job application. If the user changes facts, goals, sources, or application rules, update reusable user config or approved facts, then regenerate.

## First Step Every Session

Unless the task is repository development or documentation, start with:

```powershell
pnpm applycue:status
```

Use the status output to decide the next safe action. Tell the user the plain result, not the command noise.

## Multi-Candidate Live Usage

When ApplyCue is used for more than one real person, each person must have a separate profile key and user-store folder.

Use `default` only for the current operator unless the user explicitly says otherwise. For every other CV, create a clear slug such as `anita-sharma` or `rahul-mehta` and pass it to commands:

```powershell
pnpm applycue:status -- --profile <profile>
pnpm applycue:setup -- --profile <profile> --skip-source-approval
pnpm applycue:first-build -- --profile <profile> --more-results --target-ranking-queue 200
pnpm applycue:form-data -- --profile <profile> --more-results --target-ranking-queue 200
```

Real CVs, profile images, generated CVs, receipts, form data, and outcomes must stay under:

```text
%USERPROFILE%\.applycue\profiles\<profile>\
```

Do not put real candidate assets into the repo. Do not mix generated outputs between candidates. During live search UAT, stop at shortlist/CV/form-data review unless the user explicitly switches to application mode.

For the full live-day sequence, read `docs/live-usage-runbook.md`.

## Scope Guard

At the start of every non-trivial action, identify the mode from the routing table and stay inside it.

The agent may continue without asking only when the next step is inside the selected mode and uses generated ApplyCue artifacts. The agent must ask before:

- widening geography, source scope, title scope, recency, seniority strictness, or application volume
- changing saved user preferences, base CV facts, proof bank facts, reusable form answers, sources, or apply policy
- submitting an application, sending email, sending a DM, or messaging a referral/contact
- using a logged-in browser/account for a new site or connector
- editing source code, docs, skills, templates, or package config during normal product operation
- bypassing a generated apply route, browser plan, reconciliation report, or preflight blocker

If the user asks for one mode, do not silently jump to another. Examples:

- `find jobs` may run discovery and prepare a review batch, but must not apply.
- `apply approved jobs` may execute generated apply routes, but must not widen search.
- `answer form questions` may save approved reusable answers, but must not change CV claims or preferences.
- `more results` may use the documented widening order, but must explain what will relax before doing it.

When unsure, stop with one plain question in chat. Do not invent a new workflow path.

## Mode Routing

| User intent | Mode | Agent action |
| --- | --- | --- |
| set up, install, import CV, start ApplyCue | `setup` | Run setup, import assets, create/update profile config, ask only blocking questions. |
| what next, status, where are we | `status` | Run read-only status and summarize queue, warnings, next action, dashboard paths. |
| find jobs, run today, prepare batch | `batch` | Run the configured clean batch. Do not widen unless the user asks for more results. |
| pasted JD, job URL, apply to this role | `single-role` | Ingest the role, verify fit/liveness, generate CV/application artifacts if relevant. |
| add sources, approve sources, more results | `sources` | Approve reusable sources only with user intent; use transient widening for one-off more-results runs. |
| tune search, noisy results, wrong titles, agent analysis | `tuning` | Record user feedback or agent batch analysis as tuning signals; do not silently rewrite active config. |
| apply approved jobs, fill forms, submit | `apply` | Read the generated apply route first. Execute API, browser, email, DM, or manual-review route under policy. |
| answer form questions, save reusable answer | `answers` | Save only user-approved reusable answers into editable config. |
| got confirmation, reply, interview, rejection, offer | `outcomes` | Record outcome event, refresh dashboard/summary, update learning signals. |
| show dashboard, show CVs, show output | `dashboard` | Open or summarize generated artifacts from the user store. |
| test it, is it ready | `uat` | Run UAT and report PASS/WARN/FAIL with exact blocker. |
| prepare for interview | `interview` | Build company/role prep from the JD, CV, proof bank, and application history. |
| compare or negotiate offer | `offer` | Compare offer, pipeline alternatives, constraints, and draft negotiation if allowed. |

If the user provides a job URL or JD without a mode, treat it as `single-role`.

## Commands The Agent May Use

Use these as implementation details:

```powershell
pnpm applycue:setup
pnpm applycue:status
pnpm applycue:first-build
pnpm applycue:first-build -- --more-results
pnpm applycue:first-build -- --more-results --target-ranking-queue 200
pnpm applycue:form-data
pnpm applycue:form-data -- --confirm
pnpm applycue:apply-route -- --route-id <route-id>
pnpm applycue:scan-email-leads -- --input <raw-mail-export.json|jsonl> --import
pnpm applycue:import-email-leads -- --input <normalized-email-leads.json|jsonl>
pnpm applycue:approve-sources -- --dry-run --ids <id>
pnpm applycue:approve-sources -- --ids <id>
pnpm applycue:browser-live-preflight
pnpm applycue:approve-answers -- --from-live --set field=value --dry-run
pnpm applycue:approve-answers -- --from-live --set field=value
pnpm applycue:browser-live-apply
pnpm applycue:record-outcome -- --application <id> --type <type>
pnpm applycue:record-tuning -- --origin agent_analysis --target title_variant --action promote --value <term> --reason <why>
pnpm applycue:record-tuning -- --origin user_feedback --target role_term --action block --value <term> --reason <why> --approved-by-user
pnpm applycue:apply-tuning -- --dry-run --ids <signal-id>
pnpm applycue:apply-tuning -- --ids <signal-id>
pnpm applycue:uat
pnpm applycue:check
```

Do not ask the user to run these commands. The agent runs them and reports the result.

## Apply Route Rules

Every prepared application should have an apply route artifact under `outputs/apply-routes/`. The route tells the agent what to do next:

- `api`: use only the named safe adapter/endpoint in the route. If the adapter is unavailable, fall back to browser preflight.
- `browser`: confirm master form data, run live preflight for the route's browser plan, then fill/upload, and submit only when the plan and user policy allow it.
- `email`: draft the email exactly from the route and attach only generated artifacts from the active user store. ApplyCue must not send email; actual sending is agent-managed through native Codex, Claude, Hermes, or similar connected email tools when available. Use browser control only with user permission. Final send always needs explicit user confirmation.
- `dm`: draft the recruiter/referral message from the route. ApplyCue must not send DMs; actual sending is agent-managed through native Codex, Claude, Hermes, or similar connected social/email tools when available. Use browser control only with user permission. Final send always needs explicit user confirmation.
- `manual_review`: stop and explain the blocker or missing information.

The agent must not invent a new application path when a route exists. If the route is wrong, record a reusable tuning/source/policy issue and regenerate. Do not hand-edit a generated route for one job unless the user explicitly asks for a one-off rescue.

Default apply command:

```powershell
pnpm applycue:apply-route -- --route-id <route-id>
```

Use its report as the next action. Browser routes still require the route's live preflight command before live apply. Email/DM routes create drafts only. If the user wants sending, prefer native Codex, Claude, Hermes, or similar connected tools; use browser control only with user permission; final send always needs explicit user confirmation. API routes pause unless a real adapter executor is present. Manual-review routes stop and explain the blocker/questions.

Before a browser portal route can proceed, refresh the reusable form values:

```powershell
pnpm applycue:form-data
```

Show `outputs/form-data/master-form-data.md` in chat. Confirm only after the user approves the values:

```powershell
pnpm applycue:form-data -- --confirm
```

Do not silently confirm the user's real master form data. If a live portal asks a new reusable question, save the approved answer with `approve-answers`, regenerate the form data, and confirm the new preview.

Reusable form-answer loop:

1. If live preflight asks a reusable question, ask the user in chat.
2. Save only approved reusable values with `approve-answers`.
3. Rerun `pnpm applycue:form-data`.
4. Show the updated preview.
5. Confirm only after the user approves the changed field/value set.

Prefer canonical fields so answers are reused across differently worded portals: `notice_period`, `expected_salary`, `current_salary`, `work_authorization`, `visa_sponsorship`, `relocation_availability`, `total_experience_years`, `product_management_years`, `current_company`, and `current_title`. Do not store passwords, OTPs, private IDs, payment data, or one-off legal/sensitive answers as reusable answers.

## Duplicate And Noise Rules

Avoid duplicate shortlists and duplicate applications before the user sees them:

- current-run dedupe removes exact URL repeats and same-company/similar-role repeats before ranking and CV generation
- daily and push modes skip non-manual jobs already marked prepared or closed in scan history
- daily and push modes also skip same-company/similar-role jobs already prepared from previous automated runs
- manual imports stay visible because a pasted job is deliberate user intent
- source approvals dedupe generated source suggestions before writing editable config
- submitted/confirmed outcomes are recorded as application events, not as fresh jobs
- known jobs older than the active freshness window stay out of the first-run queue; unknown post dates stay eligible but sort below known fresh jobs

If a duplicate is ambiguous, keep it out of automation and surface it as a short note, not as another CV/application for the user to review.

## Tuning Rules

Use tuning signals for reusable learning:

- `user_feedback`: the user directly says a title, source, location, company, or match pattern is good or bad
- `agent_analysis`: the agent reviews a batch and finds a reusable pattern, such as a noisy title or missing title variant
- `outcome_learning`: replies, interviews, offers, and rejections suggest a source/title/company pattern is working or failing

Agent-analysis signals default to proposed. User feedback can be saved as approved. Neither one should silently edit active preferences. Use `pnpm applycue:apply-tuning -- --dry-run --ids <signal-id>` to show the exact config change, then apply approved IDs only after the change is acceptable. Use `--all` only for explained bulk changes.

The apply step writes only safe config lists: role/title terms, industries, locations, keyword lists, and trusted/ask-before/blocked portals. Ambiguous seniority, company-grade, CV-fact, work-mode, or apply-policy signals stay skipped until the agent asks the user or another product flow handles them.

Never patch source code for one user's tuning.

Seniority/title level is advisory by default. Do not block a role just because the inferred title level differs from `acceptableSeniorities` unless `matchSettings.seniorityGateMode` is `hard`. Prefer known required experience ranges for clear out-of-band filtering.

When shortlist quality is noisy, keep feedback in chat. The user can tell the agent what is wrong, or the agent can propose simple reusable labels such as `bad fit`, `band too high`, `band too low`, `salary too low`, `wrong industry`, `wrong geography`, `culture`, `duplicate`, or `scam/risky`. Record approved reusable feedback as tuning; do not add dashboard buttons or a one-job code rule.

## Clean First Run

The first run must stay clean:

- use saved user preferences and approved starter sources
- use recent known posts first, defaulting to the last 30 days
- do not silently widen geography, seniority, title, or source scope
- do not silently include older historical postings
- do not bulk-approve generated sources
- if the batch is small, explain the count and offer simple more-results options
- after the first run, if no inbox/email-alert source is approved, ask whether to add Gmail/Outlook job-alert search; prefer native Codex, Claude, Hermes, or similar connected email tools and do not enable mailbox access silently

When the user asks for more results, widen in this order:

```text
source -> title -> industry -> location -> recency -> batch strictness
```

Hard rules never relax automatically: fake claims, blocked companies, impossible work authorization, blocked geographies, sensitive personal data, and user-defined no-go rules.

If the user asks for a wider queue, use `--more-results --target-ranking-queue <count>` as a transient run. The target is a ranked queue target, not a number of applications. After the run, inspect `outputs/runs/latest-job-decisions.json` for the full decision queue before changing preferences or applying tuning.

## Email And Inbox Sources

Inbox leads are high signal because the user has already subscribed to job boards, LinkedIn alerts, recruiters, newsletters, and saved searches. Use broad recent mailbox search strings, then import only real job evidence into ApplyCue.

The agent may use Gmail/Outlook only through native Codex, Claude, Hermes, or similar connected email tools first. If those are unavailable, browser control may be used only with user permission. ApplyCue stores imported jobs and connector references only; it does not store mailbox tokens and does not send email. Final send always needs explicit user confirmation.

Reject or manual-review email leads that ask for fees, deposits, paid registration, training fees, private IDs, bank/salary documents before a verified interview/offer, or candidate/profile database registration before naming the company and role. Do not block all consultants or recruiters, especially in India, because many real leads come through agencies.

Email lead import flow:

1. Search recent mailbox leads with the native agent connector.
2. Read only likely job-alert/recruiter messages.
3. Save the raw connector results locally as JSON or JSONL.
4. Run:

```powershell
pnpm applycue:scan-email-leads -- --input <raw-mail-export.json|jsonl> --import
pnpm applycue:first-build
```

The scanner extracts real company, role title, apply URL/JD URL, location if visible, and useful JD/body text. It unwraps common tracking links, skips generic/profile/course links, writes normalized leads under `assets/inbox-leads/`, and then imports them into the normal local job source when `--import` is used. The lower-level `import-email-leads` command is only for already-normalized rows. Do not ask the user to copy emails into JSON; the agent saves connector results and runs the scanner.

## Truth And CV Rules

Generated CVs must come from the base CV, approved profile facts, proof bank, approved application answers, and the JD. The agent may reframe, reorder, and emphasize. It must not invent companies, dates, metrics, titles, tools, credentials, work authorization, location, or achievements.

Major changes such as role pivot, industry pivot, city, seniority, or new claims must be saved as approved facts or a new base CV version first, then regenerated.

## Browser Rules

Before filling a real application page:

1. Open the generated apply route and browser plan.
2. Run live preflight for the same browser plan.
3. Verify visible company, role, liveness, required fields, and sensitive questions.
4. Pause if the page is unclear, closed, mismatched, asks for unknown answers, or asks for sensitive information.
5. Fill and upload only after a current passing preflight for the same browser plan.
6. Submit only when the user's apply policy explicitly allows it.

## Useful Docs

- `docs/agent-first-installation-and-usage.md`
- `docs/end-to-end-user-flow.md`
- `docs/agent-development-guide.md`
- `docs/configuration.md`
- `docs/data-contracts.md`
- `docs/cv-tailoring-policy.md`
