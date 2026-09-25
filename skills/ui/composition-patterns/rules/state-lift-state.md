---
title: "Lift Shared UI State to the Nearest Common Owner"
impact: "medium"
---

# Lift Shared UI State to the Nearest Common Owner

When several related UI pieces need the same presentation state or actions,
place that state at their nearest useful common owner.

Do not synchronize sibling state indirectly through effects or imperative refs.

## Good fit

Lifting state is useful when:

- a form and its external action bar share the same draft
- a preview and editor need the same local value
- a sheet header and body need one disclosure state
- several compound children need the same local actions

## Avoid effect-based mirroring

Do not keep two copies of the same UI state and synchronize them with
`useEffect`.

That creates timing, stale-value, and ownership problems.

Prefer one owner.

## Avoid imperative state extraction

Do not expose mutable refs simply so another component can read the current
form/draft state during submit.

Pass state through the normal React data flow or a deliberate provider.

Refs are for imperative behaviors such as focus, measurement, or integration
with non-React systems.

## Nearest owner, not global owner

"Lifting state" does not mean moving everything into global context.

Keep state as local as possible while still covering all consumers.

A Capture draft used only inside one sheet should not become application-wide
state without a product reason.

## Domain boundary

Do not lift durable Elara state into a frontend provider and then treat that
provider as authoritative.

Jobs, Tasks, Repairs, Scheduled Actions, auth, and persistence remain owned by
their existing domain/runtime boundaries.

The lifted state may represent:

- local draft
- selected tab
- expanded section
- temporary filter
- presentation state

It must not become a replacement domain lifecycle.

## Completion

State is lifted correctly when all components that genuinely need it can access
one clear source without effects, imperative state reads, or unnecessary global
scope.
