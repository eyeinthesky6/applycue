# Greenfield Product-Outcome Architecture Recommendation

Date: 2026-07-10

Status: supporting recommendation. `ARCHITECTURE.md` is the accepted owner for current direction.

Final clarification: `docs/ARCHITECTURE.md` is the canonical target. The judgement layer is Codex, Claude, or another external agent operating ApplyCue; this recommendation does not call for an embedded model provider.

## Scope

Choose the strongest way to build the CV-to-offer product if the existing implementation were not a constraint. Compare the approaches on build time, output quality, user effort, operating cost, reliability, and the ability to scale.

The intended outcome is not merely a job scanner. It is a chat-led product that:

1. understands a candidate without inventing facts;
2. finds relevant roles;
3. prepares truthful, role-specific CVs and application material;
4. routes and assists applications safely;
5. records outcomes and improves from evidence.

## Recommendation

Build an **agent-first modular monolith with selective adoption of mature tools**.

Do not build the full product as a custom mathematical ranking engine. Do not fork an entire general-purpose career automation repository. Do not begin with microservices. Borrow commodity plumbing, but own the product decisions and data that create trust.

The core rule is:

> Borrow discovery, document, browser, and storage plumbing. Own candidate truth, product policy, decision evidence, application state, and the outcome-learning loop.

This is the best overall trade-off. A whole-repository fork can produce a demo sooner, while a custom system can offer maximum theoretical control. The selective hybrid gets close to the first option's speed without accepting its architectural baggage, and it keeps the valuable control of the second option without rebuilding solved infrastructure.

## Option Comparison

| Approach | Build time | Output quality | User effort | Scaling path | Main weakness |
| --- | --- | --- | --- | --- | --- |
| Custom rules and mathematical scoring | Slow | Uneven on ambiguous jobs | High because users correct rigid rules | Technically simple, but quality work grows rapidly | Job fit is not a clean equation |
| Fork the complete career-ops system | Fastest demo | Useful broad reports | Medium to high because files and workflows leak through | Good batch mechanics, weak single-product ownership | Inherits two control planes and unrelated assumptions |
| **Selective hybrid modular monolith** | **Fast** | **Best practical quality and truth control** | **Lowest with chat and saved approvals** | **Clean local-to-hosted path** | Requires discipline at module boundaries |
| SaaS-first microservices | Slowest | No inherent quality gain | Can eventually be low | Highest theoretical capacity | Solves infrastructure scale before product-market evidence |

## Recommended Architecture

```text
Chat agent
    |
    v
Candidate facts + proof + preferences + approval policy
    |
    +--> Discovery adapters --> normalized JobRecord --> deterministic hard gates
                                                        |
                                                        v
                                           structured agent review
                                                        |
                                                        v
                              truthful CV plan + reconciliation + DOCX
                                                        |
                                                        v
                              application route + preflight + controlled action
                                                        |
                                                        v
                                  receipt + reply/interview/offer outcome
                                                        |
                                                        +--> approved tuning
```

### 1. Chat is the interface

The agent asks only for missing or consequential information. Approved facts, preferences, reusable application answers, and policies are saved once and reused. Commands and files remain implementation details.

This avoids spending early build time on a large web application and minimizes repeated user work.

### 2. A product-owned truth and proof ledger

Keep structured candidate facts separate from prose. Each claim has its source and approval state. CV generation can reframe facts for a role, but it cannot create new ones.

This module, rather than a prompt or a CV template, is the heart of product trust.

### 3. Discovery through replaceable adapters

Use direct ATS APIs for clean company sources, a broad job-board library such as JobSpy behind an adapter, and native email or other connected sources when available. Browser extraction is a fallback for sources without a usable API.

Every source maps into one product-owned `JobRecord` contract. A provider never owns ranking, truth policy, or application policy. Providers can therefore be added, disabled, or replaced independently.

Selected career-ops provider modules could have been adopted here with their original attribution and contract tests. Adopting useful adapters is different from inheriting the repository's whole workflow and control plane.

### 4. Two-stage job decisions, not a giant score

Apply cheap deterministic gates first: duplicates, closed roles, blocked companies, impossible geography or work authorization, fraud indicators, and genuinely mandatory requirements.

Then let the external agent review the smaller relevant set and record a structured ApplyCue decision containing:

