# ApplyCue Build Roadmap

Date: 2026-07-06

Status: implementation history and backlog. Use `product-roadmap.md` for MVP/V1/V2 scope, `ARCHITECTURE.md` for ownership, and `launch-readiness.md` for the current release gate.

Terminology note: historical `V1` and `MVP` headings below predate the canonical version plan. They describe requirements and implementation history, not the current V1 release boundary.

## Build Readiness

ApplyCue is ready to start implementation.

The direction is clear:

```text
CV-to-offer local agent
one standard CV format
engine-owned truthful CV generation
local state and local dashboard
agent operates the engine, not source files
```

Do not add more product scope before the first working loop.

## Product Thesis

Most job-search tools make users do more work.

ApplyCue should do the work:

- find roles
- shortlist what is worth applying to
- tailor truthful CVs
- prepare applications
- submit within policy
- pause on exceptions
- track replies
- learn from outcomes

The value is not a better job board. The value is a reliable application engine.

## Stance Correction: Agent-First, Not Search-Engine-First

Date: 2026-07-07

Core invariant:

```text
agents help a user get a job from thousands of postings every day
```

ApplyCue is not trying to become a generic job board, a search engine, or "Google for jobs." The agent should do fuzzy judgment work: reading the CV, reading the JD, understanding role shape, interpreting ambiguous seniority, noticing user preferences, and updating reusable config from feedback.

Code should exist where repeatability and safety matter:

- source adapters and approved source config
- hard blockers from user rules
- dedupe, liveness, trust, and scan history
- fact ledger, proof bank, and CV reconciliation
- standard CV rendering
- browser apply policy, preflight, receipts, and manifests
- outcome tracking and dashboard/chat summaries

If an agent can do something more efficiently and safely than a coded subsystem, keep it in the agent workflow and user config instead of adding code.

## V1 User Promise

```text
Give me your CV, preferences, and application rules.
I will find roles, generate truthful job-specific CVs, apply in batches, pause when needed, and show what happened.
```

## V1 Non-Negotiables

- One CV format: `standard_ats_v1`.
- No agent hand-edits of CV files.
- No source-code changes for one job application.
- Every generated claim maps to a fact, proof item, or user-approved answer.
- Major repositioning needs user approval and becomes reusable fact data.
- Application answers use the same fact ledger as the CV.
- Scores stay backend-only.
- Local-first state and outputs.

## MVP Success Criteria

The first real milestone is not a UI. It is one reproducible local run.

Given:

- one base CV
- one preferences config
- five sample jobs

ApplyCue should produce:

- normalized job records
- shortlisted job list
- one generated `standard_ats_v1` CV per serious job
- reconciliation report for each CV
- application draft for each job
- local dashboard HTML

And it should prove:

- no unsupported facts are inserted
- unsupported JD requirements are marked
- major changes pause for user approval
- output files are written under the active output root; real user runs use `~/.applycue/profiles/<profile>/outputs/`
- source files are not modified during an application run

## Phase 0: Lock The Engine Contract

Goal:

Make the core data model hard to misuse.

Build:

- fact ledger schema
- target base CV schema
- job requirement schema
- CV content plan schema
- reconciliation report schema
- generated output manifest

Tests:

- unsupported facts block rendering
- major unapproved facts require confirmation
- minor supported rewrites pass
- target base CV facts are reusable

## Phase 1: CV Engine

Goal:

Generate one truthful job-specific CV in `standard_ats_v1`.

Build:

- base CV parser/importer for DOCX, text-based PDF, Markdown, and text; OCR remains evidence-gated
- fact extraction stub
- requirement extraction stub
- truth-oriented requirement-to-proof mapper
- reconciliation checker
- `standard_ats_v1` Markdown/HTML/DOCX renderer
- output writer under the active output root, for example `~/.applycue/profiles/<profile>/outputs/cvs/`

Keep it boring. Boring is good here.

## Phase 2: Local Pipeline

Goal:

Run the full local flow without browser automation.

Build:

