# ApplyCue Research Notes

Date: 2026-07-05

Status: research backlog only; listed tools are not dependencies or approved runtime owners.

These are reference directions, not dependencies.

## Useful Patterns

- Two-stage retrieval: collect many possible jobs cheaply, then let the agent shortlist a smaller set carefully.
- Agent fit review: let the agent compare CV, JD, preferences, and user feedback for fuzzy fit.
- Proof mapping: match each job requirement to evidence from the user's CV or proof bank.
- Outcome learning: update source focus, user preferences, and agent guidance when applications produce interviews, replies, or rejections.

## Useful Libraries And Systems To Evaluate

- Playwright for deterministic browser control.
- Stagehand or Browser Use patterns for agent-assisted browser control.
- JobSpy as the first broad job-board bridge behind `packages/discovery`.
- Crawl4AI for public web extraction where no official API or JobSpy source fits.
- Firecrawl-style providers as optional cloud connectors only with explicit user approval.
- JSON Resume as a reference for structured resume data.
- ESCO and O*NET as optional references for skill and occupation wording, not as final fit authorities.

## MVP Research Questions

- Which sources produce the highest-quality jobs for the first user?
- Which CV format is easiest for agents and humans to inspect?
- Which hard gates should be user-editable from day one?
- How should ApplyCue learn from lower-priority jobs that still produce interviews?
- Which browser actions can run under policy, and which should pause as exceptions?
