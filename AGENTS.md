# ApplyCue Agent Instructions

ApplyCue is an agent-led CV-to-application product. The user talks to Codex, Claude, or another capable agent; the agent operates the local code, browser, and approved connectors.

## Read order

1. `skills/applycue/SKILL.md` — canonical user workflow.
2. `docs/PRODUCT_DECISION.md` — settled product and ownership decisions.
3. `docs/ARCHITECTURE.md` — technical boundaries.
4. `docs/product-roadmap.md` — MVP, V1, and V2.
5. `docs/launch-readiness.md` — claim gate.
6. `docs/agent-development-guide.md` — code-change rules.
7. Specific contract docs only when relevant.

Do not duplicate product rules in `CLAUDE.md`, `CODEX.md`, `OPENCODE.md`, or CLI bridge skills. They point here or to the canonical skill.

## One-line product decision

Run one ApplyCue root operator. Complex judgment belongs to the external agent; deterministic code owns fetching, exact identity/history, artifacts, receipts, and integrity.

The former TypeScript `apps/` and `packages/` control plane and the Go terminal dashboard were removed from this launch branch. The independent work remains preserved in its donor branch/worktree and may inspire small, tested ports. Never restore or run it as a second product runtime.

## Start every user session

Unless the user asked for repository development:

```powershell
node doctor.mjs --json
```

Then read the candidate's existing user-layer files that are present:

```text
cv.md
config/profile.yml
modes/_profile.md
modes/_custom.md
portals.yml
data/applications.md
data/pipeline.md
```

Greet the user. If onboarding is needed, follow the canonical skill. Extract name and contact details from the supplied CV; do not ask for information already present.

Codex may be started interactively with `codex` or headlessly with `codex exec "Read AGENTS.md, run doctor, and begin ApplyCue setup."` `CODEX.md` is only a thin pointer. Plain-language prompts are the supported interface; `/applycue` may be unavailable in some hosts.

## Ownership boundary

Code may decide only objective, reproducible facts:

- fetch and normalize source records;
- reject invalid protocols, unsafe URLs, confirmed dead pages, and exact URL/record duplicates;
- enforce explicit geography, authorization, blocked-company, current-employer, exact application identity/attempt state, and user-approved hard constraints;
- build files, preserve tracker state, and record application attempts.

The agent decides meaning:

- whether a title matches the user's intent;
- whether experience is relevant to a JD;
- whether a role is `apply`, `watch`, or `skip`;
- how to write a truthful marketing CV;
- whether a short preview needs full-page hydration;
- whether two similar roles are actually the same opening.

Numeric scores and keyword matches are diagnostics, not rejection or application authority. Same-company similar titles and legacy company/title cooldowns are ambiguous. Only exact source/record identity or an exact confirmed application URL/attempt may suppress them automatically.

## User safety and permission

- Current employer: always skip.
- Past employer: ask before proceeding.
- Do not widen geography, titles, recency, sources, seniority, or application volume without explaining the change and getting approval.
- Do not use a new logged-in account or connector without approval.
- Do not submit an application or send a message without approval for that named company and role.
- Record every browser attempt with `application-attempt.mjs`. An `unknown` outcome blocks retry until reconciled.
- Do not commit real CVs, contact data, generated user files, browser receipts, or application history.

## CV rule

Keep the exact supplied CV as the baseline. Additional local/public sources may enrich a working profile only after the user grants access. Present the coherent story and material additions for confirmation before changing the base CV.

CV evidence is a decision aid, not a morality gate. The agent may reorder, shorten, emphasize, and translate real experience. Label a claim as sourced, reframed, or new/unconfirmed. Ask once for material new claims. User confirmation makes the claim approved. Never invent employers, dates, credentials, metrics, legal answers, work authorization, or achievements.

For each role being applied to, create durable Markdown/HTML source plus PDF and DOCX output. Verify the chosen file opens and belongs to the named role before upload.

## Main commands

The agent runs commands; normal users should not have to.

```powershell
npm run doctor
npm run scan
node verify-pipeline.mjs
npm run tracker -- query --limit 20
npm run dashboard
npm run build:dashboard
npm run check
```

Application receipt:

```powershell
node application-attempt.mjs start --job=N --company="Company" --title="Role" --url="https://..." --approved-by-user
node application-attempt.mjs finish --attempt=ID --outcome=confirmed|unknown|failed|abandoned --evidence="..."
```

## Source of truth

- `data/applications.md`: canonical application tracker.
- `data/applications.db`: disposable derived query index.
- `data/scan-history.tsv`: discovery history and exact-URL dedupe input.
- `data/application-attempts.jsonl`: application attempt receipts.
- `data/job-feedback.jsonl`: dashboard feedback for agent follow-up.
- `reports/`: full-JD reviews.
- `output/`: generated CVs and dashboard snapshots.

User-specific preferences belong in the user layer, not source code. Add a provider or change shared logic only for a reusable product need.

## Development rule

Start from a real failure or documented requirement. Identify the existing owner, make the smallest change there, add a regression test, and run the repo checks. Do not introduce another orchestrator, tracker, dashboard, ranker, or instruction tree.

For launch claims, a green unit suite is necessary but insufficient. Use `docs/launch-readiness.md` and prove a clean install plus a real discover-to-application run.
