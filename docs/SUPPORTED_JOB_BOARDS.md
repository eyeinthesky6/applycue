# Supported Job Sources

Status: current source strategy. Exact implemented provider IDs live in `packages/discovery`.

ApplyCue discovers roles through source adapters. Source support should grow in this order:

1. Public ATS APIs and feeds.
2. Job-board adapters through approved libraries such as JobSpy.
3. User-approved company career pages.
4. Browser-visible extraction when no public API exists.
5. Social, community, newsletter, and email leads after the core loop works.

Source adapters should return normalized `JobRecord` data and leave fuzzy fit to the agent.

Current clean setup keeps JobSpy replaceable: it selects at most two JobSpy searches plus one direct no-key feed, or up to two direct no-key feeds when JobSpy is unavailable. India source plans may also suggest the MIT-licensed JobHive snapshot lane, but it requires explicit source approval. JobHive's company directory is a bounded seed; agents should still prefer confirmed concrete company careers/ATS URLs for direct scanning.

For one or two user-preferred logged-in sites, ApplyCue uses the agent host's real-browser capability only after explicit approval and only for actions with current UAT evidence. The user logs in directly; ApplyCue does not store credentials. Search/inspection permission is separate from fill, message, or submit permission.

Do not assume that a job board has an official candidate connector because a community MCP server uses its name. Current major-board APIs are mainly employer/ATS surfaces. The current connector finding and adoption rule are in [`connector-capability-policy.md`](connector-capability-policy.md).
