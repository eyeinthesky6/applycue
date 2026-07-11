# ApplyCue Agent Development Guide

Date: 2026-07-06

Status: current code-change guide.

## Read This First

ApplyCue is a CV-to-offer agent.

It builds on the current local workflow and turns it into an agent-led product with stronger profile storage, truth reconciliation, browser policy, UAT receipts, and outcome learning.

Before changing code, read:

1. `AGENTS.md`
2. `docs/ARCHITECTURE.md`
3. `docs/agent-development-guide.md`
4. `docs/user-asset-storage.md`
5. `docs/cv-tailoring-policy.md`
6. `docs/cv-engine-architecture.md`
7. `docs/configuration.md`
8. `docs/build-roadmap.md`

If the task touches product behavior, also read:

- `docs/product-operating-plan.md`
- `docs/end-to-end-user-flow.md`

If the task touches hard gates, ordering, matching, or ranking, also read:

- `docs/research-math-and-oss.md`

If the task touches job discovery or source adapters, also read:

- `docs/discovery-inspiration-and-build-decision.md`
- `docs/prebuilt-providers-and-libraries.md`
- `docs/discovery-matching-architecture-research.md`

## Simple Mental Model

```text
source repo = product code, ApplyCue contracts, templates, docs, examples
user store = real user CVs, profile images, config, jobs, outputs
engine = contracts, safety, truth checks, file generation, and apply policy
agent = judgment, fuzzy role fit, preference learning, and user conversation
browser = apply assistant, not source of truth
chat = user interface
```

Do not mix those layers.

## Core Product Invariant

ApplyCue is not a generic job board, search engine, or "Google for jobs."

The objective is simpler:

```text
agents help one user get a job from thousands of daily postings
```

Build code only when it gives the agent durable leverage:

- fetch and normalize jobs from approved sources
- apply hard blockers from user rules
- dedupe, track, and record evidence
- generate truthful CVs and application answers from approved facts
- pause browser/application work when policy, trust, or truth is unclear
- write manifests, receipts, dashboards, and chat summaries

Do not build complex matching, ranking, or search infrastructure for work an agent can do better by reading the CV, JD, preferences, and feedback. The agent may propose tuning from batch analysis, record tuning signals, and update user config only through product approval flows. The agent may update target-role profiles, source approvals, proof bank entries, and reusable answers. The agent must not patch source code or hand-edit final CV artifacts for one application.

Normal users should not operate the repo. They chat with an agent. The agent may run commands, install local helper tools, edit config, and inspect outputs on their behalf. Developer commands in this guide are for agents and builders, not for the normal user journey. See `docs/agent-first-installation-and-usage.md`.

## Where Things Live

### Source Repo

Path:

```text
C:\Projects\applycue
```

Contains:

- `packages/core`: shared contracts and types
- `packages/profile`: profile/config loading and user settings
- `packages/discovery`: job source adapters
- `packages/normalizer`: job normalization and stable IDs
- `packages/ranker`: hard gates and simple backend ordering
- `packages/cv-tailor`: requirement map, reconciliation, CV rendering
- `packages/apply-assistant`: form/application draft policy
- `packages/engine`: orchestration, batch runs, manifests, output writing
- `packages/tracker`: local state and dashboard rendering
- `apps/worker`: command entrypoint for first build and later scheduled runs
- `apps/browser-agent`: controlled browser application helper
- `apps/web`: future local or hosted UI
- `skills/applycue`: agent skill entrypoint
- `docs`: product, architecture, build, and policy docs
- `config/applycue.example.json`: fake example config only
- `data/input/*.example.*`: fake example input files only

### User Store

Default local path:

```text
~/.applycue/profiles/default/
```

On this machine:

```text
%USERPROFILE%\.applycue\profiles\default\
```

Contains real user data:

- `applycue.json`
- `assets/base-cvs/`
- `assets/images/`
- `assets/jobs/`
- `outputs/cvs/`
- `outputs/ats-diagnostics/`
- `outputs/reconciliation/`
- `outputs/dashboard/`
- `outputs/runs/`
- `data/local/`

