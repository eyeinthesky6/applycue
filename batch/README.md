# Batch Processing

Process multiple job offers via headless workers. Each worker reads the full JD and confirmed preferences, writes an A-G review plus `apply|watch|skip` decision/confidence, creates artifacts only for `apply`, and writes a tracker addition. The main agent compares completed apply reviews and assigns cross-role ranks.

## Quick Start

1. **Add offers** to `batch-input.tsv` (tab-separated: `id`, `url`, `source`, `notes`):

   ```tsv
   id	url	source	notes
   1	https://jobs.example.com/role-a	LinkedIn	
   2	https://greenhouse.io/company/role-b	Greenhouse	priority
   ```

2. **Dry run** to preview what will be processed:

   ```bash
   ./batch/batch-runner.sh --dry-run
   ```

3. **Run the batch**:

   ```bash
   ./batch/batch-runner.sh
   ```

4. **Results** are automatically merged into `data/applications.md`, processed offers are reconciled out of the `data/pipeline.md` inbox, and integrity is verified with `verify-pipeline.mjs` at the end of the run.

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--parallel N` | `1` | Number of concurrent headless workers |
| `--dry-run` | off | Preview pending offers without processing |
| `--retry-failed` | off | Only retry offers marked as `failed` in state |
| `--resume-paused` | off | Resume offers paused after a Claude session/rate limit |
| `--start-from N` | `0` | Skip offers with ID below N |
| `--limit N` | `0` | Max number of offers to process in this run (0 = no limit) |
| `--max-retries N` | `2` | Max retry attempts per offer before giving up |
| `--rate-limit-sleep N` | `300` | Seconds to wait before retrying a transient rate-limited worker; use `0` to pause the batch immediately |

## Directory Layout

```
batch/
  batch-runner.sh          # Orchestrator script
  batch-prompt.md          # Prompt template sent to each worker
  batch-input.tsv          # Input offers (you create this)
  batch-state.tsv          # Processing state (auto-managed, resumable)
  logs/                    # Per-offer worker logs ({report_num}-{id}.log)
  tracker-additions/       # TSV lines produced by workers
    merged/                # TSVs already merged into applications.md
```

## How It Works

1. **batch-runner.sh** reads `batch-input.tsv` and `batch-state.tsv` to determine which offers need processing.
2. For each pending offer, it assigns a report number and launches a headless worker with `batch-prompt.md` as the system prompt (placeholders like `{{URL}}`, `{{REPORT_NUM}}` are resolved).
3. Each worker reviews the offer, writes a report to `reports/`, generates application artifacts only for `apply`, and writes a tracker TSV to `tracker-additions/`.
4. After all workers finish, batch-runner calls `merge-tracker.mjs` to merge TSVs into `data/applications.md`, `reconcile-pipeline.mjs` to move processed offers out of the `data/pipeline.md` inbox, and `verify-pipeline.mjs` to check integrity.

## Tracker Merge

Workers write one TSV per offer to `batch/tracker-additions/`. The merge script (`npm run merge`) handles:

- Deduplication by exact report/tracker identity only; similar company/title rows stay separate for agent review
- Column order conversion (TSV keeps the legacy score cell as `N/A`). Optional TSV fields after notes are `location`, `decision`, `rank`, `confidence`, and `origin`; new rows default to `current`, while `Evaluated` without an explicit agent marker remains `pending`.
- In-place updates for the same exact record when a newer explicit review arrives; lifecycle progress is preserved and score is ignored
- Moving processed TSVs to `tracker-additions/merged/`

Run `npm run merge` manually if you need to merge outside of a batch run.

## Pipeline Reconcile

Batch mode reads offers from `batch-input.tsv`, but the `data/pipeline.md` inbox is a separate list. Without reconciliation, an offer evaluated by a batch run stays in the pipeline "Pendientes" section and gets surfaced again on the next scan or `/applycue pipeline` run -- producing duplicate reports.

`reconcile-pipeline.mjs` (run as `npm run reconcile`) closes that gap: after the tracker merge, every `completed` or historical `skipped` offer in `batch-state.tsv` whose URL is still in pipeline "Pendientes" is moved to "Procesadas" with its report link, decision/rank, and PDF state (entries without a report file on disk are left in place). It is idempotent -- safe to run after every batch, or manually.

## Resumability

`batch-state.tsv` tracks the status of every offer (`pending`, `processing`, `completed`, `failed`, `skipped`, `rate_limited`, `paused_rate_limit`). If the batch is interrupted, re-running `batch-runner.sh` picks up where it left off -- completed offers are skipped automatically. `rate_limited` is a non-completed state used while the runner waits before retrying, so interrupted rate-limited jobs are eligible on the next normal run.

`paused_rate_limit` is different: it means a worker hit a Claude session/usage limit, so the runner stopped scheduling new offers and preserved the retry count. Resume those rows explicitly after the limit resets:

```bash
./batch/batch-runner.sh --resume-paused
```

A PID-based lock file (`batch-runner.pid`) prevents concurrent batch runs. If a previous run crashed, the stale lock is detected and removed automatically.

## Prerequisites

- Your CLI in PATH (see **Headless / Batch Mode** table in `AGENTS.md`)
- Node.js >= 18, Playwright chromium installed (`npm run doctor` to verify)
- `batch-input.tsv` with at least one offer
