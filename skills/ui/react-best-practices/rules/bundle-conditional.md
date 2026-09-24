---
title: "Load Optional Modules Only When Activated"
impact: "medium"
---

# Load Optional Modules Only When Activated

Do not load substantial optional code or data before the feature that needs it
is actually entered.

Example:

```ts
if (showDiagnostics) {
  const { buildDiagnostics } = await import("./diagnostics")
  return buildDiagnostics()
}
```

## Good targets

Use this for:

- optional admin tools
- large formatters/parsers
- rare export paths
- heavy visualization helpers

## Vite client rule

Elara is a Vite client application.

Do not copy Next.js/SSR guards such as `typeof window !== "undefined"` unless
the current architecture actually requires them.

## State

Conditional loading must expose:

- loading
- failure
- retry/fallback where relevant

Do not silently disable a feature because its module failed to load.

## Completion

Conditional loading is useful when it prevents meaningful startup/bundle cost
without making the activated feature confusing or fragile.
