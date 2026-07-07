# ApplyCue

ApplyCue is a CV-to-offer agent. It helps a user discover opportunities, rank them by fit, create truthful role-specific CVs, apply in batches under user-defined rules, track replies, prepare interviews, and move toward offers.

This repo is the clean ApplyCue foundation. It is not a fork, wrapper, or hosted version of another job-search tool.

## Product Shape

ApplyCue should answer:

```text
What should the agent apply to today?
Why did this role pass or fail?
Which CV was generated?
What was submitted automatically?
What needs review?
What replies need action?
How many applications per day should it run?
How wide should the match be if there are not enough roles?
```

The user sees decisions and reasons. Raw scores stay in the backend for ordering, audit, and learning.

## Intended User Experience

ApplyCue is used from chat.

The user should not install JobSpy, edit JSON, run `pnpm`, create Python virtual environments, or understand the repo. The user opens or installs the ApplyCue skill/app, uploads a CV, answers setup questions, and asks the agent to run batches.

Target first interaction:

```text
User: Set up ApplyCue with this CV. Target VP Product roles in India and remote.
Agent: sets up local tools, creates the private profile store, imports the CV, configures sources, runs a review batch, and shows what it would apply to.
```

The repo commands below are for the agent, developer, or packaged setup flow. They are not the normal user interface.

Key docs:

- `docs/agent-development-guide.md`
- `docs/agent-first-installation-and-usage.md`
- `docs/product-shape.md`
- `docs/end-to-end-user-flow.md`
- `docs/product-operating-plan.md`
- `docs/setup-questionnaire.md`
- `docs/user-asset-storage.md`
- `docs/base-cv-versioning.md`
- `docs/local-usable-state.md`
- `docs/build-roadmap.md`
- `docs/cv-tailoring-policy.md`
- `docs/cv-engine-architecture.md`
- `docs/job-hunter-pain-points.md`
- `docs/progress-referrals-community.md`
- `docs/configuration.md`

## Current Status

Local UAT loop:

- profile store outside the repo
- generated source plan and safe source approval
- JobSpy and public no-key job-board adapters
- source-quality filtering before ranking
- scan history under the user store so daily/push runs avoid already prepared or closed roles and flag possible reposts
- closed-job safety gate before CV/application/browser preparation
- injectable liveness verifier hook for browser/page checks without live network defaults
- truthful `standard_ats_v1` CV generation with Markdown, HTML, and DOCX artifacts
- rendered CV completeness gate so generated CVs remain full CVs, not extracts
- application drafts and browser apply plans
- local browser-plan dry-run receipts
- optional safe local browser UAT with `pnpm browser-uat`
- safe live portal preflight with `pnpm browser-live-preflight`
- controlled live portal fill/upload/pause with `pnpm browser-live-apply`
- setup verifies local helper tools, including JobSpy and optional browser UAT tooling
- dashboard at `outputs/dashboard/latest.html`
- chat-ready run summary at `outputs/runs/latest-summary.md`
- UAT report at `outputs/runs/uat-report.md`

## Developer And Agent Commands

```powershell
pnpm install
pnpm typecheck
pnpm test
pnpm status
pnpm browser-uat
pnpm browser-live-preflight
pnpm browser-live-apply
pnpm browser-preflight -- --plan <browser-plan.json> --snapshot <page-snapshot.json>
pnpm first-build
```

`pnpm first-build` looks for a user profile outside the repo first:

```text
~/.applycue/profiles/default/applycue.json
```

That config points to user assets such as CVs, profile images, and local job imports. If no external profile exists, the command falls back to the development-only `config/applycue.local.json`, then to the built-in sample fixture.

For real user runs, generated CVs, reconciliation reports, dashboards, and local state are written under the same external profile store. Repo-local `outputs/` is only for sample/development fallback runs.

`pnpm status` is a read-only agent checkpoint. It tells the agent whether setup, latest run output, UAT, dashboard, and summary are ready before continuing from chat.

## Structure

```text
apps/
  web/                  local or hosted UI
  worker/               scheduled discovery and ranking
  browser-agent/        controlled application assistant

packages/
  core/                 shared types and contracts
  profile/              CV, preferences, proof bank
  discovery/            source adapters
  normalizer/           job schema and dedupe
  ranker/               deterministic gates and scoring
  cv-tailor/            CV variant generation
  apply-assistant/      form filling and answer drafting
  engine/               sample run orchestration and output writer
  tracker/              application state, outcome state, and local progress HTML

skills/
  applycue/             agent skill entrypoint

.agents/
.claude/
.opencode/
.qwen/
.antigravitycli/
.grok/                  thin skill bridges for agent CLI discovery

config/
  applycue.example.json agent-editable setup shape
```

## Product Guardrails

- No fake CV claims.
- No applying outside configured user rules.
- No unsupported claims.
- No pretending manual copy-paste is the core workflow.
- No visible score obsession.
- No dependency on another product's codebase as the ApplyCue engine.
