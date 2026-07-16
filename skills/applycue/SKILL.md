---
name: ApplyCue
description: Agent-led CV-to-application workflow that searches approved sources, reviews full JDs, creates truthful role-specific CVs, applies with named permission, tracks outcomes, and learns from feedback.
arguments: mode
user_invocable: true
user-invocable: true
argument-hint: "[setup | status | find | review | cv | apply | dashboard | outcome | uat]"
license: MIT
---

# ApplyCue

Use ApplyCue through chat. The agent operates the repository, the user's approved browser, and available connectors. The user should not need to learn commands or edit configuration.

ApplyCue serves job seekers across technical and non-technical role families. It
is not an unattended mass-apply bot and cannot promise an interview, offer, fixed
search volume, or faster hire.

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

A pasted JD or job URL defaults to `review`. A job link supplied directly by the user also defaults to **high stakes** unless the user says to treat it as standard. Agent/scanner-discovered links remain standard unless the user upgrades them. Start the high-stakes workflow ahead of ordinary queued work; do not wait for the next batch. High stakes changes preparation depth and urgency, but it never bypasses liveness, legitimacy, current-employer, evidence, or named-application approval gates. Do not silently jump from finding jobs to applying.

The English canonical decision modes (`modes/_shared.md`, `modes/oferta.md`, `modes/ofertas.md`, `modes/auto-pipeline.md`, and `modes/pipeline.md`) own semantic behavior for MVP. Localized copies may guide output language but must not restore score thresholds or make a different decision.

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

When the durable story is clearer than the supplied CV, read `references/candidate-positioning-template.md`, propose a concise career spine and the genuinely useful role-family projections, and save them to user-owned `candidate-positioning.md` only after confirmation. This file captures reusable positioning and wording boundaries; it does not replace the exact CV baseline or become a second profile store. Reuse it in later role analysis and CV writing. If it changes, unsubmitted role decisions need review again because the evidence context changed.

Do not assume the supplied CV is exhaustive. People routinely omit or forget useful work. When a later JD exposes a potentially relevant area, ask a focused question and save the user's confirmed recollection in the approved evidence layer before using it. Do not require documentary proof or an exact metric; confirmed qualitative scope and outcomes are valid. Never manufacture precision.

### 4. Capture search intent

Ask only what is not already known: target outcomes, acceptable adjacent roles, geography/relocation, compensation, availability, current employer, past-employer policy, work authorization, hard no-go companies, and desired application pace.

Current employer is always skipped. Past employers need confirmation for each search/application policy change.

Summarize the material preferences back to the user and confirm them before the first search. Save only confirmed answers. Re-read the saved preferences before every final role decision/rank and again before drafting a role CV or application answer. If a missing preference could change the result, keep the affected role pending and ask; do not guess. Dashboard feedback may propose a preference change but never saves one without approval.

### 5. Baseline before edits

Run the first search against the exact supplied CV and confirmed intent. Record visible counts for fetched, objectively blocked, full-JD reviewed, shortlisted, skipped, CVs generated, attempted, and confirmed applied. This gives the user a clear “what ApplyCue did” baseline.

Only after the baseline should the agent propose base-CV improvements. Review them role-by-role or section-by-section and retain the user's language/style unless the user approves a change.

## Discovery and review

Use `portals.yml`, root providers, public job pages, user-added links, and approved native connectors. Prefer approved native email connectors for job-alert searches; if unavailable, tell the user what connection is needed. Never imply mailbox access before tool discovery and user approval. Most job boards do not expose agent connectors, so use public pages or the user's logged-in browser with permission.

Short cards, emails, snippets, and collapsed descriptions are leads, not JDs. Open the source in the user's real browser, expand “read more”, and read the full description before a final decision. If the full JD cannot be obtained, keep it pending or ask the user—do not reject it on the preview.

Code may reject only objective cases: unsafe/invalid URL, confirmed dead posting, exact source identity already handled, current employer, explicit hard constraint, or the exact application URL/attempt already recorded. Company/title cooldown hints, similar titles, inferred seniority, keyword overlap, and CV-to-JD fit go to the agent.

The agent reviews the viable queue and records `apply`, `watch`, or `skip`, confidence, strengths, gaps, unknowns, preference basis, and a plain-language reason. It then explicitly ranks the current `apply` queue. Before the decision becomes effective, store the expanded full JD with `review-evidence.mjs capture` and record the fingerprint-bound receipt after the report/tracker are final. Do not calculate a new semantic fit score; historical scores remain legacy diagnostics only. Audit false positives and false eliminations on the first run. Propose reusable configuration changes and get approval before saving them.

Before writing a role report, read `references/role-analysis-template.md`. Treat it as an adaptive output scaffold: write each job's analysis to a new file under `reports/`, never modify the reference for one job, retain its required evidence/decision contract, and adjust optional sections, depth, order, format, questions, and CV strategy to the role and user context. Do not fill irrelevant headings with boilerplate.

