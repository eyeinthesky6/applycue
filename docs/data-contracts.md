# ApplyCue Data Contracts

Date: 2026-07-05

Status: current contract reference. `packages/core/src/index.ts` is the implemented type authority.

The TypeScript source of truth starts in `packages/core/src/index.ts`.

## Profile

A profile contains:

- user identity and optional contact fields
- base CV text and structured CV representation
- preferences
- apply settings
- match settings
- proof bank

Normal preferences include target roles, adjacent roles, industries, excluded industries, locations, work modes, seniority, acceptable experience range, employment type, company stage, compensation, work authorization, notice period, travel, blocked companies, company seniority overrides, and keywords.

Proof bank items connect claims to evidence. CV tailoring must use proof, not invention.

## CV Variants

A CV variant stores:

- the job id
- the format mode
- the template id
- the source CV hash when available
- the target base CV id when used
- requirement matches
- unsupported requirements
- reconciliation status
- reconciliation notes
- proof-backed content changes

Each requirement match says whether the job requirement is supported, adjacent, unsupported, or needs confirmation.

Direct `supported` requirements can shape generated CV content. Required `needs_confirmation` or adjacent-only requirements must pause before application output proceeds. `unsupported` requirements must not be claimed.

Reconciliation reports include coverage counts for required requirements: total, supported, needs confirmation, adjacent, and unsupported. Agents should use this to inspect false positives and false negatives before changing proof terms.

The CV generator may change wording and emphasis. It may not create a claim that lacks a proof item or user-confirmed source fact.

V1 uses one standard ATS format. The user's uploaded CV is a fact source, not a layout source.

## Job Record

A job record contains:

- source and URL
- company
- role title
- location
- work mode
- seniority
- description
- compensation if available
- posted date when the source exposes it
- discovered date
- liveness state

Freshness is a top-level search setting, not a hidden score. V1 defaults to a 30-day freshness window. Known posts older than the active window stay out of the first-run shortlist and CV queue. Job-board providers that accept a lookback option should fetch at least the active freshness window before ApplyCue filters locally; otherwise the system can falsely look low-volume because it never fetched eligible posts. Unknown post dates are not treated as old, because many company and ATS pages do not expose a publish date; they remain eligible but sort behind known fresh posts. If the user asks for more results, the agent may widen recency and should say that older historical postings are being included.

## Scan History

Scan history is local operational state, not source code.

It lives under:

```text
~/.applycue/profiles/<profile>/data/local/scan-history.jsonl
```

Each entry records:

- job id and URL
- company and role title
- source id, source name, and source kind
- status: `seen`, `prepared`, or `closed`
- first and last seen timestamps
- optional application and CV variant ids

Daily and push runs may skip non-manual jobs already marked `prepared` or `closed`. They also skip non-manual same-company/similar-role jobs when a previous automated run already prepared that role, even if the new posting has a different URL. Review mode keeps them visible so the user and agent can inspect repeated roles during UAT or manual checks.

Current-run shortlist dedupe removes exact URL repeats and same-company/similar-role repeats before ranking, CV generation, and application planning. Manual imports stay visible because a pasted job is deliberate user or agent input. Dedupe must not collapse different companies just because their titles are similar.

The run manifest and dashboard expose `dedupe` counts so the user can see how much noise was avoided without reviewing duplicate jobs. The dashboard also exposes `safety` counts for fraud-signal, blocked-portal, and portal-policy blocks. These are operational protection metrics, not fit scores.

Scan history also emits repost signals. A repost signal means the same company has shown a similar role title on multiple URLs within the configured window. It is a warning for source quality and stale-opening analysis, not an automatic skip.

## Hard Gates And Backend Ordering

Backend ordering stores:

- hard gate results
- internal ordering signals
- reasons
- final priority

The user sees reasons and decisions. The backend may keep ordering signals for audit and diagnostics, but they are not the product and are not a prediction of success.

Hard gates block clear top-level conflicts: blocked companies, current company, no-go terms, excluded industries/keywords, impossible work mode, clearly out-of-range geography, clearly out-of-range required experience, employment type, company stage, work authorization, fraud signals, and submit-policy violations. Role family and industry can be hard gates when the evidence is clear enough to explain in plain language. Seniority/title level is advisory by default because grades vary by company, industry, and negotiation; it becomes a hard gate only when `matchSettings.seniorityGateMode` is set to `hard`.

Freshness is a clean first-run filter only when the post date is known. It should not silently remove unknown-date company or ATS roles. It should also not override stronger hard blockers; old, blocked, or duplicate jobs should not get CVs just because the user asks for more volume.

Ambiguous fit should produce a review or tuning signal, not a silent hard block. Examples include company-title equivalence, startup VP vs enterprise manager, product roles with domain-specific meanings, and vague JDs that do not reveal salary, scope, reporting line, or decision rights.

