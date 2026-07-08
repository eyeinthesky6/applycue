# Codex Guide

ApplyCue supports Codex through the shared `AGENTS.md` instructions. The root
`CODEX.md` file is only a thin pointer to those shared rules.

## Interactive Codex

Start Codex in the repository root:

```bash
cd applycue
codex
```

Slash commands are not guaranteed in Codex. Use plain language when needed:

```text
Run ApplyCue setup.
Run ApplyCue status.
Run ApplyCue UAT.
Run the scan mode and summarize new matches.
Evaluate this job URL for my profile: https://company.com/jobs/123
```

## One-Shot Workers

For single commands or batch workers, use `codex exec`:

```bash
codex exec "Run ApplyCue status in this repo."
codex exec "Run ApplyCue UAT and summarize blockers."
codex exec "Evaluate this job URL for my profile: https://company.com/jobs/123"
```

Browser-heavy flows such as scan, pipeline, and apply still depend on Playwright browser tools being available in the active agent setup.
