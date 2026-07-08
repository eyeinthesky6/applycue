# Setup Guide

## Prerequisites

- Node.js 18+.
- `pnpm`.
- An agent CLI such as Codex, Claude Code, OpenCode, Qwen, Antigravity CLI, or Grok Build CLI.
- Optional: Go 1.21+ for the terminal dashboard.

## Local Setup

```bash
git clone https://github.com/eyeinthesky6/applycue.git
cd applycue
pnpm install
node doctor.mjs --json
```

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

## Base Workflow Commands

```bash
npm run doctor
npm run scan
npm run tracker
npm run build:dashboard
```

## First User Flow

The user should not edit code. The agent should:

1. Load or create the user profile.
2. Import the base CV.
3. Confirm target roles, locations, compensation, work mode, and apply policy.
4. Generate or approve sources.
5. Run the first discovery batch.
6. Generate truthful CV artifacts for approved roles.
7. Prepare browser apply plans and pause before risky actions.
8. Track outcomes.

## Browser Runtime

PDFs and browser UAT use Chromium through Playwright:

```bash
npx playwright install chromium
```
