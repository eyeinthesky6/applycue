# ApplyCue Configuration

Date: 2026-07-05

Status: current configuration reference. Typed source definitions remain in `packages/core`.

ApplyCue should be configured through files that the skill and agent can edit safely.

Initial shape:

```text
config/applycue.example.json
```

For a real user, the agent should create a private local config outside the repo at:

```text
~/.applycue/profiles/default/applycue.json
```

`pnpm applycue:first-build` uses that external user config when it exists. If it does not exist, the command falls back to development-only `config/applycue.local.json`, then to the sample fixture.

Do not put secrets in config files. Account access should use native agent connectors such as Codex, Claude, Hermes, or similar when available. Local browser sessions are fallback only with user permission. A secure secret store can come later.

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

If `sources.companyPages` is empty, ApplyCue is not scanning company career pages in that run. It may still use approved job-board sources such as JobSpy, Remotive, RemoteOK, Working Nomads, Jobicy, or Himalayas, plus explicitly configured ATS-directory compatibility sources. To scan company pages, approve concrete public careers or ATS URLs here; do not paste broad `site:...` search queries into `companyPages`.

Company website scanning means actual jobs posted on a company's own public careers page or the ATS page behind it. The agent may use search/browser tools to find that URL, but the executable source must be the concrete careers or ATS URL, such as `https://jobs.lever.co/<company>` or `https://job-boards.greenhouse.io/<company>`. Broad search queries remain leads until a real board URL is confirmed.

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

## JobHive ATS Sources

ApplyCue has two separate JobHive lanes:

- `provider: "jobhive"` belongs in `sources.jobBoards`. It queries selected per-ATS Parquet snapshots through DuckDB using title and location predicates and normalizes only the returned rows.
- `provider: "ats_directory"` belongs in `sources.searches`. It reads small per-ATS JobHive company CSVs, validates the listed careers URLs, samples a bounded company set, and then calls ApplyCue's direct ATS adapters.

For an India product search, prefer the first lane because it filters before fetching results:

```json
{
  "id": "jobhive-india-product",
  "kind": "job_board",
  "label": "JobHive India product search",
  "provider": "jobhive",
  "query": "product",
  "enabled": true,
  "options": {
    "providers": ["rippling", "recruitee", "pinpoint", "bamboohr"],
    "titleTerms": ["product", "head of product", "director of product", "vp product"],
    "locations": ["India"],
    "limit": 50
  }
}
```

Generated India source plans may suggest this entry, but setup does not auto-approve it. The agent must show and approve the new source scope first. DuckDB is installed in ApplyCue's local discovery-tool environment when tool installation is allowed; no API key or env-file edit is required.

The directory canary is deliberately explicit because it can make many employer requests:

```powershell
pnpm applycue:source-canary -- --include-ats-directory
```

Direct company sources remain the cleanest path:

```text
agent public-web research
  -> concrete company careers or ATS URL
  -> user approval
  -> sources.companyPages
  -> direct public ATS API
  -> JobRecord and normal ApplyCue gates
```

Workday and Rippling company sources can be approved directly when their public careers URLs match the supported hosts. Generated `site:` queries remain research leads until the agent confirms the real company board URL.

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
pnpm applycue:approve-sources -- --dry-run --ids <suggestion-id>
pnpm applycue:approve-sources -- --ids <suggestion-id>
```

For explicit bulk approval:

```powershell
pnpm applycue:approve-sources -- --dry-run --all
pnpm applycue:approve-sources -- --all
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

`sources.loggedInBrowserSources` records user-approved source intent, not proof that a connector or login is currently healthy. The external agent must rediscover the current host capability before each relevant session. Keep capability state in memory. Persist only a safe opaque `credentialRef` when the host supplies one; never persist a password, OTP, token, cookie, client secret, or copied browser profile. Search/inspection approval does not grant fill, send, message, or submit permission. See `docs/connector-capability-policy.md`.

There is no normal generated `sources.searches` provider. Provider-specific public ATS search suggestions such as Greenhouse, Lever, Workday, and SmartRecruiters are research leads unless they include a concrete company board URL. Approving those suggestions routes them to browser/search source config for the agent. To make them executable, confirm the actual careers/ATS URL and add it to `sources.companyPages`.

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

`themuse` reads The Muse's published jobs API and should be capped with `options.limit` and `options.pageLimit`. The Muse's official documentation requires app registration beyond testing, and the 2026-07-10 ApplyCue live canary failed with a connection reset. Keep this provider explicit and disabled unless the user owns the registration, accepts the terms, and a current canary passes.

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

