# ApplyCue End-to-End User Flow

Date: 2026-07-05

## Product Summary

ApplyCue is a CV-to-offer agent.

It runs the job-search operation for a user after setup:

```text
profile -> discover -> shortlist -> tailor -> apply -> track -> reply -> interview -> offer -> learn
```

The core value is not manual job search. The core value is automation plus customization:

- find many relevant opportunities
- create a role-specific CV for each serious application
- apply in batches under user-defined rules
- track replies and outcomes
- draft follow-ups and interview prep
- learn what is working

The user sets the rules, reviews early runs, adjusts preferences, and approves exceptions. After that, ApplyCue should run mostly by itself.

## 1. How A User Discovers ApplyCue

Likely discovery channels:

- search: "AI job application agent", "automated tailored CVs", "AI apply to jobs for me"
- Codex, Claude, and other agent skill/plugin directories
- GitHub and npm if the first version is local-first
- LinkedIn posts showing daily application batches and interview outcomes
- founder communities, operator communities, and job-seeker communities
- referrals from users who got interviews or offers
- content around "CV to offer letter with an agent"

What we should promise:

- set up once, then run the application engine
- search across job boards, company pages, ATS systems, social posts, communities, and connectors
- tailor CVs truthfully at volume
- apply with user-defined limits
- track replies and draft next steps
- learn from interviews, rejections, and offers

What we should not promise:

- guaranteed jobs
- fake experience
- bypassing platform rules or anti-abuse systems
- sending unapproved sensitive messages
- applying outside the user's configured boundaries

## 2. First Landing Experience

The first page should say:

```text
ApplyCue is your CV-to-offer agent. Set your goals once, then let it find roles, tailor CVs, apply in batches, track replies, and keep improving until you get offers.
```

Primary action:

```text
Set up my agent
```

Secondary action:

```text
Run a sample batch
```

The product should not look like a job board. It should look like an agent control room.

## 3. Setup Once

The user gives ApplyCue enough information to run the system.

Required setup:

- name
- email
- base CV
- current company
- current designation and level
- current country or location
- whether to apply to past employers
- target role families
- preferred locations
- remote, hybrid, or onsite preference
- industries of interest
- seniority target
- hard no-go roles or companies
- applications per day
- mode: review, daily, or push
- match range: tight, normal, or wide

Optional setup:

- LinkedIn URL
- portfolio links
- compensation target
- notice period
- work authorization
- relocation preference
- interview availability
- preferred writing tone
- email access for tracking
- calendar access for interview scheduling support
- logged-in browser session access for job boards or LinkedIn-style sources

ApplyCue then builds:

- profile model
- preference model
- apply settings
- proof bank
- reusable application answers
- default CV baseline
- source plan
- search area plan
- daily batch plan
- relax plan for when the batch is too small
- pending question list

## 4. Apply Modes

ApplyCue should support simple modes, because different users have different urgency.

The main control is `applicationsPerDay`.

Examples:

- Casual market check: `daily`, 3 to 5 applications per day.
- Active search: `daily`, 15 to 25 applications per day.
- Jobless and urgent: `push`, 40 to 80 applications per day, depending on source quality.

### Review

Use this at the start or whenever the user wants full control.

- ApplyCue discovers jobs.
- ApplyCue shortlists jobs.
- ApplyCue creates CV variants.
- ApplyCue prepares applications.
- User reviews each application before submit.

### Daily

Use this for normal automated search.

- ApplyCue auto-submits applications that pass configured rules.
- ApplyCue pauses for unclear fields, missing proof, unusual compensation questions, work authorization, relocation, or user-defined sensitive topics.
- User reviews exceptions, not every application.
- User sets applications per day.

### Push

Use this when the user needs interviews quickly.

- ApplyCue runs daily or scheduled batches.
- User sets applications per day.
- User sets source mix.
- User sets how strict the batch should be.
- User gets a daily report and exception queue.

Default for personal power use can be `daily` after initial calibration. `push` is for urgent searches.

## 4A. Apply Routes