- decision and confidence;
- supporting job evidence;
- supporting candidate evidence;
- missing or uncertain facts;
- a short explanation;
- an abstain or ask-user path.

Mathematics remains useful for deduplication, retrieval, ordering, and measurable thresholds. It should not pretend to resolve every ambiguous career decision.

### 5. Structured CV planning and one excellent renderer

Generate a structured CV plan from the approved fact ledger and job description. Reconcile every generated statement against its evidence, then render DOCX and an inspectable preview.

Start with one strong ATS-friendly template. Multiple visual templates add maintenance cost before they improve the core promise. JSON Resume can be an import/export format, but it should not become the authority for proof or application policy.

### 6. Routes separate planning from execution

Represent browser, email-draft, direct-message-draft, API, and manual applications as explicit routes. Use Playwright for browser mechanics behind current-page preflight, approval policy, and receipts. Native agent connectors should handle email and messages when available.

The executor fills or prepares what the product has approved. It does not decide what is true or grant itself permission to submit.

### 7. Local durable state before distributed infrastructure

Use one SQLite database per profile for facts, jobs, decisions, runs, application state, outcomes, and event history. Keep source CVs, generated documents, and browser receipts as files referenced by path and hash.

Add profile-scoped locking, idempotency keys, bounded concurrency, retries, and resumable run records from the start. These protect a local product without requiring a queue cluster or several services.

Put persistence behind a repository interface. If shared hosted operation becomes real, the same contracts can move to PostgreSQL and workers without rewriting product logic.

### 8. Outcomes close the loop

Track prepared, submitted, reply, interview, offer, and rejection events. Show source, title family, route, and CV-variant performance. The agent may propose tuning from those observations, but user facts and major preferences change only with approval.

Do not claim job-search success from generated artifacts alone. A working workflow is proved by valid outputs and receipts; offer success requires real cohort outcomes.

## Tool-Adoption Decisions

| Tool or subsystem | Decision | Product boundary | Rollback |
| --- | --- | --- | --- |
| JobSpy | Keep as a bounded sidecar/adapter and benchmark it; do not make it the only discovery engine | Must emit `JobRecord`; cannot own filtering, ranking, truth, or policy | Disable the adapter and retain direct ATS/local/email sources |
| Selected career-ops provider modules | Selectively port or adapt when they beat existing coverage | No second scanner, tracker, pipeline, or control plane | Disable each adapter independently |
| Playwright | Adopt for browser execution | Product owns preflight, approval, master data, and receipts | Produce a manual route |
| `docx` | Adopt for DOCX rendering | Product owns the reconciled CV plan and truth checks | Swap the renderer without changing facts or plans |
| JSON Resume | Defer; use only for import/export compatibility if users demand it | ApplyCue remains the truth/proof authority; do not add it as a runtime dependency by default | Remove the bridge |
| SQLite through a stable Node driver | Adopt for the local profile and event store | Files remain the artifact store; repository contract hides the driver | Export/migrate records or swap to PostgreSQL |
| Redis, Temporal, distributed workers, microservices | Defer | Add only when measured shared workloads require them | Not applicable before adoption |
| Custom embeddings or a fine-tuned model | Defer | First collect real decisions, corrections, and outcomes | Continue using deterministic retrieval plus a provider-neutral agent |

For a production-oriented Node version today, `better-sqlite3` is a practical choice because it offers transactions, WAL support, and prebuilt binaries for supported Node versions. Node's built-in `node:sqlite` is attractive but is still documented as release-candidate stability, so adopting it should be an explicit runtime-pinning decision rather than an unnoticed risk.

## Build Sequence

### Phase 0: Contracts and measures

Define the candidate fact, proof, job, decision, CV plan, route, receipt, and outcome contracts. Define what counts as a truthful CV and a completed application route.

### Phase 1: One golden vertical slice

Deliver one profile, one clean source, structured agent review, one truthful DOCX, one browser dry run, one receipt, and one recorded outcome. Persist it in SQLite and make the run resumable.

This proves the whole promise before source count or UI polish creates a false sense of completion.

### Phase 2: Broaden discovery and reduce user questions

Add JobSpy and selected direct provider adapters. Add deduplication, cheap hard gates, saved reusable answers, and agent review of the top and borderline roles.

### Phase 3: Reliable application operations

