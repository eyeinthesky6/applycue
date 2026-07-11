# ApplyCue

ApplyCue is an agent-led CV-to-offer system.

## What It Does

ApplyCue helps an agent run the job-search loop for a user:

1. Learn the user's CV, target roles, preferences, geography, compensation, and apply policy.
2. Discover jobs from configured sources, public providers, and agent/user-added sources.
3. Classify the full batch and filter obvious no-go roles with hard blockers.
4. Automatically shortlist clear matches and send only ambiguous viable roles to Codex/Claude or the user.
5. Produce the final shortlist up to the user's configured daily target and generate truthful role-specific CV artifacts.
6. Prepare browser application plans and pause before risky actions.
7. Track applications and outcomes so future batches improve.

ApplyCue is not a generic job board, search engine, or score dashboard. The goal is interviews and offers, not a beautiful list of jobs.

## Current Shape

ApplyCue is currently a local-first agent product:

- TypeScript packages under `packages/` own profile loading, discovery, ranking, CV tailoring, application planning, and dashboard data.
- Worker/browser apps under `apps/` expose the commands an agent runs.
- `skills/applycue/SKILL.md` is the canonical user-facing workflow for agents.
- The inherited career-ops runtime has been removed from this branch. No supported package script or runtime path calls it; comparison evidence remains in dated reviews and Git history.

User assets should live outside the repo, preferably under:

```text
~/.applycue/profiles/<profile>/
```

Repo-local config is a development fallback only. Real CVs, contact data, generated applications, and outcomes must not be stored in this checkout.

## Start Here: Give The Link To An Agent

Most users should not clone the repo, edit JSON, or run commands. Give this link to a **local coding agent with file and terminal access**, such as Codex CLI or Claude Code:

```text
https://github.com/eyeinthesky6/applycue
```

Recommended prompt:

```text
Install and set up ApplyCue for me from this repository. Use the existing
product; do not rewrite it. Read AGENTS.md and skills/applycue/SKILL.md,
check the machine prerequisites, and ask before any system-level install or
account connection. When ApplyCue is ready, ask me for my original CV and
the minimum setup answers, import them through ApplyCue, then run the first
safe review batch. Do not submit applications or send messages.
```

A chat-only LLM without local file/terminal tools cannot install ApplyCue. It should hand these instructions to a local agent or guide the human through the manual steps below.

### What The Agent Must Do

1. Ask where the user wants the repository installed, then clone or open it.
2. Read `AGENTS.md` and `skills/applycue/SKILL.md`. Do not change product code during normal setup.
3. Check Git, Node.js 24, and pnpm 11.7.0. Ask before installing or changing system-level software.
4. Install the pinned repository dependencies:

   ```bash
   pnpm install --frozen-lockfile
   ```

5. Run the read-only checkpoint:

   ```bash
   pnpm applycue:status
   ```

6. If status reports `needs_setup` or `needs_profile`, immediately tell the user that CV intake is ready and ask for:
   - the original `.docx`, text-based `.pdf`, `.md`, or `.txt` CV;
   - name plus email or phone;
   - at least one target role;
   - material locations, work mode, constraints, and review/application preference.
7. Save only the approved answers as a temporary ApplyCue config file outside the repo. Run setup with the original CV:

   ```bash
   pnpm applycue:setup -- --input <temporary-approved-setup.json> --base-cv <original-cv.docx-or-pdf-or-text>
   ```

8. Setup copies the original CV into the private user profile, extracts its text in code, installs optional local discovery tools when possible, approves only bounded starter sources, and runs the first safe review batch when the blocking profile fields are complete.
9. Run status again and explain the result in plain language: jobs found, final shortlist, CVs created, questions or blockers, and the next safe action.

The agent must ask before installing system software, connecting email or another account, using a logged-in browser, changing saved scope/policy, widening the search, sending a message, or submitting an application. Routine local checks, dependency installation already authorized by the setup request, profile-file creation, CV import, and the first review-only batch should continue without making the user operate commands.

### When CV Ingestion Begins

There is no separate application server to launch in the MVP. ApplyCue is “loaded” when repository dependencies are installed and `pnpm applycue:status` runs successfully. If the profile is missing, the agent should move directly into CV intake and setup—not stop after reporting that setup is incomplete.

