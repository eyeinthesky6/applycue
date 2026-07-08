# Research: Agent Fit And Guardrail Logic

Date: 2026-07-07

## Stance

ApplyCue is not a generic job board, search engine, or "Google for jobs."

The objective is:

```text
agents help a user get a job from thousands of postings every day
```

CVs and JDs are messy. Titles, seniority, salary, location, company quality, and role shape differ by country, company, industry, hiring manager, and timing. A coded matcher will never know every human reason a user approves or rejects a role.

So ApplyCue should not chase a perfect deterministic fit score.

The product split is:

```text
agent judges fuzzy fit
code enforces safety, truth, repeatability, and evidence
```

If an agent can do the work more efficiently by reading the CV, JD, user preferences, and prior feedback, do not add complex code for it.

## What Belongs In Code

Keep these ApplyCue-owned and tested:

- source adapters for approved APIs, job boards, company pages, and browser-extracted jobs
- normalization into `JobRecord`
- dedupe, scan history, liveness, and basic trust/fraud checks
- hard blockers from user rules
- fact ledger, proof bank, and reusable user-approved answers
- CV/JD reconciliation so unsupported claims cannot enter a CV or form answer
- one standard CV renderer
- browser apply policy, preflight, receipts, and manifests
- source/outcome summaries for agent diagnostics

Hard blockers include:

- current company when blocked
- explicitly blocked companies or industries
- impossible work authorization
- blocked country/location/work mode
- internship/junior role when the user target excludes it
- known closed posting
- suspicious portal or payment/document request
- unsupported CV/application claim

These are not "low score" cases. They are stop, skip, or ask-user cases.

## What Belongs To The Agent

Let the agent handle:

- role/domain fit from the JD and company context
- fuzzy seniority interpretation
- whether a title is equivalent across company sizes
- whether a role is a good stretch
- source suggestions after seeing poor volume
- search widening proposals
- concise shortlist reasoning
- user preference updates from feedback
- deciding what to ask when ambiguity affects action

The agent should write reusable decisions into user-owned config or assets:

- target role/profile notes
- source approvals
- blocked or preferred companies
- location and work-mode preferences
- company seniority overrides
- proof bank additions
- reusable application answers
- base CV version updates

The agent must not patch source code or hand-edit final generated CVs for one application.

## CV/JD Matching Rule

Do not use matching math to prove experience.

The CV engine only needs this truth test:

```text
direct approved proof -> supported
adjacent approved proof -> needs user confirmation
no approved proof -> unsupported
```

Adjacent evidence can help the agent ask a better question. It cannot create a CV claim or fill an application answer by itself.

This requirement-to-proof mapping can stay simple. Do not add Hungarian matching, graph matching, embeddings, or learned models unless a future test proves the current truth check is failing in a way the agent cannot fix through proof-bank/config updates.

## Shortlisting Rule

Use code for order, not truth.

The engine may group jobs into:

```text
apply -> review -> watch -> skip
```

Inside those buckets, simple backend ordering is acceptable. The output should still be shown to the user as decisions and reasons, not as a personal score or probability of success.

If the shortlist is bad, fix in this order:

1. update target roles/preferences
2. update source filters or source approvals
3. update proof bank or base CV facts
4. let the agent re-evaluate the jobs
5. only then consider code changes

Do not add embeddings, cross-encoders, learning-to-rank, RRF expansion, or salary/seniority models as the default answer to poor fit.

## Source Logic

Source discovery should find enough jobs without making the user search manually.

Use prebuilt providers and official/public APIs where they save work:

- JobSpy for broad no-login job-board discovery
- public ATS/company adapters
- browser-visible extraction for pages without clean APIs
- Crawl4AI or similar only when it clearly saves extraction work

But source discovery is supply, not judgment. Every source result still goes through:

```text
normalize -> dedupe -> hard blockers -> agent shortlist -> truth reconciliation -> apply policy
```

Do not keep adding broad scrapers just because they can fetch thousands of jobs. If volume is high and quality is low, tighten sources. If volume is low because user rules are strict, ask the user whether to relax reusable preferences.

## Outcome Learning

Outcome learning should help the agent, not become a hidden ranking model.

Track:

- source
- submitted applications
- replies
- interviews
- offers
- rejections
- user feedback when volunteered

Use this to tell the agent:

- which sources are producing useful roles
- which patterns are being rejected
- where to widen or tighten the search
- whether a lower-priority role pattern is surprisingly working

Do not force the user to explain every rejection. If they give a reason, store it. If they do not, move on.

## OSS And Library Policy

Use libraries where they remove boring plumbing:

- `docx` for DOCX export
- Mammoth.js for DOCX CV import
- Ajv or TypeScript contracts for validation
- JobSpy for job-board fetching
- Playwright/browser tools for application execution and testing
- JSON Resume as schema inspiration

Avoid libraries whose main purpose is ranking intelligence unless a later evidence-backed decision proves they are needed:

- embedding rerankers
- cross-encoders
- learning-to-rank frameworks
- graph neural networks
- custom resume/job matching models

The user needs interviews and offers, not a model zoo.

## Implementation Guidance

Existing backend ordering code may remain if it is already working and tested, but do not expand it into the core product strategy.

New work should prefer:

```text
user config -> agent evaluation -> hard gates -> CV truth reconciliation -> apply policy
```

over:

```text
more scoring weights -> more ranking models -> more hidden fit math
```

When in doubt, ask:

```text
Can the agent do this better by reading the CV, JD, and user preferences?
```

If yes, keep it in the agent workflow and user config.
