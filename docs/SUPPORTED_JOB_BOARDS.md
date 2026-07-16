# Supported Job Sources

ApplyCue discovers leads from approved sources and sends every viable role through
full-JD agent review. Source coverage varies by country, role, provider uptime, and
the user's approved accounts.

Current source categories are:

- included public ATS and company adapters such as Greenhouse, Ashby, Lever,
  Workday, SmartRecruiters, Workable, Personio, Recruitee, and Rippling;
- included public job feeds and boards where their access rules permit it;
- user-added job links and approved company career pages;
- browser-visible extraction when a complete description is rendered or collapsed;
- approved native email connectors, or the optional Gmail plugin, for job-alert
  leads.

An adapter normalizes company, title, location, URL, source, and available posting
details. It does not decide candidate fit. A short card, email, or search snippet
is only a lead: the agent must obtain the complete job description before a final
`apply`, `watch`, or `skip` decision.

ApplyCue does not claim access to every job board, and it never reads a mailbox or
logged-in site without the user's approval. Optional libraries such as JobSpy are
not part of the default installation and should be considered only when measured
source testing proves a gap.
