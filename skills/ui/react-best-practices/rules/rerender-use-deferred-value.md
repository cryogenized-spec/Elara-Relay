---
title: "Use Deferred Values for Expensive Derived Rendering"
impact: "medium"
---

# Use Deferred Values for Expensive Derived Rendering

Use `useDeferredValue` when rapidly changing input causes expensive derived
rendering and the input itself must remain responsive.

A likely Elara example is cross-domain Search when a large local result set or
expensive client-side presentation reacts to every keystroke.

## Pattern

Keep the input value immediate.

Defer the expensive consumer.

```tsx
const [query, setQuery] = useState("")
const deferredQuery = useDeferredValue(query)

const results = useMemo(
  () => filterResults(items, deferredQuery),
  [items, deferredQuery],
)
```

## Stale-result feedback

A deferred result may temporarily reflect an older input.

If that matters to the task, provide subtle truthful feedback rather than
pretending the result is current.

Do not make the stale treatment so strong that it becomes distracting.

## Do not use as debounce

`useDeferredValue` prioritizes rendering.

It is not a network debounce or request-rate limiter.

If Search performs remote requests, design request cancellation/deduplication
separately.

## Measure first

Do not add `useDeferredValue` to cheap filtering.

Use it when typing or interaction is measurably affected by expensive rendering.

## Completion

Deferred rendering is appropriate when the input remains immediate, stale
results are understood where necessary, and expensive rendering no longer
blocks the interaction.
