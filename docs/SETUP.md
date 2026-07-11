# Setup Guide

Status: current local repo-plus-agent setup path.

## Prerequisites

- Git, so the agent can clone the current repository distribution.
- Node.js 24, the current CI baseline.
- `pnpm` 11.7.0, matching `packageManager`.
- An agent CLI such as Codex, Claude Code, OpenCode, Qwen, Antigravity CLI, or Grok Build CLI.

Python 3.10-3.12 is optional. When present, setup creates a private ApplyCue tool environment for JobSpy/JobHive. Without it, ApplyCue can still run supported public no-key sources. Email connectors and logged-in job sites are optional and are connected later only with user approval.

## Local Setup

Current distribution is repo + agent skill. The user gives `https://github.com/eyeinthesky6/applycue` and their CV file to an agent and asks it to set up ApplyCue locally. npm install as a product package is not the launch path yet.

```bash
git clone https://github.com/eyeinthesky6/applycue.git
cd applycue
pnpm install
pnpm applycue:status
```

If status says the profile is not ready, the agent runs:

```bash
pnpm applycue:setup -- --input <approved-setup.json> --base-cv <candidate-cv.docx-or-pdf-or-text>
```

`approved-setup.json` uses the existing ApplyCue config shape. The agent creates it from approved chat answers in an OS temporary directory; the user does not edit JSON. Setup copies the original CV into the active profile store and code extracts text from DOCX through Mammoth or from a text-based PDF through PDF.js. Markdown and plain text also work. The original file remains authoritative. If a PDF contains only scanned images, setup reports that OCR is needed instead of inventing or asking the agent to recreate CV text.

Running setup without the blocking inputs may create the profile skeleton, but it reports `needs_profile`, names the missing identity/contact, CV, or target roles, and does not create an empty first-run manifest.

Then open your agent CLI in the repo:

```bash
codex
# or claude / opencode / qwen / agy / grok
```

Codex slash commands are not guaranteed. Use plain language prompts, or use headless `codex exec`:

```bash
codex exec "Run ApplyCue status in this repo."
codex exec "Run ApplyCue UAT and summarize blockers."
```

## ApplyCue Commands

```bash
pnpm applycue:setup
pnpm applycue:status
pnpm applycue:uat
pnpm applycue:first-build
pnpm applycue:browser-uat
```

The inherited root scanner, tracker, evaluator, and dashboard commands have been removed. Current setup uses only the documented `applycue:* -> apps/worker -> packages/*` path.

## First User Flow

The user should not edit code. The agent should:

1. Load or create the user profile.
2. Import the base CV.
3. Confirm target roles, locations, compensation, work mode, and apply policy.
4. Generate or approve sources.
5. Run the first discovery batch.
6. Classify the full queue automatically, then ask Codex/Claude or the user only about ambiguous `review` rows.
7. Prepare the final shortlist up to `applicationsPerDay` from clear system matches plus recorded ambiguity decisions, then generate truthful CV artifacts.
8. Prepare browser apply plans and pause before risky actions.
9. Track outcomes.

## Launch Readiness

Before handing the repo to a new early user, run the launch gate from [Launch readiness](launch-readiness.md):

```bash
pnpm applycue:check
pnpm applycue:uat -- --more-results --target-ranking-queue 200
pnpm applycue:browser-uat -- --more-results --target-ranking-queue 200
pnpm applycue:record-decisions -- --input <reviewed-decisions.json> --prepare
pnpm applycue:status
```

## Browser Runtime

`pnpm install` installs Playwright Chromium for browser UAT and controlled browser execution. Setup can repair that browser install when needed. The normal host should still prefer its approved native connector or real Chrome session when available.

Manual repair command for the agent:

```bash
npx playwright install chromium
```
