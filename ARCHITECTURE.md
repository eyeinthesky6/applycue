# ApplyCue Architecture Pointer

Status: compatibility entrypoint

The canonical ApplyCue architecture is [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). The documentation authority map is [`docs/README.md`](docs/README.md).

The supported runtime is:

```text
skills/applycue/SKILL.md
  -> pnpm applycue:*
  -> apps/worker
  -> packages/*
  -> ~/.applycue/profiles/<profile>/
```

Codex, Claude, or another user-chosen external agent supplies fuzzy judgement and user-authorized tool use. ApplyCue owns typed facts, hard gates, CV truth, routes, policy, state, receipts, and outcomes.

## Removed Inherited Surface

The inherited career-ops modes, scanner/tracker scripts, standalone evaluators, batch runner, plugins, updater, Go dashboard, and container wrappers have been removed from this branch. Dated comparisons and Git history retain the architectural evidence; there is no local fallback tree.

Use the current architecture and follow the `applycue:* -> apps/worker -> packages/*` path.