Real CVs, profile images, jobs, and generated CVs do not belong in the source repo.

## How Config Is Found

ApplyCue resolves config in this order:

1. explicit `configPath` passed by caller
2. `APPLYCUE_CONFIG`
3. `APPLYCUE_HOME/profiles/<profile>/applycue.json`
4. repo-local `config/applycue.local.json` only as a development fallback
5. built-in sample fixture

Default:

```text
APPLYCUE_HOME=~/.applycue
APPLYCUE_PROFILE=default
```

Do not edit env files unless the user explicitly asks.

## Build Loop

Use this loop for normal development:

```powershell
pnpm applycue:check
pnpm applycue:uat
pnpm applycue:browser-uat
pnpm applycue:browser-live-preflight
pnpm applycue:first-build
```

`pnpm applycue:check` runs typecheck and tests.

`pnpm applycue:uat` runs the local product gate, including CV completeness, truth reconciliation, browser-plan dry-runs, dashboard, and chat summary checks.

`pnpm applycue:browser-uat` runs the optional safe local browser proof when the browser tool is installed. It opens a fake application form under the user store, fills planned fields, uploads the generated DOCX, and pauses before submit.

`pnpm applycue:browser-live-preflight` opens one real application page from a generated browser plan, snapshots visible fields and page text, runs ApplyCue preflight, writes a report, writes chat-ready answer prompts, writes a local answer review page, and stops before filling or uploading anything.

`pnpm applycue:browser-live-apply` runs only after a current passing live preflight for the same prepared browser plan. By default it creates a review-mode execution copy, fills planned fields, uploads the generated DOCX, writes a receipt/report, refreshes progress, and pauses before final submit. It refuses missing, stale, paused, failed, or mismatched live preflight evidence. Use `--allow-submit` only when the plan itself allows submit and the user policy explicitly allows it.

When a live apply run is explicitly allowed to submit and captures a submitted receipt, ApplyCue records the `submitted` outcome in the user store automatically and refreshes the dashboard/summary. Do not run `record-outcome` again for that same submission.

`pnpm applycue:first-build` runs the current configured batch:

- external user profile if present
- dev local config if present
- sample fixture otherwise

For real user runs, output goes to the user store, not repo `outputs/`.

When the user explicitly asks for a wider but still relevant pipeline, run transient expansion without editing saved source config:

```powershell
pnpm applycue:first-build -- --more-results --target-ranking-queue 200
```

The target is a ranked queue target, not an application target. Keep hard blockers in place. After the run, inspect `outputs/runs/latest-job-decisions.json` for the full kept/watch/skip decision queue and use `outputs/runs/latest-summary.md` for the chat handoff.

Do not seed a real external user profile with fake jobs. `sources.localJobsPath` is only for real pasted/imported jobs. Leave it empty when the batch should come from approved source connectors, job boards, ATS directories, or browser-backed sources.

## How To Add Features

Follow ownership.

### New Data Shape

Start in:

```text
packages/core/src/index.ts
```

Then wire the owning package.

Do not create duplicate local types when a shared contract is needed.

### Profile, Preferences, CV Sources, Assets

Use:

```text
packages/profile
docs/configuration.md
docs/user-asset-storage.md
docs/base-cv-versioning.md
```

### Job Source

Use:

```text
packages/discovery
packages/normalizer
```

Every source must normalize to `JobRecord`.

Discovery source order:

1. generated source plan from CV/profile/preferences
2. approved user/agent source config
3. local manual files and directories as fallback input
4. public ATS/company adapters
5. job board adapters
6. browser-visible extraction
7. social, community, newsletter, and email leads

Manual job import supports JSON, JSONL, Markdown, text, and directories of those files. Do not build one-off scrapers in the engine; add source adapters behind `packages/discovery`.

Before building a source adapter, check `docs/prebuilt-providers-and-libraries.md`. Prefer official APIs and proven OSS bridges like JobSpy over custom scraping.

Generated source plans live under:

```text
~/.applycue/profiles/<profile>/data/local/source-plan.generated.json
```

