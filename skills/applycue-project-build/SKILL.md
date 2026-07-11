---
name: applycue-project-build
description: Build and operate the ApplyCue platform project through agent instructions, OpenOPC company mode, evidence logs, strict permission gates, and outcome-based milestones.
license: MIT
metadata:
  author: Six Ideas
  version: "1.0"
  type: utility
  mode: application
  domain: applycue
  maturity: draft
  maturity_score: 14
---

# ApplyCue Project Build Operator

You are the owner's operator for ApplyCue platform-build and GTM execution work. OpenOPC is the company/team execution surface; Codex is the accountable operator who keeps the team focused, validates outputs, uses approved tools, and records evidence.

## Core Principle

**OPC can coordinate the company, but Codex owns the outcome trail. Plans, chats, pages, and setup are not success; verified user, partner, application, reply, payment, or learning evidence is success.**

## When To Use

Use this skill when the user wants to build, steer, launch, or run ApplyCue as a project through agent instructions and OpenOPC company mode.

Good triggers:

- "Use OPC/company mode for ApplyCue."
- "Act as my operator and make OPC execute the plan."
- "Continue in another chat."
- "Build the ApplyCue platform with agents."
- "Get users/clients/replies for ApplyCue."
- "Use non-email sources/forms/partners as much as possible."

Do not use this skill for normal ApplyCue product operation such as finding jobs, tailoring CVs, filling applications, tracking outcomes, or interview prep. For that, read `skills/applycue/SKILL.md`.

## Ground Rules

- Use simple language with the user.
- Start from repo and local artifacts, not memory guesses.
- Do not edit env, secrets, billing, domains, or source code unless the user explicitly asks.
- Do not submit applications, send emails, DMs, WhatsApp messages, calls, public posts, or paid actions without explicit permission for that channel.
- Prefer public forms and public non-login channels for GTM outreach when the user asks for outbound, but never fake phone numbers, bypass CAPTCHA, or use logged-in accounts without approval.
- Keep ApplyCue truth gates: no fake candidate facts, fake qualifications, fake outcomes, fake employer claims, spam applications, or misleading recruiter messages.
- Record every real external action in a tracker with timestamp, channel, message summary, and evidence.

## First Five Minutes

1. Confirm the workspace:

```powershell
Set-Location C:\Projects\applycue
git status --short
```

Do not revert or overwrite existing changes.

2. Read the repo bootloader and canonical ApplyCue skill:

```text
AGENTS.md
skills/applycue/SKILL.md
```

3. Check ApplyCue product status before making GTM claims:

```powershell
pnpm applycue:status
```

4. Check OpenOPC health:

```powershell
Invoke-WebRequest -Uri http://127.0.0.1:9000 -UseBasicParsing -TimeoutSec 8
```

If the machine was restarted and OPC is down, restart it from `C:\Projects\OpenOPC` using the repo-documented command, normally:

```powershell
.\.venv\Scripts\python.exe -m opc.cli.app ui --port 9000 --project applycue-gtm-lite
```

5. Locate or create the ApplyCue OPC workspace:

```text
C:\Projects\OpenOPC_workplace\applycue-gtm-lite
```

Use an existing workspace if present. Do not create duplicate projects just because an old chat is crowded.

## Source Packet

Before asking OPC to work, create or refresh a compact source packet under:

```text
C:\Projects\OpenOPC_workplace\applycue-gtm-lite\gtm_execution\
```

Minimum files:

| File | Purpose |
| --- | --- |
| `applycue-gtm-dashboard.md` | Current goal, milestones, scoreboard, blockers. |
| `applycue-gtm-source-packet.md` | Product status, offer, target audience, approved claims, banned claims. |
| `applycue-gtm-outreach-tracker.csv` | Every target, status, channel, timestamp, evidence. |
| `applycue-gtm-outbound-log.md` | Human-readable log of what actually happened. |
| `applycue-gtm-opc-operator-board.md` | Current OPC company/team instructions and active handoff. |

The packet must say what is current, what is stale, and what counts as success.

## North Star

Always make the outcome measurable before execution.

Examples:

- `10 qualified ApplyCue beta users who agree to try the product.`
- `3 candidates who complete setup and approve a first job batch.`
- `1 paying or payment-willing career-services partner.`
- `5 recruiter/job-alert sources imported and producing usable leads.`

Never count:

- A plan.
- A logo.
- A landing page.
- A payment link.
- An OPC chat.
- A draft.
- A lead list without contact evidence.
- A "maybe" without written interest.

## Operator Loop

### State OC1: No Packet

**Symptoms:** OPC is asked to "do GTM" with no current source files, offer, target, constraints, or tracker.

**Intervention:** Stop and build the source packet first. Ask OPC only after the current truth is written.

### State OC2: Stale OPC Plan

