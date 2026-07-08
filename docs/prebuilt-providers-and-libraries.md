# Prebuilt Providers And Libraries

Date: 2026-07-06

## Decision

Do not build a broad job-board scraper from scratch.

Use prebuilt providers behind ApplyCue-owned adapters:

```text
approved source config -> provider adapter -> normalized JobRecord -> source-quality filter -> hard gates/shortlist -> CV engine -> apply assistant
```

ApplyCue stays the engine. External tools are fetchers, parsers, or browser helpers.

## Integration Ownership

Simple rule:

- `packages/discovery` owns job discovery adapters.
- `packages/normalizer` owns conversion into `JobRecord`.
- `packages/engine` owns batch orchestration and warnings.
- `apps/worker` exposes commands.
- user profile config under `~/.applycue/profiles/<profile>/applycue.json` owns approved source settings.

Agents should not call random scrapers directly during a run. They should approve sources, then run ApplyCue commands.

The generated `searchProfile` is now part of discovery quality control. It filters broad provider output before shortlist preparation using title, location, and content rules generated from the user's profile/preferences. This is the Career OS lesson ApplyCue keeps: do not let every scraped job enter the expensive CV/application path.

## Discovery Provider Order

Use this order:

1. Official/public APIs where available.
2. Reverse public ATS directory scans when the user has not curated company lists yet.
3. JobSpy bridge for broad job-board search.
4. Crawl4AI for public pages with no useful API.
5. Browser-visible extraction for pages that need a real browser session.
6. Paid/cloud APIs only when the user approves keys, cost, and data sharing.

Manual import remains a fallback, not the main lane.

## Credential Rule

Each user must bring their own provider login or API key.

ApplyCue must not use:

- the developer's API key
- another user's API key
- a shared ApplyCue project key
- credentials committed into the repo

For v1, prefer providers that do not need a key. If a provider needs a key, config may store only a user-owned credential reference:

```json
{
  "credentialRequired": true,
  "credentialRef": {
    "owner": "user",
    "kind": "env",
    "ref": "APPLYCUE_PROVIDER_DEFAULT"
  }
}
```

The actual secret must live in the user's own environment, local secret store, browser session, or future connector account.

## Free Or Single-User Friendly Sources

Use these first for a single local user:

| Provider | Credential | Fit |
| --- | --- | --- |
| JobSpy | none for local library use | Best first broad board bridge. The ApplyCue setup flow installs `python-jobspy` in the user's local ApplyCue venv. |
| Greenhouse | none for public boards | Good company/ATS source. |
| Lever | none for public postings | Good company/ATS source. |
| Ashby | none for public posting API | Good company/ATS source, often includes compensation. |
| Workable | none for public markdown feeds | Good company/ATS source; common public feed at `apply.workable.com/<slug>/jobs.md`. |
| SmartRecruiters | none for public postings API | Good company/ATS source; public company postings API plus detail endpoint. |
| BambooHR | none for public tenant careers list | Good company/ATS source when a company uses `<tenant>.bamboohr.com/careers`; list metadata can feed shortlist diagnostics and browser preflight can inspect the posting before apply. |
| Breezy | none for public tenant JSON feed | Good company/ATS source when a company uses `<tenant>.breezy.hr`; public feed returns active postings without credentials. |
| Recruitee | none for public tenant offers API | Good company/ATS source when a company uses `<tenant>.recruitee.com`; postings may point to a custom careers domain and still pass through browser preflight. |
| Pinpoint | none for public tenant postings feed | Good company/ATS source when a company uses `<tenant>.pinpointhq.com`; public feed returns active postings without credentials. |
| Workday | none for public tenant CXS endpoint | Good company/ATS source when a company uses `<tenant>.<wd-instance>.myworkdayjobs.com/<site>`; public CXS search returns active postings without credentials. |
| Personio | none for public tenant XML feed | Good company/ATS source when a company uses `<tenant>.jobs.personio.(de|com)`; public XML returns active postings without credentials. |
| Rippling | none for public tenant board API | Good company/ATS source when a company uses `ats.rippling.com/<slug>/jobs`; public board API returns active postings without credentials. |
| Reverse ATS directory | none for public directory/API use | Good Career OS-inspired broad ATS discovery over Greenhouse, Lever, and Ashby without a fixed company list. |
| Remotive | none for public endpoint | Good remote-job source; obey attribution and low request frequency terms. |
| The Muse | none for public jobs API | Good supplemental no-key job-board source. Keep capped and filtered before shortlist preparation because it is broad. |
| Adzuna | user-owned app id/key | Good later broad API. Official default limits are enough for a single user if scheduled carefully. |
| USAJOBS | user-owned API key | Only useful for US federal/public-sector targets. |

