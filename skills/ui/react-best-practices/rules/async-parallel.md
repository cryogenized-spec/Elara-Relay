---
title: "Parallelize Independent Async Work"
impact: "high"
---

# Parallelize Independent Async Work

When two or more async operations are genuinely independent, start them
together rather than creating a waterfall.

Prefer:

```ts
const [jobs, repairs] = await Promise.all([
  loadJobs(),
  loadRepairs(),
])
```

over sequential awaits when neither result depends on the other.

## Elara constraints

Do not parallelize operations that require ordering because of:

- authorization
- revision checks
- domain transition
- mutation receipt
- external side effect

Reads may often be independent.

Writes often are not.

## Failure behavior

`Promise.all` fails when one input rejects.

Use it when all results are required together.

If partial results are useful, design that behavior explicitly rather than
switching mechanically to another Promise primitive.

## Measure

Use this rule when an actual waterfall exists.

Do not rewrite a clear sequence whose operations are cheap or intentionally
ordered.

## Completion

Parallelization is correct when latency drops without changing authorization,
mutation ordering, error semantics, or user-visible state.
