# ApplyCue Configuration

Date: 2026-07-05

ApplyCue should be configured through files that the skill and agent can edit safely.

Initial shape:

```text
config/applycue.example.json
```

For a real user, the agent should create a private local config outside the repo at:

```text
~/.applycue/profiles/default/applycue.json
```

`pnpm first-build` uses that external user config when it exists. If it does not exist, the command falls back to development-only `config/applycue.local.json`, then to the sample fixture.

Do not put secrets in config files. Account access should use approved connectors, local browser sessions, or a secure secret store later.

Each user must use their own provider login or API key. ApplyCue must not use the developer's key, another user's key, or a shared project key for discovery or applications.

Real local input files live under the user's ApplyCue profile:

```text
~/.applycue/profiles/default/assets/
```

Example local job source:

```text
~/.applycue/profiles/default/assets/jobs/jobs.jsonl
```

Each row is one job with fields like `company`, `title`, `url`, `description`, `location`, `workMode`, `seniority`, `seniorityEvidence`, `requiredExperienceYears`, `companyMarketGrade`, `employmentType`, and `companyStage`.

`sources.localJobsPath` can point to a single file or to a directory.

Leave `sources.localJobsPath` empty or `null` unless the user has explicitly pasted or imported real jobs. Do not wire fake, sample, `example.com`, or tutorial jobs into a real user profile. Sample jobs are only for repo-local fixtures and tests.

Supported local import formats:

- `.jsonl`
- `.json`
- `.md`
- `.markdown`
- `.txt`

For Markdown or text, use simple front matter:

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
liveState: live
---

