# ApplyCue Configuration

The agent manages configuration in chat and asks before changing saved scope.

## Candidate profile

`config/profile.yml` stores confirmed candidate identity, location, work authorization, compensation/availability, contact fields, and CV output choices. Extract fields already present in the CV; ask only for missing material values.

Use `config/profile.example.yml` as the schema reference. Do not add secrets, passwords, OTPs, payment data, private identity documents, or unconfirmed claims.

## Search and sources

`portals.yml` stores approved company/board searches, titles, locations, recency, and source settings. `config/profile.yml` may store legacy company/title cooldown hints, but those are advisory because identical titles can represent different openings. Start from the examples/templates created by onboarding.

Rules:

- no silent widening;
- current employer always excluded;
- past employers only after confirmation;
- an exact URL or unresolved/confirmed attempt may block automatically;
- company/title cooldown hints stay in the queue for agent review;
- similar titles and semantic fit go to the agent;
- unknown posting dates may remain reviewable but should be identified;
- show stage loss counts before changing filters.

## Candidate-specific instructions

Use `modes/_profile.md` for reusable candidate narrative, strengths, target role language, and confirmed exceptions. Use `modes/_custom.md` for local operating preferences. Do not edit shared modes for one user.

## Optional connectors

Connectors live in the external agent host, not in ApplyCue config. The agent should discover what is available, explain why Gmail/Outlook/browser access helps, and ask the user to connect/approve it. ApplyCue does not store connector tokens.

## Application answers

Store only reusable, user-approved answers in the user layer. Legal, demographic, authorization, sponsorship, salary, relocation, background-check, disability, veteran, and identity fields require explicit known values. Never infer them.

## Environment

Do not edit `.env` without user permission. API evaluator scripts are optional; MVP does not require AI API keys.
