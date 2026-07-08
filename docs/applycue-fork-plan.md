# ApplyCue Fork Plan

Date: 2026-07-08

## Decision

ApplyCue will start from a fork of career-ops instead of replacing it from scratch.

Reason: career-ops already has a working agent workflow for scanning, evaluating, reporting, tracking, and generating tailored CV artifacts. ApplyCue should build on proven behavior first, then replace or reshape internals only when the real workflow demands it.

## Attribution

career-ops is MIT licensed and remains the upstream base for this branch. Preserve license and attribution. Do not present this branch as if the career-ops foundation was written from scratch by ApplyCue.

## Product Direction

ApplyCue is a CV-to-offer agent, not a passive job search assistant.

The default workflow is:

1. Learn the user's CV, role targets, preferences, geography, compensation, and apply policy.
2. Discover roles from configured sources, agent-suggested sources, and user-added sources.
3. Apply hard blockers first: fraud, closed jobs, unsupported location/work authorization, clearly wrong role family, user exclusions.
4. Let the agent judge fuzzy fit from CV, JD, preferences, and feedback.
5. Generate a truthful role-specific CV from approved user facts and proof points.
6. Reconcile the generated CV against the base CV and user-approved facts.
7. Prepare browser application steps and pause on policy exceptions.
8. Track applications and outcomes so future searches improve.

## What To Keep From career-ops

- Agent modes and repo-local onboarding flow.
- Portal scanning and provider library.
- Pipeline and tracker files.
- Evaluation/report structure.
- CV and cover-letter generation primitives.
- Batch processing ideas.
- Dashboard/TUI as a proven starting point.

## What ApplyCue Adds

- External profile store under `~/.applycue/profiles/<profile>/`.
- Base CV versioning and role-family base CVs.
- Truth reconciliation for tailored CVs.
- Browser apply plans, receipts, and UAT checks.
- Source approval separation: system-generated, agent-suggested, and user-added.
- Agent-first setup and daily operation, with no code edits for one application.
- Outcome learning from replies, interviews, offers, and rejections.

## Build Rule

Do not build complex matching math for fuzzy judgment. The agent should do fuzzy role fit. Code should enforce contracts, truth, hard blockers, browser safety, durable storage, and repeatable artifacts.

## First UAT Gate

A run is useful only when one fresh role can go through this full path:

`discover -> evaluate -> truthful tailored CV -> DOCX/PDF/HTML artifact -> browser fill/upload plan -> pause before submit -> tracker updated -> receipt saved`

Until this works reliably, dashboard polish and broad matching sophistication are secondary.
