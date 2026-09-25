# Information Architecture

Design Elara's structure around operational questions and durable domain
objects, not around database tables or fashionable navigation patterns.

## Start from the work

Before choosing a navigation pattern, identify:

- what the operator is trying to find or accomplish
- which domain object owns that work
- where the operator is likely to enter
- what context is needed to understand the object
- what state or permission changes what can be seen or done
- how the operator returns after interruption

Do not expose implementation nouns merely because they exist in code.

Do not flatten distinct domain concepts because they share storage or UI
components.

## Canonical product surfaces

Elara's current mobile information architecture is:

- Today
- Work
- Repairs
- Schedule

With:

- Search globally available
- Capture persistently available

This structure comes from `documents/App_Direction.md`.

Do not replace it casually.

A new top-level destination requires a product-level reason, not merely enough
content to fill another tab.

## Domain distinctions

Preserve these distinctions in navigation and content grouping:

### Party

A person or organization associated with work.

### Job

A durable case or body of work.

### Task

An atomic action.

### Repair

A workshop-specific extension of a Job with its own stage lifecycle.

### Scheduled Action

A durable future action.

### Event

Historical truth describing what happened.

Do not merge Jobs and Tasks visually to the point that the operator cannot tell
which kind of object they are working with.

Do not present Event history as editable current-state fields.

## Entry points

Important Elara flows may begin from:

- Today attention rows
- Work lists
- Repairs lists
- Schedule
- Search results
- Capture
- Job detail
- Repair detail
- direct/deep links
- future notifications
- future AI/ChatGPT handoff

A flow should not work only from one ideal entry route.

For each important entry, preserve enough context for the operator to understand
where they are and return appropriately.

## Today

Today answers:

> What requires my attention?

Its hierarchy is attention-driven rather than entity-driven.

Relevant attention classes include:

1. overdue
2. due now or today
3. Repair follow-ups
4. Ready for collection
5. Waiting work that has become stale
6. Scheduled Actions
7. data-health warnings

Do not turn Today into a generic dashboard of metrics and decorative cards.

## Work

Work presents Jobs and Tasks.

Support the actual operational grouping established by the domain, including
Active, Waiting, Inbox/Next, and Done when explicitly requested.

Use labels and visual treatment that preserve the difference between:

- durable case
- atomic action

## Repairs

Repairs are stage-oriented.

The operator should be able to locate and understand:

- customer/Party
- Job identity
- Repair stage
- reported fault
- current finding
- serial state/value
- waiting reason
- follow-up
- final-test state where relevant

Current operational state belongs before historical detail.

## Schedule

Schedule answers:

> What will happen, and when?

Prioritize:

- due
- upcoming
- paused
- recurring

Do not expose leases, occurrence keys, execution-row internals, or worker
mechanics as normal navigation concepts.

## Search

Search is cross-domain retrieval.

Relevant targets include:

- Party/customer
- Job key
- Task
- Repair
- serial
- product/model text
- waiting text
- Event detail
- Scheduled Action

Group results by meaningful entity type when doing so improves recognition.

Preserve enough context in each result to distinguish similarly named objects.

## Capture

Capture is an action, not an information destination.

Initial manual capture includes:

- Task
- Repair / Job
- Reminder

Manual Capture must remain complete without AI.

## Labels and terminology

Use the operator's product vocabulary.

Prefer:

- Ready for collection
- Waiting for supplier
- Follow-up
- Repair stage

over database, enum, API, or scheduler terminology.

Keep the same concept named consistently across surfaces.

When terminology is genuinely unresolved, record the conflict rather than
silently introducing a third synonym.

## Progressive disclosure

Hide detail only when it is not required for the current decision.

Do not hide:

- current operational state
- consequence
- approval requirement
- destructive effect
- important uncertainty
- recovery path
- critical identifier where confusion is costly

Implementation internals may be hidden.

Operational consequences may not.

## Interruption and re-entry

For important objects answer:

- Can the user re-enter directly?
- Is the object's identity stable?
- Should filters/search state be preserved?
- Does the operator need to know the object changed while they were away?
- What happens if the object is missing, archived, cancelled, or stale?

Mobile interruption is ordinary usage.

Information architecture should support returning to work without forcing the
operator to reconstruct context from memory.

## Completion

Information architecture is ready for flow design when:

- every in-scope task has a plausible entry point
- important objects are distinguishable
- navigation reflects Elara's domain rather than implementation structure
- permission-driven absences are understandable
- important return paths are defined
- unresolved terminology is explicit

Use `../templates/outcomes-to-design.md` or
`../templates/interface-contract.md` only when the task is complex enough to
benefit from a written artifact.
