# Discovery Inspiration And Build Decision

Date: 2026-07-06

Updated: 2026-07-08

## Decision

ApplyCue discovery should build in layers:

1. Generate a source plan from CV, profile, preferences, and target roles.
2. Let the user or agent approve sources into editable config.
3. Use public ATS and job-board adapters before asking the agent to browse pages manually.
4. Keep manual URL/text import as a fallback, not the primary lane.
5. Add browser extraction only when a public API or deterministic adapter is unavailable.
6. Add social, community, newsletter, and email leads after the core job loop works.
7. Use source outcomes to learn what produces replies, interviews, and offers.

## What The Product Needs

The important shape is:

```text
source adapter -> JobRecord -> hard gates -> agent shortlist -> CV engine -> apply assistant -> tracker
```

Strong discovery means:

- source adapters fetch jobs cheaply and consistently
- normalization makes all sources look the same to the rest of the engine
- hard blockers remove obvious no-go roles early
- the agent handles fuzzy fit, seniority ambiguity, company context, and user preference tradeoffs
- sources stay labeled as `system_generated`, `agent_suggested`, or `user_added`
- generated source plans are never hand-edited; agents update profile/preferences and regenerate them

## What To Avoid

- A fixed company list as the main product.
- A score-heavy user experience.
- Agent edits to source code or prompts for one application.
- User assets inside the source repo.
- Human-only final application flow as the default.
- Markdown tables as the long-term source of truth.
- Multiple divergent router files with separate business rules.

## OSS References Checked

These are references, not current dependencies.

| Project | License / Fit | Decision |
| --- | --- | --- |
| JobSpy | MIT, job-board scraping breadth | Use as the first broad job-board bridge behind `packages/discovery`. Do not make it the core engine. |
| JSON Resume | MIT, structured resume schema | Use as schema inspiration for structured profile/CV facts. |
| Resume Matcher | Apache-2.0, ATS/resume matching | Use as inspiration for ATS checks and keyword feedback, not as the truth layer. |
| OpenResume | AGPL-3.0, resume builder/parser | Avoid as a dependency; license is not clean for planned distribution. Product ideas are useful. |
| Reactive Resume | MIT, resume builder | Later reference for self-hosted resume UI/export, not v1 core. |
| ApplyPilot | AGPL-3.0, close autonomous apply product | Avoid dependency. Study product stages and risks only. |
| Browser Use | MIT, browser-agent framework | Possible later execution layer; current local build should keep browser execution behind apply policy. |
| agent-browser | Apache-2.0, browser automation CLI | Possible later execution bridge for multi-environment browser control. |
| OpenClaw | MIT, chat/assistant runner | Good future distribution/channel reference, not needed for local engine now. |
| Crawl4AI | Apache-2.0, public web extraction | Use later for public careers pages or posts that have no useful API. |
| Firecrawl | AGPL-3.0 repo plus hosted API | Optional cloud connector only with explicit user approval. Do not make it default. |

Reference links:

- JobSpy: https://github.com/speedyapply/JobSpy
- JSON Resume schema: https://github.com/jsonresume/resume-schema
- Resume Matcher: https://github.com/srbhr/Resume-Matcher
- OpenResume: https://github.com/xitanggg/open-resume
- Reactive Resume: https://github.com/amruthpillai/reactive-resume
- ApplyPilot: https://github.com/Pickle-Pixel/ApplyPilot
- Browser Use: https://github.com/browser-use/browser-use
- agent-browser: https://github.com/vercel-labs/agent-browser
- OpenClaw: https://github.com/openclaw/openclaw
- Crawl4AI: https://docs.crawl4ai.com/
- Firecrawl: https://github.com/firecrawl/firecrawl

## Discovery Build Order

1. Generated source plan from CV, profile, and preferences.
2. User confirmation and approved source config.
3. Manual file/URL/text import as fallback input.
4. Source adapter contract for public ATS and job boards.
5. Company/ATS adapters such as Greenhouse, Lever, Ashby, Workable, SmartRecruiters, BambooHR, Breezy, Recruitee, Pinpoint, Workday, Personio, and Rippling.
6. JobSpy bridge for broad job-board adapters.
7. Browser-visible extraction when a page has no API.
8. Social/community/newsletter/email leads.
9. Liveness, trust, and outcome-based source learning.

## Source Ownership

Keep source origins separate:

- `system_generated`: created by ApplyCue from CV/profile/preferences and written to generated source-plan output.
- `agent_suggested`: proposed by an agent after research, browser work, or user chat.
- `user_added`: explicitly supplied or approved by the user.

The approval route copies accepted generated suggestions into editable user config. The generated file stays read-only product output.

## Search Profile

The generated source plan includes a reviewable `searchProfile`:

- positive and negative title terms
- seniority boost terms
- allowed and ask-before locations
- required, positive, and negative content terms
- preferred or blocked source hints

It is generated output. To change it, update the user's profile/preferences or source settings and regenerate the plan.

## Local Run Evidence

Recent local run evidence:

```text
1177 discovered jobs -> 17 source-quality kept -> 3 CVs -> 3 application drafts -> 3 browser plans
```

The source-quality filter runs before shortlist preparation. Manual jobs are not filtered by the generated plan because manual imports are deliberate user/agent inputs and should remain reviewable.

## UAT Lessons

Broad job-board discovery can find many roles, but weak filters produce too much trash. The current direction is:

- tighten source queries before widening
- keep obvious blockers in code
- route ambiguous fit to the agent
- ask the user only when a reusable policy decision is needed
- track outcomes so source quality can improve from real replies and interviews

## Not In This Slice

- no custom external scraping outside approved adapters
- no LinkedIn automation yet
- no browser submit changes
- no new scoring model
- no new CV template
- no real user asset storage change
