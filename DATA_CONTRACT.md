# ApplyCue Data Contract

## User layer — never auto-overwrite or commit

| Path | Purpose |
| --- | --- |
| `cv.md` | exact supplied/base CV |
| `config/profile.yml` | confirmed candidate/search settings |
| `modes/_profile.md`, `modes/_custom.md` | candidate-specific guidance |
| `portals.yml` | approved source/search configuration |
| `article-digest.md`, `writing-samples/`, `interview-prep/` | approved evidence/style/story assets |
| `data/applications.md` | canonical application history |
| `data/applications.db` | derived SQLite query index; safe to rebuild |
| `data/pipeline.md` | pending job URLs |
| `data/scan-history.tsv` | scan history and exact-URL identity |
| `data/application-attempts.jsonl` | append-only attempt receipts |
| `data/job-feedback.jsonl` | dashboard fit feedback |
| `data/pdf-index.tsv` | generated role/report-to-PDF links |
| `reports/` | full-JD review reports |
| `output/` | generated CVs, letters, dashboard snapshots |
| `jds/` | locally archived job descriptions |

The user layer may contain private data and is gitignored. Do not copy it into examples, tests, docs, commits, issues, logs, or model prompts beyond the user's approved workflow.

## System layer — versioned product code

Root scripts, `providers/`, `modes/` except user overrides, `templates/`, `skills/`, CLI bridges, docs, updater, tests, plugin scaffolding, and package metadata.

User preferences never belong in system files. Shared product fixes never belong in one candidate's user files.

## Canonical ownership

- Markdown tracker is authoritative; SQLite is derived.
- Full report and durable CV source files are authoritative for a role's generated artifacts.
- Application attempt receipts are append-only evidence; they do not replace the tracker.
- The PDF index is derived from generated user artifacts and must remain gitignored.
- Dashboard feedback is input for agent discussion, not automatic configuration.
- The separate typed `%USERPROFILE%\.applycue\profiles\...` store is not part of this runtime.

## Updates

`update-system.mjs` may update only declared system paths. It must not touch the user layer. Before applying an update, preserve uncommitted system changes and verify rollback.