Do not hand-edit generated source-plan files. Put approved sources in user-editable config and keep `system_generated`, `agent_suggested`, and `user_added` origins separate.

The first run must stay clean. Do not widen search, bulk-approve generated sources, or run transient source expansion by default. If the user asks for more results, the agent can offer clear options first, then run `--more-results` with an explicit `--target-ranking-queue` or approve specific sources. Wider scans must not edit the user's source config or generated source-plan file unless the user approves reusable source changes. JobSpy source fetches must look back at least the active freshness window so a 30-day freshness setting is not accidentally limited by an older 24-hour or 72-hour source option.

Do not use generic `remote` to widen geography. Remote is a work mode. If the profile has explicit countries, search areas, or remote regions, overseas/global remote jobs stay filtered or ask-before until the user approves a reusable preference change. Country preferences also do not imply broad remote regions: `India` does not silently mean `APAC`, `Asia`, or `global remote`.

Normal search starts from country/city preferences on public job boards, company career sites, LinkedIn/social surfaces when approved, and region-relevant public sources. Generated source suggestions should use every configured `searchAreas` entry as an active search market. If `searchAreas` is empty, fall back to `searchCountries`, then explicit approved remote regions, then non-generic preferred locations. If the profile has explicit geography, transient expansion should prefer providers that can search that geography, such as JobSpy with a saved location. Broad global/no-location feeds should wait for `wide` mode or explicit user approval.

Market source packs are preference-driven. Keep common packs available for India, US, UK, Australia, and global remote, but activate only the packs that match the user's saved search areas/countries/remote regions. Do not run India boards for UK/Australia searches. Do not turn on global remote just because remote work is acceptable; global remote still needs region, visa, and work-authorization checks.

Company career pages are scanned only when concrete public ATS or careers URLs are approved into `sources.companyPages`; generated ATS search queries are leads until a real board URL is confirmed. For actual jobs posted on company websites, the agent should find the real careers/ATS URL, add that concrete URL to editable config after approval, then let the company-page adapter fetch posted jobs. Do not build one-off scrapers for one company unless it becomes a reusable adapter.

Target industries are a source-quality gate for broad sources. `targetIndustries` from the generated search profile are checked against company/title/JD text with conservative aliases, such as fintech -> banking/payments/lending and SaaS -> enterprise software/cloud software. Do not use generic single words such as "platform" as industry proof. If the user wants a new industry, record or apply a user-approved industry preference; do not make one job-specific exception in source code.

Do not make ApplyCue ATS-provider-first. Normal candidates search job boards, company websites, LinkedIn, and other public sources. ATS adapters are plumbing behind those surfaces, not the user-facing source strategy.

For global or overseas remote roles, read the JD text for visa, residence, timezone, and work-authorization requirements. If the JD says the applicant must be authorized to work in a country outside `workAuthorizationCountries`, block it or ask for a reusable preference update instead of preparing an application.

Duplicate protection is part of source quality, not a UI cleanup step. `packages/discovery` removes exact URL repeats and same-company/similar-role repeats in the current run before ranking, CV generation, and application planning. Daily and push mode scan history also skips non-manual same-company/similar-role jobs that were already prepared in prior automated runs, even when the URL differs. Manual imports stay visible because a pasted job is deliberate user or agent input.

Do not add broad fuzzy company-name dedupe. Different companies offering similar roles must remain separate opportunities. Company normalization should stay conservative, such as punctuation/case cleanup for the same visible company name, unless a provider gives a stable company id or the user approves a reusable company alias.

Do not show duplicate jobs as separate shortlist items just to prove the system found them. Show the dashboard/chat-summary counts instead: duplicates blocked, same URL, same company plus similar role, already handled earlier. Scam or risky portal blocks should be visible as safety counts, with only short examples.

Every batch now writes `funnelHealth` into the run manifest, dashboard, and chat summary. Agents must read it before changing search or match settings. It reports:

- daily target vs prepared applications
- discovered and kept job counts
- dominant source filters
- examples of jobs blocked by dominant source filters
- dominant preference hard gates
- suggested next actions