The receipt binds the decision to `config/profile.yml`, `modes/_profile.md`, `modes/_custom.md`, `cv.md`, `article-digest.md`, optional confirmed `candidate-positioning.md`, the captured JD, report, and tracker review fields. The optional file joins the fingerprint only when it exists, so installations that do not use it keep the existing flow. If a bound input changes, the dashboard and verifier treat the old decision as pending re-review. This is a deterministic stale-input check, not a code opinion about whether the change matters.

If the queue is starved, show which counts fell at each stage. Offer one change at a time in this order:

```text
source coverage -> title variants -> industry -> location -> recency -> strictness
```

Do not silently relax work authorization, blocked companies, current-employer, user no-go, unsafe-source, or application-approval rules.

## Employer context and high-stakes roles

Every role being prepared receives a light employer success brief before CV writing. Use the complete JD, official company/team context, and one current priority/source when it materially changes the message. Identify:

- explicit requirements and likely first 6-12 month outcomes;
- the people, customers, partners, or executives the role must influence;
- the primary role family and three signals the first page must communicate;
- likely hiring doubts, matching evidence, honest gaps, and unknowns;
- which points come from sources and which are agent inference.

Use the role-family guidance in `modes/heuristics/recruiter-side.md` and the contract in `docs/cv-tailoring-policy.md`. Do not apply a technical-CV formula to product, sales/GTM, programme/public-impact, strategy/consulting, or founder/operator roles.

The user may mark a role **high stakes** in chat or on the dashboard. Any job link supplied directly by the user starts high stakes by default unless they say it is standard. Persist that state in the existing dashboard-feedback ledger; do not create a second tracker. Most discovered roles remain standard applications. High-stakes preparation adds a repeatable campaign pack to the role's existing output folder; it does not add another tracker, CV engine, dashboard, or application path.

Immediately hydrate and review a high-stakes role before standard queued roles. If the decision is `apply`, put it at the front of application preparation and assign the top available apply rank, normally Rank 1; re-rank existing apply roles coherently. When several roles are high stakes, compare them and use the top consecutive ranks. If the decision is `watch` or `skip`, record that honestly—priority does not force an apply decision.

Once a user-supplied role has a job number, record its default before or during review:

```powershell
node job-feedback.mjs record --job=N --company="Company" --title="Role" --action=mark_high_stakes --url="https://example.com/job"
```

Resolve that receipt after the deeper work is reflected in the review/CV artifacts. A user can reverse it in chat or with `Return to standard` on the dashboard.

For a high-stakes role:

1. Research the company, team, strategy, culture, current priorities, and selection context more deeply.
2. When lawfully available, inspect a small set of public profiles or biographies of successful people at the same or adjacent level. Extract recurring experience signals and proof patterns, not personal identities, wording, or protected traits.
3. Build a positioning brief with the three promises to lead with, material gaps, bridge language, and evidence worth recovering from the user.
4. Ask only targeted questions that could materially improve this application. A missing line in the old CV is not proof the work never happened.
5. Produce the role CV and useful application narrative. Recommend a portfolio/case study, LinkedIn, website, GitHub, or public-bio change only when it could materially help this coveted role.
6. After the verified CV bundle exists, read `references/high-stakes-campaign-pack-template.md` and write `campaign-pack.md` under the same role output folder. Keep its identity fields and five evidence sections, while adapting optional content and depth to the role. Put a longer form narrative or public-profile recommendations in separate Markdown files only when useful.
7. Record and check the pack against the current review, CV, candidate positioning, and files:

```powershell
node high-stakes-pack.mjs record --job=N --pack="output/.../campaign-pack.md" --application-narrative="output/.../application-narrative.md" --actor=codex
node high-stakes-pack.mjs check --job=N
```

8. Draft any public-profile change separately. Never publish or modify a social/profile surface without separate user approval.

The campaign receipt is a freshness and handoff record, not a semantic judge or a second submit gate. Do not abandon an otherwise approved urgent application solely because the optional pack ledger is unavailable; tell the user, continue through the existing review/CV/preflight/approval gates, and repair the pack record afterward.

The goal is to earn a conversation, not maximize a keyword score. ApplyCue can improve the application but cannot promise an interview.

## First application batch

Select the first five ranked genuine matches, or fewer if fewer fit. Process viable high-stakes roles first, then fill the remaining batch from the ranked standard queue. Prepare each role fully; do not pad the batch with junk.

For every role:

1. Read the full live JD.
2. Store the expanded JD and create a current review receipt; do not reuse a stale decision.
3. Build the employer success brief and choose the primary role family; deepen it when the user marked the role high stakes.
4. Explain why it fits the user's intent and evidence.
5. Ask targeted questions for material work that may be missing from the old CV. Save confirmed additions in the approved user evidence layer; do not demand a metric or document when the user can accurately describe the work.
6. Draft the role CV from the baseline, confirmed profile facts, recovered evidence, employer brief, and role-family positioning.
7. Mark claims internally as sourced, reframed, or new/unconfirmed. Ask once for material confirmation; do not hard-reject useful marketing language merely because wording is new, and do not put provenance labels in the finished CV.
8. Save durable Markdown and HTML with the current job, JD, decision, and review-receipt metadata, then generate PDF and DOCX.
9. Record the four-file bundle with `cv-bundle.mjs record`, then run `cv-bundle.mjs check` against the exact PDF or DOCX proposed for upload. A changed file or review input makes the old bundle stale.
   For a high-stakes role, create and record the campaign pack now using the workflow above so the dashboard can show whether it is current.
10. Inspect the live application form without filling. Ask for missing answers; save a reusable answer with `application-preflight.mjs approve-answer` only after explicit approval, and never save passwords, OTPs, payment data, tokens, or identity-document numbers.
11. Record every currently visible field with `application-preflight.mjs record`. It must return `ready` against the current job, review, exact CV, and approved-answer fingerprint.
12. Show company, role, URL, exact verified CV filename, and any unresolved form answers.
13. Obtain explicit approval for this named application.
14. Follow `modes/apply.md`, including the application-attempt receipt.
15. Finish the attempt immediately. `confirmed` updates the matching tracker row to `Applied` and rebuilds its derived index; `unknown`, `failed`, and `abandoned` remain attempt evidence without pretending the application succeeded. An unknown outcome must not be retried automatically.

## Dashboard and learning loop

Run:

```powershell
npm run dashboard
```

The browser dashboard reads `data/applications.md` and shows stored scan volume plus agent-reviewed, shortlisted, applied, rejected, and skipped counts and links to the original posting, saved full JD, agent review, tailored PDF, and tailored DOCX. `Decision` (`pending|apply|watch|skip`), agent `Rank`/`Confidence`, lifecycle `Status`, and internal `Origin` are separate; never count `Evaluated` as shortlisted by itself. Tracker-derived current counts exclude non-current `Origin` rows; scan history is not yet attributed by run. Origin is internal metadata and the dashboard shows a badge only for imported/history rows, so do not ask a new user where a row came from when there is no imported history.

The dashboard uses stage-aware actions instead of thumbs: `Mark high stakes`/`Return to standard` for preparation depth, `Prepare application` or `Ignore` before preparation, `Inspect application form` or `Request CV change` after a verified CV exists, and `Approve & apply` only after a current ready preflight. Each action is appended to `data/job-feedback.jsonl`; it never mutates the tracker or preferences itself. The default dashboard order and `node job-feedback.mjs pending` put viable high-stakes work first. At status/dashboard handoff, process each receipt through the existing review, CV, preflight, tracker, and attempt owners, then resolve the receipt. Resolving a priority receipt acknowledges the work but does not erase the selected priority state.

Treat `Ignore` as a user stop, not a weak negative signal. It blocks application while pending. Record the resulting skip through the existing review/tracker owner and resolve the action, or dismiss it only after the user explicitly withdraws it.

A CV-change request must contain the user's note. It blocks application start until the agent updates the job-specific CV, regenerates and records a different verified bundle, and resolves the request against that new bundle fingerprint. If the user explicitly withdraws the request, resolve it with `--dismissed-by-user`. Do not resolve a request merely because it was read.

`Approve & apply` is explicit named approval for the receipt's exact company, role, selected CV bundle/file, and inspected form. Start that attempt with `--approval-receipt=<id>` instead of restating chat approval. The dashboard does not submit by itself; the agent still follows the application mode, records the attempt, and captures the outcome. Feedback notes may suggest one-job action or reusable tuning, but never rewrite preferences automatically.

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
node job-feedback.mjs pending
node generate-docx.mjs <tailored.md> <tailored.docx>
node cv-bundle.mjs check --job=N --cv=<selected.pdf-or-docx>
node application-preflight.mjs answers
node application-preflight.mjs check --job=N --company=<company> --title=<role> --url=<url> --cv=<selected.pdf-or-docx>
node application-attempt.mjs check --job=N
node review-evidence.mjs check --job=N
npm run check
```

Use the relevant `modes/*.md` file for evaluation, CV, pipeline, application, contact, or follow-up details. Commands are implementation details; explain outcomes in plain language.

## MVP boundary

MVP ends at a confirmed application plus tracking and feedback. Interview scheduling, alerts, deep interview preparation, offer comparison, and negotiation are documented future flows. Do not delay a working CV-to-application loop to build them now.

## Success gate

“Ready” means a clean checkout can be installed by an agent, ingest a real CV without losing content, discover roles, hydrate full JDs, produce a sensible shortlist, create verified PDF and DOCX files, obtain named approval, make one controlled application attempt, record a reliable outcome, and show it on the dashboard.
