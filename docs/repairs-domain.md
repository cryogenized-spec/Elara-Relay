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

## Atomic Repair-case capture

Manual Repair Capture is a single durable case intent. The domain commits the
customer Party (when a new customer is required), Job, and Repair inside one
transaction so a later failure cannot leave a partial case behind.

The browser supplies one root Repair-case mutation ID. The domain derives
deterministic child mutation IDs for the Party, Job, and Repair writes that
actually occur. This preserves the database rule that one Event mutation ID
maps to at most one Event while still giving the whole case a replay-safe root
receipt.

An unchanged root mutation replay returns the committed case. Reusing the root
mutation ID for different intent is rejected. When an existing Party is reused,
no synthetic Party Event is created; the Job and Repair still receive their own
child receipts and Events.

The compound result is relationally validated: the returned Job must reference
the returned Party, and the returned Repair must reference the returned Job.

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


## Operator progression UI

Signed-in Repair detail exposes the existing operations:

- `PATCH /repairs/:repairId` — diagnosis/current-finding patches (blank clears).
- `POST /repairs/:repairId/stage` — explicit stage selection, including waiting,
  rework, cancellation and collection.
- `POST /repairs/:repairId/test` — observed Pass/Fail and optional test detail.

The kernel's unchanged transition table now lives in
`src/domain/repair-policy.ts`, shared with the UI for available-stage hints.
Test-recording eligibility is shared there too. Waiting-stage identification
comes from the Repair contract. These hints do not authorize writes: the server
still performs all transition, revision and final-test validation. No migrations
or new Repair endpoints are introduced.

Waiting forms require a reason and an Africa/Johannesburg follow-up. Leaving a
waiting stage clears both through the existing kernel operation. Waiting-stage
self-transitions and direct switches between waiting stages remain unsupported;
there is intentionally no new in-place waiting-metadata update operation.

Test results can be recorded or replaced only during Testing. The form requires
an explicit observed result; it never infers a Pass. Test recording does not
advance the stage. Ready/Collected remain subject to the contract's passing-test
invariant; server validation is displayed inline without discarding the draft.
Terminal stage changes require an explicit confirmation. Findings remain editable
where the existing details operation allows them, including terminal Repairs.

The UI reuses mutation IDs for unchanged retries, including a lost success
response. On a revision conflict, it refreshes current state while retaining the
operator's entries, requires review and an explicit resubmit, and never silently
replays against a new revision. Detail patches include only fields changed from
the draft's starting values, avoiding overwriting unrelated concurrent findings.
A stage rejection also refreshes state because the kernel can reject an invalid
transition before checking the revision. If refresh fails, further writes are
blocked until an explicit refresh succeeds; entries remain available.

Successful mutation responses are strictly validated before display. Repair,
Job history and workspace reads refresh afterward without remounting the open
Repair surface. A failed post-commit refresh is distinguished from a failed write
and can be retried without resubmitting the mutation. Authorization failure still
uses the existing fail-closed session lifecycle.

See [UI verification and visual evidence](repair-workflow-ui.md).
