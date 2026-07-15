# Security Policy

## Reporting A Vulnerability

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

## Scope

Security issues in the following are in scope:

- scripts and CLI commands
- browser automation and Playwright flows
- generated HTML/PDF templates
- config and profile storage
- plugin or connector execution
- path traversal, command injection, SSRF, and secret exposure

## Out Of Scope

- Vulnerabilities that exist only in an upstream dependency and are already
  covered by that dependency's own advisory process. ApplyCue-specific exposure
  or unsafe use of a dependency remains in scope.
- Issues requiring physical access to the user's machine.
- Social engineering attacks.
- Public job-board or ATS behavior outside ApplyCue's control.

ApplyCue is local-first right now. Hosted security scope must be redefined before any SaaS launch.
