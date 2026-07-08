# Discovery Inspiration And Build Decision

Date: 2026-07-06

Updated: 2026-07-08

## Decision

Superseded.

The earlier decision was to build ApplyCue as its own product and engine while using career-ops only as inspiration. That changed on 2026-07-08.

Current decision: start ApplyCue from a fork of career-ops, preserve attribution, and add ApplyCue layers on top first.

Reason for the change:

- career-ops is useful proof that the local loop can work.
- career-ops already has source scanning, pipeline tracking, reports, CV artifact generation, batch habits, and agent CLI routing.
- Speed to working UAT matters more than ego or a clean-room story.
- ApplyCue can still become a different product by adding profile-store separation, truth reconciliation, browser-apply receipts, apply policy, and outcome learning.
- If we later need independence, replace pieces gradually after the workflow is proven.

## What career-ops Proves

career-ops is useful because it has a working loop:

- user profile and CV live in a user layer
- source scanning feeds a pipeline
- jobs are filtered and deduped before deeper evaluation
- ATS and job-board adapters avoid asking an agent to read every page
- generated CV/report artifacts are tracked
- dashboards and integrity checks help the user see what happened
- the same command router is discoverable from several agent CLI layouts

The strongest pattern to keep is its source-adapter discipline:

```text
configured source -> provider fetch -> normalized job -> filters -> dedupe -> pipeline
```

ApplyCue should use the same broad shape, but with our own contracts:

```text
source adapter -> JobRecord -> hard gates -> agent shortlist -> CV engine -> apply assistant -> tracker
```

## What To Avoid Or Change From career-ops

Do not copy these into ApplyCue:

- score-heavy user experience
- a fixed company list as the main product
- agent editing code or prompts for one application
- user assets inside the source repo
- human-only final application flow as the default
- markdown tables as the long-term source of truth
- multiple divergent router files with separate business rules

career-ops is a strong local power-user product. ApplyCue should become a CV-to-offer agent with automation as the default and user oversight through policy.

## OSS References Checked

These are references, not current dependencies.

| Project | License / Fit | Decision |
| --- | --- | --- |
| career-ops | MIT, working local product | Current upstream base for the fork. Preserve attribution and replace pieces only when needed. |
| JobSpy | MIT, job-board scraping breadth | Use as the first broad job-board bridge behind `packages/discovery`. Do not make it the core engine. |
| JSON Resume | MIT, structured resume schema | Use as schema inspiration for structured profile/CV facts. |
| Resume Matcher | Apache-2.0, ATS/resume matching | Use as inspiration for ATS checks and keyword feedback, not as the truth layer. |
| OpenResume | AGPL-3.0, resume builder/parser | Avoid as a dependency; license is not clean for our planned distribution. Product ideas are useful. |
| Reactive Resume | MIT, resume builder | Later reference for self-hosted resume UI/export, not v1 core. |
| ApplyPilot | AGPL-3.0, close autonomous apply product | Avoid dependency. Study product stages and risks only. |
| Browser Use | MIT, browser-agent framework | Possible later execution layer; current local build should keep browser execution behind our apply policy. |
| agent-browser | Apache-2.0, browser automation CLI | Possible later execution bridge for multi-environment browser control. |
| OpenClaw | MIT, chat/assistant runner | Good future distribution/channel reference, not needed for local engine now. |
| Crawl4AI | Apache-2.0, public web extraction | Use later for public careers pages or posts that have no useful API. |
| Firecrawl | AGPL-3.0 repo plus hosted API | Optional cloud connector only with explicit user approval. Do not make it default. |

Reference links:

- career-ops local repo: `C:\Projects\career-ops`
- JobSpy: https://github.com/speedyapply/JobSpy
- JSON Resume schema: https://github.com/jsonresume/resume-schema
- Resume Matcher: https://github.com/srbhr/Resume-Matcher
- OpenResume: https://github.com/xitanggg/open-resume
- Reactive Resume: https://github.com/amruthpillai/reactive-resume
- ApplyPilot: https://github.com/Pickle-Pixel/ApplyPilot
- Browser Use: https://github.com/browser-use/browser-use
- agent-browser: https://github.com/vercel-labs/agent-browser
- OpenClaw: https://github.com/openclaw/openclaw
- Crawl4AI: https://docs.crawl4ai.com/
- Firecrawl: https://github.com/firecrawl/firecrawl

