# Career Ops Benchmark, Extraction, And Model Product Review

Date: 2026-07-10

Decision status: this is supporting research. The reviewed fork tree was removed from the current branch on 2026-07-11. The final current build direction is the external-agent hybrid in `docs/ARCHITECTURE.md`. The refreshed canonical model slate, tooling, privacy rules, and promotion gate are in `docs/ai-judgment-trial-plan.md`; they supersede model-version suggestions in this dated review where they differ.

## Scope

Answer three linked questions:

1. How to compare original Career Ops and independent ApplyCue fairly.
2. Whether the inherited Career Ops control plane and branding can be removed safely.
3. Whether a small fine-tuned model and first-party chat UI can replace manual agent-prompt operation.

This review complements `2026-07-10_independent-vs-career-ops_architectural_review.md`. It does not authorize a live-branch deletion, model API integration, API-key/config change, real-CV provider trial, or hosted-product cutover.

## Accepted Judgement Path

Decision recorded on 2026-07-10:

1. **Current launch path:** Codex, Claude, or another user-chosen coding agent performs candidate-side judgement through the canonical ApplyCue skill. It may use its native research, email, browser, social, and other connected tools under the existing permission rules. ApplyCue supplies the evidence, hard gates, truth checks, artifacts, routes, and audit trail.
2. **Later product path:** a hosted model API may perform the same bounded judgement for a first-party chat product. It must first beat or complement the native-agent baseline in an offline trial and remain optional, provider-neutral, evidence-bound, and able to abstain.
3. **Later research path:** train or fine-tune an open model only when there are enough consented candidate decisions, corrections, abstentions, and outcomes; a held-out benchmark; and approved time and compute budget.

The current product therefore uses AI without embedding a second AI runtime. Model APIs and training are not launch dependencies.

## Evidence Checked

- `career-ops-local/main` at `95a665a`, `independent/improve-role-fit-math` at `d6152e4`, and the current `applycue/career-ops-fork` at `2d27caf`.
- Root and workspace package scripts, package boundaries, runtime imports, docs, current web placeholder, license, and launch gate.
- Branch-native input and output contracts for original Career Ops and independent ApplyCue.
- Current hosted-model, domain-model, small-model, privacy, pricing, and tuning documentation from OpenAI, Google, Microsoft, Qwen, TechWolf, Hugging Face model cards, ConFit research, and the LoRA/QLoRA papers.

## Tool Baseline

- Current ApplyCue check: 19 test files and 239 tests passed.
- Current supported runtime: `applycue:* -> apps/worker -> packages/engine -> @applycue/*`.
- No import or child-process call from the supported runtime into root `modes/`, `providers/`, `scan.mjs`, `tracker.mjs`, the Go dashboard, or the standalone LLM evaluators was found.
- At pivot commit `b8d360b`, `apps/` and `packages/` matched the independent branch byte-for-byte.
- The current `apps/` and `packages/` surface differs from the preserved independent branch in 43 files.
- `apps/web` is a placeholder only; it has no product UI, API, authentication, storage, or orchestration.

## Head-To-Head Input And Output Contract

| Area | Original Career Ops | Independent ApplyCue |
| --- | --- | --- |
| Candidate input | Root `cv.md`, `config/profile.yml`, `modes/_profile.md`; optional proof/article and writing-style files | Profile-scoped `applycue.json`, base CV assets, structured proof bank, preferences, approved answers, and apply policy |
| Job input | Pasted URL/JD or URL queue in `data/pipeline.md`; scanner output | Normalized local JSON/JSONL jobs or approved source adapters producing `JobRecord` |
| Fuzzy judgment | Agent reads prompt modes and writes A-G evaluation/scoring | Independent engine applies typed gates/order; product docs reserve fuzzy fit for an agent, but no LLM provider is called by the engine |
| Main output | Markdown evaluation report, score/recommendation, tailored CV/PDF, tracker rows, interview material | Ranked jobs, CV variants, truth reconciliation, application drafts, browser plans/receipts, run manifest, dashboard, and chat summary |
| Repeatability | Depends on agent/model, prompt version, and browsing result | Mostly deterministic for the same inputs; browser/source availability can still vary |
| User-data boundary | User files are mixed into a repo-local working shape | Real user data is isolated under `~/.applycue/profiles/<profile>/` |

## Fair Comparison Design

