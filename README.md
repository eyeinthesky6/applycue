# ApplyCue

ApplyCue is a local, agent-led job-search and application product. Give the repository link and your CV to Codex, Claude, or another capable coding agent; the agent sets it up, learns your profile, finds roles, reads full job descriptions, creates role-specific CVs, applies with permission, and tracks what happened.

The MVP uses the coding agent's existing intelligence and connectors. There is no required AI API key and no second embedded model runtime.

## Product decision

ApplyCue has one launch runtime. Deterministic code handles sources, exact identity/history, document rendering, full-JD and decision-input receipts, application receipts, and integrity. The external agent handles fuzzy title/intent/CV-to-JD judgment and writing.

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

Installation adds the repository's Node.js dependencies and a Playwright-managed
Chromium build used for page checks and document rendering. It does not install
Docker, Go, Python, or a second AI runtime, and it does not require an AI API key.
The normal install stays inside the cloned repository plus Playwright's per-user
browser cache.

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
4. It records and confirms target roles, acceptable adjacent roles, location/relocation, compensation, availability, employer restrictions, and application pace before searching.
5. It runs a baseline search and shows fetched, blocked, reviewed, shortlisted, skipped, CV, attempted, and applied counts.
6. Before each full-JD review, the agent re-reads those preferences, chooses `apply`, `watch`, or `skip`, records confidence and reasons, and ranks the apply queue. New reviews do not use a semantic fit score.
7. Before writing each role CV, it builds a light employer success brief, chooses the primary role family, and asks focused questions when useful work may simply be missing from the old CV. A confirmed recollection can be used without an old document or exact metric; the agent must not invent precision.
8. It prepares the first five genuine matches (or fewer), creates a verified Markdown/HTML/PDF/DOCX bundle tied to the current JD and decision, and shows the exact upload file.
9. It inspects the live form without filling, reuses only explicitly approved answers, binds the active form and selected CV hash to the attempt, asks for approval for each named application, reconciles confirmed outcomes with the exact tracker row, and never silently retries an uncertain submit.

Any job link you give the agent directly defaults to **high stakes** unless you say it is standard. You can also use `Mark high stakes` or `Return to standard` on the dashboard. The agent starts that review ahead of standard queued work. If it genuinely earns `apply`, it moves to the top of application preparation and the apply ranks are updated; high stakes never forces a weak role into the apply queue. Agent/scanner-discovered roles stay standard unless you upgrade them. High-stakes treatment adds deeper company/team context, a small public success-pattern review when available, targeted evidence recovery, and optional draft LinkedIn/website/GitHub/portfolio recommendations. It never publishes profile changes without separate approval. V1 adds a repeatable saved campaign view.

Current employer is always skipped. Past employers require confirmation. Similar titles at one company are not automatic duplicates.

## Dashboard

The agent can open the local browser dashboard:

```powershell
npm run dashboard
```

It reads the canonical Markdown tracker and shows stored scan volume plus current agent-reviewed, shortlisted, applied, rejected, and skipped counts with agent rank/confidence and links to the original posting, saved full JD, agent review, tailored PDF, and tailored DOCX. Stage-aware buttons let the user mark a role high stakes or standard, ask the agent to prepare or ignore it, request a CV change in a local text box, inspect the application form, or approve one exact application after preflight. The buttons append local receipts; they never change preferences, mutate the tracker, or submit by themselves. An unresolved CV-change request blocks application start until a different verified bundle is recorded and the agent resolves the request.

If the full JD, confirmed preferences, candidate evidence, report, or review metadata changed after the decision, the role appears as pending re-review and is excluded from the active shortlist. Imported tracker history is labelled and excluded from the current success counts; a new user with no imported history sees no origin badge. Per-run scan attribution is a later integration item.

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
node review-evidence.mjs check --job=N
node cv-bundle.mjs check --job=N --cv="output/path/to/selected-cv.pdf"
node job-feedback.mjs pending
npm run tracker -- query --limit 20
npm run dashboard
npm run check
```

## Data and privacy

Candidate data stays local and is gitignored: `cv.md`, `config/profile.yml`, `modes/_profile.md`, `portals.yml`, `data/`, `reports/`, `output/`, and other user assets. ApplyCue does not store mailbox tokens. Agents use only connectors/accounts the user approves.

See [Data contract](DATA_CONTRACT.md) and [Configuration](docs/configuration.md).

## MVP boundary

The launch MVP ends at a confirmed application, tracking, and feedback. Interview scheduling, proactive alerts, deep interview preparation, offer comparison, and negotiation are future phases. See [Roadmap](docs/product-roadmap.md).

## Current maturity and limits

ApplyCue 0.1 is an early local-first release candidate. It needs a capable external
agent such as Codex or Claude, public job sources or a user-approved browser, and
explicit user approval before any application is submitted. Source coverage varies
by country and job board. ApplyCue can improve discovery and application quality,
but it cannot promise an interview or job offer. Hosted accounts, billing, calendar
automation, proactive alerts, and the post-interview workflow are not part of 0.1.

## Development and readiness

- [Architecture](docs/ARCHITECTURE.md)
- [ApplyCue/Career-Ops integration plan](docs/2026-07-14_applycue-career-ops-integration_architectural_review.md)
- [Agent workflow](skills/applycue/SKILL.md)
- [Development guide](docs/agent-development-guide.md)
- [Launch readiness](docs/launch-readiness.md)
- [Live usage runbook](docs/live-usage-runbook.md)
- [Pivot history](docs/pivot-history.md)

ApplyCue is MIT licensed. The codebase retains the required attribution for the Career-Ops-derived foundation in [LICENSE](LICENSE).

Contributions are welcome through [CONTRIBUTING.md](CONTRIBUTING.md). Use
[SUPPORT.md](SUPPORT.md) for help and [SECURITY.md](SECURITY.md) for private
security reporting. Please never put a real CV, contact details, application
history, or generated candidate artifacts in a public issue or pull request.
