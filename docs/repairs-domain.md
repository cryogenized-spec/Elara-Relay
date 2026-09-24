# Repairs domain

A Repair is a one-to-one extension of a Job. Jobs remain the durable case
container; Repairs add workshop-specific state without turning every Job into
a repair.

## Stages

`RECEIVED` → `DIAGNOSING` → `REPAIRING` → `TESTING` → `READY` →
`COLLECTED`

The active workflow may branch through `AWAITING_PARTS` or
`AWAITING_CUSTOMER`. `CANCELLED` is available from non-terminal work.
`COLLECTED` and `CANCELLED` are terminal.

A repair marked Ready or Collected must have a passing final test. Entering
Testing invalidates the current final-test result so a fresh test is required.
Reworking a Ready repair also invalidates that result.

## Waiting work

`AWAITING_PARTS` and `AWAITING_CUSTOMER` require both:

- `waitingOn`: what or who blocks progress.
- `followUpAt`: when Elara should bring the repair back to attention.

Leaving a waiting stage clears both fields. Due repair follow-ups are included
in the domain Today result alongside due Tasks.

## Serial health

Serial state is explicit:

- `KNOWN`: requires a serial value.
- `UNKNOWN`: stores no guessed serial and surfaces `SERIAL_UNKNOWN`.
- `NOT_APPLICABLE`: explicitly records that the item has no relevant serial.

Unknown is therefore different from blank/forgotten data.

## History and concurrency

Repair mutations use the same mutation IDs, optimistic revisions,
transactional receipts, and append-only Events as the rest of Elara.
Supported event identities are:

- `REPAIR_CREATED`
- `REPAIR_DETAILS_UPDATED`
- `REPAIR_STAGE_CHANGED`
- `REPAIR_TEST_RECORDED`

The browser cannot choose the Event actor; authenticated operator traffic is
stamped by the server as `operator-ui`.
