# ApplyCue Build Decision (Consolidated)

Date: 2026-07-08

Consolidated: 2026-07-11

Status: compatibility pointer. The accepted decisions formerly repeated here now live in [`PRODUCT_DECISION.md`](PRODUCT_DECISION.md).

The consolidation retained these decisions:

- ApplyCue is its own CV-to-offer product engine;
- native Codex/Claude operates MVP without an embedded model runtime;
- code handles truth, hard gates, clear matches, policy, state, routes, receipts, and outcomes;
- the agent handles ambiguity and authorized actions;
- permissive OSS and independently implemented lessons from historical evaluations enter only behind ApplyCue contracts after evidence and rollback checks;
- one truthful ATS CV path and a complete proof-bearing vertical slice take priority over cosmetic breadth.

Technical ownership is in [`ARCHITECTURE.md`](ARCHITECTURE.md), version scope is in [`product-roadmap.md`](product-roadmap.md), AI evaluations are in [`ai-judgment-trial-plan.md`](ai-judgment-trial-plan.md), and release evidence is in [`launch-readiness.md`](launch-readiness.md).
