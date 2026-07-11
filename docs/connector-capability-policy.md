# Agent Connector And Logged-In Browser Policy

Date: 2026-07-10

Status: current focused policy for MVP connector discovery, consent, and fallback. The canonical ApplyCue skill owns the live agent behaviour; this document explains the cross-harness design and evidence gates.

## Decision

The MVP should use the connector, MCP, browser, research, and file tools already supplied by Codex, Claude, or another user-chosen agent host when they are available and the user approves them.

ApplyCue must not assume that a tool exists because it exists in another host or on another machine. It must also not build a second Gmail, Outlook, LinkedIn, or browser account system merely to make the local MVP work.

The boundary is:

```text
ApplyCue says which capability is needed and what is allowed
-> the current agent host lists the tools it actually exposes
-> the agent maps those tools to the capability
-> the user approves connection or logged-in access when needed
-> the host owns OAuth, login state, tokens, and tool execution
-> ApplyCue receives normalized jobs, drafts, decisions, and receipts
```

There is no universal connector API shared by every agent harness. The portable contract is the capability and permission, not a vendor-specific tool name.

## MVP Capability Handshake

Before asking the user to connect anything, the agent should inspect the current host's available tools and build an in-memory capability map.

| Capability | What counts | MVP use |
| --- | --- | --- |
| `email_read` | a tool that can search and read the user's mailbox | find recent job alerts, recruiter messages, and application confirmations |
| `email_draft` | a tool that can create a draft without sending | prepare an application or follow-up email |
| `email_send` | a tool that can send mail | use only after the user confirms the final message and recipients |
| `logged_in_browser` | a host-controlled real browser/profile that the user can log into | inspect one or two user-approved job sites and supported application forms |
| `public_web` | web search, HTTP, public APIs, or approved source adapters | public job discovery and verification |
| `local_files` | approved file read/write tools | import CVs and store local ApplyCue artifacts |

For each needed capability, record only the current session state:

- `ready`: the tool is present and already authorized;
- `needs_connection`: the host can provide it but the user must install, enable, or authenticate it;
- `unavailable`: the host does not expose it;
- `denied`: the user or administrator has declined or blocked it;
- `unhealthy`: it is configured but cannot currently run.

This capability map is temporary because host tools and authentication can change. The user store may keep an approved source entry and a safe opaque connector reference if the host supplies one. It must never contain passwords, OTPs, OAuth tokens, cookies, client secrets, or copied browser profiles.

## How The Agent Discovers Tools

The canonical workflow is host-neutral, but the inspection method is host-specific:

- **Codex:** use the tool/app inventory exposed to the current task. A Codex client can use `app/list` for available apps and `mcpServerStatus/list` for MCP tools and authentication state. Connection should use the host's app install/enable or OAuth flow, not a token pasted into chat.
- **Claude Code:** inspect the tools already exposed to the session and the MCP status. `claude mcp list` or `/mcp` can show configured servers, tools, connection state, and OAuth actions.
- **Other agents:** inspect their native tool/plugin/MCP catalog. If the host cannot list its tools, try only a harmless read-only capability check after telling the user.

The agent maps by actual tool description and allowed action, not by name alone. A tool called `gmail` that can only send is not an `email_read` capability. A community tool called `linkedin` is not automatically a supported job-search connector.

Do not install a third-party plugin or MCP server merely because it appears in a marketplace. First show the publisher, required data access, requested permissions, and why it is needed. Installation and authentication require explicit user approval.

## How The Agent Prompts The User

Ask only when a missing capability has immediate value. Ask for one connection at a time and state:

1. what ApplyCue wants to do;
2. what data it needs;
3. what it will not do;
4. the safe fallback if the user declines.

Email example:

```text
I found a Gmail/Outlook connector that can search your mailbox. May I connect it to read only recent job alerts, recruiter messages, and application confirmations? I will not read unrelated mail or send anything. If you decline, I will continue with public job sources.
```

Logged-in job-site example:

```text
Which one or two job sites do you already use most? If you approve, I can use your existing Chrome session to search and inspect roles on those sites. You will log in directly in the site; do not give me your password or OTP. Search access does not grant permission to submit applications.
```

When the user agrees:

- start the host's normal install/enable/OAuth flow;
- let the user authenticate on the provider's own page or in their own browser;
- recheck the capability after the flow;
- report exactly what is now available;
- ask separately before sending, messaging, submitting, widening source scope, or using another account/site.

If the user declines or the tool is unavailable, continue with public ATS, JobSpy, company pages, manual URLs, or a manual-review route. Missing connector access must reduce convenience, not break the core product.

## Email In The MVP

Email is the best first native connector because inbox alerts and recruiter messages are high-signal inputs and the current ApplyCue scanner already normalizes raw connector results.

The MVP flow is:

```text
discover `email_read`
-> ask for narrow read/search approval
-> host performs OAuth
-> search only the agreed recent job-related scope
-> write the returned messages to the active user store
-> run `applycue:scan-email-leads -- --import`
-> normalize, dedupe, rank, and review through the normal ApplyCue pipeline
```

Drafting and sending are separate capabilities. ApplyCue may prepare a draft route. A native connector may create the draft. Final send always needs explicit user confirmation of the message, recipients, and attachments.

## Preferred Job Sites In The MVP

The setup agent should ask which one or two sites the user already relies on. It should not globally force LinkedIn, Indeed, Naukri, or another board.

Use this order for each approved site:

1. supported public API, feed, ATS adapter, or bounded job-board adapter for discovery;
2. the user's real logged-in Chrome session for information that genuinely needs login;
3. manual review if the site is unsupported, blocks automation, changes unexpectedly, or presents sensitive/risky questions.

Search/inspection permission and application permission are separate. Logged-in access does not permit bulk automation, evasion of site controls, credential capture, messaging, or final submission. ApplyCue should claim support only for site/route combinations with current UAT evidence.

### Current external finding

As checked on 2026-07-10, major job sites do not expose a dependable official candidate-side connector that ApplyCue can assume:

- LinkedIn's documented Talent APIs are partner/employer/ATS integrations, and most Talent permissions require approval. The Job Posting API publishes employer jobs; it is not a general candidate job-search/apply API.
- Indeed's documented integration material is likewise aimed at employers, ATSs, sponsored jobs, and campaigns.
- The preview MCP Registry contains community-published LinkedIn servers, but registry presence is unopinionated metadata, not LinkedIn endorsement, security review, or proof of candidate job-search rights. The current registry search returned no Indeed or Naukri server entries.

Therefore the MVP should **not adopt a job-site MCP server by default**. Public adapters plus a user-approved real browser session are the honest current route. A job-site connector can be trialled later only if it has a clear publisher, lawful candidate-side capability, narrow permissions, fixture and live evidence, revocation, and a browser/manual rollback.

## Adoption Results

| Tool | Existing owner | Outcome | Why and evidence level | Forbidden authorities | Rollback and next gate |
| --- | --- | --- | --- | --- | --- |
| Native agent email connector | External agent for account access; ApplyCue email scanner for normalization | `sidecar` | It supplies bounded mailbox results without becoming a product runtime owner. Host docs and scanner tests exist; a consented live read/import receipt is still missing. | unrelated-mail access, ApplyCue token storage, fact changes, source trust, send permission | Disable or disconnect it and continue with public sources; promote the support claim only after the MVP email UAT. |
| Community LinkedIn/Indeed/Naukri MCP | ApplyCue discovery adapters and user-approved browser route | `reject` for MVP default | Registry presence does not prove official candidate-side rights, security, reliability, or job-search/apply fit. Official major-board docs currently describe employer/ATS partner APIs. | credentials, cookies, bulk site automation, ranking truth, application permission, messaging, submit | No dependency to remove; reopen only for a named connector that passes publisher, permission, legal/platform, fixture, live, revocation, and rollback review. |

The real logged-in browser remains an existing external execution owner, not a new connector dependency. Each site/action stays unsupported until its own UAT evidence exists.

## MVP Evidence Gate

Before claiming connector-aware MVP support, prove:

- discovery handles `ready`, `needs_connection`, `unavailable`, `denied`, and `unhealthy` without inventing a tool;
- the agent asks before install, OAuth, mailbox reading, logged-in browser use, send, or submit;
- one consented Gmail or Outlook read/search flow reaches the existing email-lead importer in at least one supported agent host;
- one consented preferred job-site session proves login by the user, read/search or inspection, safe pause, and no credential storage;
- declining either connection still produces a useful public-source shortlist;
- the launch claim names the exact harness, connector, site, and actions actually tested.

These are current MVP gaps until live evidence exists. They do not require an embedded model API or a new ApplyCue connector backend.

## Primary References

- [Codex App Server API](https://learn.chatgpt.com/docs/app-server#api-overview)
- [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference#configtoml)
- [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp)
- [LinkedIn API access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)
- [LinkedIn Job Posting API](https://learn.microsoft.com/en-us/linkedin/talent/job-postings/api/sync-job-postings)
- [Indeed job-posting integrations](https://docs.indeed.com/job-postings/)
- [Official MCP Registry trust and curation model](https://modelcontextprotocol.io/registry/about)
- [Official MCP Registry terms](https://modelcontextprotocol.io/registry/terms-of-service)
- [Current MCP Registry search for LinkedIn](https://registry.modelcontextprotocol.io/v0.1/servers?search=linkedin)
- [Current MCP Registry search for Indeed](https://registry.modelcontextprotocol.io/v0.1/servers?search=indeed)
- [Current MCP Registry search for Naukri](https://registry.modelcontextprotocol.io/v0.1/servers?search=naukri)
