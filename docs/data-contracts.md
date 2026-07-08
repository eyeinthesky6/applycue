# ApplyCue Data Contracts

Date: 2026-07-05

The TypeScript source of truth starts in `packages/core/src/index.ts`.

## Profile

A profile contains:

- user identity and optional contact fields
- base CV text and structured CV representation
- preferences
- apply settings
- match settings
- proof bank

Normal preferences include target roles, adjacent roles, industries, excluded industries, locations, work modes, seniority, acceptable experience range, employment type, company stage, compensation, work authorization, notice period, travel, blocked companies, company seniority overrides, and keywords.

Proof bank items connect claims to evidence. CV tailoring must use proof, not invention.

## CV Variants

A CV variant stores:

- the job id
- the format mode
- the template id
- the source CV hash when available
- the target base CV id when used
- requirement matches
- unsupported requirements
- reconciliation status
- reconciliation notes
- proof-backed content changes

Each requirement match says whether the job requirement is supported, adjacent, unsupported, or needs confirmation.

Direct `supported` requirements can shape generated CV content. Required `needs_confirmation` or adjacent-only requirements must pause before application output proceeds. `unsupported` requirements must not be claimed.

Reconciliation reports include coverage counts for required requirements: total, supported, needs confirmation, adjacent, and unsupported. Agents should use this to inspect false positives and false negatives before changing proof terms.

The CV generator may change wording and emphasis. It may not create a claim that lacks a proof item or user-confirmed source fact.

V1 uses one standard ATS format. The user's uploaded CV is a fact source, not a layout source.

## Job Record

A job record contains:

- source and URL
- company
- role title
- location
- work mode
- seniority
- description
- compensation if available
- discovered date
- liveness state

## Scan History

Scan history is local operational state, not source code.

It lives under:

```text
~/.applycue/profiles/<profile>/data/local/scan-history.jsonl
```

Each entry records:

- job id and URL
- company and role title
- source id, source name, and source kind
- status: `seen`, `prepared`, or `closed`
- first and last seen timestamps
- optional application and CV variant ids

Daily and push runs may skip non-manual jobs already marked `prepared` or `closed`. Review mode keeps them visible so the user and agent can inspect repeated roles during UAT or manual checks.

Scan history also emits repost signals. A repost signal means the same company has shown a similar role title on multiple URLs within the configured window. It is a warning for source quality and stale-opening analysis, not an automatic skip.

## Hard Gates And Backend Ordering

Backend ordering stores:

- hard gate results
- internal ordering signals
- reasons
- final priority

The user sees reasons and decisions. The backend may keep ordering signals for audit and diagnostics, but they are not the product and are not a prediction of success.

Hard gates block wrong role family, blocked companies, no-go terms, excluded industries/keywords, impossible work mode, out-of-range seniority, out-of-range required experience, employment type, company stage, and work authorization. Adjacent-only roles are optional exploration lanes, not default application targets.

`JobRecord` may carry `seniorityEvidence`, `companyMarketGrade`, and `requiredExperienceYears`. The normalizer can infer simple seniority and experience evidence from titles/JDs, and can attach a small reusable company-grade signal from known company/domain markers. User-approved exceptions belong in `preferences.companySeniorityOverrides`, not in ranker code.

## Funnel Health

Each run manifest and progress snapshot may include `funnelHealth`.

It summarizes:

- configured daily target
- prepared applications
- discovered jobs
- jobs kept for shortlist preparation
- watched or skipped jobs
- dominant source filters
- dominant preference gate blockers
- suggested next actions

This is not a user-worth score. It tells the agent why the pipeline is too narrow, too broad, or healthy. Low volume should trigger source expansion or explicit user questions. High/noisy volume should trigger tighter source and title filters.

## Application Record

Application state tracks:

- job id
- selected CV variant
- draft answers
- status
- mode
- exception reasons
- daily application batch
- outcome
- timestamps

## Outcome Events

Outcome events are local operational state, not source code.

They live under:

```text
~/.applycue/profiles/<profile>/data/local/outcomes.jsonl
```

Each event records:

- application id
- type: `submitted`, `confirmation`, `reply`, `interview`, `offer`, `rejection`, `withdrawn`, or `user_feedback`
- note
- occurred timestamp

Agents should record events through the product command:

```powershell
pnpm applycue:record-outcome -- --application <application-id> --type reply --note "Recruiter replied"
```

Do not store outcome events in the source repo. Do not edit source code to record one user's reply, rejection, interview, or offer.

## Source Learning

Source learning summarizes which discovery sources are producing useful outcomes.

The run manifest and dashboard may include:

- applications with source context
- prepared applications by source
- submitted, replies, interviews, offers, and rejections by source
- positive outcomes: replies, interviews, or offers
- top sources by outcome signal

This is not a user-facing score. It is an operations signal for prioritizing sources, widening or tightening searches, and learning which channels are worth more effort.
