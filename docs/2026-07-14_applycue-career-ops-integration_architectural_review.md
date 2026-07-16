# ApplyCue and Career-Ops Integration Architectural Review

Date: 2026-07-14

Status: canonical integration and update plan for the consolidated MVP. This document records what is inherited, what has already been integrated, what still needs a focused port, where each change belongs, and how it will be accepted. It does not replace the product rules in `PRODUCT_DECISION.md`, `ARCHITECTURE.md`, the canonical skill, or the roadmap.

## Scope

Compare three real repository states:

1. the personalized Career-Ops operator and upstream reference;
2. the independent typed ApplyCue donor worktree;
3. the consolidated Career-Ops-derived ApplyCue runtime and only launch destination.

The review answers four questions:

- what each codebase genuinely owns;
- what the consolidated runtime already retained or upgraded;
- what useful ApplyCue capability was removed without a complete equivalent;
- exactly what should move, where it should land, how it should be adapted, and what proves it works.

No reference worktree is an implementation target. Both reference worktrees contain existing user or uncommitted work and must remain untouched during ports.

## Executive Decision

Use one product runtime:

```text
Career-Ops foundation
  + selected ApplyCue contracts and safety guarantees
  + Codex/Claude judgment and approved browser/connectors
  = ApplyCue MVP
```

The destination is the consolidated runtime on `codex/applycue-merged-mvp` until release. Do not restore the TypeScript control plane, run two trackers, or ask users to choose between branches.

Career-Ops is the operating foundation. The independent ApplyCue worktree is a donor of tested behavior, contracts, fixtures, and algorithms. A port copies one outcome-improving capability into an existing root owner; it never copies `apps/` or `packages/` wholesale.

## Repository Roles

| Repository | Reviewed state | Role | Write policy | Current check evidence |
| --- | --- | --- | --- | --- |
| Career-Ops reference | `main` at `95a665a`, reviewed with its local user layer excluded from publication | upstream/reference and historical personalized operator | read-only | 852 root checks passed |
| typed ApplyCue donor | `codex/applycue-mvp` at `3e6d539`, preserved as donor evidence | typed donor and historical evidence | read-only | 33 files / 385 typed tests passed |
| consolidated ApplyCue runtime | `codex/applycue-merged-mvp` at `413e10c` when this review began | sole product and integration destination | normal reviewed changes | 864 root checks passed before this document |

Test counts are not directly comparable because the suites cover different contracts. Green tests prove their code-level assertions, not a completed real application.

## Evidence Checked

- Git state, recent history, branches, package commands, and current write boundaries in all three worktrees;
- Career-Ops root scanner, 35 provider adapters, modes, reports, PDF path, tracker, plugins, follow-up logic, interview instructions, dashboard, and test suite;
- typed ApplyCue profile, discovery, full-JD, agent-review, CV, application, browser, outcome, dashboard, workflow-lease, status, and UAT owners;
- consolidated ApplyCue skill, architecture, data contract, scanner, modes, report artifacts, PDF/DOCX paths, tracker, application-attempt ledger, dashboard, and launch-readiness gates;
- the imported historical report path and the current prepared Glean path;
- current doctor output, which is ready but reports no project browser MCP and shows Gmail disabled because its OAuth configuration is absent.

## Tool Baseline

| Check | Result | What it proves | What it does not prove |
| --- | --- | --- | --- |
| donor `pnpm applycue:check` | PASS, 385 tests | typed donor compiles and its current contracts pass | that its second control plane should be restored |
| Career-Ops `node test-all.mjs --json` | PASS, 852 checks | mature root providers/modes/helpers remain healthy | that legacy score, dedupe, or dashboard rules fit ApplyCue |
| consolidated `npm run check` | PASS, 892 checks on 2026-07-14 | current root code, dashboard, DOCX, JD/review/CV-bundle/preflight/attempt reconciliation, providers, and privacy rules pass | an end-to-end confirmed application |
| consolidated `node doctor.mjs --json` | ready, optional connector warnings | local user layer exists | Gmail or browser integration is active |

## Simple Architecture Comparison

