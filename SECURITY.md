# Security Policy

Status: current scope; durable private reporting contact must be verified before a formal launch-ready claim

## Reporting A Vulnerability

Do not open a public issue for security vulnerabilities.

Use GitHub private vulnerability reporting for this repository when it is enabled. If it is unavailable, do not publish exploit details in a public issue; the repository owner must provide a durable private contact before making a formal launch-ready claim.

Include:

1. Description of the vulnerability.
2. Steps to reproduce.
3. Potential impact.
4. Suggested fix, if any.

## Scope

Security issues in the following are in scope:

- scripts and CLI commands
- browser automation and Playwright flows
- generated CV/document rendering and previews
- config and profile storage
- plugin or connector execution
- path traversal, command injection, SSRF, and secret exposure

## Out Of Scope

- Issues in third-party dependencies.
- Issues requiring physical access to the user's machine.
- Social engineering attacks.
- Public job-board or ATS behavior outside ApplyCue's control.

ApplyCue is local-first right now. Hosted security scope must be redefined before any SaaS launch.