Paste the job description here.
```

Agents can use this format when they extract a job from a browser tab. That keeps one-off job imports in the user store and avoids code changes for one application.

## Company And ATS Sources

Use `sources.companyPages` for public ATS/company job feeds.

Example:

```json
{
  "sources": {
    "companyPages": [
      {
        "company": "Example Company",
        "provider": "greenhouse",
        "careersUrl": "https://job-boards.greenhouse.io/example",
        "enabled": true
      },
      {
        "company": "Example Lever Co",
        "provider": "lever",
        "careersUrl": "https://jobs.lever.co/example",
        "enabled": true
      },
      {
        "company": "Example Ashby Co",
        "provider": "ashby",
        "careersUrl": "https://jobs.ashbyhq.com/example",
        "enabled": true
      },
      {
        "company": "Example Workable Co",
        "provider": "workable",
        "careersUrl": "https://apply.workable.com/example",
        "enabled": true
      },
      {
        "company": "Example SmartRecruiters Co",
        "provider": "smartrecruiters",
        "careersUrl": "https://jobs.smartrecruiters.com/example",
        "enabled": true
      },
      {
        "company": "Example BambooHR Co",
        "provider": "bamboohr",
        "careersUrl": "https://example.bamboohr.com/careers",
        "enabled": true
      },
      {
        "company": "Example Breezy Co",
        "provider": "breezy",
        "careersUrl": "https://example.breezy.hr",
        "enabled": true
      },
      {
        "company": "Example Recruitee Co",
        "provider": "recruitee",
        "careersUrl": "https://example.recruitee.com",
        "enabled": true
      },
      {
        "company": "Example Pinpoint Co",
        "provider": "pinpoint",
        "careersUrl": "https://example.pinpointhq.com",
        "enabled": true
      },
      {
        "company": "Example Workday Co",
        "provider": "workday",
        "careersUrl": "https://example.wd3.myworkdayjobs.com/External",
        "enabled": true
      },
      {
        "company": "Example Personio Co",
        "provider": "personio",
        "careersUrl": "https://example.jobs.personio.de",
        "enabled": true
      },
      {
        "company": "Example Rippling Co",
        "provider": "rippling",
        "careersUrl": "https://ats.rippling.com/example-co/jobs",
        "enabled": true
      }
    ]
  }
}
```

These adapters only read public job data. They do not submit applications, do not use secrets, and do not use logged-in browser sessions.

Supported first providers:

- `greenhouse`
- `lever`
- `ashby`
- `workable`
- `smartrecruiters`
- `bamboohr`
- `breezy`
- `recruitee`
- `pinpoint`
- `workday`
- `personio`
- `rippling`

If `provider` is omitted, ApplyCue will try to infer it from `careersUrl`.

## Reverse ATS Directory Sources

Use `sources.searches` with `provider: "ats_directory"` when the user has target roles but has not curated a company list yet.

This is the ApplyCue version of base-workflow-style broad ATS discovery:

```text
public ATS company directory -> public ATS API -> JobRecord -> source-quality filter -> hard gates/shortlist
```

Example:

```json
{
  "sources": {
    "searches": [
      {
        "id": "reverse-ats-product",
        "origin": "system_generated",
        "status": "active",
        "kind": "ats",
        "label": "Reverse ATS directory scan",
        "enabled": true,
        "provider": "ats_directory",
        "query": "vp product",
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

Rules:

- no login or API key is needed
- Workday company sources can be approved directly when the careers URL is a public `myworkdayjobs.com` board
- Rippling company sources can be approved directly when the careers URL is a public `ats.rippling.com/<slug>/jobs` board
- source-quality filtering must run before shortlist preparation because this is a broad source
- increase `limitPerProvider` only when the user wants wider discovery
- keep source approval in editable config; do not hand-edit `source-plan.generated.json`

## Generated Source Plan

Manual import is only one input. It is not the primary discovery flow.

ApplyCue should generate a source plan from:

- base CV signals
- target roles
- target industries
- preferred locations
- preferred companies
- search settings
- source settings

Generated source suggestions are written as output under the active user store:

```text
~/.applycue/profiles/<profile>/data/local/source-plan.generated.json
```

This file is engine-owned and regenerated. Do not hand-edit it.

Source ownership stays separate:

- `system_generated`: created by ApplyCue from profile and preferences; review-only until approved.
- `agent_suggested`: proposed by an agent after research or browser work; user or agent can route it into editable config after approval.
- `user_added`: explicitly added by the user or accepted into editable config.

Approved active sources live in editable user config, such as `sources.companyPages`. Generated source-plan files do not become active scan sources by themselves.

When a generated suggestion duplicates an approved source, ApplyCue should mark it with `duplicateOf` instead of creating another active source.

The generated plan also includes a reviewable `searchProfile`. This is ApplyCue's equivalent of base-workflow-style title, location, and content filters, but generated from the user's profile instead of a fixed `portals.yml`.

Example shape:

```json
{
  "searchProfile": {
    "titleFilter": {
      "positive": ["Head of Product", "VP Product"],
      "negative": ["Intern", "Support Executive"],
      "seniorityBoost": ["Director", "VP", "Vice President"]
    },
    "locationFilter": {
      "alwaysAllow": ["Remote India", "Delhi NCR"],
      "allow": ["India", "Delhi NCR", "APAC"],
      "askBefore": ["Dubai"],
      "block": []
    },
    "contentFilter": {
      "required": ["roadmap"],
      "positive": ["fintech", "AI"],
      "negative": ["BPO"]
    }
  }
}
```

Rules:

- `searchProfile` is generated output and should not be hand-edited.
- It must be derived from the user's CV/profile/preferences/search settings.
- It should not contain market-specific defaults such as India, Naukri, or Dubai unless the user profile or setup config asks for them.
- Title positives should use target role terms. Adjacent-only role terms are optional exploration lanes and should not enter default source queries or title positives.
- Source adapters and shortlist preparation may use it later for filtering and diagnostics, but user-facing CV claims still come only from approved facts and proof.

## Approving Generated Sources

Agents should not hand-edit the generated source-plan file.

Use the product command to accept generated suggestions into editable config:

```powershell
pnpm approve-sources -- --dry-run --ids <suggestion-id>
pnpm approve-sources -- --ids <suggestion-id>
```

For explicit bulk approval:

```powershell
pnpm approve-sources -- --dry-run --all
pnpm approve-sources -- --all
```

What the command does:

- reads `data/local/source-plan.generated.json`
- writes accepted suggestions into `applycue.json`
- keeps the generated plan unchanged
- skips duplicates
- skips manual fallback unless a real `sources.localJobsPath` exists

Approved suggestions are routed into simple config buckets:

- `sources.searches`: broad search queries, including public ATS search queries.
- `sources.companyPages`: confirmed company or ATS URLs that can be scanned directly.
- `sources.jobBoards`: job-board sources that do not need logged-in browser access.
- `sources.loggedInBrowserSources`: LinkedIn-style or browser/login-backed sources.
- `sources.communities`: community job sources.
- `sources.newsletters`: newsletter or email-alert sources.

Approval means "this is allowed source config." It does not mean every adapter is built yet. The engine should scan only the buckets supported by the current discovery layer and leave the rest ready for later adapters.

Currently executable `sources.searches` providers:

- `ats_directory`

## Job Board Sources

Use `sources.jobBoards` for approved job-board searches.

The first broad job-board provider should be JobSpy. See `docs/prebuilt-providers-and-libraries.md`.

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
          "countryIndeed": "india",
          "descriptionFormat": "markdown"
        }
      }
    ]
  }
}
```

Keep the first implementation conservative:

- keep built-in defaults generic, such as Indeed and Google Jobs
- add market-specific boards such as Naukri through user config or setup, not hardcoded source-plan logic
- use concrete search areas such as `India`, `Delhi NCR`, or `Remote India`; avoid plain `remote` when a country or market is known
- keep LinkedIn limited because it rate-limits more aggressively
- keep proxy settings out of config unless the user explicitly approves secure setup
- if JobSpy is not installed, warn and skip instead of failing the whole batch

For no-key providers like Remotive, use public endpoints under their terms.

Supported no-key job-board providers:

- `jobspy`
- `remotive`
- `remoteok`
- `workingnomads`
- `jobicy`
- `himalayas`
- `themuse`

`themuse` reads the public The Muse jobs API and should be capped with `options.limit` and `options.pageLimit` so broad supply still flows through ApplyCue's source-quality filter before shortlist preparation.

For key-required providers such as Adzuna or USAJOBS, config should store only a user-owned credential reference, not the secret:

```json
{
  "provider": "adzuna",
  "credentialRequired": true,
  "credentialRef": {
    "owner": "user",
    "kind": "env",
    "ref": "APPLYCUE_ADZUNA_DEFAULT"
  }
}
```

The secret value itself belongs in the user's own environment or future secure connector store.

## Market Source Settings

Market-specific source choices live in `sourceSettings`, not in source-plan code.

Example:

```json
{
  "sourceSettings": {
    "jobBoardDefaults": {
      "siteNames": ["indeed", "google", "naukri"],
      "countryIndeed": "india",
      "resultsWanted": 25,
      "hoursOld": 72
    },
    "searchTemplates": [
      {
        "label": "Naukri search",
        "kind": "job_board",
        "queryTemplate": "\"{role}\" \"{location}\" site:naukri.com",
        "priority": 0.82,
        "requiresBrowser": true
      },
      {
        "label": "IIMJobs search",
        "kind": "job_board",
        "queryTemplate": "\"{role}\" \"{industry}\" site:iimjobs.com",
        "priority": 0.78,
        "requiresBrowser": true
      }
    ]
  }
}
```

Supported template values:

- `{role}`
- `{industry}`
- `{location}`

Normal users should not manually install JobSpy. The ApplyCue setup command or agent skill should install optional tools into the user's local `~/.applycue/tools/` folder.

## Base CV Library

Use `baseCvs` for multiple user-generated or agent-proposed base CVs.

Example:

```text
product base CV -> product jobs
sales base CV -> sales jobs
BD base CV -> BD jobs
```

`profile.activeBaseCvId` selects the source CV for the current run.

If the user updates a base CV, create a new dated version instead of overwriting the old one. Keep old versions for traceability.

## What Lives In Config

- profile paths and public links
- user asset pointers
- base CV path
- base CV library entries for product, sales, BD, or other role families
- proof bank claims
- approved profile facts
- current company, designation, level, country, and location
- past employers and whether to apply there
- target role families
- adjacent role families
- location and work-mode rules
- seniority and employment type
- company stage and target companies
- work authorization and visa requirement
- compensation floor and target
- blocked companies
- no-go role terms
- applications per day
- mode
- source lists
- logged-in browser source permission
- trusted, ask-before, and blocked portals
- match range
- relax order
- pause rules
- message policy

## Reusable Application Answers

Use `applicationAnswers` for form answers the user has approved once and wants ApplyCue to reuse.

These answers live in the user's private config:

```text
~/.applycue/profiles/default/applycue.json
```

Example:

```json
{
  "applicationAnswers": [
    {
      "id": "answer-notice-period",
      "field": "notice_period",
      "value": "30 days",
      "approvedByUser": true,
      "aliases": ["What is your notice period?", "When can you join?"],
      "sourceRef": "user-confirmed",
      "createdAt": "2026-07-06T00:00:00.000Z"
    }
  ]
}
```

Rules:

- unapproved answers are ignored by the profile loader
- blank fields or blank values are ignored
- exact portal questions can be stored in `field` when needed
- `aliases` help preflight match longer labels without creating extra fill actions
- sensitive answers such as current salary, notice period, work authorization, relocation, or compensation must come from explicit user confirmation or preferences
- do not store passwords, OTPs, session cookies, payment details, or private IDs here
- do not edit source code for one application question; ask the user, save the approved answer in config, then rerun the engine

Agents should save approved answers through the product command, not by hand-editing JSON:

```powershell
pnpm approve-answers -- --dry-run --field notice_period --value "30 days" --alias "What is your notice period?"
pnpm approve-answers -- --field notice_period --value "30 days" --alias "What is your notice period?"
```

When live preflight asks several questions, prefer the direct live-template command after the user explicitly approves reusable answers:

```powershell
pnpm approve-answers -- --from-live --set notice_period="30 days" --set expected_salary="INR 7500000" --dry-run
pnpm approve-answers -- --from-live --set notice_period="30 days" --set expected_salary="INR 7500000"
```

Only include `--set field=value` pairs the user approved for reuse. The command reads the latest `outputs/live-preflight/live-answer-approval-template.json`, keeps aliases and source refs, and does not edit the generated template.

The file-based route remains available when the agent needs to review or prepare many answers offline:

```powershell
pnpm approve-answers -- --from-file "~/.applycue/profiles/default/outputs/live-preflight/live-answer-approval-template.json" --dry-run
pnpm approve-answers -- --from-file "~/.applycue/profiles/default/outputs/live-preflight/live-answer-approval-template.json"
```

The command only saves reusable template rows with a non-empty value and `approveForReuse: true`. One-off answers are ignored for reusable config.

Use `--replace` only when the user explicitly changes a previously approved answer:

```powershell
pnpm approve-answers -- --replace --field notice_period --value "45 days" --alias "When can you join?"
```

ApplyCue can also derive safe answers from explicit preferences:

- `preferences.noticePeriodDays` -> notice period
- `preferences.targetCompensation` or `preferences.minimumCompensation` plus optional `preferences.compensationCurrency` -> expected salary
- `profile.links` entries such as LinkedIn, GitHub, portfolio, or personal website -> public profile URL fields

It does not derive current salary or unsupported experience claims.

## Covered Search Parameters

ApplyCue stores the normal job-search parameters an agent needs:

- roles to target
- adjacent roles to include when widening
- roles to avoid
- industries to target
- industries to avoid
- preferred, extra, and ask-before locations
- remote, hybrid, onsite preference
- relocation preference
- seniority and role level
- full-time, contract, consulting, fractional, or other employment type
- company stage and preferred companies
- blocked companies
- compensation floor and target compensation
- work authorization and visa sponsorship
- notice period
- travel limit
- timezone preference
- required, nice-to-have, and excluded keywords
- source permissions
- source trust and fraud checks
- applications per day
- mode: review, daily, or push
- match range: tight, normal, or wide

## What Does Not Live In Config

- passwords
- API keys
- shared developer API keys
- private session cookies
- unsupported CV claims
- one-off form answers that need user confirmation

## Modes

- `review`: prepare everything, user reviews each submit.
- `daily`: apply automatically up to the user's daily count; pause on exceptions.
- `push`: apply more aggressively up to the user's daily count; still pause on exceptions.

Scan-history behavior:

- `review` keeps previously prepared jobs visible for inspection and UAT.
- `daily` and `push` skip non-manual jobs already marked `prepared` or `closed` in `data/local/scan-history.jsonl`.
- Manual imports are not hidden by scan history because a pasted job is deliberate user or agent input.
- Repost signals are warnings when the same company appears to relist a similar role on different URLs. They do not block applications unless later policy explicitly says so.

Use `applicationsPerDay` as the main knob:

- market check: 3 to 5 per day
- active search: 15 to 25 per day
- urgent search: 40 to 80 per day, if source quality is good

## Match Range

- `tight`: closest matches only.
- `normal`: close matches first, then widen if the batch is short.
- `wide`: more volume, still inside hard rules.

Use `relaxOrder` to decide what widens first.

Default:

```text
source -> title -> industry -> location -> recency -> batch strictness
```

Location should be explicit:

- `preferredLocations`: start here.
- `extraLocations`: use these when the batch is short.
- `askBeforeLocations`: pause before using these.

Example:

```text
preferredLocations: Delhi NCR, Remote India
extraLocations: India, Remote APAC, Remote Europe overlap
askBeforeLocations: relocation, onsite outside India
```

## Setup Questions

The agent should use `docs/setup-questionnaire.md` to collect user preferences, then write them into config.

## Pending Questions

The agent should not block the pipeline for every unknown. It should keep a pending question list and ask at session start or when a question becomes relevant.

Blocking examples:

- missing location or country
- missing notice period
- missing compensation floor when a form requires it

Non-blocking examples:

- travel limit
- visa for a country not yet encountered
- one portal's apply policy
- a role-specific screening question

## Source Trust

Use three simple source buckets:

- trusted: search and apply under policy
- ask-before: search, then pause before applying
- blocked: skip

Unknown portals should be checked for fraud signals. If a portal asks for payment, fees, deposits, crypto wallets, or strange personal documents, pause and ask.

## Parked Later Settings

Network intelligence is parked for a later version. It should not appear in the v1 config.

Later config can cover:

- which social/contact sources the user allows
- whether the agent may search logged-in social sessions
- whether the agent may draft DMs
- whether the user must press send manually
- which contacts, current employer people, or sensitive sources are blocked
