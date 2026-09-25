---
title: "Use Set or Map for Repeated Membership Lookups"
impact: "low-medium"
---

# Use Set or Map for Repeated Membership Lookups

When the same collection is checked repeatedly for membership, a `Set` or
`Map` may express the operation better and avoid repeated linear scans.

Prefer:

```ts
const selectedIds = new Set(selection)

const visible = items.filter(item => selectedIds.has(item.id))
```

over repeated `.includes()` on a large array when membership lookup is the
actual operation.

## Good candidates

Examples include:

- selected row IDs
- expanded entity IDs
- allowed local filter values
- repeated deduplication checks

## Do not use automatically

Arrays are often clearer when:

- order is the main concern
- collection size is tiny
- membership is checked once

Choose the structure that matches the operation.

## React state

Do not mutate a Set or Map in place when React state depends on identity changes.

Create the appropriate new value when updating state.

## Domain boundary

A client-side Set of allowed IDs does not establish authorization.

Server/domain permission checks remain authoritative.

## Completion

Use Set/Map when repeated keyed lookup is real, while preserving immutable React
state updates and Elara's authority boundaries.
