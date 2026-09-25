---
title: "Use Lazy State Initialization for Expensive Initial Values"
impact: "medium"
---

# Use Lazy State Initialization for Expensive Initial Values

If the initial state requires meaningful work, pass an initializer function to
`useState`.

Prefer:

```tsx
const [index] = useState(() => buildSearchIndex(items))
```

over:

```tsx
const [index] = useState(buildSearchIndex(items))
```

when the calculation is expensive and only needed for initialization.

## Good candidates

Examples include:

- parsing validated browser preferences
- building a local index
- expensive data transformation
- reading an expensive browser API once

## Do not use for trivial values

There is no benefit in wrapping cheap primitives or literals solely for style.

These are fine:

```tsx
useState(0)
useState("")
useState(false)
```

## Elara caution

If the initial value depends on props that may later change, lazy initialization
does not keep it synchronized.

Decide whether the value is:

- a one-time local draft seed
- derived presentation state
- authoritative domain state

Do not freeze changing domain truth into local state accidentally.

## Browser storage

When lazy initialization reads browser storage:

- handle failure
- validate the stored shape
- keep storage non-authoritative

See `client-localstorage-schema.md`.

## Completion

Use lazy initialization when it avoids real repeated work and the initial value
is genuinely intended to be captured once.
