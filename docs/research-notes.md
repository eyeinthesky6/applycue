# ApplyCue Research Notes

Date: 2026-07-05

These are reference directions, not dependencies.

## Useful Patterns

- Two-stage retrieval: collect many possible jobs cheaply, then rank a smaller set carefully.
- Hybrid matching: combine exact keyword matching with semantic matching.
- Rank fusion: merge ranks from different signals instead of pretending every score has the same meaning.
- Proof mapping: match each job requirement to evidence from the user's CV or proof bank.
- Outcome learning: update ranking weights when applications produce interviews, replies, or rejections.

## Useful Libraries And Systems To Evaluate

- Playwright for deterministic browser control.
- Stagehand or Browser Use patterns for agent-assisted browser control.
- JobSpy as the first broad job-board bridge behind `packages/discovery`.
- Crawl4AI for public web extraction where no official API or JobSpy source fits.
- Firecrawl-style providers as optional cloud connectors only with explicit user approval.
- JSON Resume as a reference for structured resume data.
- ESCO and O*NET as references for skill and occupation taxonomies.

## MVP Research Questions

- Which sources produce the highest-quality jobs for the first user?
- Which CV format is easiest for agents and humans to inspect?
- Which hard gates should be user-editable from day one?
- How should ApplyCue learn from lower-ranked jobs that still produce interviews?
- Which browser actions can run under policy, and which should pause as exceptions?