- local JSONL state store under `<outputRoot>/data/local/`
- manual/static job source
- normalizer and dedupe
- hard-gate and shortlist integration
- CV engine integration
- application draft integration
- dashboard writer to `<outputRoot>/outputs/dashboard/latest.html`

This is the first "show me it works" milestone.

## Phase 3: Discovery

Goal:

Find enough jobs without manual copy-paste.

Build in this order:

1. generated source plan from CV, profile, and preferences
2. user confirmation and approved source config
3. manual URL/import as fallback input
4. company/ATS page adapter
5. job board adapter
6. browser-visible job extraction
7. social/community/newsletter leads

Keep every source normalized into the same `JobRecord`.

## Phase 4: Application Assistant

Goal:

Prepare and submit applications under user policy.

Build:

- form field detection
- safe auto-fill
- pause rules
- submit policy
- browser action log
- application receipt tracking

Never submit when reconciliation or policy fails.

Current implementation status:

- Application drafts are created from approved profile facts and generated CV variants.
- Closed jobs are blocked before CV, application draft, and browser plan preparation.
- A liveness verifier hook can update `JobRecord.liveState` before shortlist preparation when a browser/page checker is available. The default local run does not fetch live pages.
- Browser apply plans are generated for each prepared application and written under `outputs/browser-plans/`.
- Plans pause before final submit in review mode or when any configured pause reason exists.
- Browser action-log and receipt contracts exist for the execution layer.
- Local browser-plan dry-run execution is part of UAT and writes receipts under `outputs/browser-receipts/`.
- Browser apply preflight now runs before fill/upload/submit in the browser-agent dry-run path. It fails closed postings, pauses company/role mismatches, pauses unclear liveness, pauses sensitive required fields, and pauses required fields the current plan cannot answer.
- Browser apply preflight now treats a single noisy secondary job-title node as weak evidence when the browser title or top-of-page text clearly matches the planned role. This avoids false pauses on real job pages that also render related jobs or alert widgets, while still pausing when the page title/body point to a different role.
- Browser page snapshots can now be checked through `pnpm applycue:browser-preflight -- --plan <browser-plan.json> --snapshot <page-snapshot.json>`, giving agents a real Chrome handoff without putting Playwright inside the core engine yet.
- `apps/browser-agent` now exposes a browser execution kernel: generated plan + browser page snapshot + browser controller -> preflight -> fill/upload/pause/submit -> receipt. Chrome, Playwright, Stagehand, or other adapters should plug into that controller interface instead of bypassing ApplyCue policy.
- `apps/browser-agent` also exposes `createPlaywrightBrowserApplyController`, a small Playwright-style page adapter that can inspect the visible page, fill standard fields, upload the generated DOCX, submit only when the plan allows it, and capture a receipt. It is duck-typed so Playwright stays an adapter, not an engine dependency.
- `pnpm applycue:browser-uat` now runs an optional safe local browser proof. It selects a generated browser plan, creates a fake application form under the active user store, forces a review-mode copy of the plan, opens it through the Playwright adapter when the browser tool is installed, fills fields, uploads the DOCX, writes a receipt/report, and pauses before submit. If the browser tool is not installed, it writes a skipped report instead of failing normal UAT.
- `pnpm applycue:setup` now reports browser tool status and can verify/install the Playwright Chromium runtime for agent-driven UAT. This follows the base workflow's useful browser-proof pattern without making browser control the source of truth.
- `pnpm applycue:browser-live-preflight` now opens a real application page from a generated browser plan, captures a page snapshot, runs ApplyCue preflight, writes a report, and stops before fill/upload/submit. This is the first live-portal compatibility gate before controlled application execution.
- `pnpm applycue:browser-live-apply` now gives agents the next controlled execution step after a current passing live preflight. It refuses missing/stale/non-passing preflight evidence, resolves the generated DOCX from the user store, creates a review-mode execution copy by default, fills planned fields, uploads the generated CV, writes a live apply report and browser receipt, refreshes progress, and pauses before final submit.
- Reusable approved application answers now live on the profile as `applicationAnswers`. Drafts consume them through the engine, preference-derived notice period and expected salary answers are added only when explicitly configured, and browser preflight treats sensitive required fields as clear only when the plan already has a matching approved answer.
- Public profile links from setup, such as LinkedIn, GitHub, portfolio, and personal website, are also turned into application answers with common form-label aliases. The agent should collect these once during setup instead of asking again on every form.
- `pnpm applycue:approve-answers` now gives agents the approval route after live preflight pauses. It supports dry-run, aliases for visible form labels, duplicate checks, explicit replacement, direct `--from-live --set field=value` approval from the latest live template, and writes only to editable user config.
- Live preflight now writes `live-answer-approval-template.json` as fallback evidence and generates a direct approval command in `live-answer-prompts.md`. Agents can save explicitly approved reusable values without editing generated JSON. One-off answers remain out of reusable config.
- Live preflight now writes `live-answer-prompts.json`, `live-answer-prompts.md`, and `live-answer-prompts.html`, so the agent can ask clean chat questions, the user can inspect a polished local review page, and approved reusable answers can be saved without dumping raw form diagnostics on the user.
- Live preflight also refreshes the main dashboard and chat summary with the current portal status, answer prompt counts, review links, and next action. The dashboard must not say the run has no pending questions when the latest live portal preflight is paused on unanswered form fields.
- UAT refreshes the local dashboard after dry-run execution so every prepared application links its browser receipt and shows whether it paused or submitted.
- Live browser execution against arbitrary portals now has an ApplyCue-owned fill/upload/pause path. Submit remains gated by explicit user policy and plan-level permission; real portal compatibility still needs broader adapter UAT across ATS families and logged-in sessions.

