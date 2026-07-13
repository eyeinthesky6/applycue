# ApplyCue Product Decision

Date: 2026-07-13

## One-line decision

Ship one ApplyCue root runtime, with deterministic code for objective work and the external coding agent for judgment.

## Why

The proven fork already had the useful operating loop: source providers, rendered-page review instructions, reports, CV generation, pipeline, application modes, tracking, follow-up helpers, and extensive regression coverage. The independent TypeScript branch added useful safeguards and UI ideas but also duplicated the orchestrator, scanner, ranker, tracker, dashboard, instruction tree, storage model, and application path.

Running both made ownership unclear and created more failure modes without improving the user's odds of getting a good application out. The launch branch therefore keeps the mature root owners and ports only improvements that change a user outcome.

## Final owner map

| Need | Owner |
| --- | --- |
| conversation and setup | `skills/applycue/SKILL.md` |
| source discovery | `scan.mjs`, `providers/`, approved agent connectors/browser |
| full-JD hydration and semantic fit | external agent |
| objective identity, attempt state, safety and integrity | root scripts and user config |
| reports and CV content | relevant `modes/` instructions plus external agent |
| PDF and DOCX rendering | `generate-pdf.mjs`, `generate-docx.mjs` |
| applications | `modes/apply.md` plus the agent's approved browser/tool access |
| attempt certainty | `application-attempt.mjs` |
| canonical history | `data/applications.md` and derived `tracker.mjs` index |
| user view and feedback | `dashboard-server.mjs` |

## What code may decide

Code may enforce invalid/unsafe URLs, confirmed dead pages, exact URL/record identity, explicit user hard constraints, current-employer exclusion, exact confirmed application identity, file validity, and attempt state. Company/title cooldown guesses are advisory.

Code must not make the final call on title fit, CV-to-JD fit, seniority nuance, role intent, CV wording, or whether two similar titles represent the same opening. Scores and text matches are diagnostics.

## Features retained from the independent branch

- modern browser dashboard with small progress cards, links, filters, and thumbs feedback;
- DOCX output alongside PDF;
- explicit claim confirmation language instead of silent CV invention;
- application-attempt receipts with an `unknown` state that blocks blind retries;
- agent-first profile discovery across approved CV, projects, and public sources;
- exact-identity duplicate policy for ambiguous same-company titles.

## Features removed from this branch

- TypeScript `apps/` and `packages/` control plane;
- lexical/semantic ranker as final authority;
- second profile store, tracker, dashboard, scanner, worker, and browser orchestrator;
- placeholder web app;
- Go terminal dashboard;
- fuzzy same-company/title deduplication;
- hard CV provenance rejection for marketing wording.

The independent implementation remains preserved in its donor branch/worktree for reference. It is not part of the launch install and must not be restored wholesale.

## AI boundary

For MVP, Codex, Claude, or another user-chosen agent supplies judgment through its native tools and connectors. Optional embedded/API model trials are later and must pass the gates in `docs/ai-judgment-trial-plan.md`. No model API key is required today.

## Claim boundary

Passing tests proves code health. “Ready for public users” additionally requires a clean-link install and a real CV-to-confirmed-application UAT under `docs/launch-readiness.md`.
