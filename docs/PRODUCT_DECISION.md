# ApplyCue Product Decision

Date: 2026-07-13

## One-line decision

Ship one ApplyCue root runtime, with deterministic code for objective work and the external coding agent for judgment.

## Why

The proven fork already had the useful operating loop: source providers, rendered-page review instructions, reports, CV generation, pipeline, application modes, tracking, follow-up helpers, and extensive regression coverage. The independent TypeScript branch added useful safeguards and UI ideas but also duplicated the orchestrator, scanner, ranker, tracker, dashboard, instruction tree, storage model, and application path.

Running both made ownership unclear and created more failure modes without improving the user's odds of getting a good application out. The launch branch therefore keeps the mature root owners and ports only improvements that change a user outcome.

## Narrative Builder integration

Narrative Builder's useful ideas are absorbed as an additive agent workflow, not imported as another application. Optional user-owned `candidate-positioning.md` preserves a confirmed career spine, role-family projections, wording boundaries, and public-asset consistency across jobs. A high-stakes role gets an adaptive campaign pack under its existing `output/` folder; `high-stakes-pack.mjs` only binds that agent-authored work to the current review, JD, CV bundle, positioning, and file hashes. The existing tracker, dashboard, CV renderer, preflight, approval, and application attempt remain the only product owners.

## Final owner map

| Need | Owner |
| --- | --- |
| conversation and setup | `skills/applycue/SKILL.md` |
| source discovery | `scan.mjs`, `providers/`, approved agent connectors/browser |
| full-JD hydration and semantic fit | external agent |
| objective identity, attempt state, safety and integrity | root scripts and user config |
| reports and CV content | relevant `modes/` instructions plus external agent |
| PDF and DOCX rendering | `generate-pdf.mjs`, `generate-docx.mjs` |
| CV identity, freshness, and selected-upload hash | `cv-bundle.mjs`, `data/pdf-index.tsv` |
| optional reusable candidate positioning and high-stakes campaign freshness | external agent, `candidate-positioning.md`, `high-stakes-pack.mjs` |
| applications | `modes/apply.md`, `application-preflight.mjs`, `application-attempt.mjs`, plus the agent's approved browser/tool access |
| attempt certainty and confirmed lifecycle reconciliation | `application-attempt.mjs`, `tracker.mjs status` |
| canonical history | `data/applications.md` with separate agent `Decision`, explicit `Rank`/`Confidence`, lifecycle `Status`, internal `Origin`, and the derived `tracker.mjs` index |
| user view, CV-change notes, and named action receipts | `dashboard-server.mjs`, `job-feedback.mjs` |

## What code may decide

Code may enforce invalid/unsafe URLs, confirmed dead pages, exact URL/record identity, explicit user hard constraints, current-employer exclusion, exact confirmed application identity, file validity, and attempt state. Company/title cooldown guesses are advisory.

Code must not make the final call on title fit, CV-to-JD fit, seniority nuance, role intent, CV wording, or whether two similar titles represent the same opening. New reviews do not calculate a semantic fit score. Historical scores and text matches are diagnostics only.

Material preferences are captured and confirmed during setup, then read again before every final role decision/rank and before role-specific CV/application drafting. Missing material intent keeps a role pending. Feedback may propose a change but cannot save it without user approval.

Current final decisions are fingerprint-bound to the durable full JD, confirmed preference files, candidate evidence, review report, and tracker metadata. Any changed input makes the effective decision pending until the external agent reviews it again; code does not reinterpret the change semantically. A prepared application is separately bound to metadata-bearing Markdown/HTML, verified PDF/DOCX, their hashes, and that current decision. Application start records the exact selected upload hash.

## Features retained from the independent branch

- modern browser dashboard with small progress cards, original-JD/CV links, stage-aware prepare/ignore/CV-change/form/apply actions, and exact named approval receipts;
- DOCX output alongside PDF;
- fingerprint-bound CV bundles and exact selected-upload verification;
- explicit claim confirmation language instead of silent CV invention;
- application-attempt receipts with an `unknown` state that blocks blind retries;
- one-command confirmed outcome reconciliation with the exact tracker row and dashboard attempt state;
- agent-first profile discovery across approved CV, projects, and public sources;
- reusable candidate positioning plus fingerprint-bound high-stakes campaign packs without a second profile or application engine;
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

## Integration execution

The feature-by-feature comparison, destination-owner map, port order, acceptance gates, and explicit non-ports are maintained in [`2026-07-14_applycue-career-ops-integration_architectural_review.md`](2026-07-14_applycue-career-ops-integration_architectural_review.md). A donor capability is not part of the launch runtime until that document's code, migration, test, and acceptance gate have landed.
