# ApplyCue

ApplyCue is an agent-led CV-to-offer system.

It starts from a fork of [career-ops](https://github.com/santifer/career-ops), which is MIT licensed. The fork keeps the working career-ops local workflow and adds ApplyCue's product direction: profile-store separation, truthful CV reconciliation, browser-apply receipts, UAT checks, and outcome learning.

## What It Does

ApplyCue helps an agent run the job-search loop for a user:

1. Learn the user's CV, target roles, preferences, geography, compensation, and apply policy.
2. Discover jobs from configured sources, public providers, and agent/user-added sources.
3. Filter obvious no-go roles with hard blockers.
4. Let the agent judge fuzzy fit from the CV, JD, preferences, and feedback.
5. Generate truthful role-specific CV artifacts.
6. Prepare browser application plans and pause before risky actions.
7. Track applications and outcomes so future batches improve.

ApplyCue is not a generic job board, search engine, or score dashboard. The goal is interviews and offers, not a beautiful list of jobs.

## Current Shape

This branch has two layers:

- **career-ops base:** scanners, pipeline, tracker, reports, CV/PDF primitives, agent modes, dashboard/TUI, and batch workflow.
- **ApplyCue additions:** TypeScript packages under `packages/`, worker/browser apps under `apps/`, external profile store docs, CV truth policy, browser UAT policy, source approval flow, and product docs.

User assets should live outside the repo, preferably under:

```text
~/.applycue/profiles/<profile>/
```

The inherited career-ops repo-local user files still work during the transition.

## Local Setup

```bash
git clone https://github.com/eyeinthesky6/applycue.git
cd applycue
pnpm install
node doctor.mjs --json
```

Then open an agent CLI in this repo:

```bash
codex
# or claude / opencode / qwen / agy / grok
```

The user should operate ApplyCue by chat. Normal users should not need to edit code.

## Useful Commands

Inherited career-ops commands:

```bash
npm run doctor
npm run scan
npm run tracker
npm run build:dashboard
```

ApplyCue engine commands:

```bash
pnpm applycue:setup
pnpm applycue:first-build
pnpm applycue:status
pnpm applycue:uat
pnpm applycue:browser-uat
```

## First UAT Gate

A run is useful when one fresh role can go through:

```text
discover -> evaluate -> truthful tailored CV -> DOCX/PDF/HTML artifact -> browser fill/upload plan -> pause before submit -> tracker updated -> receipt saved
```

Until this works reliably, dashboard polish and complex matching math are secondary.

## Important Docs

- [Agent rules](AGENTS.md)
- [Data contract](DATA_CONTRACT.md)
- [Fork plan](docs/applycue-fork-plan.md)
- [Agent development guide](docs/agent-development-guide.md)
- [CV tailoring policy](docs/cv-tailoring-policy.md)
- [Build roadmap](docs/build-roadmap.md)
- [Discovery decision record](docs/discovery-inspiration-and-build-decision.md)

## License And Attribution

ApplyCue is MIT licensed because career-ops is MIT licensed. Keep the upstream license and attribution intact.

The original career-ops project and case study belong to Santiago Fernandez de Valderrama:

- https://github.com/santifer/career-ops
- https://santifer.io/career-ops-system
