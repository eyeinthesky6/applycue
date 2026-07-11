# Independent ApplyCue vs Career-Ops Fork Architectural Review

Status: dated evidence review. The reviewed fork tree was removed from the current branch on 2026-07-11. Later decisions in `ARCHITECTURE.md` and `ai-judgment-trial-plan.md` are authoritative where recommendations differ.

Date: 2026-07-10

## Scope

Compare:

- `independent/improve-role-fit-math` at `d6152e4`
- `applycue/career-ops-fork` at `2d27caf`
- career-ops base at `95a665a`

Questions:

1. Which branch is better for useful output today?
2. Which branch supports the stronger launch or success claim?
3. Could the independent direction have reached the same output?
4. How should ApplyCue become clearly differentiated without hiding OSS provenance?

This is an engineering and product-evidence review, not legal advice.

## Evidence Checked

- Branch ancestry, commit history, tree contents, blob identity, and branch diffs.
- `AGENTS.md`, the canonical ApplyCue skill, `docs/pivot-history.md`, `docs/build-decision.md`, `docs/launch-readiness.md`, and the development and architecture guides.
- Runtime entry points in `package.json`, `apps/worker`, and `packages/engine`.
- Contracts and owners under `packages/core`, `profile`, `discovery`, `normalizer`, `ranker`, `cv-tailor`, `apply-assistant`, `engine`, and `tracker`.
- Current MIT license and retained career-ops copyright notice.
- Branch-native typecheck, tests, UAT, browser UAT, status, and generated artifact counts.
- One empty-profile run to check cold-start behavior and one fair run using isolated copies of the same configured profile.

## Tool Baseline

### Repository shape

| Evidence | Independent | Current career-ops fork |
| --- | ---: | ---: |
| Total tracked files | 112 | 454 |
| `apps/` + `packages/` files | 66 | 76 |
| Test files passed | 15 | 19 |
| Tests passed | 164 | 239 |

The current tree also contains 235 files in the inherited root script, provider, mode, plugin, batch, and dashboard surfaces.

Compared with the career-ops base, the current tree has:

- 156 byte-identical inherited files
- 182 modified inherited paths
- 38 deleted base paths
- 116 current-only paths

### Provenance of the ApplyCue engine

The branches have no merge base because the current branch starts from the separate career-ops history. However, at pivot commit `b8d360b`, every file under `apps/` and `packages/` was byte-for-byte identical to `independent/improve-role-fit-math`.

This means the current ApplyCue engine is the independent engine transplanted onto the career-ops repository. It was not replaced by career-ops internals.

The preserved independent branch also has no merge base with the career-ops base. Their trees share only nine path names, all nine contain different blobs, and none are byte-identical. A repository search found one independent-branch reference to career-ops in a discovery research/inspiration document and no career-ops runtime dependency. This proves separate Git ancestry and no exact-file reuse; it does not try to prove that no general product idea was ever influenced by prior research.

Since that pivot, the current branch changed 33 of the 66 shared `apps/` and `packages/` paths, left 33 identical, and added 10 new files. Across that surface, it added 12,454 lines and removed 1,838 lines relative to the preserved independent branch.

### Runtime ownership trace

The supported `applycue:*` commands in `package.json` enter `apps/worker`, which calls `packages/engine` and the other `@applycue/*` packages.

A focused search found no direct import or execution of root career-ops owners such as:

- `scan.mjs`
- `providers/`
- `modes/`
- `data/applications.md`
- `batch-runner.sh`
- `generate-pdf.mjs`

inside `apps/worker`, `apps/browser-agent`, or `packages/`.

The inherited career-ops commands are still separately exposed in `package.json`. The repository therefore contains two product/control surfaces:

1. the typed ApplyCue engine under `apps/` and `packages/`
2. the inherited prompt/script/provider workflow at the repository root

The current ApplyCue UAT proves the first surface. It does not prove that the second surface is required by the first.

