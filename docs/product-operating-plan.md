# ApplyCue Product Operating Plan

Date: 2026-07-06

## Short Answer

We are ready to build.

The missing work is execution structure, not product direction.

Build first:

```text
source intake -> hard gates -> agent shortlist -> reconciliation -> standard_ats_v1 CV -> apply plan -> dashboard
```

Do not start with SaaS, social connectors, multiple templates, advanced ML, or a generic job-search engine.

## Contracts Needed

V1 contracts:

- `UserProfile`
- `ProfileFact`
- `TargetBaseCv`
- `ProofItem`
- `UserPreferences`
- `ApplySettings`
- `SourceSettings`
- `JobRecord`
- `JobRequirement`
- `JobRequirementMatch`
- `CvContentPlan`
- `CvVariant`
- `ReconciliationReport`
- `ApplicationDraft`
- `ApplicationRecord`
- `OutcomeEvent`
- `RunManifest`
- `GeneratedFileManifest`

These contracts live in `packages/core`; implementation packages should import them rather than redefine local shapes.

## Core Invariants

These should become tests.

- ApplyCue exists to help agents get a user hired, not to become "Google for jobs."
- If an agent can do a task more efficiently from the CV, JD, preferences, and feedback, do not build complex code for it.
- One v1 CV format: `standard_ats_v1`.
- Agent never hand-edits CV files for one job.
- Agent never edits source code during an application run.
- Every generated claim maps to a profile fact, proof item, base CV text, or user-approved answer.
- Major facts require user approval before reuse.
- Unsupported JD requirements are not written as experience.
- Application answers use the same fact ledger as generated CVs.
- Browser submit requires passed reconciliation, allowed apply policy, and trusted/allowed source.
- Unknown or suspicious portals pause.
- Backend ordering signals stay backend-only unless user asks to inspect them.
- Every run writes a manifest.
- Every generated file has source inputs and hashes recorded.

## Build Order

### Phase 0: Contract Lock

- Expand `packages/core` contracts.
- Add fixtures for one CV, one config, and five jobs.
- Add invariant tests.

### Phase 1: CV Engine

- Import base CV text.
- Create fact ledger.
- Extract JD requirements.
- Map requirements to proof/facts.
- Produce reconciliation report.
- Render `standard_ats_v1`.

### Phase 2: Local Run

- Add `<outputRoot>/data/local/*.jsonl` store.
- Add CV output writer under the active output root.
- Add dashboard writer at `<outputRoot>/outputs/dashboard/latest.html`.
- Add one command to run sample jobs end to end.

### Phase 3: Discovery

- Manual job URL/import.
- Static job fixtures.
- Company/ATS adapter.
- Job board adapter.
- Browser-visible extraction later.

### Phase 4: Apply Assistant

- Safe form-fill.
- Pause rules.
- Browser action log.
- Receipt tracking.

### Phase 5: Tracking And Learning

- Replies, rejections, interviews, offers.
- Source performance.
- CV variant outcome tracking.
- Outcome feedback loop for the agent.

## MVP Success Criteria

Given:

- one base CV
- one preferences config
- five sample jobs

ApplyCue produces:

- shortlisted job list
- `standard_ats_v1` CVs for serious jobs
- reconciliation report per CV
- application draft per job
- local dashboard HTML
- run manifest

MVP passes only if:

- no unsupported facts are inserted
- major changes pause for approval
- source files are unchanged during run
- outputs are reproducible from inputs
- dashboard explains what happened

## Product KPIs

Engine KPIs:

- unsupported-claim rate: must be zero
- reconciliation pass rate
- needs-confirmation rate
- blocked application rate
- time per CV generation
- applications prepared per run
- source-code writes during run: must be zero

User outcome KPIs:

- setup-to-first-run time
- applications submitted per day
- reply rate
- interview rate
- offer rate
- user corrections per 10 CVs
- exception queue size
- source yield by channel

Business KPIs later:

- first-run activation
- week-1 retention
- paid conversion
- applications per active user
- interviews per active user
- churn after no replies

## Agent Goals

The agent should:

- collect missing setup data
- call ApplyCue engine commands
- explain decisions simply
- ask for approval on major facts and sensitive fields
- update user config, source approvals, proof bank, and preferences when the user gives reusable feedback
- operate browser only under policy
- save outputs and manifests
- summarize daily results
- learn from user feedback and outcomes

