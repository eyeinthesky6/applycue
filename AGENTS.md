# ApplyCue Agent Instructions

ApplyCue is an agent-led CV-to-application product. The user talks to Codex, Claude, or another capable agent; the agent operates the local code, browser, and approved connectors.

## Read order

1. `skills/applycue/SKILL.md` — canonical user workflow.
2. `docs/PRODUCT_DECISION.md` — settled product and ownership decisions.
3. `docs/ARCHITECTURE.md` — technical boundaries.
4. `docs/2026-07-14_applycue-career-ops-integration_architectural_review.md` — feature disposition, destination owners, port order, and acceptance gates.
5. `docs/product-roadmap.md` — MVP, V1, and V2.
6. `docs/launch-readiness.md` — claim gate.
7. `docs/agent-development-guide.md` — code-change rules.
8. Specific contract docs only when relevant.

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

Historical numeric scores and keyword matches are diagnostics, not rejection, ranking, artifact, or application authority. New semantic reviews use agent `Decision`, explicit queue `Rank`, `Confidence`, strengths, gaps, unknowns, preference basis, and reason. Same-company similar titles and legacy company/title cooldowns are ambiguous. Only exact source/record identity or an exact confirmed application URL/attempt may suppress them automatically.

## Preference timing

Capture and confirm material preferences during setup before the baseline search. Re-read `config/profile.yml`, `modes/_profile.md`, and approved feedback before every final role decision/rank and before each role CV or application draft. If a missing preference could change the result, keep the role pending and ask. Feedback may propose a change but must never save one without user approval.

Every current final decision must have a durable full-JD capture and review receipt. Code fingerprints the captured JD, confirmed preference files, candidate evidence, report, and tracker review metadata. If any input changes, the stored decision becomes effectively `pending` until the agent rereads the evidence and records a fresh receipt. `application-attempt.mjs start` enforces a current `apply` receipt.

Every prepared application must also have a current CV-bundle record. The record binds the role Markdown, HTML, PDF, and DOCX to that review and stores each file hash. If a file, JD, preference, report, or decision changes, regenerate and record the bundle again. Application start accepts only the exact verified PDF or DOCX chosen for upload.

The English canonical decision modes own MVP semantic behavior. Localized mode copies may guide output language but must not restore fit-score thresholds or a competing decision flow.

## User safety and permission

- Current employer: always skip.
- Past employer: ask before proceeding.
- Do not widen geography, titles, recency, sources, seniority, or application volume without explaining the change and getting approval.
- Do not use a new logged-in account or connector without approval.
- Do not submit an application or send a message without approval for that named company and role.
- Record every browser attempt with `application-attempt.mjs`. A confirmed `finish` updates the matching tracker lifecycle and derived index through the existing tracker owner. An `unknown` outcome blocks retry until reconciled.
- Do not commit real CVs, contact data, generated user files, browser receipts, or application history.

## CV rule

Keep the exact supplied CV as the baseline. Additional local/public sources may enrich a working profile only after the user grants access. Present the coherent story and material additions for confirmation before changing the base CV.

CV evidence is a decision aid, not a morality gate. The agent may reorder, shorten, emphasize, and translate real experience. Label a claim as sourced, reframed, or new/unconfirmed. Ask once for material new claims. User confirmation makes the claim approved. Never invent employers, dates, credentials, metrics, legal answers, work authorization, or achievements.

For each role being applied to, create durable Markdown/HTML source plus PDF and DOCX output. Put the current job/review metadata in the Markdown frontmatter and matching HTML meta tags, render both upload formats, then run `cv-bundle.mjs record` and `check`. Verify the exact chosen PDF or DOCX before requesting application approval.

## Main commands

The agent runs commands; normal users should not have to.

```powershell
npm run doctor
npm run scan
node verify-pipeline.mjs
npm run tracker -- query --limit 20
npm run dashboard
npm run build:dashboard
node job-feedback.mjs pending
node cv-bundle.mjs check --job=N --cv="output/path/to/selected-cv.pdf"
npm run check
```

Application receipt:

```powershell
node application-attempt.mjs start --job=N --company="Company" --title="Role" --url="https://..." --cv="output/path/to/selected-cv.pdf" --approved-by-user
node application-attempt.mjs start --job=N --company="Company" --title="Role" --url="https://..." --cv="output/path/to/selected-cv.pdf" --approval-receipt=DASHBOARD_ACTION_ID
node application-attempt.mjs finish --attempt=ID --outcome=confirmed|unknown|failed|abandoned --evidence="..."
```

## Source of truth

- `data/applications.md`: canonical application tracker with separate Decision, Rank, Confidence, lifecycle Status, and internal Origin.
- `data/applications.db`: disposable derived query index.
- `data/scan-history.tsv`: discovery history and exact-URL dedupe input.
- `data/application-attempts.jsonl`: application attempt receipts; confirmed finish events are reconciled with the exact tracker row by `application-attempt.mjs` and `tracker.mjs`.
- `data/review-receipts.jsonl`: append-only fingerprints binding final agent decisions to their reviewed inputs.
- `data/pdf-index.tsv`: backward-compatible report/PDF links plus versioned CV-bundle metadata and file hashes.
- `data/job-feedback.jsonl`: append-only dashboard action, CV-change, named approval, and agent-resolution receipts. It never edits the tracker or preferences directly.
- `reports/`: full-JD reviews.
- `output/`: generated CVs and dashboard snapshots.

User-specific preferences belong in the user layer, not source code. Add a provider or change shared logic only for a reusable product need.

## Development rule

Start from a real failure or documented requirement. Identify the existing owner, make the smallest change there, add a regression test, and run the repo checks. Do not introduce another orchestrator, tracker, dashboard, ranker, or instruction tree.

For launch claims, a green unit suite is necessary but insufficient. Use `docs/launch-readiness.md` and prove a clean install plus a real discover-to-application run.
