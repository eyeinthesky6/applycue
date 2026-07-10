# ApplyCue Pivot History

Date: 2026-07-10

This document explains why this repo has both an independent ApplyCue branch and the current career-ops-based branch. It is for future agents so they do not restart old debates or mix the two directions by accident.

## Current Default Direction

Use this branch for live UAT and current product work:

```text
applycue/career-ops-fork
```

This branch starts from the working career-ops codebase and adds ApplyCue layers on top: profile storage, user preference gates, source handling, CV truth checks, application routes, browser UAT, form data, outcome tracking, and agent skills.

Reason: career-ops already had a working job-search loop, provider integrations, dashboard/tracker ideas, and CV artifact flow. For a product whose goal is "CV to offer letter", proving the full loop mattered more than owning every line of code from scratch on day one.

## Independent Direction

The earlier "build ApplyCue ourselves" work is preserved here:

```text
independent/improve-role-fit-math
backup/independent-applycue-20260708
```

What it was trying to do:

- build a clean ApplyCue architecture from scratch
- use stronger deterministic matching and scoring
- separate source discovery, ranking, CV generation, dashboard, and apply routing
- avoid depending on career-ops internals

Why we paused it:

- matching CVs to jobs is messy and easy to over-engineer
- titles, industries, seniority, salary, and location vary too much across companies and countries
- agents are better than hardcoded math for fuzzy fit judgment
- we needed live usable output quickly, not a research project
- career-ops already worked well enough to validate the product loop

Use the independent branch only for reference, extraction, or later rebuild work. Do not use it for tomorrow's live UAT.

## Pivots In Plain Language

1. We started with a fresh ApplyCue idea: a chat-first CV-to-offer system.
2. We built independent scaffolding and experimented with role-fit math.
3. The scoring/matching direction became too complex for the immediate goal.
4. We decided the product value is not a perfect score. The value is an agent reliably finding roles, preparing truthful CVs, and helping apply at volume with user control.
5. We switched to career-ops as the base because it already found jobs and generated useful artifacts.
6. We renamed and layered ApplyCue behavior on top instead of hand-editing one-off CVs or building a giant matching engine.
7. We kept the independent branch so good ideas are not lost, but the current launch path is the career-ops fork.

## Current Product Rule

Judge every feature by this invariant:

```text
Does this help an agent get a user from CV to offer letter with less manual effort and fewer unsafe mistakes?
```

If the answer is no, park it.

## What Code Should Do

Code should handle:

- repeatable profile storage
- source discovery plumbing
- hard blockers such as geography, fraud, duplicate jobs, closed jobs, and impossible work authorization
- truthful CV generation from approved facts
- reconciliation against the base CV and approved facts
- generated DOCX/PDF/HTML artifacts
- application routes and browser plans
- receipts, outcomes, and learning signals
- privacy guardrails so user assets stay outside the repo

## What Agents Should Do

Agents should handle:

- fuzzy fit judgment
- deciding whether a noisy shortlist needs tuning
- asking the user only when needed
- using native email/social/browser connectors when the user permits it
- applying approved tuning through product commands
- operating the product from chat

Agents should not:

- patch source code for one job
- hand-edit generated CVs as the normal flow
- invent job facts or candidate claims
- silently widen geography, older posts, source scope, or application volume
- submit applications without a current preflight and user policy approval

## Branch Map

```text
main
  Initial ApplyCue baseline.

independent/improve-role-fit-math
  Independent ApplyCue path with heavier matching/scoring work.

backup/independent-applycue-20260708
  Saved backup of the independent plan before switching base.

applycue/career-ops-fork
  Current working branch for live UAT and launch prep.
```

## Guidance For Next Agents

Start from `applycue/career-ops-fork` unless the user explicitly asks to inspect or revive the independent path.

Before adding new architecture, read:

- `AGENTS.md`
- `skills/applycue/SKILL.md`
- `docs/build-decision.md`
- `docs/live-usage-runbook.md`
- this file

For live usage, keep one profile per candidate under:

```text
%USERPROFILE%\.applycue\profiles\<profile>\
```

Do not put real CVs or generated user outputs into the repo.

