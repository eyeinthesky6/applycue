# Agent-First Installation And Usage

Date: 2026-07-06

## Decision

ApplyCue is used through chat.

The user should not manually install JobSpy, edit JSON, run `pnpm`, create Python virtual environments, or understand the repo.

The normal user flow is:

```text
install/open ApplyCue skill or app -> chat with agent -> upload CV -> answer setup questions -> agent runs setup -> agent runs batches -> user reviews exceptions and outcomes
```

The repo, CLI, local tools, source adapters, and config files are implementation details for the agent.

## External Pattern

Current agent products point in the same direction:

- Claude Skills package instructions, scripts, and resources so Claude can use them from chat.
- Claude Desktop Extensions package local MCP servers for one-click install and user-friendly configuration.
- ChatGPT Apps use MCP tools behind a chat interface, with optional in-chat UI components.

ApplyCue should follow that pattern:

```text
skill/app instructions
  -> setup action
  -> local engine tools
  -> user-owned config/assets
  -> chat summaries and approvals
```

Do not make the user become a developer to use the product.

## User-Facing Flow

### 1. Discovery

The user sees a simple offer:

```text
ApplyCue: your CV-to-offer agent.
Chat with the agent, upload your CV, set your target roles, and let it find, tailor, apply, track, and improve.
```

Distribution surfaces:

- Claude Skill
- Codex/OpenAI skill or plugin
- ChatGPT App later
- one-click local extension package later
- concierge link for early beta users

GitHub and npm are developer distribution channels, not the primary user path.

### 2. Install Or Open

Target install options:

- `Install Skill` in the agent product.
- `Open ApplyCue in ChatGPT/Claude/Codex`.
- Paste a setup link into chat for early beta.

The user should see one action, not a command list.

### 3. Agent Setup

The agent does the setup work:

- checks the current ApplyCue state with the read-only status command
- checks whether ApplyCue tools are installed
- installs missing local tools into `~/.applycue/tools/`
- creates the user profile store under `~/.applycue/profiles/<profile>/`
- imports the CV into `assets/base-cvs/`
- creates or updates `applycue.json`
- generates the source plan
- asks only blocking questions
- records pending non-blocking questions
- runs the first safe batch in review mode

The user does:

- upload CV
- say target roles and locations
- approve sensitive facts or major repositioning
- choose mode and application count
- connect browser/accounts only when needed

### 4. First Run

The first run should be safe:

```text
I found 46 roles.
I would apply to 8 first.
I generated 3 CVs.
2 need your answer before applying.
No applications were submitted yet.
```

The user can then say:

```text
Apply to 5 today.
Use review mode for the first batch.
Skip onsite outside India.
Do not apply to my past employers.
```

### 5. Daily Use

The user keeps chatting:

```text
Run today's batch.
Show me what changed.
Why did you skip this one?
Apply to the top 10.
What replies came in?
Prepare me for this interview.
```

The agent calls ApplyCue commands and browser tools. The user gets decisions, exceptions, receipts, and outcomes.

## What The Skill Must Do

The skill is the main product surface for v1.

It must expose actions in user language:

- `set up ApplyCue`
- `import my CV`
- `configure my goals`
- `find jobs`
- `prepare today's batch`
- `review exceptions`
- `apply approved jobs`
- `check replies`
- `update outcomes`
- `prepare interview`

Each action calls code. The skill must not contain business logic that forks the product.

The skill should also include a simple mode router, similar to Career OS's useful command-router pattern but ApplyCue-owned and chat-first:

| User intent | Skill mode |
| --- | --- |
| set up, import CV, start ApplyCue | `setup` |
| what next, status, where are we | `status` |
| find jobs, run today, prepare batch | `batch` |
| pasted JD, job URL, apply to this role | `single-role` |
| apply approved jobs, submit | `apply` |
| answer form questions, save reusable answer | `answers` |
| add or approve sources | `sources` |
| got reply/interview/rejection/offer | `outcomes` |
| show dashboard, show CVs, show output | `dashboard` |
| test it, is it ready | `uat` |

