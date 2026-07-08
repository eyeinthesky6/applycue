# ApplyCue Agent Development Guide

Date: 2026-07-06

## Read This First

ApplyCue is a CV-to-offer agent.

It builds on the current local workflow and turns it into an agent-led product with stronger profile storage, truth reconciliation, browser policy, UAT receipts, and outcome learning.

Before changing code, read:

1. `AGENTS.md`
2. `docs/agent-development-guide.md`
3. `docs/user-asset-storage.md`
4. `docs/cv-tailoring-policy.md`
5. `docs/cv-engine-architecture.md`
6. `docs/configuration.md`
7. `docs/build-roadmap.md`

If the task touches product behavior, also read:

- `docs/product-operating-plan.md`
- `docs/end-to-end-user-flow.md`

If the task touches hard gates, ordering, matching, or ranking, also read:

- `docs/research-math-and-oss.md`

If the task touches job discovery or source adapters, also read:

- `docs/discovery-inspiration-and-build-decision.md`
- `docs/prebuilt-providers-and-libraries.md`

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

Do not build complex matching, ranking, or search infrastructure for work an agent can do better by reading the CV, JD, preferences, and feedback. The agent may update user config, target-role profiles, source approvals, proof bank entries, and reusable answers. The agent must not patch source code or hand-edit final CV artifacts for one application.

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
pnpm check
pnpm uat
pnpm browser-uat
pnpm browser-live-preflight
pnpm first-build
```

`pnpm check` runs typecheck and tests.

`pnpm uat` runs the local product gate, including CV completeness, truth reconciliation, browser-plan dry-runs, dashboard, and chat summary checks.

`pnpm browser-uat` runs the optional safe local browser proof when the browser tool is installed. It opens a fake application form under the user store, fills planned fields, uploads the generated DOCX, and pauses before submit.

`pnpm browser-live-preflight` opens one real application page from a generated browser plan, snapshots visible fields and page text, runs ApplyCue preflight, writes a report, writes chat-ready answer prompts, writes a local answer review page, and stops before filling or uploading anything.

`pnpm browser-live-apply` runs only after a current passing live preflight for the same prepared browser plan. By default it creates a review-mode execution copy, fills planned fields, uploads the generated DOCX, writes a receipt/report, refreshes progress, and pauses before final submit. It refuses missing, stale, paused, failed, or mismatched live preflight evidence. Use `--allow-submit` only when the plan itself allows submit and the user policy explicitly allows it.

When a live apply run is explicitly allowed to submit and captures a submitted receipt, ApplyCue records the `submitted` outcome in the user store automatically and refreshes the dashboard/summary. Do not run `record-outcome` again for that same submission.

`pnpm first-build` runs the current configured batch:

- external user profile if present
- dev local config if present
- sample fixture otherwise

For real user runs, output goes to the user store, not repo `outputs/`.

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

When a run is short, the engine may perform transient public job-board expansion from the generated source plan. This can include rerunning already-approved public JobSpy/remote-board queries with a wider result count or lookback. It must not edit the user's source config or generated source-plan file. Treat it as "scan more before relaxing preferences," not as permission to fill the batch with blocked seniority, location, or wrong-family roles.

Every batch now writes `funnelHealth` into the run manifest, dashboard, and chat summary. Agents must read it before changing search or match settings. It reports:

- daily target vs prepared applications
- discovered and kept job counts
- dominant source filters
- dominant preference hard gates
- suggested next actions

If the count is low, follow the suggested path. For example: scan or approve more sources, ask about a reusable seniority/company-title exception, or ask before widening work mode/location/employment type. Do not fill volume by weakening hard blockers silently.

If the count is huge or source quality is noisy, tighten title/source filters before increasing automation. Do not add more broad scrapers just because the system can fetch many rows.

To approve generated suggestions, use:

```powershell
pnpm approve-sources -- --dry-run --ids <suggestion-id>
pnpm approve-sources -- --ids <suggestion-id>
```

This reads the generated plan and writes accepted sources into the editable profile config. It must not modify the generated source-plan file.

### Hard Gates And Shortlisting

Use:

```text
packages/ranker
docs/research-math-and-oss.md
```

Hard gates first. Agent judgment handles fuzzy role fit. Backend ordering signals are routing hints, not user-facing judgment and not a claim that the system knows the user's real chances.

Wrong role family, current company, explicit blocked company, impossible work authorization, blocked location/work mode, and clear junior/intern mismatch are hard blockers. Ambiguous seniority, role shape, domain fit, and company-level differences should be routed to agent review or reusable user config, not solved with new math.

Company title levels can be adjusted only through reusable evidence: `companyMarketGrade`, `companyStage`, normalized seniority evidence, or `preferences.companySeniorityOverrides`. Do not hardcode one company name in ranker logic.

Senior title variants may match when both pieces are true: the title has an accepted seniority signal such as VP, Vice President, Director, or Chief, and the title also has the target role anchor such as product. Do not let unrelated senior titles such as VP Sales pass for a product-leadership search.

Do not add embeddings, cross-encoders, learning-to-rank, or broad search-engine features unless a later product decision proves they help the agent get the user interviews better than agent evaluation plus simple guardrails.

### CV Tailoring

Use:

```text
packages/cv-tailor
docs/cv-tailoring-policy.md
docs/cv-engine-architecture.md
```

The agent must call the engine. It must not hand-edit generated CVs.

The CV engine maps JD requirements to approved facts and proof items before rendering. Direct support can shape the generated CV. Adjacent support becomes `needs_confirmation` for required requirements and pauses that candidate until the user confirms it. Unsupported requirements block the CV for that job.

Do not bypass this by editing Markdown/DOCX output. If a user wants to claim a new role, industry, skill, location, metric, or career pivot, record it as an approved fact or target base CV update first, then regenerate.

### Application Drafts And Browser Submit

Use:

```text
packages/apply-assistant
apps/browser-agent
docs/end-to-end-user-flow.md
```

Never submit when reconciliation, source trust, or user policy fails.

For a safe local browser proof, use:

```powershell
pnpm browser-uat
```

This command creates a local fake application form under the active user store, opens it through the Playwright adapter when Playwright is installed, fills planned fields, uploads the generated DOCX, and pauses before submit. If the browser tool is missing, it writes a skipped report instead of breaking normal UAT. `setup-applycue` should install or verify this optional tool for the agent; the user should not be asked to install it manually.

Before filling a real portal form, use:

```powershell
pnpm browser-live-preflight
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
pnpm approve-answers -- --dry-run --field notice_period --value "30 days" --alias "What is your notice period?"
pnpm approve-answers -- --field notice_period --value "30 days" --alias "What is your notice period?"
```

For multiple live-preflight answers, prefer approving values directly from the latest live template:

```powershell
pnpm approve-answers -- --from-live --set notice_period="30 days" --set expected_salary="INR 7500000" --dry-run
pnpm approve-answers -- --from-live --set notice_period="30 days" --set expected_salary="INR 7500000"
```

Only include `--set field=value` pairs the user explicitly approved for reuse. This reads the generated live template for aliases and source refs without hand-editing generated JSON.

Use the generated approval template as a fallback when the answer set is too large for a single command:

```powershell
pnpm approve-answers -- --from-file "~/.applycue/profiles/default/outputs/live-preflight/live-answer-approval-template.json" --dry-run
pnpm approve-answers -- --from-file "~/.applycue/profiles/default/outputs/live-preflight/live-answer-approval-template.json"
```

Only fill values and set `approveForReuse: true` after explicit user approval. One-off answers in the template are for form review only and must not be saved as reusable answers.

This writes approved answers into editable user config. It must not edit generated preflight reports, generated browser plans, or source code. Use `--replace` only when the user explicitly changes an existing approved answer.

After live preflight returns `PASS`, continue with:

```powershell
pnpm browser-live-apply
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
pnpm record-outcome -- --application <application-id> --type reply --note "Recruiter replied"
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
- Run `pnpm check`.
- Run `pnpm first-build` when changing the local pipeline.
- Keep generated outputs reproducible from config, assets, jobs, and code.
- Keep backend ordering signals hidden unless explicitly asked.
- Treat unknown portals and unsupported CV claims as pause conditions.

## Do Not

- Do not hardcode a user's CV, profile image, contact details, jobs, or generated outputs in source code.
- Do not commit real user config or assets.
- Do not store real user assets under `C:\Projects\applycue`.
- Do not hand-edit a generated CV for one job.
- Do not patch source code for one application.
- Do not invent claims, dates, employers, education, metrics, or credentials.
- Do not add a new CV template for one user/job.
- Do not bypass reconciliation to make a CV look better.
- Do not submit applications outside configured policy.
- Do not edit env files or secrets without explicit permission.
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
pnpm check
pnpm first-build
```

If a choice affects user data, storage, truth, or submission policy, prefer a small documented contract change over an ad hoc shortcut.