| Area | Career-Ops | Independent typed ApplyCue | Consolidated ApplyCue | Decision |
| --- | --- | --- | --- | --- |
| Main interface | agent follows modes and edits files | typed worker commands plus agent handoffs | chat-first agent over root scripts/modes | retain consolidated approach |
| Product orchestration | simple root Node scripts and Markdown | second TypeScript engine/worker/browser control plane | one root Node runtime | do not restore second control plane |
| Setup/CV intake | user files and agent-led onboarding | PDF/DOCX/text import, identity extraction, preserved baseline | workflow instructions; no equivalent deterministic importer | port bounded intake/baseline behavior |
| Profile/evidence | CV, YAML, `_profile.md`, `_custom.md` | private multi-profile store, evidence inventory and hashes | one checkout-local user layer | port evidence inventory; defer multi-profile store to V1 |
| Discovery breadth | 35 mature root adapters and plugins | smaller typed source set plus JobSpy/source planning | inherited broad provider set with safer filtering | keep root providers; port quality evidence only |
| Source approval/quality | editable `portals.yml`, basic failures | source plans, approval, canary, freshness and scorecards | agent-managed config; limited source diagnostics | port canary/run evidence behind scanner owners |
| Full JD | agent opens page and writes report | typed capture, completeness assessment and fingerprint | durable `jds/` capture plus receipt implemented 2026-07-14 | retain root port |
| Semantic review | agent report, archetype and inherited 1-5 score | agent decision queue with fingerprints and stale-decision rejection | agent judgment plus root fingerprint-bound stale-decision rejection implemented 2026-07-14 | retain root port |
| CV | agent writes; code renders HTML/PDF | evidence-bound draft, reconciliation and DOCX | agent writes; PDF/DOCX renderers work | retain rendering; port artifact/evidence reconciliation selectively |
| Application answers | agent asks while operating form | approved reusable answers and master-form snapshot | instructions only; no working answer schema | P0/P1 port into application owner |
| Browser/application | agent/browser instructions | page-stage preflight, native handoff, upload hashes and result receipt | one root preflight/answer helper plus named attempt/outcome ledger | retain the single root bridge; do not port the browser orchestrator |
| Tracker/outcomes | Markdown source plus derived SQLite | typed events, idempotency and immediate refresh | inherited tracker plus separate attempt ledger | reconcile receipt and tracker atomically |
| Dashboard | Go terminal UI | typed current-run browser view | new Node browser dashboard | retain current UI; correct data semantics |
| Email | OAuth Gmail-label ingest plugin | connector-neutral lead import and provenance | inherited Gmail plugin, disabled; native connector is policy only | one common ingest boundary; native connector first |
| Feedback/tuning | limited pattern/follow-up helpers | feedback receipts and approved tuning application | stage-aware action/CV-change/approval receipts; no approved tuning application | keep current action owner; port tuning approval after core application proof |
| Concurrency | report-number and merge safeguards | profile lease, fingerprints and atomic batches | parallel source reads; incomplete state-write protection | port one workflow lease/atomic update boundary |
| Post-application | follow-up and interview instructions | outcome event labels; limited automation | inherited instructions but outside MVP | keep dormant for V1; do not delete |
| Embedded AI | several optional evaluator runners | no embedded model required in final design | external agent is canonical | keep API models out of MVP |

## What Is Already Integrated

The following are real consolidated ApplyCue changes, not plans:

1. A chat-first canonical ApplyCue skill with baseline-before-rewrite and agent-owned semantic decisions.
2. Advisory title/content filters, review-only company/title cooldowns, and exact URL/attempt duplicate protection in `scan.mjs`.
3. A Node browser dashboard with compact counts, filters, original-posting/saved-JD/review/PDF/DOCX links, stage-aware user actions, CV-change notes, and exact apply approval after preflight.
4. DOCX generation alongside the inherited HTML/PDF paths.
5. Append-only application-attempt receipts with `started`, `confirmed`, `unknown`, `failed`, and `abandoned` outcomes.
6. Named application approval and unknown-attempt retry protection in the application mode.
7. One Node/pnpm install without Go, Docker, Python, or an embedded model requirement.
8. User-data ignore and regression checks for the consolidated owners.
9. Fingerprint-bound Markdown/HTML/PDF/DOCX bundles with exact selected-upload verification.
10. Confirmed attempt-to-tracker reconciliation and per-job attempt state in the browser dashboard.

The provider network, report format, PDF/LaTeX engine, tracker, Gmail plugin, follow-up helper, interview modes, plugin engine, and much of the regression suite remain Career-Ops-derived.

## Incomplete or Conflicting Integration

### P0 findings and current status

