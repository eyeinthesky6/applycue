---
name: applycue
description: Run ApplyCue CV-to-offer automation: discovery, ranking, CV tailoring, batch applications, reply tracking, and exception review.
arguments: request
user_invocable: true
user-invocable: true
argument-hint: "[setup | status | batch | apply | answers | sources | outcomes | dashboard | uat | help] or a natural-language job-search request"
---

# ApplyCue Skill

Use this skill when the user asks ApplyCue to run application batches, find jobs or leads, rank roles, tailor CVs, apply under policy, review exceptions, track replies, prepare interviews, or explain outcomes.

## Invocation Notes

- Treat the user message as `$request`.
- Always start by running `pnpm status` unless the current task is only documentation or code development.
- Use the `Agent command center` from status as the exact repo-command route.
- In chat, report plain outcomes and questions. Do not ask the user to run commands.
- If a request could apply to a live form, use the browser/live-preflight route before fill, upload, or submit.

## Mode Routing

Determine the mode from `$request`:

| User says | Mode | Route |
| --- | --- | --- |
| empty, `help`, "what can you do" | `help` | Show a short plain-language menu, then ask what they want to do next. |
| "set up", "start ApplyCue", "import my CV" | `setup` | Run `pnpm status`; if setup/profile is missing, run `pnpm setup-applycue` and ask only blocking setup questions. |
| "status", "what next", "where are we" | `status` | Run `pnpm status`; summarize Agent handoff, not raw folders. |
| "find jobs", "run today", "prepare batch", "scan" | `batch` | Run `pnpm status`, then follow the command center. Usually run `pnpm first-build` or `pnpm uat` when the profile is ready. |
| pasted JD text, job URL, or "apply to this role" | `single-role` | Save the job/JD into the user store as a local job input when needed, run the engine, then use reconciliation and browser preflight before any apply action. |
| "apply", "submit", "apply approved jobs" | `apply` | Run `pnpm status`; only continue when UAT/browser UAT pass and live preflight passes or required answers are approved. |
| "answer these form questions", "save this answer", "preflight paused" | `answers` | Read `outputs/live-preflight/live-answer-prompts.md`, ask the user in chat, then save approved reusable answers with `pnpm approve-answers`. |
| "add source", "approve sources", "use these companies/sites" | `sources` | Use generated source plans and `pnpm approve-sources`; do not hand-edit generated source-plan files. |
| "record reply", "got interview", "rejected", "offer" | `outcomes` | Record the outcome with `pnpm record-outcome`, then rerun status/summary for source learning. |
| "show dashboard", "show CVs", "show output" | `dashboard` | Use the dashboard and summary paths from `pnpm status`; summarize in chat and open files only when useful. |
| "run UAT", "is it ready", "test it" | `uat` | Run `pnpm check`, `pnpm uat`, and browser UAT when needed; report the first blocker or readiness evidence. |

If `$request` does not fit a mode, use `status` first, then ask one short clarifying question only if the next action is ambiguous.

## Help Menu

If the user asks for help, say this in simple language:

```text
ApplyCue can:
- set up your profile from a CV
- find and rank roles
- create truthful role-specific CVs
- prepare applications
- apply through the browser when policy allows
- pause for missing or sensitive answers
- track replies, interviews, rejections, and offers

Tell me what you want next: set up, run today's batch, review exceptions, apply approved jobs, or record an outcome.
```

## Rules