Use one synthetic or explicitly consented canonical fixture and adapt it into each branch's native inputs. Do not compare the branches using different candidate facts or different job sets.

The fixture should include:

- one base CV and proof bank
- explicit preferences and hard blockers
- 30-50 fixed JDs covering clear matches, clear blocks, stretch roles, missing facts, and deceptive wording
- expected decisions and allowed evidence references, labeled before running either system

Run original Career Ops at least three times with the same frozen model, temperature, prompt commit, and browser snapshots because it is stochastic. Run independent ApplyCue from a clean isolated output root. Normalize both outputs into one comparison schema:

```text
decision: apply | review | skip
reason_codes: string[]
evidence_refs: string[]
missing_facts: string[]
generated_claims: string[]
artifacts: string[]
questions_asked: number
elapsed_ms: number
model_cost: number
```

Score truth failures, blocked-action failures, expected-decision agreement, correct abstention, user-question count, artifact completeness, reproducibility, latency, and cost. Use a blinded human review as the primary quality judge; an LLM judge may be a secondary diagnostic only.

## Agent-Led Review

### Safe extraction boundary

High-confidence legacy removal candidates after parity proof:

- root `modes/`, `providers/`, `plugins/`, `batch/`, and Go `dashboard/`
- root scanner, evaluator, tracker, PDF, updater, and batch scripts that are not called by `applycue:*`
- inherited multilingual prompt/docs and Career Ops marketing images
- legacy root commands and the unused `@google/generative-ai`, `dotenv`, and `js-yaml` dependencies

Items to retain or deliberately migrate:

- `apps/`, `packages/`, the canonical skill and thin bridges
- pnpm workspace, TypeScript, Vitest, and lockfile infrastructure
- Playwright installation/runtime used by browser UAT and controlled live apply
- current ApplyCue contracts, config examples, launch docs, live runbook, and profile-store rules
- MIT license notice and Career Ops attribution until a file-level provenance/legal review confirms that no distributed derived portion remains

The safer implementation is a clean independent-v2 branch and parity cutover, not a large deletion on the live UAT branch.

### Small model boundary

A small model is a good fit for bounded decisions:

- extract structured requirements from a JD
- map requirements to cited CV/proof evidence
- classify `apply`, `review`, or `skip`
- decide whether missing information requires a user question
- choose among already-approved tools/routes
- summarize why a decision was made

It should not own:

- whether a claim is true
- hard geography, authorization, fraud, compensation, or blocked-company policy
- credentials, OAuth tokens, or browser sessions
- final submit/send permission
- receipts, state transitions, or audit history

The model output should use an ApplyCue-owned schema and be rejected when evidence references are missing or invalid. Low-confidence, conflicting, or policy-sensitive cases should abstain into `review` rather than guess.

### Models considered and trial status

Model names and commercial terms can change. Recheck the current model card, price, privacy terms, and snapshot before any trial.