If the count is low, follow the suggested path. For example: scan or approve more sources, ask about a reusable seniority/company-title exception, or ask before widening work mode/location/employment type. Do not fill volume by weakening hard blockers silently.

If the count is huge or source quality is noisy, tighten title/source filters before increasing automation. Do not add more broad scrapers just because the system can fetch many rows.

The dashboard can preview decisions, but agents should use the full machine-readable queue for audit:

```text
~/.applycue/profiles/<profile>/outputs/runs/latest-job-decisions.json
```

That file is the reviewable ranking queue. It should contain every job that reached ranking, with decision, reasons, failed gates, and next step.

## Filter Policy

Do not chase perfect role matching in core code. Most job-market filters are messy, and false positives or false negatives will always happen if the system pretends titles and JDs are exact.

Default hard filters should match what normal job sites ask for at the top level:

- country, city, and approved remote region
- post freshness when the source exposes a post date
- role family and role band
- industry or excluded industry
- experience band when clearly stated
- seniority/title level as advisory by default, strict only when `matchSettings.seniorityGateMode` is `hard`
- employment type
- work mode
- salary range when available
- work authorization or visa requirement when stated
- blocked company, current company, fraud signal, or blocked portal

Everything else is a tuning signal or review signal, not a silent blocker. Examples: exact title interpretation, company-grade equivalence, "VP at startup vs manager at Amazon", domain nuance inside the same industry, optional tools, nice-to-have skills, vague salary language, and weak JD quality.

Freshness rule: default to jobs posted in the last 30 days, present known latest posts first, and keep unknown-date jobs eligible but lower than known fresh jobs. Do not treat unknown post date as "old". If the batch is short, ask before widening to older known posts.

When a filter is uncertain, expose it simply:

```text
I found 14 jobs. 5 are ready. 7 were held because the title level is unclear. Want me to include manager/senior manager titles at large companies?
```

Agents may tune user-level config, source approvals, role terms, excluded terms, and match range. They must not patch core code for one user's one-off match unless the same bug is reproducible as a product-level rule with tests.

## Tuning From Feedback And Agent Analysis

Search tuning can come from three places:

- direct user feedback, such as "block product marketing" or "show more digital product roles"
- agent analysis of a run, such as "title filters removed most results; add senior product title variants before widening geography"
- outcome learning, such as replies or interviews by source/title/company

Agents must record these as tuning signals, not one-off source-code changes:

```powershell
pnpm applycue:record-tuning -- --origin agent_analysis --target title_variant --action promote --value "group product manager" --reason "Several large-company senior product roles use this title."
pnpm applycue:record-tuning -- --origin user_feedback --target role_term --action block --value "product marketing" --reason "User said this is not a target role." --approved-by-user
```

Agent-analysis signals default to `proposed`. Direct user-feedback signals can be `approved`. Neither kind rewrites active config automatically. Applying approved signals to `applycue.json` must happen through the product command, with dry-run first unless the user has already approved the exact change:

```powershell
pnpm applycue:apply-tuning -- --dry-run --ids <signal-id>
pnpm applycue:apply-tuning -- --ids <signal-id>
```

Use `--all` only for an explained bulk apply. The command writes safe approved tuning to existing config lists: target/no-go/adjacent role terms, industries, preferred or ask-before locations, keyword lists, and trusted/ask-before/blocked portals. It skips proposed signals and ambiguous targets such as seniority equivalence, company grade interpretation, CV facts, work mode, and apply-policy changes until the agent asks or another product flow handles them.

Use simple language with the user:

```text
I found one tuning change: Product Marketing is creating noise. I recorded it as a blocked role term and will keep it out of future searches once applied.
```

Do not ask the user to review every noisy job. Show examples only when the agent cannot tell whether the pattern is desired.

Every prepared CV now also writes ATS diagnostics under:

```text
~/.applycue/profiles/<profile>/outputs/ats-diagnostics/
```

