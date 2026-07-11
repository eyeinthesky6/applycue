# ApplyCue Docker Status

Status: Docker is not part of the current ApplyCue branch or launch path

The current launch path is the local repo plus the canonical agent skill. Use [`docs/SETUP.md`](docs/SETUP.md) and verify with the gate in [`docs/launch-readiness.md`](docs/launch-readiness.md).

The inherited Docker/Nix implementation has been removed with the career-ops forked runtime. It had known architectural drift:

- `docker-compose.yml` mounts the source checkout but does not mount the external `~/.applycue` user store, so current profile data would not have the documented persistence boundary;
- the Dockerfile installs a Playwright version that differs from the current package/runtime version;
- the wrapper primarily maps inherited root commands such as `doctor`, `scan`, and `tracker`;
- compose forwards model API-key variables even though the canonical runtime requires no embedded model provider or model key.

A new ApplyCue-owned Docker path may be built later only after it:

1. mounts a user-approved external ApplyCue home outside the repo;
2. uses the repository's pinned Node/pnpm and Playwright versions;
3. runs `pnpm applycue:check`, UAT, browser UAT, and status successfully inside the container;
4. removes model-key forwarding from the default path;
5. documents ownership, permissions, backup, and rollback for the mounted user store.

This document does not authorize editing `.env`, adding API keys, or moving real user data into the repository.
