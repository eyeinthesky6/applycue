# ApplyCue Data Contract

## User layer — never auto-overwrite or commit

| Path | Purpose |
| --- | --- |
| `cv.md` | exact supplied/base CV |
| `candidate-positioning.md` | optional user-confirmed career spine, reusable role-family projections, wording boundaries, and public-asset consistency notes |
| `config/profile.yml` | confirmed candidate/search settings |
| `modes/_profile.md`, `modes/_custom.md` | candidate-specific guidance |
| `portals.yml` | approved source/search configuration |
| `article-digest.md`, `writing-samples/`, `interview-prep/` | approved evidence/style/story assets |
| `data/applications.md` | canonical application history |
| `data/applications.db` | derived SQLite query index; safe to rebuild |
| `data/pipeline.md` | pending job URLs |
| `data/scan-history.tsv` | scan history and exact-URL identity |
| `data/application-attempts.jsonl` | append-only attempt receipts |
| `data/application-answers.jsonl` | append-only user-approved reusable form answers and revocations; secrets and identity-document numbers are refused |
| `data/application-preflights.jsonl` | append-only live-form inspection receipts bound to the current job, review, CV, and approved-answer fingerprint |
| `data/application-preflight-input.json` | optional short-lived agent-authored structural snapshot of currently visible fields; contains no answer values |
| `data/review-receipts.jsonl` | append-only final-decision receipts bound to full-JD and confirmed user inputs |
| `data/job-feedback.jsonl` | append-only dashboard job actions, durable high-stakes/standard priority, CV-change notes, exact apply approvals, and agent resolutions |
| `data/high-stakes-packs.jsonl` | append-only receipts binding an agent-authored high-stakes campaign pack to the current review, CV bundle, candidate positioning, and output hashes |
| `data/pdf-index.tsv` | generated report/PDF links plus versioned CV-bundle records and file hashes |
| `reports/` | full-JD review reports |
| `output/` | generated CVs, letters, dashboard snapshots |
| `jds/` | locally archived job descriptions |

The user layer may contain private data and is gitignored. Do not copy it into examples, tests, docs, commits, issues, logs, or model prompts beyond the user's approved workflow.

## System layer — versioned product code

Root scripts, `providers/`, `modes/` except user overrides, `templates/`, `skills/`, CLI bridges, docs, updater, tests, plugin scaffolding, and package metadata.

User preferences never belong in system files. Shared product fixes never belong in one candidate's user files.

## Canonical ownership

- Markdown tracker is authoritative; SQLite is derived.
- Tracker `Decision` (`pending|apply|watch|skip`) records the agent's semantic choice. `Rank` is the explicit relative order of the current apply queue and `Confidence` is `high|medium|low|unknown`. Tracker `Status` records the application lifecycle. `Evaluated` never means shortlisted by itself.
- New reviews write `Score=N/A`. Numeric score cells remain only for historical compatibility and cannot decide, rank, replace, deduplicate, or gate artifacts.
- Tracker `Origin` (`current|legacy_import|mail_import|legacy_unknown`) is internal provenance. Current-run dashboard counts include only `current`; the UI shows an origin badge only for imported/history rows, so a new user sees no provenance clutter.
- Full report and durable CV source files are authoritative for a role's generated artifacts. A current CV-bundle record binds the Markdown, HTML, PDF, and DOCX to the current job, JD fingerprint, review receipt, and file hashes.
- Application attempt receipts are append-only evidence; they do not replace the tracker. A confirmed finish must reconcile the exact company/role tracker row to `Applied` and rebuild the derived index before recording the final receipt. Confirmed finishes count toward optional feedback milestones at 5, 10, 15, and so on; other outcomes do not. The same ledger may store one `product_review` acknowledgement only after the user says a review was posted, which suppresses later prompts. It stores no review content, changes no lifecycle state, and adds no submission gate.
- Reusable form answers have one owner: `data/application-answers.jsonl`. Saving or replacing one requires explicit user approval. Passwords, OTPs, tokens, payment data, and identity-document numbers are never reusable. A preflight stores the answer-set fingerprint, not duplicate answer values.
- `application-preflight.mjs` records the host agent's structural live-page inspection. Code requires an active application-form stage, every visible field classified, sensitive answers tied to approved/profile/one-off user evidence, a current review and exact CV bundle, and browser evidence no older than 30 minutes. It does not decide semantic identity or control the browser.
- The PDF index is derived from generated user artifacts and must remain gitignored. Its first five tab-separated fields retain the legacy report/PDF/HTML/format/date shape; an optional sixth field stores versioned bundle JSON. A changed artifact, JD, confirmed preference, report, or decision invalidates the old bundle until it is regenerated and recorded again.
- An application attempt must name the selected PDF or DOCX and a current unused ready preflight. The start receipt stores the CV hash, bundle fingerprint, preflight receipt, and approved-answer fingerprint; Markdown, HTML, unverified, stale, or uninspected forms cannot start.
- Dashboard actions are user input, not a second tracker or application engine. `mark_high_stakes` and `mark_standard` select preparation depth; the latest one remains effective even after the agent resolves its receipt. Viable high-stakes work is returned and displayed before the standard ranked queue, but priority does not create an `apply` decision or bypass a gate. `prepare`, `inspect_form`, and `ignore` wait for the agent to use the existing owners. A pending `ignore` is a user stop and blocks application. `approve_apply` is valid only for its exact CV bundle/file and live-form preflight. An unresolved `request_cv_change` blocks application start until a different verified bundle is recorded and the request is resolved against it. No dashboard action changes preferences automatically.
- Preferences are confirmed during setup, read before each role decision/rank and role-specific draft, and changed only with user approval.
- A current final decision is effective only while its latest review receipt matches the stored full JD, confirmed preferences, candidate evidence, report, and tracker decision/rank/confidence. A mismatch produces an effective `pending` decision without deleting history.
- `candidate-positioning.md` is optional. When absent, existing review behavior is unchanged. Once the user confirms and creates it, it joins the candidate-evidence fingerprint so later edits make unsubmitted decisions stale. It is not a second CV or profile database.
- A high-stakes campaign pack is agent-authored under the role's existing `output/` folder and recorded by `high-stakes-pack.mjs`. Its receipt proves freshness; it does not decide fit, replace the verified CV bundle, mutate the tracker, or create a new application gate. Missing/stale pack status is visible on the dashboard for high-stakes roles.
- The separate typed `%USERPROFILE%\.applycue\profiles\...` store is not part of this runtime.

## Updates

`update-system.mjs` may update only declared system paths. It must not touch the user layer. Before applying an update, preserve uncommitted system changes and verify rollback.
