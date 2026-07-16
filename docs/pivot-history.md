# ApplyCue Pivot History

## 1. Career-Ops fork

ApplyCue first forked the MIT-licensed Career-Ops project and renamed/extended it. This supplied a working agent-led flow: providers, job-page review instructions, reports, CV generation, tracker, dashboard, application, and follow-up modes.

## 2. Independent typed rewrite

A separate TypeScript architecture was built to improve contracts, profile storage, source adapters, ranking, CV provenance, browser plans, receipts, and a web dashboard. It produced useful tests and concepts, but also duplicated almost every runtime owner. The product became harder to operate and semantic math created false-elimination risk.

## 3. Independent runtime promotion

The typed architecture replaced the mature root operator on the independent branch. This removed working breadth faster than replacement user flow arrived, creating the impression that working features had vanished.

## 4. Recovery and comparison

The last integrated fork was restored in a recovery worktree and passed its large regression suite. The typed branch was kept as donor/reference. The comparison showed that a wholesale port or fourth rewrite would delay a running product.

## 5. Final consolidation

The recovery branch became the sole launch product. Useful donor features were re-homed—browser dashboard, DOCX, application receipts, agent-first profile discovery, and claim confirmation—then the duplicate typed control plane and Go TUI were removed.

The result is not “Career-Ops plus ApplyCue running side by side.” It is one ApplyCue product derived from Career-Ops and upgraded with selected ApplyCue work.

## Branch meaning

- launch path: the current `main` branch's recovered/consolidated ApplyCue root runtime; the typed and Go control planes are absent;
- independent archived/donor branches and shared Git history: publicly reachable historical evidence, not a supported runtime or user choice; local donor worktrees are separate recovery evidence and are not public;
- original Career-Ops checkout: upstream/reference and personalized historical operator, not the public ApplyCue product.

The unrelated typed baseline remains preserved in archived/donor refs and shared Git history while the exact tested consolidated commit is the one obvious `main` branch. Deleting or hiding a branch would not erase shared history. Do not combine the histories with an unrelated-history merge. ApplyCue release tags, Git history, `LICENSE`, and `NOTICE` retain attribution; archive branches are historical evidence, not supported product choices.
