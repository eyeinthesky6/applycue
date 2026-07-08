# Local Usable State

Date: 2026-07-06

## Decision

ApplyCue is not usable just because `pnpm applycue:first-build` writes files.

The first local usable state means a user or agent can run one command and immediately answer:

- which profile was used
- where user assets were loaded from
- which jobs were considered
- which jobs were prepared
- which CVs were generated
- which reconciliation reports passed or need review
- which browser apply plan was created for each prepared application
- whether each application can be submitted automatically
- what the next human or agent action is
- where the dashboard and manifest are

## Local Usable Command

The first usable command is:

```powershell
pnpm applycue:first-build
```

It should:

1. resolve the external user profile store
2. load local jobs
3. apply hard gates and prepare a shortlist
4. generate `standard_ats_v1` CVs for serious jobs
5. write reconciliation reports
6. create application drafts
7. create browser apply plans for each prepared draft
8. write local state and outputs under the active output root
9. render a readable dashboard
10. print dashboard and manifest paths

## Dashboard Requirements

The dashboard must show more than counts.

It should include:

- profile id
- output root
- run id
- generated time
- application status counts
- one row/card per prepared application
- company and role title
- application status
- CV path
- reconciliation path
- browser plan path
- reconciliation status
- auto-submit status
- pause reasons
- next actions
- notes
- latest live preflight status, if a real portal was inspected
- answer prompt counts and review links when live preflight pauses

Raw backend ordering signals should stay hidden. Priority reasons may appear later if phrased as plain reasons, not as personal judgment.

## Output Root Rule

For real user runs, dashboard and generated CVs live under:

```text
~/.applycue/profiles/<profile>/outputs/
```

Repo-local `outputs/` is only for sample/development fallback.

## Not Usable Yet

This local milestone does not require:

- browser application submission
- external job-board scraping
- email tracking
- multi-template CV exports
- SaaS dashboard
- social/network intelligence

Those come after the local run is reviewable and trustworthy.

## Usable-State Checklist

Before saying "usable":

- `pnpm applycue:check` passes
- `pnpm applycue:first-build` passes
- dashboard is generated under the active output root
- dashboard shows prepared job details and links
- run manifest records generated files
- closed jobs do not receive generated CVs, application drafts, or browser plans
- reconciliation report exists for each generated CV
- rendered CV completeness passes for generated CV Markdown before DOCX/browser handoff
- browser apply plan exists for each prepared application
- live preflight pauses appear in the dashboard and chat summary before any real form fill
- stale live preflight pauses from older prepared plans are not treated as the next action
- no real user assets are stored inside the repo
- no source files are written during an application run
