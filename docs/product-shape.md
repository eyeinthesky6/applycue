# ApplyCue Product Shape

Date: 2026-07-05

## Position

ApplyCue is a career-ops-derived CV-to-offer agent for discovery, fit prioritization, truthful CV tailoring, autonomous batch applications, reply tracking, interview support, and offer follow-through.

The fork should keep career-ops' proven local workflow and attribution, while making the product more agent-led, profile-store based, browser-aware, and outcome-driven.

Core invariant:

```text
agents help a user get a job from thousands of postings every day
```

ApplyCue is not a generic job board, a search engine, or "Google for jobs." Anything new should be judged against the question: does this help the agent get the user closer to interviews and offers? If the agent can do the work more efficiently by reading the CV, JD, preferences, and feedback, keep it out of code.

It helps a person answer:

- what roles are worth applying to
- why each role fits or does not fit
- what CV variant should be used
- which applications can run automatically
- which exceptions need review
- how wide to search when there are not enough matches
- which sources and portals are trusted, ask-before, or blocked

## Promise

ApplyCue should feel like:

> I found the right roles, tailored the CVs, applied to the ones within your rules, paused on exceptions, and tracked the replies.

It should not feel like:

> Here is a giant score report. Please click through every job and review every CV manually.

## Default User View

```text
Decision: Apply / Review / Watch / Skip
Why: 3 short reasons
CV action: Generated / Needs proof / Not worth tailoring
Risks: 3 useful issues max
Next step: Submit in batch / Ask user / Save / Ignore
```

Backend ordering signals are for routing, audit, and learning. They should not become the user-facing product.

## Core Flow

1. Import CV, profile, preferences, constraints, and goals.
2. Build a profile model with proof-backed claims.
3. Discover jobs and leads from approved sources.
4. Normalize jobs into one schema.
5. Remove obvious no-go roles with hard gates.
6. Let the agent evaluate messy fit: role shape, domain, seniority, company context, and JD quality.
7. Create a shortlist and batch plan.
8. Widen sources or soft preferences when the batch is too small, with user-visible reasoning.
9. Check source trust and fraud signals.
10. Generate truthful role-specific CVs and application answers.
11. Apply automatically when the role and form match the user's apply settings.
12. Pause for exceptions, sensitive fields, unsupported claims, unknown portals, or unclear answers.
13. Track replies, interviews, rejections, offers, and follow-ups.
14. Learn from outcomes and adjust future batches.

## Parked For Next Version

Network intelligence is valuable, but it is not v1.

The later version can search the user's allowed social and contact sources for people who can help with company context, culture, compensation, benefits, interview prep, and maybe a referral. The user should review the list and press send on any DMs or posts.

## Non-negotiables

- Do not invent experience.
- Do not apply outside the user's configured rules.
- Do not send sensitive messages unless the user's policy allows it.
- Do not show scores as personal worth.
- Do not make users edit code for normal workflows.
- Do not make manual copy-paste the core workflow.
- Do not build complex matching/search code for work the agent can do better.
- Do not turn ApplyCue into a generic job board or search engine.