## Phase 5: Tracking And Learning

Goal:

Learn what works.

Build:

- reply/rejection/interview/offer state updates
- native agent email connector review first, browser-assisted email review only with user permission
- daily and weekly progress reports
- outcome feedback loop

Later learning:

- agent-visible source and outcome patterns
- reusable preference updates from user feedback
- daily/weekly evidence of what is producing replies and interviews

Current implementation status:

- Outcome events can be recorded into the user store with `pnpm applycue:record-outcome`.
- A successful `pnpm applycue:browser-live-apply -- --allow-submit` run now records a `submitted` outcome event automatically from the captured browser receipt. Review-mode pauses still do not create submission outcomes.
- The engine reads `data/local/outcomes.jsonl` during local runs.
- Run manifests, dashboard HTML, and chat summaries include Source Learning:
  - applications with source context
  - prepared applications by source
  - submitted, replies, interviews, offers, and rejections
  - positive outcomes by source
- Source learning is an operations signal, not a visible candidate-worth score.
- Native agent email connector review is still a later slice; browser-assisted email review is fallback only with user permission. For now the agent records known outcomes through the command.

## Parked Features

These are valuable, but not v1:

- network intelligence and social heat map
- multiple CV templates
- paid design formats
- early-career proof builder
- accessibility/accommodation flows
- confidential executive search
- deep portal trust scoring
- graph neural networks
- custom contrastive model training
- embeddings and cross-encoder reranking
- learning-to-rank models
- generic web-wide job search

## Inspiration To Keep

Useful product patterns:

- Jobscan: useful feedback depth, but do not expose score obsession as the main UI.
- Applicant tracking systems: normalize every job/application into a lifecycle state.
- Sales CRM: pipeline, follow-ups, outcomes, and source performance.
- JSON Resume: structured resume schema inspiration.
- base-workflow-style agent evaluation: CV + profile + JD + user goals -> concise shortlist reasoning.
- Source adapters: fetch enough jobs from approved places without making the user search manually.
- Truth reconciliation: map CV/application claims back to approved facts and proof.
- Outcome learning: show the agent which sources and patterns are producing replies/interviews.

## What We Should Avoid

- building a generic job board
- building a generic search engine
- starting with SaaS
- adding many CV designs early
- letting the agent patch files per application
- treating embeddings as proof
- adding embeddings, cross-encoders, or learning-to-rank before agent evaluation is exhausted
- hiding search area expansion
- applying through suspicious portals without pause
- making users review every CV forever

