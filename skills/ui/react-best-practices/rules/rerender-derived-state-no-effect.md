---
title: "Derive Values During Render When Possible"
impact: "medium"
---

# Derive Values During Render When Possible

If a value is a pure function of current props or state, calculate it during
render rather than storing another copy and synchronizing it with an effect.

Prefer:

```tsx
const isOverdue = task.dueAt !== null && task.dueAt < now
```

over a second `isOverdue` state value updated from `task.dueAt` in an
effect.

## Why

Duplicated derived state can create:

- extra renders
- stale values
- synchronization bugs
- unnecessary effects

## Elara examples

Good candidates for derivation include presentation values such as:

- whether a row should display an overdue treatment
- formatted labels
- filtered subsets
- display-only status groupings

Do not derive a new product/domain truth that contradicts the domain.

For example, the frontend should not independently infer that a Repair is
`Ready` if readiness is governed by domain rules.

## Expensive derivation

If calculation is genuinely expensive, measure first.

Memoization may help, but do not wrap trivial expressions in `useMemo`.

## Resetting on identity change

If local state should reset when the underlying entity changes, consider a
clear keyed boundary or explicit reset design rather than an effect that
continuously mirrors props.

## Completion

Keep one source of truth for a value.

Derive presentation state directly when it can be computed safely from the
current authoritative inputs.
