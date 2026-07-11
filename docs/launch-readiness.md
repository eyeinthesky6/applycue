# Launch Readiness

Date: 2026-07-10

Status: current release and claim gate.

`product-roadmap.md` defines what MVP/0.1 means. This file provides the executable evidence gate for that version.

## Current Launch Shape

ApplyCue's current launch candidate is a local-first, agent-operated product. A specific commit is launch-ready only after every gate in this document passes.

The first distribution path is:

```text
GitHub repo link
  -> user gives link to Codex, Claude, OpenCode, Qwen, Grok, or another local coding agent
  -> agent clones or opens the repo
  -> agent runs setup/check/UAT
  -> user assets stay under ~/.applycue
  -> agent runs the CV-to-offer workflow from chat
```

This is not a SaaS launch and not an npm-package launch yet.

## Why This Distribution First

The product depends on an agent operating local files, browser sessions, generated CVs, and approval gates. A normal user should not edit JSON, run commands, or understand the repo layout. The safest current launch is therefore a public repo plus clear agent instructions.

The current user-facing promise is:

```text
Give the agent this repo link and your CV. The agent sets up ApplyCue locally, searches jobs, prepares truthful role-specific CVs, creates application routes, and pauses before sensitive actions.
```

Setup accepts the user's original DOCX, text-based PDF, Markdown, or text CV. ApplyCue code extracts the source text and retains the original asset; Codex/Claude must not recreate the CV.

## Launch Channels

| Channel | Status | Purpose |
| --- | --- | --- |
| Public GitHub repo | current | Main distribution for early users and agent operators. |
| Canonical skill at `skills/applycue/SKILL.md` | current | Main product interface for agents. |
| CLI bridge files under `.agents`, `.claude`, `.opencode`, `.qwen`, `.grok`, `.kimi`, `.antigravitycli` | current | Help common agents find the canonical skill. |
| Local user store under `~/.applycue` | current | Keeps user CVs, config, generated CVs, receipts, and outcomes out of the repo. |
| npm package or scaffolder | later | Only after a real package/install flow exists. |
| Hosted SaaS | later | Only after local usage proves setup, matching, CV, and apply flows. |
| Browser/social/email connectors owned by ApplyCue | later | Native agent connectors and browser control are enough for the first launch. |
| Agent-host capability handshake | MVP gate | Discover what the current host exposes, ask for narrow access, and fall back cleanly when access is missing or declined. |

## Current Launch Gate

Before saying a commit is launch-ready, run:

```powershell
pnpm applycue:check
pnpm applycue:source-canary -- --include-jobspy
pnpm applycue:uat -- --more-results --target-ranking-queue 200
pnpm applycue:browser-uat -- --more-results --target-ranking-queue 200
# review only unresolved ambiguous rows when the clear shortlist does not fill the target, then:
pnpm applycue:record-decisions -- --input <reviewed-decisions.json> --prepare
pnpm applycue:status
```

The gate passes when:

- typecheck and tests pass
- UAT writes dashboard, summary, manifest, CVs, routes, browser dry-run receipts, and the ranked decision queue
- setup imports real DOCX and text-based PDF fixtures through code, retains the original file, and refuses empty/image-only PDF text without an explicit future OCR path
- Browser UAT opens a safe local form, fills fields, uploads the generated DOCX, and pauses before submit
- UAT/test drafts are labelled as test-only, status does not present them as agent-approved, and UAT/browser UAT leave the normal run manifest and decision authority unchanged
- normal preparation produces the final shortlist up to the configured target and status reports `READY` from `system_clear`, `hybrid_system_external`, or `recorded_external` authority
- a clean checkout using the documented Node 24 and pnpm 11.7.0 baseline can install, run checks, and reach status without relying on machine residue
- a two-profile isolation fixture proves config, decisions, artifacts, receipts, and outcomes do not cross profiles
- a consented representative real-portal flow has current preflight plus fill/upload/pause evidence; local fake-form UAT alone is not universal portal proof
- one supported agent host has consented evidence for connector discovery, host-owned OAuth, narrow Gmail or Outlook read/search, import through the existing email scanner, and disconnect or revocation
- one preferred logged-in job site has consented evidence for user-owned login, the exact allowed search/inspection actions, safe pause, and no credential storage
- the same fixture still produces a useful public-source shortlist when email and browser access are unavailable or declined
- no user data is committed
- `SECURITY.md` names a verified durable private vulnerability-reporting path

For a real multi-candidate operating day, also follow [Live usage runbook](live-usage-runbook.md). The live runbook is the source of truth for using one local install across multiple people without mixing profiles or generated artifacts.

## What Must Be In The Launch Story

Keep the launch message simple:

- ApplyCue is a CV-to-offer agent workflow, not a job board.
- The user chats with an agent; the agent runs commands.
- The repo contains code, docs, tests, skills, and templates.
- User assets live outside the repo under `~/.applycue`.
- First run is review-first and does not auto-submit.
- Wider search is explicit, for example `--more-results --target-ranking-queue 200`.
- Email and browser account access are user-approved and agent-managed.
- Connector claims name the exact host, connector, site, and actions that were tested; no universal job-site connector is claimed.

## What We Are Not Launching Yet

Do not claim these in v0.1:

- one-click install for non-technical users
- npm package install
- hosted SaaS dashboard
- managed browser workers
- direct LinkedIn/Naukri/Indeed submit integrations
- fully autonomous submit without user policy and preflight
- multiple CV designs
- network/referral intelligence
- paid connector service

## Release Tooling Decision

`release-please` is configured for GitHub releases and version files only.

The root package remains private because the current product is not published as a root npm package. The previous npm scaffolder publish path is disabled until `scaffolder/package.json`, installer behavior, tests, and docs exist.

When npm distribution becomes real, add:

- a real `scaffolder/package.json`
- a tested `bin` command
- installer docs for agents
- release workflow npm publish step with `NPM_TOKEN`
- smoke test that a clean machine can install and run `applycue:setup`

## Privacy Guard

Launch readiness depends on keeping user data out of the repo.

The repo ignores and CI blocks current in-repo user-data escape paths, including:

- `.applycue/`
- `assets/`
- `config/applycue.local.json`

Real user files belong under:

```text
~/.applycue/profiles/<profile>/
```

## Launch Backlog

These are useful after the MVP release gate and are tracked in `product-roadmap.md`:

1. Build the thin standalone V1 `applycue` CLI and installer.
2. Add a short demo video showing agent setup through first UAT.
3. Add a small hosted landing page that says "drop this repo link into your agent" and points to the same canonical repository/skill instructions rather than duplicating them.
4. Add a clean sample profile that uses fake data only.
5. Add a release checklist issue template.
6. Add connector-specific skills only when the permission model is clear.

## Current Decision

Launch from GitHub with the agent skill after the current launch gate passes.

Do not spend launch time on SaaS, desktop app, or npm packaging until early users prove the local agent workflow is valuable and repeatable.
