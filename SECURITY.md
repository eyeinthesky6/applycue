# Security Policy

## Reporting A Vulnerability

Do not open a public issue for security vulnerabilities.

For now, report security issues privately to the repository owner through the GitHub account that owns this repository. Add a dedicated security email before any public launch.

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

- Issues in third-party dependencies.
- Issues requiring physical access to the user's machine.
- Social engineering attacks.
- Public job-board or ATS behavior outside ApplyCue's control.

ApplyCue is local-first right now. Hosted security scope must be redefined before any SaaS launch.
