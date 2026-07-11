# Scripts

Status: current agent/developer command reference.

## ApplyCue Commands

| Command | Purpose |
|---|---|
| `pnpm applycue:setup` | Prepare or inspect the local ApplyCue profile setup. |
| `pnpm applycue:status` | Summarize current profile, latest run, artifacts, and next actions. |
| `pnpm applycue:source-canary` | Test configured public adapters individually and write timestamped/`latest` health evidence without ranking, CV generation, or application preparation. JobSpy is opt-in and capped to one query by default. |
| `pnpm applycue:uat` | Run local UAT checks. |
| `pnpm applycue:first-build` | Run the first local discovery/CV/application artifact build. |
| `pnpm applycue:form-data` | Generate or confirm the reusable master form data preview before portal fill. |
| `pnpm applycue:apply-route` | Execute or prepare the selected generated apply route; browser routes hand off to live preflight, email/DM routes write drafts, API/manual routes pause safely. |
| `pnpm applycue:approve-sources` | Save user-approved source-plan entries into the active profile. |
| `pnpm applycue:approve-answers` | Save user-approved reusable application answers and aliases. |
| `pnpm applycue:scan-email-leads` | Extract job leads from raw Gmail/Outlook connector exports and optionally import them with `--import`. |
| `pnpm applycue:import-email-leads` | Import normalized email lead records into the active user store. |
| `pnpm applycue:record-tuning` | Record user feedback or agent analysis as a local tuning signal. |
| `pnpm applycue:apply-tuning` | Dry-run or apply approved tuning signals into editable user config. |
| `pnpm applycue:record-outcome` | Record submitted, reply, interview, offer, rejection, withdrawal, or user-feedback evidence. |
| `pnpm applycue:record-decision` | Record a Codex, Claude, other agent, or user job decision with reasons, evidence, and backend-suggestion provenance. Hard gates cannot be overridden to `apply`. |
| `pnpm applycue:record-decisions` | Atomically record a reviewed JSON batch. Add `--prepare` to refresh the normal run and generate all approved application artifacts without a separate command. Unchanged retries are skipped. |
| `pnpm applycue:browser-live-preflight` | Open a real browser application page and verify it before fill/upload/submit. |
| `pnpm applycue:browser-live-apply` | Fill/upload from a current passing live preflight and pause or submit under policy. |
| `pnpm applycue:browser-uat` | Run browser dry-run checks. |
| `pnpm applycue:check` | Typecheck and test ApplyCue packages. |

For a new agent-led profile, use the existing config contract rather than editing the user store by hand:

```powershell
pnpm applycue:setup -- --input <approved-setup.json> --base-cv <candidate-cv.docx-or-pdf-or-text>
```

Without the minimum identity/contact, base CV, and target roles, setup creates only the profile skeleton and reports `needs_profile`; it does not generate an empty first-run manifest.

## Removed career-ops commands

The old root commands and their forked implementation have been removed from this branch. Historical comparisons remain in dated reviews and Git history. Supported ApplyCue code must not restore or call the old control plane.

Do not expose raw commands as the normal user journey. The agent should run them and explain the outcome in chat.

For an explicit wider queue after the user asks for more results, the agent can run:

```powershell
pnpm applycue:first-build -- --more-results --target-ranking-queue 200
```

This is still bounded by saved hard preferences such as geography, work authorization, blocked companies, fraud signals, and unsafe portals. The full ranked decision queue is written to `outputs/runs/latest-job-decisions.json` for agent review.

Normal operation runs `first-build` to refresh the full evidence-rich audit queue and immediately prepare clear matches. If the target is not filled or a clear decision looks wrong, Codex/Claude reviews only the ambiguous rows and uses `record-decisions -- --input <reviewed-decisions.json> --prepare`. Clear system matches plus recorded `apply` decisions, capped by `applicationsPerDay`, proceed to CV and application artifacts. UAT retains explicit test-only authority.

For live public-source evidence without running the product pipeline:

```powershell
pnpm applycue:source-canary
pnpm applycue:source-canary -- --include-jobspy
pnpm applycue:source-canary -- --include-disabled --include-jobspy
pnpm applycue:source-canary -- --include-ats-directory
```

The first command checks enabled direct public feeds and skips JobSpy and the ATS directory. `--include-jobspy` tests one approved JobSpy query by default; use `--jobspy-limit <count>` only for a deliberate wider canary. `--include-disabled` probes configured disabled sources without changing their saved state. `--include-ats-directory` explicitly allows the bounded JobHive directory fan-out. Empty results are warnings. Transport/parser errors are failures and return a non-zero process exit so automation cannot claim success. Reports stay under the active profile's `outputs/source-canaries/` directory.