Add route-specific preflight, controlled fill/upload/submit, idempotency, retries, receipts, and native message/email connector support.

### Phase 4: Evidence-led scaling

Add more profiles, scheduled runs, bounded parallel work, dashboards, and hosted infrastructure only in response to measured workload or collaboration needs.

## What Not to Build First

- a universal mathematical fit score;
- a bespoke scraper for every site;
- a large web dashboard;
- many CV templates;
- automatic submission everywhere;
- a fine-tuned career model without proprietary labelled outcomes;
- microservices, distributed queues, or multi-tenant authentication;
- a second pipeline that duplicates the product's state and policy.

Avoiding these items is the largest build-time saving. None is necessary to prove the core promise.

## Success Measures

Measure the product on:

- time from setup to the first useful shortlist;
- useful jobs kept versus jobs shown;
- user rejection and correction rate;
- unsupported-claim rate, with a target of zero;
- questions asked per prepared application;
- time and model cost per prepared application;
- browser completion and receipt rate;
- reply, interview, and offer rates by cohort;
- successful resume after an interrupted run.

These measures separate system activity from actual user value.

## Risks and Controls

| Risk | Control |
| --- | --- |
| Agent makes plausible but unsupported claims | Evidence references, schema validation, reconciliation, abstention |
| Provider changes or disappears | Adapter contracts, fixtures, per-source disable switch |
| Duplicate or conflicting local runs | Profile lock, idempotency keys, resumable run state |
| Browser applies stale or wrong data | Live preflight, approved master data, route policy, receipts |
| Early infrastructure becomes a dead end | Product-owned contracts and persistence/executor interfaces |
| Success is overstated | Separate workflow readiness, application receipts, and real outcome metrics |

## Verification and Evidence

The recommendation is based on the current ApplyCue and career-ops branch review, isolated UAT comparisons, provider and runtime tracing, and current primary documentation for JobSpy, Playwright, JSON Resume, Node SQLite, `better-sqlite3`, and `docx`.

The first implementation gate should be a fixed end-to-end fixture plus one consented live-profile run. It must prove input lineage, decision evidence, CV reconciliation, route preflight, artifact receipts, restart safety, and outcome recording.

## Follow-up Decision

The next architectural decision is not which large system to copy. It is which few commodity components pass bounded adoption trials behind the contracts above. The recommended first trials are:

1. JobSpy versus current discovery coverage and failure rate;
2. selected provider adapters versus direct ATS implementations;
3. a stable SQLite driver and migration/export path;
4. structured agent decision quality on a fixed labelled job set;
5. Playwright route completion and receipt quality on representative forms.

## Current Distance From The Recommendation

Measured on 2026-07-10, the active ApplyCue runtime is substantially closer to the recommendation than the branch history suggests.

`pnpm applycue:check` passed 19 test files and 239 tests. `pnpm applycue:uat -- --skip-tools` passed with 68 discovered jobs, five reconciled CVs and DOCX files, five application routes, five browser plans, five dry-run receipts, and a 68-job decision queue. The same UAT reported 27 tracked application records and zero positive outcome events. This is strong workflow proof, but not interview or offer proof.

| Target capability | Current state | Approximate distance |
| --- | --- | --- |
| Agent/chat-led operation | Canonical skill and commands work; no polished first-party user interface or one-click install | Mostly present |
| Candidate facts, proof, approvals, and truth reconciliation | Typed profile facts, proof bank, approved answers, reconciliation, and completeness gates are active | Strong |
| Replaceable discovery adapters | 12 ATS types, seven board types, JobSpy, local imports, source quality, liveness, and deduplication are active | Strong, but live-source reliability needs repeated measurement |
| Hard gates followed by recorded external-agent judgment | Hard gates and ranking are active; the engine still uses deterministic weighted ranking and has no explicit decision-recording handshake with Codex/Claude | Major quality gap |
| Evidence-led CV generation | Reconciled plans, ATS checks, real DOCX generation, and job-specific artifacts are active; wording is still largely deterministic | Good foundation, quality ceiling unproven |
| Explicit application routes and controlled browser execution | Routes, form-data confirmation, live preflight, fill/upload, pause-before-submit, and receipts exist | Good foundation; representative real-portal coverage remains partial |
| Durable transactional profile state | JSON, JSONL, and files are used; no SQLite store, transaction boundary, profile lock, or general idempotent run ledger was found | Major reliability and scaling gap |
| Outcome learning | Outcomes, source scorecards, and approval-based tuning signals exist | Mechanism present; real outcome data is insufficient |
| Hosted or high-volume scale | Multiple profile roots and some bounded parallel fetch/render work exist | Early; no durable queue, worker isolation, or shared database |