## Immediate Next Step

The local pipeline milestone is now in place.

Important product correction:

```text
The user does not run the pipeline. The agent runs the pipeline from chat.
```

The next milestone is therefore not "document CLI usage for users." It is:

```text
chat request -> agent setup -> local tools/config/profile -> discovery batch -> CVs/applications/exceptions -> chat summary
```

The first Phase 3 discovery slice is now in place:

```text
manual URL/text/job import -> JobRecord normalization -> local batch run
```

Start with JSON, JSONL, Markdown, text, and directory imports. See `docs/discovery-inspiration-and-build-decision.md`.

This gives the agent and future browser extractor a simple way to feed real jobs into the engine without hand-writing JSON or changing code for one application.

Build the next Phase 3 discovery slice:

```text
generated source plan -> user-confirmed sources -> public ATS company sources -> JobRecord normalization -> local batch run
```

Manual import remains available, but it is not the primary discovery path. Keep generated source suggestions separate from user-added and agent-suggested sources.

The generated source plan and approval route are now in place:

```text
source-plan.generated.json -> pnpm applycue:approve-sources -> editable applycue.json source config
```

base workflow parity improvement now in place:

```text
profile/preferences -> generated searchProfile -> richer ATS/job-board search suggestions -> source-quality filter
```

This gives the agent a visible title/location/content filter plan before jobs enter the batch. It must stay generated from user config, not hardcoded to one market or one candidate. The engine now uses it before shortlist preparation so broad job-board sources do not flood the review queue with weak roles.

base-workflow-inspired source coverage improvement now in place:

```text
approved company ATS source -> Greenhouse/Lever/Ashby/Workable/SmartRecruiters/BambooHR/Breezy/Recruitee/Pinpoint/Workday/Personio adapter -> JobRecord
```

Workable, SmartRecruiters, BambooHR, Breezy, Recruitee, Pinpoint, Workday, Personio, and Rippling use public no-login surfaces and normalize into the same company-source path as the original ATS adapters. On 2026-07-11 the old non-commercial reverse-directory input was replaced with JobHive's MIT company CSVs. A separate review-only JobHive/DuckDB lane now performs bounded India title/location queries over selected ATS snapshots. Neither lane is auto-approved, and concrete company/ATS URLs remain preferred.

Shortlist parity improvement now in place:

```text
target title anchor -> can enter today's preparation queue
adjacent-only, description-only, or wrong-family role match -> skip unless the user explicitly targets it
broad remote region that includes the user's authorized region -> do not hard-block at discovery/shortlist time
explicit user blockers -> source-kind/company/portal/fraud/work-mode/known-experience/employment/company-stage/work-auth/sponsorship/compensation/shift/travel/timezone gates
seniority/title level -> advisory by default, review or hard only by `matchSettings.seniorityGateMode`
decision bucket -> simple backend ordering by policy, role anchor, proof, source confidence, and recency
reusable ambiguity prompts -> saved-question handoff for policy edge cases
```

This keeps weak matches and explicit user-rule violations from filling application slots while still allowing explicit role pivots and plausible remote roles to remain reviewable. Default source generation also keeps adjacent-only terms out of active search queries and title positives; separate exploration lanes must be approved through user config. Missing metadata is not guessed into a rejection; it is handled by agent review, pending questions, or browser preflight.

Shortlist upgrade path:

```text
hard gates -> source-quality filter -> clear shortlist + ambiguous fit review -> source scorecards -> ambiguity prompts -> user config updates
```

The current ordering in `packages/ranker` remains subordinate to `apply -> review -> watch -> skip` policy buckets. Clear `apply` rows may prepare automatically; `review` rows go to the agent only when needed. Do not expand this into a search-ranking platform. If the shortlist feels wrong, first update the user's target roles, source filters, proof bank, or preferences, then rerun the engine.

`buildAmbiguityPrompts` emits reusable policy questions for company-grade seniority, location/work authorization, work mode, employment type, and company-stage ambiguity. These prompts must be answered into editable user config; agents must not patch source code for one job.

