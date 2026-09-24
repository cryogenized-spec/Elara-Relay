---
title: "Decouple UI from State Implementation"
impact: "medium"
---

# Decouple UI from State Implementation

Reusable UI should depend on a small interface rather than the mechanics used to
store or synchronize presentation state.

A component should not need to know whether its local UI state comes from:

- `useState`
- context
- a reducer
- a server-backed hook

unless that implementation detail is part of the component's responsibility.

## Provider boundary

When a provider is useful, let it adapt the concrete state implementation into
the narrow interface consumed by the composed UI.

This can keep reusable pieces stable while the backing implementation changes.

## Elara boundary

Do not use this pattern to hide or duplicate domain authority.

The UI still needs to know when behavior depends on:

- domain lifecycle
- optimistic revision
- permission
- durable mutation
- scheduler state

Those rules belong to the existing Elara authority.

A provider may adapt them for presentation; it must not reimplement them.

## Avoid fake portability

Do not create swappable providers when there is no realistic second
implementation.

An abstraction with one user, one implementation, and no complexity reduction
is not automatically better architecture.

## Error and pending state

If a provider owns presentation of an async interaction, its public interface
should expose enough state for the UI to represent:

- pending
- failure
- retry availability
- stale/conflict where relevant

Do not hide meaningful failure behind a generic `submit()` that gives the UI
no way to render the real state.

## Completion

Decoupling is successful when reusable UI no longer depends on unnecessary
state mechanics while the real product/domain authority remains visible and
unchanged.
