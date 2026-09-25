---
title: "Use Compound Components When Structure Is Shared"
impact: "medium"
---

# Use Compound Components When Structure Is Shared

Compound components can make complex UI composition explicit without a
monolithic parent full of render callbacks and feature flags.

Use them when several related pieces genuinely share state and must be composed
in different arrangements.

## Good fit

A compound pattern is useful when:

- subcomponents belong to one coherent interaction
- several layouts reuse the same state/actions
- consumers need to choose which pieces appear
- prop drilling would otherwise dominate the API

Example shape:

```tsx
<OperationalPanel.Provider value={panel}>
  <OperationalPanel.Frame>
    <OperationalPanel.Summary />
    <OperationalPanel.Status />
    <OperationalPanel.Actions />
  </OperationalPanel.Frame>
</OperationalPanel.Provider>
```

The exact component names should follow the Elara surface being modeled.

## Avoid hidden authority

The provider may coordinate presentation state.

It must not become a parallel owner of:

- Repair lifecycle
- Task lifecycle
- scheduler state
- authentication
- persistence
- mutation rules

Domain state still comes from the existing authority.

The compound component should consume or adapt that state, not recreate it.

## Avoid ceremonial compounds

Do not turn every small component into:

`Thing.Root`
`Thing.Content`
`Thing.Label`
`Thing.Icon`

merely because the pattern exists.

Use a normal component when the API is already obvious.

## Context

Shared context is appropriate when the subcomponents are intentionally coupled
to the compound component.

Keep the context value small and explicit.

Prefer separating:

- state
- actions
- presentation metadata

when that division improves clarity.

Do not expose an entire application store through a component context.

## Accessibility

Compound composition must not break:

- DOM reading order
- label/control relationships
- keyboard order
- focus behavior
- semantic grouping

Visual flexibility does not justify inaccessible markup.

## Completion

Use a compound component when it makes supported compositions obvious while
keeping state ownership clear.

If the pattern adds more indirection than it removes, use a simpler component.