Important wording correction: the fork's mass rename means absence of the string `career-ops` is not evidence that a file is independent. Commit `a6b791a` touched 226 files: seven detected path renames, 184 in-place modifications, three additions, and 32 deletions. Several changes were direct branding substitutions inside inherited career-ops prompt modes, `scan.mjs`, `tracker.mjs`, CLI skills, configuration names, and documentation. Those files remain career-ops-derived even when they now say ApplyCue.

The conclusion that the canonical ApplyCue runtime does not execute those legacy owners comes from the command and dependency trace, not from their current names. The `applycue:*` commands enter `apps/worker` and `@applycue/*`; their only child-process paths install/check external tools or run JobSpy Python. No call to the renamed root scanner, modes, tracker, dashboard, batch runner, plugins, or LLM evaluators was found. At the same time, the fork still uses a career-ops-derived repository shell, package file, CLI/skill conventions, release infrastructure, and separately callable renamed features. Therefore “ApplyCue uses no career-ops” is too broad and incorrect.

### Feature usage inventory

Actively exercised by the current ApplyCue UAT and browser UAT:

- external profile/config loading and profile isolation
- ApplyCue discovery, normalization, source planning, source-quality filtering, liveness, scan history, and dedupe
- ApplyCue hard gates, ordering, ambiguity handling, and ranked decision queue
- proof-backed CV planning, truth reconciliation, Markdown/HTML/DOCX rendering, and ATS diagnostics
- application drafts, apply routes, browser plans, local preflight, fill/upload, receipts, and pause-before-submit policy
- static HTML dashboard, chat summary, run manifest, source scorecards, and status handoff

Supported by canonical `applycue:*` commands and tests, but not exercised end to end in the comparison run:

- source and reusable-answer approval
- master form-data preview and confirmation
- real-page live preflight and controlled live apply
- route execution for browser, API, email draft, DM draft, and manual review
- email lead extraction and import
- tuning-signal recording and approved tuning application
- outcome recording and learning refresh

Present in the fork but not called by the canonical `applycue:*` runtime trace:

- root `modes/*.md` A-G evaluation and weighted scoring workflow
- root `scan.mjs` and `providers/` execution path
- `data/pipeline.md`, `data/applications.md`, report-number, TSV merge, reconciliation, and legacy tracker workflow
- root PDF, LaTeX, cover-letter, and CV-sync scripts
- shell batch runner and headless multi-CLI worker flow
- standalone OpenRouter, OpenAI, Gemini, and Ollama evaluators
- root plugin registry and plugin runtime
- Go dashboard/TUI and its build/serve commands
- root updater, rollback, doctor, verify, dedupe, repost, archive, and pattern-analysis commands
- multilingual legacy modes and prompt surfaces

Shared infrastructure that ApplyCue does use, but which is not a career-ops business feature:

- root pnpm workspace, lockfile, TypeScript configuration, and package scripts
- Playwright installation/runtime for browser control
- the repository and MIT license shell

Also present but not a current product runtime: `apps/web` is still a stub, and hosted SaaS, npm distribution, managed browser workers, autonomous submission, referral intelligence, and offer-success evidence remain outside the current launch claim.

### Why the success looked sudden

Career-ops does contain AI-driven prompt workflows under `modes/` and standalone OpenRouter, OpenAI, Gemini, and Ollama evaluators. Those features were not invoked by the supported ApplyCue runtime or by the passing comparison UAT. A focused search found no LLM-provider or career-ops mode reference in `apps/` or `packages/`.

The independent math line made six substantive commits covering role-fit and seniority logic, rank fusion, matching telemetry, source expansion, CV proof mapping, and funnel guidance. At the pivot, that engine moved into the career-ops tree unchanged. Seven later fork commits then added or tightened live outcome recording, preference gates, JD artifacts, launch direction, and live UAT preparation.

The apparent jump to success came from four things:

1. the independent engine was preserved rather than abandoned
2. the fork added missing product workflow and evidence artifacts around it
3. the fair UAT used a configured profile with real profile facts, proof data, source configuration, and accumulated local state rather than an empty profile
4. `PASS` and `READY` mean the review workflow generated safe artifacts and passed local browser proof; they do not mean a live portal submission or hiring outcome occurred