- Before code changes, read `AGENTS.md` and `docs/agent-development-guide.md`.
- Treat chat as the product UI. The user should not manually run repo commands, edit JSON, install JobSpy, or manage local tool folders.
- For installation and usage shape, follow `docs/agent-first-installation-and-usage.md`.
- For user CVs, profile images, local jobs, or generated outputs, use the user store described in `docs/user-asset-storage.md`.
- Use ApplyCue-owned code and contracts from this repo.
- Call the ApplyCue engine and CLI; do not hand-edit CVs for one application.
- Do not store real user assets or config in the source repo.
- Explain decisions in simple language.
- Ask setup questions from `docs/setup-questionnaire.md` when preferences are missing.
- Write stable user preferences into config through the ApplyCue config shape.
- Ask only blocking setup questions upfront; keep non-blocking unknowns as pending questions.
- At session start, summarize pending questions briefly and continue if they do not block the batch.
- Treat sources as trusted, ask-before, blocked, or unknown. Pause on fraud signals.
- Treat closed-job UAT failures as blockers. A closed job may be logged, but it must not get a CV, application draft, or browser plan.
- When browser/page liveness evidence is available, feed it through ApplyCue's liveness verifier or `JobRecord.liveState`; do not bypass the engine with side scraping.
- Treat scan history as engine-owned user-store state. Do not hand-edit `data/local/scan-history.jsonl`; daily and push runs use it to avoid already prepared or closed non-manual jobs.
- Treat repost signals as source-quality warnings, not automatic rejection. Explain them as "this company may have relisted a similar role."
- Treat outcome events as engine-owned user-store state. Record replies, rejections, interviews, offers, and user feedback with `pnpm record-outcome`; do not hand-edit source files or generated CVs for one outcome.
- Use Source Learning in the dashboard/summary to explain which sources are producing replies, interviews, offers, or rejections. Do not present this as a personal score.
- Show batch decisions, reasons, CV actions, risks, exceptions, and next steps.
- Keep raw scores in the backend unless the user asks to inspect them.
- Do not invent CV claims or personal details.
- Do not add source-code changes for one job application run.
- Treat rendered CV completeness UAT failures as blockers before showing CVs as ready or starting browser application testing.
- Do not submit an application unless reconciliation, source trust, and user policy all allow it.
- Apply and send only within the user's configured apply settings.
- Before browser filling or submit, run the browser apply preflight: the page must be live, must match the intended company/role, and must not contain unanswered required or sensitive fields.
- Pause on missing proof, sensitive fields, unusual questions, or unclear answers.
- When the user approves a reusable form answer, save it with `pnpm approve-answers`; do not hand-edit `applycue.json`.
- Do not edit env files or secrets.

## Core Actions

- `setup-applycue`: run `pnpm setup-applycue` to install or verify local helper tools including JobSpy and optional browser UAT tooling, create the user store, approve safe default sources, and run the first safe review batch.
- `check-status`: run `pnpm status` at session start or before browser apply. Use the Agent handoff block first: it summarizes ready roles, attention items, next steps, and evidence paths without making the user inspect folders. Use the Agent command center inside that block as the exact next repo command route. Use it to inspect config, latest run, UAT, dashboard, summary, source quality, scan history, and source learning without hand-reading folders.
- `run-uat`: run `pnpm uat`; use the generated UAT report and `outputs/runs/latest-summary.md` as the handoff artifacts before browser apply testing.
- `run-browser-uat`: run `pnpm browser-uat` before live browser application testing. It uses a safe local form and must either pass with a browser receipt or clearly skip because optional browser tooling is not installed. Do not treat a skipped browser UAT as proof of real portal compatibility.
- `run-live-preflight`: run `pnpm browser-live-preflight` before filling a real application page. It opens one real portal URL from a generated browser plan, snapshots the visible page, runs ApplyCue preflight, writes a report, chat-ready answer prompts, and a local answer review page, and does not fill, upload, or submit.
- `run-live-apply`: after a current live preflight `PASS`, run `pnpm browser-live-apply` to fill planned fields, upload the generated DOCX, write a receipt/report, refresh progress, and pause before final submit. Use `--allow-submit` only when the plan and user policy explicitly allow submit.
- `approve-application-answer`: when live preflight pauses on reusable questions and the user gives answers, prefer `pnpm approve-answers -- --from-live --set field=value --dry-run`, then rerun without `--dry-run`. Include only answers the user explicitly approved for reuse. For a single answer, `pnpm approve-answers -- --field <field-or-question> --value <approved-answer> --alias <visible-label>` is also valid. Use `outputs/live-preflight/live-answer-approval-template.json` as fallback evidence, not as the default editing surface. Use `--replace` only when the user explicitly changes a previous approved answer.
- `setup-profile`: collect missing setup answers and write stable config.
- `configure-sources`: generate and approve sensible source config from the user's goals. Keep generated source plans read-only.
- `run-local-batch`: call the ApplyCue batch command; use local config/job files when present and sample data otherwise.
- `generate-job-cv`: call the CV engine for one job.
- `review-reconciliation`: explain supported, adjacent, unsupported, and needs-confirmation items.
- `prepare-application`: create a draft under policy.
- `apply-approved-jobs`: use `pnpm browser-live-preflight` first, then `pnpm browser-live-apply` only after a current `PASS`. Browser adapters should execute generated plans through `executeBrowserApplyPlan` from `apps/browser-agent`; use `createPlaywrightBrowserApplyController` for Playwright-style pages. Do not fill forms through side scripts that bypass ApplyCue preflight, action logging, or receipts.
- `browser-apply-preflight`: after inspecting the real browser page, write a browser page snapshot JSON into the user store and run `pnpm browser-preflight -- --plan <browser-plan.json> --snapshot <page-snapshot.json>`. Verify live page, company/role match, required fields, sensitive fields, and submit policy before filling.
- `review-exceptions`: show paused items and what answer is needed.
- `show-dashboard`: open or summarize the local dashboard.
- `review-scan-history`: explain repeat skips and possible repost signals from the dashboard or run summary without exposing raw scores as product UI.
- `learn-from-outcome`: record replies, rejections, interviews, offers, and user feedback through `pnpm record-outcome`, then rerun the batch or inspect the latest summary for Source Learning.