See also:

- `docs/prebuilt-providers-and-libraries.md`

## Discovery Build Order

ApplyCue discovery should grow in layers.

1. Generated source plan from CV, profile, and preferences.
2. User confirmation and approved source config.
3. Manual file/URL/text import as fallback input.
4. Source adapter contract for public ATS and job boards.
5. Company/ATS adapters such as Greenhouse, Lever, Ashby, Workable, SmartRecruiters, BambooHR, Breezy, Recruitee, Pinpoint, Workday, Personio, and Rippling.
6. JobSpy bridge for broad job-board adapters.
7. Browser-visible extraction when a page has no API.
8. Social/community/newsletter/email leads.
9. Liveness, trust, and outcome-based source learning.

Manual import is useful for testing, pasted JDs, and edge cases. It is not the primary discovery lane.

## Source Ownership

Keep source origins separate:

- `system_generated`: created by ApplyCue from CV/profile/preferences and written to `data/local/source-plan.generated.json`.
- `agent_suggested`: proposed by an agent after research, browser work, or user chat.
- `user_added`: explicitly added by the user or accepted into editable config.

Generated source-plan files are engine output. Do not hand-edit them.

Approved active sources live in user-editable config, for example `sources.companyPages`.

If a generated source duplicates an approved source, mark it with `duplicateOf`. Do not create duplicate active source entries.

## Source Search Profile

Status: implemented and active in the local engine on 2026-07-06.

career-ops gets relevance partly from `portals.yml` filters:

```text
title_filter + location_filter + content_filter -> fewer weak jobs enter the pipeline
```

ApplyCue keeps that pattern, but not the fixed personal list. Each generated source plan now includes a `searchProfile` derived from the active user's profile:

```text
user profile/preferences/search settings -> searchProfile -> source suggestions and live source-quality filters
```

The search profile contains:

- positive and negative title terms
- seniority boost terms
- allowed and ask-before locations
- required, positive, and negative content terms
- preferred or blocked source hints

It is still generated output, so agents must not hand-edit it. To change it, update the user's profile/preferences or source settings and regenerate the plan.

This is the first direct career-ops parity move: better source quality before expensive evaluation, now carried forward as ApplyCue-owned behavior in the fork.

Current local run evidence:

```text
1135 discovered jobs -> 18 source-quality kept -> 3 CVs -> 3 application drafts -> 3 browser plans
```

The source-quality filter currently runs before shortlist preparation. Manual jobs are not filtered by this generated plan, because manual imports are deliberate user/agent inputs and should remain reviewable.

## career-ops Parity Lessons From UAT

Status: implemented on 2026-07-06 for the local UAT path.

career-ops gets useful outcomes because noisy jobs are cleaned before expensive evaluation. ApplyCue now mirrors that lesson in its own contracts:

```text
broad source results -> source-quality filter -> hard gates -> agent shortlist -> metadata-cleaned JD requirements -> reconciliation -> truth-checked review batch
```

Applied fixes:

- keep backend ordering subordinate to apply/review/watch/skip decisions
- hard-block low role-fit, adjacent-only, description-only, and wrong-family matches before CV work
- keep adjacent-only terms out of default source queries and source-quality title positives unless they are also target terms
- strip reporting-line and provider appendix noise before requirement extraction
- map regulated financial-services requirements only when approved banking/lending evidence exists
- keep the generated CV full and structured, with no empty employer headings

This improved local relevance and truth checks while filling the configured daily batch:

```text
1135 discovered jobs -> 18 kept jobs -> 3 CVs -> 3 application drafts -> 3 browser plans -> 0 blocked reconciliations
```

The engine still warns when the prepared batch does not fill `applicationsPerDay`; the current local run correctly still warns because remaining kept jobs are mostly below the saved seniority target or outside saved location/work-authorization policy. The right next move is better source coverage or explicit user approval to relax preferences, not weakening hard blockers.

