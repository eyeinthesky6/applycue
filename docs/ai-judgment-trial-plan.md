# AI Judgment Trial Plan

## Current decision

MVP uses the model already present in Codex, Claude, or another user-chosen agent harness. ApplyCue does not require an AI API key or choose a model for the user.

## Why trials are deferred

Native agents already read files, browse, use connectors, write CVs, and operate the app. Embedding another model now would add keys, cost, privacy, routing, retries, observability, and a second judgment owner before the user flow is proven.

## Candidates worth testing later

| Candidate family | Best trial task | Expected upside |
| --- | --- | --- |
| Claude high-reasoning models | nuanced JD review, narrative/CV editing, long evidence synthesis | strong writing and careful context handling |
| OpenAI reasoning/Codex models | tool-driven review/application workflow and structured decisions | strong code/tool operation and reliable structured outputs |
| Gemini long-context models | large portfolio/public-profile synthesis and research-heavy company prep | long context and broad multimodal/research capability |
| capable local models via Ollama | private first-pass extraction/classification | lower marginal cost and local privacy, if quality holds |
| OpenRouter | transport for comparing several model families | easier controlled evaluation; it is not itself a judgment model |

Use the current strong native agent as the baseline, regardless of its exact model version. Model names change; pin the exact model/date only inside a trial report.

## When to run a trial

All conditions must be true:

1. A repeated task has a measured failure, latency, cost, privacy, or availability problem.
2. A representative, user-approved evaluation set exists.
3. Expected improvement is stated before testing.
4. Privacy and commercial terms are acceptable.
5. The trial can run behind the existing agent decision contract and roll back cleanly.

Do not trial during a live application session or because a new model launched.

## Evaluation sets

- 50–100 full JDs with human-approved `apply/watch/skip` and reasons;
- 20+ CV tailoring cases with approved fact/claim outcomes;
- 20+ form-answer cases including ambiguous and sensitive questions;
- tool-use scenarios for hydration, artifact selection, and receipt reconciliation.

## Measures

- false elimination rate (highest priority);
- shortlist precision and recall against user decisions;
- unsupported material claims;
- requirement/evidence coverage;
- user edits and time/effort;
- tool completion and recovery rate;
- latency and cost per reviewed/applied role.

## Expected pass conditions

- Judgment model: materially fewer false eliminations or user corrections than the native baseline, without more unsupported claims.
- CV model: lower user editing effort and equal/better evidence coverage, with zero invented material facts.
- Local model: acceptable extraction/triage recall at a clear cost/privacy benefit; final semantic decisions may still escalate.
- Routing layer: lower cost/latency while preserving output quality and one visible decision owner.

## Roles in a future hosted product

- inexpensive/local model: extraction, normalization suggestions, obvious objective categorization;
- strong reasoning model: full-JD fit, ambiguity, CV narrative, complex form answers;
- deterministic code: policy, exact identity, receipts, storage, and validation;
- user: access, material facts, scope changes, and final application/send authority.

No trial may reintroduce a hidden score gate or let two models independently control the same application.