| Candidate | Decision | Worthy use and trial method |
| --- | --- | --- |
| Native Codex model available to the user | **Use now** | Operate through the canonical skill and existing Codex tools. This is part of the current baseline, not an embedded dependency. Record evidence, questions, overrides, latency, and outcome receipts. |
| Native Claude model available to the user | **Use now** | Same boundary as Codex. Use the user-chosen native coding-agent product and connectors; do not create separate Claude prompt rules or an Anthropic runtime inside ApplyCue. |
| [OpenAI GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini) | **First hosted trial later** | Low-cost structured judgement baseline. Run offline on the frozen fixture with a pinned snapshot, strict structured output, evidence validation, `store: false`, cost limits, and batch mode where appropriate. Do not integrate for launch. |
| [OpenAI GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4) | **Escalation trial later** | Use only for cases the cheaper model abstains on or fails validation. Measure whether the quality gain justifies the higher cost. |
| [Gemini 3.1 Flash-Lite paid](https://ai.google.dev/gemini-api/docs/pricing) | **Hosted cost challenger later** | Run the same fixture and schema as GPT-5.4 mini. Use the paid API treatment for real-data trials; do not send real CVs through a free consumer/free tier. |
| Current Claude hosted API model at trial time | **Optional hosted challenger** | Benchmark only after selecting and pinning the exact then-current model and reviewing its API privacy, retention, structured-output, and cost terms. Native Claude use does not automatically approve API integration. |
| [Qwen3-4B](https://huggingface.co/Qwen/Qwen3-4B) | **Open-model baseline later** | Apache-2.0, 4B parameters. Trial quantized inference first; use as a LoRA/QLoRA candidate only after the labelled-data gate. Not practical as a launch training project on the current laptop. |
| [Phi-4-mini-instruct](https://huggingface.co/microsoft/Phi-4-mini-instruct) | **Open-model baseline later** | MIT, 3.8B parameters, 128K context. Compare evidence citation, abstention, and ambiguity handling against Qwen; tune only after the data gate. |
| [Gemma 4 small variants](https://ai.google.dev/gemma/docs/core) | **Monitor and trial later** | New edge/browser-oriented 2B/4B-effective variants. Recheck the exact checkpoint and Gemma terms, then run the same quantized inference benchmark. Do not assume that edge deployment means sufficient judgement quality. |
| FunctionGemma 270M | **Router only** | Potential narrow trial for choosing among already-approved tools/routes. It is not a candidate-side CV/JD judge. |
| [TechWolf JobBERT-v2](https://huggingface.co/TechWolf/JobBERT-v2) | **Optional sidecar trial** | MIT job-title/skill similarity model. Trial only as cheap candidate retrieval or title-normalization evidence. Its short input and similarity objective cannot own ambiguity or final decisions. |
| [NBK ATS Semantic v1](https://huggingface.co/0xnbk/nbk-ats-semantic-v1-en) | **Optional sidecar trial** | Small resume/JD similarity signal. Test whether it improves queue retrieval without increasing false confidence. Never expose its similarity score as candidate worth or final judgement. |
| [IMCatalina v1](https://huggingface.co/rmtlabs/IMCatalina-v1.0) | **Parsing reference only** | Its stated scope is CV parsing and JD generation, not candidate scoring or decisions. Trial only if current import parsing fails and the model beats deterministic parsers. |
| [ConFit v3](https://arxiv.org/abs/2605.09760) | **Research reference/monitor** | Strong relevant person-job reranking research using Qwen3-8B/32B, but no deployable checkpoint and candidate-side benchmark was identified in this review. Revisit if weights, data terms, and reproducible evaluation become available. |
| [LlamaFactoryAI CV/JD LoRA](https://huggingface.co/LlamaFactoryAI/Llama-3.1-8B-Instruct-cv-job-description-matching) | **Reject for critical judgement** | The model card does not provide enough training-data and evaluation evidence for ApplyCue's truth-sensitive use. It may inform a throwaway comparison, not production or teacher labels. |

### Hosted API tooling required later

A model SDK alone is not the product. A later hosted trial or implementation needs:

- a provider-neutral adapter behind ApplyCue contracts;
- strict structured output and validation of every cited fact/proof reference;
- pinned model, instruction, schema, and evaluation versions;
- a cheap default model, explicit abstention, and a stronger escalation lane;
- synchronous single-role calls plus discounted asynchronous batch evaluation where useful;
- per-profile/request token and spend limits, timeouts, retries, and provider-disable rollback;
- CV-data minimization, user disclosure/consent, `store: false` or equivalent, and reviewed retention terms;
- receipts containing provider/model version, input artifact hashes, output, validation result, cost, and latency;
- native Codex/Claude or user review fallback when the provider is unavailable or the result is ambiguous.

### Fine-tuning feasibility and gate

Training a foundation model from scratch is not justified. Parameter-efficient tuning of an existing open model may be feasible later, but it is not current work.

The present laptop can run small quantized inference and train small encoder models slowly, but its integrated Intel GPU and lack of NVIDIA/CUDA make repeated 4B-8B QLoRA training an unreliable launch path. Free notebook services are useful for experiments, not dependable production training.

Do not start tuning merely because a few examples exist. First capture consented, preferably de-identified records containing the input artifact hashes, candidate-side decision, evidence references, abstention, user correction, and final approved action. Build held-out success, failure, and policy-boundary tests. Expect hundreds of diverse corrected decisions as a planning floor and require benchmark stability; the count alone is not approval.

If that gate is met, start with LoRA/QLoRA supervised fine-tuning of the best open-model baseline. Add preference tuning only if real pairwise corrections provide clear value. Fine-tuning can shorten or internalize repeated instructions, but it cannot remove the need for current CV/JD evidence, tool definitions, output schemas, changing policy, validation, and abstention.

### Common trial protocol

1. Freeze a synthetic or explicitly consented candidate fixture and 30-50 representative JDs.
2. Use native Codex/Claude decisions as the current operational baseline, with user corrections recorded separately rather than assumed correct.
3. Give every trial the same candidate evidence and require outputs compatible with existing `JobRequirementMatch`, `RankComponent`, `PendingQuestion`, reason, and decision concepts. Add only missing provenance fields; do not invent a parallel model-owned truth schema.
4. Measure unsupported claims, invalid evidence references, hard-gate conflicts, expected-decision agreement, correct abstention, useful-question rate, user overrides, reproducibility, latency, and cost.
5. Reject any model with truth or permission failures even if its average ranking score is high.
6. Promote a hosted adapter only after privacy/retention review and a measured advantage. Promote a tuned model only if it also beats the hosted baseline on the chosen quality/cost/privacy target.

### First-party chat product

The desired user experience is valid:

```text
upload CV
  -> confirm extracted facts and preferences
  -> connect approved sources/email/browser
  -> watch discovery and preparation events
  -> review only exceptions
  -> track replies, interviews, and offers
```

The hard work is not the chat box. ApplyCue must replace the capabilities currently supplied by Codex/Claude:

- model inference and tool orchestration
- authenticated API and background job workers
- per-user encrypted storage and token custody
- OAuth email/calendar connectors with minimal scopes
- controlled browser sessions for sites without safe APIs
- event streaming, retries, idempotency, receipts, and approval queues
- privacy, deletion/export, audit logs, abuse controls, and multi-tenant isolation

Use native OAuth/API connectors first. Do not ask users for email or job-portal passwords. Start email read-only and draft-only; keep send/submit behind explicit policy and current preflight evidence.

## Findings

1. A rigorous head-to-head is possible, but it needs a canonical fixture and normalized output schema. Raw file-count comparison is not enough.
2. Most Career Ops business/control components are not needed by the canonical ApplyCue runtime and are candidates for removal after parity proof.
3. The current ApplyCue engine is substantially the evolved independent engine, so independent-v2 is an extraction and packaging job, not a ground-up rewrite.
4. A small model can remove much of the repetitive agent judgment and user questioning, but only as an evidence-bound decision worker with an abstain path.
5. A first-party chat product can remove the Codex/Claude dependency for normal users. The main engineering risk is secure connectors and reliable action execution, not CV/JD model tuning.
6. Prompt files should disappear from the user experience, but prompts/contracts will remain as internal, versioned product logic.

## Recommended Fixes

1. Build the golden Career Ops vs independent comparator before deleting legacy code or tuning a model.
2. Create an independent-v2 extraction branch from the preserved independent line.
3. Port the 43 changed ApplyCue engine paths plus current-only ApplyCue files; rebuild the root package/config surface from ApplyCue needs.
4. Pass current checks, UAT, browser UAT, status, and golden parity before cutover.
5. Make native Codex/Claude judgement real by recording the agent/user decision, evidence references, actor, and provenance through the existing ApplyCue decision concepts.
6. Launch and collect consented corrections without adding a model SDK or API key to the canonical runtime.
7. After launch, run the small offline shadow slate in `docs/ai-judgment-trial-plan.md` against the same held-out benchmark; recheck and pin every model version at trial time.
8. Add a provider-neutral hosted adapter only if that trial proves a useful quality, cost, privacy, or distribution advantage and preserves native-agent/user fallback.
9. Fine-tune only when the data and budget gate is met and the benchmark shows a stable win over both native-agent and hosted baselines.

## Verification

Completed:

- Git lineage and runtime-owner checks
- current `pnpm applycue:check`: 19 files and 239 tests passed
- canonical runtime import search
- original-vs-independent native input/output trace
- current small-model, tuning, and structured-output research

Not completed:

- original Career Ops stochastic runs on a shared golden fixture
- file deletion or independent-v2 cutover
- hosted/open model trial, fine-tune, or production latency/cost/privacy benchmark
- hosted auth, connector, browser-worker, or data-security implementation

## Follow-Up

The next implementation remains the golden comparison harness plus the smallest external-agent decision-recording boundary using existing ApplyCue contracts. Native Codex/Claude judgement operates that path. Hosted APIs follow only after launch and an offline trial; fine-tuning follows only after the labelled-data and budget gate.