Therefore the current green status is real operational progress, but it is not evidence that the inherited career-ops AI was a hidden matching engine or that ApplyCue has produced offer success.

### Scalability comparison

ApplyCue and career-ops scale in different directions.

| Dimension | Independent ApplyCue engine | Career-ops-derived runtime |
| --- | --- | --- |
| Bulk job filtering | Better foundation: normalization, deterministic filters, ranking, dedupe, and evidence run in one typed process without one LLM call per job | Scanner is cheap, but deep evaluation normally launches an AI prompt workflow per role |
| Deep parallel evaluation | Limited: discovery, liveness, DOCX rendering, and file writes use local concurrency, but there is no durable worker pool | Stronger today: resumable shell batch runner supports configurable parallel headless AI workers, retries, locks, and rate-limit pauses |
| Source breadth | Twelve direct ATS adapters plus seven job-board adapter types, including JobSpy as an aggregator | Thirty-five standalone provider modules in the inherited root surface |
| Multiple candidates | Stronger boundary: one explicit user-store profile directory per candidate | Primarily one repo-local CV/config/pipeline/tracker set per checkout |
| Correctness and auditability | Stronger: typed contracts, truth reconciliation, routes, receipts, manifests, and package tests | More flexible AI judgment, but important output contracts live in prompts, Markdown, TSV, and merge/reconcile scripts |
| AI cost | Lower for bulk work because code filters and prepares the queue before agent judgment | Higher when many roles each receive a full AI evaluation, though model choice is flexible |
| Local operational resilience | Good evidence artifacts, but one local Node process and JSON/JSONL/file persistence; no durable database, distributed queue, or worker service | Better resumable batch orchestration; still uses files as source of truth, with SQLite only as a derived tracker index |
| Hosted/SaaS scale | Not ready | Not ready |

In simple terms, ApplyCue is shaped like a product engine: structured inputs go through repeatable services and produce controlled actions. Career-ops is shaped like an AI-powered workshop: prompt-driven workers independently inspect roles and merge their reports afterward.

ApplyCue has the better base for growing into a multi-profile product because ownership and contracts are explicit. Career-ops currently has better raw parallel AI tooling and a broader standalone provider library. A scalable combined direction should keep ApplyCue as the owner and adopt selected provider or batch capabilities behind ApplyCue contracts rather than preserve a second control plane.

### What the career-ops provider layer does

Career-ops is not only AI instructions plus a CV. Its AI prompt modes are the evaluation brain, but `scan.mjs` and `providers/*.mjs` form a separate zero-token supply layer.

Each provider:

- recognizes or is explicitly assigned a job source
- calls that source's public API or feed
- validates allowed HTTPS hosts and bounds network requests
- maps source-specific fields into a common job shape such as title, URL, company, location, description, and posted date

The scanner dynamically loads those providers, scans up to ten targets concurrently, applies source/profile/trust/liveness controls, deduplicates against scan history and existing applications, and writes new roles to `data/pipeline.md` for later AI evaluation. The inherited provider layer therefore solves job supply and normalization; the prompt modes solve fuzzy evaluation.

ApplyCue performs the equivalent product responsibility through typed adapters in `packages/discovery`, normalization into `JobRecord`, source-quality controls, scan history, liveness, ranking, and the full decision queue. ApplyCue is better aligned with the core promise because the same engine continues into truth-reconciled CVs, routes, browser evidence, and outcomes. Career-ops still has broader standalone provider coverage and stronger resumable parallel AI evaluation. No reply/interview/offer evidence currently proves that either system is better at hiring outcomes.

### Which scale infrastructure is needed for the current promise

The current launch promise is local and agent-operated: take a repo link and CV, set up a local profile, search jobs, prepare truthful CVs, create routes, and pause before sensitive actions. It does not require SaaS infrastructure.

