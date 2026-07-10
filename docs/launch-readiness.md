# Launch Readiness

Date: 2026-07-10

## Current Launch Shape

ApplyCue is ready to launch as a local-first, agent-operated product.

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

## Current Launch Gate

Before saying a commit is launch-ready, run:

```powershell
pnpm applycue:check
pnpm applycue:uat -- --more-results --target-ranking-queue 200
pnpm applycue:browser-uat -- --more-results --target-ranking-queue 200
pnpm applycue:status
```

The gate passes when:

- typecheck and tests pass
- UAT writes dashboard, summary, manifest, CVs, routes, browser dry-run receipts, and the ranked decision queue
- Browser UAT opens a safe local form, fills fields, uploads the generated DOCX, and pauses before submit
- status reports `READY`
- no user data is committed

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

The repo ignores and CI blocks common user paths, including:

- `.applycue/`
- `assets/`
- `data/`
- `reports/`
- `output/`
- `jds/`
- `writing-samples/`
- local CV/profile files

Real user files belong under:

```text
~/.applycue/profiles/<profile>/
```

## Launch Backlog

These are useful but not blockers for the current launch:

1. Build a real npm scaffolder package.
2. Add a short demo video showing agent setup through first UAT.
3. Add a hosted landing page that says "drop this repo link into your agent."
4. Add a clean sample profile that uses fake data only.
5. Add a release checklist issue template.
6. Add connector-specific skills only when the permission model is clear.

## Current Decision

Launch from GitHub with the agent skill.

Do not spend launch time on SaaS, desktop app, or npm packaging until early users prove the local agent workflow is valuable and repeatable.