1. ✅ **Historical/current evidence separation resolved 2026-07-14.** Imported/history rows carry internal origin metadata, receive a visible history label, and stay out of current-run counts.
2. ✅ **Decision/lifecycle separation resolved 2026-07-14.** The tracker stores the agent's `pending|apply|watch|skip` decision separately from lifecycle status; `Evaluated` no longer implies shortlisted.
3. ✅ **Full-JD evidence and stale-decision rejection resolved 2026-07-14.** `review-evidence.mjs` stores complete live captures under `jds/`, appends decision receipts, and makes a changed JD/preference/evidence/report/tracker context effectively pending. Dashboard, verifier, and application start consume the same check.
4. ✅ **CV bundle identity resolved 2026-07-14.** `cv-bundle.mjs` verifies role metadata, opens/parses all four CV artifacts, records hashes against the current JD/review, and makes application start accept only the exact selected PDF or DOCX.
5. **Scan evidence is lost at handoff.** Provider, trust/review signals, and WebSearch handoffs do not survive in the simple pipeline line.
6. ✅ **Legacy score authority removed 2026-07-14.** New reviews use structured agent decision/rank/confidence and evidence. Historical score cells remain readable but no longer gate decisions, sorting, replacement, deduplication, PDF/application answers, or outcome recommendations.
7. ✅ **Application receipt/tracker reconciliation resolved 2026-07-14.** Confirmed finish uses the existing tracker owner to validate identity, update the exact lifecycle row, rebuild the derived index, and record the transition on the receipt. The verifier rejects receipt/tracker disagreement and the dashboard shows the latest outcome on its job.
8. ✅ **Application answer and live-form handoff resolved 2026-07-14.** One root helper stores explicitly approved reusable answers, refuses credential/payment/identity-document values, records a no-fill structural form receipt, and makes attempt start require its current review/CV/answer fingerprints.
9. **Parallel state mutation is unsafe.** Some modes encourage parallel work over shared pipeline files without one coordinator owning persistence.
10. **No current end-to-end application proof exists.** A current role now has a current full-JD receipt and verified CV bundle, but there is no named attempt, reliable outcome, and reconciled dashboard row.

### P1 findings

- CV import and evidence inventory depend on the host agent rather than a durable product receipt.
- Source run summaries, source-quality scorecards, and coverage-expansion evidence are incomplete.
- Gmail exists only as a disabled inherited OAuth-label plugin; native connector ingestion and application-history import are not implemented.
- Feedback is stored but there is no dry-run, approval, and applied-tuning history.
- The dashboard identifies the latest attempt outcome on each current job and keeps aggregate unresolved-attempt counts.
- Multi-profile isolation, scheduled scans, alerts, and background reconciliation remain V1 work.

## Integration Ledger: What, Where, and How

Every row below must ship as a small feature slice in the consolidated runtime. The destination owner remains authoritative after the port.

### P0 — complete the current CV-to-application promise

