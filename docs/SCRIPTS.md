# ApplyCue Scripts

Normal users talk to the agent. These commands are implementation details.

| Command | Purpose |
| --- | --- |
| `npm run doctor` | Check onboarding and local prerequisites. |
| `npm run scan` | Scan configured sources. |
| `node verify-pipeline.mjs` | Validate pipeline/tracker integrity. |
| `node review-evidence.mjs capture --job=N --input=<full-jd-file> --url=<url> --actor=codex --live-state=live --method=agent_browser --confirmed-complete` | Store a durable expanded JD and its content fingerprint. |
| `node review-evidence.mjs record --job=N --jd=<capture-path> --actor=codex` | Bind a final tracker decision to the current JD, preferences, candidate evidence, and report. |
| `node review-evidence.mjs check --job=N` | Verify that the stored final decision is still current; stale inputs produce an effective pending decision. |
| `npm run tracker -- query --limit 20` | Query the derived tracker index. |
| `npm run tracker -- migrate-metadata --current-ids <ids> --legacy-ids <ids>` | Preview Decision/Rank/Confidence/Origin migration for an old tracker; add `--write` only after the IDs are confirmed. |
| `npm run dashboard` | Open the live local browser dashboard. |
| `npm run build:dashboard` | Build a read-only HTML dashboard snapshot. |
| `node job-feedback.mjs pending [--job=N]` | List unprocessed dashboard prepare/ignore/form/CV-change/apply receipts for the agent. |
| `node job-feedback.mjs resolve --id=ID --actor=codex [--bundle-fingerprint=NEW_HASH]` | Resolve a processed dashboard action. A CV-change request needs the new verified bundle fingerprint. |
| `npm run pdf -- <in.html> <out.pdf>` | Render an ATS PDF. |
| `npm run docx -- <in.md> <out.docx>` | Render an ATS DOCX. |
| `node cv-bundle.mjs record --job=N --md=<md> --html=<html> --pdf=<pdf> --docx=<docx> --actor=codex --format=a4` | Verify and record a role's four-file CV bundle against the current JD and decision. |
| `node cv-bundle.mjs check --job=N --cv=<selected.pdf-or-docx>` | Verify bundle freshness and the exact PDF/DOCX selected for upload. |
| `node application-preflight.mjs approve-answer --field=notice_period --value="30 days" --alias="When can you join?" --actor=codex --approved-by-user` | Save one explicitly approved reusable form answer; secret/payment/identity fields are refused. |
| `node application-preflight.mjs record ... --fields-file=data/application-preflight-input.json --identity-confirmed-by-agent --all-visible-fields-captured --inspection-only` | Bind the host agent's no-fill live-form inspection to the current job, review, exact CV, and answer set. |
| `node application-preflight.mjs check --job=N --company=Acme --title="Product Lead" --url=<url> --cv=<selected.pdf-or-docx>` | Verify the ready preflight is current and no older than 30 minutes. |
| `npm run application -- check --job=N` | Inspect the latest application attempt. |
| `node application-attempt.mjs start ... --approval-receipt=ID` | Start the exact named attempt approved from the dashboard; the receipt must still match the current CV and preflight. |
| `node application-attempt.mjs finish --attempt=ID --outcome=confirmed --evidence="Application received"` | Finish an attempt; confirmed outcomes reconcile the exact tracker row and derived index. |
| `node tracker.mjs status --num=N --status=Applied --company=Acme --title="Product Lead" --dry-run` | Preview the guarded lifecycle mutation used by application reconciliation. |
| `npm run check` | Run system-path coverage and the full regression suite. |

Provider, liveness, merge, reconcile, follow-up, plugin, and update commands remain available in `package.json`. Embedded OpenAI/Gemini/Ollama/OpenRouter evaluators were removed from the launch runtime; optional future trials are governed by `docs/ai-judgment-trial-plan.md`.
