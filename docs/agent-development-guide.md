# ApplyCue Agent Development Guide

## Before changing code

1. Read `AGENTS.md`, `docs/PRODUCT_DECISION.md`, and `docs/ARCHITECTURE.md`.
2. Reproduce a real failure or point to a documented requirement.
3. Identify the existing owner. Do not add a parallel engine, worker, tracker, dashboard, profile store, or instruction tree.
4. Check shared helpers, contracts, generated artifacts, and tests before creating a file.

## Architecture rule

Objective, reproducible work belongs in code. Semantic judgment and writing belong to the external agent.

Good code gates: invalid URL, exact duplicate identity, confirmed dead page, explicit hard constraint, current employer, exact application URL, file validity, attempt state.

Bad code gates: fuzzy title fit, company/title cooldown guesses, semantic CV-to-JD fit, inferred role quality, CV wording quality, whether similar titles are the same opening. These create false eliminations and belong to agent review.

## Existing owners

| Area | Owner |
| --- | --- |
| setup | `doctor.mjs`, scaffolder, canonical skill |
| sources | `scan.mjs`, `providers/`, `portals.yml` |
| liveness | `check-liveness.mjs`, `liveness-*` |
| review/report | `modes/oferta.md`, `modes/auto-pipeline.md`, `reports/` |
| CV | `modes/pdf.md`, `generate-pdf.mjs`, `generate-docx.mjs`, LaTeX helpers |
| application | `modes/apply.md`, agent browser tools, `application-attempt.mjs` |
| history | `data/applications.md`, `tracker.mjs`, merge/reconcile tools |
| dashboard rendering and HTTP boundary | `dashboard-server.mjs` |
| dashboard action/approval receipts | `job-feedback.mjs` |
| high-stakes campaign-pack freshness | `high-stakes-pack.mjs` |
| user workflow | `skills/applycue/SKILL.md` |

## Change method

- Make the smallest reusable change in the owner.
- Preserve user files and unrelated worktree changes.
- Add a focused regression test for the failure.
- Keep generated output and personal data out of source control.
- Update the canonical doc only; use thin pointers elsewhere.
- When using OSS, record license, maturity, maintenance, integration cost, failure behavior, and why it beats existing code.

Do not edit `.env` or add credentials. Do not weaken enforcement unless it is clearly blocking valid product outcomes and the replacement is documented/tested.

## Provider changes

A provider returns normalized lead fields and does not rank candidate fit. New providers need:

- clear source/license/terms boundary;
- fixtures for normal, empty, paginated, rate-limited, and malformed responses;
- stable URL/identity handling;
- date/location preservation;
- a canary or diagnostic command;
- an agent/browser fallback for rendered or collapsed JDs.

## CV changes

Keep the supplied baseline. Code may render and validate files; the agent writes role-specific content. Claim provenance is a user confirmation signal, not a hard language police. Broken artifacts, wrong-role files, or unresolved legal answers remain hard blockers.

## Application changes

No direct submit path may bypass named user approval, current-page preflight, and an attempt receipt. A click without reliable success evidence is `unknown`, not `confirmed`. Do not auto-retry it.

## Checks

Run focused tests first, then:

```powershell
node validate-system-paths-coverage.mjs
node test-all.mjs
node doctor.mjs --json
```

For launch work, also run the clean-install and real-flow checks in `docs/launch-readiness.md`. A healthy test suite does not prove a useful shortlist or successful application.

## Git

Review `git status`, `git diff --check`, personal-data scans, and generated files before committing. Keep Career-Ops MIT attribution. Do not merge the independent donor branch wholesale or publish confusing archive branches as product choices.
