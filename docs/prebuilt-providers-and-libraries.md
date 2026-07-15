# Provider and OSS Adoption Guide

## Decision

Use existing root providers first. Add permissive OSS only when a measured source or browser gap remains after real UAT. Do not adopt a project because it is novel, tiny, or easy to copy; maturity, maintenance, license, failure behavior, and integration cost matter.

## Existing owner

- `providers/` fetches source-specific records.
- `scan.mjs` normalizes, applies objective constraints, records history, and writes the pipeline.
- the external agent/browser opens rendered or collapsed pages and makes semantic decisions.

New tools must fit this boundary. They must not create another engine or tracker.

## Useful categories

| Need | Preferred approach | Notes |
| --- | --- | --- |
| Greenhouse/Lever/Ashby/company ATS | direct documented/public endpoint provider | Usually small, stable, testable, and low cost. |
| broad public job-board coverage | bounded JobSpy trial | Permissive and useful breadth, but Python/browser dependencies and board breakage make it optional, not core. |
| rendered/collapsed JD | user's approved agent browser | Best for “read more”, login, SPA, and visual liveness. |
| static page extraction | existing HTTP/page tools | Keep an agent fallback. |
| mailbox alerts | native Gmail/Outlook connector | Agent-owned permission; no tokens in ApplyCue. |
| company directory expansion | permissively licensed/pinned directory data | Never make an unclear commercial-license dataset a launch dependency. |

## Provider size reality

A clean provider for a stable public API can be roughly 100–400 lines plus fixtures. Pagination, inconsistent dates/locations, rate limits, identity, redirects, and error handling often bring it to 500–1,500 lines. A resilient browser scraper for a changing job board can become several thousand lines and permanent maintenance.

This is why ApplyCue keeps source adapters small and uses the agent/browser for dynamic edge cases instead of promising one universal scraper.

## Trial gate

Before adopting a library/repository, record:

1. Exact missing outcome (for example, “India queue has fewer than 30 viable fresh roles”).
2. Current baseline count/precision.
3. License and commercial-use position.
4. Release/activity/issue health and community maturity.
5. Installation/runtime burden.
6. Data quality, duplication, freshness, and failure behavior.
7. Bounded adapter plan and rollback.
8. Expected gain and pass/fail threshold.

Example JobSpy pass gate: at least 20 additional fresh, unique, relevant India leads in a representative run, under acceptable failure/rate limits, without becoming a mandatory Python dependency for users who do not need it.

## Not launch requirements

- reverse ATS directory scanning as a default or commercial dependency; the existing `scan:full` command remains an optional dormant coverage trial and normal scanning does not depend on it;
- Docker;
- Python/JobSpy;
- embedded model SDKs;
- source-specific login automation.

Keep these available as explicit trials if MVP evidence shows the existing sources are starved.
