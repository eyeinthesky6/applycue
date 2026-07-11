# End-to-End Product Flow Architectural Review

Date: 2026-07-11

Status: historical implementation record. Its all-viable-rows external-review boundary was superseded later on 2026-07-11 by the canonical hybrid boundary in `ARCHITECTURE.md`: the engine resolves clear rows and Codex/Claude handles only ambiguity. Counts and authority values below describe the pre-hybrid run and are retained as evidence, not current instructions.

## Scope

Review the real profile-to-outcome flow, find avoidable user effort and misleading handoffs, automate safe background work, and preserve the accepted external-agent architecture. This review does not authorize embedded model APIs, silent source widening, logged-in account use, sending, or submission.

## Evidence Checked

- canonical workflow in `skills/applycue/SKILL.md`;
- architecture, product roadmap, live runbook, data contracts, and launch guidance;
- worker commands and status handoff in `apps/worker`;
- batch orchestration and decision receipts in `packages/engine`;
- shared contracts in `packages/core`;
- ranking, discovery, CV generation, route, dashboard, and tracker owners;
- current default-profile run evidence: 62 filtered/deduplicated jobs, zero recorded external decisions, zero prepared applications, and `awaiting_external` authority;
- focused engine/status/tracker tests and existing UAT evidence.

## Tool Baseline

The existing modular monolith remains the correct baseline:

```text
user <-> Codex/Claude <-> canonical skill <-> worker command
                                          -> typed engine/contracts
                                          -> profile-local artifacts and receipts
```

No second workflow engine, embedded AI SDK, database, scheduler, Docker service, or career-ops runtime is needed for this correction.

## Agent-Led Review

The actual product path is:

```text
profile facts and policy
  -> approved discovery adapters
  -> normalized jobs
  -> freshness, quality, dedupe, history, and hard gates
  -> backend ordering
  -> external-agent decision
  -> durable decision receipt
  -> truthful CV, diagnostics, draft, route, and dashboard
  -> form confirmation and live preflight
  -> user-policy-controlled send/submit
  -> receipt, outcome, and tuning
```

The owners are coherent. The broken experience was at the boundary between backend ordering and external-agent judgement.

## Findings

### 1. The queue did not contain enough evidence

The generated decision row had company, title, source name, backend decision, reasons, gates, and next step. It omitted the job URL, normalized JD, dates, work metadata, compensation, live state, and backend component scores. The canonical skill expected the agent to judge using evidence that the queue did not actually expose.

### 2. Valid supply was labelled as low volume

Funnel health used prepared-application count as a proxy for source supply. With 62 valid jobs waiting for agent decisions and zero approved CVs, status recommended finding more jobs. This confused a judgement backlog with a discovery failure.

### 3. Batch review required needless command repetition

The only receipt path recorded one job at a time, followed by a separate `first-build`. A normal reviewed queue therefore required repeated subprocesses even though the decisions were already available as one agent result.

### 4. Safe automation stopped too early

After the agent had made decisions, receipt recording and downstream artifact generation needed no further user input. They were separate only because the command surface had not joined them.

## Implemented Fixes

1. Every ranked queue row now includes source URL, bounded JD excerpt, full normalized JD path, available role metadata and dates, live state, backend priority/components, reasons, and hard gates.
2. A full normalized JD Markdown artifact is now written for every ranked job before approval, not only for already prepared applications.
3. Funnel health records `recordedDecisions` and `awaitingDecisions` and uses `awaiting_decisions` when ranked supply exists but judgement is pending.
4. Status uses `NEEDS DECISIONS`, names the queue size, and recommends the bulk review path instead of source widening.
5. `applycue:record-decisions -- --input <file> --prepare` validates the whole reviewed batch, writes receipts atomically, skips unchanged retries, and automatically generates all approved downstream artifacts.
6. Hard gates remain non-overridable. `--prepare` does not widen scope, confirm form data, use accounts, fill portals, send, or submit.

## Automation Boundary

Run automatically once the user has supplied the required profile and scope:

- public discovery through already approved adapters;
- normalization, source quality, freshness, dedupe, history, liveness, and hard gates;
- queue generation and external-agent review;
- atomic decision-receipt recording;
- CV, DOCX/HTML/Markdown, diagnostics, reconciliation, drafts, routes, dashboard, and summary generation;
- read-only status, canaries, UAT, outcome aggregation, and approved tuning application.

Pause or ask for input for:

- missing or conflicting candidate facts;
- geography, source, recency, title, seniority, or volume widening;
- saved preference/fact/policy changes;
- new connector/account access or logged-in browser use;
- reusable or sensitive form answers and master-form confirmation;
- email/DM sending and application submission;
- hard-gate conflicts, suspicious sources, or unsupported CV claims.

Unattended scheduling remains V1 work because it needs durable leases, attempts, retries, cancellation, and recovery. The MVP agent may run the full safe sequence during an active Codex/Claude task without user command-by-command involvement.

## Verification

- `pnpm applycue:check` passes: 21 test files and 255 tests.
- Tests prove enriched queue evidence and pre-approval JD files.
- Tests prove atomic batch rejection, hard-gate preservation, and idempotent retry.
- Tests prove pending judgement reports `awaiting_decisions`/`needs_decisions` and does not recommend more public sources.
- `pnpm applycue:uat -- --skip-tools` passes with 60 discovered jobs and five test-authority CV/application/browser packets.
- A normal default-profile refresh restored `awaiting_external` authority and reports 97 discovered, 72 source-quality kept, 60 ranked, zero fabricated decisions, and `NEEDS DECISIONS`.
- All 60 current queue rows have URL, JD excerpt, priority, and an existing full JD artifact.

## Follow-Up

The architecture is not the remaining blocker. The next product evidence should be:

1. a consented real-profile reviewed decision batch producing `recorded_external` artifacts;
2. representative live ATS preflight/fill/pause receipts;
3. clean-install, profile-isolation, connector-capability, and private security-reporting evidence from the roadmap;
4. V1 durable local state and optional scheduling only after the MVP operating proof is stable.