`JobRecord` may carry `seniorityEvidence`, `companyMarketGrade`, and `requiredExperienceYears`. The normalizer can infer simple seniority and experience evidence from titles/JDs, and can attach a small reusable company-grade signal from known company/domain markers. Experience ranges are stronger filters than title seniority. User-approved exceptions belong in `preferences.companySeniorityOverrides`, not in ranker code.

## Funnel Health

Each run manifest and progress snapshot may include `funnelHealth`.

It summarizes:

- configured daily target
- prepared applications
- discovered jobs
- jobs kept for shortlist preparation
- recorded and awaiting external-agent/user decisions
- jobs filtered by freshness
- watched or skipped jobs
- dominant source filters
- short examples for dominant source filters
- dominant preference gate blockers
- suggested next actions

This is not a user-worth score. It tells the agent why the pipeline is too narrow, too broad, awaiting judgement, or healthy. `awaiting_decisions` means usable ranked supply already exists and must not trigger source expansion. Genuine low volume may trigger a source proposal or explicit user question. High/noisy volume should trigger tighter source and title filters. Do not hide uncertain matches just to make the dashboard look precise.

## Job Decision Queue

Every batch writes the full ranked decision queue for agent review:

```text
~/.applycue/profiles/<profile>/outputs/runs/latest-job-decisions.json
```

The artifact contains the run id, profile id, queue count, and every ranked decision item. Each generated item includes the job/source URL, bounded description excerpt, full normalized JD path, location/work mode/seniority/employment/compensation when available, post/discovery dates, live state, backend priority/components, reasons, and failed hard gates. Hard-gated, watch, and clear-apply rows remain in the audit queue but are not counted as awaiting fuzzy judgement. The agent judges unresolved `review` rows and may audit a clear decision when its evidence looks wrong. The dashboard and chat summary may show only a compact preview.

The full normalized JD is generated for every ranked job under `outputs/jds/`, not only for jobs already approved for CV preparation. This lets the external agent make the decision before application artifacts exist.

## Application Record

Application state tracks:

- job id
- selected CV variant
- draft answers
- selected apply route
- route execution artifact
- status
- mode
- exception reasons
- daily application batch
- outcome
- timestamps

## Master Form Data

Master form data is the reusable application-form snapshot for the active user.

It is generated from application drafts and approved reusable application answers. Drafts come from the profile, approved application answers, apply policy, and generated CV/application artifacts. It is not a second profile store and not a place for agents to invent facts.

It lives under:

```text
~/.applycue/profiles/<profile>/data/local/master-form-data.json
~/.applycue/profiles/<profile>/outputs/form-data/master-form-data.md
```

The Markdown preview is what the agent shows in chat before portal application work. The JSON is the local confirmation state used by the route dispatcher.

Agents refresh it with:

```powershell
pnpm applycue:form-data
```

After showing the values to the user and receiving approval, agents confirm it with:

```powershell
pnpm applycue:form-data -- --confirm
```

Browser/portal application routes must not proceed to live preflight and fill until the master form data is confirmed for the current field hash. If the generated values change, confirmation is required again.

When a live form asks a new reusable question, the agent should ask the user once, save the approved answer through `approve-answers`, regenerate the batch or form data, and confirm the new master preview. Approved answers carry aliases, and common canonical fields such as notice period, expected salary, work authorization, visa sponsorship, relocation, current title, current company, and years of experience get default aliases so differently worded portal questions can reuse the same value.

Email and DM sending are not app features. ApplyCue may create draft text and attachment lists, but sending happens through native Codex, Claude, Hermes, or similar connected email/social tools when available. Browser control is a fallback only when connector access is unavailable and the user approves that session. Final send always needs explicit user confirmation.

Email discovery is an import feature. The agent connector searches and reads likely job emails, then writes a bounded connector-export JSON/JSONL file. `pnpm applycue:import-email-leads -- --input <file>` validates and imports only rows with company, role title, and job/apply URL. Missing, duplicate, or configured fraud-signal rows are skipped before the normal batch.

## Apply Route

An apply route tells the agent how to execute a prepared application. It is an execution plan, not a new fit score.

V1 route types:

- `api`: use only when ApplyCue has an explicit safe endpoint or adapter for that portal.
- `browser`: open the application page, run live preflight, fill fields, upload the generated CV, and pause or submit under policy.
- `email`: draft an application email with the generated CV attached; actual sending is agent-managed through a native agent email connector when available, or browser control only with user permission.
- `dm`: draft a recruiter/referral message; actual sending is agent-managed through a native agent social/email connector when available, or browser control only with user permission.
- `manual_review`: pause for the user or agent when the route is unclear, risky, unsupported, or needs missing answers.

The route planner should prefer official/API routes when they are known and safe. Browser is the normal fallback for job boards, ATS pages, company pages, and logged-in portals. Email and DM routes create drafts first. Manual review is used for suspicious portals, blocked portals, sensitive questions, unclear pages, unsupported CV claims, or platform rules.

Every prepared application should have an apply route artifact under:

```text
~/.applycue/profiles/<profile>/outputs/apply-routes/
```

Agents should execute the route artifact instead of improvising. The route-aware dispatcher is:

