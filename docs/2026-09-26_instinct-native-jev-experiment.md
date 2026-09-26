# ApplyCue: Instinct-Native Jev Experiment

**Status:** discovery/design request for Instinct — do not build a standalone SaaS yet  
**Date:** 2026-09-26

## Objective

Build the smallest possible system that improves an existing Instinct-driven job search using Jev as a bounded judgment engine.

The goal is **not** to recreate Career-Ops, ApplyCue's current large workflow, a new authentication system, a database, a dashboard, or another browser agent.

The working hypothesis is:

> Instinct already supplies the conversational agent, LLM, connectors, browser/job-search execution and user interaction. ApplyCue should add only a durable personal career brain + Jev judgments + minimal shared state.

## Existing user setup

The user already has:

- Instinct actively running the job search;
- Google Drive / Google Sheets accessible to the user's workflow;
- a Google Sheet called **Job Hunt HQ** containing job-search strategy, target companies, outreach, decisions and a link to the applications tracker;
- a detailed CV plus multiple CV variants already used by Instinct;
- historical applications and user corrections/preferences;
- an ApplyCue repository, but its Career-Ops-derived implementation is intentionally NOT the starting architecture for this experiment.

## Desired interaction

The user should be able to tell Instinct things naturally, including by voice:

- “Don't apply to programme-management-heavy jobs.”
- “US preferred, but take a genuinely strong India VP role.”
- “I don't care if Product isn't in the title if the scope is strategy + transformation.”
- “I would apply to this despite the domain gap.”
- “Never apply to X.”
- “This one is worth stretching for.”

The LLM should convert these into **proposed structured preferences/trade-offs**, not hidden code. Material durable changes should be visible/confirmable.

Jev then evaluates candidate jobs against:

1. verified candidate facts;
2. confirmed preferences;
3. confirmed trade-offs;
4. prior corrections/examples;
5. the complete JD.

Jev returns bounded judgments such as:

- decision: APPLY / INVESTIGATE / SKIP;
- career narrative fit;
- seniority/scope fit;
- domain-transfer fit;
- material requirement gap;
- credible stretch;
- missing information could change decision;
- worth application effort.

The LLM remains responsible for research, explanation, CV tailoring, messages and application answers.

## Smallest possible implementation

Preferred shape:

```text
User
  |
Instinct
  |
Google Sheet / Drive state
  |
tiny Jev evaluator
  |
writes judgment back
  |
Instinct reads judgment
  |
research / prepare / apply / record result
```

Do not add a separate UI unless Instinct genuinely needs one.

## Candidate Google Sheet contract

We can adapt the existing Job Hunt HQ rather than create a new product database.

Logical tables/tabs:

### Profile
`type | statement | strength | confirmed | source | updated_at`

Contains facts, preferences, trade-offs, exclusions and approved behavioral corrections.

### Jobs
`job_id | company | title | url | jd_or_jd_link | jev_decision | probability | ambiguity | status | note`

### Applications
`job_id | cv_used | approval | attempted_at | outcome | evidence`

### Feedback
`job_id | jev_decision | user_decision | reason | proposed_profile_change | accepted`

These may be separate tabs or mapped onto existing Job Hunt HQ structures if that is simpler for Instinct.

## Environment options to inspect

Before building anything, Instinct should determine which of these it can actually use **natively and reliably**:

### A. Google Sheet only
Can Instinct reliably read/write specific rows/tabs in the existing Sheet and use them as persistent operating state?

### B. Google Apps Script
Google Apps Script is Google's server-side JavaScript runtime. A standalone script can live as a Drive item; a Sheet-bound script can live behind the Sheet. It can call external HTTPS services, read/write Sheets and run on installable/time triggers.

Can Instinct:
- create or edit an Apps Script project?
- run/deploy/authorize it?
- inspect its execution logs?
- invoke a function directly?
- interact with a script bound to a Sheet?
- interact with a standalone Apps Script file in Drive?

### C. AppSheet
AppSheet can use a Google Sheet as data and its automation can call **standalone** Apps Script functions.

Does Instinct have usable AppSheet access/control? If yes, would it add anything useful here, or merely add complexity?

### D. Existing execution environment
Does Instinct expose any supported:
- code runner;
- shell;
- browser-side JS execution;
- MCP/tool runtime;
- webhook;
- HTTP action;
- scheduled task;
- API;
- agent skill/plugin mechanism?

If one exists, explain whether the Jev call can simply run there.

### E. No direct runtime
If Instinct cannot execute code but can read/write the Sheet, the evaluator can run independently on a Google Apps Script trigger. Instinct and Jev do not need a direct integration:

`Instinct writes row -> Apps Script/Jev evaluates -> Sheet updated -> Instinct reads result`.

## Questions for Instinct

Please inspect your actual currently available capabilities/connectors for this user and answer concretely:

1. Can you read and update **Job Hunt HQ** reliably?
2. Can you access the linked applications tracker?
3. Can you access the user's CV variants in Drive?
4. Can you create/edit/run Google Apps Script?
5. Can you create/use AppSheet?
6. What executable environment, if any, can you directly control?
7. Can you call an arbitrary external HTTPS API such as Jev from any existing tool?
8. Can you detect or react when a Sheet row changes, or would you need polling/a schedule?
9. Can a user instruction tell you to check the Jev-decision column before every application and reliably enforce that?
10. What is the **smallest implementation you can build and operate yourself** without a separate hosted application?
11. What pieces would still require one-time manual user setup/authorization?
12. What failure modes do you foresee?
13. Can you write your proposed architecture and implementation notes back into the ApplyCue experiment branch or into a Drive document for review?

## Jev secret

The user will provide a Jev/TypeSafe API key for the experiment.

Never put the key in:
- a Sheet cell;
- a Git repository;
- a Drive document;
- logs intended for sharing.

Prefer the execution environment's secret store. If using Apps Script, use script properties or the safest supported secret mechanism available in the chosen setup and do not echo the key.

## Experiment before product

Do not start by automating live submissions.

Phase 0:
- choose 10–20 historical jobs;
- run Jev blind against candidate state;
- compare with user's actual decision;
- report disagreements.

Phase 1:
- shadow new jobs;
- Instinct continues its current workflow;
- Jev independently judges;
- user reviews disagreements.

Phase 2 only if useful:
- Instinct uses Jev judgment as a routing input.

## Product direction if this works

The generalized product is not necessarily a conventional SaaS.

It may simply be:

**ApplyCue = a portable career-brain schema + Jev evaluator + agent instructions + Sheet template.**

A consumer could connect it to Instinct or another capable agent. A WhatsApp interface can be added later only if needed.

## Design rule

Every proposed component must answer:

> What breaks if we remove this?

If nothing important breaks, remove it.

The experiment wins if it becomes boringly small.