| Capability previously listed as missing | Needed for today's local-first promise? | When it becomes necessary |
| --- | --- | --- |
| Central database | No | Shared hosted reporting, cross-device state, or many concurrent operators |
| Durable background queue | No | Unattended scheduling, long-running retries, or guaranteed resume after process/machine failure |
| Distributed workers | No | Very high job volume or managed browser/evaluation fleets |
| Hosted authentication | No | Hosted accounts or remote access to user data |
| Multi-tenant isolation | No | More than one customer sharing the same hosted service |
| Concurrent profile locking | Not if one agent runs one profile at a time | Needed before parallel agents or processes can write the same profile safely |

The minimum delivery stack needed now is already the product shape: one agent, one isolated local profile, working source adapters, normalization/dedupe, user rules, truth reconciliation, CV/route generation, browser preflight and receipts, and serialized writes. The earlier simultaneous branch comparison demonstrated why two processes must not write the same profile at once. A simple same-profile run lock is the only item from the scalability list that deserves near-term consideration for reliable multi-candidate operations; the rest should wait until the distribution model changes.

## Agent-Led Review

### Main success path

Both branches follow the same core path:

```text
profile + CV + jobs
  -> discovery and normalization
  -> gates and ordering
  -> truth reconciliation
  -> Markdown/HTML/DOCX CV
  -> application draft
  -> browser plan
  -> dry-run receipt
  -> dashboard and summary
```

The current branch extends this path with:

```text
apply route
ATS diagnostic sidecar
ranked decision queue
master form data
email lead ingestion
tuning apply flow
route-aware execution
```

### Fair UAT comparison

Both branches used isolated copies of the same configured profile and wrote only to temporary output roots.

| Proof | Independent | Current |
| --- | ---: | ---: |
| UAT status | PASS | PASS |
| Jobs in ranked run | 27 | 69 |
| CVs generated | 5 | 5 |
| Application drafts | 5 | 5 |
| Browser plans | 5 | 5 |
| Browser dry-run receipts | 5 | 5 |
| Reconciliation blockers | 0 | 0 |
| Output artifacts from clean output root | 35 | 51 |
| Apply routes | 0 | 5 |
| ATS diagnostics | 0 | 5 |
| Ranked decision queue | absent | present, 69 decisions |
| Browser UAT | PASS | PASS |
| Final status | READY | READY |

The independent browser proof initially failed only because the deliberately long temporary output path exceeded what Chromium could open as a Windows `file://` URL. It passed unchanged when rerun from a short temporary path, so this was not counted as a branch defect.

Both UATs reported the same minimum CV completeness figures: 4,256 characters, 57% of the base CV, 38 bullets, seven employer headings, and at least three bullets in the thinnest employer section. This proves comparable structural completeness, not equal wording or hiring effectiveness.

### Failure and degraded paths

- With an empty profile and no CV facts, neither branch generated a CV or application. That is the correct truth boundary.
- The independent branch still fetched jobs for the empty profile, while the current branch's stricter source and preference gates returned no jobs.
- The current branch softens seniority into advisory/review behavior by default and adds explicit fraud, portal, work authorization, compensation, shift, travel, timezone, and source-kind gates.
- The independent branch hard-blocked more seniority mismatches and produced two policy questions in the fair status run. The current branch produced none for the same profile snapshot.

### Contracts, complexity, and drift

The `@applycue/*` package boundaries are coherent and reusable in both branches. The current branch improves them rather than replacing them.

The current repository has architecture drift:

- `docs/agent-development-guide.md` describes the typed ApplyCue package engine.
- `ARCHITECTURE.md` and `docs/ARCHITECTURE.md` still describe the inherited modes, root scripts, tracker, and prompt-scoring system as the architecture.
- `package.json` exposes both command families.

This makes ownership harder to explain, increases maintenance surface, and makes the repository look more like a renamed fork than the actual runtime trace supports.

There is also a smaller policy/code tension. Product docs say agents should judge fuzzy fit, but the ranker still uses deterministic role-family scoring as a hard gate before preparation. The current ranked decision queue reduces the risk because skipped decisions remain inspectable, but the boundary should be made explicit in docs and tests.

## Findings

### 1. The current branch is better for output today