The local dashboard now has a typed Source Quality panel fed from the run manifest:

```text
discovered -> kept before shortlist -> filtered before CV work -> filtered-by reason
```

This copies career-ops's useful pipeline visibility pattern without making raw scores the user-facing product.

The job-board source plan now spends its query budget on distinct target role names before role-plus-industry variants. This helped the local setup approve additional safe no-login JobSpy queries such as `product management`, `chief product officer`, `product marketing`, and `director product fintech`, improving volume without lowering CV truth checks.

## What ApplyCue Was Doing Worse Than career-ops

Current status from UAT:

- Too much broad job-board noise entered the batch. Fixed by applying generated `searchProfile` filters before shortlist preparation.
- Ordering was too mechanical. The new stance is that the agent judges fuzzy fit while code keeps hard gates and backend ordering simple.
- Adjacent jobs could look stronger than real product-leadership matches because descriptions contained product words. Fixed by capping weak title matches unless explicitly targeted.
- CV artifacts were at risk of becoming extracts. Fixed by preserving full `standard_ats_v1` CVs with contact, summary, skills, employer history, awards, education, Markdown, HTML, and DOCX outputs.
- Agents still needed too much repo awareness. Partly fixed by source approval and UAT commands; still a live gap until the setup skill hides repo commands from normal users.

Remaining gaps versus the product goal:

- Browser apply execution is planned but not fully UAT-proven across real portals.
- Agent-first installation/setup is documented but not yet packaged as a clean user journey.
- Source trust and fraud signals are still basic.

## Source Approval Route

Status: implemented on 2026-07-06.

Agents should approve source suggestions through the engine command, not by editing JSON manually:

```powershell
pnpm approve-sources -- --dry-run --ids <suggestion-id>
pnpm approve-sources -- --ids <suggestion-id>
```

The route:

- reads the generated source plan
- writes accepted source entries into editable user config
- leaves `source-plan.generated.json` untouched
- keeps `origin` as `system_generated`, `agent_suggested`, or `user_added`
- dedupes against existing config

Simple routing:

- confirmed company or ATS URLs go to `sources.companyPages`
- broad public search queries go to `sources.searches`
- job-board sources go to `sources.jobBoards`
- browser/login-backed sources go to `sources.loggedInBrowserSources`
- manual fallback is skipped unless a real local job path is configured

## Current Build Slice

Implement manual import beyond JSONL.

Status: implemented in `packages/discovery` on 2026-07-06.

Why this first:

- it is the safest bridge from the current local build to real discovery
- agents can save a job post as Markdown without hand-writing JSON
- it supports pasted URLs, copied JDs, and browser-extracted text
- it keeps every source normalized into `JobRecord`
- it gives the future browser agent a simple handoff format

Supported v1 local import formats:

```text
jobs.jsonl
jobs.json
one-job.md
one-job.txt
directory of the above
```

Markdown/text job documents should allow simple front matter:

```markdown
---
company: Example Company
title: Head of Product
url: https://example.com/jobs/123
location: Remote India
workMode: remote
seniority: director
employmentType: full_time
companyStage: scaleup
---

Full job description goes here.
```

If metadata is missing, the import should still create a reviewable `JobRecord` with safe placeholders and source kind `manual`. Hard gates, agent review, and the apply assistant can then pause or skip as needed.

Local imports and future browser extractors can set `liveState` to `live`, `closed`, or `unknown`. career-ops's useful liveness lesson now exists as an ApplyCue UAT invariant: a `closed` job may stay in the decision log, but it must not receive a generated CV, application draft, or browser plan.

## Liveness Verifier Hook

Status: implemented on 2026-07-07.

career-ops has a useful liveness habit:

```text
expired signal wins over generic Apply text
anti-bot page means unknown, not closed
dead posting is removed before expensive evaluation
```

ApplyCue now keeps that pattern in its own contracts:

```text
page text/browser verifier -> JobLiveState -> closed-job hard gate -> no CV/draft/browser plan for closed jobs
```

Implementation shape:

