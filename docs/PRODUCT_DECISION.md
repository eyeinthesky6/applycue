# ApplyCue Core Product Decision

Date: 2026-07-11

Status: canonical. This document owns ApplyCue's product identity, operating model, durable product decisions, and evidence boundary. `ARCHITECTURE.md` owns technical design, `product-roadmap.md` owns version scope, and `launch-readiness.md` owns release claims.

## One-Line Decision

Build ApplyCue as its own chat-first, CV-to-offer product engine, operated by Codex, Claude, or another user-chosen agent today; let the engine resolve clear cases, use the agent only for ambiguity and authorized action, adopt permissive OSS behind ApplyCue contracts, and keep the removed career-ops runtime out of this branch.

## Product Promise

The user supplies a CV, goals, preferences, and permissions through chat. ApplyCue and the user's agent then:

1. build a reusable, proof-backed candidate profile;
2. discover and normalize fresh roles from approved sources;
3. reject clear no-go roles and shortlist clear matches automatically;
4. escalate only ambiguous fit or missing material facts;
5. generate truthful role-specific CV and application artifacts;
6. execute approved routes while pausing before sensitive or policy-controlled actions;
7. retain receipts and outcomes so future work improves.

The product should feel like a capable operator that brings the user a small, reasoned action queue. It should not feel like a score dashboard that makes the user or agent manually re-rank every job.

## Durable Decisions

| Area | Current decision |
| --- | --- |
| Product category | CV-to-offer agent, not a generic job board, search engine, ATS score, or autonomous mass-application bot. |
| Primary interface | Chat through Codex/Claude or another chosen agent. Commands are implementation transport for agents, not the normal user interface. |
| Current runtime | ApplyCue-owned TypeScript modular monolith and profile-local artifacts. No career-ops fallback and no second workflow engine. |
| Job decisions | Deterministic code owns hard gates, clear low-fit rows, and clear threshold-passing matches. Codex/Claude or the user owns unresolved `review` cases and may correct a clear decision with a recorded reason. |
| AI runtime | Native coding-agent intelligence is sufficient for MVP. ApplyCue does not require an embedded model SDK or API key now. Hosted or local models are optional later trials, not assumed dependencies. |
| Candidate truth | Approved profile facts, base CVs, proof items, reusable answers, and user corrections are authoritative. Generated text must reconcile to them. |
| Action authority | ApplyCue plans and prepares routes. Current preflight, user policy, and explicit confirmation govern submission, sending, logged-in access, and sensitive answers. |
| User data | Real candidate data and outputs live under the profile store, never in source code. One profile has one canonical state boundary. |
| Discovery | Replaceable adapters produce normalized `JobRecord` evidence. Coverage count alone does not justify a provider; quality, reliability, licence, and outcome evidence do. |
| OSS | Prefer mature permissive components for commodity plumbing when a bounded trial proves an advantage and rollback is cheap. ApplyCue retains product contracts and sources of truth. |
| Career-ops | Forked runtime code is removed from this branch. Historical evaluations may inform a fresh ApplyCue-owned implementation, but code must come from an approved permissive source or be built behind ApplyCue contracts with tests and rollback. Never restore the old control plane. |
| CV output | One strong ATS-safe renderer and truth-reconciled role variants. Multiple cosmetic templates are not an MVP priority. |
| Dashboard | Read-only evidence and progress surface. Chat remains the control surface until a separate product decision changes that. |
| Distribution | Repository skill plus pnpm-backed commands for MVP; thin standalone CLI in V1; optional MCP only after CLI stability; hosted SaaS in V2 after local evidence. |
| Scale | Local files/JSONL are acceptable for MVP. Transactional local storage precedes multi-tenant databases, durable hosted workers, or managed browser fleets. |

## Decision Boundary In Plain Language

```text
many discovered jobs
  -> source quality, freshness, dedupe, and hard gates
  -> clear apply/watch/skip decisions in code
  -> Codex/Claude sees only unresolved ambiguity or suspicious decisions
  -> final shortlist capped by user policy
  -> truthful CV and application route
  -> user-authorized execution
  -> receipt and outcome
```

`review` application mode means pause before application action. It does not mean the agent must reconsider every clear system classification.

## Default User View

For each role the user should see only what supports action:

```text
Decision: Apply / Review / Watch / Skip
Why: a few evidence-based reasons
CV action: Ready / Needs proof / Not worth tailoring
Risk or blocker: only material issues
Next step: Prepare / Ask / Hold / Ignore
```

Backend component scores remain audit and routing evidence. They are not a hiring probability, a claim about personal worth, or the core user experience.

## Now And Later

| Horizon | Product shape |
| --- | --- |
| MVP / 0.1 | User chats with Codex/Claude; the agent operates the local ApplyCue engine and native connectors/tools. |
| V1 | Installable local product with a thin stable CLI, structured output, transactional state, broader verified adapters, and stronger recovery. |
| V2 | Hosted ApplyCue chat and workers using the same truth, decision, policy, route, receipt, and outcome contracts. |

Exact scope and exit criteria belong only in `product-roadmap.md`. Model candidates, tooling, trial conditions, and promotion gates belong only in `ai-judgment-trial-plan.md`.

## Non-Negotiables

- Never invent candidate experience, qualifications, compensation, authorization, or application answers.
- Never silently widen role, geography, source, recency, or action scope.
- Never treat a ranking score as hiring probability or user worth.
- Never bypass current hard gates, truth reconciliation, preflight, or action policy.
- Never make source-code edits part of a normal candidate workflow.
- Never create a second profile, CV, decision, application, or receipt source of truth.
- Never add OSS, providers, AI models, databases, or infrastructure merely for feature count.
- Preserve uncertainty and ask only when the answer can materially change the outcome.

## Evidence And Success Claims

Generated CVs, routes, dashboards, and UAT receipts prove workflow mechanics. They do not prove that a job is live, an application was submitted, or the user will receive an interview or offer.

ApplyCue may claim only what current evidence supports:

- **mechanics:** tests and UAT prove contracts and artifact generation;
- **operating readiness:** a real profile run proves a current shortlist, CVs, routes, and required pauses;
- **application completion:** a portal or connector receipt proves a specific action;
- **product outcomes:** replies, interviews, and offers require real cohort evidence with sample sizes and uncertainty.

The release checklist and permitted claim language belong only in `launch-readiness.md`.

## Documentation Authority

| Question | Canonical owner |
| --- | --- |
| What product are we building and what decisions are settled? | `PRODUCT_DECISION.md` |
| How is it technically divided and what owns each behavior? | `ARCHITECTURE.md` |
| What belongs in MVP, V1, and V2? | `product-roadmap.md` |
| How does the agent operate it? | `skills/applycue/SKILL.md` |
| Which AI models/tools were evaluated and when may trials run? | `ai-judgment-trial-plan.md` |
| What must pass before a release or success claim? | `launch-readiness.md` |
| Why did the architecture change? | `pivot-history.md` and dated evaluation records |

Historical plans and evaluations retain evidence and rejected alternatives. They cannot redefine current product scope merely because they contain older `MVP`, `V1`, architecture, or decision headings.

## Change Rule

A core product decision changes only when a named user or product gap, current evidence, expected outcome, owner, acceptance test, licence/privacy impact, and rollback have been recorded. Update this document first, then synchronize architecture, roadmap, workflow, and focused contracts without copying the same rule into each file.
