---
title: "Use Transitions for Non-Urgent Updates"
impact: "medium"
---

# Use Transitions for Non-Urgent Updates

Use React transitions when an update is important but does not need to block the
user's immediate interaction.

Examples may include:

- changing a large filtered result set
- updating a secondary panel after a selection
- non-urgent view recomputation

Use `startTransition` or `useTransition` only when the update is genuinely
non-urgent.

## Do not transition urgent state

Keep immediate:

- text input value
- pressed/expanded state
- focus-critical state
- form validation needed for the current action
- pending state that tells the user a durable mutation started

The interface must not feel delayed about what the user just did.

## Elara mutation boundary

A transition changes React scheduling priority.

It does not make a durable mutation safer, cancelable, or idempotent.

Do not use a transition to hide mutation latency or postpone truthful pending
feedback.

## Measure

Transitions are useful when rendering work is actually competing with urgent
interaction.

Do not wrap every state update in `startTransition`.

## Completion

Use a transition when it keeps urgent interaction responsive while preserving
truthful state and correct behavior.
