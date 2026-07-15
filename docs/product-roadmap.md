# ApplyCue Product Roadmap

## MVP / 0.1 — agent-operated CV to confirmed application

Primary interface: Codex, Claude, or another local coding agent.

Implementation order and feature disposition are owned by the [ApplyCue/Career-Ops integration plan](2026-07-14_applycue-career-ops-integration_architectural_review.md). Roadmap inclusion does not mean the corresponding integration is already implemented.

Included:

- one-link clone/install instructions for agents and humans;
- exact CV baseline plus approved portfolio/public-source enrichment;
- profile/story confirmation and search intent;
- configured provider scans, user links, public pages, and approved inbox leads;
- full-JD hydration before semantic decisions;
- durable full-JD captures and fingerprint-bound review receipts that invalidate stale decisions;
- agent-owned `apply`, `watch`, `skip` review with strengths, gaps, unknowns, preference basis, reason, explicit queue rank, and confidence;
- separate agent decision/rank/confidence, application lifecycle, and internal history origin; new users see no origin badge unless history is imported;
- first five genuine matches, or fewer when fewer fit;
- a light employer success brief before every role CV: explicit requirements, likely first-year outcomes, people to influence, recruiter doubts, sourced context, agent inference, and unknowns;
- role-family CV writing for technical, product, sales/GTM, operations/programme/public-impact, strategy/consulting, founder/operator, and genuine hybrid roles;
- targeted recovery of useful work missing from the old CV, with user-confirmed recollection accepted as evidence and qualitative outcomes allowed when exact metrics are unavailable;
- role-specific Markdown/HTML/PDF/DOCX CVs bound to the current JD/decision, with file hashes and an exact selected-upload check;
- a durable `standard|high_stakes` role marker in the existing dashboard-feedback state, with user-supplied job links defaulting to high stakes, viable high-stakes work moving ahead of the standard queue, and discovered links defaulting to standard;
- high-stakes treatment with deeper bounded company context, positioning questions, and optional draft social/portfolio recommendations without publishing them;
- reusable user-approved form-answer receipts without credentials/payment/identity-document values;
- named approval, browser preflight, application attempt receipt, and confirmed tracking;
- browser dashboard with counts, original-JD/CV links, filters, high-stakes/standard priority, prepare/ignore/CV-change/form actions, and exact named apply approval;
- exact application URL/attempt and current-employer protection, with ambiguous cooldowns sent to agent review.

Exit criteria:

1. Clean machine/repo install from the public link.
2. Real CV imported without material loss.
3. Viable source batch with visible stage counts.
4. Agent review shows acceptable precision and catches false eliminations.
5. At least one non-trivial role gets an employer success brief, role-family positioning, any material evidence questions, and a current verified Markdown/HTML/PDF/DOCX bundle with exact selected-upload check.
6. One controlled real or approved test application reaches a reliable receipt.
7. Dashboard shows the same outcome.

Not required for MVP: embedded AI API, automatic email classification, calendar scheduling, proactive alerts, interview prep, offer negotiation, hosted accounts, or billing.

## V1 — reliable application operations

- multi-candidate profile isolation outside the source checkout;
- connector-assisted inbox discovery and confirmation reconciliation;
- portal adapter library for repeated high-volume forms;
- cross-session answer review, expiry, and multi-profile isolation;
- stronger application-history import and configurable cooldowns;
- scheduled scans/alerts with user-controlled frequency;
- post-application follow-up and basic interview/company/role preparation;
- source quality scorecards and India/international coverage trials.
- saved high-stakes employer/positioning briefs that distinguish employer statements, public evidence, agent inference, and unknowns;
- bounded pattern research across public biographies/profiles of comparable successful people at the same or adjacent level, focused on recurring scope and proof signals rather than personal or protected traits;
- targeted evidence-recovery questions generated from the employer brief, with confirmed additions saved once and reusable across later applications;
- repeatable high-stakes application packs: role CV, application narrative, optional cover letter, relevant case-study/portfolio recommendation, and draft LinkedIn/website/GitHub/public-bio changes;
- outcome learning that compares standard and high-stakes preparation time, user effort, application completion, shortlist quality, and interview conversion.

V1 exit: multiple users can run repeat sessions without state mixing, blind retries, or manual file surgery, and a marked high-stakes role can produce a coherent campaign pack without changing any public profile until the user separately approves it.

## V2 — hosted or SaaS-like product

- web onboarding/chat with CV and social/portfolio upload;
- authentication, encrypted user storage, job queue, audit log, and tenancy;
- embedded model/API routing where local agents are unavailable;
- native email/calendar integrations, reminders, interview scheduling, and notifications;
- interview preparation, offer comparison, and negotiation workflows;
- metered action-based commercial plans rather than compulsory monthly subscription;
- user-facing application-history/cooldown controls and deletion/export.
- optional market-readiness/repositioning journey that reviews the CV, LinkedIn, website, public writing, portfolio, projects, and target-market signal together;
- reusable role-family positioning across job searches, while keeping high-stakes job campaigns attached to the same candidate evidence rather than creating a second profile engine.

V2 exit: hosted operation matches the local agent product's judgment and safety while meeting privacy, reliability, support, and commercial requirements.

## Model trials

Do not trial models merely because an API exists. Use `docs/ai-judgment-trial-plan.md`. A trial starts only when a repeatable judgment task cannot be served by the user's native agent, the evaluation set exists, cost/privacy are acceptable, and a measurable expected gain is stated.

## Future post-application boundary

Interview scheduling, alerts, basic company/role/salary/culture preparation, deep interview coaching, and offer negotiation belong after the CV-to-application loop proves itself. They may become separate heavy skills if their instructions become large; they should not complicate MVP application readiness.
