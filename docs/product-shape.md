# ApplyCue Product Shape

Date: 2026-07-05

## Position

ApplyCue is an independent CV-to-offer agent for discovery, fit prioritization, truthful CV tailoring, autonomous batch applications, reply tracking, interview support, and offer follow-through.

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

Raw scores are backend signals for ordering, audit, and learning.

## Core Flow

1. Import CV, profile, preferences, constraints, and goals.
2. Build a profile model with proof-backed claims.
3. Discover jobs and leads from approved sources.
4. Normalize jobs into one schema.
5. Remove obvious bad matches with deterministic hard gates.
6. Rank remaining roles by priority.
7. Widen soft filters when the batch is too small.
8. Check source trust and fraud signals.
9. Generate truthful role-specific CVs and application answers.
10. Apply automatically when the role and form match the user's apply settings.
11. Pause for exceptions, sensitive fields, unsupported claims, unknown portals, or unclear answers.
12. Track replies, interviews, rejections, offers, and follow-ups.
13. Learn from outcomes and adjust future batches.

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
