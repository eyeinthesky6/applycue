# Career-Ops Discovery Delta Architectural Review

Date: 2026-07-10

Status: historical implementation record. The referenced quarantine was removed from this branch on 2026-07-11; `ARCHITECTURE.md` remains the canonical owner of current boundaries and `product-roadmap.md` remains the canonical owner of version scope.

## Scope

Decide which career-ops discovery behavior should enter the supported ApplyCue runtime, which behavior ApplyCue already owns, and which legacy modules should remain quarantined. The purpose is better job supply and reliability, not file-count parity or a cosmetic rewrite.

## Evidence Checked

- supported runtime: `apps/worker -> packages/engine -> packages/discovery`;
- current ATS, job-board, source-plan, source-quality, liveness, history, and setup tests;
- quarantined `legacy/career-ops/scan.mjs`, `scan-ats-full.mjs`, shared HTTP/trust helpers, and provider modules;
- current architecture, roadmap, connector policy, launch gates, and provider research;
- JobSpy's current supported-board and blocking guidance;
- the current `Feashliaa/job-board-aggregator` repository and its dataset licence.

## Tool Baseline

The comparison is responsibility-by-responsibility:

```text
external fetcher or browser
  -> ApplyCue RawJobInput/JobRecord
  -> source quality, freshness, liveness, dedupe, and history
  -> hard gates
  -> recorded agent/user decision
  -> truthful CV, route, receipt, and outcome
```

No adopted provider may own candidate truth, fit judgement, source approval, application permission, or product state.

## Agent-Led Review

The current ApplyCue discovery layer already covers the useful generic career-ops provider pattern:

- 12 direct ATS adapters;
- JobSpy plus six direct public-board adapters;
- timeouts and per-source failure isolation;
- normalization into `JobRecord`;
- source-quality filtering, freshness, liveness hooks, dedupe, scan history, warnings, and source/outcome summaries.

Career-ops still demonstrates two reliability behaviors that close current gaps: bounded worker concurrency and an independent fallback when one discovery mechanism is unavailable. Its remaining provider count is not itself a product advantage because many modules duplicate current coverage, serve a geography the active profile may not target, or represent one company/niche board rather than a reusable missing capability.

## Delta Ledger

| Legacy behavior or module | Current ApplyCue state | Decision | Required evidence or implementation |
| --- | --- | --- | --- |
| Bounded provider workers in `scan.mjs` and `scan-ats-full.mjs` | Top-level company and board sources currently start through unbounded `Promise.all` | **Implement now** | Product-owned small worker pool; preserve source order and failure isolation; prove the configured maximum in tests |
| Provider timeout and partial success | Already implemented in direct adapters and engine warnings | **Keep current owner** | Do not copy the legacy HTTP helper |
| Zero-token public ATS/API discovery | Already implemented through typed direct adapters | **Keep current owner** | Add providers only for measured missing coverage |
| JobSpy-independent supply | Before this slice, direct public feeds existed but starter setup auto-selected only JobSpy suggestions | **Implement now** | Approve one clean structured no-key fallback beside JobSpy; use two structured fallbacks when JobSpy is unavailable |
| The Muse public API | Adapter and fixture exist, but the official API requires app registration beyond testing and the 2026-07-10 live canary ended in a connection reset | **Keep explicit, remove from automatic starter approval** | Reconsider only with user-owned registration, accepted terms, and a passing live canary |
| ATS directory scan pattern | The old mutable non-commercial input was removed on 2026-07-11; the adapter now uses JobHive MIT company CSVs and existing ApplyCue ATS fetchers | **Keep bounded and explicit** | Validate expected ATS hosts, cap company fan-out, keep the directory canary opt-in, and prefer concrete approved company URLs |
| JobHive filtered snapshots | Live contract trial returned 30 India product-title jobs from four selected ATS slices in about 18 seconds | **Adopt review-only sidecar** | Suggest only for India profiles, never auto-approve, emit only `JobRecord`, and compare unique yield/freshness/outcomes against JobSpy before default promotion |
| Comeet provider | Only generic ATS provider in the quarantine without a current direct ApplyCue equivalent; requires a full tenant API URL/token | **Conditional trial** | Port only for an approved target company or repeated coverage gap; redact token, pin host/path, fixture-test, and prove a live canary |
| Arbeitnow/Arbeitsagentur | Germany-specific supply | **Conditional trial** | Trial only for an active Germany profile when current source yield is insufficient |
| Glints/JobStreet | Southeast-Asia-specific supply | **Conditional trial** | Trial only for an active SEA profile and after checking current terms/API behavior |
| JustJoin/NoFluffJobs | Poland/European technical supply | **Conditional trial** | Trial only for matching geography and role families |
| We Work Remotely/4dayweek/NoDesk/Jobspresso | Overlaps JobSpy and current remote feeds | **Defer** | Port only if source scorecards show unique qualified jobs and acceptable breakage/rate behavior |
| Hacker News hiring posts | Useful mainly for technical/startup searches | **Conditional agent/source trial** | Do not activate for unrelated role families |
| IBM provider | One-company special case | **Reject** | Use an approved company careers/ATS URL instead |
| Local parser | ApplyCue already imports JSON, JSONL, Markdown, text, and directories | **Reject duplicate** | Keep current local import owner |
| Trust score | Current fraud, portal, source-quality, and hard-gate policies are more product-specific | **Reject duplicate score** | Port a concrete missing fraud signal only with a failing fixture |
| Legacy scanner, tracker, prompt modes, evaluators, plugins, batch control plane, Docker/Nix | Quarantined and not called by supported commands | **Keep quarantined** | Never reconnect as fallback |