ApplyCue retains the original CV under `~/.applycue/profiles/<profile>/assets/base-cvs/`. DOCX and text-PDF extraction is code-owned. The agent must not recreate the CV, ask the user to convert it manually, or place it in the repository. Image-only PDFs stop with an OCR-needed message.

## Manual Installation

Use this path only when a human is intentionally operating the commands.

### Required On The Machine

- Git
- Node.js 24
- pnpm 11.7.0
- Windows, macOS, or Linux terminal access

Python 3.10-3.12 is optional. When available, setup creates an ApplyCue-owned JobSpy/JobHive environment under `~/.applycue/tools/`. Without Python, supported public no-key sources remain available. Email connectors and logged-in job sites are optional and are not required to ingest a CV or run the public-source workflow.

### Install And Check

```bash
git clone https://github.com/eyeinthesky6/applycue.git
cd applycue
pnpm install --frozen-lockfile
pnpm applycue:status
```

`pnpm install` installs the TypeScript workspace dependencies, Mammoth DOCX import, PDF.js text extraction, DOCX generation, and Playwright Chromium used by browser UAT/application routes.

### Import The CV And Create The Profile

Create an `approved-setup.json` file in the operating-system temporary directory, **not inside this repository**:

```json
{
  "profile": {
    "name": "Your approved name",
    "email": "you@example.com"
  },
  "preferences": {
    "targetRoleTerms": ["head of product"],
    "preferredLocations": ["India"]
  },
  "applySettings": {
    "mode": "review",
    "applicationsPerDay": 5
  }
}
```

Run setup using that temporary file and the original CV:

```bash
pnpm applycue:setup -- --input <path-to-approved-setup.json> --base-cv <path-to-original-cv.docx-or-pdf-or-text>
pnpm applycue:status
```

When all blocking fields are present, setup runs the first review batch automatically. It does not submit an application. Review the generated shortlist and CVs before confirming form data or running a live application route.

For agent-specific usage, see the [Codex guide](docs/CODEX.md), [setup guide](docs/SETUP.md), and [canonical ApplyCue skill](skills/applycue/SKILL.md).

## Useful Commands

ApplyCue engine commands:

```bash
pnpm applycue:setup
pnpm applycue:first-build
pnpm applycue:status
pnpm applycue:record-decision -- --job <id> --decision <apply|review|watch|skip> --actor codex --reason <why>
pnpm applycue:record-decisions -- --input <reviewed-decisions.json> --prepare
pnpm applycue:uat
pnpm applycue:browser-uat
```

## First UAT Gate

A run is useful when one fresh role can go through:

```text
discover -> hard gates + clear shortlist -> ambiguity review when needed -> truthful tailored CV -> DOCX/HTML/Markdown artifact -> browser fill/upload plan -> pause before submit -> tracker updated -> receipt saved
```

The engine owns clear rule-based shortlist and rejection decisions. Codex/Claude or the user decides only ambiguous `review` rows needed to complete or correct the shortlist. Normal preparation combines both, capped by `applicationsPerDay`; UAT uses explicit test authority.

Until this works reliably, dashboard polish and complex matching math are secondary.

## Launch Readiness

See [Launch readiness](docs/launch-readiness.md) for the current distribution plan, release gate, privacy guard, and what is not part of v0.1.

For real multi-candidate sessions, use the [Live usage runbook](docs/live-usage-runbook.md). It defines the default-profile first run, one profile per candidate, and the search-UAT-before-apply flow.

## Important Docs

- [Documentation map](docs/README.md)
- [Agent rules](AGENTS.md)
- [Core product decision](docs/PRODUCT_DECISION.md)
- [Canonical architecture](docs/ARCHITECTURE.md)
- [Product roadmap: MVP, V1, and V2](docs/product-roadmap.md)
- [Canonical skill](skills/applycue/SKILL.md)
- [Launch readiness](docs/launch-readiness.md)
- [Live usage runbook](docs/live-usage-runbook.md)
- [Pivot history](docs/pivot-history.md)
- [Data contracts](docs/data-contracts.md)
- [User asset storage](docs/user-asset-storage.md)
- [Agent development guide](docs/agent-development-guide.md)
- [CV tailoring policy](docs/cv-tailoring-policy.md)
- [Discovery decision record](docs/discovery-inspiration-and-build-decision.md)

## License

ApplyCue is MIT licensed. See [LICENSE](LICENSE).

Career-ops attribution is retained for repository history and any derived portions that have not received a file-level provenance clearance. The forked runtime code itself is not distributed in this branch.
