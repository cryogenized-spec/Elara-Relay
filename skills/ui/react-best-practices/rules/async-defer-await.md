---
title: "Defer Await Until the Result Is Needed"
impact: "medium"
---

# Defer Await Until the Result Is Needed

Do not start expensive async work before a branch that may return without using
the result.

Prefer:

```ts
if (!needsHistory) {
  return summary
}

const history = await loadHistory()
return { summary, history }
```

over fetching history before the early return.

## Good targets

This is useful for:

- optional detail panes
- expanded history
- conditional metadata
- secondary search context
- feature paths that are not always entered

## Elara constraints

Do not defer checks that must happen before an action for correctness or
security.

Examples:

- authorization
- required domain validation
- stale revision checks
- approval checks

Performance does not justify moving a required guard after a side effect.

## Completion

Defer an await when the skipped branch is common or the operation is
meaningfully expensive and the result is not required for that branch.
