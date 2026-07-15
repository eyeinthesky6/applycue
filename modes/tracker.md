# Mode: tracker — Applications Tracker

Read and display `data/applications.md`.

**Tracker Format:**

```markdown
| # | Date | Company | Role | Score | Status | Decision | Rank | Confidence | Origin | PDF | Report | Notes |
```

`Decision` is the agent's final semantic choice: `pending`, `apply`, `watch`, or `skip`. `Rank` explicitly orders current apply roles; `Confidence` is `high`, `medium`, `low`, or `unknown`. `Status` is the application lifecycle below. Do not use `Evaluated` as evidence that a role was shortlisted. `Origin` is internal provenance (`current`, `legacy_import`, `mail_import`, or `legacy_unknown`); mention it to the user only for imported/history rows. `Score` is a legacy compatibility cell; new reviews use `N/A`.

Possible states: `Evaluated` → `Applied` → `Responded` → `Interview` → `Offer` / `Rejected` / `Discarded` / `SKIP`

- `Evaluated` = offer evaluated with report, pending decision
- `Applied` = the candidate submitted their application
- `Responded` = Company has responded (not yet interview)
- `Interview` = active interview process
- `Offer` = job offer received
- `Rejected` = rejected by company
- `Discarded` = discarded by candidate or offer closed
- `SKIP` = doesn't fit, don't apply

If the user asks to update a state, edit `Status`. If the agent finishes a role review, record `Decision`, `Rank`, and `Confidence` separately.

Also show statistics:
- Total applications
- Breakdown by state
- Decision and confidence breakdown; ranked current apply queue
- % with PDF generated
- % with report generated
