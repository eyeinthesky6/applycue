# Scripts

## ApplyCue Commands

| Command | Purpose |
|---|---|
| `pnpm applycue:setup` | Prepare or inspect the local ApplyCue profile setup. |
| `pnpm applycue:status` | Summarize current profile, latest run, artifacts, and next actions. |
| `pnpm applycue:uat` | Run local UAT checks. |
| `pnpm applycue:first-build` | Run the first local discovery/CV/application artifact build. |
| `pnpm applycue:form-data` | Generate or confirm the reusable master form data preview before portal fill. |
| `pnpm applycue:apply-route` | Execute or prepare the selected generated apply route; browser routes hand off to live preflight, email/DM routes write drafts, API/manual routes pause safely. |
| `pnpm applycue:scan-email-leads` | Extract job leads from raw Gmail/Outlook connector exports and optionally import them with `--import`. |
| `pnpm applycue:record-tuning` | Record user feedback or agent analysis as a local tuning signal. |
| `pnpm applycue:apply-tuning` | Dry-run or apply approved tuning signals into editable user config. |
| `pnpm applycue:browser-live-preflight` | Open a real browser application page and verify it before fill/upload/submit. |
| `pnpm applycue:browser-live-apply` | Fill/upload from a current passing live preflight and pause or submit under policy. |
| `pnpm applycue:browser-uat` | Run browser dry-run checks. |
| `pnpm applycue:check` | Typecheck and test ApplyCue packages. |

## Base Workflow Commands

| Command | Purpose |
|---|---|
| `npm run doctor` | Check repo-local setup files. |
| `npm run scan` | Scan configured sources. |
| `npm run tracker` | Work with the application tracker. |
| `npm run build:dashboard` | Build the terminal dashboard. |

Do not expose raw commands as the normal user journey. The agent should run them and explain the outcome in chat.

For an explicit wider queue after the user asks for more results, the agent can run:

```powershell
pnpm applycue:first-build -- --more-results --target-ranking-queue 200
```

This is still bounded by saved hard preferences such as geography, work authorization, blocked companies, fraud signals, and unsafe portals. The full ranked decision queue is written to `outputs/runs/latest-job-decisions.json` for agent review.
