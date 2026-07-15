# Mode: jobs — Multi-Job Comparison

Compare only jobs whose full descriptions have been reviewed. Before comparing them, re-read `config/profile.yml`, `modes/_profile.md`, and confirmed feedback so the ranking reflects the user's current intent rather than keyword overlap.

Do not calculate a weighted CV-to-JD fit score. For each role, show:

- decision: `apply`, `watch`, or `skip`;
- confidence: `high`, `medium`, or `low`;
- strongest evidence-backed reasons to proceed;
- material gaps and whether each is blocking or manageable;
- unknowns that could change the decision;
- confirmed preferences that materially affected the judgment;
- time-to-offer or posting-legitimacy considerations when evidence exists.

Then assign explicit positive ranks to the current `apply` queue. Rank 1 is the role the agent recommends preparing/applying first. Do not rank `watch` or `skip`; use `—`. Explain close calls in plain language. If a missing user preference could change the order, keep the affected roles unranked and ask the material question.

All reports must include **URL:**, **Decision:**, **Rank:**, **Confidence:**, and **Legitimacy:** fields in the output header.

Ask the user for job postings if they are not in context. These can be text, URLs, or references to jobs already evaluated in the tracker.