Do not start with paid scraping APIs. Add them later only when the user explicitly approves account setup, cost, and data sharing.

## JobSpy

Decision: use JobSpy as the first broad job-board discovery bridge.

Why:

- MIT license.
- Python package: `python-jobspy`.
- Python 3.10+.
- One function, `scrape_jobs()`, searches several boards concurrently.
- Supported board names documented by JobSpy include `linkedin`, `indeed`, `glassdoor`, `zip_recruiter`, `google`, `bayt`, `naukri`, and `bdjobs`.
- Output is a Pandas DataFrame with job title, company, URL, direct apply URL when available, location, date posted, job type, salary columns, remote flag, and description.
- Useful filters include search term, Google Jobs search term, location, distance, job type, remote, easy apply, offset, hours old, result count, country for Indeed/Glassdoor, proxies, description format, and LinkedIn company IDs.

Use JobSpy for:

- Indeed
- Google Jobs
- Naukri
- LinkedIn discovery, cautiously
- Glassdoor, ZipRecruiter, Bayt, and BDJobs where relevant

JobSpy is intentionally broad. Its output must pass through ApplyCue normalization, dedupe, generated `searchProfile` filtering, and hard gates before shortlist preparation. In the current local UAT, approved and transiently widened sources produced 1135 fetched jobs, the source-quality layer kept 18 reviewable jobs, and the engine prepared 3 applications because the remaining roles were blocked by saved seniority/location policy.

Use `funnelHealth` after every broad provider run. If discovered volume is huge but kept volume is tiny, tighten source/title filters before adding more feeds. If kept volume is low because seniority, location, work authorization, employment type, or experience gates dominate, ask the user for a reusable preference change instead of weakening gates in code.

After source-quality filtering, daily and push runs also pass through scan history. Non-manual jobs already recorded as `prepared` or `closed` in the user's `data/local/scan-history.jsonl` are skipped before shortlist/CV work. Review mode keeps them visible for inspection.

Query budget rule:

- `tight`: keep a small source set.
- `normal`: include distinct target role names first, then role-plus-industry variants.
- `wide`: allow more no-login job-board variants before asking the user to loosen harder preferences.

Do not fill the daily batch by lowering CV truth checks or inventing claims. Widen source supply first.

For short batches, ApplyCue may transiently rerun approved public JobSpy/remote-board queries with wider `resultsWanted`, `hoursOld`, or `limit` values. This is a runtime scan expansion only; it must not rewrite user source config or generated source-plan files.

Start conservative:

```text
indeed + google + naukri first
linkedin later or limited
```

Reason:

- JobSpy docs say Indeed is currently the best-performing scraper.
- JobSpy docs say LinkedIn is restrictive and can rate-limit around page 10 on one IP.
- LinkedIn Easy Apply filtering is documented as unreliable.

## JobSpy Bridge Shape

Do not make JobSpy a core dependency of the TypeScript engine.

Build it as an optional Python worker:

```text
packages/discovery/jobspy adapter
  -> writes a small Python script or calls a bundled script
  -> invokes python with JSON input
  -> Python imports jobspy.scrape_jobs()
  -> writes JSON rows to stdout
  -> TypeScript parses rows
  -> normalizeJob()
```

If Python or `python-jobspy` is missing:

- warn clearly
- skip that source
- do not fail the whole batch

Default local install path:

```text
~/.applycue/tools/jobspy-venv/
```

ApplyCue resolves JobSpy Python in this order:

1. `APPLYCUE_PYTHON`, when explicitly set by the user.
2. `~/.applycue/tools/jobspy-venv/Scripts/python.exe` on Windows.
3. `~/.applycue/tools/jobspy-venv/bin/python` on macOS/Linux.
4. System `python` as a final fallback.