| What to integrate/update | Donor or inherited source | Destination owner | How to integrate | Acceptance gate |
| --- | --- | --- | --- | --- |
| ✅ Historical/current artifact provenance — implemented 2026-07-14 | donor dashboard categorization; current tracker/report dates | `data/applications.md`, `tracker.mjs`, `dashboard-server.mjs` | tracker stores separate review metadata and internal `Origin`; `tracker.mjs migrate-metadata` is dry-run first, requires explicit current/imported ID classification, writes a backup, and leaves unknown old rows outside current counts; new-user UI shows no origin badge | passed: imported rows are filterable/labelled history, excluded from current-run counts, and `Evaluated` alone stays `pending` |
| ✅ One semantic decision system — implemented 2026-07-14 | Career-Ops `modes/_shared.md`, `modes/oferta.md`, `modes/pipeline.md`; candidate `_profile.md` | English canonical modes, `templates/states.yml`, tracker and dashboard | new reviews record agent `Decision`, explicit queue `Rank`, `Confidence`, strengths, gaps, unknowns, preference basis, and reason; Score is `N/A`; merge/dedup/dashboard/batch/artifact/pattern owners ignore legacy scores; localized copies cannot own semantic behavior until aligned | passed: newer score-free review updates exact records, stale high score cannot overwrite a newer decision, lifecycle/recency beats score in dedup, batch has no score gate, dashboard sorts by rank, and the full suite is green |
| ✅ Durable full-JD capture — implemented 2026-07-14 | donor `packages/discovery/src/job-detail.ts` and worker `record-job-details`; root `jds/` owner | `review-evidence.mjs`, `jds/`, reports and pipeline handoff | root helper stores source/final URL, capture time, liveness, method, full visible text and SHA-256 content/artifact fingerprints; previews and non-live captures cannot receive a final receipt | passed: no current final decision is effective without a confirmed-complete live JD capture |
| ✅ Resumable agent decision receipt — implemented 2026-07-14 | donor `packages/engine/src/agent-review.ts` | `review-evidence.mjs`, canonical modes, verifier, dashboard and application attempt | append-only receipt binds JD, confirmed preferences, candidate evidence, report, review protocol and tracker decision/rank/confidence; external agent still writes meaning and rank | passed: changed inputs expose pending re-review, verifier fails stale state, dashboard excludes it from shortlist, and application start blocks it |
| Preserve scan-to-agent evidence | donor source/audit artifacts; root scanner review signals | `scan.mjs`, `data/scan-history.tsv`, `data/pipeline.md` or a documented companion artifact | persist provider, run ID, liveness/trust, review signals and agent/browser handoffs; keep pipeline human-readable | dashboard/status explains fetched, objectively blocked, pending/hydration, and source failures for one run |
| Reconcile current pipeline | root `reconcile-pipeline.mjs`, tracker and reports | `reconcile-pipeline.mjs` | extend existing reconciliation to detect tracker/report rows still pending and resolve them without deleting unrelated leads | no current reviewed role remains simultaneously unresolved in the pending queue |
| ✅ CV bundle identity and validation — implemented 2026-07-14 | donor CV reconciliation/artifact manifest; current renderers | `cv-bundle.mjs`, `modes/pdf.md`, `generate-pdf.mjs`, `generate-docx.mjs`, `data/pdf-index.tsv`, `application-attempt.mjs` | metadata-bound Markdown/HTML plus verified PDF/DOCX hashes are recorded against the current review; selected upload must be the exact verified PDF or DOCX; claims remain confirmation signals rather than hard language rejection | passed: selected MD/HTML/PDF/DOCX open/parse, name the same company/role, reference the current JD/decision, become stale on changed input, and application start binds the selected hash |
| ✅ Reusable approved application answers — implemented 2026-07-14 | donor `application-answer-approval.ts` and `master-form-data.ts` | `application-preflight.mjs`, `data/application-answers.jsonl`, `modes/apply.md` | aliases, explicit replace/revoke, sensitive-storage refusal, user approval and stable answer-set fingerprint are adapted into one append-only user ledger; profile YAML is not rewritten or duplicated | passed: the user is asked once, approved aliases reuse the answer, changes need explicit replace, and credentials/payment/identity values are refused |
| ✅ Code-backed application preflight — implemented 2026-07-14 | donor `live-preflight.ts` and `native-browser.ts` | `application-preflight.mjs`, `application-attempt.mjs`, host-native browser boundary | host agent supplies a value-free structural field snapshot; code binds active form stage, visible-field coverage, answer sources, tracker job/URL, current JD/review, chosen CV, answer hash and 30-minute evidence; host browser remains the executor | passed in fixtures: a job page, unresolved/sensitive inferred field, stale answer/review/CV, expired receipt, or reused receipt cannot start; real controlled UAT remains |
| ✅ Dashboard action and CV-correction handoff — implemented 2026-07-14 | donor feedback receipts and current browser dashboard | `dashboard-server.mjs`, `job-feedback.mjs`, `application-attempt.mjs` | replace thumbs with stage-aware prepare/ignore/form/CV-change/apply actions; bind apply approval to the exact CV and preflight; keep tracker/application mutation with existing owners | passed in fixtures: direct full-JD/PDF/DOCX review works, CV-change notes block the old bundle, only a newly resolved bundle proceeds, and a dashboard approval cannot move to another CV/form |
| ✅ Atomic outcome reconciliation — implemented 2026-07-14 | donor tracker outcomes; root attempt ledger | `application-attempt.mjs`, `tracker.mjs`, dashboard, verifier | confirmed finish validates exact tracker identity, applies one guarded status mutation, rebuilds the derived index, and stores the transition on the receipt; unknown/failed/abandoned remain job-level attempt evidence without becoming Applied | passed: confirmed status is visible on the correct role, unresolved outcomes remain non-Applied, identity drift is rejected, and tracker/receipt mismatch fails verification |
| Current full-flow UAT | donor UAT contract plus root launch readiness | current test suite and `docs/launch-readiness.md` | add a non-submit fixture flow, then run one named approved real/test attempt through all current owners | captured JD -> decision -> CV bundle -> approval -> attempt -> reliable outcome -> matching dashboard row |

### P1 — improve coverage and repeatability after the first controlled application