- `packages/discovery/src/liveness.ts` classifies page text and apply controls.
- `packages/engine` accepts an optional `livenessVerifier`.
- The local engine does not fetch live web pages by default.
- Browser-visible extraction, Playwright, Crawl4AI, or connector code can inject page text later.
- If a verifier marks a job `closed`, the closed-job hard gate blocks CV and application preparation.
- Browser apply preflight must prefer high-signal role evidence such as page title and the top job heading over lower-signal related-job widgets. False mismatch pauses are treated as browser extraction bugs, not user questions.

This is a career-ops parity move without copying career-ops as the runtime engine and without making UAT flaky on live network access.

## Scan History And Repeat Avoidance

Status: implemented on 2026-07-07.

career-ops has an important scanner habit: it remembers URLs it has already seen, records dead or invalid postings, and avoids feeding the same job back into expensive evaluation.

ApplyCue keeps that pattern in an ApplyCue-owned contract:

```text
source-quality jobs -> scan-history filter -> hard gates/shortlist -> CV engine -> application draft
```

Implementation shape:

- `packages/discovery/src/scan-history.ts` reads and writes JSONL history entries.
- Real run history lives under `~/.applycue/profiles/<profile>/data/local/scan-history.jsonl`.
- `daily` and `push` runs skip non-manual jobs already marked `prepared` or `closed`.
- `review` mode keeps previously prepared jobs visible for UAT and manual inspection.
- The engine appends one history entry per considered job after a run: `seen`, `prepared`, or `closed`.
- The dashboard and chat summary show checked jobs, repeat skips, prepared skips, closed skips, and recorded entries.

This gives ApplyCue career-ops-style repeat control without moving user data into the repo and without hiding user-pasted manual jobs.

## Repost And Stale Opening Signals

Status: implemented on 2026-07-07.

career-ops detects repost clusters by grouping scan history by company, fuzzy-matching role titles, and looking for multiple URLs inside a recent window. ApplyCue now keeps that pattern as a warning signal:

```text
scan-history entries -> company + role fuzzy match -> repost clusters -> dashboard and chat summary
```

Rules:

- default window is 90 days
- same URL repeats do not count as reposts
- manual entries are excluded because pasted jobs are deliberate user or agent input
- closed entries are excluded because they are dead-posting evidence, not repost evidence
- repost signals do not block CV generation or applications yet

Use repost signals to diagnose stale openings, ghost-job-heavy sources, and source quality. Later outcome learning can tell the agent to spend less search budget on sources that repeatedly generate stale clusters.

## Source Outcome Learning

Status: implemented on 2026-07-07.

career-ops has a useful pattern analyzer that reads tracker status and report summaries to find what is working. ApplyCue keeps the same lesson in structured state:

```text
applications + scan history + outcome events -> source learning -> manifest/dashboard/chat summary
```

Outcome events live in the user store at:

```text
data/local/outcomes.jsonl
```

Agents record them through:

```powershell
pnpm record-outcome -- --application <application-id> --type interview --note "Interview request received"
```

The current Source Learning summary shows prepared applications, submitted applications, replies, interviews, offers, rejections, positive outcomes, and top sources. It does not change ordering by itself. Use it to understand which sources deserve more search budget, which ones are noisy, and whether lower-priority jobs are unexpectedly producing interviews.

## Reverse ATS Directory Scan

Status: implemented on 2026-07-07.

career-ops has a useful `scan:full` pattern:

```text
public ATS company directory -> public ATS provider fetch -> title/location filters -> pipeline
```

ApplyCue keeps the pattern in its own source contract:

```text
provider: "ats_directory" -> Greenhouse/Lever/Ashby public APIs -> JobRecord -> source-quality filter -> hard gates/shortlist
```

Implementation shape:

- generated source plan suggests one `Reverse ATS directory scan` source
- source approval writes it to editable `sources.searches`
- setup may auto-approve it because it needs no login or shared key
- the adapter validates directory slugs and canonical ATS hosts before fetch
- directory sampling is deterministic and spread across the list to avoid alphabetic bias
- source-quality filtering now includes broad ATS postings before shortlist preparation

