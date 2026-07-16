# FAQ

## Who is ApplyCue for?

ApplyCue is for job seekers across technical, product, sales/GTM, operations,
programme and public-impact, strategy, consulting, founder/operator, and hybrid
roles. It needs a capable local agent such as Codex or Claude; the user should not
need to be a developer or operate package commands themselves.

## Is ApplyCue a job board?

No. It is an agent-led CV-to-application workflow that uses several sources and the user's approved browser/connectors.

## Does the user edit files or run commands?

Not normally. The agent installs, configures, runs, and explains ApplyCue through chat.

## Where does data live?

In the gitignored local user layer of the checkout for MVP. See `DATA_CONTRACT.md`. Use separate checkouts for different real candidates until V1 multi-profile storage exists.

## Does ApplyCue need an AI API key?

No. MVP uses the model and tools already available in Codex, Claude, or another agent harness.

## Can it submit automatically?

The agent can fill and submit after explicit approval for the named role. Every attempt gets a receipt. Sensitive/unknown answers, mismatches, closed pages, and uncertain prior attempts pause the flow.

ApplyCue is not an unattended mass-apply service. It does not silently widen the
search, use a new logged-in account, or submit another role under an earlier
approval.

## Does ApplyCue find hundreds of jobs or get me hired faster?

ApplyCue can search many approved job sources and connected job-alert email leads,
but coverage varies by country, role, and source. Version 0.1 does not claim a
fixed number of jobs for every search and cannot promise an interview, offer, or
shorter time to hire. Its current promise is a more controlled path from discovery
to truthful, role-specific, explicitly approved applications.

## Are fit scores decisions?

No. New reviews do not calculate a semantic fit score. The agent reads the full JD and confirmed preferences, decides `apply`, `watch`, or `skip`, records confidence/reasons, and explicitly ranks the apply queue. Old numeric scores remain visible only as legacy history.

The separate provider trust score remains because it checks narrow reproducible source signals such as URL validity, suspicious domains, and company/domain mismatch. It annotates a lead and never decides candidate fit or drops the job by itself.

## When does ApplyCue use my preferences?

The agent captures and confirms them before the first search, rereads them before every final role decision/rank, and rereads them again before role-specific CV or form drafting. The final decision receipt fingerprints the confirmed preference files. If they change, an unsubmitted role becomes pending re-review; dashboard feedback can suggest a change but cannot save it without approval.

## What changes for a high-stakes role?

The agent does deeper bounded employer/context research, asks only material evidence questions, and creates an adaptive campaign pack beside the verified CV. ApplyCue records whether that pack still matches the current JD, review, candidate positioning, CV, and narrative files, then shows its status and links on the dashboard. The pack is not another score or submit engine, and any public-profile recommendations remain drafts until separately approved.

## Why keep similar titles?

One company can use the same title across teams, cities, and countries. Only exact source/record identity or confirmed history is safe for automatic dedupe.
