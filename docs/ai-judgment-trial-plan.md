# ApplyCue AI Judgment Trial Plan

Date: 2026-07-10

Status: deferred, optional, and not authorized for production implementation

Research snapshot: 2026-07-10. Model availability changes quickly. Recheck official model pages and pin an exact model version before every trial.

## Decision

ApplyCue does not need an embedded AI provider now.

For the current product:

- Codex, Claude, or another user-chosen coding agent handles fuzzy job-fit judgement, conversation, research, and user-authorized tool use;
- ApplyCue handles facts, proof, hard gates, truthful CV generation, policy, state, routes, receipts, and outcomes;
- normal operation needs no model API key and no model SDK inside `apps/` or `packages/`;
- the typed external-decision boundary is implemented and records decision, evidence, actor, time, and backend provenance.

This is a sequencing decision, not a permanent ban. A hosted API model, local open-weight model, or other inference tool may be added later if a controlled trial proves a real gain in output quality, user effort, cost, latency, privacy, or distribution.

That later model would be an optional judgement worker behind ApplyCue's contracts. It would not become the product's truth, policy, or action owner.

## Why Native Agent First

The coding agent already supplies the expensive parts: reasoning over messy CV/JD language, asking follow-up questions, browsing or using connectors, and explaining a decision. Rebuilding those capabilities now would add keys, model churn, prompts, retries, privacy work, and another failure surface before ApplyCue has enough real labelled outcomes to choose a model intelligently.

Native-agent-first therefore gives the shortest build path without blocking a later API product.

## Current Code Reality

The supported path is:

```text
applycue:* -> apps/worker -> packages/engine -> @applycue/*
```

That path does not call a model provider.

The inherited OpenAI, Gemini, Ollama, and OpenRouter evaluators and their root Gemini SDK dependency were removed with the career-ops forked runtime on 2026-07-11. Dated reviews retain evidence that those approaches were considered; no callable evaluator or model default remains in this branch. Do not describe those historical files as an available fallback or wire a replacement into `apps/` or `packages/` without a new approved trial.

## Allowed Future Boundary

A future model may advise on:

- fuzzy role and domain fit after hard gates;
- mapping JD requirements to existing CV/proof references;
- whether missing evidence needs a question or an abstention;
- an `apply`, `review`, `watch`, or `skip` recommendation;
- a short, evidence-linked explanation;
- a suggestion among routes that ApplyCue has already declared valid.

A future model may not own or override:

- candidate facts or the proof bank;
- fraud, geography, work-authorization, blocked-company, compensation, or other hard gates;
- CV truth reconciliation;
- saved preferences or reusable answers;
- submit/send permission;
- credentials, browser sessions, receipts, state transitions, or audit history.

The JD and model response are both untrusted input. ApplyCue validates the response and independently enforces all truth, gate, and action rules.

## Contract Before Provider

Phase 1 of `docs/ARCHITECTURE.md` must land before an API trial.

`ProgressJobDecisionItem` records the backend suggestion. The separate `RecordedJobDecision` contract and `pnpm applycue:record-decision` capture final external-agent/user provenance, normal preparation consumes `apply` records, and current hard gates cannot be overridden. Remaining pre-trial contract work is limited to these trial-only fields:

- unknowns or requested questions;
- whether the actor abstained or required review;
- for model trials only, provider, exact model ID/version, prompt version, and input hash.

The input packet should reuse existing `JobRecord`, `UserProfile`, `ProofItem`, `GateResult`, and ranking-reason data. It must omit credentials and unrelated personal data. Do not create a second CV, profile, policy, or job schema for models.

## Tooling Worth Using Later

