# ApplyCue Documentation Map

Date: 2026-07-11

Status: canonical documentation index

This page tells readers which document owns each subject. It prevents plans, research notes, and historical career-ops comparisons from competing with the current ApplyCue product.

## How Authority Works

Use these rules when two files appear to disagree:

1. `AGENTS.md` and `skills/applycue/SKILL.md` control agent behaviour and the user-facing workflow.
2. `docs/PRODUCT_DECISION.md` controls product identity, settled decisions, and evidence claims.
3. `docs/ARCHITECTURE.md` controls technical design and ownership boundaries.
4. `docs/product-roadmap.md` controls version scope and exit criteria.
5. Implemented TypeScript contracts and tests prove current runtime behaviour. A target described in docs is not implemented merely because it is documented.
6. Focused contract, policy, launch, and runbook documents own only their named subjects.
7. Plans, dated evaluations, research notes, and compatibility pointers provide context only. They do not override current owners.

When code and a canonical document differ, record it as a current gap and fix the document or implementation deliberately. Do not silently choose whichever version is convenient.

## Canonical Operating Documents

| Subject | Owner | Status |
| --- | --- | --- |
| Agent bootloader | [`../AGENTS.md`](../AGENTS.md) | Current |
| User-facing ApplyCue workflow | [`../skills/applycue/SKILL.md`](../skills/applycue/SKILL.md) | Current canonical skill |
| Project-build and OpenOPC/GTM operation | [`../skills/applycue-project-build/SKILL.md`](../skills/applycue-project-build/SKILL.md) | Separate draft heavy workflow; not normal CV-to-offer operation |
| Product identity and settled decisions | [`PRODUCT_DECISION.md`](PRODUCT_DECISION.md) | Canonical current product decision |
| Technical architecture and OSS/provider ownership | [`ARCHITECTURE.md`](ARCHITECTURE.md) | Canonical technical design with current gaps labelled |
| MVP, V1, and V2 product versions | [`product-roadmap.md`](product-roadmap.md) | Canonical version plan and exit criteria |
| AI judgement now and later | [`ai-judgment-trial-plan.md`](ai-judgment-trial-plan.md) | Native-agent now; API/local trials deferred |
| Agent connectors and logged-in browser consent | [`connector-capability-policy.md`](connector-capability-policy.md) | Native harness discovery, OAuth, fallback, and MVP evidence gate |
| Code-change rules | [`agent-development-guide.md`](agent-development-guide.md) | Current |
| Release and success claims | [`launch-readiness.md`](launch-readiness.md) | Current gate |
| Real profile operation | [`live-usage-runbook.md`](live-usage-runbook.md) | Current runbook |
| Branch and architecture history | [`pivot-history.md`](pivot-history.md) | Current historical explanation |

## Focused Current References

| Subject | Document |
| --- | --- |
| Setup and distribution | [`SETUP.md`](SETUP.md), [`agent-first-installation-and-usage.md`](agent-first-installation-and-usage.md) |
| Agent-facing commands | [`SCRIPTS.md`](SCRIPTS.md) |
| Profile and product configuration | [`configuration.md`](configuration.md), [`CUSTOMIZATION.md`](CUSTOMIZATION.md), [`setup-questionnaire.md`](setup-questionnaire.md) |
| Typed data shapes | [`data-contracts.md`](data-contracts.md) |
| Real user file boundary | [`user-asset-storage.md`](user-asset-storage.md) |
| CV truth and rendering | [`cv-tailoring-policy.md`](cv-tailoring-policy.md), [`cv-engine-architecture.md`](cv-engine-architecture.md), [`base-cv-versioning.md`](base-cv-versioning.md) |
| Discovery adapters and tool choices | [`prebuilt-providers-and-libraries.md`](prebuilt-providers-and-libraries.md) |
| End-to-end behaviour reference | [`end-to-end-user-flow.md`](end-to-end-user-flow.md) |
| Supported surfaces | [`SUPPORTED_CLIS.md`](SUPPORTED_CLIS.md), [`SUPPORTED_JOB_BOARDS.md`](SUPPORTED_JOB_BOARDS.md) |
| Short answers | [`FAQ.md`](FAQ.md) |

