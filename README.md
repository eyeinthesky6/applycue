# ApplyCue

ApplyCue is a local, agent-led job-search and application product. Give the repository link and your CV to Codex, Claude, or another capable coding agent; the agent sets it up, learns your profile, finds roles, reads full job descriptions, creates role-specific CVs, applies with permission, and tracks what happened.

The MVP uses the coding agent's existing intelligence and connectors. There is no required AI API key and no second embedded model runtime.

## Product decision

ApplyCue has one launch runtime. Deterministic code handles sources, exact identity/history, document rendering, application receipts, and integrity. The external agent handles fuzzy title/intent/CV-to-JD judgment and writing.

Competing control planes and the old terminal dashboard were retired after their useful features were re-homed behind the root runtime. See [Product decision](docs/PRODUCT_DECISION.md) and [Removal record](docs/REMOVALS_AND_REORGANIZATION.md).

## Give this link to an agent

Repository:

```text
https://github.com/eyeinthesky6/applycue
```

Suggested prompt:

```text
Install ApplyCue from this repository on my machine. Read AGENTS.md and
skills/applycue/SKILL.md, run the doctor check, then greet me and begin CV
ingestion. Ask before accessing folders, accounts, connectors, or submitting
anything. Do not ask for details already present in my CV.
```

The agent should perform the installation and explain only useful outcomes.

## Manual installation

Requirements: Git, Node.js 22.5 or newer, and a supported agent such as Codex or Claude.

```powershell
git clone https://github.com/eyeinthesky6/applycue.git
cd applycue
corepack pnpm install
node doctor.mjs --json
```

If `pnpm` is already installed, `pnpm install` is equivalent. Direct `corepack pnpm`
avoids the administrator permission that `corepack enable` can require on Windows.

Then start your agent in the repository:

```powershell
codex
# or: claude
```

Say: `Set up ApplyCue and start with my CV.` Slash commands are optional; plain language is the reliable interface.

Codex can also start non-interactively and return when setup needs user input:

```powershell
codex exec "Read AGENTS.md and skills/applycue/SKILL.md, run doctor, and begin ApplyCue setup."
```

`CODEX.md` is a thin repo pointer; `AGENTS.md` and the canonical skill remain the source of truth.

## What happens on first use

1. The agent preserves the supplied CV as the exact baseline and extracts details already present.
2. It asks whether you want selected project folders, GitHub, LinkedIn, your website, blogs, portfolios, or other evidence scanned.
3. It builds a coherent profile, shows additions/conflicts, and asks for confirmation.
4. It records target roles, acceptable adjacent roles, location/relocation, compensation, availability, employer restrictions, and application pace.
5. It runs a baseline search and shows fetched, blocked, reviewed, shortlisted, skipped, CV, attempted, and applied counts.
6. The agent reads every viable full JD and chooses `apply`, `watch`, or `skip`. Scores are explanatory only.
7. It prepares the first five genuine matches (or fewer), creates PDF and DOCX CVs, and asks for approval for each named application.
8. It records every attempt and never silently retries an uncertain submit.

Current employer is always skipped. Past employers require confirmation. Similar titles at one company are not automatic duplicates.

## Dashboard

The agent can open the local browser dashboard:

```powershell
npm run dashboard
```

It reads the canonical Markdown tracker and shows scanned, reviewed, shortlisted, applied/active, rejected, and skipped counts with job/report/CV links. Thumbs feedback is saved for the agent to discuss; it does not silently change preferences.

For a read-only shareable snapshot:

```powershell
npm run build:dashboard
```

## Useful commands

Normal users should not need these; the agent runs them.

```powershell
npm run doctor
npm run scan
node verify-pipeline.mjs
npm run tracker -- query --limit 20
npm run dashboard
npm run check
```

## Data and privacy

Candidate data stays local and is gitignored: `cv.md`, `config/profile.yml`, `modes/_profile.md`, `portals.yml`, `data/`, `reports/`, `output/`, and other user assets. ApplyCue does not store mailbox tokens. Agents use only connectors/accounts the user approves.

See [Data contract](DATA_CONTRACT.md) and [Configuration](docs/configuration.md).

## MVP boundary

The launch MVP ends at a confirmed application, tracking, and feedback. Interview scheduling, proactive alerts, deep interview preparation, offer comparison, and negotiation are future phases. See [Roadmap](docs/product-roadmap.md).

## Development and readiness

- [Architecture](docs/ARCHITECTURE.md)
- [Agent workflow](skills/applycue/SKILL.md)
- [Development guide](docs/agent-development-guide.md)
- [Launch readiness](docs/launch-readiness.md)
- [Live usage runbook](docs/live-usage-runbook.md)
- [Pivot history](docs/pivot-history.md)

ApplyCue is MIT licensed. The codebase retains the required attribution for the Career-Ops-derived foundation in [LICENSE](LICENSE).
