# Final ApplyCue Documentation Consistency Architectural Review

Date: 2026-07-10

Status: historical completed audit. Its recommended separation first moved inherited career-ops and Docker surfaces under `legacy/career-ops/`; that quarantine was removed from the branch on 2026-07-11. Current ownership is in `docs/README.md` and `docs/ARCHITECTURE.md`.

## Scope

Review all ApplyCue documentation and instruction surfaces for:

- conflicting architecture or runtime owners;
- duplicated product rules;
- current behaviour presented as future, or future intent presented as implemented;
- stale commands and option names;
- conflicting user-data paths;
- legacy career-ops material presented as canonical ApplyCue;
- broken local links;
- launch, security, legal, Docker, and model-runtime claim drift;
- full CLI skill copies that bypass the canonical-skill policy.

The reviewed tree contains 165 Markdown files, including 38 files under `docs/`. Many of the remaining files belong to inherited multilingual modes, batch prompts, plugins, templates, examples, and CLI bridges.

## Evidence Checked

- Branch `applycue/career-ops-fork` at `2d27caf`.
- `AGENTS.md`, `README.md`, root architecture/data/Docker/legal/security/support files, every Markdown file under `docs/`, the canonical ApplyCue skill, CLI bridges, the draft project-build skill, and top-level legacy READMEs.
- `package.json` command registration.
- `apps/worker/src/index.ts` command and option parsers.
- `apps/worker/src/live-preflight.ts` and `live-apply.ts` preflight, submit, receipt, and outcome paths.
- `packages/core/src/index.ts` contracts.
- `packages/profile/src/index.ts` profile, storage, source, and apply defaults.
- `packages/apply-assistant/src/index.ts` route, pause, and submit policy.
- `packages/discovery` implemented ATS and job-board provider IDs.
- `docker-compose.yml`, `Dockerfile`, and `cops` container/wrapper behaviour.
- Official [EU AI Act text](https://eur-lex.europa.eu/eli/reg/2024/1689/oj) and [European Commission GPAI guidance](https://digital-strategy.ec.europa.eu/en/policies/guidelines-gpai-providers) for the disclaimer's previous categorical open-source exemption claim.

## Tool Baseline

The repo has no separate documentation architecture gate. The canonical development gates are:

```powershell
pnpm applycue:check
pnpm applycue:uat -- --skip-tools
```

Review-specific checks used:

- Markdown inventory and status/header scan;
- relative-link resolution;
- documented `applycue:*` command comparison against `package.json`;
- command-option comparison against worker parsers;
- searches for competing source-of-truth, storage, submit, model-key, and legacy-owner claims;
- full-skill versus thin-bridge inspection;
- `git diff --check`.

## Agent-Led Review

### Current runtime owner

The supported path is:

```text
AGENTS.md
  -> skills/applycue/SKILL.md
  -> pnpm applycue:*
  -> apps/worker
  -> packages/*
  -> ~/.applycue/profiles/<profile>/
```

The package scripts and worker command router prove this path. No supported ApplyCue command enters root `modes/`, the standalone evaluators, root scanner/tracker, legacy batch runner, plugins, or Go dashboard.

### Happy path checked

The documented current flow matches the runtime shape:

```text
profile/status
  -> discovery and normalized JobRecord
  -> hard gates and decision queue
  -> external-agent/user judgement
  -> truth-reconciled CV and route
  -> master form data
  -> current live preflight
  -> review-mode fill/upload or explicitly allowed submit
  -> receipt and outcome
```

### Failure and degraded paths checked

- Missing, stale, paused, failed, or mismatched live preflight evidence blocks live apply.
- Live apply defaults to a review copy and pauses before submit.
- `--allow-submit` still cannot override a plan that requires approval or has pause reasons.
- Email and DM routes remain draft-only inside ApplyCue.
- Unknown worker options fail explicitly.
- Legacy root paths remain callable but are no longer documented as canonical owners.
- Docker is now documented as unsupported for real profiles instead of implying parity that has not been tested.

## Findings

### P0: launch security contact remains unproven

`SECURITY.md` previously required a dedicated email before public launch while `launch-readiness.md` said ApplyCue was ready. The docs now agree that a durable private vulnerability-reporting path is a launch gate. This review did not prove that GitHub private vulnerability reporting is enabled or that a dedicated security contact exists.

### P1: two competing architectures and data contracts were active in docs

The root `ARCHITECTURE.md` described inherited prompt modes as the current brain, root `data/applications.md` as the tracker authority, and a never-submit workflow. Root `DATA_CONTRACT.md` described repo-local CV/config/report files as the user layer.

Both root files are still required by inherited update/test lists, so they were not deleted. They are now thin compatibility documents that point to the current architecture and contracts while preserving the legacy updater boundary.

### P1: live browser commands used unsupported options

`docs/live-usage-runbook.md` passed `--route-id` to `browser-live-preflight` and `browser-live-apply`. The worker accepts `--plan-id` or `--job-id`; only `apply-route` accepts `--route-id`. The runbook now uses the real option boundary.

### P1: Docker documentation made an unsafe support claim

The previous Docker guide claimed full parity. Current files do not support that claim:

- compose does not mount the external `~/.applycue` store;
- Docker/Playwright versions have drifted from the current repo;
- the wrapper primarily maps legacy root commands;
- compose forwards model-key variables that the canonical runtime does not need.

The guide is now an explicit unsupported-status document with concrete recovery gates. Docker code was not changed.

### P1: legal and submission language conflicted with runtime

The previous disclaimer said ApplyCue never auto-submits and made a blanket local/open-source EU AI Act exemption claim. The runtime supports submission only through the generated plan, current preflight, saved policy, and an explicit live command. EU rules do not support a blanket exemption based only on open-source/local labels.

The disclaimer now describes the actual action boundary, avoids a universal GDPR role claim, links official EU sources, removes the broken trademark-policy link, and states that counsel must review formal commercial/regulatory launch claims.

### P2: current, target, research, and legacy docs were visually equal

`docs/README.md` now classifies canonical operating documents, focused current references, plans/research/history, repository/support documents, and legacy compatibility surfaces. Supporting documents now carry status labels so a reader does not treat a 2026-07-05 product plan as proof of current operation.

### P2: setup/customization pages directed users into legacy files

README, setup, support, FAQ, scripts, customization, examples, batch, plugin, template, and mode documentation now distinguish the external profile store and supported `applycue:*` path from root compatibility commands/files.

### P2: one full skill bypassed the thin-bridge rule

The draft `applycue-project-build` workflow is a valid separate heavy GTM/OpenOPC workflow, not a duplicate of normal CV-to-offer operation. Its canonical file lives at `skills/applycue-project-build/SKILL.md`; no CLI-specific bridge is currently published for it. The normal `.agents/skills/applycue/` bridge continues to point only to the canonical CV-to-offer skill.

## Recommended Fixes

1. Configure and verify a durable private vulnerability-reporting path before a formal launch-ready claim.
2. Keep `docs/README.md` in every documentation review and link new plans/reviews from the correct status section.
3. Add a future read-only CI documentation check for broken relative links, unknown `applycue:*` commands, unsupported documented options, and full rule copies under CLI bridge directories.
4. Retire inherited root docs/modes/batch/plugins only after the independent-v2 or equivalent cutover proves no required compatibility path remains.
5. Fix and trial Docker only if container distribution becomes a real requirement; do not spend launch time on it otherwise.
6. Complete the external-agent decision-recording boundary already identified in `ARCHITECTURE.md`; current UAT still writes backend-ranked decision buckets.
7. Obtain legal review before using the disclaimer for a commercial, hosted, organisational hiring, or regulated deployment.

## Verification

Completed after the documentation changes:

- `git diff --check`: passed;
- `pnpm applycue:check`: 19 test files and 239 tests passed;
- `pnpm applycue:uat -- --skip-tools`: passed;
- UAT discovered 66 jobs, generated five CVs, prepared five drafts, created five routes/browser plans, wrote five dry-run receipts, and reported no source-code writes;
- current-surface relative-link check: zero broken links;
- full Markdown check: 15 apparent missing links, all intentional generated-report path examples inside inherited prompt templates, not navigation links;
- every documented `applycue:*` command maps to a package script;
- no remaining current documentation example passes `--route-id` to live browser commands or omits the pnpm `--` separator before `--allow-submit`;
- one canonical product skill and one separate canonical draft project-build skill now have thin CLI bridges.

UAT is workflow proof only. The run reported 28 tracked applications and zero positive outcomes, so it does not prove interviews, offers, or hiring success.

This review changed Markdown/instruction files only. It did not edit TypeScript runtime code, environment files, credentials, Docker code, profile facts, or user policy.

## Follow-Up

The documentation set is now consolidated by authority and free of the validated current-path conflicts. Remaining legacy detail is intentionally retained and labelled because legacy scripts/tests still reference it.

The next documentation audit should be triggered by one of these events:

- implementation of the external-agent recorded-decision command;
- removal or porting of inherited root modules;
- Docker becoming a supported distribution;
- first hosted/model trial;
- hosted/SaaS launch work;
- a change to submit, email, browser, profile-storage, or security policy.