The current branch wins on operational completeness, safety, and handoff quality. It produces the same core CV/application/browser outputs plus routes, diagnostics, a full decision queue, form-data handling, email lead ingestion, and tuning workflows. It also has 75 more passing tests.

Use `applycue/career-ops-fork` for current live UAT and near-term launch work.

### 2. The independent branch could have reached the same output

Yes. This is proven more strongly than a hypothetical architecture argument: the current branch started with the independent `apps/` and `packages/` trees unchanged. The later output improvements were made inside those same ApplyCue-owned modules.

Continuing independently would have required more integration work and possibly selective adoption of provider plumbing, but it did not require a different product engine. The same output can be preserved in a clean independent repository by porting the 33 changed shared paths and 10 current-only ApplyCue files, then proving parity with the existing tests and UAT contracts.

### 3. Current UAT supports a workflow claim, not an offer-success claim

The fair runs prove that ApplyCue can:

- find and filter roles
- generate structurally complete, truth-reconciled CVs
- create application drafts and controlled browser plans
- fill a safe local form, upload DOCX, and pause before submit
- write receipts, dashboards, summaries, routes, and decision evidence

They do not prove that ApplyCue increases replies, interviews, or offers. Both status reports showed zero replies, zero interviews, and zero offers in the available outcome data.

Safe current claim:

> ApplyCue is a local, agent-operated workflow that searches roles, prepares truthful role-specific CVs, creates controlled application routes, and pauses before sensitive actions.

Unsupported current claim:

> ApplyCue gets users offers or improves hiring success.

That stronger claim needs real cohort evidence with a declared baseline, approved applications, replies, interviews, offers, and enough time for outcomes to mature.

### 4. Rewriting career-ops “beyond recognition” is the wrong differentiation goal

Cosmetic renaming or rewriting to hide origin does not improve output, and Git history still shows provenance. It can also make the project look less trustworthy.

The current `LICENSE` correctly retains the career-ops MIT notice. Keep that notice for derived portions. Honest, compact attribution lowers copycat risk because it makes the boundary clear: career-ops supplied licensed starting material; ApplyCue owns its distinct CV-to-offer engine and workflow additions.

The most defensible differentiation is product behavior that career-ops does not own:

- external multi-profile user store
- approved fact and proof boundaries
- truth reconciliation
- application routes
- master form data and reusable answer approval
- controlled browser preflight and receipts
- source tuning and outcome learning
- agent-first chat workflow
- full decision evidence rather than a hidden candidate score

### 5. The clean long-term architecture is “independent ApplyCue v2,” not a rewrite

Keep the current branch stable for live work. In parallel, create a clean ApplyCue line whose canonical runtime is only:

```text
skills/applycue
  -> apps/worker
  -> packages/engine
  -> ApplyCue package owners
  -> user store and evidence artifacts
```

Bring in external capability only through explicit adapters under `packages/discovery` or another existing owner. Do not carry the entire inherited modes/scripts/dashboard surface unless a traced ApplyCue runtime path and parity test proves it is needed.

## Recommended Fixes

### Immediate

1. Keep `applycue/career-ops-fork` as the live UAT branch.
2. Use the workflow claim above; do not market offer success yet.
3. Add a short, plain acknowledgement in the public README or an `ACKNOWLEDGEMENTS.md` while retaining the current license notice.
4. Name the typed `apps/` + `packages/` path as the canonical ApplyCue runtime.
5. Mark inherited root commands and architecture docs as legacy, optional, or pending extraction.

### Independent v2 extraction

1. Start from the preserved independent line or a new clean branch based on it.
2. Port the 33 changed shared ApplyCue paths and 10 current-only ApplyCue files from the current branch.
3. Bring over the canonical skill, launch docs, live runbook, and current package scripts.
4. Adopt only proven provider capabilities behind ApplyCue-owned contracts; prefer official APIs and permissive OSS adapters over copying whole control planes.
5. Add a golden parity fixture with fake candidate data and fixed job inputs.
6. Require parity for contracts, ranked decisions, CV/reconciliation outputs, routes, browser receipts, dashboard, and status.
7. Run a real multi-candidate pilot before changing the success claim.
8. Cut over only after the clean branch passes the current launch gate and the same-profile comparison.