Use this as an agent/backend warning file only. It checks whether the rendered CV is parseable and whether supported JD terms are visible in the generated CV text. It is not a score, not a ranking signal, and not a replacement for reconciliation. If ATS diagnostics and reconciliation disagree, reconciliation wins.

To approve generated suggestions, use:

```powershell
pnpm applycue:approve-sources -- --dry-run --ids <suggestion-id>
pnpm applycue:approve-sources -- --ids <suggestion-id>
```

This reads the generated plan and writes accepted sources into the editable profile config. It must not modify the generated source-plan file.

Public ATS query suggestions are leads for browser/search work unless they include a concrete company board URL. Do not treat a `site:...` query as an executable source adapter. Confirm a real careers/ATS URL before adding `sources.companyPages`, or approve executable no-login job-board providers such as JobSpy, JobHive, Remotive, RemoteOK, Working Nomads, Jobicy, or Himalayas. The Muse stays explicit because its official API requires registration beyond testing and its latest live canary failed.

JobHive suggestions are review-only and currently generated only for India search profiles. Do not auto-approve `jobhive` or `ats_directory`. The filtered snapshot provider must keep DuckDB and JobHive-native rows inside the discovery adapter; the directory must keep its company and batch limits. Both emit `JobRecord` and own no ranking, truth, policy, or application action.

Email and inbox leads are agent-tool work. The source plan can produce `email_alert` suggestions, but ApplyCue does not log into mail and does not send emails. The agent should use native Codex, Claude, Hermes, or similar connected email tools first to search recent job alerts/recruiter mails, save the raw connector result locally, run the ApplyCue email scanner, and then run the normal filter/dedupe/CV/apply-packet flow. If native connector access is unavailable, use the user's browser session only with permission. Email apply routes write drafts only; final send always needs explicit user confirmation in the connected tool or browser.

After the first clean search/apply run, if no approved inbox source exists, the agent should first discover whether the current host exposes a ready or connectable email-read capability. Only then should it ask the user whether to add narrow Gmail/Outlook job-alert search. This is a prompt, not a blocker. Use broad mailbox strings because job-alert mail is already user-filtered by subscriptions and saved searches. Prefer a discovered native connector over browser control and follow `docs/connector-capability-policy.md`.

Use the scanner after saving raw connector results:

```powershell
pnpm applycue:scan-email-leads -- --input <raw-mail-export.json|jsonl> --import
pnpm applycue:first-build
```

The scanner extracts real job links/cards from connector messages, unwraps common tracking links, writes normalized leads to `assets/inbox-leads/`, imports them into the normal local job source when `--import` is used, and activates `assets/jobs` when the profile has no local import path. The lower-level `import-email-leads` command remains available only for already-normalized rows. Do not make users copy emails into JSON; the agent saves connector results and runs the scanner.

Mailbox scam handling:

- hard-block or manual-review emails asking for payment, registration fees, training fees, refundable deposits, or processing fees
- hard-block or manual-review emails asking for Aadhaar, PAN, passport, bank details, salary slips, UAN/PF, or similar private documents before a verified interview or offer
- manual-review vague "shortlisted" emails that do not name the company, role, JD, recruiter identity, or apply link
- manual-review emails that mainly ask the user to register in a profile database, candidate database, resume database, or data bank
- do not block every consultant/recruiter email; real Indian hiring often comes through agencies
- import the job only when the mail contains enough real job evidence to normalize it

### Hard Gates And Shortlisting

Use:

```text
packages/ranker
docs/research-math-and-oss.md
```

Hard gates first. The engine may own clear threshold decisions; agent judgment handles ambiguous role fit. Ordering signals are routing hints, not a claim that ApplyCue knows the user's interview or offer probability.

Wrong role family, disallowed source kind, current company, explicit blocked company, blocked portal, fraud signal, impossible work authorization, blocked work mode, clear out-of-range experience, known compensation below floor, explicit no-sponsorship when sponsorship is required, explicit non-standard shift conflict, explicit travel above limit, and explicit timezone conflict are hard blockers. Ambiguous seniority, title grade, role shape, domain fit, location fit, company-level differences, and missing compensation/travel/sponsorship/timezone data should be routed to agent review or reusable user config, not solved with new math.

