# ApplyCue Pivot History

Date: 2026-07-10

Status: current branch and architecture history; `ARCHITECTURE.md` owns the final direction.

This document explains why the current branch started from career-ops, how the independent ApplyCue engine became the supported runtime, and why the inherited implementation was first quarantined and then removed.

## Current Default Direction

Use this branch for live UAT and current product work:

```text
applycue/career-ops-fork
```

This branch started from the career-ops repository, but the supported runtime is now the typed ApplyCue implementation under `apps/` and `packages/`. Profile storage, preference gates, discovery, CV truth checks, routes, browser UAT, form data, outcomes, and agent skills are owned there.

The inherited career-ops implementation has been removed from this branch. Dated reviews and Git history remain referenceable, but no local fork tree, supported package script, or runtime fallback remains. Full ApplyCue checks and UAT are rerun after the deletion.

## Final Architecture Direction

The branch choice is not the permanent architecture choice. The accepted target as of 2026-07-10 is documented in `docs/ARCHITECTURE.md`:

- ApplyCue remains one typed modular product engine;
- Codex, Claude, or another external agent handles fuzzy judgement and user-authorized actions;
- ApplyCue does not need an embedded model provider for the current product;
- mature permissive OSS is adopted only for replaceable plumbing behind ApplyCue contracts;
- historical provider/resilience lessons may be reimplemented or adopted from an approved permissive source behind ApplyCue contracts;
- the inherited scanner, tracker, prompt modes, evaluators, and batch control plane do not remain a second canonical runtime.

Continue using this branch for current UAT and product work. Do not restart the old branch wholesale and do not restore the removed implementation as a fallback.

This does not ban model APIs forever. The accepted order is native Codex/Claude judgement through the ApplyCue skill now, an optional hosted model API only after a benchmarked product decision, and local/fine-tuned models only after enough consented corrections, evaluation evidence, time, and budget exist. The canonical shortlist and trial gate are in `docs/ai-judgment-trial-plan.md`.

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

The preserved independent branches remain comparison points. Current UAT runs from this checkout because the independent ApplyCue engine is already the supported runtime here; do not switch branches merely because an older note calls one branch “independent.”

## Pivots In Plain Language

1. We started with a fresh ApplyCue idea: a chat-first CV-to-offer system.
2. We built independent scaffolding and experimented with role-fit math.
3. The scoring/matching direction became too complex for the immediate goal.
4. We decided the product value is not a perfect score. The value is an agent reliably finding roles, preparing truthful CVs, and helping apply at volume with user control.
5. We switched to career-ops as the base because it already found jobs and generated useful artifacts.
6. We renamed and layered ApplyCue behavior on top instead of hand-editing one-off CVs or building a giant matching engine.
7. The independent TypeScript ApplyCue engine reached the same supported output path without calling the inherited runtime.
8. We moved career-ops code, Docker/Nix packaging, and legacy-only automation under `legacy/career-ops/` so any accidental dependency would fail visibly.
9. After the independent ApplyCue runtime passed without it, we removed that forked tree from the branch. Historical comparisons remain in docs and Git history.

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
- generated DOCX/HTML/Markdown artifacts
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
  Current working branch name retained for history. Its supported runtime is independent ApplyCue code; inherited career-ops code has been removed.
```

## Guidance For Next Agents

Start from the current branch for ApplyCue work. Treat its historical name as provenance, not as permission to restore the removed fork runtime.

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
