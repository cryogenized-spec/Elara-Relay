# Scheduler domain

Elara's scheduler is a first-class domain, not a browser timer.

## Scheduled actions

A Scheduled Action owns:

- optional Job and Task references
- title
- action type: `REMINDER`, `DIGEST`, or `EMAIL`
- typed payload
- explicit timezone: `Africa/Johannesburg`
- one-time `runAt`
- optional portable recurrence subset:
  - `FREQ=DAILY;INTERVAL=n`
  - `FREQ=WEEKLY;INTERVAL=n`
- status: `ACTIVE`, `PAUSED`, `COMPLETED`, or `CANCELLED`
- next/last occurrence timestamps
- optimistic revision

Automatic EMAIL payloads are deliberately owner-only in Phase 1. Customer and
supplier outbound mail remains draft-and-approve work.

## Execution ledger

Every intended occurrence receives one deterministic `occurrenceKey`.
`scheduled_action_runs.occurrence_key` is unique at the database layer.

Workers claim an occurrence with a lease token and expiry. Another worker
cannot claim a live lease. A stale claim or failed delivery reuses the same run
row and occurrence key, increments the attempt counter, and rotates the lease
token.

Delivery providers receive the occurrence key as their idempotency key. This is
the crash-after-send protection boundary: if a worker sends successfully and
dies before recording success, a retry presents the same provider idempotency
key instead of inventing another logical delivery.

A stale worker cannot record success or failure after another worker has
reclaimed the occurrence because completion requires the current lease token.

## Catch-up rule

Elara never blasts every missed recurring occurrence.

When an overdue recurring action eventually succeeds, the next run is advanced
to the first recurrence strictly after the completion timestamp. This produces
one catch-up delivery and skips accumulated backlog.

## Cancellation and pause semantics

Pausing preserves `nextRunAt`. Resuming therefore retains the original
schedule and, if overdue, follows the one-catch-up rule.

Cancelling clears `nextRunAt` and is terminal. If a delivery was already
in-flight when cancellation happened, its run may still be recorded as
succeeded, but the Scheduled Action remains cancelled and no future occurrence
is created.

## Execution boundary

Browser API routes can create, edit/reschedule, pause, resume, cancel, and read
Schedules. Claim/success/failure execution commands require the `system`
actor and are not exposed as browser routes.

Actual provider adapters are deliberately absent from Pass 1E. The scheduler
depends on a `DeliveryProvider` port, and email remains behind a separate
`EmailProvider` contract. No external email or reminder is sent merely by
creating a Scheduled Action.