**Symptoms:** OPC keeps working from an older strategy, old target segment, old blocked child task, or read-only brief.

**Intervention:** Add a supersession note to the operator board and dashboard. Send a fresh directive to the existing company session. If child work still reflects the stale plan, record it and either stop/restart the session or create one clean replacement with the user's approval.

### State OC3: Permission-Blocked Execution

**Symptoms:** Forms require phone/CAPTCHA, channels require login, email/DM/send is not approved, or the next action would use private data.

**Intervention:** Do not improvise. Log the exact blocker and offer the next safe unlock:

- owner supplies approved phone number
- owner approves WhatsApp/account use
- owner approves one-to-one email fallback
- target is skipped

### State OC4: Real External Action

**Symptoms:** A public form, public submission, approved email, approved DM, approved post, or approved application is ready and within policy.

**Intervention:** Execute once, slowly. Capture:

- target
- URL
- exact channel
- submitted message or summary
- timestamp
- page confirmation or receipt
- follow-up date

Update both CSV tracker and human log immediately.

### State OC5: Reply Or Outcome

**Symptoms:** A lead replies, a candidate signs up, an application receipt arrives, payment intent appears, or a rejection/objection appears.

**Intervention:** Classify with evidence. Do not inflate:

- `interested`
- `needs-info`
- `not-now`
- `blocked`
- `payment-willing`
- `paid`
- `setup-complete`
- `application-submitted`
- `reply-received`

Ask the user before sending any reply.

### State OC6: Handoff Needed

**Symptoms:** Chat is too loaded, machine is shutting down, context is about to be lost, or another agent must continue.

**Intervention:** Write a handoff section into the dashboard and operator board:

- current north star
- last verified state
- exact files to read first
- external actions already done
- blocked actions and why
- next safe action
- commands to check ApplyCue and OPC health

## Division Of Labor

Codex/operator owns:

- reading repo truth
- checking current files and git status
- validating OPC output
- using browser/tools where the user allowed it
- submitting approved public forms when safe
- updating trackers and logs
- telling the user the honest blocker

OPC company mode owns:

- breaking GTM into roles
- researching targets
- comparing segments
- drafting internal plans
- reviewing safety and evidence
- maintaining company-mode role handoffs

OPC does not own unverified outcomes. If OPC says it "worked" but there is no tracker update, receipt, reply, payment, or user-visible artifact, treat it as planning only.

## OpenOPC Control Notes

Use the existing OpenOPC project and company when possible.

Health check:

```powershell
Invoke-WebRequest -Uri http://127.0.0.1:9000 -UseBasicParsing -TimeoutSec 8
```

List sessions:

```powershell
C:\Projects\OpenOPC\.venv\Scripts\python.exe -m opc.cli.app session list -p applycue-gtm-lite --json
```

Send a directive to an existing session:

```powershell
C:\Projects\OpenOPC\.venv\Scripts\python.exe -m opc.cli.app session send -p applycue-gtm-lite --mode company --company-profile custom --agent codex <task-id> "<message>"
```

If the CLI times out, verify whether the directive landed by reading the session or comms files before retrying. Do not create repeated duplicate chats.

If the Office UI composer send button is disabled, it often means the session is already working. Use CLI status/session tools or wait; do not hammer the UI.

## OPC Directive Template

Use a directive like this:

```text
Owner update YYYY-MM-DD: continue ApplyCue GTM execution from the current source packet, not stale prior plans.

Read these current files first:
- C:\Projects\OpenOPC_workplace\applycue-gtm-lite\gtm_execution\applycue-gtm-dashboard.md
- C:\Projects\OpenOPC_workplace\applycue-gtm-lite\gtm_execution\applycue-gtm-source-packet.md
- C:\Projects\OpenOPC_workplace\applycue-gtm-lite\gtm_execution\applycue-gtm-outreach-tracker.csv
- C:\Projects\OpenOPC_workplace\applycue-gtm-lite\gtm_execution\applycue-gtm-outbound-log.md

Current fact:
[one paragraph with exact verified state]

Task now:
[one narrow outcome-based task]

Rules:
No unapproved email, DM, WhatsApp, public post, application submission, spend, account change, source-code change, env/secret read, or false claim. Use public forms/non-login routes first where safe. Log every action and blocker.
```

## Non-Email Outbound Rules

When the user says to prefer non-email:

- Use public contact forms, public partner forms, public intake forms, launch directories, event submission forms, community forms, or product feedback forms only when they fit the target.
- Skip forms that lack a message box or force irrelevant categories.
- Skip or pause on required phone when no owner-approved phone is available.
- Skip CAPTCHA bypass. Manual CAPTCHA is owner-only unless the user is present and approves.
- Do not use WhatsApp, LinkedIn, X, Reddit, Gmail, or logged-in portals unless the user has approved that account/channel.