The practical summary is:

- about 80% of the **local launch feature surface** exists;
- about 60-65% of the **recommended product architecture** exists;
- the **hosted scaling foundation** is closer to one third complete;
- actual job-search success cannot be assigned a credible percentage until real submissions produce reply, interview, and offer cohorts.

The highest-value remaining work is not more providers. It is a typed command that records Codex/Claude judgement with evidence; transactional profile/run state with locking and idempotency; repeated live-portal trials; and real outcome measurement.

## OSS Maturity Correction

Popularity is not sufficient, but it is a useful risk signal. The safer rule is to prefer mature projects for generic infrastructure and accept a smaller specialist project only behind a cheap, replaceable contract when it saves substantial domain work.

Current public repository evidence on 2026-07-10:

| Project | Current signal | Decision |
| --- | --- | --- |
| Microsoft Playwright | About 92.5k GitHub stars and active development | Keep; mature browser infrastructure |
| Apify Crawlee | About 24.6k stars and active development | Defer for now; mature crawler framework, but it does not replace job-specific extractors |
| `better-sqlite3` | About 7.3k stars, active releases, MIT | Trial for the profile store; mature enough for a bounded persistence driver |
| `docx` | About 5.8k stars, active development, MIT | Keep; it already produces validated ApplyCue DOCX artifacts |
| JobSpy | About 3.8k stars, 58 releases shown, MIT, but less active than the generic infrastructure above | Keep replaceable and benchmark per source; never make it the sole supply path |
| JSON Resume legacy schema repo | Archived and moved; the package has a small runtime footprint in current package-download evidence | Do not adopt by default; optional compatibility only |

Relevant primary sources: [Playwright](https://github.com/microsoft/playwright), [Crawlee](https://github.com/apify/crawlee), [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3), [`docx`](https://github.com/dolanmiu/docx), [JobSpy](https://github.com/speedyapply/JobSpy), and [the moved JSON Resume schema repository](https://github.com/jsonresume/resume-schema).

JobSpy and Crawlee solve different problems. JobSpy supplies job-board-specific behavior out of the box. Crawlee supplies queues, sessions, proxies, HTTP/browser crawling, and extraction mechanics, but ApplyCue would still have to implement and maintain the LinkedIn, Indeed, Naukri, or other site rules. A fair trial should therefore compare total maintained code, source yield, blocking rate, field completeness, and breakage rate rather than repository stars alone.

## Provider Implementation Cost

The code confirms that a provider and a provider platform are very different sizes.

The inherited career-ops tree contains 35 ordinary provider modules with 4,516 total lines. The median provider is 129 lines; the smallest is 39 and the largest is 256. Its shared provider helpers add 372 lines, while `scan.mjs` adds another 1,240 lines before tests and configuration.

The active ApplyCue discovery implementation contains 1,420 lines for 12 ATS types and 783 lines for seven job-board types, plus 194 lines of liveness handling, 686 lines of source-quality policy, normalization elsewhere, and a 2,458-line discovery test file.

Practical ranges are:

| Provider type | Typical implementation | Real cost |
| --- | --- | --- |
| Stable public JSON API | 40-150 lines | Usually one small adapter plus fixture tests |
| Paginated or unusual ATS API/XML/GraphQL | 100-400 lines | URL validation, pagination, field mapping, partial failures, tests |
| Public HTML source | 200-800 lines | Selectors, pagination, content cleaning, frequent maintenance |
| Anti-bot or logged-in board | 1,000-3,000+ site-specific and shared lines | Sessions, browser/proxy behavior, rate limits, blocking, receipts, constant upkeep |
| Complete provider platform | 5,000-15,000+ shared lines | Contracts, HTTP/browser clients, concurrency, retries, trust, dedupe, history, observability, and tests |

Therefore a Greenhouse-like provider can genuinely be a roughly 50-150-line file. Building a dependable multi-source discovery system is not a collection of trivial files; the shared platform and ongoing maintenance dominate the initial adapter code.
