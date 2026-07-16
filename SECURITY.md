# Security Policy

## Supported Versions

ApplyCue is an early-stage, local-first project maintained on a best-effort
basis. Security fixes are considered for the latest published release and the
current `main` branch. Older releases are not separately supported; reporters
and users may be asked to upgrade to the latest release.

| Version | Supported |
| --- | --- |
| Latest published release | Yes |
| Current `main` branch | Evaluated before the next release |
| Older releases | No |

This policy covers the local product in this repository. It does not make a
claim about a hosted service. The security scope and response process must be
reviewed before any hosted ApplyCue service launches.

## Reporting a Vulnerability

Do not open a public issue for security vulnerabilities.

Use [GitHub private vulnerability reporting](https://github.com/eyeinthesky6/applycue/security/advisories/new).
Do not include a real CV, application history, credentials, browser session data,
or other candidate information unless it is essential to reproduce the issue;
prefer a synthetic fixture.

Include:

1. Description of the vulnerability.
2. Steps to reproduce.
3. Potential impact.
4. Suggested fix, if any.

Reports are reviewed on a best-effort basis by a solo maintainer. There is no
guaranteed acknowledgement or fix deadline. Please keep the report private
while the maintainer investigates and agrees on any disclosure timing with you.
If the report is not a security vulnerability, the maintainer may ask you to
open a normal public issue with sensitive details removed.

## Scope

Security issues in the following are in scope:

- scripts and CLI commands
- browser automation and Playwright flows
- generated HTML/PDF templates
- config and profile storage
- plugin or connector execution
- path traversal, command injection, SSRF, and secret exposure

## Public Issue Boundary

Public issues are appropriate for ordinary bugs, feature requests, setup
problems, and documentation errors only when they contain no exploit details,
credentials, real CVs, application history, browser session data, or other
candidate information. If you are unsure whether a report is sensitive, use
private vulnerability reporting.

## Out of Scope

- Vulnerabilities that exist only in an upstream dependency and are already
  covered by that dependency's own advisory process. ApplyCue-specific exposure
  or unsafe use of a dependency remains in scope.
- Issues requiring physical access to the user's machine.
- Social engineering attacks.
- Public job-board or ATS behavior outside ApplyCue's control.