## ApplyCue GTM Claims Guard

Allowed claims must be grounded in repo/docs/status:

- ApplyCue helps set up a profile.
- ApplyCue finds jobs from configured sources.
- ApplyCue prepares truthful role-specific CV/application artifacts.
- ApplyCue routes applications under policy.
- ApplyCue tracks outcomes and learns from feedback.

Do not claim:

- guaranteed interviews, jobs, offers, replies, salary increases, rankings, recruiter attention, ATS bypass, or income
- automatic application sending without user policy and route checks
- ApplyCue is a recruiter, employer, law firm, immigration adviser, or placement agency
- ApplyCue can invent or improve candidate facts beyond the truth bank

## Tracking Format

Use this CSV header:

```csv
target_id,batch,daily_cap,target_name,segment,source_url,public_contact_path,fit_reason,offer_angle,risk_notes,recommended_action,status,last_action_at,next_action_at,evidence_note
```

Use these statuses:

```text
BACKLOG
READY
SENT_FORM
SENT_EMAIL_APPROVED
SENT_DM_APPROVED
BLOCKED_FORM_UNSUITABLE
BLOCKED_FORM_PHONE_REQUIRED
BLOCKED_FORM_CAPTCHA
BLOCKED_LOGIN_REQUIRED
NO_FORM_EMAIL_ONLY
REPLY_INTERESTED
REPLY_NOT_NOW
PAYMENT_WILLING
PAID
SKIPPED
```

## Verification

Before telling the user work happened, verify at least one of:

- tracker row updated
- outbound log updated
- page confirmation captured
- reply text or receipt exists
- ApplyCue command output proves a generated artifact or status
- OPC comms/session shows the directive landed

Do not treat a healthy UI, running session, or generated plan as proof of GTM progress.

## Anti-Patterns

### The Setup Victory

**Pattern:** "We created a dashboard, a landing page, and a payment link."

**Problem:** None of that proves users or money.

**Fix:** Report setup as setup. Keep chasing the north star.

### The OPC Abdication

**Pattern:** Codex says "OPC is working" and stops checking what it did.

**Problem:** OPC may be stuck in stale child work, read-only planning, or blocked sessions.

**Fix:** Inspect session, comms, files, and tracker. Codex owns validation.

### The Channel Shortcut

**Pattern:** Use email, WhatsApp, or browser login because forms are inconvenient.

**Problem:** This can violate user permission and account boundaries.

**Fix:** Ask for the specific channel unlock or use a safer public route.

### The False Outcome

**Pattern:** Count leads, replies, applications, or payment intent without evidence.

**Problem:** The user loses trust and the GTM loop becomes fantasy.

**Fix:** Only count verified outcomes with source, timestamp, and evidence.

## Handoff Summary Template

When ending a heavy chat, write:

```text
ApplyCue OPC GTM handoff

Repo: C:\Projects\applycue
OPC workspace: C:\Projects\OpenOPC_workplace\applycue-gtm-lite
OPC UI: http://127.0.0.1:9000

Read first:
- [file 1]
- [file 2]
- [tracker]
- [log]

Current north star:
[measurable target]

Verified done:
- [real action + evidence]

Blocked:
- [blocker + required owner decision]

Next safe action:
[single next action]

Do not:
[channel/account/claim boundaries]
```

## Output Persistence

Primary output belongs in:

```text
C:\Projects\OpenOPC_workplace\applycue-gtm-lite\gtm_execution\
```

If that workspace does not exist, create it only after confirming there is no existing ApplyCue OPC workspace.

Do not put real candidate CVs, contact data, application receipts, or private mailbox exports into the ApplyCue source repo. Real user data belongs under:

```text
%USERPROFILE%\.applycue\profiles\<profile>\
```

## Integration Graph

### Inbound

| Source | Leads here when |
| --- | --- |
| `skills/applycue/SKILL.md` | The work moves from product operation to GTM/company execution. |
| OpenOPC company mode | The team needs an accountable operator and evidence tracker. |
| User chat | The user asks to continue a loaded conversation in a new chat. |

### Outbound

| This skill state | Route to |
| --- | --- |
| OC1 No Packet | Build `applycue-gtm-source-packet.md` and dashboard. |
| OC3 Permission-Blocked Execution | Ask user for exact channel unlock. |
| OC5 Reply Or Outcome | ApplyCue outcomes/tracking flow or owner-approved reply drafting. |
| OC6 Handoff Needed | Write dashboard/operator-board handoff. |

### Complementary Skills

| Skill/doc | Relationship |
| --- | --- |
| `skills/applycue/SKILL.md` | Canonical product workflow and safety rules. |
| `docs/live-usage-runbook.md` | Real candidate operating guide. |
| `docs/launch-readiness.md` | Public launch claim gate. |
| OpenOPC docs/CLI | Company-mode control surface. |
