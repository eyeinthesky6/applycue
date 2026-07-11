# ApplyCue Data Contract Pointer

Status: compatibility pointer; the inherited root updater has been removed

The current ApplyCue contracts are:

- [`docs/data-contracts.md`](docs/data-contracts.md) for typed product data;
- [`docs/user-asset-storage.md`](docs/user-asset-storage.md) for the system/user file boundary.

Real user data belongs under:

```text
~/.applycue/profiles/<profile>/
```

Do not store real CVs, contact data, generated applications, receipts, or outcomes in the source checkout.

The removed updater and its repo-local data layout are not supported ApplyCue contracts. Historical details remain in Git history and dated reviews only. Current code must use the typed contracts and external profile store linked above.
