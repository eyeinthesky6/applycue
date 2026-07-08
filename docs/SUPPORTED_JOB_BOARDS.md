# Supported Job Sources

ApplyCue discovers roles through source adapters. Source support should grow in this order:

1. Public ATS APIs and feeds.
2. Job-board adapters through approved libraries such as JobSpy.
3. User-approved company career pages.
4. Browser-visible extraction when no public API exists.
5. Social, community, newsletter, and email leads after the core loop works.

Source adapters should return normalized `JobRecord` data and leave fuzzy fit to the agent.