Do not install JobSpy globally for a user unless they explicitly ask for that. Normal users should not be asked to download JobSpy themselves; the skill or CLI setup flow should do this local install for them.

Do not store proxy credentials, API keys, cookies, or private browser session data in config.

## JobSpy Config Shape

Use approved source config, not generated source-plan files.

Target shape:

```json
{
  "sources": {
    "jobBoards": [
      {
        "id": "jobspy-india-product",
        "origin": "user_added",
        "status": "active",
        "kind": "job_board",
        "label": "JobSpy India product search",
        "enabled": true,
        "provider": "jobspy",
        "query": "vp product",
        "approvedAt": "2026-07-06T00:00:00.000Z",
        "options": {
          "siteNames": ["indeed", "google", "naukri"],
          "location": "India",
          "resultsWanted": 25,
          "hoursOld": 72,
          "jobType": "fulltime",
          "isRemote": false,
          "countryIndeed": "india",
          "descriptionFormat": "markdown"
        }
      }
    ]
  }
}
```

Field mapping:

| ApplyCue config | JobSpy parameter |
| --- | --- |
| `query` | `search_term` |
| `options.googleSearchTerm` | `google_search_term` |
| `options.location` | `location` |
| `options.siteNames` | `site_name` |
| `options.resultsWanted` | `results_wanted` |
| `options.hoursOld` | `hours_old` |
| `options.jobType` | `job_type` |
| `options.isRemote` | `is_remote` |
| `options.distance` | `distance` |
| `options.easyApply` | `easy_apply` |
| `options.offset` | `offset` |
| `options.countryIndeed` | `country_indeed` |
| `options.descriptionFormat` | `description_format` |
| `options.linkedinFetchDescription` | `linkedin_fetch_description` |
| `options.linkedinCompanyIds` | `linkedin_company_ids` |

## JobSpy Output Mapping

Map JobSpy rows to `JobRecord` like this:

| JobSpy row | ApplyCue `JobRecord` |
| --- | --- |
| `site` | `source.name`, source metadata |
| `id` | source-specific id input |
| `title` | `title` |
| `company` or `company_name` | `company` |
| `job_url_direct` or `job_url` | `url` |
| `description` | `description` |
| `location` | `location` |
| `is_remote` | `workMode` |
| `job_type` | `employmentType` |
| `interval`, `min_amount`, `max_amount`, `currency` | `compensation` |
| `date_posted` | source metadata for freshness diagnostics |

Keep ApplyCue dedupe after this step. JobSpy also recommends deduping by URL or title plus company because the same job can appear on multiple boards.

## Official APIs

Prefer official APIs where they fit the user's target market.

| Provider | Use | Notes |
| --- | --- | --- |
| Greenhouse | company/ATS discovery | Already started in ApplyCue. Public board API, no secrets. |
| Lever | company/ATS discovery | Already started in ApplyCue. Public postings API, no secrets. |
| Ashby | company/ATS discovery | Already started in ApplyCue. Public posting API, can include compensation. |
| Workable | company/ATS discovery | Implemented in ApplyCue. Public markdown feed and per-job markdown detail, no secrets. |
| SmartRecruiters | company/ATS discovery | Implemented in ApplyCue. Public postings API and detail endpoint, no secrets. |
| BambooHR | company/ATS discovery | Implemented in ApplyCue. Public tenant careers list under `<tenant>.bamboohr.com/careers/list`, no secrets. |
| Breezy | company/ATS discovery | Implemented in ApplyCue. Public tenant JSON feed under `<tenant>.breezy.hr/json`, no secrets. |
| Recruitee | company/ATS discovery | Implemented in ApplyCue. Public tenant offers API under `<tenant>.recruitee.com/api/offers/`, no secrets. |
| Pinpoint | company/ATS discovery | Implemented in ApplyCue. Public tenant postings feed under `<tenant>.pinpointhq.com/postings.json`, no secrets. |
| Workday | company/ATS discovery | Implemented in ApplyCue. Public tenant CXS endpoint under `<tenant>.<wd-instance>.myworkdayjobs.com/wday/cxs/<tenant>/<site>/jobs`, no secrets. |
| Personio | company/ATS discovery | Implemented in ApplyCue. Public tenant XML feed under `<tenant>.jobs.personio.(de|com)/xml`, no secrets. |
| Rippling | company/ATS discovery | Implemented in ApplyCue. Public tenant board API under `api.rippling.com/platform/api/ats/v1/board/<slug>/jobs`, no secrets. |
| Remotive | remote job discovery | Public API, no key in basic docs. Respect their terms: link back and do not redistribute into third-party boards. |
| The Muse | broad jobs/company listings | Implemented in ApplyCue. Public jobs API under `www.themuse.com/api/public/jobs`, no secrets. Keep request pages capped. |
| Adzuna | broad jobs and labour-market data | REST API. Requires user-owned `app_id` and `app_key`; default limits are single-user friendly if scheduled carefully. Useful for salary/vacancy intelligence too. |
| USAJOBS | US federal jobs | REST API. Search requires a user-owned API key. Useful only for users targeting US public-sector roles. |

