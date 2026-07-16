# Agent-first Installation and Usage

## User handoff

The user may give an agent only this repository URL and a request to install ApplyCue:

```text
https://github.com/eyeinthesky6/applycue
```

The agent should:

1. Check Git and Node.js 22.5+.
2. Open the GitHub Releases page and identify the latest stable `ApplyCue-v*` tag.
3. Clone the repository into a user-approved location and check out that exact tag
   in detached mode. Do not install rolling `main` unless the user asks for the
   development channel.
4. Run `pnpm install --frozen-lockfile` when pnpm is available; otherwise run
   `corepack pnpm install --frozen-lockfile`.
5. Read `AGENTS.md` and `skills/applycue/SKILL.md`.
6. Run `node doctor.mjs --json`.
7. Greet the user and enter onboarding if needed.
8. When ready for CV ingestion, begin it directly instead of returning a setup essay.

Do not install Docker, Go, Python, JobSpy, or an AI SDK for the default MVP. Optional providers/tools are added only for a demonstrated source gap and with permission.
Do not run `corepack enable` merely for ApplyCue: on Windows it may require
administrator access, while `corepack pnpm` can invoke the repository's pinned
package-manager version directly.

## Onboarding behavior

- Ask the user to provide or point to a CV file.
- Preserve it exactly and extract what is already known.
- Ask whether approved project folders/public profiles should enrich it.
- Ask before reading each folder/account/connector.
- Confirm the coherent story and material facts.
- Capture only missing search/apply preferences.
- Run a baseline search before major CV rewrites.

## Connectors

The agent inspects its own available tools. If Gmail/Outlook or browser connectors
are useful but unavailable, explain the benefit and ask the user to connect them.
Never claim a connector exists before discovery or read email without approval.
Job sites are usually public pages or user-approved logged-in browser flows rather
than exposed agent connectors.

## Normal operation

The user speaks in plain language: “find jobs”, “show the shortlist”, “tailor my CV”, “apply to these”, or “what happened?”. The agent maps this to the canonical skill and runs the necessary commands.

Slash commands are optional. Do not make normal users run package scripts.

## Distribution status

Today the repository URL is the install link. A small website may later display the same URL and agent prompt, but the repository remains the executable source of instructions. Hosted/SaaS onboarding is V2.