For every prepared application, ApplyCue chooses one route for the agent:

- `api`: use a known safe endpoint or portal adapter.
- `browser`: open the real page, preflight, fill fields, upload the generated CV, then pause or submit under policy.
- `email`: draft an application email with the generated CV attached.
- `dm`: draft a recruiter or referral message.
- `manual_review`: pause when the page, portal, answer, or policy is unclear.

The user should not care which technical path is used. The agent should pick the route, execute it, and store a receipt. API and browser routes can submit when the user's apply policy allows it. Email and DM routes start as drafts unless the user's message policy allows sending. Manual review is the fallback when there is risk or ambiguity.

## 5. Proof Bank

The proof bank is the truth layer.

It stores:

- claims the user can honestly make
- evidence for each claim
- projects, achievements, industries, tools, metrics, and leadership examples
- claims safe for CV use
- claims that need confirmation

Example:

```text
Claim: Led AI transformation work.
Evidence: Built agent workflows and advised teams on AI adoption.
Tags: AI, transformation, automation, product strategy.
```

ApplyCue can turn proof into role-specific positioning. It cannot invent unsupported claims.

## 6. Match Range And Relaxing Results

ApplyCue should not ask the user to manually rewrite searches when there are not enough roles.

The user sets a simple match range:

- `tight`: only close matches
- `normal`: close matches first, then sensible expansion
- `wide`: more volume, still inside hard rules

The user also sets `applicationsPerDay`. The first run stays clean and uses saved sources/preferences only. If ApplyCue cannot find enough roles and the user asks for more results, the agent offers simple relaxation options and then widens only the approved area.

Default relax order:

```text
source -> title -> industry -> location -> recency -> batch strictness
```

Freshness example:

```text
Start: jobs posted in the last 30 days
Then: jobs posted in the last 60 to 90 days
Then: older still-live roles only if the user asks
Unknown post date: keep visible, but rank below known fresh jobs
```

Geography example:

```text
Start: Remote India, Delhi NCR
Then: India remote, India hybrid
Then: APAC or Europe-overlap remote
Ask before: relocation, onsite outside India
Never relax: blocked countries, impossible work authorization
```

Title example:

```text
Start: Head of AI Transformation
Then: Director AI Transformation, AI Program Lead, Chief of Staff AI
Then: Product Strategy AI, Transformation Lead
Never relax: roles in the user's no-go list
```

Industry example:

```text
Start: fintech, AI products
Then: SaaS, enterprise software, banking tech
Then: broader B2B technology
Never relax: blocked companies or industries
```

Source example:

```text
Start: high-quality company and ATS sources
Then: job boards
Then: social posts, communities, newsletters, recruiter messages
```

Batch strictness example:

```text
Start: tight agent-reviewed fit
Then: allow sensible adjacent roles the user has approved
Never relax: unsupported CV claims or fake experience
```

Hard rules do not relax automatically:

- fake or unsupported claims
- blocked companies
- work authorization
- sensitive personal data
- compensation floor, unless the user allows it
- relocation, unless the user allows it

The agent should tell the user the final search area for each run.

Example:

```text
Today's search area:
- India remote
- Delhi NCR hybrid
- Bangalore hybrid

If short, I will widen to:
- Remote APAC
- Remote Europe-overlap

I will ask before:
- onsite outside India
- relocation
```

## 7. Source Discovery Is Core

Discovery across many sources is not a later feature. It is core.

Core source types:

- job boards where access is allowed
- company career pages
- public ATS pages
- LinkedIn-style job listings through user-controlled browser sessions where allowed
- recruiter posts
- founder posts
- social posts
- newsletters
- Reddit and community posts
- blogs and hiring announcements
- email alerts and recruiter emails through connectors or browser control

Manual paste or a single job link is only an optional fallback for testing and edge cases.

What is automated:

- source scanning
- search query generation
- job/post extraction
- company and role parsing
- dedupe
- liveness checks
- source quality tracking
- batch queue creation

What is user-controlled:

- which accounts and sources are connected
- which portals are trusted
- which portals need review before applying
- which portals are blocked
- applications per day
- allowed geographies
- blocked companies
- role families
- mode
- message-send policy
- pause rules

Unlisted portals are not all equal. ApplyCue should let normal company career pages and startup application forms through, while inspecting for fraud signals such as payment requests, registration fees, crypto wallet requests, unclear company identity, or strange document requests. If a portal looks risky, it should pause.

## 8. Job And Lead Normalization

ApplyCue should normalize both formal jobs and informal leads.

Examples:

- ATS job post
- company career page
- LinkedIn job
- founder post saying "we are hiring"
- recruiter DM
- newsletter listing
- Reddit hiring thread
- blog hiring announcement

Each becomes a lead record with:

- source
- URL or message reference
- company
- role title or inferred role
- description
- location
- work mode
- seniority
- compensation if known
- posted date if known
- discovered date
- liveness state
- duplicate status
- apply route

## 9. Hard Gates

Hard gates remove roles ApplyCue should not touch.

Examples:

- job is closed
- location is impossible
- work mode does not match
- company is blocked
- role is a user-defined no-go
- application is duplicate
- work authorization is incompatible
- compensation is clearly below user rule, if known
- source is disallowed

What is automated:

- apply gates
- explain gate failures
- skip bad fits
- pause if the gate result is unclear

What is user-controlled:

- rule values
- overrides
- "always allow" and "always block" patterns

## 10. Ranking And Batch Selection

Shortlist and batch planning choose what gets applied to first.

Signals:

- role objective fit
- proof strength
- skill coverage
- industry fit
- seniority fit
- location fit
- company fit
- source confidence
- freshness
- application effort
- likely upside
- user interest
- past outcome performance by source and role type

These signals help the agent order work. They are not the product UI and should not be treated as a precise chance of success.

Freshness is shown as a simple operational note, not a candidate score. The default shortlist should favor jobs posted in the last 30 days. If the first batch is too small, the agent asks before expanding to older historical postings.

Batch output:

```text
Today's batch plan
- Apply: 18
- Prepare but pause: 5
- Skip: 42
- Need user input: 3
```

User-facing detail for one role:

```text
Decision: Apply
Why:
- Strong match for AI transformation leadership.
- Fintech context matches proof bank.
- Remote work mode fits preference.
CV action: Generated.
Pause rule: none.
```

## 11. CV Tailoring At Volume

ApplyCue creates a role-specific CV for every serious application.

It can:

- reorder relevant experience
- emphasize matching proof
- adjust summary and role-title framing
- add truthful keywords supported by proof
- remove less relevant detail
- create ATS-safe PDF/DOCX outputs
- keep a copy of each CV sent

It cannot:

- invent companies
- invent metrics
- invent dates
- invent tools or credentials
- claim direct experience when only adjacent experience exists

Most users should not review every CV forever. They should review early samples, correct the agent, and then let the system generate in batch within rules.

## 12. Application Execution

ApplyCue applies through connectors or browser control.

It can:

- open application pages
- verify the visible page is live and still matches the intended company and role
- fill standard fields
- upload the right CV
- answer known questions
- draft custom answers
- submit automatically if the application matches apply settings
- pause if something is outside policy

Pause examples:

- visible form is for a different company or role
- posting liveness is unclear or the posting appears closed
- missing salary expectation
- unknown work authorization answer
- unsupported CV claim
- required long answer with no stored preference
- payment, ID, or sensitive personal information request
- platform asks for action outside the user's approved rules

## 13. Email And Reply Tracking

Email tracking is core, not an afterthought.

ApplyCue should review application-related emails through connectors or controlled browser access, if the user permits it.

It can:

- detect application confirmations
- update application status
- identify recruiter replies
- identify interview requests
- identify rejections
- draft replies
- draft scheduling responses
- add follow-up reminders

It should not send replies unless the user has allowed that message policy.

Modes:

- draft only
- auto-send simple confirmations
- pause for recruiter questions
- pause for compensation, relocation, or sensitive topics

## 14. Interview Support

Once interviews start, ApplyCue helps convert applications into offers.

