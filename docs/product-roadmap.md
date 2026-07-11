# ApplyCue Product Roadmap

Date: 2026-07-10

Status: canonical product-version plan. This document owns only MVP, V1, and V2 scope and exit criteria. `PRODUCT_DECISION.md` owns product direction and interface decisions, `ARCHITECTURE.md` owns technical boundaries, `launch-readiness.md` owns release claims, and the canonical skill owns agent behaviour.

## Version Rule

MVP, V1, and V2 are evidence gates, not promised dates. The settled product shape and pnpm-to-CLI-to-SaaS interface path are defined once in [`PRODUCT_DECISION.md`](PRODUCT_DECISION.md); this roadmap places work into versions without reopening those decisions.

## Current Snapshot

The independent TypeScript ApplyCue path owns the supported runtime:

```text
skills/applycue/SKILL.md
  -> pnpm applycue:*
  -> apps/worker
  -> packages/*
  -> ~/.applycue/profiles/<profile>/
```

Implemented foundations include:

- external profile storage and multi-profile separation;
- discovery and normalized jobs from manual, ATS, job-board, email-lead, and JobSpy paths;
- bounded ATS/job-board source execution and a direct no-key starter fallback that does not depend on JobSpy;
- opt-in configured-source canaries that write profile-local health evidence without preparing applications;
- source quality, freshness, dedupe, scan history, liveness hooks, fraud and policy gates;
- evidence-rich decision queues with full normalized JD artifacts, source/date metadata, hard-gate results, and backend ordering reasons;
- atomic, idempotent bulk decision recording with optional automatic downstream preparation;
- clear system shortlist decisions combined with recorded Codex/Claude/user decisions for ambiguity or correction;
- decision provenance and refusal to override current hard gates;
- code-owned base-CV import from DOCX, text-based PDF, Markdown, and text while retaining the original source asset;
- truthful CV planning, reconciliation, diagnostics, and Markdown/HTML/DOCX output;
- application drafts, routes, form data, browser plans, preflight, receipts, and guarded live execution;
- outcomes, tuning signals, source scorecards, dashboard, chat summary, status, and UAT;
- a canonical ApplyCue skill and thin agent-specific skill bridges;
- removal of the inherited career-ops runtime and Docker/Nix surface from this branch.

This is substantial product functionality, but it is not the same as a completed release or SaaS.

## MVP / Version 0.1: Codex/Claude-Operated Local Product

### User experience

The user opens ApplyCue through Codex or Claude and chats naturally. The agent:

1. collects the CV, target roles, preferences, constraints, profile/social links, and application policy;
2. stores approved user data outside the repo;
3. discovers the current host's connectors and browser capabilities, then asks only for access that has immediate value;
4. finds and normalizes jobs from approved public, email, and logged-in sources;
5. classifies the full candidate queue, preserving hard-blocked rows for audit;
6. lets the engine resolve clear matches and rejections, then uses Codex/Claude only for ambiguous `review` rows;
7. produces the final shortlist up to the configured daily target from clear system matches plus recorded ambiguity decisions;
8. fills/uploads through a generated route and current preflight;
9. pauses for unknown, sensitive, risky, or policy-controlled actions;
10. records receipts and outcomes;
11. improves reusable settings only through approved tuning.

Codex/Claude is the primary interaction layer. There is no embedded ApplyCue model, model API key, standalone GUI, or SaaS account.

### What is already built

Most of the engine and agent workflow above is implemented and tested. The current launch path needs no career-ops runtime and no Docker container.

### What remains before an MVP release claim