| What | Source | Destination | How | Acceptance gate |
| --- | --- | --- | --- | --- |
| Deterministic CV intake and evidence inventory | donor profile package, `profile-evidence.ts`, `original-cv-baseline.ts`, `base-cv-review.ts` | setup owner: canonical skill, `doctor.mjs`, scaffolder and a bounded root helper | port PDF/DOCX/text extraction, original asset/hash preservation, bounded approved-folder inventory and material-change review; do not scan the whole machine | clean setup preserves the exact input and produces a user-confirmed evidence inventory without inventing claims |
| Source-run scorecard/canary | donor `source-quality.ts`, `source-canary.ts`; root verify tools | `scan.mjs`, `verify-portals.mjs`, scan history and dashboard | adapt freshness, failure, duplicate and useful-yield metrics; do not port semantic hard filters | each source shows attempted/fetched/fresh/unique/agent-approved counts and a clear degraded reason |
| Email leads and history import | donor email import; inherited Gmail plugin | native agent connector first, `plugins/gmail`, `plugins.mjs`, pipeline/tracker | define one normalized ingest contract; native connector supplies approved data without repo tokens; OAuth plugin remains optional headless fallback; separate lead import from confirmation-history import | approved email leads dedupe into discovery, imported applications show their origin, and no connector token enters ApplyCue state |
| Feedback-to-tuning approval | donor `job-feedback.ts`, `tuning-application.ts` | `job-feedback.mjs`, user config, agent workflow | keep action/feedback receipts immutable; agent proposes one reusable change; code previews diff; user approves before write | dashboard feedback never silently changes preferences and every applied tuning has before/after evidence |
| Bounded source expansion | documented JobSpy/India-board trials | `providers/`, native browser/connector plan | first activate suitable existing providers and one approved logged-in India board; trial JobSpy only behind provider contract if unique qualified yield remains poor | trial adds at least 20 fresh unique relevant India leads without becoming a mandatory Python dependency |

### V1/V2 — defer, do not mix into MVP

| Capability | Target phase | Reason |
| --- | --- | --- |
| external multi-profile store and profile-scoped leases | V1 | required for multiple candidates, not the first local application |
| scheduled scans, proactive email classification, alerts and calendar handoff | V1 | needs explicit connector permissions and reliable background state |
| portal-specific high-volume adapters | V1 | build from measured repeated portal failures |
| basic company/role/interview preparation | V1 after confirmed application | reuses existing evidence but must not delay application MVP |
| hosted chat, tenancy, encrypted storage, embedded model routing and billing | V2 | different privacy, reliability and commercial boundary |

## Explicit Rejections

Do not port or reactivate:

- the complete TypeScript `apps/` and `packages/` control plane;
- a second scanner, tracker, dashboard, browser orchestrator, profile store, or instruction tree in MVP;
- lexical/semantic ranking as final decision authority;
- fuzzy same-company/title suppression;
- hard rejection of legitimate CV reframing solely because wording is new;
- the Go terminal dashboard, Docker requirement, Nix/Bun alternate installers, or mandatory Python;
- embedded OpenAI, Gemini, Ollama, or OpenRouter evaluation as the default judgment path;
- making the existing optional `scan:full` reverse-ATS directory a default, launch-critical, or commercial dependency while its external-data boundary remains unresolved. Keep it dormant for a later non-commercial coverage trial; normal `npm run scan` does not depend on it;
- automatic email/DM sending or application submission without named user approval.

## Implementation Method

Every port follows this sequence:

1. Reproduce the current user-visible gap or cite the P0/P1 requirement above.
2. Identify the existing consolidated owner.
3. Read the donor implementation and its tests; port behavior and fixtures, not directories or architecture.
4. Adapt TypeScript logic to the root ESM/JSDoc conventions unless a separate approved decision changes the runtime language.
5. Extend the existing data contract with a migration and backward-compatible reader before writing a new field.
6. Add a focused regression test for success, stale/ambiguous input, restart/resume, and failure behavior.
7. Run the root check, privacy scan, `git diff --check`, and the relevant flow/UAT.
8. Update only the canonical doc that owns the changed behavior.
9. Commit one feature slice with a rollback path. Do not combine unrelated ports.

## Sequence and Stop Gates

### Phase 0 — make current evidence truthful

1. ✅ Add decision/origin semantics and label imported history. Completed 2026-07-14.
2. ✅ Remove legacy score authority and resolve preference/archetype ownership. Completed 2026-07-14.
3. Reconcile the current pipeline/tracker/report state.