Every mode should still start from the read-only status checkpoint unless the task is documentation or product development. The user sees plain decisions and questions; the agent uses the command center and repo commands behind the scenes.

## Agent CLI Skill Bridges

Status: implemented on 2026-07-07.

ApplyCue keeps one canonical skill router:

```text
skills/applycue/SKILL.md
```

Compatibility bridge files expose that same router to common agent CLI layouts:

```text
.agents/skills/applycue/SKILL.md
.claude/skills/applycue/SKILL.md
.opencode/skills/applycue/SKILL.md
.qwen/skills/applycue/SKILL.md
.antigravitycli/skills/applycue/SKILL.md
.grok/skills/applycue/SKILL.md
```

The bridge files must stay thin. They only tell the agent to read the canonical skill. Do not put separate setup rules, scoring rules, CV rules, or browser rules in those bridge files, because that would create drift.

Root wrappers such as `CLAUDE.md`, `CODEX.md`, and `OPENCODE.md` import `AGENTS.md` and point agents to the same canonical skill. This follows Career OS's useful multi-agent discoverability pattern without copying Career OS's product logic or creating multiple ApplyCue routers.

## Setup Tooling

Build an agent-run setup command:

```text
applycue setup
```

For repo development this can be:

```powershell
pnpm setup-applycue
```

But that command is for the agent, not the user.

Setup should:

- verify Node and package dependencies
- verify Python only if JobSpy is enabled
- create a user-local JobSpy venv when needed
- install `python-jobspy` into that venv
- create required user-store folders
- approve only safe no-login generated sources such as JobSpy and Remotive
- run the first review batch
- validate config
- report missing credentials or connectors in plain language
- never write secrets into config

## UAT Command

The agent should use one command to prove the local loop is ready for user testing:

```powershell
pnpm uat
```

This command:

- runs setup
- runs discovery and batch preparation
- checks that jobs, CVs, application drafts, dashboard, and manifest were produced
- checks that closed jobs do not receive generated CVs, application drafts, or browser plans
- supports injected liveness/page verification without requiring live network checks in every UAT run
- checks that every prepared application has a browser apply plan
- checks browser apply preflight before fill/upload/submit actions
- dry-runs every browser apply plan against a local form contract
- writes browser dry-run receipts under `outputs/browser-receipts/`
- refreshes the dashboard so each prepared application shows its receipt path and status
- writes a chat-ready summary to `outputs/runs/latest-summary.md`
- checks reconciliation truth gates
- checks rendered CV completeness so job-specific CVs remain full CVs, not extracts
- checks `sourceCodeWriteCount`
- writes:

```text
~/.applycue/profiles/<profile>/outputs/runs/uat-report.json
~/.applycue/profiles/<profile>/outputs/runs/uat-report.md
~/.applycue/profiles/<profile>/outputs/runs/latest-summary.md
```

`PASS` means the loop is ready for user review.

`WARN` means the loop is usable but has a concrete UAT finding, such as low batch volume.

`FAIL` means the agent should fix the blocker before asking the user to test.

For normal user handoff, the agent should start from `latest-summary.md`. It is shorter than the dashboard and already includes prepared jobs, CV paths, browser plans, receipts, skipped/watch items, and next actions.

For review-mode runs, browser dry-run receipts should normally be `paused`, not `submitted`. That proves the agent can fill known fields and upload the generated DOCX, while still stopping before final submit for user approval.

## Status Command

The agent should start every ApplyCue session with:

```powershell
pnpm status
```

This is a read-only checkpoint for the agent. It reports:

- whether profile config, user identity, target roles, and base CV are present
- whether the latest run manifest, dashboard, chat summary, and UAT report exist
- latest UAT status
- latest run counts
- source quality, scan history, and source learning signals when present
- live preflight answer prompt count and the first questions to ask when a real form pauses
- an Agent command center with the exact next repo commands for the agent
- the next safe action