| Need | Recommended trial tool | Decision |
| --- | --- | --- |
| Deterministic contracts | Existing Vitest and frozen JSON fixtures | Use first. These remain the authority for gates, schema, evidence, and policy tests. |
| Multi-model comparison | [Promptfoo](https://github.com/promptfoo/promptfoo) | Worth a dev-only trial. It is a mature MIT-licensed CLI with provider comparison, assertions, caching, and red-team support. Pin the version, keep runs local, and treat config/hooks as trusted code. Do not add it to the product runtime. |
| Hosted model calls | Current first-party OpenAI, Anthropic, and Google API/SDK surfaces | Use direct provider APIs for the final comparison so provider, model, retention path, and errors are observable. Keep each adapter thin and behind one ApplyCue-owned judgement boundary. |
| Local single-machine inference | [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs) | Worth a privacy/local trial for compatible open-weight models. Use JSON Schema output and loopback-only defaults. |
| Local or hosted high-throughput inference | [vLLM structured outputs](https://docs.vllm.ai/en/stable/features/structured_outputs/) | Worth trialling only when batch volume or larger GPU infrastructure justifies a Python inference service. |
| Broad model scouting | [OpenRouter](https://openrouter.ai/docs/faq) | Optional reconnaissance only. Pin the model and provider and review privacy settings. Do not use changing free-model rotation for the final benchmark. |
| Schema validation | ApplyCue contract validation, with Ajv if adopted at external boundaries | Required. Provider structured output prevents malformed JSON but does not prove that evidence or decisions are correct. |
| Run evidence | ApplyCue-owned local trial receipts | Required. Record model/version, prompt version, input hash, output, latency, token usage, cost, retry/repair count, and validation result. |

Do not add LangChain, LlamaIndex, a general agent framework, a managed AI gateway, or a model router merely to make one judgement call. Direct trial adapters are easier to audit. Adopt an abstraction library only after more than one proven production provider makes it cheaper than maintaining the small boundary ourselves.

The API call itself may be a small adapter. A reliable feature is larger because it also needs consent, redaction, version pinning, timeouts, retries, schema and evidence validation, receipts, tests, and rollback.

## Models Considered

### Current baseline

| Model/surface | Why considered | Trial call |
| --- | --- | --- |
| Native Codex and Claude coding agents | They already operate the repo, read artifacts, use tools, and converse with the user without ApplyCue embedding another provider | **Use now and treat as the baseline.** Record the actual host/model when the host exposes it; do not assume a hidden model ID. |

### Hosted models worthy of a controlled trial

| Model | Why it belongs in the trial | Trial lane |
| --- | --- | --- |
| OpenAI `gpt-5.5` | OpenAI's current recommended flagship for complex reasoning/coding; supports structured outputs and tool-capable API workflows | **Full quality benchmark.** Use direct API access and an exact snapshot when available. |
| OpenAI `gpt-5.4-mini` | Current smaller OpenAI model aimed at high-volume, lower-cost work while retaining structured outputs | **Full efficiency benchmark** after the quality ceiling is known. |
| Claude Sonnet 5 (`claude-sonnet-5`) | Anthropic's current speed/intelligence balance with a pinned model ID and structured outputs | **Full balanced benchmark.** Likely the most practical Claude API candidate. |
| Claude Opus 4.8 (`claude-opus-4-8`) | Anthropic recommends it for complex agentic and enterprise work | **Quality ceiling on the hard-case set**; expand only if it materially beats Sonnet. |
| Claude Fable 5 (`claude-fable-5`) | Anthropic's highest-capability widely released model, aimed at long-running agents | **Small ceiling control only.** Its capability and cost profile exceed what a bounded job decision normally needs. |
| Gemini 3.5 Flash (`gemini-3.5-flash`) | Google's current stable, high-throughput model with structured output support | **Full balanced/efficiency benchmark.** |
| Gemini 3.1 Pro (`gemini-3.1-pro-preview`) | Google's current complex-reasoning Pro candidate | **Hard-case research benchmark only while preview.** Do not promote a preview endpoint to required production runtime. |

OpenAI GPT-5.6 was also seen in preview documentation but is not a normal trial candidate until it is broadly available and can be pinned. Claude Haiku 4.5 and Gemini 3.1 Flash-Lite are useful extraction/triage controls, not first-choice final fuzzy-judgement models.

### Open-weight and compact models considered

| Model | Why considered | Trial call |
| --- | --- | --- |
| [gpt-oss-20b](https://openai.com/index/introducing-gpt-oss/) | Apache-2.0 open weights, structured/tool-oriented output, and a footprint intended for roughly 16 GB memory | **Worthy local privacy challenger** when the trial machine can run it acceptably. |
| [gpt-oss-120b](https://developers.openai.com/api/docs/models/gpt-oss-120b) | Stronger Apache-2.0 open-weight option | **Infrastructure-only ceiling trial.** It targets an 80 GB GPU class and is not a normal end-user laptop default. |
| [Qwen3-4B](https://huggingface.co/Qwen/Qwen3-4B) | Apache-2.0, compact, multilingual, tool-oriented, and locally runnable | **Worthy narrow trial** for extraction, evidence mapping, abstention, and routing; not trusted as final fuzzy judge until it beats the baseline. |
| [Phi-4-mini-instruct](https://huggingface.co/microsoft/Phi-4-mini-instruct) | MIT, 3.8B parameters, 128K context, and function-calling format | **Worthy narrow trial** under the same limits as Qwen3-4B. |
| Gemma 4 small variants | Considered as compact local candidates | **Defer.** Recheck the exact checkpoint, maturity, and licence terms at trial time instead of treating a model family name as an approved dependency. |
| FunctionGemma 270M | Considered as a very small tool router | **Route-selection experiment only.** It is not a credible full CV/JD ambiguity judge without extraordinary evidence. |

Qwen3-4B, Phi-4-mini, Gemma, and FunctionGemma were considered mainly for a possible much-later compact or fine-tuned worker. Training a foundation model from scratch is rejected. LoRA/QLoRA tuning is also deferred until ApplyCue has enough consented, corrected, de-identified decisions to maintain a real held-out set.

### Considered but not promoted

Dated reviews of the removed OpenAI-compatible and Ollama evaluators mention DeepSeek, Llama, GLM, MiniMax, Groq, Together, Fireworks, LM Studio, Mistral, Qwen, Gemma, and other endpoints. These were provider examples and old defaults, not available ApplyCue integrations or evidence-backed selections.

Do not spend the first trial across a model zoo. The provisional slate recorded on 2026-07-10 was:

1. native Codex/Claude baseline;
2. one hosted quality candidate: GPT-5.5 or Claude Opus 4.8;
3. two balanced candidates: Claude Sonnet 5 and Gemini 3.5 Flash;
4. one smaller hosted candidate: GPT-5.4 mini;
5. one local candidate: gpt-oss-20b when hardware permits.

Compact 4B models enter only the narrow-task lane. Additional providers enter only if this first slate exposes a real gap.

This slate records what was considered; it is not a current availability claim. Before any trial, recheck official model names, access, pricing, privacy terms, and pinning support, then update this document if the viable slate has changed.

## When Each Trial Should Happen

Trials are triggered by product evidence, not by a target date. Do not run a trial merely because a new model is available.

### Timing gates

| Trial stage | Start only when | What happens | Expected outcome |
| --- | --- | --- | --- |
| Native-agent baseline | Now for normal operation; the recorded-decision path exists, so freeze the formal benchmark after MVP operating proof | Codex/Claude judges the frozen cases using ApplyCue evidence and the canonical skill | A trustworthy baseline of decisions, evidence references, questions, corrections, elapsed time, and user effort. This does not select an API model. |
| Offline hosted-model comparison | Phase 1 is working; at least 50 labelled synthetic/de-identified cases exist; a concrete problem is visible, such as native-agent distribution friction, judgement throughput, cost, or inconsistent output | Pinned hosted models receive the same frozen packets and write shadow-only structured decisions | Identify whether any hosted model matches or beats native-agent output and which quality/cost lane deserves further testing. Expected deliverable is a comparison report, not integration. |
| Offline local-model comparison | The same frozen benchmark exists and there is a real privacy, offline, data-residency, or recurring API-cost reason; suitable hardware is available | Ollama or vLLM runs a pinned open-weight model against the same packets | Determine whether local inference can provide acceptable quality and latency while keeping CV/JD data on controlled infrastructure. |
| Limited real-data shadow trial | Synthetic trials have zero critical truth/gate/action failures; the profile store and trial receipts are reliable; the user has approved the exact provider, data sent, retention path, credentials, and cost | A small consented sample is evaluated in parallel with native-agent judgement, but model output cannot change state or trigger preparation/action | Confirm that synthetic results survive real CV/JD language and measure actual latency, cost, evidence quality, abstention, and user corrections. |
| Advisory live trial | One model has passed both offline and limited real-data shadow gates; failure/timeout fallback is tested; normal CV and application workflow is already reliable | The model proposes a recorded decision; Codex/Claude or the user confirms it before downstream preparation | Reduce judgement effort without changing truth or action ownership. The expected win is fewer routine reviews while ambiguous cases still escalate safely. |
| Production-provider decision | Advisory evidence shows a material quality, user-effort, latency, cost, privacy, or distribution win with zero critical failures | Write and approve a separate architecture decision, then implement one optional provider adapter with a kill switch and native-agent fallback | A deliberately supported optional judgement path. Passing earlier trials alone does not authorize this step. |
| Fine-tuning trial | Hundreds of diverse consented corrections are available as a planning floor; held-out cases and a prompted open-model baseline exist; time, hardware/cloud budget, and maintenance ownership are approved | LoRA/QLoRA tunes the best open-model baseline on evidence-linked decisions and abstentions | A smaller model that beats its prompted version and remains competitive with the chosen hosted/native baseline on held-out data. A lower training loss alone is not success. |

The native-agent decision can now be recorded and controls normal preparation. Do not start a hosted or local trial until the remaining benchmark, labelled-case, privacy, and rollback gates above are also satisfied; a working contract alone is not a reason to add a provider.

### Which model does what

| Model or tool | Intended job in ApplyCue | Expected successful result | Not its job |
| --- | --- | --- | --- |
| Native Codex/Claude | Current ambiguity judgement, conversation, research, explanation, and user-authorized tool use | Strong handling of hard cases without spending agent effort on clear rows | Rechecking every clear system decision by default |
| GPT-5.5 and Claude Opus 4.8 | Quality-ceiling judges for ambiguous role fit, long evidence packets, conflicting signals, and hard explanations | Better blinded judgement/explanation on the hardest cases with zero truth/gate/action failures | Cheap first-pass work or automatic action execution |
| Claude Sonnet 5 and Gemini 3.5 Flash | Balanced full-judgement challengers for ordinary candidate queues | Near-ceiling quality with meaningfully better cost or latency | Overriding hard gates, proof, or permissions |
| GPT-5.4 mini | High-volume hosted first pass and possible normal-case judge | Lower cost/latency while easy cases remain accurate and uncertain cases escalate | Being trusted on ambiguous cases merely because its JSON is valid |
| Claude Haiku 4.5 and Gemini 3.1 Flash-Lite | Extraction, requirement mapping, obvious-case triage, and question drafting controls | Cheap structured work that reduces the number of expensive judgement calls without adding critical errors | Final authority for difficult fuzzy fit |
| Claude Fable 5 and Gemini 3.1 Pro Preview | Small hard-case ceiling/research controls | Show whether significantly more capability changes ApplyCue outcomes enough to justify cost or preview risk | Default production models |
| gpt-oss-20b | Local/private full-judgement challenger when hardware permits | Useful evidence-bound decisions at acceptable local latency with no CV/JD sent to a hosted model | Assumed laptop compatibility without measurement |
| gpt-oss-120b | Local/private quality ceiling on 80 GB-class infrastructure | Determine whether high-end local inference can approach hosted quality for privacy-sensitive deployments | Normal end-user laptop deployment |
| Qwen3-4B and Phi-4-mini | Compact extraction, evidence mapping, abstention, and route-suggestion workers; possible later tuning bases | Repeatable narrow outputs at low local cost, with difficult cases handed upward | Full candidate-side judge until a benchmark proves otherwise |
| FunctionGemma 270M | Select among already-approved tools or routes | Accurate narrow routing with strict structured output | Reading a full CV/JD and deciding fit |
| Promptfoo | Run, cache, compare, assert, and red-team the frozen model trial | Reproducible comparison artifacts across pinned providers/models | Product runtime or judgement authority |
| OpenRouter | Quickly scout additional models/providers using synthetic data | Find a candidate worth a direct-provider benchmark | Final benchmark authority, especially with rotating free models |

### Expected promotion outcomes

Each lane has a different reason to exist:

- a **quality model** must materially improve hard-case judgement or explanation;
- a **balanced model** must preserve quality while reducing cost or latency;
- a **small hosted model** must safely resolve easy cases and reduce calls to expensive models;
- a **local model** must provide a worthwhile privacy/offline benefit at acceptable quality and speed;
- a **fine-tuned compact model** must beat its prompted base model on held-out ApplyCue cases, not merely copy training examples;
- an **evaluation or routing tool** must make trials reproducible without becoming a second product engine.

Stop a lane when it has no concrete product advantage, repeatedly fails evidence validation, needs excessive repair/escalation, is unstable across repeated runs, or creates data-handling and operating cost worse than the native-agent baseline.

## Trial Protocol

### Stage 0: prerequisites

- implement the recorded external-agent decision boundary first;
- create a frozen set of at least 50 synthetic, de-identified, or explicitly consented jobs and candidate evidence packets;
- include clear matches, clear blocks, ambiguous fits, missing evidence, deceptive wording, and prompt-injection text inside JDs;
- label expected decisions, acceptable evidence references, and required abstentions before looking at model outputs;
- keep the labelled set outside the source repo when it contains real personal data.

### Stage 1: native baseline

Run the same frozen packets through the current native-agent workflow. Save the decision, evidence, user questions, elapsed time, and corrections. This is the baseline an API model must beat or complement.

### Stage 2: shadow comparison

- run each candidate with the same input packet and versioned instruction;
- use the provider's structured-output feature where available;
- pin an exact model version rather than a `latest` alias;
- run each case three times to measure instability;
- do not let trial output generate a CV, mutate profile state, route an application, or trigger a tool;
- review outputs blind to model name.

### Stage 3: scoring

Measure:

- hard-gate override attempts;
- unsupported candidate claims;
- invalid or unsupported evidence references;
- correct `review`/abstain decisions when information is missing;
- false-apply and false-skip errors;
- blinded human/agent preference for explanation quality;
- decision stability across repeated runs;
- questions required from the user;
- final schema failures and safe-repair rate;
- p50/p95 latency, token use, and cost.

An LLM judge may be a secondary diagnostic. It must not be the only grader of another model.

### Stage 4: promotion gate

No model advances unless:

- critical truth, hard-gate, and unauthorized-action failures are zero;
- every final accepted output passes ApplyCue schema and evidence validation;
- it matches or beats the native-agent baseline in blinded output review;
- it provides a material win in at least one of quality, user effort, latency, cost, privacy, or distribution;
- failure, timeout, and provider removal fall back cleanly to native-agent review;
- the user separately approves the provider, credentials, cost, and CV/JD data-sharing policy.

Passing the trial authorizes an architecture decision discussion, not automatic production integration.

### Stage 5: limited advisory mode

If separately approved, the first live use remains advisory. The model writes a candidate decision artifact; Codex/Claude or the user confirms it. ApplyCue still executes all gates and policy. Only after real advisory evidence should unattended decision recording be considered.

## Privacy and Security Rules

- Start with fake or de-identified CVs and JDs.
- Do not send a real CV to a provider without explicit user approval and a reviewed data-handling path.
- Use user-owned credentials in an approved secret mechanism; never commit or place keys in normal profile config.
- Do not edit `.env` as part of documentation or trial setup without permission.
- Pin provider, model, region/data controls, and logging settings in each trial receipt.
- Treat Promptfoo configs, custom hooks, graders, and downloaded model code as executable/trusted code; run only reviewed files with scoped credentials.
- Keep model output advisory and untrusted until ApplyCue validates it.

## Next Path Forward

1. Use the completed recorded-decision boundary to freeze the native Codex/Claude baseline after MVP operating proof.
2. Add transactional per-profile state, idempotency, and resumable attempts.
3. Harden discovery and source validation.
4. Prove CV truth/artifact quality and representative live-portal operation.
5. Build the frozen judgement benchmark using the same decision contract.
6. Continue native-agent operation while real corrections and outcomes accumulate.
7. Run the small shadow trial slate only when there is a concrete reason, budget, hardware, and user approval.
8. Add a provider adapter or fine-tuning project only after the trial clears the promotion gate.

## Primary Sources

- [OpenAI model selection](https://developers.openai.com/api/docs/models)
- [OpenAI GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
- [OpenAI gpt-oss release and hardware guidance](https://openai.com/index/introducing-gpt-oss/)
- [Anthropic current model overview and IDs](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Google Gemini current models and lifecycle](https://ai.google.dev/gemini-api/docs/models)
- [Google Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [Promptfoo repository and licence](https://github.com/promptfoo/promptfoo)
- [Promptfoo security/trust model](https://github.com/promptfoo/promptfoo/security)
- [OpenRouter data collection](https://openrouter.ai/docs/guides/privacy/data-collection)
- [Qwen3-4B model card](https://huggingface.co/Qwen/Qwen3-4B)
- [Phi-4-mini-instruct model card](https://huggingface.co/microsoft/Phi-4-mini-instruct)