Dashboard parity improvement now in place:

```text
local progress HTML -> control-room dashboard
local progress Markdown -> chat-ready run summary
source quality -> CV quality -> batch health -> prepared queue -> decision queue -> next actions and operator notes
```

This keeps the base workflow's useful pipeline visibility pattern, but fits ApplyCue's chat-first product shape. The dashboard shows source quality, CV quality, decisions, artifacts, and next steps; the Markdown summary gives the agent a short handoff for chat. Neither makes raw scores the user-facing product.

CV artifact parity improvement now in place:

```text
reconciled standard_ats_v1 CV -> Markdown audit file + HTML preview + DOCX upload file
```

the base workflow's useful lesson is that the CV artifact must be application-ready, not just a text report. ApplyCue now writes a real `.docx` file for browser upload plans while preserving HTML for preview and Markdown for audit/debug. Browser plans should upload the DOCX artifact, not Markdown.

The CV renderer also preserves base-CV career structure and suppresses near-duplicate bullets when proof-bank claims and base-CV bullets describe the same work. Generated CVs must remain full CVs with contact, summary, skills, employer sections, awards, and education when those facts exist.

JD artifact parity improvement now in place:

```text
prepared application -> outputs/jds/<job-id>.md -> agent/CV review input
```

Every prepared application writes a normalized JD Markdown file with source metadata and the captured job description. Agents should use these JD files for review, CV/JD reconciliation checks, and browser preflight context instead of scraping the same page again or hand-copying descriptions into source code.

base workflow parity / UAT volume improvement now in place:

```text
source jobs -> source-quality filter -> hard gates -> clear shortlist + ambiguity review -> cleaned JD requirements -> truth reconciliation -> daily batch filled when enough eligible roles exist
```

The first real UAT exposed the base workflow gap clearly: broad job-board discovery found many roles, but weak source filtering and over-mechanical ordering prepared too few useful applications. ApplyCue should keep weak-role matches capped, map requirements only to approved evidence, and strip common non-requirement job-post metadata before CV reconciliation. The goal is better batch fill without lowering the truth gate or pretending math knows the user's real opportunity.

Current UAT evidence:

```text
1130 discovered jobs -> 24 source-quality kept -> 5 CVs -> 5 application drafts -> 5 browser plans -> 0 blocked reconciliations -> 5 browser dry-run receipts
```

The latest local UAT filled the configured daily review batch, but later India-focused runs exposed a second problem: source-quality title filtering was acting like a fuzzy matcher and throwing away too much supply before ranking. Do not fake quality by hiding uncertain jobs. Source quality should block explicit no-go terms, clear wrong role families, scam/fraud signals, location/work-authorization conflicts, duplicates, and stale roles when the data is known. Ambiguous title fit should reach ranking or agent review, with reusable tuning applied only after user or agent approval.

Funnel health guidance now accompanies every run:

```text
source filters + hard gates + prepared count -> funnelHealth -> next actions
```

The dashboard and chat summary should show whether the batch is healthy, low-volume, high-volume, or source-noisy. Agents must use those suggested actions before changing search width, source lists, or user preferences.

CV/JD reconciliation is stricter now:

```text
direct proof -> supported -> can shape CV
adjacent proof -> needs_confirmation -> pause
no proof -> unsupported -> block
```

This reduces false positives from shared words while preserving false-negative fixes through explicit aliases such as product roadmap/roadmap, SaaS/B2B SaaS, payments/payment gateway, GTM/go-to-market, and digital banking/banking.

Transient source expansion is now an explicit more-results action, not first-run behavior:

```text
user asks for more results -> generated source plan + approved public job-board sources -> wider no-config-edit scan -> source-quality filter -> hard gates/shortlist
```

This can rerun approved public JobSpy/remote-board queries with wider `resultsWanted`, `hoursOld`, or `limit` values. It does not edit source config, generated source plans, CVs, or user assets. The clean first run should show the best saved sources only; relaxation options are shown in plain language when the user asks for more volume.