This closes the biggest discovery-shape gap with career-ops while avoiding a fixed company list as the product.

## Not In This Slice

- no custom external scraping outside approved adapters
- no LinkedIn automation yet
- no browser submit changes
- no new scoring model
- no new CV template
- no real user asset storage change

This keeps the build honest: discovery improves without weakening the CV truth and application policy layers.

## Next Build Slice

Implement public ATS company adapters.

Status: implemented on 2026-07-06.

Why this next:

- it is the first real discovery jump after manual import
- public ATS APIs return structured jobs without browser scraping
- source quality is higher than broad web search
- every result can still normalize into `JobRecord`
- it follows the career-ops learning without copying career-ops code

Initial providers:

- Greenhouse Job Board API
- Lever Postings API
- Ashby Job Postings API
- Workable public markdown feed
- SmartRecruiters public postings API
- BambooHR public tenant careers list
- Breezy public tenant JSON feed
- Recruitee public tenant offers API
- Pinpoint public tenant postings feed
- Workday public CXS postings endpoint
- Personio public tenant XML feed

Config shape:

```json
{
  "sources": {
    "companyPages": [
      {
        "company": "Example Company",
        "provider": "greenhouse",
        "careersUrl": "https://job-boards.greenhouse.io/example",
        "enabled": true
      }
    ]
  }
}
```

Provider rules:

- only public GET endpoints
- no credentials
- no applications submitted through these adapters
- disabled entries are ignored
- failed sources should not crash the whole batch
- provider output must normalize through `JobRecord`

Official references:

- Greenhouse Job Board API: public GET endpoints expose published jobs.
- Lever Postings API: public published postings are available under site names.
- Ashby Job Postings API: public job board endpoint returns currently published jobs and can include compensation.
- Workable public markdown feed: public company jobs and detail pages are available without credentials.
- SmartRecruiters public postings API: public company postings and details are available without credentials.
- BambooHR tenant careers list: public company postings are available from `<tenant>.bamboohr.com/careers/list` without credentials.
- Breezy tenant JSON feed: public company postings are available from `<tenant>.breezy.hr/json` without credentials.
- Recruitee tenant offers API: public company postings are available from `<tenant>.recruitee.com/api/offers/` without credentials.
- Pinpoint tenant postings feed: public company postings are available from `<tenant>.pinpointhq.com/postings.json` without credentials.
- Workday tenant CXS endpoint: public company postings are available from `<tenant>.<wd-instance>.myworkdayjobs.com/wday/cxs/<tenant>/<site>/jobs` without credentials.
- Personio tenant XML feed: public company postings are available from `<tenant>.jobs.personio.(de|com)/xml` without credentials.
- Rippling tenant board API: public company postings are available from `api.rippling.com/platform/api/ats/v1/board/<slug>/jobs` when the careers URL is `ats.rippling.com/<slug>/jobs`, without credentials.
- Comeet is useful but not a default no-login setup source because the public positions endpoint needs both a company UID and a tenant token. Add only when a user/agent supplies the full approved API URL and token handling is explicit.

## Next Build Slice: JobSpy Bridge

Status: implemented on 2026-07-06.

Build the first broad job-board provider with JobSpy, not a custom scraper.

JobSpy should be an optional Python bridge:

```text
sources.jobBoards -> JobSpy adapter -> Python scrape_jobs() -> JSON rows -> JobRecord normalization
```

Start with:

- Indeed
- Google Jobs
- Naukri

Use LinkedIn carefully because JobSpy documents stricter rate limits and unreliable Easy Apply filtering.

Provider rules:

- no proxy credentials in config
- no API keys or secrets without user permission
- missing Python package should warn and skip
- live scraping should run only from approved source config
- tests should use fixture rows, not live sites
- output must normalize through `JobRecord`

Also implemented:

- Remotive no-key public API adapter.
- The Muse no-key public jobs API adapter.
- Rippling no-key public company ATS adapter.
- JobSpy, Remotive, and The Muse generated source-plan suggestions.
- Approval route into `sources.jobBoards`.
- User-owned credential guard for key-required job-board providers.
