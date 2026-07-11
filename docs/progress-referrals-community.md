# Progress, Community, And Later Network Intelligence

Date: 2026-07-06

Status: deferred product plan. Current launch scope is defined in `launch-readiness.md`.

## Decision

ApplyCue v1 stays local-first and focused.

V1 should solve:

```text
discover -> shortlist -> tailor CV -> apply -> track -> reply -> interview -> offer -> learn
```

Progress tracking can be simple:

- local state files under the active output root, with real user runs stored under `~/.applycue/profiles/<profile>/data/local/`
- generated HTML reports under the active output root, with real user runs stored under `~/.applycue/profiles/<profile>/outputs/`
- no SaaS dashboard in the first version
- no referral engine in the first version
- no long-tail workflow coverage before the main CV-to-offer loop works

The user should be able to open one local HTML file and see what happened today.

## Local Progress Dashboard

The dashboard is not the product. It is the control mirror for the agent.

V1 should show:

- applications found
- applications shortlisted
- CVs generated
- applications submitted
- replies received
- interviews
- offers
- rejections
- paused applications
- pending questions
- what the agent will try next

It should not show big personal scores.

Backend ordering signals are for the agent. The user-facing language should be:

```text
Applied
Needs review
Waiting for reply
Interview
Offer
Blocked
```

Suggested real user local layout:

```text
~/.applycue/profiles/<profile>/
  data/local/
    profile.json
    jobs.jsonl
    applications.jsonl
    messages.jsonl
    questions.jsonl

  outputs/
    dashboard/
      latest.html
      2026-07-06.html
    cvs/
      company-role-cv.md
      company-role-cv.pdf
```

Implementation shape:

- `packages/tracker` owns application and outcome state.
- `packages/tracker` can render a static HTML report from a `ProgressSnapshot`.
- Later, the same state can feed a web UI or SaaS database without changing the core agent behavior.

## Parked: Network Intelligence

This is a next-version feature, not v1.

The useful version is not:

```text
Find random people who can refer me.
```

The useful version is:

```text
For this company or role, show who in my network can help me understand the company, culture, compensation, benefits, interview process, and maybe refer me later.
```

Sources later:

- target jobs and companies from the daily batch
- LinkedIn network, if the user logs in and allows browser control
- Facebook network, if the user logs in and allows browser control
- phone contacts, if imported or connected by the user
- email contacts, if connected by the user
- WhatsApp or Telegram groups, if the user allows access or imports posts
- alumni, community, founder, recruiter, and employee posts

Later flow:

1. User selects or agent finds a target company.
2. Agent searches approved social/contact sources for matching people.
3. Agent shows a social heat map: strong ties, weak ties, alumni, ex-colleagues, current employees, recruiters, founders, and community members.
4. User chooses who is worth contacting.
5. Agent opens the social site or messaging channel.
6. User logs in if needed.
7. Agent drafts the DM or post.
8. User reviews and presses send.
9. Agent tracks replies and useful company/interview intelligence.
10. Referral can be a possible later outcome, not the starting assumption.

The social heat map should answer:

- who do I know at this company?
- who knows someone there?
- who can tell me about culture, compensation, benefits, and hiring process?
- who might help with interview prep?
- who might refer me if the fit is real?
- which contact path is least awkward and highest signal?

Default safety later:

- user presses send by default
- no spam blasts
- no fake familiarity
- no fake relationship claims
- no sensitive personal messages without approval
- pause when the person is a current employer contact unless the user allows it

This can be a paid-plan feature later because it needs browser control, social connectors, contact import, privacy controls, and careful UX.

## Can ReferCommander Help?

ReferCommander is not needed for v1.

It can inspire later implementation patterns, but ApplyCue should not import it as the engine.

Code-rooted read:

- ReferCommander is currently a Fleet-first referral operations platform.
- It has referral links, candidate claims, missing-referral reports, candidate timelines, notification delivery, program policy, and reporting.
- Its domain is fleet/gig referral operations, not job-seeker social network intelligence.

Useful ideas to copy conceptually later:

- contact or conversation timeline
- message/draft queue
- outcome history
- local reporting and audit-friendly event history

What not to reuse directly:

- fleet program logic
- payout and reward ledger logic
- affiliate naming
- operator workspace model
- fleet candidate lifecycle
- ReferCommander app shell

## WhatsApp And Telegram Community

A WhatsApp or Telegram group can help adoption and feedback.

Good uses:

- beta support
- sharing high-quality leads
- collecting scam portal reports
- collecting interview outcome feedback
- seeing which job sources work in practice

Bad uses:

- replacing the product
- turning into noisy job forwarding
- letting users spam strangers
- relying on manual group posts as the main source of jobs

V1 stance:

- community is support and lead intake
- ApplyCue can ingest useful posts later
- ApplyCue should still run through its own discovery, shortlisting, tailoring, apply, and tracking loop

Suggested group rules:

- no paid job leads
- no training-fee or deposit jobs
- no fake referrals or fake relationship claims
- no scraping private member contact details
- share company, role, location, source link, and why it looks useful

## Early-Career Proof Builder

Early-career proof builder means:

```text
Help a user with little formal experience turn real projects, coursework, internships, hackathons, volunteer work, writing, and portfolio work into proof-backed CV material.
```

It is not fake experience generation.

Example:

```text
Raw input:
Built a capstone churn model in Python.

Proof questions:
What dataset?
What metric?
What was your part?
Is there a GitHub link, report, demo, or screenshot?

CV-safe output:
Built a Python churn prediction model for a capstone project, evaluated model quality on a labeled dataset, and documented results in a project report.
```

V1 priority:

Keep this as a proof-bank helper, not the core product.

## V1 Build Order

1. Application tracker and local HTML dashboard.
2. Local state files for jobs, applications, messages, and pending questions.
3. Basic generated reports: daily batch, replies, interviews, offers, paused items, next actions.
4. Community group support for beta users.
5. Network intelligence after the core application loop is working.
6. Early-career proof builder after the senior/active-search loop is working.
