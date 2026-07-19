# Getting Help

ApplyCue is early and local-first. Ordinary users should not need to understand GitHub workflows to ask a question or share feedback. Technical reports still need a reproducible command, file, or UAT artifact.

## Where To Ask

| Need | Where |
|---|---|
| Setup, usage, or troubleshooting question | [ApplyCue Telegram community](https://t.me/applycue): open the channel and choose its linked discussion group |
| Public-safe product feedback, review, idea, workflow, or outcome | [ApplyCue Telegram community](https://t.me/applycue): post in the linked discussion group |
| Release, guide, or maintainer update | [ApplyCue Telegram channel](https://t.me/applycue) |
| Feedback about your own CV, job, application, answers, or preferences | Your private ApplyCue agent chat or local dashboard; do not post it publicly |
| Reproducible bug | [GitHub Issues](https://github.com/eyeinthesky6/applycue/issues/new/choose) |
| Scoped feature work | [GitHub feature-request form](https://github.com/eyeinthesky6/applycue/issues/new/choose) |
| Contributor design question or extension discussion | [GitHub Discussions](https://github.com/eyeinthesky6/applycue/discussions) |
| Contribution | Read `CONTRIBUTING.md`; open an issue before broad engineering work |
| Security vulnerability | Follow the private route in `SECURITY.md` |

## Before Posting

1. Check the Telegram community for user questions, or search GitHub Discussions and Issues for technical work.
2. Run `node doctor.mjs --json`.
3. Run `npm run check` for a product code change.
4. For help or a bug, include your OS, Node.js version, agent CLI, command run,
   and the first blocker string.

The Telegram group, channel, GitHub Discussions, Issues, and pull requests are
all public surfaces. Do not include CVs, names, personal contact details,
credentials, application history, employer correspondence, browser receipts,
scan output, or generated candidate files. Use fictional or sanitized evidence.

Support is currently best effort. ApplyCue 0.1 supports named `ApplyCue-v*`
release tags on Node.js 22.5 or newer. The `main` branch is a moving development
channel, not a stable release. GitHub source ZIPs can be inspected, but they do
not contain the Git history needed for the documented update and rollback flow.
Older untagged branches and donor worktrees are not supported user install paths.

When reporting an install or update problem, include `git rev-parse HEAD` and
`git describe --tags --exact-match` output when available. If the second command
fails, say whether you intentionally installed rolling `main` or used a ZIP.
