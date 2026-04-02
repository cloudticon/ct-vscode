# Cloudticon CT — VS Code Extension

> **Beta** — this extension is under active development. Expect breaking changes.

Full TypeScript language support for [`.ct` (Cloudticon Template)](https://github.com/cloudticon/ct) files in Visual Studio Code — autocompletion, type checking, URL imports, and `Values` injection out of the box.

## Features

- **TypeScript IntelliSense for `.ct` files** — autocompletion, go-to-definition, hover docs, and diagnostics powered by the built-in TypeScript language service.
- **URL import resolution** — imports like `from "https://github.com/cloudticon/k8s@master"` are automatically cloned and cached in `~/.ct/cache/`. The TypeScript server resolves them transparently.
- **Values typing** — a `values.json` or `values.yaml` in your project root is parsed and a `Values` type declaration is generated so `Values.*` has full autocompletion and type safety.
- **Zero configuration** — just open a folder containing `.ct` files and everything works.

## Requirements

| Requirement | Version |
|-------------|---------|
| VS Code | ≥ 1.80.0 |
| Git | any (must be on `PATH` — used to clone URL imports) |

The [ct CLI](https://github.com/cloudticon/ct) is **not** required for editor features, but you need it to render manifests (`ct template`).

## Quick Start

1. Install the extension from the VS Code Marketplace (search for **Cloudticon**).
2. Open a project that contains `.ct` files (or run `ct init` to scaffold one).
3. Start editing — IntelliSense, diagnostics, and URL import resolution activate automatically.

### Example `.ct` file

```typescript
import { deployment, service } from "https://github.com/cloudticon/k8s@master";

const app = deployment({
  name: "web-app",
  image: Values.image,       // ← autocompleted from values.json
  replicas: Values.replicas,
  ports: [{ containerPort: 8080 }],
});

service({
  name: "web-app-svc",
  selector: { app: app.metadata.name },
  ports: [{ port: 80, targetPort: 8080 }],
});
```

### Example `values.json`

```json
{
  "image": "nginx:1.25",
  "replicas": 3
}
```

## How It Works

1. When a `.ct` file opens, the extension reassigns its language to **TypeScript** so the full TS toolchain applies.
2. A **TypeScript server plugin** (`ct-typescript-plugin`) intercepts module resolution and maps URL specifiers to cached git repos under `~/.ct/cache/`.
3. The extension watches `values.json` / `values.yaml` and generates a `declare const Values` type declaration under `~/.ct/types/`, which the plugin injects into the compilation context.
4. If a URL import is missing from the cache, the extension clones it (shallow, single-branch) and restarts the TS server automatically.

## Extension Settings

This extension does not contribute any user-facing settings or commands at this time. Everything is automatic.

## Known Issues

- Only GitHub-style URL imports are supported (`https://github.com/{owner}/{repo}@{version}`).
- The first download of a URL import may take a few seconds depending on repository size.
- Cluster-scoped vs namespaced resource distinction is handled by the `ct` CLI, not the extension.

## Related

- [ct CLI](https://github.com/cloudticon/ct) — the Kubernetes manifest generator that consumes `.ct` files.
- [k8s helpers](https://github.com/cloudticon/k8s) — the standard library of Kubernetes resource helpers for `.ct`.

## License

MIT
