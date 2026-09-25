---
title: "Use Functional State Updates When Next State Depends on Previous State"
impact: "medium"
---

# Use Functional State Updates When Next State Depends on Previous State

When computing the next local state from the current local state, use React's
functional updater form.

Prefer:

```tsx
setSelectedIds(current => current.filter(id => id !== removedId))
```

over:

```tsx
setSelectedIds(selectedIds.filter(id => id !== removedId))
```

when the update depends on the latest value.

## Why

Functional updates reduce stale-closure bugs and often remove unnecessary state
dependencies from callbacks.

## Good candidates

Use for:

- append/remove
- toggle
- increment/decrement
- queue-like local UI state
- local draft transformations based on the previous draft

## Direct updates are fine

Use direct setters when the new value does not depend on the old one.

Examples:

```tsx
setQuery(nextQuery)
setOpen(false)
setSelectedId(id)
```

## Elara boundary

Functional `setState` only solves local React state freshness.

It does not replace:

- optimistic revision checks
- mutation IDs
- server transactions
- domain conflict handling

Do not mistake a fresh React closure for concurrency safety across Elara's
durable state.

## Completion

Use functional updates when they express the real dependency on previous local
state more accurately and remove stale-closure risk.
