# Agent-First Installation And Usage

Date: 2026-07-10

Status: current user-flow and distribution reference. Feature-specific current/later labels in this document remain controlling for those sections.

## Decision

ApplyCue is used through chat.

The user should not manually install JobSpy, edit JSON, run `pnpm`, create Python virtual environments, or understand the repo.

The normal user flow is:

```text
give repo link to agent -> chat with agent -> upload CV -> answer setup questions -> agent runs setup -> agent runs batches -> user reviews exceptions and outcomes
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

- current early beta: GitHub repo link pasted into Codex, Claude, OpenCode, Qwen, Grok, Kimi, Antigravity, or another local coding agent
- current agent entrypoint: canonical skill at `skills/applycue/SKILL.md`
- later: packaged Claude Skill
- later: Codex/OpenAI skill or plugin
- later: ChatGPT App
- later: one-click local extension package
- optional: concierge setup for early beta users

GitHub and npm are developer distribution channels, not the primary user path.

### 2. Install Or Open

Target install options:

- current: paste the ApplyCue GitHub repo link into the agent chat and ask the agent to set it up locally.
- later: `Install Skill` in the agent product.
- later: `Open ApplyCue in ChatGPT/Claude/Codex`.

The user should see one action, not a command list.

For the current beta, the shareable entrypoint is `https://github.com/eyeinthesky6/applycue`. The user can paste that link into Codex or Claude with their CV and ask the agent to set up and run ApplyCue. A later landing page should explain the promise and hand the same repository/skill entrypoint to the chosen agent; it must not create a second copy of the workflow instructions.

### 3. Agent Setup

The agent does the setup work:

- checks the current ApplyCue state with the read-only status command
- checks whether ApplyCue tools are installed
- installs missing local tools into `~/.applycue/tools/`
- creates the user profile store under `~/.applycue/profiles/<profile>/`
- imports the CV into `assets/base-cvs/`
- creates or updates `applycue.json`
- generates the source plan
- inspects the current host's connector and browser capabilities before asking the user to connect anything
- asks only blocking questions
- records pending non-blocking questions
- runs the first safe batch in review mode

The user does:

- upload CV
- say target roles and locations
- approve sensitive facts or major repositioning
- choose mode and application count
- connect browser/accounts only when needed

The current setup transport reuses the existing ApplyCue config contract. After collecting approved answers, the agent writes a temporary JSON packet and runs:

```powershell
pnpm applycue:setup -- --input <approved-setup.json> --base-cv <candidate-cv.docx-or-pdf-or-text>
```

The packet is not a second profile format. It uses the same top-level `profile`, `preferences`, `searchSettings`, `applySettings`, and related fields documented in `configuration.md`. Setup merges those fields, copies the original CV into the profile store, extracts readable text in code from DOCX/PDF/text input, and refuses to claim a first run when identity/contact, base CV, or target roles are still missing.

Connection is host-owned: the agent explains the narrow purpose and fallback, the user approves, and Codex/Claude performs its normal app/MCP/OAuth flow. For job sites, ask which one or two sites the user already prefers and let the user log in directly in the real browser. ApplyCue stores approved source intent and imported evidence, not credentials. See `docs/connector-capability-policy.md`.

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

The skill should also include a simple mode router, similar to the base workflow's useful command-router pattern but ApplyCue-owned and chat-first:

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

## Scope Control

The agent should act like an operator with a current work order, not like an open-ended explorer.

For each user request, the agent should map the request to one mode, run only actions that belong to that mode, and report the next step if another mode is needed.

Examples:

- `Run today's batch` can search, filter, generate CVs, and prepare application packets. It must not submit applications.
- `Apply to 5 today` can execute generated apply routes for selected prepared jobs. It must not widen search or change matching rules.
- `More results` can widen search only after explaining which lever will change: source, title, industry, location, recency, or strictness.
- `Answer this form question` can save an approved reusable answer. It must not change CV claims or user preferences unless the user says so.

User approval is required before:

- widening geography, title scope, recency, source scope, seniority strictness, or application volume
- changing saved profile facts, base CV versions, proof bank, reusable form answers, sources, or apply policy
- submitting applications
- sending emails, DMs, recruiter messages, or referral messages
- connecting or using a logged-in browser/account for a new site
- editing product source files during normal product operation

