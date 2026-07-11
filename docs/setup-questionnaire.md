# ApplyCue Setup Questions

Date: 2026-07-05

Status: current question reference. The agent asks only material missing facts and writes approved answers through product flows.

The agent should ask the minimum needed to start the pipeline, write stable answers into config, and ask the rest only when needed.

Do not turn setup into a long form. ApplyCue should start running quickly.

## Required To Start

The command-level minimum for a real first batch is:

- name plus email or phone;
- base CV;
- at least one target role.

The agent writes those approved values through `applycue:setup -- --input <file> --base-cv <file>`. The questions below improve safety and shortlist quality, but the agent may collect non-blocking answers incrementally rather than forcing a long form before setup.

Ask these first:

1. What is your current company?
   - ApplyCue should not apply there.

2. What is your current designation and level?
   - Example: VP Product, Director, Head of Strategy, Founder.

3. Should ApplyCue apply to past employers?
   - Simple answer: yes, no, or ask me first.

4. What role titles should ApplyCue search for?
   - Example: Head of AI, AI Transformation Lead, Product Strategy, Chief of Staff.

5. What designation or level should ApplyCue target?
   - Example: Director, VP, C-level, Head, Founder-office.

6. What employment types are okay?
   - Full-time, contract, consulting, fractional.

7. What locations or countries should ApplyCue search?
   - Example: India, Remote India, Delhi NCR, Remote APAC.

8. What work modes are okay?
   - Remote, hybrid, onsite.

9. What compensation floor should ApplyCue respect?
   - Ask currency too.

10. What is your notice period?

11. How many applications per day?
   - Market check: 3 to 5.
   - Active search: 15 to 25.
   - Urgent search: 40 to 80.

12. Which mode?
   - `review`: prepare, user reviews each submit.
   - `daily`: apply up to the daily count and pause on exceptions.
   - `push`: widen faster and aim to create interviews quickly.

13. How wide should the match be?
   - `tight`: close matches only.
   - `normal`: close first; offer more-results options only if the user asks.
   - `wide`: more volume inside hard rules.

These are enough to begin search and batch planning.

## Ask Incrementally

Ask these only when they first matter:

- work authorization or visa
- relocation
- non-standard shifts
- travel limits
- role-specific screening questions
- salary range when a form requires exact expected pay
- source-specific login permission
- whether to apply through a specific job portal
- whether a suspicious portal is safe
- whether to message a recruiter or founder
- whether to use a claim that is not clearly proven

Example:

```text
This role is onsite in Singapore and asks about visa sponsorship. You have not set that rule yet. Should I skip Singapore onsite roles, ask each time, or allow them?
```

## Search Area

The user can give a starting search area, but ApplyCue should make the final search area visible.

Example:

```text
I will start with:
- India remote
- Delhi NCR hybrid
- Bangalore hybrid

If today's batch is short, I will expand to:
- Remote APAC
- Remote Europe-overlap

I will ask before:
- relocation
- onsite outside India
```

The search area is dynamic, but it should not be invisible. The agent should tell the user when it widens.

## Portal And Source Access

Some users will log into job portals and let the agent use the browser. That is allowed if the user chooses it.

Source rules:

- trusted portals: agent can search and apply under policy
- ask-before portals: agent can search, but pauses before applying
- blocked portals: agent skips
- unlisted company portals: agent can use them if they look like normal company/application pages and do not match fraud or blocked rules

Fraud signals:

- asks for payment
- registration fee
- training fee
- deposit
- crypto wallet
- strange personal document request
- no real company identity

Default for unlisted portals should be practical: search and prefill are okay for normal company/application pages; pause on fraud signals, sensitive fields, configured ask-before portals, or final submit policy.

## Connector And Preferred Job-Site Onboarding

Do not start setup by asking the user to connect every account. First inspect the connector and browser tools exposed by the current agent host. Ask only when the capability is available or connectable and has immediate value.

After the first useful public-source run, ask:

```text
I can improve the next batch in two optional ways:
1. Search recent job alerts and recruiter messages through an available Gmail/Outlook connector.
2. Use your existing Chrome login on one or two job sites you already prefer.

Which, if either, would you like to enable?
```

For email, explain that the first permission is narrow read/search for recent job-related messages. Do not imply send permission. Use the agent host's own OAuth screen and continue with public sources if the user declines.

For job sites, ask for the user's preferred one or two sites instead of assuming LinkedIn, Indeed, Naukri, or another board. The user logs in directly in the real browser. Store the approved site as a `sources.loggedInBrowserSources` entry, but do not store credentials. Treat search/inspection, fill/upload, messaging, and final submit as separate permissions.

See `docs/connector-capability-policy.md` for the host discovery states, prompt rules, and current job-site connector decision.

## Session Start Reminder

At the start of each session or daily run, the agent should check pending questions.

If questions are not blocking the pipeline, ask briefly:

```text
I can run today's batch. Two settings are still pending:
1. Should I apply to past employers?
2. Should I allow Remote APAC roles?

I will continue with current rules unless you answer now.
```

If a question blocks the pipeline, ask before running:

```text
I need your location/country and notice period before I can apply safely.
```

## What Gets Written To Config

- current company
- current designation and level
- past employers
- apply-to-past-employers rule
- target roles
- target level
- employment type
- compensation
- notice period
- search countries and areas
- work modes
- applications per day
- mode
- match range
- trusted, ask-before, and blocked sources
- approved email-source intent and preferred logged-in job sites, but no connector tokens or browser credentials
- pending questions
