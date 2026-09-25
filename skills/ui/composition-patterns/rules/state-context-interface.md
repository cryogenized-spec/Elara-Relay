---
title: "Define Narrow Context Interfaces"
impact: "medium"
---

# Define Narrow Context Interfaces

When several related UI pieces share state, expose a small typed context
interface rather than coupling every subcomponent to one concrete hook.

A useful context often separates:

- state
- actions
- presentation metadata

Example shape:

```tsx
interface CaptureContextValue {
  state: CaptureDraft
  actions: {
    update: (next: CaptureDraft) => void
    submit: () => Promise<void>
  }
  meta: {
    submitting: boolean
  }
}
```

## Use when

A context interface is useful when:

- several sibling/compound components need the same UI state
- the same composed UI can work with more than one state implementation
- prop drilling obscures the API

## Do not over-generalize

Do not create a "generic" context merely because dependency injection sounds
architecturally clean.

If only one component needs the state, keep it local.

If the state belongs to the domain, consume the existing domain/API authority
rather than abstracting it behind another state owner.

## Keep interfaces narrow

Expose only what the UI needs.

Avoid passing:

- entire API clients
- entire application stores
- raw database-shaped objects
- unrelated domain actions

through component context.

## Actions

Context actions should represent the UI contract clearly.

Prefer:

- `saveDraft`
- `close`
- `submit`

over one universal `dispatch(anything)` interface unless the existing
architecture genuinely uses that model.

## Metadata

Presentation metadata may include:

- refs
- pending state
- local focus targets
- layout-specific flags

Do not put durable domain state into `meta` merely to avoid typing it properly.

## Completion

A context interface is good when it reduces coupling while keeping state
ownership obvious.

If a reviewer cannot tell who owns the real state after the abstraction, the
context is too opaque.
