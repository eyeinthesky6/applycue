# ApplyCue Scripts

Normal users talk to the agent. These commands are implementation details.

| Command | Purpose |
| --- | --- |
| `npm run doctor` | Check onboarding and local prerequisites. |
| `npm run scan` | Scan configured sources. |
| `node verify-pipeline.mjs` | Validate pipeline/tracker integrity. |
| `npm run tracker -- query --limit 20` | Query the derived tracker index. |
| `npm run dashboard` | Open the live local browser dashboard. |
| `npm run build:dashboard` | Build a read-only HTML dashboard snapshot. |
| `npm run pdf -- <in.html> <out.pdf>` | Render an ATS PDF. |
| `npm run docx -- <in.md> <out.docx>` | Render an ATS DOCX. |
| `npm run application -- check --job=N` | Inspect the latest application attempt. |
| `npm run check` | Run system-path coverage and the full regression suite. |

Provider, liveness, merge, reconcile, follow-up, plugin, update, and evaluator commands remain available in `package.json`. Do not expose optional evaluator/API commands as MVP requirements.
