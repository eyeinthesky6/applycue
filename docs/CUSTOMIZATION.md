# Customization Guide

Normal users customize ApplyCue through chat. The agent writes candidate-specific changes to the user layer and asks before changing saved scope.

| Need | Location |
| --- | --- |
| contact, location, authorization, compensation, CV output | `config/profile.yml` |
| target roles, narrative, strengths, confirmed exceptions | `modes/_profile.md` |
| local operating preferences | `modes/_custom.md` |
| source queries, companies, locations, recency, cooldown | `portals.yml` |
| exact baseline CV | `cv.md` |
| evidence and writing examples | `article-digest.md`, `writing-samples/`, approved local assets |

Do not customize shared modes, templates, scripts, or skills for one user. Do not store passwords, OTPs, tokens, payment data, or private identity documents.

If a search is noisy or starved, show stage counts and propose one reusable config change. Similar-title/CV-to-JD judgment stays with the agent.

Visual CV template changes are product-level changes. Candidate content changes are user-layer changes.