Do not hard-block on title seniority by default. A junior/intern role should usually be blocked by explicit no-go terms, role family, source quality, or known required experience range. Raw title seniority blocks only when the user has configured `matchSettings.seniorityGateMode` as `hard`.

Company title levels can be adjusted only through reusable evidence: `companyMarketGrade`, `companyStage`, normalized seniority evidence, or `preferences.companySeniorityOverrides`. Do not hardcode one company name in ranker logic.

Senior title variants may match when both pieces are true: the title has an accepted seniority signal such as VP, Vice President, Director, or Chief, and the title also has the target role anchor such as product. Do not let unrelated senior titles such as VP Sales pass for a product-leadership search.

Shortlist feedback stays in chat for now. Do not add dashboard buttons or a second interaction surface just to collect tuning. If the shortlist has too much noise, the user can tell the agent, or the agent can propose a few reusable labels such as `bad fit`, `band too high`, `band too low`, `salary too low`, `wrong industry`, `wrong geography`, `culture`, `duplicate`, or `scam/risky`. Save approved feedback as tuning or outcome feedback; do not add a one-job source-code rule.

Do not add embeddings, cross-encoders, learning-to-rank, or broad search-engine features unless a later product decision proves they help the agent get the user interviews better than agent evaluation plus simple guardrails.

The same rule applies to model providers. Native Codex/Claude judgement is the current runtime. The inherited root evaluators have been removed. Do not import a model SDK into `apps/` or `packages/` or add a model key requirement. If the user explicitly authorizes a future model trial, follow `docs/ai-judgment-trial-plan.md`: reuse the recorded-decision contract, use de-identified fixtures first, keep output in shadow mode, and preserve hard-gate and native-agent fallback authority.

### CV Tailoring

Use:

```text
packages/cv-tailor
docs/cv-tailoring-policy.md
docs/cv-engine-architecture.md
```

The agent must call the engine. It must not hand-edit generated CVs.

The CV engine maps JD requirements to approved facts and proof items before rendering. Direct support can shape the generated CV. Adjacent support becomes `needs_confirmation` for required requirements and pauses that candidate until the user confirms it. Unsupported requirements block the CV for that job.

Prepared applications write normalized JD Markdown under `outputs/jds/`. Use those files as the source JD input for agent review, CV/JD checks, and browser preflight context. Do not paste one-off JD text into source code or hand-edit generated CVs for a single application.

Do not bypass this by editing Markdown/DOCX output. If a user wants to claim a new role, industry, skill, location, metric, or career pivot, record it as an approved fact or target base CV update first, then regenerate.

### Application Drafts And Browser Submit

Use:

```text
packages/apply-assistant
apps/browser-agent
docs/end-to-end-user-flow.md
```

Prepared applications write apply route JSON under `outputs/apply-routes/`. Agents should start there, not from an improvised browser or connector path. The route decides whether the next action is API, browser, email draft, DM draft, or manual review. Use `pnpm applycue:apply-route -- --route-id <route-id>` as the route-aware dispatcher. If the route is wrong, fix the reusable source, policy, or config input and regenerate instead of hand-editing one route.

Email and DM routes are draft/handoff routes only. ApplyCue may write the draft body and attachment list, but it must not send email, send DMs, or store mail-provider credentials. Actual sending is agent-managed only through a current, discovered Codex, Claude, Hermes, or similar account capability. Use browser control only when no connector is available and the user approves that session. Final send always needs explicit user confirmation.

Never submit when reconciliation, source trust, or user policy fails.

Before filling any real portal form, generate the master form-data preview:

```powershell
pnpm applycue:form-data
```

Show the key values from `outputs/form-data/master-form-data.md` in chat. After the user approves them, confirm:

```powershell
pnpm applycue:form-data -- --confirm
```

Browser apply routes should block until this confirmation exists for the current form-data hash. If the underlying approved answers change, regenerate and confirm again. This gives the agent one local, reusable set of form values for name, contact, location, notice period, links, and similar fields instead of answering each portal from scratch.