## Verification

Completed:

- current `pnpm applycue:check`: 19 files, 239 tests passed
- independent `pnpm check`: 15 files, 164 tests passed
- isolated same-profile UAT: PASS on both branches
- safe local browser fill/upload/pause UAT: PASS on both branches
- isolated status: READY on both branches
- runtime import search: ApplyCue package path does not directly invoke the inherited root control plane
- license check: career-ops copyright and MIT permission notice retained
- source tree and blob comparison: current ApplyCue core proven to descend from the independent engine

Not proven:

- live portal submit across providers
- reply, interview, or offer lift
- clean-machine installation from the public repository
- multi-candidate outcome repeatability
- necessity of most inherited career-ops root modules for the canonical ApplyCue runtime

## Follow-Up

The first follow-up is now the external-agent hybrid migration in `docs/ARCHITECTURE.md`. A later clean extraction may still map every inherited root module into one of four buckets:

1. used by canonical ApplyCue runtime
2. useful through an adapter
3. compatibility-only
4. removable after parity proof

Do not start by rewriting files. Start from runtime ownership and the golden output contract, then remove or replace only what the evidence says is outside the product path.

## Final External-Agent Hybrid Decision

The final architecture call after the branch comparison is documented in `docs/ARCHITECTURE.md`.

ApplyCue should converge on one external-agent-operated modular monolith:

- Codex, Claude, or another user-chosen agent owns fuzzy judgement, research, conversation, and user-authorized actions;
- ApplyCue owns facts, proof, contracts, discovery boundaries, hard gates, CV reconciliation, policy, durable state, routes, receipts, outcomes, and tuning history;
- no embedded model SDK or model API key is required in the canonical runtime;
- API and local-model judgement remain optional later extensions, governed by the shadow benchmark and promotion gates in `docs/ai-judgment-trial-plan.md`;
- mature permissive OSS may replace commodity plumbing only behind ApplyCue-owned interfaces with trial evidence and rollback;
- selected career-ops providers and resilience patterns may be ported with retained attribution, but its scanner, tracker, prompt/evaluator modes, and batch control plane do not remain a second engine.

Research checked for this decision included official direct ATS APIs, Playwright, SQLite FTS5/BM25, `better-sqlite3`, Ajv, `p-queue`, Mammoth.js, PDF.js, JobSpy, Crawlee, the MCP TypeScript SDK, ESCO, O*NET, Reciprocal Rank Fusion, ranking evaluation, source-rate uncertainty, and learned job-retrieval literature.

One high-priority finding at the time of this review was that the active reverse-ATS directory followed mutable `main`-branch data from `Feashliaa/job-board-aggregator`. Resolved on 2026-07-11: runtime code now uses JobHive's MIT company CSVs behind the same bounded ApplyCue adapter, and a separate review-only filtered snapshot lane serves India searches. Direct ATS adapters remain product-owned.

The highest-value implementation order is:

1. record external-agent job decisions separately from backend ranking suggestions;
2. add per-profile transactional SQLite state, leases, idempotency, and resumable attempts;
3. harden discovery boundaries, external validation, rate policy, and the reverse-directory source;
4. improve DOCX/PDF import and runtime schemas with mature permissive libraries;
5. prove representative live-portal operation and real outcome cohorts;
6. add a thin MCP adapter only if it improves multi-agent distribution without duplicating business logic.

The later trial slate records native Codex/Claude as the baseline; GPT-5.5, GPT-5.4 mini, Claude Sonnet 5, Claude Opus 4.8, Gemini 3.5 Flash, and a hardware-dependent gpt-oss-20b lane as worthy controlled comparisons. Claude Fable 5 and Gemini 3.1 Pro Preview are ceiling/research controls, while compact Qwen3-4B and Phi-4-mini models are narrow-task trials rather than assumed final judges. This research does not change the current external-agent-first runtime decision.
