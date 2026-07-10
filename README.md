# ApplyCue

ApplyCue is an agent-led CV-to-offer system.

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

ApplyCue is currently a local-first agent product:

- TypeScript packages under `packages/` own profile loading, discovery, ranking, CV tailoring, application planning, and dashboard data.
- Worker/browser apps under `apps/` expose the commands an agent runs.
- `skills/applycue/SKILL.md` is the canonical user-facing workflow for agents.
- Repo-local scripts from the base workflow still exist, but the ApplyCue commands are the launch path.

User assets should live outside the repo, preferably under:

```text
~/.applycue/profiles/<profile>/
```

Repo-local user files still work during the transition.

## Local Setup

The current distribution path is GitHub repo + agent skill. npm/package install and SaaS are later.

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

Codex may not expose slash commands. In that case, use plain language or headless `codex exec`:

```bash
codex exec "Run ApplyCue status in this repo."
codex exec "Run ApplyCue UAT and summarize blockers."
```

See [Codex guide](docs/CODEX.md).

The user should operate ApplyCue by chat. Normal users should not need to edit code.

## Useful Commands

Base workflow commands:

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

## Launch Readiness

See [Launch readiness](docs/launch-readiness.md) for the current distribution plan, release gate, privacy guard, and what is not part of v0.1.

For real multi-candidate sessions, use the [Live usage runbook](docs/live-usage-runbook.md). It defines the default-profile first run, one profile per candidate, and the search-UAT-before-apply flow.

## Important Docs

- [Agent rules](AGENTS.md)
- [Launch readiness](docs/launch-readiness.md)
- [Live usage runbook](docs/live-usage-runbook.md)
- [Pivot history](docs/pivot-history.md)
- [Data contract](DATA_CONTRACT.md)
- [Build decision](docs/build-decision.md)
- [Agent development guide](docs/agent-development-guide.md)
- [CV tailoring policy](docs/cv-tailoring-policy.md)
- [Build roadmap](docs/build-roadmap.md)
- [Discovery decision record](docs/discovery-inspiration-and-build-decision.md)

## License

ApplyCue is MIT licensed. See [LICENSE](LICENSE).
