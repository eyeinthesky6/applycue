# ApplyCue Jev Reorientation Experiment

**Status:** experiment only — no production migration yet  
**Branch:** `jev-reorientation-experiment`  
**Decision date:** 2026-09-20

## Hypothesis

ApplyCue can become dramatically smaller if we stop encoding subjective career judgment as workflow logic.

The proposed split is:

- **Jev = judgment layer** — bounded, typed, probabilistic decisions.
- **Generative LLM = reasoning/research/writing agent** — understands CV/JD context, researches ambiguity, writes CVs/messages/answers.
- **Thin deterministic shell = invariants** — identity, exact files, dedupe, approvals, submission status, secrets, and audit.
- **Google Sheet initially = user-visible state/memory** — jobs, preferences, decisions, applications, feedback.
- **Browser/portal adapters = hands** — inspect and submit only when allowed.
- **WhatsApp can become the primary UX later** — CV upload, voice/text preferences, approvals, corrections, status.

This is deliberately not a rewrite of Career-Ops. The existing `main` branch remains the safety/reference implementation until the experiment proves the smaller model.

## Why this direction

Job search contains many fuzzy trade-offs: seniority vs scope, domain adjacency, career narrative, company quality, compensation likelihood, location, credibility of stretch, and whether a missing requirement is material. These are poor candidates for large rule trees.

Jev is designed for closed judgments over messy state. It returns typed `Choice`, ordered `Score`, and probabilistic yes/no (`Noul`) outputs. Multiple questions can be evaluated against the same state in one request. Jev does **not** generate prose, so the generative LLM remains responsible for research and writing.

The desired product is therefore not “automate a job board.” It is:

> **Learn how this person decides, make repeatable career judgments, escalate ambiguity, and let an agent execute the resulting intent.**

## What we should NOT port from the old architecture

Do not automatically recreate:

- semantic fit-score algorithms;
- keyword-based rejection/ranking;
- large deterministic preference trees;
- a second application state machine;
- a second tracker;
- a heavy evidence/receipt system for every semantic decision;
- portal-specific automation as the product core.

Keep old code available as a reference and mine only invariants that prove necessary.

## Minimal architecture

```text
User (WhatsApp / chat / tiny web UI)
              |
              v
     Generative LLM agent
  ingest / research / write
              |
              +---------------------+
              |                     |
              v                     v
       Candidate state          Job / full JD
              \                    /
               \                  /
                v                v
                     JEV
          typed career judgments
                       |
          +------------+------------+
          |            |            |
        APPLY       INVESTIGATE    SKIP
          |            |
          |       LLM researches
          |       missing context
          |            |
          +------> JEV re-evaluate
                       |
                 confidence gate
                       |
             human review if needed
                       |
                       v
              LLM prepares CV /
             application answers
                       |
                 named approval
                       |
                       v
               browser adapter
                       |
                       v
                 Google Sheet
```

## The “career brain”

The durable asset is a compact, editable set of user facts and judgment preferences, not hundreds of workflow rules.

Candidate state should contain:

1. **Facts** — employers, dates, roles, products, outcomes, education, location, compensation constraints, work authorization.
2. **Preferences** — desired roles, industries, geographies, company types, hard exclusions.
3. **Trade-offs** — e.g. exceptional scope may compensate for imperfect title; adjacent domain may be acceptable if narrative is credible.
4. **Behavioral corrections** — previous “Jev said apply, user said skip” examples and the user’s reason.
5. **Hard invariants** — never fabricate facts, never apply to blocked/current employer, never submit without the configured approval policy.

The LLM may turn free-form user input or voice-note transcripts into **proposed** preference changes. It must show material changes before they become durable career-brain rules.

## Jev question set — v0

Start deliberately small. Avoid a giant scoring ontology.

### Decision

`Choice`:
- `apply`
- `investigate`
- `skip`

Question: *Given the candidate facts, preferences, trade-offs and this complete JD, what should the candidate do next?*

### Supporting judgments

Use a few atomic questions in the same request:

- `career_narrative_fit` — Score 1–5
- `seniority_scope_fit` — Score 1–5
- `domain_transfer_fit` — Score 1–5
- `material_requirement_gap` — Noul
- `credible_stretch` — Noul
- `missing_information_could_change_decision` — Noul
- `worth_application_effort` — Noul

Do **not** mathematically combine these into another “fit score.” They are diagnostics and routing evidence.

### Autonomy

Initial experiment should not auto-submit anything.

Suggested routing to test, not yet product policy:

- strong `apply` + low ambiguity → prepare application;
- `investigate` or high missing-information probability → LLM researches, then Jev reruns;
- uncertain/borderline result → ask user;
- `skip` → record reason and move on.

Thresholds must be calibrated from real user decisions. Do not hard-code arbitrary production confidence thresholds during the experiment.

## What remains deterministic

Even in the smallest architecture, code should own:

- exact candidate identity and factual history;
- secrets/API keys;
- exact CV/document selected for upload;
- exact job URL / provider ID dedupe;
- current-employer and explicit blocked-company hard stops;
- named approval when approval is required;
- whether submission is confirmed / failed / unknown;
- never silently retry an unknown submission;
- audit timestamps and IDs;
- deterministic arithmetic/date parsing where needed.

Everything else should justify its existence.

## Google Sheet MVP

The existing user experiment already has a rich Google Sheet (“Job Hunt HQ”) containing strategy, targets, outreach and an applications-tracker link. This is sufficient as a **source dataset** for the experiment and evidence that a Sheet can be the first state surface.

For a generic ApplyCue MVP, use four logical tabs:

### Profile
`type | rule/fact | strength | source | confirmed | updated_at`

