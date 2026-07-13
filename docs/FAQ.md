# FAQ

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

## Are scores decisions?

No. Scores are diagnostics. The agent reads the full JD and decides `apply`, `watch`, or `skip`.

## Why keep similar titles?

One company can use the same title across teams, cities, and countries. Only exact source/record identity or confirmed history is safe for automatic dedupe.