## Repository And Support Documents

| Document | Status |
| --- | --- |
| [`../README.md`](../README.md) | Current product entrypoint |
| [`../SECURITY.md`](../SECURITY.md) | Current security scope; durable private contact is a launch gate |
| [`../LEGAL_DISCLAIMER.md`](../LEGAL_DISCLAIMER.md) | Current project disclaimer; not legal advice |
| [`../SUPPORT.md`](../SUPPORT.md) | Current support handoff |
| [`../DOCKER.md`](../DOCKER.md) | Records why Docker is absent; not required for MVP or V1 local operation |

## Plans, Research, And Historical Evidence

These files explain why choices were made or what may be built. They are not additional runtime owners.

| Type | Documents |
| --- | --- |
| Build history and backlog | [`build-roadmap.md`](build-roadmap.md), [`product-operating-plan.md`](product-operating-plan.md), [`local-usable-state.md`](local-usable-state.md). These retain implementation history and ideas but do not define current product or version scope. |
| Consolidated compatibility pointers | [`build-decision.md`](build-decision.md), [`product-shape.md`](product-shape.md). Old links remain valid; current decisions live in [`PRODUCT_DECISION.md`](PRODUCT_DECISION.md). |
| Product exploration | [`job-hunter-pain-points.md`](job-hunter-pain-points.md), [`progress-referrals-community.md`](progress-referrals-community.md) |
| Discovery and matching research | [`discovery-inspiration-and-build-decision.md`](discovery-inspiration-and-build-decision.md), [`discovery-matching-architecture-research.md`](discovery-matching-architecture-research.md), [`research-math-and-oss.md`](research-math-and-oss.md), [`research-notes.md`](research-notes.md) |
| Dated architecture evidence | [`2026-07-11_end-to-end-product-flow_architectural_review.md`](2026-07-11_end-to-end-product-flow_architectural_review.md), [`2026-07-10_product-version-roadmap_architectural_review.md`](2026-07-10_product-version-roadmap_architectural_review.md), [`2026-07-10_final-documentation-consistency_architectural_review.md`](2026-07-10_final-documentation-consistency_architectural_review.md), [`2026-07-10_independent-vs-career-ops_architectural_review.md`](2026-07-10_independent-vs-career-ops_architectural_review.md), [`2026-07-10_greenfield-product-outcome-architecture_recommendation.md`](2026-07-10_greenfield-product-outcome-architecture_recommendation.md), [`2026-07-10_career-ops-benchmark-extraction-model-product_architectural_review.md`](2026-07-10_career-ops-benchmark-extraction-model-product_architectural_review.md), [`2026-07-10_career-ops-discovery-delta_architectural_review.md`](2026-07-10_career-ops-discovery-delta_architectural_review.md) |

Research model names, prices, library maturity, and external platform behaviour can age quickly. Recheck their primary sources before implementation.

## Removed Fork Reference

The inherited career-ops modes, evaluators, scanner/tracker, providers, plugins, batch runner, Go dashboard, Docker/Nix files, examples, and old automation have been removed from this branch. Package scripts and the supported `applycue:* -> apps/worker -> packages/*` runtime have no fallback tree to call.

Use dated reviews and Git history for archaeology, comparison, and attribution. Any future capability must be implemented or adopted through current ApplyCue contracts; never restore the removed tree as a fallback.

## Consolidation Rule

Add a rule only to its owner document. Other files should link to the owner and explain only local context. In particular:

- do not duplicate workflow rules outside the canonical skill;
- do not duplicate product identity, settled decisions, or evidence claims outside `docs/PRODUCT_DECISION.md`;
- do not duplicate technical architecture or module ownership outside `docs/ARCHITECTURE.md`;
- do not redefine MVP, V1, or V2 outside `docs/product-roadmap.md`;
- do not restate the model trial matrix outside `docs/ai-judgment-trial-plan.md`;
- do not publish a second user-data contract outside `docs/data-contracts.md` and `docs/user-asset-storage.md`;
- keep dated reviews immutable in meaning, but label them as supporting evidence when later decisions supersede recommendations.