When the agent is unsure whether an action is inside scope, it should ask one plain question in chat instead of continuing.

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
.kimi/skills/applycue/SKILL.md
```

The bridge files must stay thin. They only tell the agent to read the canonical skill. Do not put separate setup rules, scoring rules, CV rules, or browser rules in those bridge files, because that would create drift.

Root wrappers such as `CLAUDE.md`, `CODEX.md`, and `OPENCODE.md` import `AGENTS.md` and point agents to the same canonical skill. This follows the base workflow's useful multi-agent discoverability pattern without copying base workflow's product logic or creating multiple ApplyCue routers.

## Setup Tooling

The current repository exposes the agent-run setup command as:

```text
pnpm applycue:setup
```

A future standalone V1 installer may expose the thinner spelling:

```text
applycue setup
```

But that command is for the agent, not the user.

Current setup does the following:

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

Implemented setup acceptance behavior:

- `--input` accepts the existing ApplyCue config JSON shape;
- `--base-cv` imports the original DOCX, text-based PDF, Markdown, or plain-text file into `assets/base-cvs/`;
- Mammoth extracts raw DOCX text and PDF.js extracts PDF text; ApplyCue never embeds converted document HTML;
- an empty/image-only PDF reports the OCR gap instead of allowing an agent-authored substitute;
- incomplete setup returns `needs_profile` with exact missing fields and no empty first-run manifest;
- complete setup runs the bounded starter-source and first-batch path;
- generated job-specific Markdown, HTML, and DOCX files remain code-owned outputs of the truth/reconciliation pipeline.

### Current installation chain

| Stage | What is needed | Who handles it |
| --- | --- | --- |
| Discover | Repository URL and a Codex/Claude-compatible local agent | User supplies the link; agent reads repo instructions |
| Open/install | Git, Node 24, pnpm 11.7.0 | Agent checks them; system-level installation requires user approval |
| Product dependencies | TypeScript workspace, Mammoth, PDF.js, `docx`, Playwright Chromium | `pnpm install` |
| Candidate setup | Original CV plus approved identity/contact, target roles, locations, and policy | User answers in chat; agent runs `applycue:setup` |
| Broad board discovery | Optional Python 3.10-3.12 | Setup creates `~/.applycue/tools/jobspy-venv`; public no-key fallback works without it |
| Email/job accounts | Optional host connector or user-owned browser login | Connected only when immediately useful and explicitly approved |
| Daily workflow | Existing ApplyCue commands and canonical skill | Codex/Claude runs them; user sees chat summaries and approval questions |

The current repository URL is therefore shareable, but not yet a one-click consumer installer: the recipient needs a supported local agent and the machine prerequisites above. V1 replaces the source checkout/pnpm detail with a thin installer while keeping the same engine and skill.

## UAT Command

The agent should use one command to prove the local loop is ready for user testing:

```powershell
pnpm applycue:uat
```

This command:

- runs setup
- runs discovery and test-only backend-suggestion preparation to exercise the mechanics
- writes test artifacts under `outputs/uat/` so they cannot replace the normal preparation manifest, dashboard, summary, or authority
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
~/.applycue/profiles/<profile>/outputs/uat/outputs/runs/latest-summary.md
~/.applycue/profiles/<profile>/outputs/uat/outputs/runs/local-uat.json
```

`pnpm applycue:browser-uat` similarly creates any suggestion-mode preparation under `outputs/browser-uat/batch/` and writes the browser proof under `outputs/browser-uat/`. It must not overwrite `outputs/runs/local-first-build.json`.

`PASS` means the discovery, CV, route, browser-plan, and receipt mechanics passed. It does not make the UAT suggestion drafts agent-approved work.

`WARN` means the loop is usable but has a concrete UAT finding, such as low batch volume.

`FAIL` means the agent should fix the blocker before asking the user to test.

After UAT, normal status remains attached to the real run because UAT artifacts are isolated. Clear system matches prepare automatically. If status reports unresolved ambiguity or the shortlist needs correction, review only the relevant `review` rows in `latest-job-decisions.json`, write one decision batch, and run `pnpm applycue:record-decisions -- --input <reviewed-decisions.json> --prepare`.

For review-mode runs, browser dry-run receipts should normally be `paused`, not `submitted`. That proves the agent can fill known fields and upload the generated DOCX, while still stopping before final submit for user approval.

