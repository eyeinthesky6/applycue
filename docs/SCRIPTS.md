# Scripts

## ApplyCue Commands

| Command | Purpose |
|---|---|
| `pnpm applycue:setup` | Prepare or inspect the local ApplyCue profile setup. |
| `pnpm applycue:status` | Summarize current profile, latest run, artifacts, and next actions. |
| `pnpm applycue:uat` | Run local UAT checks. |
| `pnpm applycue:first-build` | Run the first local discovery/CV/application artifact build. |
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
