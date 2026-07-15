# Mode: patterns -- Outcome Pattern Review

## Purpose

Analyze tracked outcomes to learn which role shapes, sources, companies, locations, decisions, and recurring gaps are producing useful applications or traction. Historical fit scores may remain readable but are not analyzed and never become a threshold.

## Inputs

- `data/applications.md` -- canonical tracker
- `reports/` -- evidence-backed role reviews
- `data/job-feedback.jsonl` -- user job actions, CV-change notes, and explained reusable feedback
- `config/profile.yml` and `modes/_profile.md` -- confirmed preference context
- `portals.yml` -- source configuration

## Minimum evidence

Require at least five rows beyond a pending evaluation. If there are fewer, report the count and wait for more outcomes. An application is useful workflow evidence; a response/interview/offer is stronger market evidence. Do not describe every applied row as a successful match.

## Run

```bash
node analyze-patterns.mjs
```

Use its funnel, archetype, blocker, remote-policy, company-size, gap, and recommendation outputs. If it returns an error, show the error and stop.

## Report

Write `reports/pattern-analysis-{YYYY-MM-DD}.md` with:

1. evidence count and date range;
2. conversion funnel;
3. archetype and role-shape outcomes;
4. source and remote-policy outcomes when evidence exists;
5. recurring blockers/gaps and user-feedback disagreements;
6. proposed changes, each tied to evidence and expected effect.

Do not report score averages, score floors, or PDF thresholds. Low sample sizes and changing rubrics make those numbers misleading.

## Preference change boundary

Present recommendations to the user before changing `portals.yml`, `config/profile.yml`, or `modes/_profile.md`. Feedback can propose a preference, title, geography, source, or framing change; it cannot save one automatically. State exactly which confirmed preference would change and what future decisions it affects.

## Outcome classes

| Status | Outcome |
|--------|---------|
| Responded, Interview, Offer | market traction |
| Applied | application completed; outcome still pending |
| Rejected, Discarded | negative/closed outcome |
| SKIP | agent/user self-filtered |
| Evaluated | decision or action pending |