## Agent Non-Goals

The agent should not:

- invent CV facts
- patch code for a single job
- hand-edit generated CVs
- bypass platform rules
- spam recruiters or contacts
- auto-post to social platforms
- guarantee jobs
- expose backend scores as self-worth
- ask the user to review every CV forever
- build a generic job board/search engine inside ApplyCue
- add matching math when agent evaluation plus hard gates is enough

## Skill Templates

V1 skill actions:

- `setup-profile`
- `run-sample-batch`
- `generate-job-cv`
- `review-reconciliation`
- `prepare-application`
- `review-exceptions`
- `show-dashboard`
- `learn-from-outcome`

Each action should call code. The skill is workflow glue, not business logic.

## App And Skill Integration

Local-first stack:

```text
Codex/Claude skill
  -> ApplyCue CLI/engine
  -> local config and JSONL state
  -> generated CVs and dashboard
```

Later hosted stack:

```text
Chat app or web app
  -> hosted ApplyCue API
  -> connector layer
  -> browser/apply workers
  -> dashboard and billing
```

Skills are the first GTM hook because the target early users already trust agents.

The web app comes later when non-technical users need guided setup, billing, hosted state, and cleaner review UX.

## Distribution

V1 developer/power-user distribution:

- GitHub repo
- npm package or CLI
- Codex skill
- Claude skill
- demo videos
- LinkedIn build-in-public posts

First non-technical distribution:

- "Install this skill and let the agent set it up" flow
- packaged examples
- hosted landing page
- waitlist
- onboarding call or concierge setup

Later distribution:

- ChatGPT app via Apps SDK/App Directory
- hosted SaaS
- enterprise/team workspace
- marketplace listings where available

## First User Interaction

The first user should see:

```text
Give me your CV and tell me what roles to target.
I will run a safe sample batch and show you what I would apply to, what CV I generated, and what needs approval.
```

First run should not auto-submit.

It should produce:

- profile summary
- missing setup questions
- sample shortlisted jobs
- one generated CV
- reconciliation report
- dashboard

After user trust:

- daily mode
- application count per day
- auto-submit inside policy

## Open Source Vs Private

Recommended open source:

- contracts
- local engine
- standard CV renderer
- reconciliation logic
- local dashboard
- skill scaffolds
- sample fixtures

Why:

- trust matters for CV truth
- developers can inspect safety
- skills become a GTM hook
- open engine creates adoption

Recommended private/paid:

- hosted dashboard
- connector service
- browser automation adapters
- source reliability data
- outcome learning dashboards and agent guidance
- paid CV formats
- team/admin features
- managed application workers
- support and concierge setup

Start private while building. Open source after the local engine is usable and tests prove the invariants.

## Free To Paid

Free:

- local engine
- one standard CV format
- manual job import
- local dashboard
- limited sample batch

Pro:

- more applications per day
- browser apply assistant
- email tracking
- source adapters
- scheduled runs
- extra exports

Paid later:

- social/network intelligence
- multiple CV templates
- hosted state
- connector sync
- team/coach mode
- learning from aggregate outcomes

## Connectors

No social connector is needed for v1.

Use no connector first:

- local files
- manual job import
- browser session only when needed

Useful connectors later:

- Gmail/email for reply tracking
- Google Drive/Docs for CV source and exports
- Calendar for interview scheduling
- LinkedIn/browser session for job search and applications
- WhatsApp/Telegram/social only for parked network-intelligence feature

For social login/posting, default later should still be:

```text
agent drafts -> user presses send
```

True seamless posting needs OAuth, clear permissions, and platform-specific policy review. Do not build it before the core application loop works.

## GTM Plan

Stage 1: proof

- build in public
- show one safe local run
- compare original CV vs generated CV vs reconciliation report
- publish short demos

Stage 2: power users

- GitHub + npm
- Codex/Claude skill install guide
- founder/operator/dev job seekers
- collect outcome feedback

Stage 3: concierge beta

- run setup for 10 to 20 users
- learn setup pain
- measure reply/interview rates
- identify source adapters worth building

Stage 4: paid local/pro

- hosted docs and landing page
- paid browser/email automation
- optional hosted dashboard

Stage 5: broader app

- ChatGPT app
- hosted SaaS
- connectors
- paid network intelligence

## Current Decision

Build now.

Do not add more strategy docs before Phase 0 and Phase 1 are implemented.
