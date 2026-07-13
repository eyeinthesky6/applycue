---
name: ApplyCue
description: Agent-led CV-to-application workflow that discovers roles, reviews full JDs, creates role-specific CVs, applies with permission, tracks outcomes, and learns from feedback.
arguments: mode
user_invocable: true
user-invocable: true
argument-hint: "[setup | status | find | review | cv | apply | dashboard | outcome | uat]"
license: MIT
---

# ApplyCue

Use ApplyCue through chat. The agent operates the repository, the user's approved browser, and available connectors. The user should not need to learn commands or edit configuration.

Codex users may start with `codex` or `codex exec "Read AGENTS.md, run doctor, and begin ApplyCue setup."` Claude and other hosts use the equivalent repository prompt. Plain-language prompts are canonical; `/applycue` is optional and may not exist in every host.

## First action

For product usage, greet the user and run:

```powershell
node doctor.mjs --json
```

Read existing user files before asking questions. Extract name, contact details, employment dates, and public links from the CV when present. Ask only for missing information that changes the next action.

Inspect the browser and connector tools actually available in the current agent host. A native Codex/Claude/Chrome browser counts; `doctor` cannot detect host-native tools and may only report that no project MCP file exists. Ask the user to connect a browser only if no usable browser tool is available when a rendered or collapsed JD needs it.

For repository development, skip onboarding and follow `docs/agent-development-guide.md`.

## Mode routing

| User intent | Mode | What the agent does |
| --- | --- | --- |
| install, start, upload/import CV | `setup` | Check prerequisites, ingest the exact CV, ask for source access, build and confirm the profile. |
| where are we, what next | `status` | Read doctor, tracker, pipeline, feedback, and attempts; give the next safe action. |
| find jobs, run a batch | `find` | Scan approved sources, inspect losses, hydrate viable full JDs, and prepare agent review. |
| shortlist or assess a role | `review` | Read the full JD and decide `apply`, `watch`, or `skip` with reasons. |
| improve or tailor CV | `cv` | Preserve baseline, confirm material claim changes, and create MD/HTML/PDF/DOCX artifacts. |
| fill or submit applications | `apply` | Preflight, get named approval, record attempt, fill/upload, reconcile outcome. |
| show results or feedback | `dashboard` | Run/open the browser dashboard and explain counts or unresolved feedback. |
| response, rejection, interview, offer | `outcome` | Update tracker and learning evidence. Interview/offer preparation is a later workflow. |
| test or readiness question | `uat` | Run checks and report PASS/WARN/FAIL with the first real blocker. |

A pasted JD or job URL defaults to `review`. Do not silently jump from finding jobs to applying.

## Setup flow

### 1. Preserve the supplied CV

- Save/import the user's CV as the exact baseline before rewriting it.
- DOCX, PDF, Markdown, and text are valid inputs. Use available document/PDF tools to extract them; do not recreate the user's history from memory.
- Keep a larger evidence-rich base CV. Role CVs may be shorter.
- Extract contact details from the CV instead of asking again.

### 2. Ask about additional sources

Immediately after CV ingestion, ask whether the user wants the profile enriched from any of:

- selected local folders or project repositories;
- GitHub or other code profiles;
- LinkedIn, personal website, Linktree, portfolio, blogs, or public posts;
- certificates, case studies, writing samples, or existing application answers;
- connected email later for job alerts and application confirmations.

Ask for access to each local path/account before reading it. Public URLs may be read when the user supplies or approves them. Do not scan the whole machine.

### 3. Extract, connect, confirm

Build one coherent candidate story from the approved sources:

- role history and chronology;
- products, projects, ownership, teams, outcomes, and industries;
- strengths and likely target roles;
- inconsistencies, missing measures, unclear authorship, and possible improvements.

Show material additions and conflicts to the user. Correct them together. Only confirmed facts enter the working profile/base CV.

### 4. Capture search intent

Ask only what is not already known: target outcomes, acceptable adjacent roles, geography/relocation, compensation, availability, current employer, past-employer policy, work authorization, hard no-go companies, and desired application pace.

Current employer is always skipped. Past employers need confirmation for each search/application policy change.

### 5. Baseline before edits

