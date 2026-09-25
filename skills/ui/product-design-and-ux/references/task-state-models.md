# Task Flows and State Models

Model one operational outcome at a time.

A flow starts from a real entry condition and ends when the intended result is
observable.

Do not treat a button press as completion.

## Normal path first

For each meaningful flow identify:

- actor
- entry point
- required permission
- relevant domain object
- current state
- action
- validation
- durable or external side effect
- resulting state
- completion evidence

Keep the normal path as short as the domain safely allows.

## Force-driven states

Do not manufacture a checklist of every possible UI state.

Add a state when a real force makes it relevant.

| Force | Questions to consider |
|---|---|
| No records or no results | Why is it empty? What useful next action exists? |
| Fetching or delayed commit | What is pending? Can anything still be done safely? |
| Validation | What failed? Is entered work preserved? |
| Permission change | Can the object still be seen? Can the action still be performed? |
| Stale revision or conflict | What changed? Must the operator review newer state? |
| Connectivity failure | What remains local? What can be retried safely? |
| Durable mutation | What is the commit boundary? Can retry duplicate work? |
| Destructive action | Is confirmation, delayed commit, or real undo appropriate? |
| External action | Was it prepared, approved, executed, and actually confirmed? |
| System failure | What context survives and what is the recovery path? |
| Interruption | Where does the operator return and what must be revalidated? |

Record why a high-risk expected state is not applicable when omission would
otherwise be ambiguous.

## Elara mutation states

Elara's durable mutations have replay, revision, transaction, and receipt
semantics.

UI flows must not undermine them.

In particular:

- do not silently overwrite stale revisions
- do not retry in a way that can create duplicate logical work
- do not report success before persistence is confirmed
- preserve user-entered content across recoverable failure
- distinguish validation failure from transport or server failure

The UI does not need to expose mutation IDs or receipts to ordinary users.

It does need to behave consistently with them.

## Repairs

When modeling Repair flows, respect the actual Repair lifecycle.

Consider:

- stage transition validity
- final-test requirements
- Waiting state and reason
- follow-up
- cancellation
- stale data when the Repair changed elsewhere
- re-entry after interruption

Do not offer Ready or Collected as valid outcomes when the domain would reject
the transition.

## Scheduled Actions

For scheduling flows distinguish:

- configured
- due
- pending execution
- delivered/executed
- paused
- failed
- cancelled

Do not present a scheduled action as delivered merely because execution started.

Do not expose scheduler lease or occurrence internals unless the task is an
operator/debug surface specifically intended for them.

## External actions

Customer- or supplier-facing work should preserve these conceptual stages:

1. prepared
2. reviewed
3. approved
4. executed
5. confirmed

A successful draft is not successful delivery.

A request sent to a provider is not necessarily the intended business outcome.

Separate delivery evidence from outcome evidence.

## Interruption and re-entry

Elara is mobile-first, so interruption is normal.

For consequential flows answer:

- what draft or state survives
- what view the operator returns to
- whether filters/search context persist
- whether the domain object must be refreshed
- whether permission must be rechecked
- what happens if another actor or process changed the object meanwhile

Do not assume the app remains open for the entire flow.

## Partial completion

Multi-step work can partly succeed.

When partial completion is possible, define:

- which side effect already happened
- which step failed
- whether retry is safe
- whether the successful portion can be reversed
- what the operator sees on return

Never collapse partial success into a generic failure if doing so could cause a
duplicate or contradictory action.

## Completion evidence

Completion should be observable.

Examples:

- Task exists with the intended durable state
- Repair moved to the valid requested stage
- Reminder is durably scheduled
- approved outbound action is confirmed by its execution boundary
- operator can see the persisted result after re-entry

Avoid criteria such as:

- button clicked
- request sent
- handler returned
- modal closed

Those may be intermediate implementation events.

## Templates

Use `../templates/task-flow-state-model.md` when a flow has meaningful
branching, side effects, interruption, or recovery.

Use `../templates/screen-state-inventory.md` when several rendered states need
to be coordinated across one surface.

Do not create either artifact for trivial visual polish.

## Completion

A task/state model is ready when:

- the normal path is clear
- forced states are covered or explicitly ruled out
- recovery is defined
- interruption is addressed when relevant
- durable/external side effects are truthful
- completion evidence reflects the real operational outcome