If live preflight has paused or failed, the next safe action must point to the live-form issue first. Do not tell the user the app is ready to fill or submit until those prompts, pause reasons, or failures are resolved.

If a later batch no longer prepares the same job or browser plan, the old live preflight report is stale. Show it only as past evidence. Do not ask those old form questions, do not use them as the next action, and do not block the current prepared queue with them. Rerun live preflight for one of the current prepared browser plans before filling a real portal.

If live preflight passes for the current prepared browser plan, the next safe action is `pnpm browser-live-apply`. The agent runs it from chat. By default it fills known fields, uploads the generated DOCX, writes a receipt, refreshes progress, and pauses before final submit. The user should hear the plain result, not the command.

Use the Agent command center like Career OS's useful router pattern, but keep it agent-only. The user should hear the outcome in chat, not be asked to run those commands.

When live answer prompts exist, use the `Copy This To Chat` section from `outputs/live-preflight/live-answer-prompts.md` as the user-facing message. It should name the company, role, and page before asking questions. After the user answers, save only explicitly approved reusable values with `pnpm approve-answers -- --from-live --set field=value --dry-run`, then rerun without `--dry-run`. Use the detailed prompt records to choose field names and inspect one-off fields. The JSON approval template is fallback evidence, not the normal editing path.

Use it like Career OS's useful doctor/tracker habit, but keep it ApplyCue-owned and chat-first. The user should hear the plain outcome, not the command.

## Browser Preflight Command

Before filling a real application form, the agent should inspect the browser page and save a small snapshot under the user store:

```text
~/.applycue/profiles/<profile>/data/local/browser-snapshots/
```

Snapshot shape:

```json
{
  "finalUrl": "https://company.example/apply/123",
  "title": "Head of Product - Example",
  "pageText": "Visible page text...",
  "visibleCompany": "Example",
  "visibleRole": "Head of Product",
  "applyControls": ["Submit application"],
  "fields": [
    { "name": "name", "label": "Full name", "type": "text", "required": true },
    { "name": "resume_or_cv", "label": "Resume", "type": "file", "required": true }
  ]
}
```

Then run:

```powershell
pnpm browser-preflight -- --plan <browser-plan.json> --snapshot <page-snapshot.json>
```

This command does not fill or submit the form. It only checks the real page against the generated browser plan. Continue to browser fill only when it returns `PASS`. Pause if it reports a closed posting, company/role mismatch, sensitive required field, unclear liveness, or a required field ApplyCue cannot answer.

Role matching should use the strongest page evidence available. A noisy secondary role label from a related-jobs widget should not override a matching browser title or top-of-page job heading. If the title/body point to a different role, pause before filling.

## Packaging Direction

### Personal MVP

Use:

```text
ApplyCue skill + local repo + agent-run setup
```

This is acceptable for the founder/user while building.

### Early Non-Developer Beta

Use:

```text
ApplyCue skill zip + packaged local helper
```

or

```text
one-click local extension package
```

The agent should still own setup.

### Later Product

Use:

```text
ChatGPT/Claude app + hosted or local connector + browser worker
```

The user should not see repo internals.

## UAT Standard

ApplyCue is usable only when this works from chat:

```text
User: Set up ApplyCue with this CV. Target VP Product roles in India and remote.
Agent: sets up tools, creates profile, scans sources, creates batch, shows dashboard.
User: Apply to 5 in review mode.
Agent: prepares CVs and forms, pauses on exceptions, asks for approval, captures receipts.
User: Check replies.
Agent: updates statuses and drafts responses.
```

The UAT should fail if the user has to manually install a scraper, edit config, run build commands, or understand the repo.

## Non-Goals

- Do not make the user run `pnpm`.
- Do not make the user install JobSpy manually.
- Do not make the user edit JSON.
- Do not make the user approve every internal source-plan artifact.
- Do not expose raw scores as the product.
- Do not ask the user to manage Python, Node, or local files.