base workflow parity / repeat-control improvement now in place:

```text
post-filter jobs -> current-run dedupe -> scan-history filter -> skip already prepared/closed non-manual jobs in daily/push -> record seen/prepared/closed -> detect repost signals
```

The scan history file lives in the user store at `data/local/scan-history.jsonl`. Review mode keeps repeated jobs visible for UAT and manual inspection; daily and push runs avoid re-preparing jobs already handled from automated sources. Current-run dedupe removes exact URL repeats and same-company/similar-role repeats before ranking, CV generation, and application planning. Daily and push also skip same-company/similar-role jobs already prepared in prior automated runs, even when the repost or aggregator link has a different URL. Manual imports stay visible because they are deliberate user or agent input. The dashboard/chat summary shows duplicate counts and safety-block counts so the user sees protection without reviewing junk. Repost clusters are shown as source-quality warnings and do not block applications by themselves.

base workflow parity / outcome-learning improvement now in place:

```text
applications + scan history + outcome events -> source learning -> dashboard and chat summary
fetched/kept/filtered jobs + outcomes -> source scorecards -> future source budget choices
```

The base workflow analyzes tracker/report outcomes to find patterns. ApplyCue now keeps the first version in structured contracts: outcome events live in `data/local/outcomes.jsonl`, the engine records them through `pnpm applycue:record-outcome`, and each run summarizes which sources are producing replies, interviews, offers, or rejections. This should later influence source weights and search expansion, but it does not expose raw scores as the product UI.

Source scorecards now add the missing upstream view: fetched jobs, kept jobs, filtered jobs, prepared applications, precision, yield, and positive outcomes by source. Use this for backend source allocation and agent diagnostics, not as a user-facing worth score.

Generated CVs in the manifest must stay full CVs, not extracts: contact, summary, skills, experience, selected impact, awards, education, DOCX/HTML/Markdown artifacts, and no empty employer headings.

UAT now enforces this as a rendered-CV completeness and parity gate. Agents should not hand off a run for application testing if the generated CVs are shorter than expected versus the base CV, missing configured identity/contact fields, missing required sections, missing named employer structure, repeating near-duplicate bullets, missing enough bullets in each employer section, or missing base-CV awards/education.

UAT must warn when a run prepares fewer applications than `applicationsPerDay`. That is not a CV or truth failure, but it is a source supply / match-width issue that the agent should address by approving more sources, widening search, or asking the user for permission to relax preferences.

Next discovery work should make approved non-company and browser-backed sources useful:

- browser-visible extraction for approved logged-in sources
- Crawl4AI adapter for public pages with no API
- key-required APIs only with user-owned credentials

Build order:

1. JobSpy fixture-row normalization. Done.
2. Optional Python JobSpy runner. Done.
3. Remotive no-key public API adapter. Done.
4. Approved `sources.jobBoards` execution. Done.
5. Generated `searchProfile` source-quality filtering before shortlist preparation. Done.
6. Source Quality dashboard panel backed by typed run data. Done.
7. Expanded safe JobSpy query budget using distinct role terms before role-plus-industry variants. Done.
8. Browser-plan local dry-run receipts for every prepared application. Done.
9. Scan history and repeat avoidance for daily/push automation. Done.
10. Repost/stale-opening signals from scan history. Done.
11. Source outcome learning from application events. Done.
12. JobHive ATS directory seed over the twelve supported ATS types, plus a review-only filtered snapshot provider for India. The old non-commercial directory input was removed on 2026-07-11.
13. Workable, SmartRecruiters, BambooHR, Breezy, Recruitee, Pinpoint, Workday, Personio, and Rippling company ATS adapters. Done.
14. The Muse public jobs API adapter. Adapter done; explicit trial only because official registration is required beyond testing and the 2026-07-10 live canary failed.
15. Local lexical retrieval list in backend ordering. Done. Do not expand this into a ranking platform without a new product decision.
16. Source scorecards in manifest, dashboard, and chat summary. Done.
17. Reusable ambiguity prompts in manifest, dashboard, and chat summary. Done.
18. Explicit `--more-results` generated public job-board expansion for short batches without editing user config. Done.
19. Senior title-variant matching for accepted seniority plus target role anchor. Done.
20. Multi-location, market-aware generated source packs for job-board searches. Done.
21. User inbox lead source planning and local import through native Codex, Claude, Hermes, or similar agent connector export, with browser fallback only by user permission. Done for source-plan, docs, and `pnpm applycue:import-email-leads`; mailbox search execution remains agent-managed.
22. Crawl4AI adapter for public pages with no API.
23. Browser-visible extraction for login-backed sources.
24. Key-required APIs such as Adzuna only with user-owned credentials.