It can:

- create company briefs
- create role briefs
- map likely interview themes to proof stories
- draft answers from proof bank
- draft questions to ask
- track interview stages
- draft follow-up emails
- prepare negotiation notes

It should not impersonate the user in live interviews or fabricate stories.

## 15. Offer And Negotiation

When an offer arrives, ApplyCue helps compare:

- compensation
- role fit
- growth path
- work mode
- company quality
- risk
- alternatives still in pipeline

It can draft negotiation messages. Sending follows the user's message policy.

## 16. Learning Loop

ApplyCue improves from outcomes.

Signals:

- application submitted
- confirmation received
- recruiter replied
- interview received
- rejection received
- offer received
- user manually rejected a role
- user overrode a gate
- lower-priority role produced an interview
- top-priority role produced nothing

This updates:

- search terms
- source focus
- reusable preference notes
- CV strategy
- proof-bank emphasis
- daily batch plan
- pause rules

## What We Are Doing

- building a CV-to-offer agent
- running autonomous daily or scheduled batches
- making source discovery core
- supporting job boards, posts, communities, email, and connectors
- using hard gates and agent-led shortlisting
- generating truthful custom CVs at volume
- applying on the user's behalf within configured rules
- tracking replies and outcomes
- drafting replies, follow-ups, interview prep, and negotiation
- making the skill/agent interface the main control plane

## What We Are Not Doing

- not building a generic job board
- not making the user manually click through every job forever
- not making manual copy-paste the core workflow
- not inventing CV claims
- not applying outside user rules
- not sending sensitive messages without policy permission
- not bypassing platform rules or anti-abuse systems
- not requiring normal users to understand GitHub
- not building a desktop app first

## Automation Map

| Step | Automated by default | User config or oversight |
| --- | --- | --- |
| Setup | guided profile setup | facts, goals, consent |
| CV import | parse and structure | confirm truth |
| Proof bank | suggest evidence | approve or reject claims |
| Source discovery | scan approved sources | choose sources and accounts |
| Search expansion | generate queries | adjust role goals |
| Normalization | parse jobs and leads | fix wrong fields if needed |
| Hard gates | skip bad fits | set and override rules |
| Ranking | prioritize and batch | set minimum fit |
| CV tailoring | generate per-role CVs | review early samples and exceptions |
| Application fill | fill forms | pause on unknown or sensitive fields |
| Submit | submit within policy | applications per day and pause rules |
| Email tracking | classify replies | connect accounts and approve access |
| Messaging | draft or send per policy | approve sensitive replies |
| Tracking | update statuses | correct mistakes |
| Interview prep | generate prep material | choose final talking points |
| Negotiation | analyze and draft | decide and approve |

## MVP Scope For Personal Local Use

First useful local version:

- local repo
- ApplyCue skill for Codex or Claude
- config files edited by the agent
- CV import
- proof bank
- source discovery from public pages, job boards where available, and logged-in browser sessions where the user allows it
- email tracking through native Codex, Claude, Hermes, or similar connected tools where available; browser control only with user permission
- deterministic hard gates
- batch shortlisting
- applications per day
- CV generation per role
- browser application execution
- `daily` mode
- tracker and outcome learning

Manual job link or pasted JD ingestion remains useful, but only as a testing and fallback path.

## Distribution Direction

Personal MVP:

- local repo
- skill-driven
- agent edits config files
- browser control handles web actions

Current v0.1 distribution:

- GitHub repo link
- canonical ApplyCue skill
- thin CLI-specific bridge files
- setup and runs performed by the user's agent
- local user store under `~/.applycue`

Developer distribution later:

- npm scaffolder package
- CLI for setup and scheduled runs
- optional GitHub repo storage for power users

Non-developer distribution:

- market the Codex/Claude skill or plugin experience first
- hide GitHub and repo details as much as possible
- guided setup through chat
- optional hosted backend later

Desktop app is not the first choice. The flow is agent-driven, so skill/plugin distribution is likely simpler than asking users to install and operate a desktop app.
