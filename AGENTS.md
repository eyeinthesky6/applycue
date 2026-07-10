# ApplyCue Agent Instructions

ApplyCue is a CV-to-offer agent. The user should experience it through chat: the agent sets up the profile, finds roles, prepares truthful CVs, routes applications, tracks outcomes, and learns from feedback.

This file is the repo-level bootloader for agents. Keep it short. Product workflow rules live in the canonical skill, and development rules live in docs.

## Instruction Hierarchy

Use this order:

1. `AGENTS.md` tells the agent where to look.
2. `skills/applycue/SKILL.md` is the canonical user-facing ApplyCue workflow.
3. `docs/agent-development-guide.md` is the canonical guide for code changes.
4. `docs/launch-readiness.md` is the release and distribution gate for launch claims.
5. `docs/live-usage-runbook.md` is the operating guide for real multi-candidate sessions.
6. `docs/pivot-history.md` explains the independent branch, the career-ops fork branch, and why the current launch path changed.
7. Contract docs such as `docs/data-contracts.md`, `docs/configuration.md`, `docs/cv-tailoring-policy.md`, and `docs/agent-first-installation-and-usage.md` explain specific behavior.
8. CLI-specific files and skill bridges must stay thin and point back here or to the canonical skill.

Do not duplicate product rules across `AGENTS.md`, `CLAUDE.md`, `CODEX.md`, `OPENCODE.md`, or bridge skills. Duplication causes drift.

## Start Here

For normal ApplyCue product operation, read:

```text
skills/applycue/SKILL.md
```

Then start with:

```powershell
pnpm applycue:status
```

For repo development, read:

```text
docs/agent-development-guide.md
```

Then use repo-native checks:

```powershell
pnpm applycue:check
pnpm applycue:uat -- --skip-tools
```

For launch-readiness claims, also read:

```text
docs/launch-readiness.md
```

For real multi-candidate usage, also read:

```text
docs/live-usage-runbook.md
```

For branch/direction questions, also read:

```text
docs/pivot-history.md
```

## What Goes Where

Source repo:

```text
C:\Projects\applycue
```

Contains product code, docs, tests, example config, templates, and skills.

User store:

```text
%USERPROFILE%\.applycue\profiles\<profile>\
```

Contains real user config, CVs, assets, local state, generated CVs, dashboards, receipts, outcomes, and form data.

Do not put real user CVs, contact data, generated user outputs, browser receipts, or application history into source code.

## Core Rules

- Use the ApplyCue engine and generated artifacts. Do not hand-edit generated CVs, browser plans, source plans, dashboards, or apply routes for one job.
- User-specific facts, preferences, reusable form answers, sources, and tuning belong in the user store or approved config flows, not source code.
- For multiple real candidates, use one profile key per person. Keep `default` for the current operator unless the user explicitly changes it.
- Generated CVs must come from the base CV, approved profile facts, proof bank, approved application answers, and the JD. Reframe and emphasize, but do not invent facts.
- Application execution starts from generated apply routes. Browser routes require master form data confirmation, live preflight, then controlled fill/upload/submit under policy.
- Email and DM search/drafting/sending are agent-managed through native Codex, Claude, Hermes, or similar connected tools first. Browser control is a fallback only when native connector access is unavailable and the user approves it. ApplyCue may create drafts and attachment lists, but the app does not send them, and final send always needs explicit user confirmation.
- If a live form asks a reusable question, ask the user once, save the approved answer with `approve-answers`, regenerate/refresh, and reuse it through aliases.
- If search or shortlist quality is noisy, record tuning or update user config through product commands. Do not patch core code for one user's one-off preference.

## Scope Guard

Agents must stay inside the user's requested mode unless the user explicitly expands scope.

Ask before:

- widening search scope, source scope, recency, geography, title bands, or application count
- changing saved preferences, base CV facts, proof bank facts, reusable form answers, source approvals, or apply policy
- submitting applications or sending emails, DMs, or referral messages
- using a logged-in browser/account for a new site or connector
- editing source code, docs, skills, templates, or package config during normal product operation
- bypassing generated routes, plans, reconciliation, preflight, master form data, or truth gates

If a requested action exposes a different needed action, report it as the next step in chat instead of silently doing it.

## Instruction Surface Policy

Keep one canonical ApplyCue skill unless a split has a clear operational reason.

Good reasons to split later:

- a connector-specific skill, such as Gmail or LinkedIn, with its own permissions and safety rules
- a heavy workflow that agents need independently, such as interview prep or offer negotiation
- a skill file becoming too long for agents to reliably follow

Bad reasons to split:

- repeating the same setup rules for Claude, Codex, OpenCode, Qwen, Gemini, or other CLIs
- making a separate skill just because a workflow has a new mode
- putting user-specific preferences into global skill files

CLI bridges under `.agents`, `.claude`, `.opencode`, `.qwen`, `.antigravitycli`, `.grok`, and `.kimi` should only point to `skills/applycue/SKILL.md`.

Root `CLAUDE.md`, `CODEX.md`, `OPENCODE.md`, and similar files should only import `AGENTS.md` or point to the canonical skill. Do not add separate product rules there.

## Current Canonical Commands

Agent-facing commands include:

```powershell
pnpm applycue:status
pnpm applycue:setup
pnpm applycue:first-build
pnpm applycue:form-data
pnpm applycue:apply-route
pnpm applycue:browser-live-preflight
pnpm applycue:browser-live-apply
pnpm applycue:approve-answers
pnpm applycue:record-outcome
pnpm applycue:record-tuning
pnpm applycue:apply-tuning
pnpm applycue:uat
pnpm applycue:check
```

These are implementation details for agents and developers. Do not make normal users run commands.

## Keep This File Small

If you need to add detailed behavior, update the canonical skill or the appropriate doc instead of growing this file.
