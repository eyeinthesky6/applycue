# Codex Guide

Status: current thin Codex usage guide.

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
Find fresh roles for my active ApplyCue profile and summarize the review queue.
Review this job URL against my active profile: https://company.com/jobs/123
```

## One-Shot Workers

For single commands or batch workers, use `codex exec`:

```bash
codex exec "Run ApplyCue status in this repo."
codex exec "Run ApplyCue UAT and summarize blockers."
codex exec "Review this job URL against my active ApplyCue profile: https://company.com/jobs/123"
```

Public API discovery and DOCX/text-PDF source import do not require a browser. Browser UAT and controlled live browser routes require the supported Playwright/Chrome tooling. The current engine generates Markdown, HTML, and DOCX; PDF output is not a current product claim.
