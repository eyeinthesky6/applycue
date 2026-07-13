# ApplyCue Architecture

## Shape

ApplyCue is a local agent-operated product, not a second AI platform. One root runtime supplies tools and durable state; Codex, Claude, or another external agent supplies judgment and uses the user's approved browser/connectors.

```text
user chat
   |
external agent (judgment, writing, browser/connectors)
   |
ApplyCue root operator
   |-- providers + scan.mjs          fetch and normalize leads
   |-- modes/*.md                    workflow and output contracts
   |-- reports/ + output/            review and CV artifacts
   |-- application-attempt.mjs       attempt certainty
   |-- data/applications.md          canonical application history
   |-- tracker.mjs                   derived query index
   `-- dashboard-server.mjs          browser view + feedback capture
```

There is no TypeScript worker/engine control plane and no Go dashboard in the launch branch.

## Decision split

The boundary is based on whether a result is objectively reproducible.

| Deterministic code | External agent |
| --- | --- |
| validate protocol and URL | understand a vague or unusual title |
| fetch provider records | read full rendered/collapsed JD |
| exact URL/record dedupe | decide whether similar roles are duplicates |
| confirmed page liveness | judge CV-to-JD and user intent fit |
| explicit hard constraints and exact attempt state | interpret company/title cooldown hints |
| build PDF/DOCX | answer non-standard form questions |
| preserve tracker and attempt receipts | decide `apply`, `watch`, or `skip` |

Scores, keyword overlap, inferred levels, and similar-title math may be displayed as evidence but cannot reject or apply by themselves.

## Main data flow

1. `doctor.mjs` identifies missing user setup.
2. The agent ingests the exact CV, reads approved sources, and confirms a coherent profile.
3. `scan.mjs` invokes configured provider modules and writes leads/history.
4. The agent opens viable links, hydrates the full JD, and records review results/reports.
5. CV mode writes durable Markdown/HTML and renders PDF/DOCX.
6. Apply mode performs browser preflight, gets named approval, starts a receipt, fills/uploads/submits, and records the outcome.
7. `data/applications.md` remains canonical history; SQLite is a replaceable query index.
8. The browser dashboard reads that history and captures feedback without changing preferences.

## Source adapters and providers

Providers translate an external source into one common job-lead shape: company, title, location, URL, source, optional salary/date/description. They do not decide candidate fit.

Prefer stable public ATS/company APIs or feeds, mature permissive OSS bridges where they add coverage, agent browser extraction for rendered/collapsed pages, and manual/user-added links. Do not build a 10,000-line universal scraper inside the core. Any provider needs fixtures, pagination/error handling, source attribution, and a canary.

## Tracker and identity

`data/applications.md` is the source of truth because users and agents can inspect it. `data/applications.db` is derived and safe to rebuild.

Automatic duplicate suppression requires exact identity: same normalized URL, same tracker id, same report id, or confirmed prior application evidence. Company/title similarity is only an agent-review signal.

## CV artifacts

The exact supplied CV is a baseline. Profile enrichment is confirmed separately. Each applied role should have durable Markdown/HTML source and PDF/DOCX output.

Claim states are advisory: sourced, reframed, or new/unconfirmed. Confirmed user claims are allowed. Hard technical failure is reserved for broken/missing files, wrong-role artifacts, or unresolved required/legal fields—not unfamiliar marketing wording.

## Application certainty

`application-attempt.mjs` is append-only. An attempt moves from `started` to exactly one of `confirmed`, `unknown`, `failed`, or `abandoned`. `unknown` is not `Applied` and blocks retry until the agent reconciles evidence and the user approves.

## Browser dashboard

`dashboard-server.mjs` binds only to `127.0.0.1`. It reads the tracker, report headers, PDF manifest, scan history, and feedback. It serves only files under `reports/`, `output/`, and `jds/`. Feedback writes `data/job-feedback.jsonl` and never mutates search config automatically.

## Extension rule

New work must attach to an owner above. Do not add another engine, worker, ranker, tracker, dashboard, profile store, or instruction tree. When OSS is considered, record license, maturity, maintenance, failure modes, and a bounded trial.
