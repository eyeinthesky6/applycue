# ApplyCue Product Roadmap

## MVP / 0.1 — agent-operated CV to confirmed application

Primary interface: Codex, Claude, or another local coding agent.

Included:

- one-link clone/install instructions for agents and humans;
- exact CV baseline plus approved portfolio/public-source enrichment;
- profile/story confirmation and search intent;
- configured provider scans, user links, public pages, and approved inbox leads;
- full-JD hydration before semantic decisions;
- agent-owned `apply`, `watch`, `skip` review;
- first five genuine matches, or fewer when fewer fit;
- role-specific Markdown/HTML/PDF/DOCX CVs;
- named approval, browser preflight, application attempt receipt, and confirmed tracking;
- browser dashboard with counts, links, filters, and feedback;
- exact application URL/attempt and current-employer protection, with ambiguous cooldowns sent to agent review.

Exit criteria:

1. Clean machine/repo install from the public link.
2. Real CV imported without material loss.
3. Viable source batch with visible stage counts.
4. Agent review shows acceptable precision and catches false eliminations.
5. At least one role gets correct PDF and DOCX artifacts.
6. One controlled real or approved test application reaches a reliable receipt.
7. Dashboard shows the same outcome.

Not required for MVP: embedded AI API, automatic email classification, calendar scheduling, proactive alerts, interview prep, offer negotiation, hosted accounts, or billing.

## V1 — reliable application operations

- multi-candidate profile isolation outside the source checkout;
- connector-assisted inbox discovery and confirmation reconciliation;
- portal adapter library for repeated high-volume forms;
- reusable approved answer vault without secrets/OTPs;
- stronger application-history import and configurable cooldowns;
- scheduled scans/alerts with user-controlled frequency;
- post-application follow-up and basic interview/company/role preparation;
- source quality scorecards and India/international coverage trials.

V1 exit: multiple users can run repeat sessions without state mixing, blind retries, or manual file surgery.

## V2 — hosted or SaaS-like product

- web onboarding/chat with CV and social/portfolio upload;
- authentication, encrypted user storage, job queue, audit log, and tenancy;
- embedded model/API routing where local agents are unavailable;
- native email/calendar integrations, reminders, interview scheduling, and notifications;
- interview preparation, offer comparison, and negotiation workflows;
- metered action-based commercial plans rather than compulsory monthly subscription;
- user-facing application-history/cooldown controls and deletion/export.

V2 exit: hosted operation matches the local agent product's judgment and safety while meeting privacy, reliability, support, and commercial requirements.

## Model trials

Do not trial models merely because an API exists. Use `docs/ai-judgment-trial-plan.md`. A trial starts only when a repeatable judgment task cannot be served by the user's native agent, the evaluation set exists, cost/privacy are acceptable, and a measurable expected gain is stated.

## Future post-application boundary

Interview scheduling, alerts, basic company/role/salary/culture preparation, deep interview coaching, and offer negotiation belong after the CV-to-application loop proves itself. They may become separate heavy skills if their instructions become large; they should not complicate MVP application readiness.