Stop gate: dashboard counts must distinguish scanned, pending review, agent decision, prepared, attempted, confirmed, and historical.

### Phase 1 — finish one controlled application

1. ✅ Store the full JD and decision receipt. Completed 2026-07-14.
2. ✅ Bind and verify the CV bundle. Completed 2026-07-14.
3. ✅ Add reusable-answer confirmation and code-backed preflight. Completed 2026-07-14; real controlled UAT remains.
4. ✅ Reconcile one attempt outcome atomically. Code path completed 2026-07-14; one real approved outcome remains part of full-flow UAT.

Stop gate: one current role completes the full launch-readiness evidence chain. Until then the product is code-healthy/prepare-to-apply, not public-MVP-ready.

### Phase 2 — coverage and repeatability

1. Add source-run evidence and native email ingest.
2. Run India coverage trials and add only sources with useful unique yield.
3. Add feedback/tuning approval.
4. Prove clean-link installation from the public repository.

Stop gate: a new user/agent can install and run a second session without manual source-code edits or mixed historical state.

### Phase 3 — release

1. Preserve the unrelated typed baseline currently on public `main` under a dated archive branch.
2. After Phase 1 and clean-install gates pass, promote the exact tested consolidated commit to public `main` with `--force-with-lease`; do not create an unrelated-history merge commit.
3. Protect `main` and tag that same commit as the ApplyCue MVP release.
4. Keep attribution in `LICENSE`, `NOTICE`, Git history, and release notes.
5. Archive donor/history branches from normal user instructions; do not delete evidence required for attribution or rollback.

## Data Migration Policy

- Never overwrite or silently reinterpret existing user files.
- Imported Career-Ops tracker rows and reports retain original dates and gain explicit origin/import metadata.
- A historical report is readable but cannot count as a current reviewed/shortlisted/prepared/application proof.
- Resolve duplicate identity by exact URL, tracker/report id, or confirmed application evidence. Similar company/title remains agent review.
- Missing personalized files such as a local custom mode or article digest require user confirmation before migration; documentation references must not pretend absent files exist.
- Migrations must be dry-runnable, idempotent, backed up, and tested against both old and current layouts.

## Findings

1. Career-Ops remains the stronger base for provider breadth, mature root operation, reports, PDF, tracker, plugins, follow-up helpers, and regression history.
2. The typed ApplyCue donor contains real value in profile/CV preservation, full-JD receipts, review fingerprints, reusable answers, browser preflight, workflow locking, outcomes, and source evidence.
3. The current consolidated runtime correctly removed duplicate control planes, but it removed several useful guarantees before installing equivalents.
4. The current browser dashboard has correct decision/origin/current-history semantics, agent rank/confidence, per-role attempt/preflight evidence, original-JD/CV links, stage-aware user actions, and CV-change/application-approval receipts.
5. The current prepared role proves the product can reach “ready to apply”; it does not prove application completion.
6. Email, source expansion, interview preparation, and hosted operation must remain separate capability phases rather than being advertised as current MVP behavior.

## Recommended Fixes

Execute Phase 0 and Phase 1 in order. Do not resume general feature development until the first complete application evidence chain passes. Use failures from that chain to choose the next donor port.

The first implementation packet, **decision/review metadata plus historical dashboard separation**, is complete.

The second packet, **full-JD capture plus fingerprint-bound decision receipt**, is complete.

The third packet is **CV bundle identity and selected-upload verification** and is complete.

The next packet is **current full-flow non-submit UAT**, followed by the first named controlled application when the user approves it. Use that evidence to choose between scan-handoff evidence and intake/source-quality work; do not add another application owner.

## Verification

This review:

- traced current setup, scan, report, CV, application, receipt, tracker, and dashboard owners;
- checked a current preparation path and an imported historical path;
- traced source and application degraded paths;
- compared the typed donor contracts to actual current equivalents rather than filenames alone;
- ran the current checks in all three worktrees;
- did not edit either dirty reference worktree;
- did not access accounts, send messages, fill forms, or submit applications;
- records implementation status only where the destination code, focused tests, current user-artifact migration, and acceptance check have landed.

## Follow-Up

1. Keep this document as the integration disposition ledger.
2. Update row status only when the corresponding code, migration, tests, and acceptance gate land.
3. Record each completed port in the relevant canonical owner doc and release notes.
4. Run the launch-readiness flow after every Phase 1 packet; stop at the first real blocker.