1. **Prove the real hybrid path.** On a real or approved fixture queue, automatically prepare clear matches, record at least one safe ambiguity decision when available, and prove status reports `system_clear`, `hybrid_system_external`, or `recorded_external` rather than UAT/test authority.
2. **Prove a representative real application path.** Capture consented live preflight and fill/upload/pause receipts on representative ATS families. A local fake form proves mechanics, not portal compatibility.
3. **Run clean-install evidence.** Prove the pinned Node/pnpm setup on supported operating systems from a clean checkout without relying on machine residue.
4. **Verify a durable private security-reporting route.** This remains a formal launch blocker in `SECURITY.md`.
5. **Exercise profile isolation.** Run at least two fake or consented profiles and prove config, CVs, decisions, routes, receipts, and outcomes do not cross.
6. **Freeze a small acceptance fixture.** Preserve a fake end-to-end queue that proves queue generation, decision recording, preparation, browser pause, receipt, and outcome recording together.
7. **Prove native capability discovery and consent.** Exercise ready, connect, unavailable, denied, and unhealthy states; prove one narrow Gmail or Outlook read/import flow in a supported agent host and one user-approved preferred job-site session. The public-source path must still work when access is declined.
8. **Correct remaining launch wording.** Do not confuse implemented PDF text import with PDF output generation. Do not claim PDF output, universal portal compatibility, autonomous email/social sending, job-site connector support, or outcome improvement without evidence.

### MVP definition of done

- `pnpm applycue:check` passes;
- UAT and browser UAT pass, are labelled as test authority, and do not displace the normal preparation run;
- the normal decision-controlled run passes from queue through artifact receipt;
- no unsupported CV claim is produced;
- no user data is written into the repo;
- at least one representative consented real-portal flow has evidence;
- one supported agent host has evidence for connector discovery, narrow email read/import, consent, revocation or disconnect, and graceful public-source fallback;
- one preferred logged-in job site has evidence for user-owned login, allowed inspection/search, safe pause, and no credential storage;
- status gives the correct next action and never presents test drafts as approved;
- launch-readiness, security, installation, and rollback checks pass.

## Version 1.0: Installable Local Agent Product

### User experience

The user still works primarily in Codex or Claude, but the agent installs and operates ApplyCue without requiring a source checkout or knowledge of pnpm. Local data remains user-owned.

### V1 scope

1. **Standalone CLI and installer**
   - publish a thin `applycue` executable/package;
   - structured JSON output, stable exit codes, help, version, capability status, and non-interactive flags;
   - clean install/update/rollback and compatibility tests;
   - keep all logic in existing packages.

2. **Transactional local state**
   - per-profile SQLite repository behind current contracts;
   - migrations plus JSON/JSONL import/export;
   - profile leases, idempotency keys, run/attempt records, artifact hashes, crash recovery, backup, and restore;
   - preserve generated documents as files in the profile store.

3. **Hardened discovery**
   - runtime schema validation at every external adapter boundary;
   - keep the implemented bounded source/detail worker pool; add retry/backoff, per-source rate policy, cancellation, and persisted attempts;
   - remove the explicit reverse-directory compatibility dependency or replace it only with commercially permitted, pinned/cached data;
   - keep fixture contracts and the implemented opt-in source-canary runner; accumulate repeated evidence per supported provider and market;
   - add a provider only when it closes measured coverage, has an approved licence/source, and wins an ApplyCue contract trial; do not restore a removed career-ops module.

4. **Better CV intake and quality evidence**
   - harden the implemented Mammoth DOCX and PDF.js text-PDF importers against a representative redacted fixture set;
   - trial OCR only when real image-only CV evidence justifies the extra dependency and review surface;
   - preserve one ATS output design until outcome evidence justifies more;
   - benchmark truth, completeness, review acceptance, and supported-term visibility.

5. **Reliable application execution**
   - portal compatibility matrix for major ATS families;
   - resumable attempts and duplicate-submit prevention;
   - explicit evidence for fill, upload, pause, submit, confirmation, and failure;
   - native Codex/Claude connector use first and controlled browser fallback under user permission.

6. **Operational product quality**
   - profile export/delete/backup;
   - local diagnostics and redacted logs;
   - outcome cohorts with sample counts and honest uncertainty;
   - repeatable multi-profile operation;
   - optional scheduled runs invoked by the user's agent, with bounded scope and no silent widening.

