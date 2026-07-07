# ApplyCue Architecture

Date: 2026-07-05

## Shape

```text
Chat or web UI
  -> ApplyCue skill / app actions
  -> ApplyCue engine
  -> profile store
  -> source discovery connectors
  -> normalizer and dedupe
  -> deterministic gates and ranker
  -> CV and answer generator
  -> browser apply agent
  -> email/reply tracker
  -> local progress dashboard
  -> outcome analytics
```

## Packages

- `packages/core`: shared contracts and types.
- `packages/profile`: CV, preferences, proof bank, and profile ingestion.
- `packages/discovery`: source adapters for jobs and posts.
- `packages/normalizer`: job normalization and dedupe.
- `packages/ranker`: hard gates and priority ranking.
- `packages/cv-tailor`: role-specific CV plans and variants.
- `packages/apply-assistant`: form-fill plans, auto-submit policy, and exception boundaries.
- `packages/engine`: first-build orchestration across ranking, CV generation, application drafts, manifests, and local outputs.
- `packages/tracker`: application state, outcomes, local progress snapshots, and generated HTML dashboard output.
- Future `packages/network-intel`: social network map, company-context contacts, DM drafts, and referral-help flow.

## Apps

- `apps/web`: human-facing local or hosted UI.
- `apps/worker`: scheduled discovery and ranking jobs.
- `apps/browser-agent`: controlled browser application helper.

## Skill

`skills/applycue` is the chat entrypoint. It should call the engine and explain actions in plain language.

The skill should expose user actions:

- run today's application batch
- show next best roles and exceptions
- make a CV for this role
- apply to this role under my policy
- explain why this was ranked low
- learn from this feedback
- show what is working

## V1 Local Outputs

The first version writes local state and generated files under the active output root.

For real user runs, the output root is the user profile store:

```text
~/.applycue/profiles/<profile>/data/local/
~/.applycue/profiles/<profile>/outputs/
```

Repo-local `data/local/` and `outputs/` are development/sample fallback locations only.

The simplest useful dashboard is a static HTML file:

```text
<outputRoot>/outputs/dashboard/latest.html
```

It should show applications, replies, interviews, offers, paused items, pending questions, and next actions.