```powershell
pnpm applycue:apply-route -- --route-id <route-id>
```

If the route is browser, the dispatcher first checks confirmed master form data, then writes a handoff report and agents must use the browser plan plus live preflight gates. If the route is email or DM, the dispatcher writes the generated draft text and attach/link list from the active user store, but it never sends. If the route is API but no safe local adapter executor exists, the dispatcher pauses and suggests the browser fallback. If the route is manual review, it writes the blocker/questions. Source code must never be changed to apply to one job.

## Outcome Events

Outcome events are local operational state, not source code.

They live under:

```text
~/.applycue/profiles/<profile>/data/local/outcomes.jsonl
```

Each event records:

- application id
- type: `submitted`, `confirmation`, `reply`, `interview`, `offer`, `rejection`, `withdrawn`, or `user_feedback`
- note
- occurred timestamp

Agents should record events through the product command:

```powershell
pnpm applycue:record-outcome -- --application <application-id> --type reply --note "Recruiter replied"
```

Do not store outcome events in the source repo. Do not edit source code to record one user's reply, rejection, interview, or offer.

## Recorded Job Decisions

External-agent and user job decisions are local operational receipts. They live under:

```text
~/.applycue/profiles/<profile>/data/local/job-decisions.jsonl
```

Each record contains the job id, final `apply|review|watch|skip` decision, reasons, evidence references, actor kind/name, timestamp, backend suggestion, and the backend failed-gate list. The latest generated ranked queue is always included as evidence. An `apply` record is rejected when that queue reports a failed hard gate.

Agents record decisions through:

```powershell
pnpm applycue:record-decision -- --job <job-id> --decision apply --actor codex --reason "Supported by the candidate's approved evidence." --evidence <review-reference>
```

For a reviewed batch, agents should use:

```powershell
pnpm applycue:record-decisions -- --input <reviewed-decisions.json> --prepare
```

The input has one batch actor and a non-empty `decisions` array containing `jobId`, `decision`, `reasons`, and optional `evidenceRefs`, `decidedAt`, and `id`. The whole batch is validated before one append: duplicate job IDs or any `apply` that violates a current hard gate reject the entire write. An unchanged retry is skipped. `--prepare` then refreshes the normal run and generates approved CV/application artifacts, but does not submit, send, confirm user data, or widen scope.

This contract records who decided what and why. Normal batch selection consumes the latest record per job and prepares the best `apply` decisions up to `applicationsPerDay`; current hard gates are recalculated and remain authoritative. Progress items retain both the backend suggestion and the recorded external decision so dashboards never present an overridden backend `watch`/`skip` as the final result.

Run manifests expose `decisionAuthority`: `system_clear` means all prepared jobs were clear rule-based matches; `hybrid_system_external` combines clear matches with recorded ambiguity decisions; `recorded_external` means all prepared jobs came from recorded decisions; `awaiting_external` means unresolved ambiguity still blocks a useful shortlist; `backend_suggestion_test` is reserved for UAT/development mechanics.

## Tuning Signals

Tuning signals are local learning records, not active config by themselves.

They live under:

```text
~/.applycue/profiles/<profile>/data/local/tuning-signals.jsonl
```

Each signal records:

- origin: `user_feedback`, `agent_analysis`, `outcome_learning`, or `system_diagnostic`
- target: role term, title variant, industry, location, source, seniority, company, keyword, work mode, CV fact, or apply policy
- action: `promote`, `demote`, `block`, `watch`, `ask_user`, or `keep`
- value and reason
- status: `proposed`, `approved`, `rejected`, `applied`, or `archived`
- optional confidence and evidence references

Agents should record tuning signals through the product command:

```powershell
pnpm applycue:record-tuning -- --origin agent_analysis --target title_variant --action promote --value "group product manager" --reason "Large-company senior product roles often use this title."
```

Direct user feedback can be saved as approved:

```powershell
pnpm applycue:record-tuning -- --origin user_feedback --target role_term --action block --value "product marketing" --reason "User said this is not a target role." --approved-by-user
```

Tuning signals do not rewrite `applycue.json` automatically. Apply approved signals through the product command, normally dry-run first:

```powershell
pnpm applycue:apply-tuning -- --dry-run --ids <signal-id>
pnpm applycue:apply-tuning -- --ids <signal-id>
```

Use `--all` only when the agent has explained the bulk change. The first apply path maps safe approved signals into existing config lists: role/title terms, industries, locations, keyword lists, and trusted/ask-before/blocked portals. Unsupported or ambiguous targets, such as seniority equivalence or CV facts, stay skipped for agent judgment. Source code must never be changed for one user's tuning.

## Source Learning

Source learning summarizes which discovery sources are producing useful outcomes.

The run manifest and dashboard may include:

- applications with source context
- prepared applications by source
- submitted, replies, interviews, offers, and rejections by source
- positive outcomes: replies, interviews, or offers
- top sources by outcome signal

This is not a user-facing score. It is an operations signal for prioritizing sources, widening or tightening searches, and learning which channels are worth more effort.