### V1 definition of done

- a new user can tell Codex/Claude to install ApplyCue and reach a useful shortlist without touching the repo;
- the CLI contract is versioned and exercised by the same end-to-end tests as pnpm aliases;
- interrupted work resumes without duplicate applications or corrupt state;
- supported discovery and portal families have fixture and live-canary evidence;
- local export, backup, restore, and deletion are verified;
- real early-user cohorts show useful shortlist quality and zero unsupported claims.

V1 does not require a hosted model, multi-tenant SaaS, managed browser fleet, or social-network automation.

## Version 2.0: Hosted ApplyCue SaaS

### User experience

The user visits ApplyCue and chats with its AI. They can:

- create an account and profile;
- upload a CV or resume and supporting files;
- add LinkedIn, GitHub, portfolio, personal-site, and other user-approved links;
- enter target roles, locations, compensation, work authorization, preferences, proof, and manual facts;
- review a personalized job inbox and concise decision reasons;
- approve CVs, reusable answers, applications, emails, DMs, and sensitive actions in chat or an approval queue;
- see application status, receipts, replies, interviews, offers, and next actions;
- export or delete their data.

Links are evidence inputs, not permission to bypass platform terms or scrape logged-in accounts. OAuth or browser access must be explicit, scoped, revocable, and separately approved.

### V2 platform scope

1. **SaaS product surface**
   - responsive web chat;
   - guided onboarding and uploads;
   - profile/evidence editor;
   - job inbox, role detail, CV preview, application approval, exceptions, and outcome views;
   - notifications and user-visible activity history.

2. **Hosted architecture**
   - authenticated multi-tenant API;
   - PostgreSQL and encrypted object storage;
   - tenant isolation, audit events, retention controls, export, and deletion;
   - durable job queues, retries, leases, idempotency, and managed workers;
   - managed browser capacity only for explicitly supported routes.

3. **AI judgement productization**
   - use the frozen Codex/Claude decision baseline as the quality reference;
   - trial hosted models behind the existing decision contract;
   - record provider/model/prompt/input provenance;
   - keep hard gates, truth reconciliation, and permissions in deterministic code;
   - preserve user review and a rollback path.

4. **Connectors**
   - user-approved email, drive/document, calendar, and relevant job-source integrations;
   - draft-first social/referral workflows;
   - explicit OAuth scopes, revocation, connector health, and deletion behavior;
   - no silent sending or platform-rule bypass.

5. **SaaS operations**
   - billing and plan limits;
   - observability, support, incident response, abuse controls, and security program;
   - privacy policy, terms, subprocessor inventory, data residency/retention decisions, and regulatory review;
   - cost and latency controls per job, CV, decision, and application attempt.

### V2 definition of done

- a non-technical user completes onboarding and receives a useful reviewed shortlist through chat;
- hosted CV, decision, application, and outcome flows preserve the local contracts and safety invariants;
- tenant isolation, authorization, audit, export, deletion, backup, and incident recovery are independently verified;
- hosted model judgement beats or matches the native-agent benchmark under its promotion gates;
- supported connectors and browser routes have clear permission, reliability, and rollback evidence;
- product outcome reporting uses real cohort counts and does not guarantee interviews or offers.

## Decision Dependencies

This roadmap does not repeat the career-ops disposition, cross-version invariants, interface decision, AI technology order, or success-claim ladder. Those are retained in [`PRODUCT_DECISION.md`](PRODUCT_DECISION.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), [`ai-judgment-trial-plan.md`](ai-judgment-trial-plan.md), and [`launch-readiness.md`](launch-readiness.md). Dated evaluations retain the detailed comparisons that justified them.

## Change Rule

New roadmap work must identify its version, owner, acceptance evidence, and rollback. Historical plans may explain how ApplyCue arrived here, but they do not redefine version scope.