## Status Command

The agent should start every ApplyCue session with:

```powershell
pnpm applycue:status
```

This is a read-only checkpoint for the agent. It reports:

- whether profile config, user identity, target roles, and base CV are present
- whether the latest run manifest, dashboard, chat summary, and UAT report exist
- latest UAT status
- latest run counts
- whether the latest preparation authority is recorded external judgement or test-only backend suggestions
- source quality, scan history, and source learning signals when present
- live preflight answer prompt count and the first questions to ask when a real form pauses
- an Agent command center with the exact next repo commands for the agent
- the next safe action

If live preflight has paused or failed, the next safe action must point to the live-form issue first. Do not tell the user the app is ready to fill or submit until those prompts, pause reasons, or failures are resolved.

If a later batch no longer prepares the same job or browser plan, the old live preflight report is stale. Show it only as past evidence. Do not ask those old form questions, do not use them as the next action, and do not block the current prepared queue with them. Rerun live preflight for one of the current prepared browser plans before filling a real portal.

If live preflight passes for the current prepared browser plan, the next safe action is `pnpm applycue:browser-live-apply`. The agent runs it from chat. By default it fills known fields, uploads the generated DOCX, writes a receipt, refreshes progress, and pauses before final submit. The user should hear the plain result, not the command.

For application execution, start from the generated apply route instead of choosing a path by hand:

```powershell
pnpm applycue:apply-route -- --route-id <route-id>
```

The dispatcher writes an execution report. Browser routes first require confirmed master form data, then point to the required live preflight/apply commands. Email and DM routes write draft artifacts only; sending happens outside ApplyCue through native Codex, Claude, Hermes, or similar connected tools when available. Browser control is a fallback only when connector access is unavailable and the user approves that session. API routes pause unless a real local adapter executor exists. Manual-review routes write the blocker/questions. This keeps chat as the user surface while generated routes and receipts remain execution evidence; approved profile data and typed contracts remain the truth owners.

For inbox discovery, the user should not download or format anything. The agent searches Gmail/Outlook through a native connector when available, writes the raw connector result locally, then runs:

```powershell
pnpm applycue:scan-email-leads -- --input <raw-mail-export.json|jsonl> --import
pnpm applycue:first-build
```

This extracts real company/title/apply-link/JD evidence from email messages and feeds email jobs into the same dedupe, safety, CV, and apply-route pipeline as public jobs.

When the user asks for more volume, the agent can run:

```powershell
pnpm applycue:first-build -- --more-results --target-ranking-queue 200
```

Then review `outputs/runs/latest-job-decisions.json` before changing preferences. Do not explain this as "200 applications"; it is a ranked queue for review and batching.

Before any browser portal fill, refresh and show the reusable application-form values:

```powershell
pnpm applycue:form-data
```

Read `outputs/form-data/master-form-data.md` into chat. If the user approves the values, confirm them:

```powershell
pnpm applycue:form-data -- --confirm
```

Do not confirm the user's real form data silently. If a form later asks a new reusable question, save the approved answer with `approve-answers`, regenerate the form data, and confirm the new preview.

The user should not answer the same form question repeatedly. If a portal asks a new reusable field such as notice period, expected salary, work authorization, visa sponsorship, relocation, current title, current company, or total experience, ask once in chat and save the approved value into reusable application answers. Later browser plans should reuse that value through aliases even when the next portal phrases the question differently.

Use the Agent command center like the base workflow's useful router pattern, but keep it agent-only. The user should hear the outcome in chat, not be asked to run those commands.

When live answer prompts exist, use the `Copy This To Chat` section from `outputs/live-preflight/live-answer-prompts.md` as the user-facing message. It should name the company, role, and page before asking questions. After the user answers, save only explicitly approved reusable values with `pnpm applycue:approve-answers -- --from-live --set field=value --dry-run`, then rerun without `--dry-run`. Use the detailed prompt records to choose field names and inspect one-off fields. The JSON approval template is fallback evidence, not the normal editing path.

Use it like the base workflow's useful doctor/tracker habit, but keep it ApplyCue-owned and chat-first. The user should hear the plain outcome, not the command.

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
pnpm applycue:browser-preflight -- --plan <browser-plan.json> --snapshot <page-snapshot.json>
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