## Agent Setup Contract

When the user says "set up ApplyCue", "use ApplyCue", or "find/apply jobs for me":

1. Run `pnpm status` to inspect whether ApplyCue is already installed, configured, and UAT-ready.
2. If helper tools are missing, install them into `~/.applycue/tools/` or use packaged tool paths.
3. Create or update `~/.applycue/profiles/<profile>/` for the user.
4. Import the user's CV and assets into that profile store.
5. Ask only blocking setup questions.
6. Generate and approve safe default sources based on the user's stated goals.
7. Run a review batch and summarize decisions.
8. Use `outputs/runs/latest-summary.md` as the first chat summary, and link the dashboard for deeper inspection.

Do not present the user with package-manager or Python instructions unless they explicitly ask for developer setup details.

When a session starts after setup, run `pnpm status` first. If it says `READY`, summarize the latest run and continue from the dashboard/summary. If it says `WARNING`, explain the concrete warning before increasing automation. If it says `BLOCKED`, fix the failing UAT checks before applying. When the Agent command center is present, treat it like ApplyCue's router: run the first safe command that matches the user's current request, then return the plain chat outcome.

When live preflight pauses, open or read `outputs/live-preflight/live-answer-prompts.md`. Start with its `Copy This To Chat` section, then use the detailed records for approval commands and one-off field inspection. Use `outputs/live-preflight/live-answer-prompts.html` when the user wants a visual review of the pause. Save only explicitly approved reusable answers with `pnpm approve-answers -- --from-live --set field=value`, then rerun the batch or live preflight. Use `outputs/live-preflight/live-answer-approval-template.json` only when a file review is easier.

Browser page snapshot shape for preflight:

```json
{
  "finalUrl": "https://company.example/apply/123",
  "title": "Head of Product - Example",
  "pageText": "Visible page text...",
  "visibleCompany": "Example",
  "visibleRole": "Head of Product",
  "applyControls": ["Submit application"],
  "fields": [
    { "name": "name", "label": "Full name", "type": "text", "required": true },
    { "name": "resume_or_cv", "label": "Resume", "type": "file", "required": true }
  ]
}
```

Save real snapshots under `~/.applycue/profiles/<profile>/data/local/browser-snapshots/`. Do not store them in the source repo.

## Default Response Shape

```text
What happened:
Ready queue:
Needs approval:
Skipped or watch:
CVs:
Browser receipts:
Next step:
```