### Jobs
`job_id | company | title | url | jd | jev_decision | decision_probability | ambiguity | llm_note | status`

### Applications
`job_id | cv | approved_at | attempted_at | outcome | evidence`

### Feedback
`job_id | jev_decision | user_decision | reason | proposed_rule_change | accepted`

A real database is unnecessary until concurrency, scale, permissions, or product analytics require it.

## Learning loop

```text
Jev judgment
    |
user agrees/corrects
    |
LLM explains the disagreement in plain language
    |
proposes a concise preference/trade-off update
    |
user confirms material durable change
    |
career brain updated
    |
future Jev state includes it
```

This is preference learning through explicit state, not model fine-tuning.

Past applications can be imported as weak behavioral evidence. They should not be treated as perfect labels: a user may have applied because they were experimenting, desperate, using an old strategy, or because another agent made the decision.

## WhatsApp product direction

A WhatsApp-first product is plausible because the interaction is naturally conversational:

1. User sends CV.
2. LLM extracts candidate facts and proposes career profile.
3. User sends text/voice conditions: “No consulting firms”, “US preferred”, “I’ll take India if scope is VP-level”, etc.
4. LLM proposes normalized durable preferences.
5. Jobs arrive from connected sources / links / searches.
6. Jev evaluates each job.
7. LLM investigates ambiguous cases and prepares material for approved jobs.
8. WhatsApp shows only useful exceptions, approvals and results.
9. User corrections feed the career brain.

The web app can remain a small review/audit surface rather than the primary workflow.

## Instinct interoperability

Do **not** make an undocumented Instinct integration a dependency.

If Instinct exposes a supported API, webhook, MCP/tool interface, export, or other user-authorized integration later, ApplyCue could sit beside it as a judgment service:

`Instinct discovers/contextualizes → ApplyCue/Jev judges → Instinct executes`.

Until a supported interface is verified, use Instinct outputs only through user-controlled artifacts (for example the Sheet, CV files, application history, or exported data). Do not build brittle UI scraping merely to couple the products.

## Experiment 0 — prove Jev before rebuilding

**Goal:** determine whether Jev + compact career brain reproduces the user’s actual judgment well enough to replace most semantic Career-Ops logic.

### Dataset

Use 30–50 jobs already reviewed by the user. Prefer a mixture of:
- clear applies;
- clear skips;
- borderline roles;
- roles where title and actual scope differ;
- adjacent domains;
- roles with one significant missing requirement.

The current “Job Hunt HQ” and linked application tracker are promising starting sources.

### Blind evaluation

For each historical job:

1. Build candidate state without exposing the historical final decision to Jev.
2. Supply the full JD where available.
3. Run the v0 Jev questions.
4. Compare `apply / investigate / skip` with the user’s historical judgment.
5. Review disagreements manually.
6. Classify disagreement:
   - Jev error;
   - insufficient candidate state;
   - insufficient JD;
   - stale/changed user preference;
   - historical decision was itself questionable.
7. Add only genuinely reusable corrections to the career brain.
8. Rerun once.

### Success criteria

Do not use raw agreement alone. Proceed to a prototype if:

- clear apply/skip cases are consistently sensible;
- borderline cases are routed to investigate/review rather than confidently mishandled;
- corrections can be expressed as a small number of understandable preference/trade-off statements;
- adding those corrections improves later decisions without creating obvious regressions;
- the architecture remains small.

If success requires recreating a large rule engine, stop: the hypothesis failed.

## Experiment 1 — live shadow mode

For a small new-job batch:

- current job-search agent continues normal work;
- ApplyCue/Jev independently judges the same jobs;
- no Jev decision triggers a submission;
- compare shortlist quality, missed roles, false positives, time, and API cost;
- user reviews only disagreements.

This gives us real evidence before replacing the existing system.

## LLM role

Use the host LLM rather than embedding another mandatory generative model where possible.

The LLM should:

- ingest CV and free-form preferences;
- summarize candidate state for Jev;
- research ambiguous companies/JDs;
- turn Jev outputs into explanations;
- tailor truthful CVs;
- draft application answers/outreach;
- extract proposed learning from user corrections;
- operate browser/email/connectors where authorized.

Jev should not be forced to generate prose or do arithmetic.

## Product shape if experiments pass

**ApplyCue = portable career judgment + execution skill.**

Possible surfaces:
- agent skill/MCP first;
- WhatsApp-first consumer interface;
- tiny web dashboard for profile, queue, corrections and audit;
- optional adapters for LinkedIn/ATS/Naukri/etc.;
- optional integration with other personal agents.

This is intentionally compatible with multiple host LLMs. The durable user value is the career brain and decision history, not a dependency on one chat model.

## Build order

1. **Now:** document and benchmark only.
2. Add a minimal Jev client behind one provider-agnostic `CareerJudge` interface.
3. Add a local JSON/CSV adapter first; Google Sheets adapter second.
4. Build historical benchmark runner and disagreement report.
5. Run 30–50-job experiment.
6. If good, run live shadow mode.
7. Only then decide whether to create a tiny app / WhatsApp interface.
8. Only after that add submission adapters.

## Explicit non-goals for this branch

- no migration of current users;
- no deletion of current Career-Ops-derived implementation;
- no autonomous job submission;
- no production WhatsApp build;
- no second large workflow framework;
- no LangGraph unless a real orchestration need appears;
- no Supabase/database until the Sheet/local-state approach demonstrably breaks;
- no portal automation work before judgment quality is proven.

## Immediate next action

Add `TYPESAFE_API_KEY` locally (never commit it), implement one Jev evaluation script, and run the blind benchmark against a small sample from the existing job dataset.

The first deliverable is **a disagreement table**, not an application bot.