When a portal asks a new reusable form question, do not treat it as a one-job code change. Ask the user in chat, save the approved reusable answer through `approve-answers`, rerun the batch or form-data command, and confirm the updated master preview. The same answer should then be reused through aliases on later forms.

Examples:

```powershell
pnpm applycue:approve-answers -- --from-live --set notice_period="30 days" --dry-run
pnpm applycue:approve-answers -- --from-live --set notice_period="30 days"
pnpm applycue:form-data
pnpm applycue:form-data -- --confirm
```

Use canonical reusable fields where possible: `notice_period`, `expected_salary`, `current_salary`, `work_authorization`, `visa_sponsorship`, `relocation_availability`, `total_experience_years`, `product_management_years`, `current_company`, and `current_title`. If a field is sensitive, ask explicitly before saving it. If the answer is one-off, use it only for that application and do not store it.

For a safe local browser proof, use:

```powershell
pnpm applycue:browser-uat
```

This command creates a local fake application form under the active user store, opens it through the Playwright adapter when Playwright is installed, fills planned fields, uploads the generated DOCX, and pauses before submit. `pnpm applycue:setup` should install or verify this optional tool for the agent; the user should not be asked to install it manually.

Before filling a real portal form, use:

```powershell
pnpm applycue:browser-live-preflight
```

This opens and inspects a real application URL from a generated browser plan, writes the page snapshot, preflight report, and answer prompts under the user store, and does not fill fields, upload files, or submit. A `pause` result is not a failure; it means the agent needs to review company/role match, liveness, required fields, or sensitive questions before continuing.

When it pauses, start from:

```text
~/.applycue/profiles/<profile>/outputs/live-preflight/live-answer-prompts.md
```

That file is written for chat use. The matching local review page is:

```text
~/.applycue/profiles/<profile>/outputs/live-preflight/live-answer-prompts.html
```

Ask the user the Markdown questions in chat, then save only explicitly approved reusable answers. Use the HTML page when the user wants to inspect the pause, checks, and artifacts visually.

If the user approves a reusable form answer after a preflight pause, save it with:

```powershell
pnpm applycue:approve-answers -- --dry-run --field notice_period --value "30 days" --alias "What is your notice period?"
pnpm applycue:approve-answers -- --field notice_period --value "30 days" --alias "What is your notice period?"
```

For multiple live-preflight answers, prefer approving values directly from the latest live template:

```powershell
pnpm applycue:approve-answers -- --from-live --set notice_period="30 days" --set expected_salary="INR 7500000" --dry-run
pnpm applycue:approve-answers -- --from-live --set notice_period="30 days" --set expected_salary="INR 7500000"
```

Only include `--set field=value` pairs the user explicitly approved for reuse. This reads the generated live template for aliases and source refs without hand-editing generated JSON.

Use the generated approval template as a fallback when the answer set is too large for a single command:

```powershell
pnpm applycue:approve-answers -- --from-file "~/.applycue/profiles/default/outputs/live-preflight/live-answer-approval-template.json" --dry-run
pnpm applycue:approve-answers -- --from-file "~/.applycue/profiles/default/outputs/live-preflight/live-answer-approval-template.json"
```

Only fill values and set `approveForReuse: true` after explicit user approval. One-off answers in the template are for form review only and must not be saved as reusable answers.

This writes approved answers into editable user config. It must not edit generated preflight reports, generated apply routes, generated browser plans, or source code. Use `--replace` only when the user explicitly changes an existing approved answer.

After live preflight returns `PASS`, continue with:

```powershell
pnpm applycue:browser-live-apply
```

This fills planned fields, uploads the generated DOCX, writes `outputs/browser-receipts/<plan>-receipt.json`, and pauses before submit by default. Do not run it against a real portal unless the user has approved applying to that role. Do not submit unless reconciliation, source trust, and the user's apply settings all allow it.

### Outcome Tracking And Source Learning

Use:

```text
packages/tracker
packages/engine
```

Outcome events live in the user store:

```text
~/.applycue/profiles/<profile>/data/local/outcomes.jsonl
```

