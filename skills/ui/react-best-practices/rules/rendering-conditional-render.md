---
title: "Use Explicit Conditions When Falsy Values Can Render"
impact: "low"
---

# Use Explicit Conditions When Falsy Values Can Render

In JSX, `condition && <Thing />` can accidentally render values such as
`0` or `NaN` when the condition itself is numeric.

Prefer an explicit boolean condition or ternary when the source value is not
already boolean.

Prefer:

```tsx
{count > 0 ? <CountBadge count={count} /> : null}
```

over:

```tsx
{count && <CountBadge count={count} />}
```

## Boolean conditions are fine

This is clear:

```tsx
{isWaiting && <WaitingLabel />}
```

because `isWaiting` is actually boolean.

## Elara relevance

Watch numerical and nullable operational values such as:

- counts
- revision numbers
- durations
- indexes
- optional numeric measurements

A stray `0` in operational UI can look like real data.

## Completion

Use the simplest condition that cannot accidentally render the condition value
itself.