Run the first search against the exact supplied CV and confirmed intent. Record visible counts for fetched, objectively blocked, full-JD reviewed, shortlisted, skipped, CVs generated, attempted, and confirmed applied. This gives the user a clear “what ApplyCue did” baseline.

Only after the baseline should the agent propose base-CV improvements. Review them role-by-role or section-by-section and retain the user's language/style unless the user approves a change.

## Discovery and review

Use `portals.yml`, root providers, public job pages, user-added links, and approved native connectors. Prefer native email connectors for mailbox searches; if unavailable, tell the user what connection is needed. Most job boards do not expose agent connectors, so use public pages or the user's logged-in browser with permission.

Short cards, emails, snippets, and collapsed descriptions are leads, not JDs. Open the source in the user's real browser, expand “read more”, and read the full description before a final decision. If the full JD cannot be obtained, keep it pending or ask the user—do not reject it on the preview.

Code may reject only objective cases: unsafe/invalid URL, confirmed dead posting, exact source identity already handled, current employer, explicit hard constraint, or the exact application URL/attempt already recorded. Company/title cooldown hints, similar titles, inferred seniority, keyword overlap, and CV-to-JD fit go to the agent.

The agent reviews the viable queue and records `apply`, `watch`, or `skip`. Scores help explain a decision but never make it. Audit false positives and false eliminations on the first run. Propose reusable configuration changes and get approval before saving them.

If the queue is starved, show which counts fell at each stage. Offer one change at a time in this order:

```text
source coverage -> title variants -> industry -> location -> recency -> strictness
```

Do not silently relax work authorization, blocked companies, current-employer, user no-go, unsafe-source, or application-approval rules.

## First application batch

Select the first five genuine matches, or fewer if fewer fit. Prepare each role fully; do not pad the batch with junk.

For every role:

1. Read the full live JD.
2. Explain why it fits the user's intent and evidence.
3. Draft the role CV from the baseline plus confirmed profile facts.
4. Mark claims as sourced, reframed, or new/unconfirmed. Ask for material confirmation; do not hard-reject useful marketing language merely because wording is new.
5. Save durable Markdown and HTML, then generate PDF and DOCX.
6. Verify the files open and belong to this company/role.
7. Show company, role, URL, CV filename, and unresolved form answers.
8. Obtain explicit approval for this named application.
9. Follow `modes/apply.md`, including the application-attempt receipt.
10. Mark `Applied` only on confirmed success. An unknown outcome remains unresolved and must not be retried automatically.

## Dashboard and learning loop

Run:

```powershell
npm run dashboard
```

The browser dashboard reads `data/applications.md` and shows scanned, reviewed, shortlisted, applied/active, rejected, and skipped counts plus posting/report/CV links. Thumbs feedback writes `data/job-feedback.jsonl` only.

Thumbs-down without a reason is `needs_reason`. The agent should ask a short follow-up in chat and use the answer to propose future tuning. Feedback never rewrites preferences automatically.

After the first few ApplyCue applications, offer to search approved email for earlier/ongoing application confirmations and import them into the same history. This is not a pre-first-run blocker; the dashboard should make imported history visible.

## Permission rules

Ask before:

- accessing a new folder, browser account, or connector;
- changing saved search/profile/CV facts;
- widening search scope or application count;
- applying, submitting, sending email/DM, or contacting a referral;
- retrying an unknown attempt;
- editing product code during a normal user workflow.

One approval covers only the named action it describes.

## Commands for the agent

```powershell
node doctor.mjs --json
npm run scan
node verify-pipeline.mjs
npm run tracker -- query --limit 20
npm run dashboard
node generate-docx.mjs <tailored.md> <tailored.docx>
node application-attempt.mjs check --job=N
npm run check
```

Use the relevant `modes/*.md` file for evaluation, CV, pipeline, application, contact, or follow-up details. Commands are implementation details; explain outcomes in plain language.

## MVP boundary

MVP ends at a confirmed application plus tracking and feedback. Interview scheduling, alerts, deep interview preparation, offer comparison, and negotiation are documented future flows. Do not delay a working CV-to-application loop to build them now.

## Success gate

“Ready” means a clean checkout can be installed by an agent, ingest a real CV without losing content, discover roles, hydrate full JDs, produce a sensible shortlist, create verified PDF and DOCX files, obtain named approval, make one controlled application attempt, record a reliable outcome, and show it on the dashboard.