Record outcomes through the product command:

```powershell
pnpm applycue:record-outcome -- --application <application-id> --type reply --note "Recruiter replied"
```

Submitted outcomes from controlled live browser submit are recorded automatically from the receipt. Use `record-outcome` for confirmations, replies, interviews, offers, rejections, withdrawals, or manual corrections.

The engine reads application records, scan history, and outcome events to produce Source Learning in the run manifest, dashboard, and chat summary. It also produces Source Scorecards from fetched, kept, filtered, prepared, and outcome data. Use these to decide which sources deserve more scan budget. Do not expose them as a candidate-worth score.

When the run manifest or dashboard includes pending questions, ask the user in chat and save reusable answers into editable profile config. Do not patch source code, generated manifests, generated dashboards, or generated source plans to resolve one ambiguity.

### Batch Orchestration

Use:

```text
packages/engine
apps/worker
```

This is where discovery, shortlisting, CV generation, drafts, manifests, dashboard, and output roots come together.

## Do

- Use simple language when explaining behavior.
- Check existing docs and contracts before adding files.
- Keep source code independent from real user assets.
- Store real user data in the user store.
- Add examples with fake data only.
- Add or update tests with behavior changes.
- Run `pnpm applycue:check`.
- Run `pnpm applycue:first-build` when changing the local pipeline.
- Keep generated outputs reproducible from config, assets, jobs, and code.
- Keep backend ordering signals hidden unless explicitly asked.
- Keep native-agent judgement separate from backend ordering and preserve actor/evidence provenance through the implemented recorded-decision path.
- Treat configured ask-before portals, blocked/scam portals, sensitive fields, and unsupported CV claims as pause conditions. Do not pause normal company career pages only because the domain is unfamiliar.

## Do Not

- Do not hardcode a user's CV, profile image, contact details, jobs, or generated outputs in source code.
- Do not commit real user config or assets.
- Do not store real user assets under `C:\Projects\applycue`.
- Do not hand-edit a generated CV for one job.
- Do not patch source code for one application.
- Do not invent claims, dates, employers, education, metrics, or credentials.
- Do not add a new CV template for one user/job.
- Do not bypass reconciliation to make a CV look better.
- Do not bypass generated apply routes for one job.
- Do not submit applications outside configured policy.
- Do not edit env files or secrets without explicit permission.
- Do not make a model provider, API key, or local inference server a required runtime dependency without a separately approved architecture decision and passing trial evidence.
- Do not expose score obsession as the product UI.
- Do not import another job-search repo as a second engine without a documented adoption decision.

## Application Run Boundary

An application run may write:

```text
~/.applycue/profiles/<profile>/data/local/
~/.applycue/profiles/<profile>/outputs/
```

An application run must not write:

```text
packages/
apps/
skills/
docs/
config/applycue.example.json
```

Code changes are product development, not application execution.

## Base CV Rule

Base CVs are source assets.

Job-specific CVs are generated outputs.

If a user has product, sales, and BD CVs, store them as separate versioned base CVs:

```text
assets/base-cvs/product-v1.docx
assets/base-cvs/sales-v1.docx
assets/base-cvs/bd-v1.docx
```

Then select the active base CV through config:

```text
profile.activeBaseCvId
```

If the user or agent updates a base CV, create a new version. Do not overwrite the old one silently.

## Truth Rule

Every generated CV claim must trace to at least one of:

- base CV text
- structured work history
- proof bank item
- approved profile fact
- approved target base CV fact
- user-approved answer

Unsupported requirements are not experience. They are either omitted or sent to review.

## Browser Rule

Browser control is an execution layer.

It can:

- search
- inspect pages
- fill forms
- submit when allowed
- capture receipts

It cannot:

- invent answers
- override policy
- bypass reconciliation
- become the profile source of truth

## When Unsure

Pause and inspect:

```powershell
rg "term" packages docs
pnpm applycue:check
pnpm applycue:first-build
```

If a choice affects user data, storage, truth, or submission policy, prefer a small documented contract change over an ad hoc shortcut.