See `docs/prebuilt-providers-and-libraries.md`.

## Next UAT Build Slice

Build the agent-first path:

1. ApplyCue setup skill flow, backed by `pnpm applycue:setup`:
   - verify local repo/package
   - install optional tools into `~/.applycue/tools/`
   - create profile folders
   - import the CV
   - ask only blocking setup questions
   - write config
   - run a safe review batch
   - start each session with a read-only status checkpoint
2. Batch preparation must use `applicationsPerDay`, not a tiny hardcoded run cap.
3. Dashboard and chat summary must show:
   - found
   - skipped with reasons
   - repeated jobs skipped from scan history
   - CV ready
   - needs answer
   - ready to apply
   - submitted
   - browser plan path for each prepared application
   - browser receipt path and status for every dry-run or live browser attempt
   - a chat-ready `outputs/runs/latest-summary.md`
4. Browser apply UAT starts only after the review batch proves:
   - no unsupported CV claims
   - no source-code writes during application runs
   - closed jobs are not prepared for CV or browser work
   - liveness verifier/page checks, when enabled, route through `JobRecord.liveState`
   - source trust and pause rules work
   - generated CVs are good enough for the user's target roles
   - rendered CV completeness passes, so generated CVs are full CVs rather than extracts
   - local browser-plan dry-run receipts are created for every prepared application
   - browser apply preflight passes before fill/upload/submit actions
   - optional `pnpm applycue:browser-uat` either passes with a local browser receipt or skips clearly because the optional browser tool is not installed
   - `pnpm applycue:browser-live-preflight` has opened at least one real portal page and either passed or paused with clear reasons before any fill/upload
   - `pnpm applycue:browser-live-apply` is available after a current passing preflight and defaults to fill/upload/pause with a receipt, not final submit

Normal-user UAT fails if the user has to manually run `pnpm`, install JobSpy, edit JSON, or understand where files live.

Status update:

```text
pnpm applycue:status -> profile/config/run/UAT/dashboard/summary/source-quality checkpoint -> agent handoff -> agent next action
```

This is the first agent-first usability bridge: agents can start from one checkpoint instead of manually inspecting output folders. It follows the base workflow's useful doctor/tracker pattern without making base workflow the runtime base.

Current implementation status:

- `pnpm applycue:status` is read-only.
- It reports setup health, latest UAT, latest run, source quality, scan history, source learning, dashboard, and summary paths.
- It now includes an Agent handoff block with:
  - command-center routes for the agent's exact next repo command
  - ready queue
  - attention items
  - next steps
  - evidence paths
- When live browser preflight pauses on form questions, status shows the prompt count, reusable-vs-one-off split, first questions to ask in chat, and links to the answer review page and Markdown prompt file.
- Agent CLI skill bridges now expose the canonical `skills/applycue/SKILL.md` router through `.agents`, `.claude`, `.opencode`, `.qwen`, `.antigravitycli`, and `.grok` folders. This is a base-workflow-inspired usability pattern, but all ApplyCue behavior stays in one canonical skill and the engine commands behind it.
- Status now checks whether the latest live preflight report still matches a browser plan in the current prepared run. If not, it marks the report as stale evidence and does not route the agent into old form questions for a job that is no longer in today's prepared queue.

The user should hear the plain handoff. The agent can still open the dashboard or summary for deeper inspection.
