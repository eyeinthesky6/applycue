# applycue-plugin-{{NAME}}

A community plugin for [ApplyCue](https://github.com/eyeinthesky6/applycue).

## What it does

TODO: one paragraph.

## Install

```bash
# Once it's in the ApplyCue registry:
node plugins.mjs add {{NAME}}

# Before listing (install directly from your repo at a pinned commit):
node plugins.mjs add <your-github-user>/applycue-plugin-{{NAME}} --sha <40-hex-commit>
```

Then enable + consent:

```bash
node plugins.mjs enable {{NAME}}            # shows the capability card
node plugins.mjs enable {{NAME}} --confirm  # grants it
```

## Configure

- Secrets go in your `.env` (the names are in `manifest.json` → `requiredEnv`).
- Non-secret options go in `config/plugins.yml` under `plugins.{{NAME}}`.

## Get it listed as approved

Open a registry PR against ApplyCue (see
[docs/PLUGINS.md](https://github.com/eyeinthesky6/applycue/blob/main/docs/PLUGINS.md)).

## License

MIT
