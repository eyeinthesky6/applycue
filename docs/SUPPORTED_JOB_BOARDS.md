# Supported Job Sources

ApplyCue discovers roles through source adapters. Source support should grow in this order:

1. Public ATS APIs and feeds.
2. Optional job-board adapters through approved libraries such as JobSpy when UAT proves a coverage gap.
3. User-approved company career pages.
4. Browser-visible extraction when no public API exists.
5. Social, community, newsletter, and email leads after the core loop works.

Source adapters should return normalized company/title/location/URL/source data and leave fuzzy fit to the agent.