## Findings

1. Provider count is the wrong success measure. Unique qualified live jobs, failure rate, stale/duplicate rate, and user effort are the useful measures.
2. ApplyCue should copy small reliability patterns into current owners, not copy the career-ops control plane.
3. A starter search must not depend on JobSpy alone. JobSpy remains a replaceable sidecar; a direct structured feed must survive its installation or runtime failure.
4. The old reverse-directory licence blocker is closed. JobHive's remaining questions are measured relevance, staleness, overlap, latency, and outcome value—not permission to commercialize its MIT code/data.
5. No missing legacy provider has enough current evidence for immediate promotion. Comeet is the clearest generic candidate, but only after a real target exposes the required endpoint.
6. Live evidence is more useful than a provider list: Remotive, RemoteOK, Working Nomads, Jobicy, and Himalayas passed from this machine, so they now own the direct starter fallback instead of The Muse.

## Recommended Fixes

### Implemented in this slice

1. Add product-owned bounded mapping for top-level ATS and job-board discovery and high-fan-out detail fetches.
2. Select at most two JobSpy starter searches plus one canary-proven direct no-key fallback when JobSpy is available.
3. Select up to two canary-proven direct no-key starter feeds when JobSpy is unavailable or deliberately skipped.
4. Keep `ats_directory` explicit and bounded; replace its old data input with JobHive MIT company CSVs.
5. Add `jobhive` as a review-only India source suggestion using filtered per-ATS Parquet slices; do not auto-approve it.

### Deferred until evidence exists

- per-provider retry/backoff and interval rate windows;
- Ajv at every external payload boundary;
- repeated live canary coverage and a provider compatibility matrix; the configured-source canary command is implemented;
- top-candidate live verification before CV preparation;
- any additional career-ops provider.

`p-queue` remains a trial candidate when real provider rate windows, cancellation, or retry scheduling exceed the small worker pool. Adding it now would not close an additional proven gap.

## Verification

This slice must prove:

- the concurrency helper never exceeds its bound and preserves input order;
- one failing source does not erase successful source results;
- clean setup has a direct no-key fallback when JobSpy is ready, skipped, or failed;
- JobHive snapshot suggestions are limited to India profiles and remain absent from setup auto-approval;
- all existing fixture contracts and TypeScript checks pass;
- no legacy runtime import, model API, credential, or second state owner is introduced.

Fixture tests do not prove live external availability. The source canary therefore records each attempt, health, normalized row count, known-date freshness, explicit closed state, duration, and categorized failure without candidate CV or application data. Retained/duplicate counts still belong to a later full discovery run because this canary deliberately stops before ranking and dedupe policy.

Verification completed on 2026-07-10:

- focused discovery/engine/source-canary tests: 3 files, 99 tests passed;
- `pnpm applycue:check`: 21 files, 251 tests passed, with TypeScript build passing;
- `pnpm applycue:uat -- --skip-tools`: PASS with 73 ranked jobs and five CV/application/browser-plan artifacts under explicit `backend_suggestion_test` authority;
- UAT reported no source-code writes, no blocked truth reconciliation, and no unsupported generated claim;
- supported `apps/` and `packages/` contain no import or execution reference to `legacy/career-ops`;
- `git diff --check` passed.
- live configured-source canary: JobSpy, Remotive, RemoteOK, Working Nomads, Jobicy, and Himalayas passed; The Muse failed with a connection reset; 17 extra JobSpy queries and reverse ATS were deliberately skipped. Disabled sources were health-probed without changing their saved enabled state.

The UAT source scorecard reported 777 fetched, 77 kept, and 28 prepared across existing history, with zero positive outcomes. This proves workflow continuity, not comparative provider superiority, replies, interviews, or offers. Current transport health is recorded separately by the source canary.

Follow-up verification on 2026-07-11 replaced the old directory input and added the filtered snapshot lane. The live adapter contract returned 30 normalized India product-title jobs with no warning in about 18 seconds, and the whole-term filter eliminated the observed `product` versus `production` false positive. This does not yet prove unique yield or better outcomes than JobSpy.

## Follow-Up

The next provider decision starts from source scorecards or a named candidate market. A provider is promoted only when it produces unique qualified jobs in that market, stays inside its licence/terms, normalizes cleanly, has a canary, and can be disabled without harming the rest of ApplyCue.
