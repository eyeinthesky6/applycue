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
   |-- review-evidence.mjs           full-JD + decision-input receipts
   |-- cv-bundle.mjs                 role/CV identity + artifact hashes
   |-- high-stakes-pack.mjs          campaign-pack freshness receipts
   |-- application-attempt.mjs       attempt certainty
   |-- data/applications.md          canonical application history
   |-- tracker.mjs                   derived query index
   |-- job-feedback.mjs              local user-action/approval receipts
   `-- dashboard-server.mjs          browser view + action capture
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
| build and hash role PDF/DOCX | answer non-standard form questions |
| preserve tracker and attempt receipts | decide `apply`, `watch`, or `skip`; assign relative rank and confidence |

New semantic reviews use structured agent judgment: decision, rank, confidence, strengths, gaps, unknowns, preference basis, and reason. Historical scores, keyword overlap, inferred levels, and similar-title math may be displayed as legacy evidence but cannot reject, shortlist, rank, replace records, or gate artifacts.

## Main data flow

1. `doctor.mjs` identifies missing user setup.
2. The agent ingests the exact CV, reads approved sources, captures material preferences, and confirms a coherent profile before the baseline search. When useful, it saves the user-confirmed reusable career spine and role-family projections in optional `candidate-positioning.md`.
3. `scan.mjs` invokes configured provider modules and writes leads/history.
4. The agent re-reads confirmed preferences, opens viable links, hydrates and stores the full JD, records structured review results, and ranks the apply queue. `review-evidence.mjs` binds that final decision to the captured JD, current preference/evidence files, report, and tracker metadata.
5. For `apply`, CV mode writes metadata-bound Markdown/HTML, renders PDF/DOCX, and records a current four-file bundle with hashes; `watch` and `skip` remain report-only unless requested. For a high-stakes `apply`, the agent also writes an adaptive campaign pack beside the CV and `high-stakes-pack.mjs` binds it to the same current evidence without becoming another application gate.
6. Apply mode verifies the exact selected PDF/DOCX, performs browser preflight, gets named approval, starts a receipt bound to that upload hash, fills/uploads/submits, and records the outcome.
7. `data/applications.md` remains canonical history; SQLite is a replaceable query index.
8. The browser dashboard reads that history and captures stage-aware user actions without changing preferences or directly mutating the tracker.

## Source adapters and providers

Providers translate an external source into one common job-lead shape: company, title, location, URL, source, optional salary/date/description. They do not decide candidate fit.

Prefer stable public ATS/company APIs or feeds, mature permissive OSS bridges where they add coverage, agent browser extraction for rendered/collapsed pages, and manual/user-added links. Do not build a 10,000-line universal scraper inside the core. Any provider needs fixtures, pagination/error handling, source attribution, and a canary.

## Tracker and identity

`data/applications.md` is the source of truth because users and agents can inspect it. `data/applications.db` is derived and safe to rebuild.

Each row separates five facts: `Decision` is the external agent's `pending|apply|watch|skip` judgment, `Rank` orders the current apply queue, `Confidence` records uncertainty, `Status` is the application lifecycle, and internal `Origin` says whether the row is current or imported history. High stakes is separate user priority: code surfaces viable high-stakes work first, while the agent still decides fit and assigns the top apply rank only after an `apply` decision. `Evaluated` never means shortlisted by itself. Dashboard success counts use current rows; only non-current rows receive a visible history badge.

`data/review-receipts.jsonl` is append-only evidence for current final decisions. A changed JD capture, confirmed preference file, CV/evidence file, report, review protocol, or tracker decision metadata makes the stored decision ineffective. Readers expose it as pending re-review; they do not erase the historical decision. Application start requires a current fingerprint-bound `apply` receipt.

Automatic duplicate suppression requires exact identity: same normalized URL, same tracker id, same report id, or confirmed prior application evidence. Company/title similarity is only an agent-review signal.

## CV artifacts

The exact supplied CV is a baseline, not a complete inventory of everything the user has done. Profile enrichment and role-specific recovered evidence are confirmed separately and saved in the approved user layer. Optional `candidate-positioning.md` holds the user-confirmed reusable career spine and role-family projections; when absent, review fingerprints remain backward compatible. Before writing, the external agent builds an employer success brief, chooses a role-family lens, and asks focused questions when material experience may be missing. A high-stakes role deepens that same agent workflow; it does not create another profile store, CV engine, or tracker. User-supplied job links default to high stakes, discovered links default to standard, and `job-feedback.mjs` durably records either state.

Each applied role has durable Markdown/HTML source and PDF/DOCX output. `cv-bundle.mjs` verifies that all four name the same company/role, reference the current JD and review receipt, open/parse correctly, and still match their recorded SHA-256 hashes. `data/pdf-index.tsv` keeps its legacy report/PDF columns and stores the versioned bundle record in an optional sixth field.

For high-stakes roles, `high-stakes-pack.mjs` records the agent-authored `campaign-pack.md` and optional application-narrative/profile-change drafts under the same role `output/` folder. `data/high-stakes-packs.jsonl` binds their hashes to the current apply review, JD, verified CV bundle, and optional candidate positioning. The dashboard shows `missing|current|stale`; this is workflow visibility, not a second semantic decision or submit gate.

Claim states are advisory: sourced, reframed, or new/unconfirmed. Confirmed user claims are allowed. Hard technical failure is reserved for broken/missing files, wrong-role artifacts, or unresolved required/legal fields—not unfamiliar marketing wording.

## Application certainty

`application-preflight.mjs` is the single application handoff helper. It keeps user-approved reusable answers in an append-only user ledger, refuses credentials/payment/identity-document values, and records the host agent's structural live-page inspection without duplicating answer values. The agent judges whether visible company/title wording represents the selected role; code requires that judgment to be recorded and checks the active application-form stage, complete visible-field inventory, required/sensitive answer source, current review, exact CV hash, answer fingerprint, browser evidence, and 30-minute freshness. It does not own or automate the browser.

`application-attempt.mjs` is append-only. Starting an attempt requires a current fingerprint-bound `apply` review, the exact verified PDF or DOCX chosen for upload, a current unused ready preflight, no unresolved user-requested CV change or ignore action, and named approval from chat or a dashboard approval receipt bound to that exact CV/preflight. The receipt stores its file hash, CV-bundle fingerprint, preflight receipt, approved-answer fingerprint, and approval source. An attempt moves from `started` to exactly one of `confirmed`, `unknown`, `failed`, or `abandoned`. A confirmed finish uses `tracker.mjs status` to validate company/role identity, atomically replace the matching Markdown row, and rebuild the derived index before the final receipt is appended; a ledger-write failure rolls the lifecycle back. `unknown` is not `Applied` and blocks retry until the agent reconciles evidence and the user approves. The dashboard shows the latest attempt outcome on its job.

## Browser dashboard

`dashboard-server.mjs` binds only to `127.0.0.1`. It reads the tracker, report headers, CV manifest, saved JD, scan history, preflight, attempts, feedback, and high-stakes campaign-pack freshness. It serves only files under `reports/`, `output/`, and `jds/`. `job-feedback.mjs` appends stage-aware user actions, durable high-stakes/standard priority, and agent resolutions to `data/job-feedback.jsonl`; its pending-action reader returns high-stakes jobs first. The dashboard's default order puts viable high-stakes jobs before standard rank order. Resolving the latest priority action acknowledges it without erasing the selected state. The dashboard never changes the tracker or preferences and never submits by itself; the agent consumes each receipt through the existing product owners.

## Extension rule

New work must attach to an owner above. Do not add another engine, worker, ranker, tracker, dashboard, profile store, or instruction tree. When OSS is considered, record license, maturity, maintenance, failure modes, and a bounded trial.