Do not add keys to env or config without explicit user permission.

## Reverse ATS Directory

Decision: use an ApplyCue-owned reverse ATS directory source for broader discovery.

Career OS has a useful `scan:full` pattern: walk public ATS company directories, fetch public postings, and filter before expensive evaluation. ApplyCue keeps that pattern behind `provider: "ats_directory"` instead of importing Career OS.

Current implementation:

- reads the public `job-board-aggregator` company lists for Greenhouse, Lever, and Ashby
- validates directory slugs before building URLs
- guards each constructed URL to the expected ATS host
- samples across the directory instead of only taking the alphabetic prefix
- fetches public ATS APIs in small batches
- normalizes every posting into `JobRecord`
- runs source-quality filtering before shortlist and CV work

Config lives in `sources.searches`, not hardcoded code:

```json
{
  "sources": {
    "searches": [
      {
        "kind": "ats",
        "label": "Reverse ATS directory scan",
        "provider": "ats_directory",
        "query": "vp product",
        "enabled": true,
        "options": {
          "providers": ["greenhouse", "lever", "ashby"],
          "limitPerProvider": 25,
          "batchSize": 8,
          "sample": "spread"
        }
      }
    ]
  }
}
```

Do not use this as a final relevance signal. It is a supply source. The generated `searchProfile`, hard gates, agent shortlist review, CV truth reconciliation, source trust, and scan history still decide what moves forward.

## Crawl4AI

Decision: use Crawl4AI later for public pages that JobSpy or official APIs do not cover.

Use it for:

- public company careers pages with no API
- blog posts or pages listing jobs
- pages where clean Markdown extraction helps the CV/reconciliation engine
- CSS/XPath extraction when repeated job cards exist

Do not use it for:

- logged-in applications
- pages needing account-specific interaction
- final submit

Crawl4AI is a page extraction layer. It is not the application policy layer.

## Firecrawl

Decision: optional cloud connector, not a default dependency.

Why:

- strong search/scrape/crawl API shape
- useful SDKs and hosted service

Why not default:

- main open-source repo is AGPL-3.0
- cloud use needs API keys and cost approval
- ApplyCue should stay local-first for v1

Use only behind a connector with explicit user approval.

## Browser Automation Libraries

Do not hand-roll all browser automation.

Candidates:

| Tool | Use | Decision |
| --- | --- | --- |
| Playwright | deterministic browser control and tests | Good default for repeatable known flows. |
| Stagehand | mixed code plus natural-language browser actions | Useful later for semi-structured application forms. |
| Browser Use | agentic browser execution and possible cloud scaling | Useful later, especially for application execution experiments. Keep behind ApplyCue policy gates. |

Browser tools can fill forms and capture receipts. They cannot invent answers, override source trust, or bypass CV reconciliation.

Current UAT layer:

- ApplyCue dry-runs every generated browser plan against a local form contract.
- Review-mode receipts should pause before submit after filling fields and uploading the generated DOCX.
- These local receipts prove the plan contract and policy gate, not real portal compatibility.
- `pnpm browser-uat` can also run the latest generated plan through a safe local HTML form and Playwright-style adapter. It proves the adapter can open, inspect, fill, upload the DOCX, and pause before submit when the browser tool is installed. If the browser tool is missing, it writes a skipped report instead of blocking normal UAT. `setup-applycue` should verify or install that optional tool for the agent.
- `pnpm browser-live-preflight` is the next gate. It opens a real application URL, snapshots visible fields and page text, runs ApplyCue preflight, and writes a report without filling, uploading, or submitting.
- Real portal execution should come later through Playwright, Stagehand, Browser Use, or connector/browser control behind the same ApplyCue policy gates.
- Browser/page tools should feed posting text and visible apply controls into the ApplyCue liveness verifier before CV work. They should not scrape and apply through side paths that bypass `JobRecord.liveState`.

## CV And Document Libraries

Use libraries where they remove format work:

| Feature | Candidate | Decision |
| --- | --- | --- |
| DOCX base CV ingestion | Mammoth.js | Good fit. Converts `.docx` to clean semantic HTML/text. Use for base CV import. |
| DOCX CV export | `docx` | Implemented for `standard_ats_v1` upload artifacts. Browser plans should upload DOCX, not Markdown. |
| Markdown parsing | unified/remark | Good fit for inspecting generated CV and job imports as ASTs. |
| JSON contract validation | Ajv | Good fit for config, source rows, facts, CV plans, and reconciliation reports. |
| Template rendering | Handlebars or similar | Good fit for the single standard CV format if direct string rendering gets messy. |
| Structured resume schema | JSON Resume | Use as inspiration, not the ApplyCue truth schema. |

## What Not To Outsource

Keep these ApplyCue-owned:

- user preferences and source approval
- source trust policy
- hard gates and shortlist policy
- requirement-to-proof matching
- CV truth reconciliation
- application submit policy
- run manifests and local dashboard
- outcome learning

These are the product.

## Implemented Build Slice

Status: implemented on 2026-07-06.

Implemented:

- `provider: "jobspy"` job-board source shape.
- `provider: "ats_directory"` reverse public ATS directory source shape.
- Optional Python runner for `jobspy.scrape_jobs()`.
- `provider: "remotive"` no-key public API source shape.
- `provider: "themuse"` no-key public jobs API source shape.
- `provider: "workable"` and `provider: "smartrecruiters"` company/ATS source shapes.
- `provider: "bamboohr"` company/ATS source shape.
- `provider: "breezy"` company/ATS source shape.
- `provider: "recruitee"` company/ATS source shape.
- `provider: "pinpoint"` company/ATS source shape.
- `provider: "workday"` company/ATS source shape.
- `provider: "personio"` company/ATS source shape.
- `provider: "rippling"` company/ATS source shape.
- TypeScript adapter code in `packages/discovery`.
- Row normalization into `JobRecord`.
- Tests using fixture rows, not live scraping.
- Disabled fake config examples.
- Source-plan suggestions for JobSpy and Remotive.
- Approval route preserves provider options.

Live scraping still runs only from approved user config.

Do not start with proxies, cloud scraping, or LinkedIn-heavy volume. Prove one small safe batch first.

## Next Build Slice

Add key-required official API adapters only after a user has created their own provider account:

1. Adzuna with user-owned `app_id` and `app_key`.
2. USAJOBS with user-owned API key, only for users targeting US federal roles.
3. Firecrawl or similar cloud connector only after explicit approval of account, cost, and data sharing.

The app should pause with a clear setup message if a key-required provider has no user-owned credential reference.

## References

- JobSpy docs: https://speedyapply-jobspy.mintlify.app/introduction
- JobSpy GitHub: https://github.com/speedyapply/JobSpy
- JobSpy PyPI: https://pypi.org/project/python-jobspy/
- Crawl4AI docs: https://docs.crawl4ai.com/
- Firecrawl GitHub: https://github.com/firecrawl/firecrawl
- Remotive API: https://github.com/remotive-com/remote-jobs-api
- Adzuna API: https://developer.adzuna.com/
- USAJOBS API: https://developer.usajobs.gov/api-reference/
- Mammoth.js: https://github.com/mwilliamson/mammoth.js/
- docx: https://github.com/dolanmiu/docx
- Browser Use: https://github.com/browser-use/browser-use
- Stagehand: https://github.com/browserbase/stagehand