Built-in source behavior is market-aware, not globally forced. If the user config has multiple `searchSettings.searchAreas`, ApplyCue generates separate job-board searches for those locations. If `searchAreas` is empty, it falls back to `searchCountries`, approved remote regions, and non-generic preferred locations. India-specific boards such as Naukri are only used for India searches; they are not reused for UK, US, Australia, or global remote searches.

Examples:

```json
{
  "searchSettings": {
    "searchCountries": ["India", "United Kingdom", "Australia"],
    "searchAreas": ["India", "United Kingdom", "Australia"],
    "remoteRegions": ["India"]
  }
}
```

Use `searchAreas` when the user really wants several active search markets. Use `preferredLocations`, `extraLocations`, `acceptableWorkModes`, `remoteOnly`, and `allowRelocation` to control filtering and ranking without silently widening search.

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
      },
      {
        "label": "Instahyre search",
        "kind": "job_board",
        "queryTemplate": "\"{role}\" \"{location}\" site:instahyre.com",
        "priority": 0.76,
        "requiresBrowser": true
      },
      {
        "label": "Cutshort search",
        "kind": "job_board",
        "queryTemplate": "\"{role}\" \"{industry}\" site:cutshort.io",
        "priority": 0.74,
        "requiresBrowser": true
      },
      {
        "label": "Foundit search",
        "kind": "job_board",
        "queryTemplate": "\"{role}\" \"{location}\" site:foundit.in",
        "priority": 0.72,
        "requiresBrowser": true
      },
      {
        "label": "Hirist search",
        "kind": "job_board",
        "queryTemplate": "\"{role}\" \"{industry}\" site:hirist.tech",
        "priority": 0.7,
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

## Email And Inbox Sources

The user's own mailbox is a source of job leads, but ApplyCue must not own email sending or store mailbox credentials.

Inbox leads are high signal because the user has already subscribed to portals, recruiters, newsletters, and saved searches. The mailbox search query can therefore be broad. The first public-board/company run should complete first. The agent should then discover whether its current host has a ready or connectable email-read tool and ask whether to add narrow Gmail/Outlook job alerts only when that path exists. Do not enable mailbox access silently.

Before naming Gmail or Outlook, inspect what the current host actually exposes. If an email tool is ready or connectable, explain the narrow job-related read/search scope and start the host's OAuth flow only after approval. If no email connector exists, say so and continue with public sources; do not ask the user to paste mailbox credentials or install an unreviewed community connector.

Recommended flow:

```text
agent uses native Codex/Claude/Hermes-style Gmail/Outlook connector first, or user-approved browser session only if no connector is available
-> search recent mails for job alerts, recruiter mails, and apply links
-> write raw connector results to a local JSON/JSONL file
-> run pnpm applycue:scan-email-leads -- --input <raw-mail-export.json|jsonl> --import
-> ApplyCue filters, dedupes, generates CV/application packet
-> agent applies through browser/API/email draft route with user policy
```

Generated source plans may include a `kind: "email_alert"` suggestion with `provider: "user_email"`. That is an agent-tool lead, not a direct engine scraper. Email search and drafting should use native Codex, Claude, Hermes, or similar connected email tools when available. Browser control is a fallback only when connector access is unavailable and the user approves it. ApplyCue can prepare email apply drafts when a job exposes an application email, but it does not send the email. Final send always needs explicit user confirmation.

Mailbox scam filtering:

- import only mails with a real role, company, JD/apply link, or recruiter identity
- reject or pause emails asking for registration fees, processing fees, training fees, refundable deposits, or payment before interview
- reject or pause emails asking for Aadhaar/PAN/passport/bank/salary documents before a verified interview or offer
- reject or pause vague "you are shortlisted" emails that ask the user to register a profile, update a candidate database, or share data before naming the company and role
- do not block every consultant or recruiter email; many real jobs come through recruiters
- if unclear, import as manual review instead of generating a CV/application packet

For a local personal setup, prefer a native Gmail/Outlook connector that the current host has actually discovered as ready or connectable. Use the user's logged-in browser session only when native connector access is unavailable and the user approves that session. A third-party connector platform is optional and should use the smallest possible OAuth scope, visible audit logs, and user revocation. ApplyCue should store only a safe connector reference or imported job records, never mailbox tokens.

Email scan accepts raw connector exports shaped as a single message, a JSON array, JSONL, or an envelope with `messages`, `emails`, `results`, `items`, or `data`. Each message should include the fields the connector can provide:

```json
{
  "messages": [
    {
      "id": "gmail-message-id",
      "from": "jobs@example.com",
      "subject": "Recommended product jobs",
      "date": "2026-07-09T07:00:00.000Z",
      "body": "[VP Product\n\nExample Co\n\nIndia\n\nApply](https://example.com/jobs/vp-product)"
    }
  ]
}
```

Run:

```powershell
pnpm applycue:scan-email-leads -- --input <raw-mail-export.json|jsonl> --import
```

The scanner extracts job cards and links, unwraps common tracking redirects, skips generic/profile/course links, writes normalized leads to `assets/inbox-leads/`, and can import them into the normal local job source with `--import`.

`import-email-leads` is the lower-level command for already-normalized extracted rows:

```json
[
  {
    "messageId": "gmail-message-id",
    "from": "jobs@example.com",
    "subject": "VP Product opening at Example",
    "company": "Example",
    "title": "VP Product",
    "url": "https://example.com/jobs/vp-product",
    "location": "India",
    "body": "Useful JD text copied from the email or linked job post."
  }
]
```

The importer is conservative. It skips rows missing company, title, or job/apply URL, skips duplicates, and skips configured fraud signals such as registration fees, refundable deposits, profile database harvesting, or document-before-interview requests.

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
- common canonical fields get default aliases in generated browser plans, so `notice_period` can match "When can you join?" and `work_authorization` can match "Are you legally authorized to work?"
- sensitive answers such as current salary, notice period, work authorization, relocation, or compensation must come from explicit user confirmation or preferences
- do not store passwords, OTPs, session cookies, payment details, or private IDs here
- do not edit source code for one application question; ask the user, save the approved answer in config, then rerun the engine

Agents should save approved answers through the product command, not by hand-editing JSON:

```powershell
pnpm applycue:approve-answers -- --dry-run --field notice_period --value "30 days" --alias "What is your notice period?"
pnpm applycue:approve-answers -- --field notice_period --value "30 days" --alias "What is your notice period?"
```

When live preflight asks several questions, prefer the direct live-template command after the user explicitly approves reusable answers:

```powershell
pnpm applycue:approve-answers -- --from-live --set notice_period="30 days" --set expected_salary="INR 7500000" --dry-run
pnpm applycue:approve-answers -- --from-live --set notice_period="30 days" --set expected_salary="INR 7500000"
```

Only include `--set field=value` pairs the user approved for reuse. The command reads the latest `outputs/live-preflight/live-answer-approval-template.json`, keeps aliases and source refs, and does not edit the generated template.

The file-based route remains available when the agent needs to review or prepare many answers offline:

```powershell
pnpm applycue:approve-answers -- --from-file "~/.applycue/profiles/default/outputs/live-preflight/live-answer-approval-template.json" --dry-run
pnpm applycue:approve-answers -- --from-file "~/.applycue/profiles/default/outputs/live-preflight/live-answer-approval-template.json"
```

The command only saves reusable template rows with a non-empty value and `approveForReuse: true`. One-off answers are ignored for reusable config.

After saving reusable answers, refresh and confirm master form data:

```powershell
pnpm applycue:form-data
pnpm applycue:form-data -- --confirm
```

The confirmation is stable while the field/value/alias set stays the same. If a new reusable field is added or an approved value changes, ApplyCue asks for confirmation again before portal filling.

Use `--replace` only when the user explicitly changes a previously approved answer:

```powershell
pnpm applycue:approve-answers -- --replace --field notice_period --value "45 days" --alias "When can you join?"
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
- freshness window for known post dates
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

`applySettings.mode` controls execution cadence and permission. `review` means prepared applications still stop for review; it does not disable clear rule-based shortlisting. `minimumFitToApply` is the clear-match threshold after hard gates. Rows below that threshold but above the review floor remain ambiguous and can be escalated to Codex/Claude or the user.

## Preference Enforcement

ApplyCue applies preference rules in layers:

```text
source plan -> source-quality filter -> hard gates -> CV reconciliation -> browser submit policy
```

Hard blockers now include:

- disallowed source kinds from `applySettings.allowedSourceKinds`
- blocked companies, current company, and past employers when not allowed
- no-go role terms, excluded industries, and excluded keywords
- wrong role family
- unacceptable work mode or `remoteOnly` conflict
- unacceptable known experience range
- unacceptable employment type
- unacceptable company stage
- work authorization conflicts from known location
- explicit no-sponsorship language when visa sponsorship is required
- known compensation max below `preferences.minimumCompensation`
- blocked portals
- configured fraud signals
- default portal policy `block` when the portal is not trusted
- known post date older than the active freshness window for a clean first run
- explicit non-standard shift conflict when `standardHoursOnly` is true
- explicit travel percent above `maxTravelPercent`
- explicit timezone requirement outside `preferredTimezones`

Unknown data is not guessed into a hard blocker. If compensation, travel, shift, sponsorship, timezone, or post date is missing from the JD/source, the role can still proceed to ranking or browser preflight. Unknown-date jobs should rank below known fresh jobs, but they should not disappear as "old" without evidence. A normal unlisted company portal is not blocked just because it is unfamiliar; pause only for configured ask-before portals, blocked portals, fraud signals, sensitive form fields, or submit policy.

Seniority is not a hard blocker by default. Titles and grades vary too much across companies: a large-company manager can be more senior than a small-company VP, and final title/level can be negotiated. Use `matchSettings.seniorityGateMode` only when the user wants stricter behavior:

```json
{
  "matchSettings": {
    "seniorityGateMode": "off"
  }
}
```

- `off`: default. Keep seniority as an advisory signal only.
- `review`: do not block, but surface reusable seniority questions when company grade/title level is ambiguous.
- `hard`: block roles whose inferred or user-overridden seniority is outside `preferences.acceptableSeniorities`.

Prefer known required experience ranges for out-of-band filtering. If the JD says `0-2 years` and the user's range starts at `8+`, block it. If only the title says `Manager`, `AVP`, `Director`, or `VP`, keep it reviewable unless strict mode is on.

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
- `normal`: close matches first; do not widen until the user asks for more results.
- `wide`: more volume after user approval, still inside hard rules.

Use `relaxOrder` to decide what widens first after the user asks for more results.

Default:

```text
source -> title -> industry -> location -> recency -> batch strictness
```

For a one-off wider queue, the agent can request a ranked queue target without saving new sources:

```powershell
pnpm applycue:first-build -- --more-results --target-ranking-queue 200
```

This should widen source fetch size and generated public-board searches first, while keeping geography, work authorization, blocked companies, fraud, and unsafe-portal rules intact.

Freshness defaults:

```json
{
  "searchSettings": {
    "freshnessDays": 30,
    "includeUnknownPostDates": true
  }
}
```

First run uses the freshness window and presents latest known posts first. If the user asks for more volume, the agent can widen recency, for example from 30 days to 60 or 90 days, or include all still-live older posts. The agent should say this plainly in chat or the dashboard:

```text
I used jobs posted in the last 30 days first. I held back 18 older known posts. Want me to include older live posts too?
```

Location should be explicit:

- `preferredLocations`: start here.
- `extraLocations`: use these when the batch is short.
- `askBeforeLocations`: pause before using these.
- `remote` is a work mode, not a world-wide location. If `searchCountries`, `searchAreas`, or `remoteRegions` are set, generic terms such as `remote`, `anywhere`, `global`, or `worldwide` must not expand geography. Use explicit terms such as `Remote India`, `India`, or an approved remote region.
- Country preferences do not automatically imply broad remote regions. `India` should not silently become `APAC`, `Asia`, or `global remote`; add those regions only when the user approves them.
- Global or overseas remote jobs can still have visa, residence, timezone, or work-authorization requirements. If the JD says the applicant must be authorized to work in another country, the work-authorization gate should block it unless the user's profile allows that country.

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

Use simple source buckets:

- public job boards: search normally by configured country/city.
- company portals: allow normal company career pages and startup sites through the pipeline unless they match fraud or blocked rules.
- social/community sources: search when configured or agent-approved; logged-in action follows browser/connectors policy.
- ask-before: search, then pause before applying or submitting.
- blocked: skip or pause as a platform rule.

Known scammy websites and scam patterns should be eliminated without asking the user. Do not block jobs merely because the company is small, the portal is custom, or the ATS/provider is unfamiliar. If a portal asks for payment, fees, deposits, crypto wallets, or strange personal documents, pause and ask.

## Parked Later Settings

Network intelligence is parked for a later version. It should not appear in the v1 config.

Later config can cover:

- which social/contact sources the user allows
- whether the agent may search logged-in social sessions
- whether the agent may draft DMs
- whether the user must press send manually
- which contacts, current employer people, or sensitive sources are blocked
