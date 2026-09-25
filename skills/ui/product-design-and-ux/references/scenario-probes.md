# Synthetic Scenario Probes

Use these synthetic probes to stress-test a proposed Elara interaction before
implementation or handoff.

They are not production evidence.

They exist to reveal missing states, recovery paths, authority checks, and
verification gaps.

## Probe 1 — Failed Task Save

The operator creates `TASK-DEMO-042`.

They enter:

- title
- due date
- linked Job

The first save request times out after the server may already have committed the
Task.

A second submission could duplicate the logical action if replay protection is
ignored.

Expect the design to address:

- pending state
- preserved input
- safe retry
- duplicate prevention
- completion evidence
- re-entry after app interruption

A spinner and generic Retry button are not sufficient by themselves.

## Probe 2 — Stale Repair Revision

The operator opens `JOB-DEMO-17` and its Repair.

While the screen remains open, another process changes the Repair from
Diagnosing to Awaiting Parts.

The first operator then attempts to save a finding and change the stage.

Expect the design to address:

- stale revision detection
- preservation of entered finding text
- explanation of what changed
- revalidation of the requested transition
- safe recovery without silent overwrite
- refreshed current state

The UI must not pretend that the stale screen is still authoritative.

## Probe 3 — Invalid Ready Transition

A Repair is in Testing but does not have the required passing final test.

The operator attempts to mark it Ready.

Expect:

- the invalid transition is not presented as ordinary success
- the final-test requirement is understandable
- existing work remains intact
- the operator can reach the relevant testing information
- the domain remains the source of truth

Do not solve this only with a disabled control whose reason is invisible.

## Probe 4 — Scheduled Action Execution

A Reminder is due.

The scheduler begins execution, but delivery or execution confirmation is
delayed.

Expect the design to distinguish:

- scheduled
- due
- executing/pending where relevant
- succeeded
- failed
- paused
- cancelled

Do not display successful completion before the execution boundary confirms it.

Normal UI should not expose leases, occurrence keys, or worker internals.

## Probe 5 — AI-Assisted External Action

AI prepares an outbound message related to `JOB-DEMO-31`.

The draft is valid, but the customer-facing action requires explicit approval.

Expect:

- draft/preparation clearly distinguished from execution
- operator can inspect/edit the content
- approval is explicit
- authority is rechecked before execution
- success appears only after actual execution is confirmed
- failure preserves the approved content where safe

The AI must not inherit execution authority merely because it created the draft.

## Probe 6 — Interrupted Mobile Capture

The operator opens Capture on the 405 × 720 reference viewport and starts a new
Repair / Job.

Before saving, the app is backgrounded or closed.

Expect the design to answer deliberately:

- whether draft data survives
- what the operator sees on return
- whether stale context must be revalidated
- whether the keyboard/sheet state restores sensibly
- whether bottom navigation or safe areas obscure the flow

Do not assume uninterrupted desktop-style completion.

## Probe 7 — Search with Ambiguous Results

Search for a common customer or product term returns:

- Party
- Job
- Task
- Repair
- Event

Expect:

- entity types remain distinguishable
- each result has enough context for recognition
- selecting a result has a predictable destination
- returning preserves useful search context
- zero-result behavior distinguishes no match from filtering or unavailable data

Do not flatten all results into visually identical anonymous rows.

## Review questions

For each relevant probe ask:

- Which domain authority owns the state?
- What force created the exceptional state?
- What is preserved?
- What can be retried safely?
- What approval or permission is required?
- What proves completion?
- What happens after interruption?
- What evidence can verify the implemented behavior?
- What remains unverified?

Use only the probes relevant to the feature being designed.

Do not run every probe mechanically against every screen.
