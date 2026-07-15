# Contributing to ApplyCue

Thanks for helping improve ApplyCue. The project is local-first and handles
sensitive career data, so privacy and a clear human/agent/code boundary matter
as much as feature breadth.

## Before You Start

- Open an issue before a new feature, workflow, architecture change, or external
  dependency.
- A direct pull request is welcome for a focused bug fix, documentation fix,
  translation, test, or provider that uses a lawful public source.
- Read `AGENTS.md`, `DATA_CONTRACT.md`, `docs/ARCHITECTURE.md`, and
  `docs/agent-development-guide.md` before changing runtime behavior.

## Development Setup

Requirements: Git and Node.js 22.5 or newer.

```powershell
git clone https://github.com/eyeinthesky6/applycue.git
cd applycue
corepack pnpm install
npm run check
```

Run the relevant focused test while developing, then run `npm run check` before
opening a pull request.

## Product Boundaries

- Keep one root runtime, one tracker, one dashboard, and one canonical ApplyCue
  skill.
- Let the external agent own fuzzy role judgment and CV writing. Code may own
  objective validation, identity, receipts, rendering, and state transitions.
- Never weaken named approval, current-employer, exact-attempt, CV-bundle,
  live-form preflight, or uncertain-submit protections.
- Do not add auto-submission, unsolicited outreach, prohibited scraping, or a
  hosted data path that transmits candidate information without an approved
  product decision.
- Prefer existing providers and owners. New dependencies need a clear licence,
  maintenance, failure-mode, and outcome advantage.

## Privacy

Never commit or attach real CVs, names, email addresses, phone numbers, job-search
history, browser receipts, scan results, credentials, or generated application
artifacts. User-layer paths are listed in `DATA_CONTRACT.md`; use fictional data
under `examples/` for tests and demonstrations.

## Pull Requests

Keep changes focused and explain the user-visible outcome. Include:

- the problem and why the existing owner could not already handle it;
- tests or receipts proving the behavior;
- documentation changes when workflow or public behavior changes;
- any licence, privacy, or migration impact.

Contributions are licensed under the repository's MIT `LICENSE`. Maintainer
responses are best effort; there is no guaranteed review SLA.
