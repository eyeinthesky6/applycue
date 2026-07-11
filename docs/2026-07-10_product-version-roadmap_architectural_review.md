# Product Version Roadmap Architectural Review

Date: 2026-07-10

Status: completed historical review supporting `product-roadmap.md`. The career-ops quarantine discussed below was removed from the current branch on 2026-07-11.

## Scope

Review whether ApplyCue has a coherent current product, CLI/distribution decision, career-ops reuse boundary, version roadmap, and honest remaining-gap list.

## Evidence Checked

- `package.json`, `apps/worker`, `apps/web`, `packages/core`, and `packages/engine`;
- canonical skill, architecture, launch gate, setup, data contracts, and documentation map;
- historical build roadmap, operating plan, product shape, end-to-end flow, and pivot history;
- current quarantine and current worktree status;
- repository checks and UAT evidence from the current development run.

## Tool Baseline

The repo has pnpm aliases and a worker command router, not a published standalone CLI. `apps/web` is a placeholder. The supported runtime does not reference the career-ops quarantine.

## Agent-Led Review

The current architecture is suitable for an agent-operated local MVP: Codex/Claude owns conversation and judgement, while ApplyCue owns facts, discovery, gates, decisions, CV truth, routes, state, and receipts.

A standalone CLI improves distribution and automation but does not improve the product logic by itself. It should wrap the current worker/engine and arrive with structured output, exit codes, installation, versioning, and compatibility tests.

The review also traced the decision flow and found a contract mismatch: the engine writes `latest-job-decisions.json` as an object with a `decisions` array, but `recordJobDecision` expected a bare array. The fixture repeated the wrong shape. This was fixed before making roadmap claims, and the test now uses the generated artifact shape.

## Findings

1. **High: version ownership was fragmented.** `build-roadmap.md`, `product-operating-plan.md`, `product-shape.md`, `end-to-end-user-flow.md`, and `launch-readiness.md` used MVP, v0.1, V1, later, and SaaS with overlapping meanings.
2. **High: the real decision-recording command had a queue-shape defect hidden by its test fixture.** This could block the normal decision-controlled flow even while unit tests passed.
3. **Medium: “CLI” was described as active in architecture although the live interface is pnpm scripts plus a worker router.** A real installable CLI remains V1 work.
4. **Medium: current capability wording still included quarantined or absent behavior, including an optional Go dashboard and current PDF output claims.**
5. **Medium: career-ops extraction had no explicit stopping rule.** The new rule is gap-driven selective reference, never exhaustive porting or runtime fallback.
6. **Medium: the SaaS end state existed across several notes but lacked one acceptance boundary covering chat, uploads, social/profile links, auth, tenancy, workers, connectors, security, billing, and deletion.

## Recommended Fixes

- make `product-roadmap.md` the single version owner;
- define MVP/0.1 as Codex/Claude-operated local, V1 as installable local CLI, and V2 as hosted SaaS chat;
- map architecture phases and current gaps into those versions;
- update canonical docs to distinguish pnpm transport from future CLI;
- correct absent PDF/Go-dashboard claims;
- retain career-ops only as gap-driven reference material;
- keep release claims governed by `launch-readiness.md`.

## Verification

- test the canonical decision-queue artifact shape;
- run `pnpm applycue:check`;
- check current Markdown links and documented command names;
- verify canonical docs link to the version roadmap and historical plans defer to it;
- keep the current status truth explicit: UAT proof is not an agent-approved real run.

## Follow-Up

1. Complete the MVP operating proofs and security/clean-install gates.
2. Build the standalone CLI only as a thin V1 adapter.
3. Start SQLite, adapter hardening, import, and portal trials behind existing contracts.
4. Do not implement V2 hosted components until local early-user evidence justifies the operating cost and security surface.
